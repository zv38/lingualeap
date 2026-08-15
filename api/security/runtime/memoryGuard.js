// ============================================================
// Memory Guard — 敏感数据内存保护
// 职责：
//   1. 提供 secureBuffer 包装，限制敏感数据在内存中的暴露时间
//   2. 支持显式清零与自动过期清理
//   3. 定期扫描并释放过期的敏感缓存
//   4. 与 vault/secureMemory.js 复用底层 SecureBuffer，避免重复实现
// ============================================================

import crypto from 'crypto'
import { SecureBuffer, secureZero } from '../vault/secureMemory.js'
import { logAudit } from '../core/auditLogger.js'

const DEFAULT_TTL_MS = Number(process.env.MEMORY_GUARD_TTL_MS || 5 * 60 * 1000)
const CLEANUP_INTERVAL_MS = Number(process.env.MEMORY_GUARD_CLEANUP_INTERVAL_MS || 60 * 1000)
const MAX_REGISTRY_SIZE = 1000

const registry = new Set()
let cleanupTimer = null
let totalCleaned = 0
let totalCreated = 0

function logEvent(type, detail) {
  logAudit({
    userId: 'system',
    action: 'memory_guard_event',
    details: { type, detail },
    success: type !== 'auto_cleanup_error',
  })
}

/**
 * 受管敏感缓冲区：在 SecureBuffer 基础上增加创建时间与 TTL 元数据。
 */
export class ManagedSecureBuffer {
  constructor(source, ttlMs = DEFAULT_TTL_MS) {
    this._sb = Buffer.isBuffer(source) || typeof source === 'string'
      ? SecureBuffer.fromString(typeof source === 'string' ? source : source.toString('utf-8'))
      : source instanceof SecureBuffer ? source : null

    if (!this._sb) {
      throw new TypeError('ManagedSecureBuffer 需要字符串或 Buffer')
    }

    this.createdAt = Date.now()
    this.ttlMs = ttlMs
    this._accessedAt = this.createdAt
    this._zeroed = false
    totalCreated++
    registry.add(this)
    if (registry.size > MAX_REGISTRY_SIZE) {
      runMemoryCleanup()
    }
  }

  get alive() {
    return !this._zeroed && this._sb !== null
  }

  get expired() {
    return this.alive && Date.now() - this._accessedAt > this.ttlMs
  }

  get buffer() {
    if (!this.alive) return null
    this._accessedAt = Date.now()
    return this._sb.buffer
  }

  toString(encoding = 'utf-8') {
    if (!this.alive) return ''
    this._accessedAt = Date.now()
    return this._sb.toString(encoding)
  }

  /**
   * 显式清零：覆盖底层 Buffer 并释放引用。
   */
  zeroize() {
    if (this._zeroed) return
    try {
      this._sb.zeroize()
    } catch {
      // 若 SecureBuffer 内部已释放则忽略
    }
    this._sb = null
    this._zeroed = true
    registry.delete(this)
  }
}

/**
 * 便捷创建受管 SecureBuffer。
 */
export function createSecureBuffer(source, ttlMs = DEFAULT_TTL_MS) {
  return new ManagedSecureBuffer(source, ttlMs)
}

/**
 * 对任意字符串或 Buffer 执行一次性清零。
 */
export function clearSensitiveBuffer(value) {
  if (!value) return false
  if (value instanceof ManagedSecureBuffer) {
    value.zeroize()
    return true
  }
  secureZero(value)
  return true
}

/**
 * 手动触发过期缓冲区清理。
 */
export function runMemoryCleanup() {
  let cleaned = 0
  let errors = 0
  const now = Date.now()
  for (const entry of Array.from(registry)) {
    try {
      if (entry.expired || entry._zeroed || !entry.alive) {
        entry.zeroize()
        cleaned++
      }
      // 强制超过最大存活时间（TTL * 2）的也清理
      else if (now - entry.createdAt > entry.ttlMs * 2) {
        entry.zeroize()
        cleaned++
      }
    } catch {
      errors++
      registry.delete(entry)
    }
  }
  totalCleaned += cleaned
  if (cleaned || errors) {
    logEvent('auto_cleanup', `清理 ${cleaned} 个过期缓冲区，错误 ${errors}，当前注册数 ${registry.size}`)
  }
  return { cleaned, errors, remaining: registry.size }
}

/**
 * 启动定期内存清理。
 */
export function startMemoryCleanup(intervalMs = CLEANUP_INTERVAL_MS) {
  if (cleanupTimer) return { alreadyRunning: true }
  cleanupTimer = setInterval(() => {
    try {
      runMemoryCleanup()
    } catch (err) {
      logEvent('auto_cleanup_error', err.message)
    }
  }, Math.max(10000, intervalMs))
  cleanupTimer.unref?.()
  return { started: true, intervalMs }
}

export function stopMemoryCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
    return { stopped: true }
  }
  return { stopped: false }
}

/**
 * 获取当前内存保护状态（敏感细节数量不包含实际密钥）。
 */
export function getMemoryGuardStatus() {
  const alive = Array.from(registry).filter(e => e.alive).length
  const expired = Array.from(registry).filter(e => e.expired).length
  return {
    totalCreated,
    totalCleaned,
    activeBuffers: registry.size,
    aliveBuffers: alive,
    expiredBuffers: expired,
    defaultTtlMs: DEFAULT_TTL_MS,
    cleanupRunning: !!cleanupTimer,
  }
}

/**
 * 扫描运行时内存中的敏感字符串（进程参数、环境变量）。
 * 仅返回命中数量与模式类型，不返回具体值。
 */
export function scanMemoryForSecrets() {
  const patterns = [
    { name: 'jwt_secret', regex: /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/ },
    { name: 'private_key_pem', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
    { name: 'api_key_like', regex: /(?:api[_-]?key|secret|token)\s*[:=]\s*[a-zA-Z0-9_\-]{16,}/i },
    { name: 'password_like', regex: /(?:password|passwd|pwd)\s*[:=]\s*\S{8,}/i },
  ]
  const haystacks = [
    process.argv.join(' '),
    Object.entries(process.env).map(([k, v]) => `${k}=${v}`).join('\n'),
  ]

  const findings = []
  for (const { name, regex } of patterns) {
    let count = 0
    for (const text of haystacks) {
      const matches = text.match(new RegExp(regex, 'g'))
      if (matches) count += matches.length
    }
    if (count) findings.push({ type: name, count })
  }
  return { findings, total: findings.reduce((sum, f) => sum + f.count, 0) }
}

// 默认启动定期清理
startMemoryCleanup()

export default {
  ManagedSecureBuffer,
  createSecureBuffer,
  clearSensitiveBuffer,
  runMemoryCleanup,
  startMemoryCleanup,
  stopMemoryCleanup,
  getMemoryGuardStatus,
  scanMemoryForSecrets,
}
