// ===== 行为层异常检测 =====
// 分析同一 IP / 用户 / session 的连续请求序列，识别自动化、试探、爬虫

class BehaviorAnalyzer {
  constructor() {
    this.enabled = process.env.BEHAVIOR_ANALYSIS !== 'false'
    this.windowMs = 60 * 1000
    this.maxWindow = 200
    this.sessions = new Map() // key -> { requests: [], score: 0 }
    this.alerts = []
    this.maxAlerts = 1000
  }

  getKey(context) {
    return context.userId || context.sessionId || context.ip || 'unknown'
  }

  record(context) {
    if (!this.enabled) return { enabled: false }

    const key = this.getKey(context)
    const now = Date.now()
    const entry = this.sessions.get(key) || { requests: [], score: 0, firstSeen: now }

    entry.requests.push({
      timestamp: now,
      path: context.path,
      method: context.method,
      decision: context.decision,
      latency: context.latency,
    })

    // 滑动窗口
    while (entry.requests.length > this.maxWindow || now - entry.requests[0].timestamp > this.windowMs) {
      entry.requests.shift()
    }

    const analysis = this.analyze(entry.requests, context)
    entry.score = analysis.score
    this.sessions.set(key, analysis.score > 0 ? entry : { requests: entry.requests, score: 0, firstSeen: entry.firstSeen })

    if (analysis.alert) {
      this.alerts.push({
        id: `BEH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key,
        score: analysis.score,
        signals: analysis.signals,
        timestamp: new Date().toISOString(),
      })
      if (this.alerts.length > this.maxAlerts) this.alerts.shift()
    }

    return analysis
  }

  analyze(requests, context) {
    const signals = []
    let score = 0

    if (requests.length < 3) return { score: 0, signals, alert: false }

    // 1. 高频请求
    const span = requests[requests.length - 1].timestamp - requests[0].timestamp
    const rps = span > 0 ? (requests.length / span) * 1000 : requests.length
    if (rps > 10) {
      signals.push({ type: 'HIGH_FREQUENCY', value: rps.toFixed(1), risk: 'high' })
      score += 0.30
    } else if (rps > 4) {
      signals.push({ type: 'ELEVATED_FREQUENCY', value: rps.toFixed(1), risk: 'medium' })
      score += 0.15
    }

    // 2. 路径遍历 / 扫描
    const uniquePaths = new Set(requests.map(r => r.path))
    const pathDiversity = uniquePaths.size / requests.length
    if (uniquePaths.size > 15 && pathDiversity > 0.6) {
      signals.push({ type: 'PATH_SCANNING', value: uniquePaths.size, risk: 'high' })
      score += 0.25
    }

    // 3. 大量失败 / 挑战
    const failures = requests.filter(r => r.decision === 'BLOCK' || r.decision === 'CHALLENGE').length
    const failRate = failures / requests.length
    if (failRate > 0.5 && requests.length >= 5) {
      signals.push({ type: 'HIGH_FAILURE_RATE', value: `${(failRate * 100).toFixed(0)}%`, risk: 'high' })
      score += 0.25
    } else if (failRate > 0.3) {
      signals.push({ type: 'ELEVATED_FAILURE_RATE', value: `${(failRate * 100).toFixed(0)}%`, risk: 'medium' })
      score += 0.12
    }

    // 4. 非人类点击模式：请求间隔过于规律
    const intervals = []
    for (let i = 1; i < requests.length; i++) {
      intervals.push(requests[i].timestamp - requests[i - 1].timestamp)
    }
    if (intervals.length > 5) {
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0
      if (cv < 0.15 && mean < 500) {
        signals.push({ type: 'BOT_LIKE_INTERVALS', value: `${mean.toFixed(0)}ms`, risk: 'high' })
        score += 0.25
      }
    }

    // 5. 快速路由切换（API 探测）
    const methodSwitchCount = requests.slice(1).filter((r, i) => r.method !== requests[i].method).length
    if (methodSwitchCount > 5) {
      signals.push({ type: 'METHOD_SWITCHING', value: methodSwitchCount, risk: 'medium' })
      score += 0.10
    }

    const finalScore = Math.min(score, 0.99)
    return {
      score: finalScore,
      signals,
      alert: finalScore >= 0.55,
      recommendedAction: finalScore >= 0.75 ? 'BLOCK' : finalScore >= 0.55 ? 'CHALLENGE' : 'OBSERVE',
    }
  }

  getSession(key) {
    return this.sessions.get(key) || null
  }

  getTopThreats(limit = 20) {
    return [...this.sessions.entries()]
      .filter(([, v]) => v.score >= 0.3)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([key, v]) => ({
        key,
        score: v.score,
        requestCount: v.requests.length,
        firstSeen: v.firstSeen,
      }))
  }

  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeThreats: this.getTopThreats(1000).length,
      totalAlerts: this.alerts.length,
      recentAlerts: [...this.alerts].reverse().slice(0, 50),
    }
  }
}

export const behaviorAnalyzer = new BehaviorAnalyzer()
