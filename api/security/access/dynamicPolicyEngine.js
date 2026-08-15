import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * 军工级动态策略引擎。
 *
 * 支持运行时从 JSON 文件加载策略规则，并根据 IP、时间、风险等级动态调整权限。
 * 策略文件修改后可在不重启服务的情况下热重载。
 *
 * @example
 * import { DynamicPolicyEngine, dynamicPolicyMiddleware } from './security/access/dynamicPolicyEngine.js'
 *
 * const engine = new DynamicPolicyEngine('./policies/access-policies.json')
 * app.use(dynamicPolicyMiddleware(engine))
 */

/**
 * @typedef {object} DynamicRule
 * @property {string} id - 规则唯一标识
 * @property {boolean} enabled - 是否启用
 * @property {string[]} [roles] - 适用角色
 * @property {string[]} [permissions] - 适用权限
 * @property {string[]} [allowedIps] - 允许 IP 白名单
 * @property {string[]} [blockedIps] - 阻止 IP 黑名单
 * @property {string} [timeStart] - 生效开始时间 HH:mm
 * @property {string} [timeEnd] - 生效结束时间 HH:mm
 * @property {number[]} [daysOfWeek] - 生效星期 0-6
 * @property {string} [minRiskLevel] - 最低风险等级 low|medium|high|critical
 * @property {string} [maxRiskLevel] - 最高风险等级 low|medium|high|critical
 * @property {string} [action] - 决策结果 allow|deny|elevate
 * @property {string} [message] - 拒绝提示
 * @property {number} [priority=0] - 优先级，数值越大越优先
 */

/**
 * @typedef {object} DynamicPolicy
 * @property {string} version
 * @property {DynamicRule[]} rules
 */

const RISK_LEVELS = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
})

/**
 * 解析时间字符串 HH:mm 为分钟数。
 *
 * @param {string} timeStr
 * @returns {number|null}
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const [h, m] = timeStr.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * 判断 IP 是否匹配规则中的 IP 列表。当前支持精确匹配和 CIDR 简单匹配（IPv4）。
 *
 * @param {string} ip
 * @param {string[]} ipList
 * @returns {boolean}
 */
function ipMatches(ip, ipList) {
  if (!ipList || ipList.length === 0) return false
  for (const item of ipList) {
    if (item === ip) return true
    if (item.includes('/')) {
      const match = matchCIDR(ip, item)
      if (match) return true
    }
  }
  return false
}

/**
 * 简单的 IPv4 CIDR 匹配。
 *
 * @param {string} ip
 * @param {string} cidr
 * @returns {boolean}
 */
function matchCIDR(ip, cidr) {
  try {
    const [network, prefixStr] = cidr.split('/')
    const prefix = Number(prefixStr)
    if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false

    const ipParts = ip.split('.').map(Number)
    const netParts = network.split('.').map(Number)
    if (ipParts.length !== 4 || netParts.length !== 4) return false

    const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]
    const netInt = (netParts[0] << 24) | (netParts[1] << 16) | (netParts[2] << 8) | netParts[3]
    const mask = prefix === 0 ? 0 : 0xFFFFFFFF << (32 - prefix)

    return (ipInt & mask) === (netInt & mask)
  } catch {
    return false
  }
}

/**
 * 从请求对象中提取风险等级。
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getRequestRiskLevel(req) {
  return req.user?.riskLevel
    || req.tokenPayload?.riskLevel
    || req.riskLevel
    || 'low'
}

/**
 * 从请求对象中提取当前角色与权限。
 *
 * @param {import('express').Request} req
 * @returns {{role: string|null, permissions: string[]}}
 */
function getRequestIdentity(req) {
  const role = req.user?.role || req.tokenPayload?.role || null
  const permissions = req.user?.permissions
    || req.tokenPayload?.permissions
    || []
  return { role, permissions: Array.isArray(permissions) ? permissions : [] }
}

/**
 * 动态策略引擎。
 * 支持从 JSON 文件加载策略、热重载、运行时决策。
 */
