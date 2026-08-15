import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const SECRETS_DIR = path.join(os.homedir(), '.lingualeap-secrets')
const DEFAULT_ENCRYPTED_KEY_FILE = path.join(SECRETS_DIR, 'file-vault.key.enc')

function psQuote(value) {
  // PowerShell 单引号字符串中，用两个单引号转义单引号
  return value.replace(/'/g, "''")
}

/**
 * 使用 Windows DPAPI 解密受保护的数据。
 * 仅能在 Windows 且以加密时同一用户身份运行时解密。
 */
function decryptWithDpapi(encryptedBytes) {
  if (process.platform !== 'win32') {
    throw new Error('DPAPI 解密仅支持 Windows 平台')
  }

  const tempIn = path.join(os.tmpdir(), `ll-vault-key-${crypto.randomBytes(8).toString('hex')}.bin`)
  const tempOut = `${tempIn}.dec`
  const psFile = `${tempIn}.ps1`
  try {
    fs.writeFileSync(tempIn, encryptedBytes)

    // 使用 PowerShell 脚本文件调用 .NET DPAPI UnprotectData，避免命令行转义问题
    const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [System.IO.File]::ReadAllBytes('${psQuote(tempIn)}')
$decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes('${psQuote(tempOut)}', $decrypted)
`
    // 带 UTF-8 BOM，确保中文路径在 Windows PowerShell 中正确解析
    fs.writeFileSync(psFile, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(psScript, 'utf-8')]))
    const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { stdio: 'pipe' })
    if (output && output.length > 0) {
      console.log('[DPAPI] PowerShell 输出:', output.toString().trim())
    }

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

/**
 * 加载文件加密密钥。优先级：
 * 1. 环境变量 FILE_ENCRYPTION_KEY（供容器/CI 显式注入）
 * 2. 环境变量 FILE_ENCRYPTION_KEY_FILE 指向的 DPAPI 加密文件
 * 3. 默认路径 ~/.lingualeap-secrets/file-vault.key.enc
 *
 * 返回加载到的 base64 密钥字符串；未找到时返回 null。
 */
export function loadFileEncryptionKey() {
  // 优先级 1：直接环境变量
  if (process.env.FILE_ENCRYPTION_KEY) {
    return process.env.FILE_ENCRYPTION_KEY
  }

  // 优先级 2/3：DPAPI 保护文件
  const keyFile = process.env.FILE_ENCRYPTION_KEY_FILE || DEFAULT_ENCRYPTED_KEY_FILE
  if (!fs.existsSync(keyFile)) {
    return null
  }

  try {
    const encrypted = fs.readFileSync(keyFile)
    const decrypted = decryptWithDpapi(encrypted)
    const keyBase64 = decrypted.toString('utf-8').trim()

    // 校验密钥格式
    const buf = Buffer.from(keyBase64, 'base64')
    if (buf.length !== 32) {
      throw new Error(`FILE_ENCRYPTION_KEY 解码后长度应为 32 字节，实际 ${buf.length} 字节`)
    }

    // 安全清零临时 Buffer
    buf.fill(0)
    return keyBase64
  } catch (err) {
    console.error(`[DPAPI] 无法从 ${keyFile} 解密密钥:`, err.message)
    throw err
  }
}

/**
 * 使用 Windows DPAPI 加密文件加密密钥并写入文件。
 * 仅当前 Windows 用户可解密。
 */
export function protectFileEncryptionKey(keyBase64, outFile = DEFAULT_ENCRYPTED_KEY_FILE) {
  if (process.platform !== 'win32') {
    throw new Error('DPAPI 加密仅支持 Windows 平台')
  }

  const buf = Buffer.from(keyBase64, 'base64')
  if (buf.length !== 32) {
    throw new Error(`密钥解码后长度应为 32 字节，实际 ${buf.length} 字节`)
  }

  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true })
  }

  const tempIn = path.join(os.tmpdir(), `ll-vault-key-${crypto.randomBytes(8).toString('hex')}.bin`)
  const tempOut = `${tempIn}.enc`
  const psFile = `${tempIn}.ps1`
  try {
    fs.writeFileSync(tempIn, keyBase64, 'utf-8')

    // 使用 PowerShell 脚本文件调用 .NET DPAPI ProtectData，避免命令行转义问题
    const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [System.IO.File]::ReadAllBytes('${psQuote(tempIn)}')
$encrypted = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes('${psQuote(tempOut)}', $encrypted)
`
    // 带 UTF-8 BOM，确保中文路径在 Windows PowerShell 中正确解析
    fs.writeFileSync(psFile, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(psScript, 'utf-8')]))
    const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { stdio: 'pipe' })
    if (output && output.length > 0) {
      console.log('[DPAPI] PowerShell 输出:', output.toString().trim())
    }

    if (!fs.existsSync(tempOut)) {
      throw new Error('DPAPI 加密未产生输出文件')
    }

    fs.copyFileSync(tempOut, outFile)
    // 仅当前用户可读写
    fs.chmodSync(outFile, 0o600)
    return outFile
  } finally {
    try { fs.unlinkSync(tempIn) } catch {}
    try { fs.unlinkSync(tempOut) } catch {}
    try { fs.unlinkSync(psFile) } catch {}
    buf.fill(0)
  }
}
