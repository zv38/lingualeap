// ===== AI 规则引擎 — 专家知识库 =====

const ACTION_PRIORITY = { BLOCK: 5, CHALLENGE: 4, DEGRADE: 3, OBSERVE: 2, ALLOW: 1 }

export class RuleEngine {
  constructor() {
    this.rules = this.loadRules()
    this.stats = new Map()
  }

  loadRules() {
    return [
      { id: 'R001', name: '暴力破解', priority: 100, action: 'BLOCK', severity: 'critical',
        check: ctx => ctx.failedLogins >= 5 && ctx.period < 900000 },
      { id: 'R002', name: '凭证填充', priority: 95, action: 'BLOCK', severity: 'critical',
        check: ctx => ctx.uniqueEmails >= 10 && ctx.period < 600000 },
      { id: 'R003', name: '已知恶意IP', priority: 100, action: 'BLOCK', severity: 'critical',
        check: ctx => ctx.ipReputation < 20 },
      { id: 'R004', name: '批量注册', priority: 90, action: 'BLOCK', severity: 'critical',
        check: ctx => ctx.registrationsThisHour >= 5 },

      { id: 'R005', name: '异常UA切换', priority: 80, action: 'CHALLENGE', severity: 'high',
        check: ctx => ctx.uaSwitches >= 3 },
      { id: 'R006', name: '低于300ms请求间隔', priority: 75, action: 'CHALLENGE', severity: 'high',
        check: ctx => ctx.minInterval < 300 && ctx.requestCount >= 10 },
      { id: 'R007', name: '蜜罐触发', priority: 85, action: 'BLOCK', severity: 'high',
        check: ctx => ctx.honeypotTriggered },
      { id: 'R008', name: '提示注入', priority: 82, action: 'CHALLENGE', severity: 'critical',
        check: ctx => ctx.promptInjectScore >= 60 },

      { id: 'R009', name: '请求频率过高', priority: 60, action: 'DEGRADE', severity: 'medium',
        check: ctx => ctx.requestsPerMinute >= 60 },
      { id: 'R010', name: '非浏览器访问', priority: 55, action: 'DEGRADE', severity: 'medium',
        check: ctx => !ctx.isBrowser },
      { id: 'R011', name: '无设备指纹', priority: 50, action: 'DEGRADE', severity: 'medium',
        check: ctx => !ctx.hasFingerprint },

      { id: 'R012', name: '异地登录', priority: 30, action: 'OBSERVE', severity: 'low',
        check: ctx => ctx.geoDistance > 1000 },
      { id: 'R013', name: '新设备', priority: 20, action: 'OBSERVE', severity: 'low',
        check: ctx => ctx.isNewDevice },
      { id: 'R014', name: '非常用时间段', priority: 15, action: 'OBSERVE', severity: 'low',
        check: ctx => ctx.unusualHour },
    ]
  }

  evaluate(context) {
    const matched = []
    let topAction = 'ALLOW'
    let topPriority = 0
    let totalScore = 0

    for (const rule of this.rules) {
      try {
        if (rule.check(context)) {
          matched.push(rule.id)
          this.stats.set(rule.id, (this.stats.get(rule.id) || 0) + 1)
          const p = ACTION_PRIORITY[rule.action] || 0
          if (p > ACTION_PRIORITY[topAction]) {
            topAction = rule.action
            topPriority = rule.priority
          }
          totalScore += rule.priority
        }
      } catch {}
    }

    return {
      action: topAction,
      confidence: Math.min(1, totalScore / 300),
      matchedRules: matched,
      detail: this.rules.filter(r => matched.includes(r.id)).map(r => ({
        id: r.id, name: r.name, action: r.action, severity: r.severity,
      })),
      topPriority,
    }
  }

  updateRule(id, changes) {
    const rule = this.rules.find(r => r.id === id)
    if (!rule) return false
    if (changes.priority !== undefined) rule.priority = changes.priority
    if (changes.action !== undefined) rule.action = changes.action
    return true
  }
}