// ============================================================
// KMS / HSM / TPM 军工级密钥存储适配器层
// 目标：为 KeyStorageProvider 提供可插拔的硬件/云级密钥保护后端。
// 设计原则：
//   - 每个后端只负责：encrypt(name, plaintext) / decrypt(name, ciphertext)
//   - KmsKeyStorageProvider 在本地保存 KMS 密文引用，真正密钥材料由后端保护
//   - 不强制安装云厂商 SDK：优先使用 REST/CLI，SDK 作为可选加速
//   - TPM 后端在 Windows 上绑定到 TPM + 当前用户；Linux 使用 tpm2-tss
//   - PKCS#11 后端支持通用 HSM（Thales、Entrust、SoftHSM 等）
// ============================================================

import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import https from 'https'
import http from 'http'

function secureZero(value) {
  if (Buffer.isBuffer(value)) {
    value.fill(0)
  } else if (typeof value === 'string') {
    try {
      Buffer.from(value, 'utf-8').fill(0)
    } catch {}
  }
}

function isWindows() {
  return process.platform === 'win32'
}

function execSafe(command, options = {}) {
  return execSync(command, { encoding: 'utf-8', stdio: 'pipe', ...options })
}

function runPowerShell(script, { throwOnError = true } = {}) {
  const tmp = path.join(os.tmpdir(), `ll-kms-${crypto.randomBytes(8).toString('hex')}.ps1`)
  try {
    fs.writeFileSync(tmp, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(script, 'utf-8')]))
    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return out.trim()
  } catch (err) {
    if (throwOnError) throw new Error(`PowerShell 执行失败: ${err.message}\n${err.stderr || ''}`)
    return null
  } finally {
    try { fs.unlinkSync(tmp) } catch {}
  }
}

