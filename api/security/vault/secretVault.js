// ============================================================
// Secret Vault — 军工级密钥管理统一入口
// 目标：任何敏感密钥不得明文落入 .env.local 或源码仓库
// 策略：
//   - 加载优先级：环境变量 > Provider 持久化存储
//   - Windows：默认 DPAPI Provider，每个密钥独立加密，仅存当前用户可解
//   - 非 Windows / 容器 / 生产：默认 Env Provider，强制系统环境变量或 KMS 注入
//   - 支持切换 Provider：LL_KEY_PROVIDER=env|dpapi|kms
//   - 加载后内存中保留时间最短，使用 Buffer.fill(0) 清零
//   - 校验密钥文件权限，拒绝过于宽松的访问控制
// ============================================================

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import {
  createKeyStorageProvider,
  EnvKeyStorageProvider,
  DpapiKeyStorageProvider,
  KmsKeyStorageProvider,
  KeyStorageProvider,
  SECRETS_DIR,
  validateFilePermissions,
  secureZero,
} from './keyStorageProvider.js'

const provider = createKeyStorageProvider(process.env.LL_KEY_PROVIDER || 'auto')

/**
 * 加载单个密钥。
 * 优先级：
 *   1. 环境变量 <NAME>（容器 / KMS 代理推荐方式）
 *   2. 当前 Provider 的持久化存储（DPAPI 文件 / KMS / 明文 _FILE）
 * 返回字符串；未找到时返回 null。
 */
export function loadSecret(name, { required = false, validateFile = false } = {}) {
  const envName = name.toUpperCase()

  // 1. 环境变量直接注入，永远最高优先级
  if (process.env[envName]) {
    const value = process.env[envName]
    if (required && !value) {
      throw new Error(`环境变量 ${envName} 为空`)
    }
    return value
  }

  // 2. Provider 持久化存储
  const keyFile = process.env[`${envName}_FILE`]
  if (keyFile && validateFile) {
    validateFilePermissions(keyFile, true)
  }

  const value = provider.load(name)
  if (required && !value) {
    throw new Error(`密钥 ${name} 未找到：未设置 ${envName}，且 Provider ${provider.name} 中不存在`)
  }
  return value
}

/**
 * 加载单个密钥，若未找到且处于生产环境则直接退出进程。
 */
export function loadSecretOrExit(name, { required = true, validateFile = true } = {}) {
  try {
    const value = loadSecret(name, { required, validateFile })
    if (required && !value) {
      console.error(`[FATAL-SECURITY] 无法加载密钥 ${name}，生产环境禁止启动`)
      process.exit(1)
    }
    return value
  } catch (err) {
    console.error(`[FATAL-SECURITY] 加载密钥 ${name} 失败: ${err.message}`)
    process.exit(1)
  }
}

/**
 * 使用当前 Provider 保护单个密钥并写入独立存储。
 * 返回存储位置（如文件路径）。
 */
export function protectSecret(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('protectSecret 需要非空字符串')
  }
  return provider.protect(name, value)
}

/**
 * 列出当前已保护的密钥。
 */
export function listProtectedSecrets() {
  return provider.list()
}

/**
 * 删除已保护的密钥（用于密钥轮换）。
 */
export function removeProtectedSecret(name) {
  provider.remove(name)
}

// ============================================================
// 密钥完整性绑定（防静默篡改）
// 设计要点：
//   - 写密钥时同时写出 HMAC 签名文件（<name>.enc.sig）。
//   - 读密钥时校验签名，失败 fail-closed（拒绝启动 / 拒绝加载）。
//   - 签名密钥优先级：INTEGRITY_KEY 环境变量（生产建议由 KMS/Secrets Manager 注入，
//     进程外不可读 → 真正防本机同用户篡改）> 文件加密主密钥派生 > 本机 DPAPI 保护的
//     integrity-key（dev 兜底，仅作篡改证据，无法防同用户攻击者）。
//   - 注：本地 HMAC 不能防“已以当前用户身份运行”的攻击者（他能重算签名），
//     真正的防线是让签名密钥存在于 KMS/TPM 等用户进程不可读的位置。
// ============================================================

