// ===== 军工级熔断器和阈值阻断模块 =====
// 用于异常评分真正用于阻断，支持内存存储和 Redis 共享存储

import { BlockList } from '../core/guards.js'
import { isRedisReady, safeRedisOp } from '../../lib/redisClient.js'

// ===== 默认配置 =====
const DEFAULTS = {
  failureThreshold: 0.5,        // 失败率阈值（默认 50%）
  circuitDuration: 30000,       // 熔断持续时间（默认 30 秒）
  halfOpenMaxRequests: 3,       // 半开状态允许的最大请求数（默认 3 个）
  scoreThreshold: 80,           // 异常评分阈值（默认 80）
  blockDuration: 3600000,       // 阈值阻断封禁时长（默认 1 小时）
  windowSize: 60000,            // 统计窗口（默认 1 分钟）
  surgeMultiplier: 3,           // 失败率突增倍数阈值（默认 3 倍）
  surgeLookback: 300000,        // 突增对比窗口（默认 5 分钟）
}

const REDIS_PREFIX = 'circuit_breaker:'

// 内存存储
const circuitStates = new Map()  // ip -> { service -> stateObject }
const circuitStats = new Map()   // ip -> { service -> statsObject }

// 全局配置（允许通过 createCircuitBreaker 覆盖）
let globalOptions = { ...DEFAULTS }

// ===== 内部辅助函数 =====

function getStateKey(ip, service) {
  return `${REDIS_PREFIX}state:${ip}:${service}`
}

function getStatsKey(ip, service) {
  return `${REDIS_PREFIX}stats:${ip}:${service}`
}

function createDefaultState() {
  return {
    state: 'CLOSED',           // CLOSED | OPEN | HALF_OPEN
    failures: 0,
    successes: 0,
    totalRequests: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    tripTime: 0,               // 熔断触发时间
    halfOpenRemaining: 0,      // 半开状态剩余允许请求数
    surgeTripped: false,       // 是否因突增触发
    lastStateChange: Date.now(),
  }
}

function createDefaultStats() {
  return {
    minuteBuckets: [],         // [{timestamp, failures, successes}]
  }
}

function isRedisStore() {
  return isRedisReady()
}

// ===== 状态持久化 =====

async function loadState(ip, service) {
  if (isRedisStore()) {
    const key = getStateKey(ip, service)
    const raw = await safeRedisOp(c => c.get(key), null)
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch {}
    }
    return createDefaultState()
  }

  // 内存模式
  if (!circuitStates.has(ip)) {
    circuitStates.set(ip, new Map())
  }
  const ipMap = circuitStates.get(ip)
  if (!ipMap.has(service)) {
    ipMap.set(service, createDefaultState())
  }
  return ipMap.get(service)
}

async function saveState(ip, service, state) {
  if (isRedisStore()) {
    const key = getStateKey(ip, service)
    // 保存状态，TTL 设为熔断持续时间的 2 倍以防止过早过期
    const ttl = Math.ceil((globalOptions.circuitDuration * 2) / 1000)
    await safeRedisOp(c => c.setEx(key, ttl, JSON.stringify(state)))
    return
  }

  // 内存模式
  if (!circuitStates.has(ip)) {
    circuitStates.set(ip, new Map())
  }
  circuitStates.get(ip).set(service, state)
}

async function loadStats(ip, service) {
  if (isRedisStore()) {
    const key = getStatsKey(ip, service)
    const raw = await safeRedisOp(c => c.get(key), null)
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch {}
    }
    return createDefaultStats()
  }

  if (!circuitStats.has(ip)) {
    circuitStats.set(ip, new Map())
  }
  const ipMap = circuitStats.get(ip)
  if (!ipMap.has(service)) {
    ipMap.set(service, createDefaultStats())
  }
  return ipMap.get(service)
}

async function saveStats(ip, service, stats) {
  if (isRedisStore()) {
    const key = getStatsKey(ip, service)
    const ttl = 600 // 保留 10 分钟统计
    await safeRedisOp(c => c.setEx(key, ttl, JSON.stringify(stats)))
    return
  }

  if (!circuitStats.has(ip)) {
    circuitStats.set(ip, new Map())
  }
  circuitStats.get(ip).set(service, stats)
}

function updateMinuteBuckets(stats, isSuccess) {
  const now = Date.now()
  const bucketKey = Math.floor(now / 60000) * 60000 // 按分钟对齐

  // 清理 10 分钟之前的桶
  const cutoff = now - 600000
  stats.minuteBuckets = stats.minuteBuckets.filter(b => b.timestamp >= cutoff)

  // 找到或创建当前分钟桶
  let currentBucket = stats.minuteBuckets.find(b => b.timestamp === bucketKey)
  if (!currentBucket) {
    currentBucket = { timestamp: bucketKey, failures: 0, successes: 0 }
    stats.minuteBuckets.push(currentBucket)
  }

  if (isSuccess) {
    currentBucket.successes++
  } else {
    currentBucket.failures++
  }
}

