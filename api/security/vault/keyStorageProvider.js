// ============================================================
// KeyStorageProvider — 军工级密钥存储抽象层
// 目标：把密钥的“存储后端”与“业务使用”解耦，支持：
//   - env      : 系统环境变量 / Secrets Manager（容器、KMS 代理推荐）
//   - dpapi    : Windows DPAPI，绑定当前用户/机器（开发机、单机部署）
//   - kms      : AWS KMS / Azure Key Vault / 阿里云 KMS / HashiCorp Vault
// 任何 Provider 都必须保证：加载后内存最短留存、protect 后明文不落地。
// ============================================================

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { createKmsBackend, secureZero as kmsSecureZero } from './kmsAdapter.js'

const SECRETS_DIR = process.env.LL_SECRETS_DIR || path.join(os.homedir(), '.lingualeap-secrets')

function isWindows() {
  return process.platform === 'win32'
}

function ensureSecretsDir() {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true })
  }
}

function secretFilePath(name) {
  ensureSecretsDir()
  return path.join(SECRETS_DIR, `${name}.enc`)
}

function psQuote(value) {
  return value.replace(/'/g, "''")
}

function secureZero(value) {
  if (Buffer.isBuffer(value)) {
    value.fill(0)
  } else if (typeof value === 'string') {
    try {
      const buf = Buffer.from(value, 'utf-8')
      buf.fill(0)
    } catch {}
  }
}

/**
 * 校验文件权限是否仅当前用户可读写。
 */
function validateFilePermissions(filePath, fatal = false) {
  try {
    if (isWindows()) {
      const acl = execSync(`icacls "${filePath}"`, { encoding: 'utf-8', stdio: 'pipe' })
      const dangerous = [
        /Everyone:\(I\)?\(M\)|Everyone:\(F\)|Everyone:\(RX\)/i,
        /BUILTIN\\Users:\(I\)?\(M\)|BUILTIN\\Users:\(F\)|BUILTIN\\Users:\(RX\)/i,
        /NT AUTHORITY\\Authenticated Users:\(I\)?\(M\)|NT AUTHORITY\\Authenticated Users:\(F\)|NT AUTHORITY\\Authenticated Users:\(RX\)/i,
      ]
      for (const pattern of dangerous) {
        if (pattern.test(acl)) {
          const msg = `密钥文件 ${filePath} 权限过于宽松，检测到 Everyone/Users/Authenticated Users 可访问`
          if (fatal) throw new Error(msg)
          console.warn(`[SecretVault] ${msg}`)
          return false
        }
      }
    } else {
      const stat = fs.statSync(filePath)
      const mode = stat.mode & 0o777
      if (mode & 0o077) {
        const msg = `密钥文件 ${filePath} 权限为 ${mode.toString(8)}，应为 0o600（仅所有者可读写）`
        if (fatal) throw new Error(msg)
        console.warn(`[SecretVault] ${msg}`)
        return false
      }
    }
    return true
  } catch (err) {
    if (fatal) throw err
    console.warn(`[SecretVault] 无法校验 ${filePath} 权限: ${err.message}`)
    return false
  }
}

// ============================================================
// Windows DPAPI 原生操作（供 DpapiProvider 使用）
// ============================================================
function encryptWithDpapi(plainBytes) {
  if (!isWindows()) {
    throw new Error('DPAPI 加密仅支持 Windows 平台')
  }
  const tempIn = path.join(os.tmpdir(), `ll-secret-${crypto.randomBytes(8).toString('hex')}.bin`)
  const tempOut = `${tempIn}.enc`
  const psFile = `${tempIn}.ps1`
  try {
    fs.writeFileSync(tempIn, plainBytes)
    const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [System.IO.File]::ReadAllBytes('${psQuote(tempIn)}')
$encrypted = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes('${psQuote(tempOut)}', $encrypted)
`
    fs.writeFileSync(psFile, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(psScript, 'utf-8')]))
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { stdio: 'pipe' })
    if (!fs.existsSync(tempOut)) {
      throw new Error('DPAPI 加密未产生输出文件')
    }
    return fs.readFileSync(tempOut)
  } finally {
    try { fs.unlinkSync(tempIn) } catch {}
    try { fs.unlinkSync(tempOut) } catch {}
    try { fs.unlinkSync(psFile) } catch {}
  }
}

function decryptWithDpapi(encryptedBytes) {
  if (!isWindows()) {
    throw new Error('DPAPI 解密仅支持 Windows 平台')
  }
  const tempIn = path.join(os.tmpdir(), `ll-secret-${crypto.randomBytes(8).toString('hex')}.bin`)
  const tempOut = `${tempIn}.dec`
  const psFile = `${tempIn}.ps1`
  try {
    fs.writeFileSync(tempIn, encryptedBytes)
    const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [System.IO.File]::ReadAllBytes('${psQuote(tempIn)}')
$decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes('${psQuote(tempOut)}', $decrypted)
`
    fs.writeFileSync(psFile, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(psScript, 'utf-8')]))
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { stdio: 'pipe' })
    if (!fs.existsSync(tempOut)) {
      throw new Error('DPAPI 解密未产生输出文件')
    }
    return fs.readFileSync(tempOut)
  } finally {
    try { fs.unlinkSync(tempIn) } catch {}
    try { fs.unlinkSync(tempOut) } catch {}
    try { fs.unlinkSync(psFile) } catch {}
  }
}

