// ===== 自动隔离系统 (Auto-Isolation / Circuit Breaker) =====
// 当检测到高危攻击或异常访问模式时，自动切断后端外部连接，只保留本地/可信管理员通道。

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { readEncryptedFileSync, writeEncryptedFileSync } from '../privacy/fileVault.js'
import { SmartIsolation } from './smartIsolation.js'
import { safeRedisOp, isRedisReady } from '../../lib/redisClient.js'
import { getClientIP } from '../core/auditLogger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const STATE_FILE = path.resolve(DATA_DIR, 'isolation-state.json')
const REDIS_STATE_KEY = 'isolation:state'
const REDIS_PROFILES_KEY = 'isolation:profiles'
const REDIS_BLOCKLIST_KEY = 'isolation:blocklist'
const REDIS_STATE_TTL_SECONDS = 7 * 24 * 60 * 60
const REDIS_PROFILE_TTL_SECONDS = 7 * 24 * 60 * 60
const REDIS_BLOCKLIST_TTL_SECONDS = 7 * 24 * 60 * 60
const SAVE_THROTTLE_MS = 500

// 军工级：隔离策略不允许因开发/测试模式而削弱。
// AUTO_ISOLATION_DEV 仅控制日志详细程度，不再绕过本地 IP 威胁检测。
const DEV_MODE = process.env.AUTO_ISOLATION_DEV === 'true'

// 隔离状态 HMAC 密钥：使用管理员隐私密钥派生，确保状态不可篡改。
// 若未配置则使用内存级派生密钥（仅当前进程有效，重启后变化，用于开发环境）。
function getIsolationHmacKey() {
  const base = process.env.ADMIN_PRIVACY_KEY || process.env.JWT_SECRET
  if (base) {
    return crypto.createHmac('sha256', 'isolation-state-binding').update(base).digest()
  }
  // 无密钥时返回一次性派生密钥：开发环境状态不可跨进程验证，但不影响功能
  return crypto.randomBytes(32)
}

const ISOLATION_HMAC_KEY = getIsolationHmacKey()

function computeStateHmac(payload) {
  return crypto.createHmac('sha256', ISOLATION_HMAC_KEY).update(JSON.stringify(payload)).digest('hex')
}

function signState(state) {
  const payload = { ...state, _sig: undefined }
  return { ...state, _sig: computeStateHmac(payload) }
}

function verifyStateSignature(state) {
  if (!state || typeof state !== 'object' || !state._sig) return false
  const { _sig, ...payload } = state
  const expected = computeStateHmac(payload)
  return crypto.timingSafeEqual(Buffer.from(_sig, 'hex'), Buffer.from(expected, 'hex'))
}

export const ISOLATION_LEVELS = {
  NORMAL: 'normal',       // 正常
  ALERT: 'alert',         // 警戒：加强审查，记录所有请求
  QUARANTINE: 'quarantine', // 半隔离：只允许本地/白名单 + 登录/健康检查
  LOCKDOWN: 'lockdown',   // 完全隔离：只保留本地管理员，拒绝所有外部请求
}

const LEVEL_ORDER = [ISOLATION_LEVELS.NORMAL, ISOLATION_LEVELS.ALERT, ISOLATION_LEVELS.QUARANTINE, ISOLATION_LEVELS.LOCKDOWN]

const DEFAULT_CONFIG = {
  // 触发阈值（比之前更敏感，减少攻击窗口）
  triggers: {
    // 单位时间内 critical/high 决策数量触发隔离
    decisionBurst: {
      windowMs: 60 * 1000,
      highThreshold: 5,      // 1分钟内5个高危决策 -> 半隔离
      criticalThreshold: 2,   // 1分钟内2个严重决策 -> 完全隔离
    },
    // 敏感路径访问（配置、环境变量、源码目录等）
    sensitiveAccess: {
      paths: [
        '/.env',
        '/.git',
        '/vite.config',
        '/tsconfig',
        '/package.json',
        '/package-lock.json',
        '/src/',
        '/scripts/',
        '/docs/',
        '/@fs/',
        '/isolation-state.json',
        '/audit-log.json',
      ],
      burstThreshold: 2,      // 1分钟内2次敏感访问 -> 半隔离
      lockdownThreshold: 4,   // 1分钟内4次敏感访问 -> 完全隔离
      windowMs: 60 * 1000,
    },
    // 管理员接口攻击（未授权访问 /api/admin/*）
    adminAttack: {
      burstThreshold: 2,      // 1分钟内2次未授权访问管理员接口 -> 半隔离
      lockdownThreshold: 4,   // 1分钟内4次 -> 完全隔离
      windowMs: 60 * 1000,
    },
    // JWT 异常使用（伪造、过期、无权限）
    jwtAnomaly: {
      burstThreshold: 3,      // 1分钟内3次 JWT 异常 -> 警戒
      lockdownThreshold: 6,  // 1分钟内6次 -> 半隔离
      windowMs: 60 * 1000,
    },
    // 扫描行为：连续访问不存在的敏感路径
    scanPattern: {
      burstThreshold: 3,      // 1分钟内3次 404 敏感路径 -> 警戒
      lockdownThreshold: 6,  // 1分钟内6次 -> 半隔离
      windowMs: 60 * 1000,
    },
    // 认证失败（登录/注册/密码重置）
    authFailure: {
      burstThreshold: 3,      // 1分钟内3次认证失败 -> 警戒
      lockdownThreshold: 6,  // 1分钟内6次 -> 半隔离
      windowMs: 60 * 1000,
    },
    // Token 异常使用（重用、大规模失败）
    tokenAnomaly: {
      reuseBurst: 2,          // 2次 refresh token 重用 -> 完全隔离
      windowMs: 5 * 60 * 1000,
    },
    // 蜜罐触发
    honeypot: {
      triggerLockdown: true,  // 触发蜜罐 -> 直接完全隔离
    },
  },
  // 自动恢复时间（延长，避免攻击者等待恢复）
  // LOCKDOWN 默认 30 分钟有界自动恢复：既避免攻击者长期等待，也防止"误触发后全站永久不可用"。
  // 可通过 ISOLATION_LOCKDOWN_AUTO_RECOVER_MS 覆盖（设为 0 保持"必须手动解除"的旧行为）。
  autoRecovery: {
    [ISOLATION_LEVELS.ALERT]: 10 * 60 * 1000,       // 警戒 10 分钟
    [ISOLATION_LEVELS.QUARANTINE]: 60 * 60 * 1000,  // 半隔离 60 分钟
    [ISOLATION_LEVELS.LOCKDOWN]: (() => {
      const v = Number(process.env.ISOLATION_LOCKDOWN_AUTO_RECOVER_MS)
      return Number.isFinite(v) && v >= 0 ? v : 30 * 60 * 1000 // 默认 30 分钟
    })(),
  },
  // 本地/可信白名单（即使隔离也允许访问）
  localWhitelist: ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'],
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key])
  }
  return Object.freeze(obj)
}