async function checkSurge(ip, service, state) {
  // 如果已经熔断或半开，不再重复检测
  if (state.state !== 'CLOSED') return

  const stats = await loadStats(ip, service)
  if (!stats || stats.minuteBuckets.length < 2) return

  const now = Date.now()

  // 当前 1 分钟窗口的失败率
  const oneMinAgo = now - 60000
  const recentBuckets = stats.minuteBuckets.filter(b => b.timestamp >= oneMinAgo)
  const recentFailures = recentBuckets.reduce((sum, b) => sum + b.failures, 0)
  const recentTotal = recentBuckets.reduce((sum, b) => sum + b.failures + b.successes, 0)
  const currentRate = recentTotal > 0 ? recentFailures / recentTotal : 0

  // 5 分钟前的失败率
  const fiveMinAgo = now - 300000
  const oldBuckets = stats.minuteBuckets.filter(
    b => b.timestamp < oneMinAgo && b.timestamp >= fiveMinAgo
  )
  const oldFailures = oldBuckets.reduce((sum, b) => sum + b.failures, 0)
  const oldTotal = oldBuckets.reduce((sum, b) => sum + b.failures + b.successes, 0)
  const oldRate = oldTotal > 0 ? oldFailures / oldTotal : 0.001 // 避免除零

  // 突增检测：当前失败率 >= 旧失败率 * 突增倍数，且当前失败率有一个合理的最低值
  if (oldRate > 0 && currentRate >= oldRate * globalOptions.surgeMultiplier && currentRate > 0.1) {
    state.state = 'OPEN'
    state.tripTime = now
    state.lastStateChange = now
    state.surgeTripped = true
    await saveState(ip, service, state)
  }
}

// ===== 导出函数 =====

/**
 * 创建熔断器实例，可自定义选项覆盖默认配置
 *
 * @param {Object} options
 * @param {number} options.failureThreshold - 失败率阈值（默认 0.5）
 * @param {number} options.circuitDuration - 熔断持续时间，毫秒（默认 30000）
 * @param {number} options.halfOpenMaxRequests - 半开状态允许的最大请求数（默认 3）
 * @param {number} options.scoreThreshold - 异常评分阈值（默认 80）
 * @param {number} options.blockDuration - 阈值阻断封禁时长，毫秒（默认 3600000）
 * @param {number} options.surgeMultiplier - 失败率突增倍数阈值（默认 3）
 * @param {number} options.surgeLookback - 突增对比窗口，毫秒（默认 300000）
 */
export function createCircuitBreaker(options = {}) {
  const opts = { ...DEFAULTS, ...options }
  globalOptions = { ...globalOptions, ...opts }
  return {
    recordFailure: (ip, service) => recordFailure(ip, service),
    recordSuccess: (ip, service) => recordSuccess(ip, service),
    getCircuitState: (ip, service) => getCircuitState(ip, service),
    evaluateThresholdBlock: (ip, score) => evaluateThresholdBlock(ip, score),
    getCircuitBreakerStats: (ip) => getCircuitBreakerStats(ip),
    options: opts,
  }
}

/**
 * 记录失败
 * - 更新失败计数和滑动窗口
 * - 检查失败率是否超过阈值，触发熔断
 * - 半开状态下的失败直接重新熔断
 *
 * @param {string} ip - 客户端 IP
 * @param {string} [service='default'] - 服务/接口标识
 * @returns {Promise<{tripped: boolean, state: string, reason?: string, failureRate?: number}>}
 */
export async function recordFailure(ip, service = 'default') {
  const state = await loadState(ip, service)

  state.failures++
  state.totalRequests++
  state.lastFailureTime = Date.now()

  // 更新分钟级滑动窗口
  const stats = await loadStats(ip, service)
  updateMinuteBuckets(stats, false)
  await saveStats(ip, service, stats)

  // 计算当前失败率
  const failureRate = state.failures / Math.max(state.totalRequests, 1)

  // 状态机转换
  if (state.state === 'HALF_OPEN') {
    state.halfOpenRemaining--
    // 半开状态失败，重新熔断
    state.state = 'OPEN'
    state.tripTime = Date.now()
    state.lastStateChange = Date.now()
    state.surgeTripped = false
    await saveState(ip, service, state)
    return { tripped: true, state: 'OPEN', reason: 'half_open_failure', failureRate }
  }

  // 失败率超过阈值 → 熔断
  if (failureRate >= globalOptions.failureThreshold && state.state === 'CLOSED') {
    state.state = 'OPEN'
    state.tripTime = Date.now()
    state.lastStateChange = Date.now()
    state.surgeTripped = false
    await saveState(ip, service, state)
    return { tripped: true, state: 'OPEN', reason: 'failure_rate_exceeded', failureRate }
  }

  await saveState(ip, service, state)
  return { tripped: false, state: state.state, failureRate }
}

