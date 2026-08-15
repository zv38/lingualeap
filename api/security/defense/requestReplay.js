// ===== 军工级请求重放防护模块 =====
// 使用 nonce + 时间戳去重机制，支持内存存储和 Redis 共享存储两种模式
// 参考 tokenBlacklist.js 风格实现

import { safeRedisOp, isRedisReady } from '../../lib/redisClient.js'

// Redis 键前缀
const REDIS_PREFIX = 'request:replay:nonce:'

// 默认配置
const DEFAULT_TIME_WINDOW_MS = 300 * 1000 // 300 秒（5 分钟）
const DEFAULT_MAX_NONCE_PER_IP = 1000
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟

// 可被环境变量覆盖的配置
const TIME_WINDOW_MS = Number(process.env.REPLAY_TIME_WINDOW_MS || DEFAULT_TIME_WINDOW_MS)
const MAX_NONCE_PER_IP = Number(process.env.REPLAY_MAX_NONCE_PER_IP || DEFAULT_MAX_NONCE_PER_IP)
const CLEANUP_INTERVAL_MS = Number(process.env.REPLAY_CLEANUP_INTERVAL_MS || DEFAULT_CLEANUP_INTERVAL_MS)

// Redis 不可用时降级使用内存存储
const memoryNonces = new Map() // nonce -> { ip, timestamp, expiresAt }
const ipNonceIndex = new Map() // ip -> Set<nonce>

/**
 * 内存模式：检查 nonce 是否已存在（自动清理过期条目）
 */
function memoryHasNonce(nonce) {
  const entry = memoryNonces.get(nonce)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) {
    memoryNonces.delete(nonce)
    const ipSet = ipNonceIndex.get(entry.ip)
    if (ipSet) {
      ipSet.delete(nonce)
      if (ipSet.size === 0) ipNonceIndex.delete(entry.ip)
    }
    return false
  }
  return true
}

/**
 * 内存模式：存储 nonce
 */
function memorySetNonce(nonce, ip, timestamp, expiresAt) {
  memoryNonces.set(nonce, { ip, timestamp, expiresAt })
  if (!ipNonceIndex.has(ip)) {
    ipNonceIndex.set(ip, new Set())
  }
  ipNonceIndex.get(ip).add(nonce)
}

/**
 * 获取 Redis 键
 */
function redisKey(nonce) {
  return `${REDIS_PREFIX}${nonce}`
}

