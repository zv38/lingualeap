// ===== 统计异常检测模型 (Z-Score based) =====

export class StatisticalModel {
  constructor() {
    this.baselines = new Map()
    this.threshold = 3.0
  }

  update(feature, value) {
    if (!this.baselines.has(feature)) {
      this.baselines.set(feature, { mean: value, m2: 0, count: 1 })
      return
    }
    const b = this.baselines.get(feature)
    b.count++
    const delta = value - b.mean
    b.mean += delta / b.count
    b.m2 += delta * (value - b.mean)
  }

  zScore(feature, value) {
    const b = this.baselines.get(feature)
    if (!b || b.count < 10) return 0
    const variance = b.m2 / b.count
    if (variance === 0) return value === b.mean ? 0 : 10
    return Math.abs((value - b.mean) / Math.sqrt(variance))
  }

  predict(context) {
    const features = {
      requestRate: context.requestsPerMinute || 0,
      intervalConsistency: context.avgInterval || 0,
      failedRate: context.failedLoginRate || 0,
      parallelConns: context.parallelConns || 1,
      payloadSize: context.payloadSize || 0,
      sessionDuration: context.sessionDuration || 0,
    }

    const scores = []
    for (const [key, value] of Object.entries(features)) {
      const z = this.zScore(key, value)
      scores.push({ feature: key, zScore: z, value })
      if (z < 2) this.update(key, value)
    }

    const maxZ = Math.max(...scores.map(s => s.zScore))
    const prob = 1 / (1 + Math.exp(-(maxZ - this.threshold)))

    let action = 'ALLOW'
    if (prob > 0.9) action = 'BLOCK'
    else if (prob > 0.7) action = 'CHALLENGE'
    else if (prob > 0.5) action = 'OBSERVE'

    return {
      action,
      confidence: prob,
      maxZScore: maxZ,
      topAnomalies: scores.sort((a, b) => b.zScore - a.zScore).slice(0, 3),
    }
  }
}