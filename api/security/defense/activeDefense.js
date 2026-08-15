// ===== 主动防御与欺骗 =====
// 动态蜜罐、响应欺骗、攻击者画像、 tarpit 延迟、Redis 持久化

import { pickTemplate } from './deceptionTemplates.js'
import { safeRedisOp, isRedisReady } from '../../lib/redisClient.js';

const REDIS_PROFILES_KEY = 'active_defense:profiles'
const REDIS_LOGS_KEY = 'active_defense:logs'
const MAX_LOG = 1000
const SAVE_INTERVAL_MS = 30000
const TARPIT_BASE_MS = 500
const TARPIT_MAX_MS = 15000

export class ActiveDefense {
  constructor() {
    this.enabled = process.env.AI_ACTIVE_DEFENSE === 'true'
    this.honeypotEnabled = process.env.AI_HONEYPOT_DYNAMIC === 'true'
    this.deceptionEnabled = process.env.AI_DECEPTION_RESPONSE === 'true'
    this.isolationLink = process.env.AI_AUTO_ISOLATION_LINK !== 'false'
    this.tarpitEnabled = process.env.AI_TARPIT_ENABLED !== 'false'

    this.honeypotEndpoints = new Set([
      '/admin/legacy/login',
      '/api/internal/users',
      '/config/backup.json',
      '/debug/sql',
      '/api/v1/secrets',
      '/api/v1/admin/backdoor',
      '/.env.backup',
      '/config/production.yml',
    ])
    this.seededHoneypots = new Map() // ip -> Set(endpoints)
    this.attackerProfiles = new Map()
    this.deceptionLog = []
    this.dirty = false

    this._loadFromRedis().catch(() => {})
    this._saveTimer = setInterval(() => this._saveToRedis(), SAVE_INTERVAL_MS)
    this._saveTimer.unref()
  }

  setAutoIsolation(isolation) {
    this.autoIsolation = isolation
  }

  shouldEngage(decision, context) {
    if (!this.enabled) return false
    if (context.honeypotTriggered) return true
    if (decision.action === 'BLOCK' && decision.confidence >= 0.8) return true
    if (decision.action === 'CHALLENGE' && decision.confidence >= 0.8) return true
    if ((decision.temporal?.alert || decision.threatIntel?.alert) && decision.confidence >= 0.6) return true
    return false
  }

  seedHoneypots(ip, endpoints) {
    if (!this.honeypotEnabled) return
    const set = this.seededHoneypots.get(ip) || new Set()
    for (const ep of endpoints) set.add(ep)
    this.seededHoneypots.set(ip, set)
    this.dirty = true
  }

  isHoneypotPath(ip, path) {
    if (this.honeypotEndpoints.has(path)) return true
    const seeded = this.seededHoneypots.get(ip)
    return seeded ? seeded.has(path) : false
  }

  inferHoneypotsFromPath(path) {
    const inferred = []
    const lower = path.toLowerCase()
    if (lower.includes('/api/')) inferred.push('/api/internal/users', '/api/v1/secrets')
    if (lower.includes('/admin')) inferred.push('/admin/legacy/login', '/api/v1/admin/backdoor')
    if (lower.includes('/config') || lower.includes('/.env')) inferred.push('/config/backup.json', '/.env.backup')
    if (lower.includes('/debug')) inferred.push('/debug/sql')
    return inferred.length > 0 ? inferred : ['/admin/legacy/login']
  }

  getTarpitDelay(ip) {
    if (!this.tarpitEnabled) return 0
    const profile = this.attackerProfiles.get(ip)
    if (!profile) return 0
    const interactions = profile.deceptionInteractions || 0
    // 第一次互动不延迟，从第二次开始指数递增
    if (interactions === 0) return 0
    return Math.min(TARPIT_BASE_MS * Math.pow(2, interactions - 1), TARPIT_MAX_MS)
  }