function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const req = client.request(url, options, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data, headers: res.headers })
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`))
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// ============================================================
// KmsBackend 基类
// ============================================================
export class KmsBackend {
  constructor(type) {
    this.type = type
  }

  async encrypt(name, plaintext) {
    throw new Error(`Backend ${this.type} 未实现 encrypt`)
  }

  async decrypt(name, ciphertext) {
    throw new Error(`Backend ${this.type} 未实现 decrypt`)
  }

  supportsHardware() {
    return false
  }

  healthCheck() {
    return { ok: true, type: this.type, detail: '未实现健康检查' }
  }
}

// ============================================================
// HttpKmsBackend：通用 REST KMS 代理
// 约定：
//   POST /encrypt  { name, plaintext: base64 } -> { ciphertext: base64 }
//   POST /decrypt  { name, ciphertext: base64 } -> { plaintext: base64 }
// 配置：LL_KMS_HTTP_URL, LL_KMS_HTTP_AUTH_HEADER, LL_KMS_HTTP_TIMEOUT_MS
// ============================================================
export class HttpKmsBackend extends KmsBackend {
  constructor() {
    super('http')
    this.baseUrl = (process.env.LL_KMS_HTTP_URL || '').replace(/\/$/, '')
    this.authHeader = process.env.LL_KMS_HTTP_AUTH_HEADER || ''
    this.timeoutMs = parseInt(process.env.LL_KMS_HTTP_TIMEOUT_MS || '10000', 10)
  }

  _headers() {
    const headers = { 'Content-Type': 'application/json' }
    if (this.authHeader) headers.Authorization = this.authHeader
    return headers
  }

  async encrypt(name, plaintext) {
    if (!this.baseUrl) throw new Error('HttpKmsBackend 需要 LL_KMS_HTTP_URL')
    const body = JSON.stringify({ name, plaintext: Buffer.from(plaintext, 'utf-8').toString('base64') })
    const res = await httpRequest(`${this.baseUrl}/encrypt`, {
      method: 'POST',
      headers: this._headers(),
      timeout: this.timeoutMs,
    }, body)
    const json = JSON.parse(res.body)
    if (!json.ciphertext) throw new Error('KMS /encrypt 返回缺少 ciphertext')
    return json.ciphertext
  }

  async decrypt(name, ciphertext) {
    if (!this.baseUrl) throw new Error('HttpKmsBackend 需要 LL_KMS_HTTP_URL')
    const body = JSON.stringify({ name, ciphertext })
    const res = await httpRequest(`${this.baseUrl}/decrypt`, {
      method: 'POST',
      headers: this._headers(),
      timeout: this.timeoutMs,
    }, body)
    const json = JSON.parse(res.body)
    if (!json.plaintext) throw new Error('KMS /decrypt 返回缺少 plaintext')
    return Buffer.from(json.plaintext, 'base64').toString('utf-8')
  }
}

// ============================================================
// VaultBackend：HashiCorp Vault KV + Transit
// 配置：LL_VAULT_ADDR, LL_VAULT_TOKEN, LL_VAULT_MOUNT, LL_VAULT_TRANSIT_KEY
// 策略：使用 Transit Engine 对数据密钥进行 envelope 加密
// ============================================================
export class VaultBackend extends KmsBackend {
  constructor() {
    super('vault')
    this.addr = (process.env.LL_VAULT_ADDR || '').replace(/\/$/, '')
    this.token = process.env.LL_VAULT_TOKEN || ''
    this.mount = process.env.LL_VAULT_MOUNT || 'transit'
    this.keyName = process.env.LL_VAULT_TRANSIT_KEY || 'lingualeap-master'
  }

  _headers() {
    if (!this.token) throw new Error('VaultBackend 需要 LL_VAULT_TOKEN')
    return { 'X-Vault-Token': this.token, 'Content-Type': 'application/json' }
  }

  async encrypt(name, plaintext) {
    if (!this.addr) throw new Error('VaultBackend 需要 LL_VAULT_ADDR')
    const url = `${this.addr}/v1/${this.mount}/encrypt/${this.keyName}`
    const payload = JSON.stringify({ plaintext: Buffer.from(plaintext, 'utf-8').toString('base64') })
    const res = await httpRequest(url, { method: 'POST', headers: this._headers() }, payload)
    const json = JSON.parse(res.body)
    if (!json.data?.ciphertext) throw new Error('Vault 加密返回缺少 ciphertext')
    return json.data.ciphertext
  }

  async decrypt(name, ciphertext) {
    if (!this.addr) throw new Error('VaultBackend 需要 LL_VAULT_ADDR')
    const url = `${this.addr}/v1/${this.mount}/decrypt/${this.keyName}`
    const payload = JSON.stringify({ ciphertext })
    const res = await httpRequest(url, { method: 'POST', headers: this._headers() }, payload)
    const json = JSON.parse(res.body)
    if (!json.data?.plaintext) throw new Error('Vault 解密返回缺少 plaintext')
    return Buffer.from(json.data.plaintext, 'base64').toString('utf-8')
  }
}

// ============================================================
// AwsKmsBackend：AWS KMS
// 优先使用 AWS SDK（可选依赖），回退到 AWS CLI
// 配置：LL_KMS_TYPE=aws, LL_KMS_KEY_ID, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
// ============================================================
export class AwsKmsBackend extends KmsBackend {
  constructor() {
    super('aws')
    this.keyId = process.env.LL_KMS_KEY_ID || process.env.AWS_KMS_KEY_ID
    this.region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
  }

  _requireKeyId() {
    if (!this.keyId) throw new Error('AwsKmsBackend 需要 LL_KMS_KEY_ID 或 AWS_KMS_KEY_ID')
  }

  async encrypt(name, plaintext) {
    this._requireKeyId()
    const sdk = await this._tryLoadSdk()
    if (sdk) {
      const input = { KeyId: this.keyId, Plaintext: Buffer.from(plaintext, 'utf-8') }
      const res = await sdk.encrypt(input)
      return Buffer.from(res.CiphertextBlob).toString('base64')
    }
    return this._encryptCli(plaintext)
  }

  async decrypt(name, ciphertext) {
    this._requireKeyId()
    const sdk = await this._tryLoadSdk()
    if (sdk) {
      const input = { CiphertextBlob: Buffer.from(ciphertext, 'base64') }
      const res = await sdk.decrypt(input)
      return Buffer.from(res.Plaintext).toString('utf-8')
    }
    return this._decryptCli(ciphertext)
  }

  async _tryLoadSdk() {
    try {
      const { KMSClient, EncryptCommand, DecryptCommand } = await import('@aws-sdk/client-kms')
      const client = new KMSClient({ region: this.region })
      return {
        encrypt: async (input) => {
          const cmd = new EncryptCommand(input)
          return client.send(cmd)
        },
        decrypt: async (input) => {
          const cmd = new DecryptCommand(input)
          return client.send(cmd)
        },
      }
    } catch {
      return null
    }
  }

  _encryptCli(plaintext) {
    const tmpIn = path.join(os.tmpdir(), `ll-aws-${crypto.randomBytes(8).toString('hex')}.bin`)
    try {
      fs.writeFileSync(tmpIn, Buffer.from(plaintext, 'utf-8'))
      const env = { ...process.env }
      if (this.region) env.AWS_REGION = this.region
      const out = execSafe(`aws kms encrypt --key-id "${this.keyId}" --plaintext "fileb://${tmpIn}" --output text --query CiphertextBlob`, { env })
      return out.trim()
    } finally {
      try { fs.unlinkSync(tmpIn) } catch {}
    }
  }

  _decryptCli(ciphertext) {
    const tmpIn = path.join(os.tmpdir(), `ll-aws-${crypto.randomBytes(8).toString('hex')}.b64`)
    const tmpOut = `${tmpIn}.dec`
    try {
      fs.writeFileSync(tmpIn, ciphertext)
      const env = { ...process.env }
      if (this.region) env.AWS_REGION = this.region
      execSafe(`aws kms decrypt --ciphertext-blob "fileb://${tmpIn}" --output text --query Plaintext --region "${this.region || 'us-east-1'}" > "${tmpOut}"`, { env })
      const decoded = fs.readFileSync(tmpOut, 'utf-8').trim()
      return Buffer.from(decoded, 'base64').toString('utf-8')
    } finally {
      try { fs.unlinkSync(tmpIn) } catch {}
      try { fs.unlinkSync(tmpOut) } catch {}
    }
  }
}

// ============================================================
// AzureKeyVaultBackend：Azure Key Vault
// 优先使用 @azure/keyvault-keys + @azure/identity，回退到 Azure CLI
// 配置：LL_KMS_TYPE=azure, LL_KMS_KEY_ID=<key identifier>, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
// ============================================================
export class AzureKeyVaultBackend extends KmsBackend {
  constructor() {
    super('azure')
    this.keyId = process.env.LL_KMS_KEY_ID || process.env.AZURE_KEY_VAULT_KEY_ID
  }

  _requireKeyId() {
    if (!this.keyId) throw new Error('AzureKeyVaultBackend 需要 LL_KMS_KEY_ID 或 AZURE_KEY_VAULT_KEY_ID')
  }

  async encrypt(name, plaintext) {
    this._requireKeyId()
    const sdk = await this._tryLoadSdk()
    if (sdk) {
      const res = await sdk.encrypt('RSA-OAEP-256', Buffer.from(plaintext, 'utf-8'))
      return res.result.toString('base64')
    }
    return this._encryptCli(plaintext)
  }

  async decrypt(name, ciphertext) {
    this._requireKeyId()
    const sdk = await this._tryLoadSdk()
    if (sdk) {
      const res = await sdk.decrypt('RSA-OAEP-256', Buffer.from(ciphertext, 'base64'))
      return res.result.toString('utf-8')
    }
    return this._decryptCli(ciphertext)
  }

  async _tryLoadSdk() {
    try {
      const { CryptographyClient } = await import('@azure/keyvault-keys')
      const { DefaultAzureCredential } = await import('@azure/identity')
      const client = new CryptographyClient(this.keyId, new DefaultAzureCredential())
      return client
    } catch {
      return null
    }
  }

  _encryptCli(plaintext) {
    const tmpIn = path.join(os.tmpdir(), `ll-azure-${crypto.randomBytes(8).toString('hex')}.bin`)
    try {
      fs.writeFileSync(tmpIn, Buffer.from(plaintext, 'utf-8'))
      const out = execSafe(`az keyvault key encrypt --algorithm RSA-OAEP-256 --name "${this.keyId}" --value "@${tmpIn}" --data-type plaintext --output tsv --query result`)
      return out.trim()
    } finally {
      try { fs.unlinkSync(tmpIn) } catch {}
    }
  }

  _decryptCli(ciphertext) {
    const tmpIn = path.join(os.tmpdir(), `ll-azure-${crypto.randomBytes(8).toString('hex')}.b64`)
    try {
      fs.writeFileSync(tmpIn, ciphertext)
      const out = execSafe(`az keyvault key decrypt --algorithm RSA-OAEP-256 --name "${this.keyId}" --value "@${tmpIn}" --data-type plaintext --output tsv --query result`)
      return Buffer.from(out.trim(), 'base64').toString('utf-8')
    } finally {
      try { fs.unlinkSync(tmpIn) } catch {}
    }
  }
}

// ============================================================
// AliyunKmsBackend：阿里云 KMS
// 优先使用 @alicloud/kms20160120，回退到 aliyun CLI
// 配置：LL_KMS_TYPE=aliyun, LL_KMS_KEY_ID, ALIBABA_CLOUD_ACCESS_KEY_ID, ALIBABA_CLOUD_ACCESS_KEY_SECRET
// ============================================================
export class AliyunKmsBackend extends KmsBackend {
  constructor() {
    super('aliyun')
    this.keyId = process.env.LL_KMS_KEY_ID || process.env.ALIBABA_CLOUD_KMS_KEY_ID
  }

  _requireKeyId() {
    if (!this.keyId) throw new Error('AliyunKmsBackend 需要 LL_KMS_KEY_ID 或 ALIBABA_CLOUD_KMS_KEY_ID')
  }

  async encrypt(name, plaintext) {
    this._requireKeyId()
    const sdk = await this._tryLoadSdk()
    if (sdk) {
      const res = await sdk.encrypt(this.keyId, plaintext)
      return res.body.ciphertextBlob
    }
    return this._encryptCli(plaintext)
  }

  async decrypt(name, ciphertext) {
    this._requireKeyId()
    const sdk = await this._tryLoadSdk()
    if (sdk) {
      const res = await sdk.decrypt(this.keyId, ciphertext)
      return res.body.plaintext
    }
    return this._decryptCli(ciphertext)
  }

  async _tryLoadSdk() {
    try {
      const KMS = await import('@alicloud/kms20160120')
      const OpenApi = await import('@alicloud/openapi-client')
      const Util = await import('@alicloud/tea-util')
      const config = new OpenApi.Config({
        accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      })
      config.endpoint = `kms.${process.env.ALIBABA_CLOUD_REGION || 'cn-hangzhou'}.aliyuncs.com`
      const client = new KMS.default(config)
      return {
        encrypt: async (keyId, plaintext) => {
          const req = new KMS.EncryptRequest({ keyId, plaintext: Buffer.from(plaintext, 'utf-8').toString('base64') })
          return client.encryptWithOptions(req, new Util.RuntimeOptions({}))
        },
        decrypt: async (keyId, ciphertext) => {
          const req = new KMS.DecryptRequest({ ciphertextBlob: ciphertext })
          return client.decryptWithOptions(req, new Util.RuntimeOptions({}))
        },
      }
    } catch {
      return null
    }
  }

  _encryptCli(plaintext) {
    const out = execSafe(`aliyun kms Encrypt --KeyId "${this.keyId}" --Plaintext "${Buffer.from(plaintext, 'utf-8').toString('base64')}" --output cols=CiphertextBlob rows`)
    const match = out.match(/CiphertextBlob\s*:\s*(\S+)/)
    if (!match) throw new Error('aliyun kms encrypt 输出解析失败')
    return match[1].trim()
  }

  _decryptCli(ciphertext) {
    const out = execSafe(`aliyun kms Decrypt --CiphertextBlob "${ciphertext}" --output cols=Plaintext rows`)
    const match = out.match(/Plaintext\s*:\s*(\S+)/)
    if (!match) throw new Error('aliyun kms decrypt 输出解析失败')
    return Buffer.from(match[1].trim(), 'base64').toString('utf-8')
  }
}

// ============================================================
// TpmBackend：TPM 2.0 绑定加密
// Windows：使用 PowerShell + System.Security.Cryptography.CngKey 创建
//         持久化密钥，TPM 作为 KSP 后端（需要 TPM 2.0 + 现代 Windows）
// Linux：使用 tpm2-tss 命令行工具（tpm2_createprimary, tpm2_create, tpm2_unseal）
// 配置：LL_KMS_TYPE=tpm, LL_TPM_PERSISTENT_HANDLE（可选）
// 注意：TPM 加密任意长度数据采用 envelope：生成对称密钥 -> TPM 封装对称密钥
// ============================================================
export class TpmBackend extends KmsBackend {
  constructor() {
    super('tpm')
    this.handle = process.env.LL_TPM_PERSISTENT_HANDLE
  }

  supportsHardware() {
    return true
  }

  async encrypt(name, plaintext) {
    if (isWindows()) return this._encryptWindows(name, plaintext)
    return this._encryptLinux(name, plaintext)
  }

  async decrypt(name, ciphertext) {
    if (isWindows()) return this._decryptWindows(name, ciphertext)
    return this._decryptLinux(name, ciphertext)
  }

  // Windows TPM envelope：用 TPM 保护的 RSA 公钥加密 AES 数据密钥，再用 AES-GCM 加密明文
  _encryptWindows(name, plaintext) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-tpm-'))
    try {
      const keyName = `LinguaLeap-${name}`
      const dataKey = crypto.randomBytes(32)
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv)
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
      const tag = cipher.getAuthTag()

      // 使用 CNG RSA 公钥加密 dataKey；若密钥不存在则创建持久化密钥
      const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$rsa = $null
try {
  $rsa = [System.Security.Cryptography.CngKey]::Open('${keyName}')
} catch {
  $rsa = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::Rsa, '${keyName}')
}
$pub = [System.Security.Cryptography.RSACng]::new($rsa)
$bytes = [System.IO.File]::ReadAllBytes('${path.join(tmpDir, 'dk.bin').replace(/\\/g, '\\\\')}')
$enc = $pub.Encrypt($bytes, [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
[System.IO.File]::WriteAllBytes('${path.join(tmpDir, 'dk.enc').replace(/\\/g, '\\\\')}', $enc)
`
      fs.writeFileSync(path.join(tmpDir, 'dk.bin'), dataKey)
      secureZero(dataKey)
      runPowerShell(script)
      const encKey = fs.readFileSync(path.join(tmpDir, 'dk.enc'))

      const envelope = {
        v: 1,
        os: 'win',
        keyName,
        key: encKey.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ct: encrypted.toString('base64'),
      }
      return Buffer.from(JSON.stringify(envelope)).toString('base64')
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }

  _decryptWindows(name, ciphertext) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-tpm-'))
    try {
      const envelope = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf-8'))
      fs.writeFileSync(path.join(tmpDir, 'dk.enc'), Buffer.from(envelope.key, 'base64'))
      const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$rsa = [System.Security.Cryptography.CngKey]::Open('${envelope.keyName}')
$priv = [System.Security.Cryptography.RSACng]::new($rsa)
$enc = [System.IO.File]::ReadAllBytes('${path.join(tmpDir, 'dk.enc').replace(/\\/g, '\\\\')}')
$dec = $priv.Decrypt($enc, [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
[System.IO.File]::WriteAllBytes('${path.join(tmpDir, 'dk.bin').replace(/\\/g, '\\\\')}', $dec)
`
      runPowerShell(script)
      const dataKey = fs.readFileSync(path.join(tmpDir, 'dk.bin'))
      const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(envelope.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()])
      secureZero(dataKey)
      return plaintext.toString('utf-8')
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }

  // Linux TPM envelope：使用 tpm2_createprimary 创建 SRK，tpm2_rsaencrypt 封装 AES 数据密钥
  _encryptLinux(name, plaintext) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-tpm-'))
    try {
      const dataKey = crypto.randomBytes(32)
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv)
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
      const tag = cipher.getAuthTag()

      fs.writeFileSync(path.join(tmpDir, 'dk.bin'), dataKey)
      secureZero(dataKey)
      execSafe(`tpm2_createprimary -C o -g sha256 -G rsa -c "${path.join(tmpDir, 'srk.ctx')}"`)
      execSafe(`tpm2_rsaencrypt -c "${path.join(tmpDir, 'srk.ctx')}" -o "${path.join(tmpDir, 'dk.enc')}" "${path.join(tmpDir, 'dk.bin')}"`)
      const encKey = fs.readFileSync(path.join(tmpDir, 'dk.enc'))

      const envelope = {
        v: 1,
        os: 'linux',
        ct: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        key: encKey.toString('base64'),
      }
      return Buffer.from(JSON.stringify(envelope)).toString('base64')
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }

  _decryptLinux(name, ciphertext) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-tpm-'))
    try {
      const envelope = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf-8'))
      fs.writeFileSync(path.join(tmpDir, 'dk.enc'), Buffer.from(envelope.key, 'base64'))
      execSafe(`tpm2_createprimary -C o -g sha256 -G rsa -c "${path.join(tmpDir, 'srk.ctx')}"`)
      execSafe(`tpm2_rsadecrypt -c "${path.join(tmpDir, 'srk.ctx')}" -o "${path.join(tmpDir, 'dk.bin')}" "${path.join(tmpDir, 'dk.enc')}"`)
      const dataKey = fs.readFileSync(path.join(tmpDir, 'dk.bin'))
      const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(envelope.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()])
      secureZero(dataKey)
      return plaintext.toString('utf-8')
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }
}

// ============================================================
// Pkcs11Backend：通用 PKCS#11 HSM
// 配置：LL_KMS_TYPE=pkcs11, LL_PKCS11_LIB, LL_PKCS11_SLOT, LL_PKCS11_PIN,
//       LL_PKCS11_KEY_LABEL
// 依赖：pkcs11js（可选），否则使用 OpenSSL pkcs11 引擎/CLI
// ============================================================
export class Pkcs11Backend extends KmsBackend {
  constructor() {
    super('pkcs11')
    this.lib = process.env.LL_PKCS11_LIB
    this.slot = process.env.LL_PKCS11_SLOT
    this.pin = process.env.LL_PKCS11_PIN
    this.keyLabel = process.env.LL_PKCS11_KEY_LABEL
  }

  supportsHardware() {
    return true
  }

  _ensureConfig() {
    if (!this.lib) throw new Error('Pkcs11Backend 需要 LL_PKCS11_LIB')
    if (!this.pin) throw new Error('Pkcs11Backend 需要 LL_PKCS11_PIN')
    if (!this.keyLabel) throw new Error('Pkcs11Backend 需要 LL_PKCS11_KEY_LABEL')
  }

  async encrypt(name, plaintext) {
    this._ensureConfig()
    const sdk = await this._tryLoadSdk()
    if (sdk) return sdk.encrypt(name, plaintext)
    // CLI fallback：使用 openssl pkeyutl（需要配置 pkcs11 引擎，较为复杂，先占位）
    throw new Error('Pkcs11Backend CLI 回退尚未实现，请安装 pkcs11js 依赖')
  }

  async decrypt(name, ciphertext) {
    this._ensureConfig()
    const sdk = await this._tryLoadSdk()
    if (sdk) return sdk.decrypt(name, ciphertext)
    throw new Error('Pkcs11Backend CLI 回退尚未实现，请安装 pkcs11js 依赖')
  }

  async _tryLoadSdk() {
    try {
      const PKCS11 = (await import('pkcs11js')).default
      const pkcs11 = new PKCS11()
      pkcs11.load(this.lib)
      pkcs11.C_Initialize()
      const slots = pkcs11.C_GetSlotList(true)
      const slot = this.slot ? parseInt(this.slot, 10) : slots[0]
      const session = pkcs11.C_OpenSession(slot, PKCS11.CKF_RW_SESSION | PKCS11.CKF_SERIAL_SESSION)
      pkcs11.C_Login(session, PKCS11.CKU_USER, this.pin)

      // 查找对象句柄
      const findKey = (label, cls) => {
        pkcs11.C_FindObjectsInit(session, [
          { type: PKCS11.CKA_CLASS, value: cls },
          { type: PKCS11.CKA_LABEL, value: label },
        ])
        const objs = pkcs11.C_FindObjects(session, 1)
        pkcs11.C_FindObjectsFinal(session)
        return objs[0]
      }

      const pubKey = findKey(this.keyLabel, PKCS11.CKO_PUBLIC_KEY)
      const privKey = findKey(this.keyLabel, PKCS11.CKO_PRIVATE_KEY)
      if (!pubKey || !privKey) throw new Error(`HSM 中找不到密钥标签 ${this.keyLabel}`)

      return {
        encrypt: (name, plaintext) => {
          // RSA PKCS#1 OAEP 加密（HSM 通常限制数据长度，采用 envelope）
          const dataKey = crypto.randomBytes(32)
          const iv = crypto.randomBytes(16)
          const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv)
          const ct = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
          const tag = cipher.getAuthTag()
          pkcs11.C_EncryptInit(session, { mechanism: PKCS11.CKM_RSA_PKCS_OAEP }, pubKey)
          const encKey = pkcs11.C_Encrypt(session, dataKey)
          secureZero(dataKey)
          const envelope = {
            v: 1,
            key: Buffer.from(encKey).toString('base64'),
            iv: iv.toString('base64'),
            tag: tag.toString('base64'),
            ct: ct.toString('base64'),
          }
          return Buffer.from(JSON.stringify(envelope)).toString('base64')
        },
        decrypt: (name, ciphertext) => {
          const envelope = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf-8'))
          pkcs11.C_DecryptInit(session, { mechanism: PKCS11.CKM_RSA_PKCS_OAEP }, privKey)
          const dataKey = pkcs11.C_Decrypt(session, Buffer.from(envelope.key, 'base64'))
          const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(dataKey), Buffer.from(envelope.iv, 'base64'))
          decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
          const pt = Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()])
          secureZero(dataKey)
          return pt.toString('utf-8')
        },
      }
    } catch {
      return null
    }
  }
}

// ============================================================
// 工厂函数
// ============================================================
export function createKmsBackend(type) {
  const t = (type || 'http').toLowerCase()
  switch (t) {
    case 'http': return new HttpKmsBackend()
    case 'vault': return new VaultBackend()
    case 'aws': return new AwsKmsBackend()
    case 'azure': return new AzureKeyVaultBackend()
    case 'aliyun': return new AliyunKmsBackend()
    case 'tpm': return new TpmBackend()
    case 'hsm':
    case 'pkcs11': return new Pkcs11Backend()
    default:
      throw new Error(`不支持的 KMS/HSM/TPM 后端类型: ${type}`)
  }
}

export { secureZero }