export class DynamicPolicyEngine {
  /**
   * @param {string} [policyPath] - 策略文件路径，为空时仅使用内存规则
   * @param {object} [options={}]
   * @param {number} [options.reloadIntervalMs=30000] - 热重载间隔，默认 30 秒
   * @param {DynamicRule[]} [options.defaultRules=[]] - 默认内存规则
   */
  constructor(policyPath, options = {}) {
    this.policyPath = policyPath || null
    this.reloadIntervalMs = options.reloadIntervalMs ?? 30000
    this.defaultRules = Object.freeze([...(options.defaultRules || [])])
    this.rules = []
    this.lastHash = null
    this.lastModified = 0
    this.timer = null

    this.loadPolicies()
    this.startWatcher()
  }

  /**
   * 启动文件监听器，按间隔热重载策略。
   */
  startWatcher() {
    if (!this.policyPath || this.timer) return
    this.timer = setInterval(() => {
      this.loadPolicies()
    }, this.reloadIntervalMs)
    // 不阻止 Node.js 进程退出
    if (this.timer.unref) this.timer.unref()
  }

  /**
   * 停止文件监听器。
   */
  stopWatcher() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * 计算策略内容哈希，用于判断是否需要重载。
   *
   * @param {string} content
   * @returns {string}
   */
  computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * 从文件加载策略。文件变更时自动更新内存规则。
   */
  loadPolicies() {
    try {
      if (!this.policyPath) {
        this.rules = this.defaultRules
        return
      }

      const resolved = path.resolve(this.policyPath)
      if (!fs.existsSync(resolved)) {
        this.rules = this.defaultRules
        return
      }

      const stats = fs.statSync(resolved)
      if (stats.mtimeMs <= this.lastModified) return

      const content = fs.readFileSync(resolved, 'utf-8')
      const hash = this.computeHash(content)
      if (hash === this.lastHash) return

      const parsed = JSON.parse(content)
      const loadedRules = Array.isArray(parsed?.rules) ? parsed.rules : []
      this.rules = Object.freeze(this.normalizeRules([...this.defaultRules, ...loadedRules]))
      this.lastHash = hash
      this.lastModified = stats.mtimeMs
    } catch (err) {
      console.error('[DynamicPolicyEngine] 策略加载失败，保留已有规则:', err?.message || err)
    }
  }

  /**
   * 规范化并排序规则：按优先级降序排列，未设置优先级的规则默认 0。
   *
   * @param {DynamicRule[]} rules
   * @returns {DynamicRule[]}
   */
  normalizeRules(rules) {
    return rules
      .filter(r => r && r.enabled !== false && r.id)
      .map(r => ({
        ...r,
        priority: Number.isFinite(r.priority) ? r.priority : 0,
        action: r.action || 'deny',
      }))
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * 手动设置内存规则（不持久化到文件）。
   *
   * @param {DynamicRule[]} rules
   */
  setRules(rules) {
    this.rules = Object.freeze(this.normalizeRules([...(rules || [])]))
  }

  /**
   * 获取当前所有规则。
   *
   * @returns {DynamicRule[]}
   */
  getRules() {
    this.loadPolicies()
    return [...this.rules]
  }

  /**
   * 评估单个规则是否匹配当前请求上下文。
   *
   * @param {DynamicRule} rule
   * @param {import('express').Request} req
   * @returns {boolean}
   */
  ruleMatches(rule, req) {
    const { role, permissions } = getRequestIdentity(req)
    const ip = req.ip
      || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown'
    const now = new Date()

    // 角色匹配
    if (rule.roles && rule.roles.length > 0) {
      if (!role || !rule.roles.includes(role)) return false
    }

    // 权限匹配
    if (rule.permissions && rule.permissions.length > 0) {
      const hasPermission = rule.permissions.some(p => permissions.includes(p))
      if (!hasPermission) return false
    }

    // IP 白名单
    if (rule.allowedIps && rule.allowedIps.length > 0) {
      if (!ipMatches(ip, rule.allowedIps)) return false
    }

    // IP 黑名单
    if (rule.blockedIps && rule.blockedIps.length > 0) {
      if (ipMatches(ip, rule.blockedIps)) return false
    }

    // 时间窗口
    if (rule.timeStart || rule.timeEnd) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const start = parseTimeToMinutes(rule.timeStart) ?? 0
      const end = parseTimeToMinutes(rule.timeEnd) ?? 1439
      if (currentMinutes < start || currentMinutes > end) return false
    }

    // 星期限制
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      if (!rule.daysOfWeek.includes(now.getDay())) return false
    }