class AutoIsolationSystem {
  constructor(config = {}) {
    // 军工级：阈值配置在实例化后不可变，防止运行时热补丁削弱防御。
    this.config = deepFreeze({ ...DEFAULT_CONFIG, ...config })
    this.state = {
      level: ISOLATION_LEVELS.NORMAL,
      triggeredAt: null,
      triggeredBy: null,
      reason: null,
      autoRecoverAt: null,
      history: [],
      decisionEvents: [],
      sensitiveAccessEvents: [],
      adminAttackEvents: [],
      jwtAnomalyEvents: [],
      scanPatternEvents: [],
      authFailureEvents: [],
      tokenReuseEvents: [],
      honeypotEvents: [],
      manualOverride: false,
      escalationCount: 0,        // 连续触发隔离次数，用于递增惩罚
      lastEscalationAt: null,
    }
    this.smart = new SmartIsolation(this)
    this.notifyHooks = []
    this.recentBlockedIps = new Map() // IP -> { count, lastSeen }
    this.ipBlocklist = new Map()     // IP -> { blockedAt, expiresAt, reason }
    this.saveTimer = null
    this.lastSavedAt = 0
    this.ensureDataDir()
    this.loadState()
    this._startRecoveryTimer()

    if (DEV_MODE) {
      console.warn('[AutoIsolation] 开发测试模式已启用：仅增加日志详细程度，防御策略不会削弱')
    }
  }

