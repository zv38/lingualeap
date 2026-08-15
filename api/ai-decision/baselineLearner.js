// ===== 自适应基线学习器 =====
// 自动学习 IP / 用户 / 端点 / 全局的正常行为基线

export class BaselineLearner {
  constructor() {
    this.enabled = process.env.AI_ADAPTIVE_LEARNING === 'true'
    this.maxSamples = 1000
    this.profiles = {
      ip: new Map(),
      user: new Map(),
      endpoint: new Map(),
      global: this._createProfile(),
    }
  }

  _createProfile() {
    return {
      requestCount: 0,
      hourlyDistribution: new Array(24).fill(0),
      pathDistribution: new Map(),
      methodDistribution: new Map(),
      intervalSum: 0,
      intervalSqSum: 0,
      intervalCount: 0,
      lastSeen: null,
    }
  }

  _updateProfile(profile, context) {
    profile.requestCount++
    const hour = new Date().getHours()
    profile.hourlyDistribution[hour]++

    const path = context.path || '/'
    profile.pathDistribution.set(path, (profile.pathDistribution.get(path) || 0) + 1)

    const method = context.method || 'GET'
    profile.methodDistribution.set(method, (profile.methodDistribution.get(method) || 0) + 1)

    if (profile.lastSeen) {
      const interval = Date.now() - profile.lastSeen
      profile.intervalSum += interval
      profile.intervalSqSum += interval * interval
      profile.intervalCount++
    }
    profile.lastSeen = Date.now()

    if (profile.pathDistribution.size > this.maxSamples) {
      const firstKey = profile.pathDistribution.keys().next().value
      profile.pathDistribution.delete(firstKey)
    }
  }

  learn(context) {
    if (!this.enabled) return { enabled: false }

    this._updateProfile(this.profiles.global, context)
    if (context.ip) {
      if (!this.profiles.ip.has(context.ip)) this.profiles.ip.set(context.ip, this._createProfile())
      this._updateProfile(this.profiles.ip.get(context.ip), context)
    }
    if (context.userId) {
      if (!this.profiles.user.has(context.userId)) this.profiles.user.set(context.userId, this._createProfile())
      this._updateProfile(this.profiles.user.get(context.userId), context)
    }
    const endpoint = `${context.method || 'GET'} ${context.path || '/'}`
    if (!this.profiles.endpoint.has(endpoint)) this.profiles.endpoint.set(endpoint, this._createProfile())
    this._updateProfile(this.profiles.endpoint.get(endpoint), context)

    return { enabled: true }
  }

  anomalyScore(context) {
    if (!this.enabled) return { enabled: false, score: 0 }
    if (this.profiles.global.requestCount < 50) return { enabled: true, score: 0, ready: false }

    const ipProfile = this.profiles.ip.get(context.ip)
    const epProfile = this.profiles.endpoint.get(`${context.method || 'GET'} ${context.path || '/'}`)
    const hour = new Date().getHours()

    let score = 0
    const signals = []

    if (ipProfile && ipProfile.requestCount > 10) {
      const avgInterval = ipProfile.intervalCount > 0 ? ipProfile.intervalSum / ipProfile.intervalCount : 0
      const variance =
        ipProfile.intervalCount > 0
          ? ipProfile.intervalSqSum / ipProfile.intervalCount - avgInterval * avgInterval
          : 0
      const std = Math.sqrt(Math.max(variance, 0))
      const currentInterval = ipProfile.lastSeen ? Date.now() - ipProfile.lastSeen : 0
      if (std > 0 && currentInterval > avgInterval + 3 * std) {
        signals.push({ type: 'UNUSUAL_INTERVAL_FOR_IP', value: currentInterval, risk: 'medium' })
        score += 0.2
      }
    }

    if (epProfile && epProfile.requestCount > 20) {
      const hourWeight = epProfile.hourlyDistribution[hour] / epProfile.requestCount
      if (hourWeight < 0.01) {
        signals.push({ type: 'UNUSUAL_HOUR_FOR_ENDPOINT', value: hour, risk: 'low' })
        score += 0.1
      }
    }

    return { enabled: true, score: Math.min(score, 0.99), signals, ready: true }
  }

  getStats() {
    return {
      enabled: this.enabled,
      ipProfiles: this.profiles.ip.size,
      userProfiles: this.profiles.user.size,
      endpointProfiles: this.profiles.endpoint.size,
      globalRequests: this.profiles.global.requestCount,
    }
  }
}

export const baselineLearner = new BaselineLearner()