/**
 * 验证请求的 nonce + 时间戳组合，防止重放攻击。
 *
 * 校验流程：
 * 1. 参数合法性校验
 * 2. 时间戳窗口校验（默认 ±300 秒）
 * 3. nonce 唯一性校验（Redis 原子 SET NX 或内存 Map）
 * 4. 内存模式下附加 IP 级 nonce 数量上限
 *
 * @param {string} nonce  - 请求唯一标识（通常由客户端生成）
 * @param {number} timestamp - 请求时间戳（毫秒）
 * @param {string} ip     - 客户端 IP
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
export async function validateRequest(nonce, timestamp, ip) {
  // 参数校验
  if (!nonce || typeof nonce !== 'string') {
    return { valid: false, reason: 'nonce 参数无效' }
  }
  if (!timestamp || typeof timestamp !== 'number') {
    return { valid: false, reason: 'timestamp 参数无效' }
  }
  if (!ip || typeof ip !== 'string') {
    return { valid: false, reason: 'ip 参数无效' }
  }

  // 时间窗口校验：允许 ±TIME_WINDOW_MS 的偏差
  const now = Date.now()
  const timeDiff = Math.abs(now - timestamp)
  if (timeDiff > TIME_WINDOW_MS) {
    console.warn(
      `[RequestReplay] 时间戳超窗口: ip=${ip}, ` +
      `nonce=${nonce.slice(0, 16)}..., diff=${timeDiff}ms`
    )
    return { valid: false, reason: '请求时间戳超出允许窗口' }
  }

  const ttlSeconds = Math.ceil(TIME_WINDOW_MS / 1000)

  if (isRedisReady()) {
    // Redis 模式：使用 SET NX EX 原子操作实现 nonce 去重
    // 返回 'OK' 表示首次设置成功；返回 null 表示 nonce 已存在
    const result = await safeRedisOp(
      c => c.set(redisKey(nonce), String(timestamp), { NX: true, EX: ttlSeconds }),
      'REDIS_OP_FAILED' // 安全兜底：Redis 操作异常时返回此值
    )

    if (result === null) {
      console.warn(
        `[RequestReplay] Redis nonce 重复: ip=${ip}, ` +
        `nonce=${nonce.slice(0, 16)}...`
      )
      return { valid: false, reason: 'nonce 已使用' }
    }

    if (result === 'REDIS_OP_FAILED') {
      console.error(
        `[RequestReplay] Redis 操作失败，降级放行: ip=${ip}, ` +
        `nonce=${nonce.slice(0, 16)}...`
      )
      // 军工级设计：Redis 故障时 fail-open 放行，避免因防护模块自身导致服务不可用
      return { valid: true }
    }

    return { valid: true }
  }

  // 内存模式：去重校验
  if (memoryHasNonce(nonce)) {
    console.warn(
      `[RequestReplay] 内存 nonce 重复: ip=${ip}, ` +
      `nonce=${nonce.slice(0, 16)}...`
    )
    return { valid: false, reason: 'nonce 已使用' }
  }

  // 检查 IP 的待处理 nonce 数量上限
  const ipSet = ipNonceIndex.get(ip)
  if (ipSet && ipSet.size >= MAX_NONCE_PER_IP) {
    console.warn(
      `[RequestReplay] IP ${ip} 的 nonce 数量已达上限 (${MAX_NONCE_PER_IP})`
    )
    return { valid: false, reason: 'IP 请求过于频繁' }
  }

  // 存储 nonce
  const expiresAt = now + TIME_WINDOW_MS
  memorySetNonce(nonce, ip, timestamp, expiresAt)
  return { valid: true }
}

/**
 * 手动清理内存中过期的 nonce 记录。
 *
 * @param {number} [maxAgeMs] - 过期阈值（毫秒），默认使用 TIME_WINDOW_MS
 * @returns {number} 清理的 nonce 数量
 */
export function clearExpiredNonces(maxAgeMs = TIME_WINDOW_MS) {
  const now = Date.now()
  let cleanedCount = 0

  for (const [nonce, entry] of memoryNonces) {
    if (now > entry.expiresAt) {
      memoryNonces.delete(nonce)
      const ipSet = ipNonceIndex.get(entry.ip)
      if (ipSet) {
        ipSet.delete(nonce)
        if (ipSet.size === 0) ipNonceIndex.delete(entry.ip)
      }
      cleanedCount++
    }
  }

  if (cleanedCount > 0) {
    console.log(
      `[RequestReplay] 内存清理: 移除 ${cleanedCount} 个过期 nonce, ` +
      `剩余 ${memoryNonces.size} 个, 活跃 IP ${ipNonceIndex.size} 个`
    )
  }

  return cleanedCount
}

/**
 * 获取当前 nonce 存储统计信息（用于监控和调试）。
 *
 * @returns {{ memoryNonceCount: number, ipCount: number, timeWindowMs: number, maxNoncePerIp: number }}
 */
export function getNonceStats() {
  return {
    memoryNonceCount: memoryNonces.size,
    ipCount: ipNonceIndex.size,
    timeWindowMs: TIME_WINDOW_MS,
    maxNoncePerIp: MAX_NONCE_PER_IP,
  }
}

// 每 5 分钟自动清理一次内存中的过期 nonce
setInterval(() => {
  try {
    clearExpiredNonces()
  } catch (err) {
    console.error('[RequestReplay] 定时清理失败:', err.message)
  }
}, CLEANUP_INTERVAL_MS)