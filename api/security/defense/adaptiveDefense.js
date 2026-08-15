class AdaptiveDefense {
  constructor() {
    this.rateLimitOverride = new Map()
    this.activeThreats = new Map()
    this.mitigationLog = []
  }

  evaluate(context, decision, patterns) {
    const actions = []
    const ip = context.ip

    if (decision.action === 'BLOCK' || decision.severity === 'critical') {
      this.escalateRateLimit(ip, 5)
      actions.push('RATE_LIMIT_STRICT')
    }

    if (decision.action === 'CHALLENGE') {
      this.escalateRateLimit(ip, 3)
      actions.push('RATE_LIMIT_MODERATE')
    }

    if (patterns && patterns.length > 0) {
      const criticalPatterns = patterns.filter(p => p.severity === 'critical')
      if (criticalPatterns.length > 0) {
        this.escalateRateLimit(ip, 10)
        actions.push('ACTIVE_MITIGATION')
      }
    }

    if (decision.confidence < 0.4) {
      actions.push('OBSERVE_ONLY')
    }

    if (actions.length > 0) {
      this.mitigationLog.push({
        ip,
        time: Date.now(),
        decision: decision.action,
        confidence: decision.confidence,
        actions,
      })
    }

    return actions
  }

  escalateRateLimit(ip, multiplier) {
    this.rateLimitOverride.set(ip, {
      multiplier,
      expires: Date.now() + 3600000,
    })
  }

  getRateLimitMultiplier(ip) {
    const override = this.rateLimitOverride.get(ip)
    if (!override) return 1
    if (Date.now() > override.expires) {
      this.rateLimitOverride.delete(ip)
      return 1
    }
    return override.multiplier
  }

  getActiveThreats() {
    const threats = []
    for (const [ip, data] of this.activeThreats) {
      if (Date.now() - data.time < 3600000) {
        threats.push({ ip, action: data.action, confidence: data.confidence })
      }
    }
    return threats
  }

  getStats() {
    return {
      rateLimitOverrides: this.rateLimitOverride.size,
      activeThreats: this.getActiveThreats().length,
      recentMitigations: this.mitigationLog.slice(-20).reverse(),
    }
  }
}

export const adaptiveDefense = new AdaptiveDefense()