  // 注册隔离状态变化通知钩子
  addNotifyHook(hook) {
    if (typeof hook === 'function') this.notifyHooks.push(hook)
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    } catch (err) {
      console.error('[AutoIsolation] 无法创建数据目录:', err.message)
    }
  }

  // 统一请求信号收集：在响应结束时调用，捕获全站威胁行为
  collectRequestSignal(req, res) {
    try {
      const ip = this._getIp(req)
      const path = req.path || req.url || '/'
      const status = res.statusCode

      // 0. 错误上报端点豁免：前端在应用出错时会反复推送 bug 报告，
      //    若把这些请求计入威胁事件，会形成"应用 bug -> 上报循环 -> 自封禁"的恶性循环。
      //    错误上报属于用户主动反馈，不应触发隔离/封禁升级。
      if (path.startsWith('/api/bug-report')) {
        return
      }

      // 1. WAF / AI 拦截标记
      if (res.getHeader?.('X-WAF-Action') === 'BLOCK' || req._wafBlocked) {
        this.recordAdminAttack(req, { reason: 'waf_block', status })
      }
      if (req._aiBlocked) {
        this.recordDecision({ action: 'BLOCK', severity: 'high', context: { ip, endpoint: path } }, req)
      }

      // 2. 敏感路径访问（无论成功失败都记录；军工级：本地 IP 也不例外）
      if (this._isSensitivePath(path)) {
        this.recordSensitiveAccess(req)
      }

      // 3. 扫描行为：404 且命中敏感模式
      if (status === 404) {
        const scanIndicators = ['admin', 'login', 'api', 'config', '.env', '.git', 'wp-', 'phpmyadmin', 'actuator', 'swagger']
        const lowerPath = path.toLowerCase()
        if (scanIndicators.some(s => lowerPath.includes(s))) {
          this.recordScanPattern(req, { status, reason: 'sensitive_404' })
        }
      }

      // 4. 认证/授权失败
      if (status === 401) {
        this.recordJwtAnomaly(req, { status, reason: 'unauthorized' })
        this.recordAuthFailure(req, { status, reason: 'unauthorized' })
      }
      if (status === 403) {
        this.recordJwtAnomaly(req, { status, reason: 'forbidden' })
        if (path.startsWith('/api/admin')) {
          this.recordAdminAttack(req, { status, reason: 'forbidden_admin' })
        }
      }

      // 5. 管理员接口未授权访问（显式标记）
      if (req._adminAttackAttempt) {
        this.recordAdminAttack(req, { reason: 'explicit_mark' })
      }

      // 6. 异常 User-Agent / 自动化工具指纹（军工级：本地 IP 也不例外）
      const ua = req.headers?.['user-agent'] || ''
      const suspiciousUa = /(sqlmap|nmap|nikto|gobuster|dirb|burp|wfuzz|masscan|zgrab|python-requests|curl|wget|httpie)/i
      if (suspiciousUa.test(ua)) {
        this.recordScanPattern(req, { reason: 'suspicious_ua', ua: ua.slice(0, 100) })
      }

      // 7. 记录被阻止的 IP，用于后续速率/隔离决策
      if (status === 503 && autoIsolation.isActive()) {
        const key = `${ip}:${path}`
        const now = Date.now()
        const existing = this.recentBlockedIps.get(key) || { count: 0, firstSeen: now }
        existing.count += 1
        existing.lastSeen = now
        this.recentBlockedIps.set(key, existing)
        // 清理过期条目
        for (const [k, v] of this.recentBlockedIps.entries()) {
          if (now - v.lastSeen > 5 * 60 * 1000) this.recentBlockedIps.delete(k)
        }
      }
    } catch (err) {
      // 绝不因隔离收集逻辑本身导致请求失败
      if (process.env.NODE_ENV !== 'production') {
        console.error('[AutoIsolation] collectRequestSignal 错误:', err.message)
      }
    }
  }

  loadState() {
    // 1. 先以 Redis 为主源（支持集群/多实例/容器重启）
    // 2. Redis 不可用时回退到本地文件
    this._loadFromRedis().then((redisLoaded) => {
      if (!redisLoaded) this._loadFromFile()
      this._loadProfilesAndBlocklist().catch(() => {})
    }).catch(() => {
      this._loadFromFile()
    })
  }

  _loadFromFile() {
    try {
      const raw = readEncryptedFileSync(STATE_FILE, { context: 'isolation-state.json' })
      if (raw !== null && raw.trim() !== '') {
        const data = JSON.parse(raw)
        if (!verifyStateSignature(data)) {
          console.error('[AutoIsolation] ⚠️ 隔离状态签名验证失败，疑似被篡改，将重置为正常状态')
          logAudit({ action: 'isolation_state_tampered', details: '本地隔离状态 HMAC 签名无效' })
          return
        }
        this._mergeState(data)
        // 如果启动时处于隔离状态且已过期，自动恢复
        if (this.state.autoRecoverAt && Date.now() > this.state.autoRecoverAt) {
          this._recover('auto_on_startup')
        } else if (this.state.level !== ISOLATION_LEVELS.NORMAL) {
          console.warn(`[AutoIsolation] 已从本地文件恢复隔离状态: ${this.state.level}, reason=${this.state.triggeredBy}`)
        }
      }
    } catch (err) {
      console.error('[AutoIsolation] 加载本地状态失败:', err.message)
    }
  }

  async _loadFromRedis() {
    const raw = await safeRedisOp(c => c.get(REDIS_STATE_KEY), null)
    if (!raw) return false
    try {
      const data = JSON.parse(raw)
      if (!verifyStateSignature(data)) {
        console.error('[AutoIsolation] ⚠️ Redis 隔离状态签名验证失败，疑似被篡改，将回退到本地文件')
        logAudit({ action: 'isolation_state_tampered', details: 'Redis 隔离状态 HMAC 签名无效' })
        return false
      }
      this._mergeState(data)
      if (this.state.autoRecoverAt && Date.now() > this.state.autoRecoverAt) {
        this._recover('auto_on_startup_redis')
      } else if (this.state.level !== ISOLATION_LEVELS.NORMAL) {
        console.warn(`[AutoIsolation] 已从 Redis 恢复隔离状态: ${this.state.level}, reason=${this.state.triggeredBy}`)
      }
      return true
    } catch (err) {
      console.error('[AutoIsolation] 解析 Redis 状态失败:', err.message)
      return false
    }
  }

  _mergeState(data) {
    if (!data || typeof data !== 'object') return
    // 内部状态不保留签名字段
    const { _sig, ...rest } = data
    // 保留默认字段结构，防止旧数据缺少新字段
    const merged = { ...this.state, ...rest }
    // 事件数组必须是数组
    for (const key of Object.keys(this.state)) {
      if (Array.isArray(this.state[key]) && !Array.isArray(merged[key])) merged[key] = []
    }
    this.state = merged
  }

  async _loadProfilesAndBlocklist() {
    // 加载智能画像
    if (isRedisReady()) {
      try {
        const profiles = await safeRedisOp(c => c.get(REDIS_PROFILES_KEY), null)
        if (profiles) this.smart.deserializeProfiles(profiles)
      } catch {}
      try {
        const blocklist = await safeRedisOp(c => c.get(REDIS_BLOCKLIST_KEY), null)
        if (blocklist) {
          const parsed = JSON.parse(blocklist)
          for (const [ip, item] of Object.entries(parsed)) {
            if (item.expiresAt && item.expiresAt > Date.now()) {
              this.ipBlocklist.set(ip, item)
            }
          }
        }
      } catch {}
    }
  }

  saveState(immediate = false) {
    if (immediate) {
      this._flushSave()
      return
    }
    // 节流：避免每次请求都写盘
    if (this.saveTimer) return
    const now = Date.now()
    if (now - this.lastSavedAt < SAVE_THROTTLE_MS) {
      this.saveTimer = setTimeout(() => this._flushSave(), SAVE_THROTTLE_MS)
      return
    }
    this._flushSave()
  }

  _flushSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.lastSavedAt = Date.now()
    const payload = signState(this._trimStateForSave())
    try {
      writeEncryptedFileSync(STATE_FILE, JSON.stringify(payload, null, 2), { context: 'isolation-state.json' })
    } catch (err) {
      console.error('[AutoIsolation] 保存本地状态失败:', err.message)
    }
    this._saveToRedis(payload).catch(() => {})
    this._saveProfilesAndBlocklist().catch(() => {})
  }

  async _saveToRedis(payload) {
    if (!isRedisReady()) return
    await safeRedisOp(c =>
      c.setEx(REDIS_STATE_KEY, REDIS_STATE_TTL_SECONDS, JSON.stringify(payload))
    )
  }

  async _saveProfilesAndBlocklist() {
    if (!isRedisReady()) return
    const profiles = this.smart.serializeProfiles()
    if (profiles) {
      await safeRedisOp(c => c.setEx(REDIS_PROFILES_KEY, REDIS_PROFILE_TTL_SECONDS, profiles))
    }
    const blocklistObj = Object.fromEntries(this.ipBlocklist.entries())
    await safeRedisOp(c => c.setEx(REDIS_BLOCKLIST_KEY, REDIS_BLOCKLIST_TTL_SECONDS, JSON.stringify(blocklistObj)))
  }

  _trimStateForSave() {
    // 控制持久化大小：历史保留最近 50 条，事件数组保留最近 100 条
    return {
      ...this.state,
      history: this.state.history.slice(0, 50),
      decisionEvents: this.state.decisionEvents.slice(-100),
      sensitiveAccessEvents: this.state.sensitiveAccessEvents.slice(-100),
      adminAttackEvents: this.state.adminAttackEvents.slice(-100),
      jwtAnomalyEvents: this.state.jwtAnomalyEvents.slice(-100),
      scanPatternEvents: this.state.scanPatternEvents.slice(-100),
      authFailureEvents: this.state.authFailureEvents.slice(-100),
      tokenReuseEvents: this.state.tokenReuseEvents.slice(-100),
      honeypotEvents: this.state.honeypotEvents.slice(-100),
    }
  }

  get level() {
    return this.state.level
  }

  isActive() {
    return this.state.level !== ISOLATION_LEVELS.NORMAL
  }

  isLocal(ip) {
    if (!ip) return false
    return this.config.localWhitelist.some(local =>
      ip === local || ip.startsWith('127.') || ip === '::ffff:127.0.0.1'
    )
  }

  // 军工级：任何来源的威胁信号都必须计入，本地 IP 也不例外。
  // 攻击者可能通过伪造 X-Forwarded-For 假装本地来源，因此不再因来源跳过检测。
  _shouldCount(ip) {
    return true
  }

  // 检查请求是否应该被阻止
  checkRequest(req) {
    const ip = this._getIp(req)
    const path = req.path || req.url || '/'

    // 本地白名单永远放行
    if (this.isLocal(ip)) {
      return { allowed: true, reason: 'local_whitelist' }
    }

    // 1. IP 级永久/临时封禁（比全局隔离更细粒度）
    const blocked = this._isIpBlocked(ip)
    if (blocked) {
      return {
        allowed: false,
        reason: 'ip_blocked',
        message: '该 IP 已被安全系统封禁。',
      }
    }

    switch (this.state.level) {
      case ISOLATION_LEVELS.NORMAL:
        return { allowed: true, reason: 'normal' }

      case ISOLATION_LEVELS.ALERT:
        // 警戒模式：允许所有请求，但增加速率限制提示
        return { allowed: true, reason: 'alert_mode', logLevel: 'warn', rateLimit: true }

      case ISOLATION_LEVELS.QUARANTINE:
        // 半隔离：只允许健康检查、登录相关、管理员解除隔离接口
        // 但半隔离期间禁止外部 IP 继续尝试登录/注册（防止暴力破解在隔离后继续）
        if (this._isAuthPath(path) && !this.isLocal(ip)) {
          return {
            allowed: false,
            reason: 'quarantine_auth_blocked',
            message: '半隔离期间外部 IP 禁止登录/注册，请等待自动恢复或联系管理员。',
          }
        }
        if (this._isEssentialPath(path)) {
          return { allowed: true, reason: 'essential_path' }
        }
        return {
          allowed: false,
          reason: 'quarantine_active',
          message: '系统处于半隔离状态，仅保留登录和核心接口，请联系管理员。',
        }

      case ISOLATION_LEVELS.LOCKDOWN:
        // 完全隔离：只放行健康检查/探测接口（让前端能感知状态）和本地管理员解除隔离接口
        if (path.startsWith('/api/health') || path.startsWith('/api/ping')) {
          return { allowed: true, reason: 'lockdown_probe' }
        }
        if (path.startsWith('/api/admin/isolation') && this.isLocal(ip)) {
          return { allowed: true, reason: 'admin_recovery_local' }
        }
        return {
          allowed: false,
          reason: 'lockdown_active',
          message: '系统已自动进入完全隔离模式，所有外部访问被拒绝。',
        }

      default:
        return { allowed: true, reason: 'unknown_level' }
    }
  }

  _isAuthPath(path) {
    return [
      '/api/login',
      '/api/register',
      '/api/forgot-password',
      '/api/refresh-token',
      '/api/admin/login',
      '/api/admin/captcha',
      '/api/captcha',
    ].some(p => path.startsWith(p))
  }

  // IP 级封禁（可持久化，重启后仍然有效）
  blockIp(ip, reason = 'manual', durationMs = 24 * 60 * 60 * 1000) {
    if (!ip || this.isLocal(ip)) return
    const now = Date.now()
    this.ipBlocklist.set(ip, {
      blockedAt: now,
      expiresAt: durationMs ? now + durationMs : null,
      reason,
    })
    this.saveState(true)
    console.error(`[AutoIsolation] IP 已封禁: ${ip}, reason=${reason}, duration=${durationMs || 'permanent'}`)
  }

  unblockIp(ip) {
    if (!ip) return false
    const had = this.ipBlocklist.has(ip)
    this.ipBlocklist.delete(ip)
    if (had) this.saveState(true)
    return had
  }

  _isIpBlocked(ip) {
    if (!ip) return false
    const record = this.ipBlocklist.get(ip)
    if (!record) return false
    if (record.expiresAt && record.expiresAt <= Date.now()) {
      this.ipBlocklist.delete(ip)
      return false
    }
    return true
  }

  _getIp(req) {
    // 使用统一的受信任代理感知 IP 解析，防止 X-Forwarded-For 伪造本地 IP 绕过隔离
    return getClientIP(req)
  }

  _extractContext(req) {
    return {
      ip: this._getIp(req),
      path: req.path || req.url || '/',
      method: req.method || 'GET',
      userAgent: req.headers['user-agent'],
      userId: req.userId,
      honeypotTriggered: req.honeypotTriggered,
      failedLoginRate: req.failedLoginRate || 0,
    }
  }

  _isEssentialPath(path) {
    const essentials = [
      '/api/health',
      '/api/ping',
      '/api/csrf-token',
      '/api/captcha',
      '/api/login',
      '/api/register',
      '/api/refresh-token',
      '/api/logout',
      '/api/forgot-password',
      '/api/admin/isolation',
    ]
    return essentials.some(p => path.startsWith(p))
  }

  // 通用事件记录与阈值检查
  _recordEvent(key, req, detail = {}) {
    const ip = this._getIp(req)
    if (!this._shouldCount(ip)) return null

    const now = Date.now()
    const event = {
      timestamp: now,
      ip,
      path: req.path || req.url || '/',
      userAgent: req.headers?.['user-agent'],
      ...detail,
    }

    this.state[key].push(event)

    const cfg = this.config.triggers[key.replace(/Events$/, '')]

    // 每次事件都尝试持久化（节流），避免重启后事件丢失导致无法触发隔离
    this.saveState()

    if (!cfg || !cfg.windowMs) return event

    // 清理过期事件
    this.state[key] = this.state[key].filter(e => now - e.timestamp < cfg.windowMs)

    // 按 IP 独立计数：同一攻击源达到阈值才触发隔离，避免多正常用户累加误报
    const count = this.state[key].filter(e => e.ip === ip).length

    // 同时输入智能隔离引擎，进行多维度威胁画像和攻击链预测
    try {
      const eventType = key.replace(/Events$/, '').toUpperCase()
      this.smart.recordEvent(eventType, this._extractContext(req), { ...detail, count })
    } catch {}

    // 严重重复攻击直接封禁该 IP（比全局隔离更精准）
    if (count >= (cfg.lockdownThreshold || Infinity) * 2) {
      this.blockIp(ip, `${key}_repeat_offender`, 7 * 24 * 60 * 60 * 1000)
    }

    return { event, count, cfg }
  }

  // 记录 AI 决策事件并评估是否需要升级隔离
  recordDecision(decision, req) {
    if (!decision || decision.action === 'ALLOW') return

    // 智能隔离扩展：rule-based 的 recordXxx 已在内部将事件输入 smart 引擎，
    // 此处不再重复调用 smart.recordDecision，避免同一攻击被重复计分。

    const now = Date.now()
    this.state.decisionEvents.push({
      timestamp: now,
      action: decision.action,
      severity: decision.severity,
      confidence: decision.confidence,
      ip: decision.context?.ip,
      path: decision.context?.endpoint,
      id: decision.id,
    })

    // 清理过期事件
    const windowMs = this.config.triggers.decisionBurst.windowMs
    this.state.decisionEvents = this.state.decisionEvents.filter(e => now - e.timestamp < windowMs)

    const ip = decision.context?.ip
    const sameIpEvents = ip ? this.state.decisionEvents.filter(e => e.ip === ip) : this.state.decisionEvents
    const criticalCount = sameIpEvents.filter(e => e.severity === 'critical').length
    const highCount = sameIpEvents.filter(e => e.severity === 'high' || e.severity === 'critical').length

    if (criticalCount >= this.config.triggers.decisionBurst.criticalThreshold) {
      this.activate(ISOLATION_LEVELS.LOCKDOWN, 'critical_decision_burst', {
        criticalCount,
        highCount,
        windowMs,
        ip,
      })
    } else if (highCount >= this.config.triggers.decisionBurst.highThreshold) {
      this.activate(ISOLATION_LEVELS.QUARANTINE, 'high_decision_burst', {
        highCount,
        windowMs,
        ip,
      })
    }
  }

  // 判断路径是否为配置的敏感路径
  _isSensitivePath(path) {
    const normalized = (path || '/').toLowerCase()
    // 管理隔离接口自身不应被计入敏感扫描，否则查询状态会形成正反馈
    const excluded = ['/api/admin/isolation']
    if (excluded.some(p => normalized.startsWith(p))) return false
    return this.config.triggers.sensitiveAccess.paths.some(p =>
      normalized === p.toLowerCase() || normalized.startsWith(p.toLowerCase())
    )
  }

  // 记录敏感路径访问（仅对真正敏感路径计数，防止普通请求误报）
  recordSensitiveAccess(req) {
    const path = req.path || req.url || '/'
    if (!this._isSensitivePath(path)) return

    const result = this._recordEvent('sensitiveAccessEvents', req)
    if (!result) return

    const { count, cfg } = result
    if (count >= (cfg.lockdownThreshold || Infinity)) {
      this.activate(ISOLATION_LEVELS.LOCKDOWN, 'sensitive_access_burst_lockdown', {
        externalCount: count,
        recentPaths: this.state.sensitiveAccessEvents.slice(-5).map(e => e.path),
      })
    } else if (count >= cfg.burstThreshold) {
      this.activate(ISOLATION_LEVELS.QUARANTINE, 'sensitive_access_burst', {
        externalCount: count,
        recentPaths: this.state.sensitiveAccessEvents.slice(-5).map(e => e.path),
      })
    }
  }

  // 记录管理员接口未授权访问
  recordAdminAttack(req, detail = {}) {
    const result = this._recordEvent('adminAttackEvents', req, detail)
    if (!result) return

    const { count, cfg } = result
    if (count >= (cfg.lockdownThreshold || Infinity)) {
      this.activate(ISOLATION_LEVELS.LOCKDOWN, 'admin_attack_lockdown', {
        attackCount: count,
        recentPaths: this.state.adminAttackEvents.slice(-5).map(e => e.path),
      })
    } else if (count >= cfg.burstThreshold) {
      this.activate(ISOLATION_LEVELS.QUARANTINE, 'admin_attack', {
        attackCount: count,
        recentPaths: this.state.adminAttackEvents.slice(-5).map(e => e.path),
      })
    }
  }

  // 记录 JWT 异常
  recordJwtAnomaly(req, detail = {}) {
    const result = this._recordEvent('jwtAnomalyEvents', req, detail)
    if (!result) return

    const { count, cfg } = result
    if (count >= (cfg.lockdownThreshold || Infinity)) {
      this.activate(ISOLATION_LEVELS.QUARANTINE, 'jwt_anomaly_lockdown', {
        anomalyCount: count,
        recentPaths: this.state.jwtAnomalyEvents.slice(-5).map(e => e.path),
      })
    } else if (count >= cfg.burstThreshold) {
      this.activate(ISOLATION_LEVELS.ALERT, 'jwt_anomaly', {
        anomalyCount: count,
        recentPaths: this.state.jwtAnomalyEvents.slice(-5).map(e => e.path),
      })
    }
  }

  // 记录扫描行为（404 敏感路径）
  recordScanPattern(req, detail = {}) {
    const result = this._recordEvent('scanPatternEvents', req, detail)
    if (!result) return

    const { count, cfg } = result
    if (count >= (cfg.lockdownThreshold || Infinity)) {
      this.activate(ISOLATION_LEVELS.QUARANTINE, 'scan_pattern_lockdown', {
        scanCount: count,
        recentPaths: this.state.scanPatternEvents.slice(-5).map(e => e.path),
      })
    } else if (count >= cfg.burstThreshold) {
      this.activate(ISOLATION_LEVELS.ALERT, 'scan_pattern', {
        scanCount: count,
        recentPaths: this.state.scanPatternEvents.slice(-5).map(e => e.path),
      })
    }
  }

  // 记录认证失败
  recordAuthFailure(req, detail = {}) {
    const result = this._recordEvent('authFailureEvents', req, detail)
    if (!result) return

    const { count, cfg } = result
    if (count >= (cfg.lockdownThreshold || Infinity)) {
      this.activate(ISOLATION_LEVELS.QUARANTINE, 'auth_failure_lockdown', {
        failureCount: count,
      })
    } else if (count >= cfg.burstThreshold) {
      this.activate(ISOLATION_LEVELS.ALERT, 'auth_failure', {
        failureCount: count,
      })
    }
  }

  // 记录蜜罐触发
  recordHoneypot(req, detail = {}) {
    const result = this._recordEvent('honeypotEvents', req, detail)
    if (!result) return

    if (this.config.triggers.honeypot.triggerLockdown) {
      this.activate(ISOLATION_LEVELS.LOCKDOWN, 'honeypot_triggered', {
        honeypotCount: this.state.honeypotEvents.length,
        path: req.path || req.url,
      })
    }
  }

  // 记录 Token 重用事件
  recordTokenReuse(ip, tokenPrefix = '') {
    if (!this._shouldCount(ip)) return

    const now = Date.now()
    this.state.tokenReuseEvents.push({
      timestamp: now,
      ip,
      tokenPrefix,
    })

    const windowMs = this.config.triggers.tokenAnomaly.windowMs
    this.state.tokenReuseEvents = this.state.tokenReuseEvents.filter(
      e => now - e.timestamp < windowMs
    )

    const sameIpReuseCount = this.state.tokenReuseEvents.filter(e => e.ip === ip).length
    if (sameIpReuseCount >= this.config.triggers.tokenAnomaly.reuseBurst) {
      this.activate(ISOLATION_LEVELS.LOCKDOWN, 'refresh_token_reuse_burst', {
        reuseCount: sameIpReuseCount,
        ip,
      })
    }
  }

  // 激活隔离
  activate(level, reason, details = {}) {
    if (this.state.level === ISOLATION_LEVELS.LOCKDOWN && level !== ISOLATION_LEVELS.LOCKDOWN) {
      // 完全隔离状态下不降级
      return this.state
    }

    const now = Date.now()
    const isEscalation = LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(this.state.level)

    // 递增惩罚：连续触发隔离会延长自动恢复时间
    let autoRecoverMs = this.config.autoRecovery[level]
    if (isEscalation) {
      this.state.escalationCount += 1
      this.state.lastEscalationAt = now
      // 每次连续触发，恢复时间延长 50%，最多 3 倍
      const multiplier = Math.min(3, 1 + this.state.escalationCount * 0.5)
      if (autoRecoverMs) autoRecoverMs = Math.round(autoRecoverMs * multiplier)
    }

    if (this.state.level === level) {
      // 同级别再次触发：刷新恢复时间并累加惩罚
      this.state.autoRecoverAt = autoRecoverMs ? now + autoRecoverMs : null
      this.state.triggeredBy = reason
      this.state.reason = this._buildReason(reason, details)
      this.saveState(true)
      return this.state
    }

    this.state.level = level
    this.state.triggeredAt = now
    this.state.triggeredBy = reason
    this.state.reason = this._buildReason(reason, details)
    this.state.autoRecoverAt = autoRecoverMs ? now + autoRecoverMs : null
    this.state.manualOverride = false
    this.state.history.unshift({
      level,
      reason,
      details,
      triggeredAt: new Date(now).toISOString(),
      autoRecoverAt: this.state.autoRecoverAt ? new Date(this.state.autoRecoverAt).toISOString() : null,
      escalationCount: this.state.escalationCount,
    })
    if (this.state.history.length > 50) this.state.history.pop()

    this.saveState(true)

    console.error(`[AutoIsolation] ⚠️ 隔离已激活: level=${level}, reason=${reason}, escalation=${this.state.escalationCount}`)
    console.error(`[AutoIsolation] 详情:`, JSON.stringify(details))

    // 触发通知钩子
    this._notify('activate', { level, reason, details, state: this.state })

    return this.state
  }

  _notify(event, payload) {
    for (const hook of this.notifyHooks) {
      try { hook(event, payload) } catch {}
    }
  }

  // 手动解除隔离
  deactivate(adminUserId, adminIp) {
    const previous = this.state.level
    this._recover('manual', { adminUserId, adminIp, previous })
    return this.state
  }

  _recover(source, details = {}) {
    const previous = this.state.level
    if (previous === ISOLATION_LEVELS.NORMAL) return this.state

    this.state.level = ISOLATION_LEVELS.NORMAL
    this.state.triggeredAt = null
    this.state.triggeredBy = null
    this.state.reason = null
    this.state.autoRecoverAt = null
    this.state.decisionEvents = []
    this.state.sensitiveAccessEvents = []
    this.state.adminAttackEvents = []
    this.state.jwtAnomalyEvents = []
    this.state.scanPatternEvents = []
    this.state.authFailureEvents = []
    this.state.tokenReuseEvents = []
    this.state.honeypotEvents = []
    this.state.manualOverride = source === 'manual'

    // 只有冷却 1 小时后仍未再次触发，才重置连续触发计数
    const now = Date.now()
    if (this.state.lastEscalationAt && now - this.state.lastEscalationAt > 60 * 60 * 1000) {
      this.state.escalationCount = 0
    }

    this.state.history.unshift({
      level: 'normal',
      reason: `recovered_from_${previous}`,
      source,
      details,
      recoveredAt: new Date().toISOString(),
    })

    this.saveState(true)
    console.log(`[AutoIsolation] ✅ 隔离已解除: source=${source}, previous=${previous}, escalation=${this.state.escalationCount}`)
    return this.state
  }

  _buildReason(reason, details) {
    const reasons = {
      critical_decision_burst: `1分钟内检测到 ${details.criticalCount} 个严重安全决策，系统已进入完全隔离`,
      high_decision_burst: `1分钟内检测到 ${details.highCount} 个高危安全决策，系统已进入半隔离`,
      sensitive_access_burst: `外部 IP 在短时间内访问敏感路径 ${details.externalCount} 次，系统已进入半隔离`,
      sensitive_access_burst_lockdown: `外部 IP 在短时间内访问敏感路径 ${details.externalCount} 次，系统已进入完全隔离`,
      admin_attack: `检测到 ${details.attackCount} 次未授权管理员接口访问，系统已进入半隔离`,
      admin_attack_lockdown: `检测到 ${details.attackCount} 次未授权管理员接口访问，系统已进入完全隔离`,
      jwt_anomaly: `检测到 ${details.anomalyCount} 次 JWT 异常，系统已进入警戒模式`,
      jwt_anomaly_lockdown: `检测到 ${details.anomalyCount} 次 JWT 异常，系统已进入半隔离`,
      scan_pattern: `检测到 ${details.scanCount} 次扫描行为，系统已进入警戒模式`,
      scan_pattern_lockdown: `检测到 ${details.scanCount} 次扫描行为，系统已进入半隔离`,
      auth_failure: `检测到 ${details.failureCount} 次认证失败，系统已进入警戒模式`,
      auth_failure_lockdown: `检测到 ${details.failureCount} 次认证失败，系统已进入半隔离`,
      honeypot_triggered: `检测到蜜罐被触发 ${details.honeypotCount} 次，系统已进入完全隔离`,
      refresh_token_reuse_burst: `检测到 ${details.reuseCount} 次 Refresh Token 重用，系统已进入完全隔离`,
      manual: '管理员手动触发隔离',
    }
    return reasons[reason] || reason
  }

  _startRecoveryTimer() {
    setInterval(() => {
      if (this.state.autoRecoverAt && Date.now() >= this.state.autoRecoverAt) {
        this._recover('auto')
      }
    }, 30 * 1000)
  }

  getStatus() {
    return {
      level: this.state.level,
      isActive: this.isActive(),
      triggeredAt: this.state.triggeredAt,
      triggeredBy: this.state.triggeredBy,
      reason: this.state.reason,
      autoRecoverAt: this.state.autoRecoverAt,
      timeUntilRecovery: this.state.autoRecoverAt
        ? Math.max(0, this.state.autoRecoverAt - Date.now())
        : null,
      escalationCount: this.state.escalationCount,
      lastEscalationAt: this.state.lastEscalationAt,
      ipBlocklistSize: this.ipBlocklist.size,
      recentBlockedIps: [...this.ipBlocklist.entries()].slice(-10).map(([ip, item]) => ({
        ip,
        blockedAt: item.blockedAt,
        expiresAt: item.expiresAt,
        reason: item.reason,
      })),
      recentDecisionEvents: this.state.decisionEvents.slice(-10),
      recentSensitiveAccess: this.state.sensitiveAccessEvents.slice(-10),
      recentAdminAttacks: this.state.adminAttackEvents.slice(-10),
      recentJwtAnomalies: this.state.jwtAnomalyEvents.slice(-10),
      recentScanPatterns: this.state.scanPatternEvents.slice(-10),
      recentAuthFailures: this.state.authFailureEvents.slice(-10),
      recentTokenReuse: this.state.tokenReuseEvents.slice(-10),
      recentHoneypot: this.state.honeypotEvents.slice(-10),
      history: this.state.history.slice(0, 10),
      smartIsolation: this.smart.getStats(),
    }
  }
}