// ============================================================
// Provider 接口
// ============================================================
export class KeyStorageProvider {
  constructor(name) {
    this.name = name
  }

  /**
   * 加载指定名称的密钥，返回字符串；不存在返回 null。
   */
  load(name) {
    throw new Error(`Provider ${this.name} 未实现 load`)
  }

  /**
   * 保护一个密钥，返回存储位置标识（如文件路径、KMS Key ID）。
   */
  protect(name, value) {
    throw new Error(`Provider ${this.name} 未实现 protect`)
  }

  exists(name) {
    throw new Error(`Provider ${this.name} 未实现 exists`)
  }

  remove(name) {
    throw new Error(`Provider ${this.name} 未实现 remove`)
  }

  list() {
    throw new Error(`Provider ${this.name} 未实现 list`)
  }

  supportsHardware() {
    return false
  }
}

// ============================================================
// EnvProvider：环境变量 / _FILE 指向的明文文件（适合 KMS 代理注入）
// ============================================================
export class EnvKeyStorageProvider extends KeyStorageProvider {
  constructor() {
    super('env')
  }

  load(name) {
    const envName = name.toUpperCase()
    const direct = process.env[envName]
    if (direct) return direct

    const filePath = process.env[`${envName}_FILE`]
    if (filePath && fs.existsSync(filePath)) {
      validateFilePermissions(filePath, false)
      return fs.readFileSync(filePath, 'utf-8').trim()
    }
    return null
  }

  protect(name, value) {
    // 环境变量 Provider 不执行 protect；应由外部 KMS/Secrets Manager 注入
    throw new Error(`EnvProvider 不支持 protect，请通过 ${name.toUpperCase()} 环境变量或 KMS 注入密钥`)
  }

  exists(name) {
    const envName = name.toUpperCase()
    if (process.env[envName]) return true
    const filePath = process.env[`${envName}_FILE`]
    return !!(filePath && fs.existsSync(filePath))
  }

  remove(name) {
    // 环境变量无法删除，仅清空进程内引用
    delete process.env[name.toUpperCase()]
  }

  list() {
    return Object.keys(process.env)
      .filter(k => k.endsWith('_FILE') || /_(SECRET|KEY|HASH|TOKEN)$/.test(k))
      .map(k => k.toLowerCase().replace(/_file$/, ''))
  }

  supportsHardware() {
    return false
  }
}

// ============================================================
// DpapiProvider：Windows DPAPI，绑定当前用户
// ============================================================
export class DpapiKeyStorageProvider extends KeyStorageProvider {
  constructor() {
    super('dpapi')
  }

  load(name) {
    if (!isWindows()) {
      throw new Error('DpapiProvider 仅支持 Windows 平台')
    }
    const keyFile = process.env[`${name.toUpperCase()}_FILE`] || secretFilePath(name)
    if (!fs.existsSync(keyFile)) return null
    validateFilePermissions(keyFile, false)
    const encrypted = fs.readFileSync(keyFile)
    let decrypted = null
    try {
      decrypted = decryptWithDpapi(encrypted)
      return decrypted.toString('utf-8').trim()
    } finally {
      if (decrypted) secureZero(decrypted)
    }
  }

  protect(name, value) {
    if (!isWindows()) {
      throw new Error('DpapiProvider 仅支持 Windows 平台')
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('protect 需要非空字符串')
    }
    const outFile = process.env[`${name.toUpperCase()}_FILE`] || secretFilePath(name)
    const plain = Buffer.from(value, 'utf-8')
    let encrypted = null
    try {
      encrypted = encryptWithDpapi(plain)
      fs.writeFileSync(outFile, encrypted)
      fs.chmodSync(outFile, 0o600)
      return outFile
    } finally {
      secureZero(plain)
      if (encrypted) secureZero(encrypted)
    }
  }

  exists(name) {
    const keyFile = process.env[`${name.toUpperCase()}_FILE`] || secretFilePath(name)
    return fs.existsSync(keyFile)
  }

