// ============================================================
// File Encryption Key Store — 文件加密密钥的多版本管理（军工级稳定 keyId）
// 支持：
//   - FILE_ENCRYPTION_KEYS 环境变量（JSON 规范格式 { primaryKeyId, keys }）
//   - FILE_ENCRYPTION_KEY 环境变量（单密钥兼容，keyId='primary'）
//   - DPAPI 保护的 file-encryption-keys.enc（JSON）
//   - 兼容旧版 { primary, legacy-xxx } 格式（自动升级）
//   - 兼容旧版 file-vault.key.enc（单密钥）
// 关键设计：
//   - 每个密钥拥有稳定唯一 keyId，不因轮换而改变
//   - primaryKeyId 指向当前写入密钥，Envelope 中记录实际 keyId
//   - 旧格式会在加载时自动转换为新格式
// ============================================================

import { loadSecret, protectSecret, secureZero, SECRETS_DIR } from './secretVault.js'
import { loadSplitSecret, splitAndProtectSecret, hasSplitSecret } from './keySplitStore.js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const LEGACY_KEY_NAME = 'file-vault.key'
const MULTI_KEY_NAME = 'file-encryption-keys'

function validateBase64Key(value, label) {
  const buf = Buffer.from(value, 'base64')
  if (buf.length !== 32) {
    throw new Error(`${label} 解码后应为 32 字节，实际 ${buf.length} 字节`)
  }
  secureZero(buf)
}

/**
 * 规范化密钥集合为 { primaryKeyId, keys: { [keyId]: base64Key } }
 */
export function normalizeKeyStore(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('FILE_ENCRYPTION_KEYS 必须是 JSON 对象')
  }

  // 新格式：{ primaryKeyId, keys }
  if (input.primaryKeyId && input.keys && typeof input.keys === 'object') {
    if (!input.keys[input.primaryKeyId]) {
      throw new Error(`primaryKeyId "${input.primaryKeyId}" 不在 keys 中`)
    }
    for (const [keyId, value] of Object.entries(input.keys)) {
      validateBase64Key(value, `FILE_ENCRYPTION_KEYS.keys.${keyId}`)
    }
    return { primaryKeyId: input.primaryKeyId, keys: { ...input.keys } }
  }

  // 旧格式：{ primary: base64Key, legacy-xxx: base64Key }
  if (input.primary && typeof input.primary === 'string') {
    const keys = {}
    for (const [keyId, value] of Object.entries(input)) {
      validateBase64Key(value, `FILE_ENCRYPTION_KEYS.${keyId}`)
      keys[keyId] = value
    }
    return { primaryKeyId: 'primary', keys }
  }

  throw new Error('FILE_ENCRYPTION_KEYS 格式无法识别：需要 { primaryKeyId, keys } 或 { primary, ... }')
}

/**
 * 加载文件加密密钥集合。
 * 返回规范化对象 { primaryKeyId, keys }；未找到返回 null。
 */
export function loadFileEncryptionKeys() {
  // 1. 生产环境优先：环境变量直接注入（KMS/Secrets Manager 推荐）
  if (process.env.FILE_ENCRYPTION_KEYS) {
    return normalizeKeyStore(JSON.parse(process.env.FILE_ENCRYPTION_KEYS))
  }
  if (process.env.FILE_ENCRYPTION_KEY) {
    return normalizeKeyStore({
      primaryKeyId: 'primary',
      keys: { primary: process.env.FILE_ENCRYPTION_KEY },
    })
  }

  // 2. 军工级：Shamir 分存密钥（2/3），需多份 share 才能还原
  if (hasSplitSecret('FILE_ENCRYPTION_KEY')) {
    const combined = loadSplitSecret('FILE_ENCRYPTION_KEY')
    if (combined) {
      try {
        return normalizeKeyStore({
          primaryKeyId: 'primary',
          keys: { primary: Buffer.from(combined, 'base64').toString('base64') },
        })
      } finally {
        secureZero(Buffer.from(combined, 'utf-8'))
      }
    }
  }

  // 3. 兼容旧版 DPAPI 多版本密钥
  const multi = loadSecret(MULTI_KEY_NAME)
  if (multi) {
    try {
      return normalizeKeyStore(JSON.parse(multi))
    } finally {
      secureZero(Buffer.from(multi, 'utf-8'))
    }
  }

  // 4. 兼容旧版单密钥
  const single = loadSecret(LEGACY_KEY_NAME)
  if (single) {
    try {
      return normalizeKeyStore({
        primaryKeyId: 'primary',
        keys: { primary: single },
      })
    } finally {
      secureZero(Buffer.from(single, 'utf-8'))
    }
  }

  return null
}

/**
 * 将军工级文件加密密钥拆分为 Shamir 多份并分别保护
 */
export function protectFileEncryptionKeySplit(keyBase64) {
  splitAndProtectSecret('FILE_ENCRYPTION_KEY', keyBase64, 2, 3)
}

/**
 * 使用当前 Provider 保护多版本文件加密密钥集合。
 * store: { primaryKeyId, keys: { [keyId]: base64Key } }
 */
export function protectFileEncryptionKeys(store) {
  const normalized = normalizeKeyStore(store)
  const json = JSON.stringify(normalized)
  try {
    const file = protectSecret(MULTI_KEY_NAME, json)
    return file
  } finally {
    secureZero(Buffer.from(json, 'utf-8'))
  }
}

/**
 * 生成新的文件加密密钥，返回 { keyId, key }
 */
export function generateFileEncryptionKey() {
  return {
    keyId: `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    key: crypto.randomBytes(32).toString('base64'),
  }
}

/**
 * 移除旧版单/多版本密钥文件（迁移到 Shamir 分存后清理）。
 */
export function removeLegacyFileEncryptionKey() {
  const legacyFile = path.join(SECRETS_DIR, `${LEGACY_KEY_NAME}.enc`)
  if (fs.existsSync(legacyFile)) {
    fs.unlinkSync(legacyFile)
  }
  const multiFile = path.join(SECRETS_DIR, `${MULTI_KEY_NAME}.enc`)
  if (fs.existsSync(multiFile)) {
    fs.unlinkSync(multiFile)
  }
}
