import { protectFileEncryptionKey, loadFileEncryptionKey } from '../api/security/privacy/dpapiKeyLoader.js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

const SECRETS_DIR = path.join(os.homedir(), '.lingualeap-secrets')

function printUsage() {
  console.log('用法:')
  console.log('  npm run protect:file-vault-key -- <base64-key>')
  console.log('  npm run protect:file-vault-key -- --generate')
  console.log('')
  console.log('说明:')
  console.log('  将 FILE_ENCRYPTION_KEY 用 Windows DPAPI 加密，写入')
  console.log(`  ${path.join(SECRETS_DIR, 'file-vault.key.enc')}`)
  console.log('  仅当前 Windows 用户可解密。')
}

async function main() {
  if (process.platform !== 'win32') {
    console.error('[protect-vault-key] 错误：DPAPI 保护仅支持 Windows')
    process.exit(1)
  }

  const arg = process.argv[2]
  if (!arg || arg === '--help' || arg === '-h') {
    printUsage()
    process.exit(0)
  }

  let keyBase64
  if (arg === '--generate') {
    keyBase64 = crypto.randomBytes(32).toString('base64')
    console.log('[protect-vault-key] 已生成新的 32 字节密钥')
  } else {
    keyBase64 = arg.trim()
    const buf = Buffer.from(keyBase64, 'base64')
    if (buf.length !== 32) {
      console.error(`[protect-vault-key] 错误：密钥 base64 解码后应为 32 字节，实际 ${buf.length} 字节`)
      process.exit(1)
    }
    buf.fill(0)
  }

  const outFile = process.env.FILE_ENCRYPTION_KEY_FILE || path.join(SECRETS_DIR, 'file-vault.key.enc')
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true })
  }

  protectFileEncryptionKey(keyBase64, outFile)
  console.log(`[protect-vault-key] 密钥已 DPAPI 加密保存到: ${outFile}`)

  // 验证可解密
  process.env.FILE_ENCRYPTION_KEY_FILE = outFile
  delete process.env.FILE_ENCRYPTION_KEY
  const decrypted = loadFileEncryptionKey()
  if (decrypted === keyBase64) {
    console.log('[protect-vault-key] 解密验证通过')
  } else {
    console.error('[protect-vault-key] 错误：解密验证失败')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[protect-vault-key] 失败:', err.message)
  process.exit(1)
})