  handleRequest(req, res, decision, context) {
    if (!this.enabled) return false

    const ip = context.ip
    const path = context.path

    if (this.isHoneypotPath(ip, path)) {
      this._recordHoneypot(ip, path, req)
      this._updateProfile(ip, 'honeypot_triggered', decision.confidence)
      req.honeypotTriggered = true

      if (this.isolationLink && this.autoIsolation) {
        this.autoIsolation.recordHoneypot(req, { reason: 'dynamic_honeypot', path })
      }

      res.status(200).json({ success: true, message: '操作成功' })
      return true
    }

    if (this.deceptionEnabled && this.shouldEngage(decision, context)) {
      // 先计算 tarpit 延迟（基于当前互动次数），再更新画像
      const delay = this.getTarpitDelay(ip)
      this._updateProfile(ip, 'deception_engaged', decision.confidence)
      // 根据当前请求路径推断并投放相关蜜罐
      this.seedHoneypots(ip, this.inferHoneypotsFromPath(path))

      const template = pickTemplate(context, decision)
      this._logDeception(ip, path, template)

      const send = () => res.status(template.status).set(template.headers).send(template.body)

      if (path.includes('/login') || path.includes('/auth')) {
        const loginDelay = Math.max(delay, 1000 + Math.floor(Math.random() * 4000))
        setTimeout(send, loginDelay)
        return true
      }

      if (delay > 0) {
        setTimeout(send, delay)
        return true
      }

      send()
      return true
    }

    return false
  }

  _recordHoneypot(ip, path, req) {
    const entry = {
      id: `HONEY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ip,
      path,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    }
    this.deceptionLog.push(entry)
    if (this.deceptionLog.length > MAX_LOG) this.deceptionLog.shift()
    this.dirty = true
  }

  _logDeception(ip, path, template) {
    this.deceptionLog.push({
      type: 'deception',
      ip,
      path,
      status: template.status,
      timestamp: new Date().toISOString(),
    })
    if (this.deceptionLog.length > MAX_LOG) this.deceptionLog.shift()
    this.dirty = true
  }

  _updateProfile(ip, tactic, confidence) {
    const now = new Date().toISOString()
    const p = this.attackerProfiles.get(ip) || {
      ip,
      firstSeen: now,
      lastSeen: now,
      tactics: new Set(),
      deceptionInteractions: 0,
      isolationTriggered: false,
      confidence: 0,
    }
    p.lastSeen = now
    p.tactics.add(tactic)
    p.deceptionInteractions++
    p.confidence = Math.max(p.confidence, confidence)
    if (tactic === 'honeypot_triggered') p.isolationTriggered = true
    this.attackerProfiles.set(ip, p)
    this.dirty = true
  }

  async _loadFromRedis() {
    if (!isRedisReady()) return
    try {
      const [profilesRaw, logsRaw] = await Promise.all([
        safeRedisOp(c => c.get(REDIS_PROFILES_KEY), null),
        safeRedisOp(c => c.get(REDIS_LOGS_KEY), null),
      ])
      if (profilesRaw) {
        const parsed = JSON.parse(profilesRaw)
        for (const [ip, p] of Object.entries(parsed)) {
          this.attackerProfiles.set(ip, { ...p, tactics: new Set(p.tactics || []) })
        }
      }
      if (logsRaw) {
        this.deceptionLog = JSON.parse(logsRaw)
      }
      console.log('[ActiveDefense] 已从 Redis 恢复攻击者画像与日志')
    } catch (err) {
      console.warn('[ActiveDefense] Redis 加载失败:', err.message)
    }
  }

  async _saveToRedis() {
    if (!this.dirty || !isRedisReady()) return
    try {
      const profiles = Object.fromEntries(
        [...this.attackerProfiles.entries()].map(([ip, p]) => [ip, { ...p, tactics: [...p.tactics] }])
      )
      await Promise.all([
        safeRedisOp(c => c.setEx(REDIS_PROFILES_KEY, 7 * 24 * 3600, JSON.stringify(profiles)), null),
        safeRedisOp(c => c.setEx(REDIS_LOGS_KEY, 7 * 24 * 3600, JSON.stringify(this.deceptionLog.slice(-MAX_LOG))), null),
      ])
      this.dirty = false
    } catch (err) {
      console.warn('[ActiveDefense] Redis 保存失败:', err.message)
    }
  }

  getProfiles() {
    return [...this.attackerProfiles.values()].map((p) => ({
      ...p,
      tactics: [...p.tactics],
    }))
  }

  getStats() {
    return {
      enabled: this.enabled,
      honeypotEnabled: this.honeypotEnabled,
      deceptionEnabled: this.deceptionEnabled,
      tarpitEnabled: this.tarpitEnabled,
      profileCount: this.attackerProfiles.size,
      deceptionCount: this.deceptionLog.filter((e) => e.type === 'deception').length,
      honeypotTriggers: this.deceptionLog.filter((e) => e.id?.startsWith('HONEY')).length,
    }
  }
}

export const activeDefense = new ActiveDefense()
