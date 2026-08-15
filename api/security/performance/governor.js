// ============================================================
// PerformanceGovernor — 性能调控器
// 职责：
//   1. 监控安全模块的 Map/Set/Array 数据量，防止内存膨胀
//   2. 开发环境自适应降级：减少非关键检查频率、日志量
//   3. 日志熔断：高频重复日志自动合并降频，避免刷屏
//   4. 缓存清理：定期清理过期/无效数据条目
//   5. 提供资源看板数据，集成到安全仪表盘
// 设计原则：
//   - 对现有模块零侵入，通过注册制收集数据
//   - 生产环境仅做监控，不自动降级
//   - 开发环境主动优化，不影响开发体验
// ============================================================

import { logAudit } from '../core/auditLogger.js'

// ===== 配置 =====
const CONFIG = {
  // 清理间隔（毫秒）
  cleanupInterval: Number(process.env.GOVERNOR_CLEANUP_INTERVAL) || 60000, // 1分钟
  // 日志熔断窗口（毫秒）
  logThrottleWindow: Number(process.env.GOVERNOR_LOG_THROTTLE) || 5000,   // 5秒
  // 开发环境最大日志频率（条/分钟）
  devMaxLogRate: Number(process.env.GOVERNOR_DEV_LOG_RATE) || 30,
  // 单次清理最大条目数
  maxCleanupPerCycle: Number(process.env.GOVERNOR_MAX_CLEANUP) || 500,
  // 默认Map最大条目警告阈值
  mapWarnThreshold: Number(process.env.GOVERNOR_MAP_WARN) || 5000,
  // 默认Map最大条目强制清理阈值
  mapHardLimit: Number(process.env.GOVERNOR_MAP_LIMIT) || 10000,
}

// ===== 日志熔断器 =====
const logThrottle = new Map() // "模块:消息" -> { count, firstSeen, lastSeen }
let logCountInWindow = 0
let windowStart = Date.now()

// ===== 注册表 =====
// 所有被监控的数据结构注册到这里
const monitoredResources = new Map() // name -> { type, data, maxSize, cleanupFn, tags }

// ===== 状态快照 =====
let lastSnapshot = {
  resources: [],
  memory: { heapUsed: 0, heapTotal: 0, rss: 0 },
  logStats: { throttled: 0, passed: 0, rate: 0 },
  timestamp: Date.now(),
}

// ===== 清理定时器 =====
let cleanupTimer = null
let isRunning = false

// ============================================================
// 日志熔断
// ============================================================

/**
 * 智能日志输出 — 高频重复日志自动合并降频
 * @param {string} module   模块标识（如 'Security', 'TCP-WAF', 'Captcha'）
 * @param {string} message  日志内容
 * @param {object} [options]
 * @param {string} [options.level]   日志级别: info/warn/error
 * @param {boolean} [options.force]  强制输出，绕过熔断
 * @returns {boolean} 是否已输出
 */
export function throttledLog(module, message, options = {}) {
  const isDev = process.env.NODE_ENV !== 'production'
  const { level = 'info', force = false } = options

  // 生产环境不过滤
  if (!isDev && !force) {
    outputLog(module, message, level)
    return true
  }

  // 重置窗口计数器
  const now = Date.now()
  if (now - windowStart > 10000) {
    logCountInWindow = 0
    windowStart = now
  }

  // 强制输出
  if (force) {
    logCountInWindow++
    outputLog(module, message, level)
    return true
  }

  // 检查速率
  if (logCountInWindow >= CONFIG.devMaxLogRate) {
    // 超限，跳过
    return false
  }

  // 去重：相同模块+消息在窗口内只输出一次
  const key = `${module}:${message.slice(0, 80)}`
  const existing = logThrottle.get(key)
  if (existing && now - existing.firstSeen < CONFIG.logThrottleWindow) {
    existing.count++
    existing.lastSeen = now
    // 每10次输出一次，让用户知道还在发生
    if (existing.count % 10 !== 0) return false
    // 修改消息，显示累积次数
    const mergedMsg = `${message} (×${existing.count})`
    logCountInWindow++
    outputLog(module, mergedMsg, level)
    return true
  }

  // 新消息或窗口已过期
  logThrottle.set(key, { count: 1, firstSeen: now, lastSeen: now })
  logCountInWindow++
  outputLog(module, message, level)

  // 清理过期记录
  if (logThrottle.size > 200) {
    const expire = now - CONFIG.logThrottleWindow * 2
    for (const [k, v] of logThrottle) {
      if (v.lastSeen < expire) logThrottle.delete(k)
    }
  }

  return true
}

function outputLog(module, message, level) {
  const prefix = `\x1b[90m[${module}]\x1b[0m`
  switch (level) {
    case 'error':
      console.error(`  ${prefix} ${message}`)
      break
    case 'warn':
      console.warn(`  ${prefix} \x1b[33m${message}\x1b[0m`)
      break
    default:
      console.log(`  ${prefix} ${message}`)
  }
}

// ============================================================
// 资源注册
// ============================================================

/**
 * 注册一个需要监控的数据结构
 * @param {string} name      资源名称（如 'IPReputation.scores'）
 * @param {string} type      类型: 'map' | 'set' | 'array' | 'object'
 * @param {object} data      数据引用（Map/Set/Array/Object）
 * @param {object} [options]
 * @param {number} [options.maxSize]    警告阈值，默认 5000
 * @param {number} [options.hardLimit]  强制清理阈值，默认 10000
 * @param {function} [options.cleanup]  清理回调: (data, context) => cleanedCount
 * @param {string} [options.tags]       标签，用于分类
 * @param {object} [options.context]    传递给清理回调的上下文
 */
