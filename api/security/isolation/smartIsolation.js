// ===== 智能隔离引擎 =====
// 基于多维度威胁画像、攻击链预测、动态阈值的隔离决策系统

const ISOLATION_LEVELS = {
  NORMAL: 'normal',
  ALERT: 'alert',
  QUARANTINE: 'quarantine',
  LOCKDOWN: 'lockdown',
}

export const DEFAULT_POLICIES = {
  RECONNAISSANCE: { level: ISOLATION_LEVELS.ALERT, autoRecoverMs: 5 * 60 * 1000, threatScore: 15 },
  SENSITIVE_ACCESS: { level: ISOLATION_LEVELS.QUARANTINE, autoRecoverMs: 30 * 60 * 1000, threatScore: 35 },
  ADMIN_ATTACK: { level: ISOLATION_LEVELS.QUARANTINE, autoRecoverMs: 30 * 60 * 1000, threatScore: 50 },
  JWT_ANOMALY: { level: ISOLATION_LEVELS.ALERT, autoRecoverMs: 10 * 60 * 1000, threatScore: 20 },
  AUTH_FAILURE: { level: ISOLATION_LEVELS.ALERT, autoRecoverMs: 10 * 60 * 1000, threatScore: 18 },
  SCAN_PATTERN: { level: ISOLATION_LEVELS.ALERT, autoRecoverMs: 10 * 60 * 1000, threatScore: 22 },
  HONEYPOT: { level: ISOLATION_LEVELS.LOCKDOWN, autoRecoverMs: 0, threatScore: 100 },
  CREDENTIAL_STUFFING: { level: ISOLATION_LEVELS.LOCKDOWN, autoRecoverMs: 0, threatScore: 90 },
  TOKEN_REUSE: { level: ISOLATION_LEVELS.LOCKDOWN, autoRecoverMs: 0, threatScore: 95 },
  WAF_BLOCK: { level: ISOLATION_LEVELS.QUARANTINE, autoRecoverMs: 20 * 60 * 1000, threatScore: 40 },
  SUSPICIOUS_UA: { level: ISOLATION_LEVELS.ALERT, autoRecoverMs: 5 * 60 * 1000, threatScore: 16 },
}

const LEVEL_ORDER = ['normal', 'alert', 'quarantine', 'lockdown']

export class SmartIsolation {
  constructor(isolationSystem) {
    // 默认启用，可通过环境变量显式关闭
    this.enabled = process.env.AI_SMART_ISOLATION !== 'false'
    this.isolation = isolationSystem
    this.policies = { ...DEFAULT_POLICIES }
    // 多维度画像
    this.ipProfiles = new Map()
    this.userProfiles = new Map()
    this.deviceProfiles = new Map()
    // 攻击链
    this.attackChains = new Map()
    // 全局统计用于动态阈值
    this.globalStats = {
      totalEvents: 0,
      blockedEvents: 0,
      lastReset: Date.now(),
    }
  }

  recordEvent(type, context, detail = {}) {
    if (!this.enabled) return
    if (!context) return

    const now = Date.now()
    const ip = context.ip || 'unknown'
    const userId = context.userId || null
    const deviceId = context.deviceId || context.fingerprint || null

    const policy = this.policies[type] || DEFAULT_POLICIES.RECONNAISSANCE

    // 更新各维度画像
    this._updateProfile(this.ipProfiles, ip, type, policy.threatScore, now, detail)
    if (userId) this._updateProfile(this.userProfiles, userId, type, policy.threatScore, now, detail)
    if (deviceId) this._updateProfile(this.deviceProfiles, deviceId, type, policy.threatScore, now, detail)

    // 更新攻击链
    this._updateAttackChain(ip, type, now)

    this.globalStats.totalEvents += 1

    // 评估是否升级隔离
    this._evaluate(ip, userId, deviceId, now)
  }

