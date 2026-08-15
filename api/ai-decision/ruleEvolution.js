// ===== 在线规则进化器 =====
// 自动发现高频攻击模式并生成候选规则

export class RuleEvolution {
  constructor() {
    this.enabled = process.env.AI_RULE_EVOLUTION === 'true'
    this.observationMs = 10 * 60 * 1000
    this.minHits = 10
    this.maxFalsePositiveRate = 0.05
    this.candidates = new Map()
    this.activeRules = new Map()
    this.ruleCounter = 0
  }

  _key(pattern) {
    return `${pattern.type}:${pattern.value}`
  }

  observe(decision, context) {
    if (!this.enabled) return
    if (decision.action !== 'BLOCK' && decision.action !== 'CHALLENGE') return

    const patterns = [
      { type: 'path-prefix', value: this._extractPrefix(context.path) },
      { type: 'ip', value: context.ip },
      { type: 'ua-keyword', value: this._extractUaKeyword(context.userAgent) },
    ]

    for (const pattern of patterns) {
      if (!pattern.value) continue
      const key = this._key(pattern)
      const existing = this.candidates.get(key) || {
        pattern,
        hits: 0,
        falsePositives: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      }
      existing.hits++
      existing.lastSeen = Date.now()
      this.candidates.set(key, existing)

      this._promote(key, existing)
    }
  }

  _extractPrefix(path) {
    if (!path) return null
    const parts = path.split('/').filter(Boolean)
    if (parts.length < 1) return null
    return `/${parts[0]}`
  }

  _extractUaKeyword(ua) {
    if (!ua) return null
    const lower = ua.toLowerCase()
    const knownBots = ['python-requests', 'curl', 'wget', 'postman', 'insomnia', 'go-http-client']
    for (const bot of knownBots) {
      if (lower.includes(bot)) return bot
    }
    return null
  }

  _promote(key, candidate) {
    if (this.activeRules.has(key)) return
    const age = Date.now() - candidate.firstSeen
    if (age < this.observationMs) return
    if (candidate.hits < this.minHits) return
    const fpRate = candidate.falsePositives / Math.max(candidate.hits, 1)
    if (fpRate > this.maxFalsePositiveRate) {
      this.candidates.delete(key)
      return
    }

    this.ruleCounter++
    this.activeRules.set(key, {
      id: `EVOLVED-${this.ruleCounter}`,
      pattern: candidate.pattern,
      hits: candidate.hits,
      createdAt: new Date().toISOString(),
      action: 'CHALLENGE',
    })
    console.log(`[RuleEvolution] 规则晋升: ${key} (hits=${candidate.hits})`)
  }

  evaluate(context) {
    if (!this.enabled) return null
    for (const rule of this.activeRules.values()) {
      if (this._match(rule.pattern, context)) {
        return { matched: true, rule, action: rule.action }
      }
    }
    return null
  }

  _match(pattern, context) {
    switch (pattern.type) {
      case 'path-prefix':
        return (context.path || '').startsWith(pattern.value)
      case 'ip':
        return context.ip === pattern.value
      case 'ua-keyword':
        return (context.userAgent || '').toLowerCase().includes(pattern.value)
      default:
        return false
    }
  }

  reportFalsePositive(key) {
    const candidate = this.candidates.get(key)
    if (candidate) candidate.falsePositives++
    const rule = this.activeRules.get(key)
    if (rule) {
      rule.falsePositives = (rule.falsePositives || 0) + 1
      const fpRate = rule.falsePositives / Math.max(rule.hits, 1)
      if (fpRate > this.maxFalsePositiveRate) {
        console.log(`[RuleEvolution] 规则降级: ${key} (FP=${fpRate.toFixed(2)})`)
        this.activeRules.delete(key)
      }
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      candidateCount: this.candidates.size,
      activeRuleCount: this.activeRules.size,
      activeRules: [...this.activeRules.values()].slice(-20),
    }
  }
}

export const ruleEvolution = new RuleEvolution()
