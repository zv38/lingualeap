// ===== 军工级安全事件自动化响应引擎 =====
// 基于事件类型和严重程度自动执行响应策略，支持自定义策略配置

import { BlockList } from '../core/guards.js'
import { recordFailure } from './circuitBreaker.js'
import { logAudit } from '../core/auditLogger.js'

// ===== 默认常量 =====

const ONE_MINUTE = 60 * 1000
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR

// ===== 内存统计 =====

const stats = {
  totalEvents: 0,
  actions: {
    blockIp: 0,
    triggerCircuitBreaker: 0,
    notifyAdmin: 0,
    logEvent: 0,
    escalateToAdmin: 0,
    recordFailure: 0,
  },
  blockedIps: new Set(),
  strategyHits: {},        // eventType -> count
  failureRecords: {},      // ip -> { count, firstSeen, lastSeen }
}

// ===== 响应动作 =====

/**
 * 封禁 IP
 * @param {string} ip - 客户端 IP
 * @param {number} duration - 封禁时长（毫秒）
 */
function blockIp(ip, duration) {
  BlockList.add(ip, duration)
  stats.actions.blockIp++
  stats.blockedIps.add(ip)
}

/**
 * 触发熔断器
 * @param {string} ip - 客户端 IP
 * @param {string} [service='auto_response'] - 服务标识
 */
async function triggerCircuitBreaker(ip, service = 'auto_response') {
  await recordFailure(ip, service)
  stats.actions.triggerCircuitBreaker++
}

/**
 * 通知管理员（控制台告警，生产环境可扩展为 Webhook/邮件）
 * @param {Object} event - 安全事件
 */
function notifyAdmin(event) {
  const timestamp = new Date().toISOString()
  console.error(
    `[SECURITY_ALERT] ${timestamp} | 事件类型: ${event.type} | 严重程度: ${event.severity} | IP: ${event.ip || 'unknown'} | 消息: ${event.message || '无详情'}`
  )
  stats.actions.notifyAdmin++
}

/**
 * 记录审计日志
 * @param {Object} event - 安全事件
 */
function logEvent(event) {
  logAudit({
    action: `AUTO_RESPONSE:${event.type}`,
    ip: event.ip || 'unknown',
    details: {
      type: event.type,
      severity: event.severity,
      message: event.message,
      strategy: event._matchedStrategy,
      ...event.details,
    },
  })
  stats.actions.logEvent++
}

/**
 * 升级处理：需要人工介入
 * @param {Object} event - 安全事件
 */
function escalateToAdmin(event) {
  const timestamp = new Date().toISOString()
  console.error(
    `[ESCALATION] ${timestamp} | 事件类型: ${event.type} | 严重程度: ${event.severity} | IP: ${event.ip || 'unknown'} | 需要人工介入！`
  )
  stats.actions.escalateToAdmin++
}

/**
 * 记录失败计数（用于累计阈值判断）
 * @param {string} ip - 客户端 IP
 * @returns {{ count: number }} 当前累计失败次数
 */
function recordFailureCount(ip) {
  const now = Date.now()
  if (!stats.failureRecords[ip]) {
    stats.failureRecords[ip] = { count: 0, firstSeen: now, lastSeen: now }
  }
  const rec = stats.failureRecords[ip]
  rec.count++
  rec.lastSeen = now
  stats.actions.recordFailure++
  return { count: rec.count }
}

/**
 * 清理过期的失败记录
 * @param {number} maxAge - 最大保留时长（毫秒）
 */
function cleanExpiredFailureRecords(maxAge = ONE_HOUR) {
  const now = Date.now()
  const cutoff = now - maxAge
  for (const [ip, rec] of Object.entries(stats.failureRecords)) {
    if (rec.lastSeen < cutoff) {
      delete stats.failureRecords[ip]
    }
  }
}

// 定时清理过期失败记录（每 5 分钟）
setInterval(() => cleanExpiredFailureRecords(ONE_HOUR), 5 * ONE_MINUTE)

// ===== 预定义响应策略 =====

