// ============================================================
// ResourceShield — 资源护盾
// 职责：集中防御资源耗尽类攻击（DoS）
//   1. BodyGuard  — 请求体大小 + 字段级长度检查
//   2. ConnGuard  — 并发连接追踪 + 慢速连接检测
//   3. TimeoutGuard — 请求超时管理
//   4. RateGuard  — IP级速率控制 + 全局速率保护
//   5. Stats      — 提供实时状态数据给仪表盘
// 设计原则：
//   - 所有防御动作均有清晰日志输出，用户可直观看到防护过程
//   - 与 PerformanceGovernor 协同：Governor 管"内部清理"，Shield 管"外部防御"
//   - 零侵入：通过 Express 中间件接入，不影响现有路由逻辑
// ============================================================

import { getClientIP } from '../core/auditLogger.js'

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  // --- BodyGuard ---
  bodyLimit: 256 * 1024,           // 请求体最大 256KB
  fieldMaxLength: 4096,            // 单个字段最大 4KB
  fieldMaxDepth: 8,                // 嵌套对象最大深度

  // --- ConnGuard ---
  connMaxPerIP: 50,                // 单 IP 最大并发连接数
  connMaxTotal: 500,               // 全局最大并发连接数
  slowRequestThreshold: 10000,     // 慢请求阈值（毫秒），超过即记录
  slowRequestMaxPerIP: 5,          // 单 IP 慢请求数上限，超过则临时封禁

  // --- TimeoutGuard ---
  requestTimeout: 15000,           // 请求超时 15s
  headersTimeout: 10000,           // 请求头超时 10s

  // --- RateGuard ---
  globalRateLimit: 1000,           // 全局每秒最大请求数
  ipRateLimit: 100,                // 单 IP 每秒最大请求数
  ipBurstLimit: 30,                // 单 IP 突发请求数（短时间窗口）
  burstWindow: 2000,               // 突发窗口（毫秒）

  // --- IP封禁 ---
  ipBanDuration: 60000,            // 临时封禁时长（毫秒）
  ipBanThreshold: 10,              // 触发封禁的违规次数
}

// ============================================================
// 状态跟踪
// ============================================================

// 连接追踪
const ipConnections = new Map()     // ip -> Set<requestId>
let totalConnections = 0

// 慢请求追踪
const slowRequestCount = new Map()  // ip -> [{startTime, path}]

// IP 速率追踪
const ipRequestCount = new Map()    // ip -> {count, windowStart}
const ipBurstCount = new Map()      // ip -> {count, windowStart}

// 全局速率追踪
let globalRequestCount = 0
let globalWindowStart = Date.now()

// IP 封禁列表
const bannedIPs = new Map()         // ip -> {until, violations}

// 违规统计
const violationStats = new Map()    // ip -> {fieldCount, bodyCount, timeoutCount, slowCount, rateCount, connCount}

// 总统计
const stats = {
  totalBlocked: 0,
  totalMonitored: 0,
  violationsByType: { field_too_large: 0, body_too_large: 0, request_timeout: 0, 
                       slow_request: 0, rate_limited: 0, conn_limit: 0, ip_banned: 0 },
  peakConcurrentConnections: 0,
  startTime: Date.now(),
}

// 请求 ID 生成器
let requestIdCounter = 0
function nextRequestId() {
  return `req_${++requestIdCounter}_${Date.now().toString(36)}`
}

// ============================================================
// 辅助函数
// ============================================================

function getOrInitMap(map, key, initFn) {
  let v = map.get(key)
  if (!v) {
    v = initFn()
    map.set(key, v)
  }
  return v
}

function getOrInitViolation(ip) {
  return getOrInitMap(violationStats, ip, () => ({
    fieldCount: 0, bodyCount: 0, timeoutCount: 0,
    slowCount: 0, rateCount: 0, connCount: 0,
  }))
}

function isIPBanned(ip) {
  const ban = bannedIPs.get(ip)
  if (!ban) return false
  if (Date.now() > ban.until) {
    bannedIPs.delete(ip)
    return false
  }
  return true
}

