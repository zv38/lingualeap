// ===== 时序行为模型 =====
// 基于请求序列计算转移异常分，识别扫描、爆破、爬虫

export class TemporalModel {
  constructor(options = {}) {
    this.enabled = process.env.AI_TEMPORAL_MODEL !== 'false' && process.env.AI_ENHANCED_DEFENSE === 'true'
    this.windowSize = options.windowSize || 200
    this.timeWindowMs = options.timeWindowMs || 60 * 1000
    this.sequences = new Map()
    this.transitionCounts = new Map()
  }

  getKey(context) {
    return context.userId || context.sessionId || context.ip || 'unknown'
  }

  normalizePath(path) {
    if (!path) return '/'
    return path.replace(/\/[0-9a-f-]{20,}/gi, '/:id').replace(/\?.*$/, '')
  }

  record(context) {
    if (!this.enabled) return { enabled: false, score: 0 }
    const key = this.getKey(context)
    const now = Date.now()
    const state = `${context.method || 'GET'}:${this.normalizePath(context.path)}`
    const entry = this.sequences.get(key) || { states: [], timestamps: [], firstSeen: now }

    entry.states.push(state)
    entry.timestamps.push(now)

    while (
      entry.states.length > this.windowSize ||
      (entry.timestamps.length > 0 && now - entry.timestamps[0] > this.timeWindowMs)
    ) {
      entry.states.shift()
      entry.timestamps.shift()
    }

    this.sequences.set(key, entry)

    if (entry.states.length < 3) {
      return { enabled: true, score: 0, signals: [] }
    }

    return this.analyze(entry, context)
  }

  analyze(entry, context) {
    const signals = []
    let score = 0
    const states = entry.states
    const key = this.getKey(context)

    // 1. 路径转移异常：新转移模式越少见，异常分越高
    let transitionAnomaly = 0
    const keyTransitions = this.transitionCounts.get(key) || new Map()
    for (let i = 1; i < states.length; i++) {
      const prev = states[i - 1]
      const curr = states[i]
      const transKey = `${prev}->${curr}`
      const count = keyTransitions.get(transKey) || 0
      transitionAnomaly += 1 / (count + 1)
      keyTransitions.set(transKey, count + 1)
    }
    this.transitionCounts.set(key, keyTransitions)
    transitionAnomaly /= Math.max(states.length - 1, 1)

    if (transitionAnomaly > 0.5) {
      signals.push({ type: 'NOVEL_TRANSITION_PATTERN', value: transitionAnomaly.toFixed(2), risk: 'medium' })
      score += Math.min(transitionAnomaly * 0.3, 0.4)
    }

    // 2. 敏感路径扫描密度
    const sensitiveKeywords = ['admin', 'config', 'env', 'src', 'api/internal', 'backup', 'debug']
    const recent = states.slice(-20)
    const sensitiveCount = recent.filter((s) =>
      sensitiveKeywords.some((k) => s.toLowerCase().includes(k))
    ).length
    if (sensitiveCount >= 5) {
      signals.push({ type: 'SENSITIVE_PATH_SCANNING', value: sensitiveCount, risk: 'high' })
      score += 0.35
    }
    if (recent.length > 0 && sensitiveCount / recent.length > 0.5) {
      signals.push({ type: 'HIGH_SENSITIVE_DENSITY', value: `${(sensitiveCount / recent.length * 100).toFixed(0)}%`, risk: 'high' })
      score += 0.2
    }

    // 3. 快速方法切换（API 探测）
    const methods = states.map((s) => s.split(':')[0])
    let methodSwitches = 0
    for (let i = 1; i < methods.length; i++) {
      if (methods[i] !== methods[i - 1]) methodSwitches++
    }
    if (methodSwitches >= 5 && states.length >= 10) {
      signals.push({ type: 'RAPID_METHOD_SWITCHING', value: methodSwitches, risk: 'medium' })
      score += 0.2
    }

    // 4. 登录相关路径的重复失败模式
    const loginStates = states.filter((s) => s.includes('/login') || s.includes('/auth'))
    if (loginStates.length >= 5) {
      const uniqueLoginPaths = new Set(loginStates).size
      if (uniqueLoginPaths <= 2) {
        signals.push({ type: 'REPEATED_LOGIN_PATTERN', value: loginStates.length, risk: 'high' })
        score += 0.25
      }
    }

    const finalScore = Math.min(score, 0.99)
    return {
      enabled: true,
      score: finalScore,
      signals,
      alert: finalScore >= 0.5,
      recommendedAction: finalScore >= 0.75 ? 'BLOCK' : finalScore >= 0.5 ? 'CHALLENGE' : 'OBSERVE',
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalSequences: this.sequences.size,
      totalTransitions: [...this.transitionCounts.values()].reduce(
        (sum, m) => sum + [...m.values()].reduce((a, b) => a + b, 0),
        0
      ),
    }
  }
}

export const temporalModel = new TemporalModel()