/**
 * 记录成功
 * - 更新成功计数和滑动窗口
 * - 半开状态下的成功达到阈值则关闭熔断器
 *
 * @param {string} ip - 客户端 IP
 * @param {string} [service='default'] - 服务/接口标识
 * @returns {Promise<{state: string}>}
 */
export async function recordSuccess(ip, service = 'default') {
  const state = await loadState(ip, service)

  state.successes++
  state.totalRequests++
  state.lastSuccessTime = Date.now()

  // 更新分钟级滑动窗口
  const stats = await loadStats(ip, service)
  updateMinuteBuckets(stats, true)
  await saveStats(ip, service, stats)

  if (state.state === 'HALF_OPEN') {
    state.halfOpenRemaining--
    // 半开状态成功，半开剩余用尽则关闭熔断器
    if (state.halfOpenRemaining <= 0) {
      state.state = 'CLOSED'
      state.failures = 0
      state.successes = 0
      state.totalRequests = 0
      state.lastStateChange = Date.now()
    }
  }

  await saveState(ip, service, state)
  return { state: state.state }
}

/**
 * 获取熔断状态
 * - 熔断超时后自动进入半开状态
 * - 自动检测失败率突增并触发熔断
 *
 * @param {string} ip - 客户端 IP
 * @param {string} [service='default'] - 服务/接口标识
 * @returns {Promise<Object>} 熔断状态详情
 */
export async function getCircuitState(ip, service = 'default') {
  const state = await loadState(ip, service)
  const now = Date.now()

  // 如果熔断已超时，进入半开状态
  if (state.state === 'OPEN' && now - state.tripTime >= globalOptions.circuitDuration) {
    state.state = 'HALF_OPEN'
    state.halfOpenRemaining = globalOptions.halfOpenMaxRequests
    state.lastStateChange = now
    await saveState(ip, service, state)
  }

  // 军工级：检测失败率突增
  await checkSurge(ip, service, state)

  return {
    state: state.state,
    ip,
    service,
    failures: state.failures,
    successes: state.successes,
    totalRequests: state.totalRequests,
    failureRate: state.totalRequests > 0
      ? (state.failures / state.totalRequests).toFixed(4)
      : '0.0000',
    tripTime: state.tripTime,
    remainingHalfOpen: state.halfOpenRemaining,
    surgeTripped: state.surgeTripped,
    lastStateChange: state.lastStateChange,
    circuitDuration: globalOptions.circuitDuration,
  }
}

/**
 * 评估是否触发阈值阻断
 * - 异常评分超过阈值则直接加入 BlockList
 * - 同时记录一次熔断失败
 *
 * @param {string} ip - 客户端 IP
 * @param {number} score - 异常评分
 * @returns {Promise<{blocked: boolean, reason?: string, score: number, threshold: number}>}
 */
export async function evaluateThresholdBlock(ip, score) {
  if (score >= globalOptions.scoreThreshold) {
    BlockList.add(ip, globalOptions.blockDuration)
    // 同时也触发熔断记录
    await recordFailure(ip, 'threshold_block')
    return {
      blocked: true,
      reason: `异常评分 ${score} 超过阈值 ${globalOptions.scoreThreshold}`,
      score,
      threshold: globalOptions.scoreThreshold,
    }
  }
  return { blocked: false, score, threshold: globalOptions.scoreThreshold }
}

/**
 * 获取熔断器统计信息
 *
 * @param {string} ip - 客户端 IP
 * @returns {Promise<{ip: string, services: Object, timestamp: number}>}
 */
export async function getCircuitBreakerStats(ip) {
  if (isRedisStore()) {
    // 从 Redis 获取该 IP 的所有服务状态
    const pattern = `${REDIS_PREFIX}state:${ip}:*`
    const keys = await safeRedisOp(c => c.keys(pattern), [])
    const services = {}
    for (const key of keys) {
      const raw = await safeRedisOp(c => c.get(key), null)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          const service = key.split(':').slice(3).join(':') || 'default'
          services[service] = parsed
        } catch {}
      }
    }
    return { ip, services, timestamp: Date.now() }
  }

  // 内存模式
  const ipStates = circuitStates.get(ip)
  if (!ipStates) return { ip, services: {}, timestamp: Date.now() }

  const services = {}
  for (const [service, state] of ipStates) {
    services[service] = { ...state }
  }
  return { ip, services, timestamp: Date.now() }
}