    // 风险等级
    const riskLevel = getRequestRiskLevel(req)
    const riskValue = RISK_LEVELS[riskLevel] ?? 0
    if (rule.minRiskLevel) {
      const min = RISK_LEVELS[rule.minRiskLevel] ?? 0
      if (riskValue < min) return false
    }
    if (rule.maxRiskLevel) {
      const max = RISK_LEVELS[rule.maxRiskLevel] ?? 3
      if (riskValue > max) return false
    }

    return true
  }

  /**
   * 评估请求，返回决策结果。
   *
   * @param {import('express').Request} req
   * @returns {{allowed: boolean, action: string, rule: DynamicRule|null, message: string}}
   */
  evaluate(req) {
    this.loadPolicies()

    for (const rule of this.rules) {
      if (this.ruleMatches(rule, req)) {
        const allowed = rule.action === 'allow' || rule.action === 'elevate'
        return {
          allowed,
          action: rule.action,
          rule,
          message: rule.message || (allowed ? '策略允许' : '策略拒绝'),
        }
      }
    }

    return {
      allowed: true,
      action: 'default',
      rule: null,
      message: '无匹配策略，默认允许',
    }
  }
}

/**
 * 生成动态策略中间件。
 *
 * @param {DynamicPolicyEngine} engine
 * @param {object} [options={}]
 * @param {boolean} [options.attachResult=true] - 是否在 req.dynamicPolicyResult 上挂载决策结果
 * @param {boolean} [options.blockElevate=false] - 是否将 elevate 动作视为阻断（默认仅标记）
 * @returns {import('express').RequestHandler} Express 中间件
 */
export function dynamicPolicyMiddleware(engine, options = {}) {
  const { attachResult = true, blockElevate = false } = options

  return function dynamicPolicy(req, res, next) {
    const result = engine.evaluate(req)
    if (attachResult) {
      req.dynamicPolicyResult = result
    }

    if (!result.allowed) {
      return res.status(403).json({
        success: false,
        code: 'DYNAMIC_POLICY_DENIED',
        message: result.message,
        ruleId: result.rule?.id || null,
      })
    }

    if (result.action === 'elevate' && blockElevate) {
      return res.status(403).json({
        success: false,
        code: 'DYNAMIC_POLICY_ELEVATION_BLOCKED',
        message: result.message,
        ruleId: result.rule?.id || null,
      })
    }

    next()
  }
}

/**
 * 创建默认内存策略规则。
 *
 * @returns {DynamicRule[]}
 */
export function getDefaultDynamicRules() {
  return [
    {
      id: 'block-high-risk-admin',
      enabled: true,
      roles: ['admin'],
      minRiskLevel: 'critical',
      action: 'deny',
      message: '极高风险等级，禁止访问敏感管理接口',
      priority: 100,
    },
    {
      id: 'restrict-admin-office-hours',
      enabled: true,
      roles: ['admin'],
      timeStart: '09:00',
      timeEnd: '18:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      action: 'allow',
      priority: 50,
    },
  ]
}

/*
 * 使用示例：
 *
 * import { DynamicPolicyEngine, dynamicPolicyMiddleware } from './dynamicPolicyEngine.js'
 *
 * const engine = new DynamicPolicyEngine('./policies/access-policies.json', {
 *   reloadIntervalMs: 30000,
 *   defaultRules: getDefaultDynamicRules(),
 * })
 *
 * app.use('/api/admin', dynamicPolicyMiddleware(engine))
 *
 * // 策略文件示例 policies/access-policies.json：
 * {
 *   "version": "1.0.0",
 *   "rules": [
 *     {
 *       "id": "block-guest-from-admin-ip",
 *       "enabled": true,
 *       "roles": ["guest"],
 *       "blockedIps": ["10.0.0.0/8"],
 *       "action": "deny",
 *       "message": "访客禁止访问管理网段",
 *       "priority": 90
 *     },
 *     {
 *       "id": "allow-moderator-morning",
 *       "enabled": true,
 *       "roles": ["moderator"],
 *       "timeStart": "08:00",
 *       "timeEnd": "12:00",
 *       "action": "allow",
 *       "priority": 10
 *     }
 *   ]
 * }
 */
