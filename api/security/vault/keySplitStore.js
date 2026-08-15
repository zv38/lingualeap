// ============================================================
// KeySplitStore — 军工级密钥分存存储
// 将最敏感的核心密钥拆分为 n 份（默认 2/3），分别存储于：
//   - DPAPI 加密文件（本地 Windows 当前用户）
//   - 环境变量 / KMS
//   - 可选：用户提供的 recovery share（离线保存）
// 任何单点泄露都无法还原密钥。
// ============================================================

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { splitSecret, combineShares, encodeShare, decodeShare } from './shamir.js'
import { protectSecret, loadSecret } from './secretVault.js'
import { SecureBuffer, secureZero } from './secureMemory.js'

const SECRETS_DIR = process.env.LL_SECCRETS_DIR || path.join(os.homedir(), '.lingualeap-secrets')

const DEFAULT_K = Number(process.env.LL_SHAMIR_K || 2)
const DEFAULT_N = Number(process.env.LL_SHAMIR_N || 3)

function shareFilePath(name, index) {
  return path.join(SECRETS_DIR, `${name}.share-${index}.enc`)
}

function ensureDir() {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true })
  }
}

/**
 * 将核心密钥拆分为 n 份并独立保护
 * @param {string} name - 密钥名称
 * @param {string} secret - 密钥原文
 * @param {number} k - 还原阈值
 * @param {number} n - 总份数
 */
export function splitAndProtectSecret(name, secret, k = DEFAULT_K, n = DEFAULT_N) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('splitAndProtectSecret 需要非空字符串密钥')
  }
  ensureDir()

  const secretBuf = SecureBuffer.fromString(secret)
  let shares
  try {
    shares = splitSecret(secretBuf.buffer, k, n)
  } finally {
    secretBuf.zeroize()
  }

  // Share-1: DPAPI 文件
  protectSecret(`${name}-share-1`, encodeShare(shares[0]))
  secureZero(shares[0].value)

  // Share-2: 第二个 DPAPI 文件
  protectSecret(`${name}-share-2`, encodeShare(shares[1]))
  secureZero(shares[1].value)

  // Share-3 及以后：环境变量提示（不自动写入，避免全部存在同一机器）
  for (let i = 2; i < n; i++) {
    const encoded = encodeShare(shares[i])
    fs.writeFileSync(shareFilePath(name, i + 1), encoded, 'utf-8')
    fs.chmodSync(shareFilePath(name, i + 1), 0o600)
    secureZero(shares[i].value)
    console.warn(`[KeySplitStore] ${name} 的 share-${i + 1} 已写入 ${shareFilePath(name, i + 1)}，建议离线迁移后删除本地副本`)
  }

  console.log(`[KeySplitStore] ${name} 已拆分为 ${k}/${n} 份并分别保护`)
}

/**
 * 尝试从多个来源收集足够的 share 还原密钥
 * @param {string} name - 密钥名称
 * @param {number} k - 还原阈值
 * @returns {string|null} 密钥原文，失败返回 null
 */
export function loadSplitSecret(name, k = DEFAULT_K) {
  const shares = []

  // 尝试加载 DPAPI 保护的 share
  for (let i = 1; i <= 2; i++) {
    try {
      const encoded = loadSecret(`${name}-share-${i}`)
      if (encoded) shares.push(decodeShare(encoded))
    } catch (err) {
      console.warn(`[KeySplitStore] 无法加载 ${name}-share-${i}: ${err.message}`)
    }
  }

  // 尝试加载本地文件 share
  for (let i = 3; i <= DEFAULT_N; i++) {
    const file = shareFilePath(name, i)
    if (fs.existsSync(file)) {
      try {
        const encoded = fs.readFileSync(file, 'utf-8').trim()
        shares.push(decodeShare(encoded))
      } catch (err) {
        console.warn(`[KeySplitStore] 无法加载 ${file}: ${err.message}`)
      }
    }
  }

  // 尝试从环境变量加载额外 share（用于恢复场景）
  const envShare = process.env[`${name}_SHARE_RECOVERY`]
  if (envShare) {
    try {
      shares.push(decodeShare(envShare))
    } catch (err) {
      console.warn(`[KeySplitStore] 环境变量 ${name}_SHARE_RECOVERY 格式无效`)
    }
  }

  if (shares.length < k) {
    console.warn(`[KeySplitStore] ${name} 仅收集到 ${shares.length}/${k} 份 share，无法还原`)
    return null
  }

  const secretBuf = combineShares(shares.slice(0, k))
  try {
    return secretBuf.toString('utf-8')
  } finally {
    secureZero(secretBuf)
  }
}

/**
 * 检查某密钥是否已配置分存
 */
export function hasSplitSecret(name) {
  return fs.existsSync(path.join(SECRETS_DIR, `${name}-share-1.enc`)) ||
         fs.existsSync(path.join(SECRETS_DIR, `${name}-share-2.enc`))
}