function banIP(ip, reason) {
  const v = getOrInitViolation(ip)
  const banUntil = Date.now() + CONFIG.ipBanDuration
  bannedIPs.set(ip, { until: banUntil, violations: v })
  const time = new Date().toLocaleTimeString('zh-CN')
  console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[31mIP封禁\x1b[0m  ${time}`)
  console.log(`  IP: ${ip}  |  原因: ${reason}  |  时长: ${CONFIG.ipBanDuration / 1000}s`)
  console.log(`  违规统计: 字段=${v.fieldCount} body=${v.bodyCount} 超时=${v.timeoutCount} 慢=${v.slowCount} 速率=${v.rateCount} 连接=${v.connCount}`)
  stats.totalBlocked++
  // 清理该 IP 的速率记录
  ipRequestCount.delete(ip)
  ipBurstCount.delete(ip)
}

// ============================================================
// 1. BodyGuard — 请求体 + 字段检查
// ============================================================

/**
 * 检查嵌套对象深度
 */
function getObjectDepth(obj, currentDepth = 0) {
  if (currentDepth > CONFIG.fieldMaxDepth) return currentDepth
  if (obj === null || typeof obj !== 'object') return currentDepth
  let maxDepth = currentDepth
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      maxDepth = Math.max(maxDepth, getObjectDepth(val, currentDepth + 1))
    }
  }
  return maxDepth
}

/**
 * BodyGuard 中间件 — 检查字段长度和对象深度
 */
export function bodyGuardMiddleware(req, res, next) {
  const ip = getClientIP(req)
  stats.totalMonitored++

  // 检查 IP 封禁
  if (isIPBanned(ip)) {
    stats.violationsByType.ip_banned++
    return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试', code: 'IP_BANNED' })
  }

  // 只有 POST/PUT/PATCH 才检查 body
  if (!['POST', 'PUT', 'PATCH'].includes(req.method) || !req.body || typeof req.body !== 'object') {
    next()
    return
  }

  // 检查字段长度
  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value === 'string' && value.length > CONFIG.fieldMaxLength) {
      const v = getOrInitViolation(ip)
      v.fieldCount++
      stats.violationsByType.field_too_large++
      stats.totalBlocked++

      const time = new Date().toLocaleTimeString('zh-CN')
      console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[33m字段超长\x1b[0m  ${time}`)
      console.log(`  路径: ${req.method} ${req.path}  |  IP: ${ip}`)
      console.log(`  字段: ${key} = ${value.length} 字符 (上限 ${CONFIG.fieldMaxLength})`)

      // 检查是否触发封禁
      if (v.fieldCount >= CONFIG.ipBanThreshold) {
        banIP(ip, `字段超长违规 ${v.fieldCount} 次`)
      }

      return res.status(413).json({ success: false, message: '请求字段过长', code: 'FIELD_TOO_LARGE' })
    }
  }

  // 检查对象深度（防止递归嵌套攻击）
  const depth = getObjectDepth(req.body)
  if (depth > CONFIG.fieldMaxDepth) {
    stats.violationsByType.field_too_large++
    stats.totalBlocked++
    const time = new Date().toLocaleTimeString('zh-CN')
    console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[33m嵌套过深\x1b[0m  ${time}`)
    console.log(`  路径: ${req.method} ${req.path}  |  IP: ${ip}`)
    console.log(`  深度: ${depth} 层 (上限 ${CONFIG.fieldMaxDepth})`)
    return res.status(413).json({ success: false, message: '请求体嵌套过深', code: 'BODY_TOO_DEEP' })
  }

  next()
}

// ============================================================
// 2. ConnGuard — 连接追踪 + 慢速攻击检测
// ============================================================

/**
 * ConnGuard 中间件 — 追踪并发连接数，检测慢速攻击
 */
export function connGuardMiddleware(req, res, next) {
  const ip = getClientIP(req)
  const requestId = nextRequestId()
  const startTime = Date.now()

  // 关联请求ID到响应对象，用于清理
  req._shieldRequestId = requestId
  req._shieldStartTime = startTime

  // --- 并发连接检查 ---
  let conns = ipConnections.get(ip)
  if (!conns) {
    conns = new Set()
    ipConnections.set(ip, conns)
  }
  conns.add(requestId)
  totalConnections++

  // 更新峰值
  if (totalConnections > stats.peakConcurrentConnections) {
    stats.peakConcurrentConnections = totalConnections
  }

  // 单 IP 连接数超限
  if (conns.size > CONFIG.connMaxPerIP) {
    conns.delete(requestId)
    totalConnections--
    const v = getOrInitViolation(ip)
    v.connCount++
    stats.violationsByType.conn_limit++
    stats.totalBlocked++

    const time = new Date().toLocaleTimeString('zh-CN')
    console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[33m连接超限\x1b[0m  ${time}`)
    console.log(`  IP: ${ip}  |  路径: ${req.method} ${req.path}`)
    console.log(`  当前连接: ${conns.size} (上限 ${CONFIG.connMaxPerIP})`)

    if (v.connCount >= CONFIG.ipBanThreshold) {
      banIP(ip, `连接超限违规 ${v.connCount} 次`)
    }

    return res.status(429).json({ success: false, message: '连接数过多，请稍后再试', code: 'CONNECTION_LIMIT' })
  }

  // 全局连接数超限
  if (totalConnections > CONFIG.connMaxTotal) {
    conns.delete(requestId)
    totalConnections--
    stats.violationsByType.conn_limit++
    stats.totalBlocked++
    const time = new Date().toLocaleTimeString('zh-CN')
    console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[31m全局连接超限\x1b[0m  ${time}`)
    console.log(`  当前连接: ${totalConnections} (上限 ${CONFIG.connMaxTotal})`)
    return res.status(503).json({ success: false, message: '服务器繁忙，请稍后再试', code: 'SERVER_BUSY' })
  }

  // --- 请求完成/关闭时清理 ---
  const cleanup = () => {
    const c = ipConnections.get(ip)
    if (c) {
      c.delete(requestId)
      if (c.size === 0) ipConnections.delete(ip)
    }
    totalConnections--
    res.removeListener('finish', cleanup)
    res.removeListener('close', cleanup)
  }
  res.on('finish', cleanup)
  res.on('close', cleanup)

  // --- 慢速攻击检测 ---
  // 在响应结束时检查耗时
  const checkSlowRequest = () => {
    const duration = Date.now() - startTime
    if (duration > CONFIG.slowRequestThreshold) {
      const slowIPs = getOrInitMap(slowRequestCount, ip, () => [])
      slowIPs.push({ startTime, path: req.path, duration })
      // 只保留最近 10 条记录
      if (slowIPs.length > 10) slowIPs.shift()

      // 如果慢请求数超限，触发封禁
      if (slowIPs.length > CONFIG.slowRequestMaxPerIP) {
        const v = getOrInitViolation(ip)
        v.slowCount++
        stats.violationsByType.slow_request++

        const time = new Date().toLocaleTimeString('zh-CN')
        console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[33m慢速攻击\x1b[0m  ${time}`)
        console.log(`  IP: ${ip}  |  路径: ${req.method} ${req.path}`)
        console.log(`  耗时: ${duration}ms  |  累计慢请求: ${slowIPs.length}`)

        if (v.slowCount >= CONFIG.ipBanThreshold) {
          banIP(ip, `慢速攻击违规 ${v.slowCount} 次`)
        }
      }
    }
  }
  res.on('finish', checkSlowRequest)
  res.on('close', checkSlowRequest)

  next()
}