const DEFAULT_STRATEGIES = {

  SOURCE_CODE_EXPOSED: {
    severity: 'critical',
    actions: [
      { type: 'blockIp', params: { duration: ONE_DAY } },
      { type: 'notifyAdmin' },
    ],
  },

  BRUTE_FORCE_ATTEMPT: {
    severity: 'high',
    actions: [
      { type: 'blockIp', params: { duration: ONE_HOUR } },
      { type: 'triggerCircuitBreaker' },
    ],
  },

  CSRF_BLOCKED: {
    severity: 'warning',
    actions: [
      {
        type: 'recordFailure',
        params: { threshold: 3, duration: 30 * ONE_MINUTE, onExceed: 'blockIp' },
      },
    ],
  },

  PROMPT_INJECTION: {
    severity: 'high',
    actions: [
      { type: 'recordFailure' },
      { type: 'triggerCircuitBreaker' },
    ],
  },

  REPLAY_ATTACK: {
    severity: 'medium',
    actions: [
      {
        type: 'recordFailure',
        params: { threshold: 5, duration: ONE_HOUR, onExceed: 'blockIp' },
      },
    ],
  },

  BLACKLISTED_HEADER: {
    severity: 'high',
    actions: [
      { type: 'blockIp', params: { duration: ONE_HOUR } },
      { type: 'notifyAdmin' },
    ],
  },

  RATE_LIMIT_EXCEEDED: {
    severity: 'low',
    actions: [
      { type: 'logEvent' },
    ],
  },

  SUSPICIOUS_LOGIN: {
    severity: 'high',
    actions: [
      { type: 'recordFailure' },
      { type: 'notifyAdmin' },
    ],
  },
}

// 可自定义的策略配置（合并默认策略与用户自定义策略）
let strategies = {}

function initStrategies(customStrategies = {}) {
  strategies = {
    ...DEFAULT_STRATEGIES,
    ...customStrategies,
  }
}

// 初始化默认策略
initStrategies()

// ===== 动作执行器映射 =====

const ACTION_EXECUTORS = {
  async blockIp(event, params) {
    const ip = event.ip
    if (!ip) {
      console.warn('[AutoResponse] blockIp 跳过：事件缺少 IP')
      return
    }
    blockIp(ip, params.duration)
  },

  async triggerCircuitBreaker(event, params) {
    const ip = event.ip
    if (!ip) {
      console.warn('[AutoResponse] triggerCircuitBreaker 跳过：事件缺少 IP')
      return
    }
    await triggerCircuitBreaker(ip, params?.service)
  },

  async notifyAdmin(event) {
    notifyAdmin(event)
  },

  async logEvent(event) {
    logEvent(event)
  },

  async escalateToAdmin(event) {
    escalateToAdmin(event)
  },

  async recordFailure(event, params) {
    const ip = event.ip
    if (!ip) {
      console.warn('[AutoResponse] recordFailure 跳过：事件缺少 IP')
      return
    }

    const { count } = recordFailureCount(ip)

    // 如果配置了阈值，达到阈值后执行额外动作
    if (params?.threshold && count >= params.threshold) {
      // 达到阈值后重置计数，防止重复触发
      delete stats.failureRecords[ip]

      const action = params.onExceed
      if (action === 'blockIp' && params.duration) {
        blockIp(ip, params.duration)
        notifyAdmin({ ...event, message: `累计 ${count} 次 ${event.type}，已封禁 IP ${params.duration / 1000 / 60} 分钟` })
      }
    }
  },
}

// ===== 核心导出函数 =====

/**
 * 评估安全事件并自动执行匹配的响应策略
 *
 * @param {Object} event - 安全事件对象
 * @param {string} event.type - 事件类型（如 'BRUTE_FORCE_ATTEMPT'）
 * @param {string} [event.severity] - 严重程度
 * @param {string} [event.ip] - 客户端 IP
 * @param {string} [event.message] - 事件描述
 * @param {Object} [event.details] - 附加详情
 * @returns {Promise<{handled: boolean, strategy: string|null, actions: string[]}>}
 */