export function registerResource(name, type, data, options = {}) {
  if (monitoredResources.has(name)) return // 不重复注册
  monitoredResources.set(name, {
    type,
    data,
    maxSize: options.maxSize || CONFIG.mapWarnThreshold,
    hardLimit: options.hardLimit || CONFIG.mapHardLimit,
    cleanup: options.cleanup || null,
    tags: options.tags || '',
    context: options.context || null,
    registeredAt: Date.now(),
    peakSize: 0,
    cleanupCount: 0,
  })
}

/**
 * 批量注册一组资源
 */
export function registerResources(resources) {
  for (const r of resources) {
    registerResource(r.name, r.type, r.data, r.options)
  }
}

// ============================================================
// 资源清理
// ============================================================

/**
 * 执行一轮清理
 */
function runCleanup() {
  const now = Date.now()
  let totalCleaned = 0
  const alerts = []

  for (const [name, res] of monitoredResources) {
    if (!res.data) continue

    let size = getSize(res.data, res.type)
    if (size > res.peakSize) res.peakSize = size

    // 超过硬限制，强制清理
    if (size > res.hardLimit && res.cleanup) {
      const cleaned = res.cleanup(res.data, res.context)
      if (cleaned > 0) {
        res.cleanupCount += cleaned
        totalCleaned += cleaned
        size = getSize(res.data, res.type)
        alerts.push({ name, size, cleaned, reason: 'hard_limit' })
      }
    }
    // 超过警告阈值，启动清理
    else if (size > res.maxSize && res.cleanup) {
      const cleaned = res.cleanup(res.data, res.context)
      if (cleaned > 0) {
        res.cleanupCount += cleaned
        totalCleaned += cleaned
        size = getSize(res.data, res.type)
      }
    }
  }

  if (totalCleaned > 0) {
    throttledLog('Governor', `清理完成: 移除了 ${totalCleaned} 条过期数据`, { level: 'info' })
    for (const a of alerts) {
      throttledLog('Governor', `${a.name}: 超过硬限制，清理了 ${a.cleaned} 条 (当前 ${a.size})`, { level: 'warn' })
    }
  }
}

function getSize(data, type) {
  if (!data) return 0
  switch (type) {
    case 'map': return data.size || 0
    case 'set': return data.size || 0
    case 'array': return data.length || 0
    case 'object': return Object.keys(data).length || 0
    default: return 0
  }
}

// ============================================================
// 快照采集
// ============================================================

/**
 * 采集当前资源快照
 */
function takeSnapshot() {
  const mem = process.memoryUsage()
  const resources = []

  for (const [name, res] of monitoredResources) {
    const size = getSize(res.data, res.type)
    resources.push({
      name,
      type: res.type,
      size,
      peakSize: res.peakSize,
      maxSize: res.maxSize,
      hardLimit: res.hardLimit,
      usage: res.maxSize > 0 ? Math.round((size / res.maxSize) * 100) : 0,
      cleanupCount: res.cleanupCount,
      tags: res.tags,
    })
  }

  // 按使用率排序
  resources.sort((a, b) => b.usage - a.usage)

  lastSnapshot = {
    resources,
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
      rss: Math.round(mem.rss / 1024 / 1024 * 10) / 10,
    },
    logStats: {
      throttled: logThrottle.size,
      passed: logCountInWindow,
      rate: CONFIG.devMaxLogRate,
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// 启动/停止
// ============================================================

/**
 * 启动性能调控器
 */
export function startGovernor() {
  if (isRunning) return
  isRunning = true

  const isDev = process.env.NODE_ENV !== 'production'
  const interval = isDev ? Math.min(CONFIG.cleanupInterval, 30000) : CONFIG.cleanupInterval

  throttledLog('Governor', `已启动 (${isDev ? '开发模式' : '生产模式'}, 清理间隔: ${interval / 1000}s)`, { level: 'info', force: true })

  // 定期清理
  cleanupTimer = setInterval(() => {
    runCleanup()
    takeSnapshot()
  }, interval)

  // 首次快照
  takeSnapshot()
}

/**
 * 停止性能调控器
 */
export function stopGovernor() {
  if (!isRunning) return
  isRunning = false
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  throttledLog('Governor', '已停止', { level: 'info', force: true })
}

// ============================================================
// 外部接口
// ============================================================

/**
 * 获取当前资源快照
 */
export function getGovernorSnapshot() {
  takeSnapshot()
  return lastSnapshot
}

/**
 * 获取资源统计摘要
 */
export function getGovernorSummary() {
  takeSnapshot()
  const total = lastSnapshot.resources.length
  const highUsage = lastSnapshot.resources.filter(r => r.usage >= 80).length
  const totalCleanup = lastSnapshot.resources.reduce((s, r) => s + r.cleanupCount, 0)
  return {
    totalResources: total,
    highUsageResources: highUsage,
    totalCleanupCount: totalCleanup,
    memory: lastSnapshot.memory,
    logThrottled: lastSnapshot.logStats.throttled,
    logRate: `${lastSnapshot.logStats.passed}/${lastSnapshot.logStats.rate}`,
    timestamp: lastSnapshot.timestamp,
  }
}

/**
 * 手动触发一轮清理
 */
export function forceCleanup() {
  runCleanup()
  takeSnapshot()
  return { cleaned: true, snapshot: lastSnapshot }
}

/**
 * 获取Governor状态
 */
export function getGovernorStatus() {
  return {
    running: isRunning,
    config: CONFIG,
    monitoredCount: monitoredResources.size,
    ...getGovernorSummary(),
  }
}