// 单例
export const autoIsolation = new AutoIsolationSystem()
export { AutoIsolationSystem }

// Express 中间件：在请求最前端检查隔离状态并收集威胁信号
export function isolationMiddleware(req, res, next) {
  const result = autoIsolation.checkRequest(req)

  // 响应结束时统一收集信号（必须在最前端注册，确保能观察到最终状态码）
  const finishHandler = () => {
    res.off('finish', finishHandler)
    res.off('close', finishHandler)
    autoIsolation.collectRequestSignal(req, res)
  }
  res.on('finish', finishHandler)
  res.on('close', finishHandler)

  if (!result.allowed) {
    res.setHeader('X-Isolation-Level', autoIsolation.level)
    return res.status(503).json({
      success: false,
      message: result.message,
      code: 'ISOLATION_BLOCKED',
      isolation: {
        level: autoIsolation.level,
        reason: autoIsolation.state.reason,
      },
    })
  }

  if (result.logLevel === 'warn') {
    console.warn(`[AutoIsolation] 警戒模式请求: ${req.method} ${req.path} from ${autoIsolation._getIp(req)}`)
  }

  if (result.rateLimit) {
    // 警戒模式下给前端/代理一个信号，可配合速率限制进一步收紧
    res.setHeader('X-Isolation-RateLimit', '1')
  }

  next()
}

// 辅助函数：生成当前请求的摘要哈希，用于 token 前缀
export function hashTokenPrefix(token) {
  if (!token) return ''
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 8)
}