  // 兼容旧接口：接收 AI 决策对象
  recordDecision(decision, context) {
    if (!this.enabled) return
    if (!decision || !context) return

    const type = this._classifyDecision(decision, context)
    this.recordEvent(type, context, {
      decisionId: decision.id,
      severity: decision.severity,
      action: decision.action,
      confidence: decision.confidence,
      patterns: decision.patterns?.map(p => p.type),
    })
  }

  _updateProfile(store, key, type, scoreDelta, now, detail) {
    let profile = store.get(key)
    if (!profile) {
      profile = {
        key,
        score: 0,
        events: [],
        firstSeen: now,
        lastEvent: now,
        types: new Set(),
      }
      store.set(key, profile)
    }

    // 时间衰减：5 分钟半衰期
    const decay = Math.exp(-(now - profile.lastEvent) / (5 * 60 * 1000))
    profile.score = profile.score * decay + scoreDelta
    profile.lastEvent = now
    profile.types.add(type)
    profile.events.push({ type, timestamp: now, score: scoreDelta, detail })
    if (profile.events.length > 100) profile.events.shift()
  }

  _updateAttackChain(ip, type, now) {
    let chain = this.attackChains.get(ip)
    if (!chain) {
      chain = { events: [], firstSeen: now }
      this.attackChains.set(ip, chain)
    }
    chain.events.push({ type, timestamp: now })
    if (chain.events.length > 20) chain.events.shift()
  }

  _classifyDecision(decision, context) {
    if (context.honeypotTriggered) return 'HONEYPOT'
    if (decision.patterns?.some(p => p.type.includes('admin'))) return 'ADMIN_ATTACK'
    if (decision.patterns?.some(p => p.type.includes('sensitive') || p.type.includes('scan'))) return 'SENSITIVE_ACCESS'
    if (decision.modelContributions?.statistical > 0.5 && context.failedLoginRate > 0.3) return 'CREDENTIAL_STUFFING'
    if (decision.modelContributions?.temporal > 0.5) return 'RECONNAISSANCE'
    if (decision.modelContributions?.rule > 0.5 && decision.action === 'BLOCK') return 'SENSITIVE_ACCESS'
    if (decision.severity === 'critical') return 'ADMIN_ATTACK'
    if (decision.severity === 'high') return 'SENSITIVE_ACCESS'
    return 'RECONNAISSANCE'
  }

  _evaluate(ip, userId, deviceId, now) {
    const candidates = []
    if (ip && this.ipProfiles.has(ip)) candidates.push(this.ipProfiles.get(ip))
    if (userId && this.userProfiles.has(userId)) candidates.push(this.userProfiles.get(userId))
    if (deviceId && this.deviceProfiles.has(deviceId)) candidates.push(this.deviceProfiles.get(deviceId))

    let targetLevel = ISOLATION_LEVELS.NORMAL
    let reason = '无显著威胁'
    let maxScore = 0

    for (const profile of candidates) {
      const chain = this.attackChains.get(ip) || { events: [] }
      const policy = this._inferPolicy(profile, chain)
      if (LEVEL_ORDER.indexOf(policy.level) > LEVEL_ORDER.indexOf(targetLevel)) {
        targetLevel = policy.level
        reason = policy.reason
        maxScore = Math.max(maxScore, profile.score)
      }
    }

    if (LEVEL_ORDER.indexOf(targetLevel) <= LEVEL_ORDER.indexOf(this.isolation.level)) return

    this.isolation.activate(targetLevel, 'ai_smart_isolation', {
      reason,
      threatScore: Math.round(maxScore),
      ip,
      userId,
      deviceId,
    })
  }