// ============================================================
// 3. RateGuard — 速率控制
// ============================================================

/**
 * RateGuard 中间件 — IP 级别 + 全局速率控制
 */
export function rateGuardMiddleware(req, res, next) {
  const ip = getClientIP(req)
  const now = Date.now()

  // 检查 IP 封禁
  if (isIPBanned(ip)) {
    stats.violationsByType.ip_banned++
    return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试', code: 'IP_BANNED' })
  }

  // --- 全局速率限制 ---
  if (now - globalWindowStart > 1000) {
    globalRequestCount = 0
    globalWindowStart = now
  }
  globalRequestCount++
  if (globalRequestCount > CONFIG.globalRateLimit) {
    stats.violationsByType.rate_limited++
    stats.totalBlocked++
    const time = new Date().toLocaleTimeString('zh-CN')
    console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[31m全局速率超限\x1b[0m  ${time}`)
    console.log(`  当前速率: ${globalRequestCount}/s (上限 ${CONFIG.globalRateLimit}/s)`)
    return res.status(503).json({ success: false, message: '服务器繁忙，请稍后再试', code: 'GLOBAL_RATE_LIMIT' })
  }

  // --- IP 速率限制 ---
  const ipRate = getOrInitMap(ipRequestCount, ip, () => ({ count: 0, windowStart: now }))
  if (now - ipRate.windowStart > 1000) {
    ipRate.count = 0
    ipRate.windowStart = now
  }
  ipRate.count++
  if (ipRate.count > CONFIG.ipRateLimit) {
    const v = getOrInitViolation(ip)
    v.rateCount++
    stats.violationsByType.rate_limited++
    stats.totalBlocked++

    const time = new Date().toLocaleTimeString('zh-CN')
    console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[33mIP速率超限\x1b[0m  ${time}`)
    console.log(`  IP: ${ip}  |  路径: ${req.method} ${req.path}`)
    console.log(`  速率: ${ipRate.count}/s (上限 ${CONFIG.ipRateLimit}/s)`)

    if (v.rateCount >= CONFIG.ipBanThreshold) {
      banIP(ip, `速率超限违规 ${v.rateCount} 次`)
    }

    return res.status(429).json({ success: false, message: '请求过于频繁', code: 'RATE_LIMITED' })
  }

  // --- IP 突发检测 ---
  const ipBurst = getOrInitMap(ipBurstCount, ip, () => ({ count: 0, windowStart: now }))
  if (now - ipBurst.windowStart > CONFIG.burstWindow) {
    ipBurst.count = 0
    ipBurst.windowStart = now
  }
  ipBurst.count++
  if (ipBurst.count > CONFIG.ipBurstLimit) {
    const v = getOrInitViolation(ip)
    v.rateCount++
    stats.violationsByType.rate_limited++
    stats.totalBlocked++

    const time = new Date().toLocaleTimeString('zh-CN')
    console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[33m突发请求\x1b[0m  ${time}`)
    console.log(`  IP: ${ip}  |  路径: ${req.method} ${req.path}`)
    console.log(`  突发: ${ipBurst.count}/${CONFIG.burstWindow}ms (上限 ${CONFIG.ipBurstLimit})`)

    return res.status(429).json({ success: false, message: '请求过于频繁', code: 'BURST_LIMITED' })
  }

  next()
}

// ============================================================
// 4. TimeoutGuard — 请求超时中间件
// ============================================================

/**
 * TimeoutGuard 中间件 — 请求超时自动断开
 */
export function timeoutGuardMiddleware(req, res, next) {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      const ip = getClientIP(req)
      const v = getOrInitViolation(ip)
      v.timeoutCount++
      stats.violationsByType.request_timeout++
      stats.totalBlocked++

      const time = new Date().toLocaleTimeString('zh-CN')
      console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[31m请求超时\x1b[0m  ${time}`)
      console.log(`  IP: ${ip}  |  路径: ${req.method} ${req.path}`)
      console.log(`  超时: ${CONFIG.requestTimeout / 1000}s`)

      res.status(408).json({ success: false, message: '请求超时', code: 'REQUEST_TIMEOUT' })
    }
    req.destroy()
  }, CONFIG.requestTimeout)

  res.on('finish', () => clearTimeout(timer))
  res.on('close', () => clearTimeout(timer))
  next()
}