let _integrityKey = null
function getIntegrityKey() {
  if (_integrityKey) return _integrityKey

  // 1. 显式完整性密钥（生产推荐：KMS / 环境变量注入）
  if (process.env.INTEGRITY_KEY) {
    _integrityKey = Buffer.from(process.env.INTEGRITY_KEY, 'utf-8')
    return _integrityKey
  }

  // 2. 复用文件加密主密钥派生（dev/单机）
  let fekRaw =
    process.env.FILE_ENCRYPTION_KEYS ||
    (process.env.FILE_ENCRYPTION_KEY
      ? JSON.stringify({ primaryKeyId: 'primary', keys: { primary: process.env.FILE_ENCRYPTION_KEY } })
      : null)
  if (!fekRaw) {
    // 兼容 DPAPI 保护的 file-encryption-keys
    try { fekRaw = loadSecret('file-encryption-keys') } catch {}
  }
  if (fekRaw) {
    try {
      const fek = JSON.parse(fekRaw)
      const primary = fek?.keys?.[fek.primaryKeyId]
      if (primary) {
        const base = Buffer.from(primary, 'base64')
        _integrityKey = crypto.createHmac('sha256', base).update('lingualeap:admin-hash-integrity').digest()
        secureZero(base)
        return _integrityKey
      }
    } catch {}
  }

  // 3. 本机生成 DPAPI 保护的完整性密钥（dev 兜底）
  const existing = loadSecret('integrity-key')
  if (existing) {
    _integrityKey = Buffer.from(existing, 'utf-8')
    return _integrityKey
  }
  const generated = crypto.randomBytes(32)
  protectSecret('integrity-key', generated.toString('base64'))
  _integrityKey = generated
  return _integrityKey
}

export function signSecretValue(name, value) {
  return crypto.createHmac('sha256', getIntegrityKey()).update(`${name}:${value}`).digest('base64')
}

export function verifySecretValue(name, value, sigB64) {
  if (!sigB64) return false
  const expected = signSecretValue(name, value)
  const a = Buffer.from(sigB64)
  const b = Buffer.from(expected)
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  secureZero(a)
  secureZero(b)
  return ok
}

function secretSigPath(name) {
  const base = process.env[`${name.toUpperCase()}_FILE`] || path.join(SECRETS_DIR, `${name}.enc`)
  return `${base}.sig`
}

export function protectSecretSigned(name, value) {
  const loc = protectSecret(name, value)
  // 同步写出 HMAC 签名文件，用于防静默篡改校验
  const sig = signSecretValue(name, value)
  fs.writeFileSync(secretSigPath(name), sig, { mode: 0o600 })
  return loc
}

export function loadSecretSigned(name, { required = false, validateFile = false } = {}) {
  const value = loadSecret(name, { required, validateFile })
  if (value == null) return null
  const sigFile = secretSigPath(name)
  if (!fs.existsSync(sigFile)) {
    // 首次引导：自动补签（dev 容错；如需生产严格模式可在此改为致命）
    fs.writeFileSync(sigFile, signSecretValue(name, value), { mode: 0o600 })
    return value
  }
  const sig = fs.readFileSync(sigFile, 'utf-8').trim()
  if (!verifySecretValue(name, value, sig)) {
    throw new Error(`密钥 ${name} 完整性校验失败：内容疑似被篡改`)
  }
  return value
}

export function loadSecretOrExitSigned(name, { required = true, validateFile = true } = {}) {
  try {
    const value = loadSecretSigned(name, { required, validateFile })
    if (required && value == null) {
      console.error(`[FATAL-SECURITY] 无法加载密钥 ${name}，生产环境禁止启动`)
      process.exit(1)
    }
    return value
  } catch (err) {
    console.error(`[FATAL-SECURITY] 加载/校验密钥 ${name} 失败: ${err.message}`)
    process.exit(1)
  }
}

export {
  createKeyStorageProvider,
  EnvKeyStorageProvider,
  DpapiKeyStorageProvider,
  KmsKeyStorageProvider,
  KeyStorageProvider,
  SECRETS_DIR,
  validateFilePermissions,
  secureZero,
}