  _inferPolicy(profile, chain) {
    const recent = chain.events.slice(-8).map(e => e.type)
    const recentStr = recent.join(',')

    // 完整攻击链：侦察 → 敏感访问 → 管理员攻击
    if (recentStr.includes('RECONNAISSANCE') && recentStr.includes('SENSITIVE_ACCESS') && recentStr.includes('ADMIN_ATTACK')) {
      return { level: ISOLATION_LEVELS.LOCKDOWN, reason: '检测到完整攻击链（侦察→敏感访问→管理员攻击）', autoRecoverMs: 0 }
    }

    // 凭证攻击链：扫描 → 认证失败 → 凭证填充
    if (recentStr.includes('SCAN_PATTERN') && recentStr.includes('AUTH_FAILURE') && recentStr.includes('CREDENTIAL_STUFFING')) {
      return { level: ISOLATION_LEVELS.LOCKDOWN, reason: '检测到凭证攻击链', autoRecoverMs: 0 }
    }

    // 蜜罐或 Token 重用直接 lockdown
    if (recent.includes('HONEYPOT')) return { level: ISOLATION_LEVELS.LOCKDOWN, reason: '蜜罐触发', autoRecoverMs: 0 }
    if (recent.includes('TOKEN_REUSE')) return { level: ISOLATION_LEVELS.LOCKDOWN, reason: 'Token 重用', autoRecoverMs: 0 }

    // 持续低强度攻击：事件类型多样化且持续
    const uniqueTypes = new Set(recent).size
    if (recent.length >= 6 && uniqueTypes >= 3 && profile.score >= 60) {
      return { level: ISOLATION_LEVELS.QUARANTINE, reason: '持续多向量攻击', autoRecoverMs: 30 * 60 * 1000 }
    }

    // 基于威胁分
    if (profile.score >= 150) return { level: ISOLATION_LEVELS.LOCKDOWN, reason: `威胁分 ${Math.round(profile.score)} >= 150`, autoRecoverMs: 0 }
    if (profile.score >= 90) return { level: ISOLATION_LEVELS.QUARANTINE, reason: `威胁分 ${Math.round(profile.score)} >= 90`, autoRecoverMs: 30 * 60 * 1000 }
    if (profile.score >= 40) return { level: ISOLATION_LEVELS.ALERT, reason: `威胁分 ${Math.round(profile.score)} >= 40`, autoRecoverMs: 10 * 60 * 1000 }

    return { level: ISOLATION_LEVELS.NORMAL, reason: '无显著威胁', autoRecoverMs: 0 }
  }

  getStats() {
    return {
      enabled: this.enabled,
      trackedIps: this.ipProfiles.size,
      trackedUsers: this.userProfiles.size,
      trackedDevices: this.deviceProfiles.size,
      topThreats: [...this.ipProfiles.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 10)
        .map(([ip, p]) => ({ ip, score: Math.round(p.score), events: p.events.length, types: [...p.types] })),
      policies: this.policies,
      globalStats: { ...this.globalStats },
    }
  }

  serializeProfiles() {
    const replacer = (key, value) => {
      if (value instanceof Set) return [...value]
      return value
    }
    return JSON.stringify({
      ipProfiles: [...this.ipProfiles.entries()],
      userProfiles: [...this.userProfiles.entries()],
      deviceProfiles: [...this.deviceProfiles.entries()],
      attackChains: [...this.attackChains.entries()],
      globalStats: this.globalStats,
    }, replacer)
  }

  deserializeProfiles(json) {
    try {
      const data = JSON.parse(json)
      const revive = (entries) => {
        const map = new Map()
        for (const [k, v] of entries || []) {
          if (v.types && Array.isArray(v.types)) v.types = new Set(v.types)
          map.set(k, v)
        }
        return map
      }
      this.ipProfiles = revive(data.ipProfiles)
      this.userProfiles = revive(data.userProfiles)
      this.deviceProfiles = revive(data.deviceProfiles)
      this.attackChains = revive(data.attackChains)
      if (data.globalStats) this.globalStats = data.globalStats
    } catch (err) {
      console.error('[SmartIsolation] 反序列化画像失败:', err.message)
    }
  }
}