// ============================================================
// 5. BodyParser 413 错误处理
// ============================================================

/**
 * BodyParser 413 错误处理中间件
 */
export function bodyParserErrorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large') {
    const ip = getClientIP(req)
    const v = getOrInitViolation(ip)
    v.bodyCount++
    stats.violationsByType.body_too_large++
    stats.totalBlocked++

    const time = new Date().toLocaleTimeString('zh-CN')
    console.log(`\n\x1b[41m\x1b[37m ■ 资源护盾 \x1b[0m \x1b[31m请求体过大\x1b[0m  ${time}`)
    console.log(`  路径: ${req.method} ${req.path}  |  IP: ${ip}`)
    console.log(`  请求体超过 256KB 限制`)

    if (v.bodyCount >= CONFIG.ipBanThreshold) {
      banIP(ip, `请求体过大违规 ${v.bodyCount} 次`)
    }

    return res.status(413).json({ success: false, message: '请求体过大', code: 'BODY_TOO_LARGE' })
  }
  next(err)
}

// ============================================================
// 6. 统计与状态
// ============================================================

/**
 * 获取资源护盾状态
 */
export function getResourceShieldStatus() {
  const now = Date.now()
  return {
    enabled: true,
    uptime: Math.round((now - stats.startTime) / 1000),
    config: {
      bodyLimit: `${CONFIG.bodyLimit / 1024}KB`,
      fieldMaxLength: CONFIG.fieldMaxLength,
      connMaxPerIP: CONFIG.connMaxPerIP,
      connMaxTotal: CONFIG.connMaxTotal,
      requestTimeout: `${CONFIG.requestTimeout / 1000}s`,
      globalRateLimit: `${CONFIG.globalRateLimit}/s`,
      ipRateLimit: `${CONFIG.ipRateLimit}/s`,
    },
    stats: {
      totalBlocked: stats.totalBlocked,
      totalMonitored: stats.totalMonitored,
      peakConcurrentConnections: stats.peakConcurrentConnections,
      currentConnections: totalConnections,
      violationsByType: { ...stats.violationsByType },
    },
    ipBans: {
      currentBanned: bannedIPs.size,
      bannedList: Array.from(bannedIPs.entries()).map(([ip, ban]) => ({
        ip,
        remaining: Math.max(0, Math.round((ban.until - now) / 1000)),
        violations: ban.violations,
      })),
    },
    topViolators: Array.from(violationStats.entries())
      .map(([ip, v]) => ({
        ip,
        total: v.fieldCount + v.bodyCount + v.timeoutCount + v.slowCount + v.rateCount + v.connCount,
        details: v,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    timestamp: new Date().toISOString(),
  }
}

/**
 * 获取资源护盾简明摘要
 */
export function getResourceShieldSummary() {
  return {
    totalBlocked: stats.totalBlocked,
    totalMonitored: stats.totalMonitored,
    currentConnections: totalConnections,
    peakConcurrentConnections: stats.peakConcurrentConnections,
    bannedIPs: bannedIPs.size,
    violationsByType: stats.violationsByType,
    uptime: Math.round((Date.now() - stats.startTime) / 1000),
  }
}

/**
 * 清理过期数据（供 PerformanceGovernor 调用）
 */
export function cleanupResourceShield() {
  const now = Date.now()
  let cleaned = 0

  // 清理过期封禁
  for (const [ip, ban] of bannedIPs) {
    if (now > ban.until) {
      bannedIPs.delete(ip)
      cleaned++
    }
  }

  // 清理过期违规记录（超过30分钟无活动的）
  const expireTime = now - 30 * 60 * 1000
  for (const [ip, v] of violationStats) {
    // 如果该 IP 没有任何连接和速率记录，且违规数很少，清理
    if (!ipConnections.has(ip) && !ipRequestCount.has(ip)) {
      const total = v.fieldCount + v.bodyCount + v.timeoutCount + v.slowCount + v.rateCount + v.connCount
      if (total === 0) {
        violationStats.delete(ip)
        cleaned++
      }
    }
  }

  return cleaned
}

// ============================================================
// 初始化日志
// ============================================================

const initTime = new Date().toLocaleTimeString('zh-CN')
console.log(`\n\x1b[42m\x1b[30m ■ 资源护盾 \x1b[0m 已加载  ${initTime}`)
console.log(`  BodyGuard:  ${CONFIG.bodyLimit / 1024}KB / 字段 ${CONFIG.fieldMaxLength}字符`)
console.log(`  ConnGuard:  ${CONFIG.connMaxPerIP}/IP · ${CONFIG.connMaxTotal} 全局`)
console.log(`  RateGuard:  ${CONFIG.ipRateLimit}/s per IP · ${CONFIG.globalRateLimit}/s 全局`)
console.log(`  Timeout:    ${CONFIG.requestTimeout / 1000}s`)
console.log(`  IP封禁:     ${CONFIG.ipBanDuration / 1000}s · ${CONFIG.ipBanThreshold}次违规触发`)