export async function evaluateSecurityEvent(event) {
  if (!event || !event.type) {
    console.warn('[AutoResponse] 无效事件：缺少 type 字段')
    return { handled: false, strategy: null, actions: [] }
  }

  stats.totalEvents++

  const strategy = strategies[event.type]
  if (!strategy) {
    // 未匹配到策略，仅记录日志
    console.log(`\x1b[90m[AutoResponse] 未匹配策略: ${event.type} (severity=${event.severity || 'unknown'}, ip=${event.ip || 'unknown'})\x1b[0m`)
    logEvent({ ...event, _matchedStrategy: 'UNMATCHED' })
    return { handled: false, strategy: null, actions: [] }
  }

  // 严重程度校验
  if (event.severity && strategy.severity && event.severity !== strategy.severity) {
    console.warn(
      `[AutoResponse] 事件 ${event.type} 严重程度不匹配：事件=${event.severity}，策略=${strategy.severity}`
    )
  }

  // 匹配到策略，统计命中
  stats.strategyHits[event.type] = (stats.strategyHits[event.type] || 0) + 1

  const executedActions = []

  // 输出事件处理详情
  const severityColors = { critical: '\x1b[41m', high: '\x1b[48;5;202m', medium: '\x1b[43m', warning: '\x1b[100m' }
  const sevColor = severityColors[strategy.severity] || '\x1b[43m'
  const sevLabel = (strategy.severity || 'unknown').toUpperCase()
  console.log('')
  console.log(`${sevColor}\x1b[30m ▲ AutoResponse 触发 \x1b[0m \x1b[33m${event.type}\x1b[0m`)
  console.log(`  事件类型: ${event.type}  |  严重程度: ${sevLabel}`)
  console.log(`  来源: ${event.ip || 'unknown'}  |  路径: ${event.details?.path || event.path || '未知'}`)
  if (event.message) console.log(`  消息: ${event.message}`)
  console.log(`  策略: ${event.type}  |  动作: [${strategy.actions.map(a => a.type).join(', ')}]`)

  for (const actionDef of strategy.actions) {
    const executor = ACTION_EXECUTORS[actionDef.type]
    if (!executor) {
      console.warn(`[AutoResponse] 未知动作类型: ${actionDef.type}`)
      continue
    }

    try {
      await executor(event, actionDef.params)
      executedActions.push(actionDef.type)
      console.log(`  ${'\x1b[32m'}✓ 执行动作: ${actionDef.type}${actionDef.params ? ' (' + JSON.stringify(actionDef.params) + ')' : ''}${'\x1b[0m'}`)
    } catch (err) {
      console.error(`  ${'\x1b[31m'}✗ 动作 ${actionDef.type} 执行失败: ${err.message}${'\x1b[0m'}`)
    }
  }

  // 记录审计日志
  logEvent({ ...event, _matchedStrategy: event.type })

  return { handled: true, strategy: event.type, actions: executedActions }
}

/**
 * 获取响应统计信息
 *
 * @returns {Object} 统计信息
 */
export function getResponseStats() {
  return {
    totalEvents: stats.totalEvents,
    actions: { ...stats.actions },
    blockedIpCount: stats.blockedIps.size,
    strategyHits: { ...stats.strategyHits },
    activeFailureRecords: Object.keys(stats.failureRecords).length,
    timestamp: new Date().toISOString(),
  }
}

/**
 * 配置自定义响应策略（会深度合并覆盖默认策略）
 *
 * @param {Object} customStrategies - 自定义策略配置
 * 格式：{ EVENT_TYPE: { severity: 'high', actions: [{ type: 'blockIp', params: { duration: 3600000 } }] } }
 */
export function configureStrategies(customStrategies = {}) {
  initStrategies(customStrategies)
}

/**
 * 重置统计信息（用于测试或运维）
 */
export function resetStats() {
  stats.totalEvents = 0
  stats.actions = {
    blockIp: 0,
    triggerCircuitBreaker: 0,
    notifyAdmin: 0,
    logEvent: 0,
    escalateToAdmin: 0,
    recordFailure: 0,
  }
  stats.blockedIps = new Set()
  stats.strategyHits = {}
  stats.failureRecords = {}
}