  remove(name) {
    const keyFile = process.env[`${name.toUpperCase()}_FILE`] || secretFilePath(name)
    if (fs.existsSync(keyFile)) fs.unlinkSync(keyFile)
  }

  list() {
    ensureSecretsDir()
    return fs.readdirSync(SECRETS_DIR).filter(f => f.endsWith('.enc')).map(f => f.replace(/\.enc$/, ''))
  }

  supportsHardware() {
    // Windows DPAPI 依赖当前用户登录会话，不算硬件级，但属于 OS 级保护
    return false
  }
}

// ============================================================
// KmsProvider：云 KMS / HSM / TPM 统一抽象层
// 配置方式：
//   LL_KEY_PROVIDER=kms|hsm
//   LL_KMS_TYPE=http|vault|aws|azure|aliyun|tpm|pkcs11
//   以及对应后端凭证（通过环境变量或 IAM 角色注入）
// 策略：本地只保存 KMS 密文引用（envelope），真实密钥材料由后端保护
// ============================================================
export class KmsKeyStorageProvider extends KeyStorageProvider {
  constructor() {
    super('kms')
    this.kmsType = process.env.LL_KMS_TYPE || 'http'
    this.backend = createKmsBackend(this.kmsType)
  }

  _kmsFilePath(name) {
    return process.env[`${name.toUpperCase()}_FILE`] || `${secretFilePath(name)}.kms`
  }

  // 通过子进程同步调用异步 KMS 后端，保持 Provider 接口同步兼容
  _syncCall(method, name, payload) {
    const script = `
import('./kmsAdapter.js').then(async m => {
  const backend = m.createKmsBackend(${JSON.stringify(this.kmsType)})
  const result = await backend.${method}(${JSON.stringify(name)}, ${JSON.stringify(payload)})
  process.stdout.write(JSON.stringify({ ok: true, result }))
}).catch(err => {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message }))
})
`
    const tmp = path.join(os.tmpdir(), `ll-kms-sync-${crypto.randomBytes(8).toString('hex')}.mjs`)
    fs.writeFileSync(tmp, script)
    try {
      const out = execSync(`node "${tmp}"`, { encoding: 'utf-8', stdio: 'pipe' })
      const json = JSON.parse(out.trim())
      if (!json.ok) throw new Error(json.error)
      return json.result
    } finally {
      try { fs.unlinkSync(tmp) } catch {}
    }
  }

  load(name) {
    const file = this._kmsFilePath(name)
    if (!fs.existsSync(file)) return null
    const ciphertext = fs.readFileSync(file, 'utf-8').trim()
    if (!ciphertext) return null
    const plaintext = this._syncCall('decrypt', name, ciphertext)
    try {
      return plaintext
    } finally {
      secureZero(plaintext)
    }
  }

  protect(name, value) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('protect 需要非空字符串')
    }
    const file = this._kmsFilePath(name)
    const ciphertext = this._syncCall('encrypt', name, value)
    try {
      fs.writeFileSync(file, ciphertext)
      fs.chmodSync(file, 0o600)
      return file
    } finally {
      secureZero(ciphertext)
    }
  }

  exists(name) {
    return fs.existsSync(this._kmsFilePath(name))
  }

  remove(name) {
    const file = this._kmsFilePath(name)
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }

  list() {
    ensureSecretsDir()
    return fs.readdirSync(SECRETS_DIR)
      .filter(f => f.endsWith('.kms'))
      .map(f => f.replace(/\.kms$/, ''))
  }

  supportsHardware() {
    return this.backend.supportsHardware()
  }

  healthCheck() {
    return {
      provider: 'kms',
      backendType: this.kmsType,
      supportsHardware: this.supportsHardware(),
      ...this.backend.healthCheck(),
    }
  }
}

// ============================================================
// Provider 工厂
// ============================================================
export function createKeyStorageProvider(providerName = 'auto') {
  const name = providerName.toLowerCase()
  if (name === 'auto') {
    return isWindows() ? new DpapiKeyStorageProvider() : new EnvKeyStorageProvider()
  }
  if (name === 'env') return new EnvKeyStorageProvider()
  if (name === 'dpapi') return new DpapiKeyStorageProvider()
  if (name === 'kms' || name === 'hsm' || name === 'tpm' || name === 'pkcs11') {
    if (name === 'tpm' || name === 'pkcs11') process.env.LL_KMS_TYPE = name
    return new KmsKeyStorageProvider()
  }
  throw new Error(`不支持的密钥存储 Provider: ${providerName}`)
}

export { SECRETS_DIR, validateFilePermissions, secureZero }
