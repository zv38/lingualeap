// ===== AI 行为指纹识别 =====

export class BehaviorFingerprint {
  constructor() {
    this.profiles = new Map()
  }

  extract(session) {
    return {
      eventDistribution: this.calcDistribution(session),
      mouseMetrics: this.mouseAnalysis(session),
      timeMetrics: this.timeAnalysis(session),
      interactionMetrics: this.interactionAnalysis(session),
    }
  }

  calcDistribution(session) {
    const dist = { mouse: 0, keyboard: 0, scroll: 0, focus: 0 }
    for (const e of session.events || []) {
      if (dist[e.type] !== undefined) dist[e.type]++
    }
    const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1
    return {
      mouseRatio: dist.mouse / total,
      keyboardRatio: dist.keyboard / total,
      scrollRatio: dist.scroll / total,
    }
  }

  mouseAnalysis(session) {
    const mouse = (session.events || []).filter(e => e.type === 'mouse')
    if (mouse.length < 5) return { naturalness: 0.5 }

    let straightSegments = 0
    let totalSegments = 0
    for (let i = 2; i < mouse.length; i++) {
      const dx1 = mouse[i - 1].x - mouse[i - 2].x
      const dy1 = mouse[i - 1].y - mouse[i - 2].y
      const dx2 = mouse[i].x - mouse[i - 1].x
      const dy2 = mouse[i].y - mouse[i - 1].y
      totalSegments++
      const angle = Math.abs(Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1))
      if (angle < 0.05) straightSegments++
    }

    return {
      naturalness: 1 - (straightSegments / Math.max(totalSegments, 1)),
      sampleCount: mouse.length,
    }
  }

  timeAnalysis(session) {
    const events = session.events || []
    const intervals = []
    for (let i = 1; i < events.length; i++) {
      intervals.push(events[i].t - events[i - 1].t)
    }
    if (intervals.length < 3) return { consistency: 0.5 }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length
    return {
      consistency: Math.min(1, Math.sqrt(variance) / Math.max(mean, 1)),
      meanInterval: mean,
      sampleCount: intervals.length,
    }
  }

  interactionAnalysis(session) {
    return {
      focusLossRate: session.focusLosses || 0,
      avgScrollDepth: session.scrollDepth || 0,
      interactionDensity: (session.events?.length || 0) / Math.max(session.duration || 1, 1),
    }
  }

  compare(fp1, fp2) {
    let score = 0
    let weight = 0

    if (fp1.mouseMetrics && fp2.mouseMetrics) {
      score += (1 - Math.abs(fp1.mouseMetrics.naturalness - fp2.mouseMetrics.naturalness)) * 0.35
      weight += 0.35
    }
    if (fp1.timeMetrics && fp2.timeMetrics) {
      score += (1 - Math.abs(fp1.timeMetrics.consistency - fp2.timeMetrics.consistency)) * 0.35
      weight += 0.35
    }
    if (fp1.eventDistribution && fp2.eventDistribution) {
      const d1 = fp1.eventDistribution
      const d2 = fp2.eventDistribution
      score += (1 - Math.abs(d1.mouseRatio - d2.mouseRatio)) * 0.15
      score += (1 - Math.abs(d1.keyboardRatio - d2.keyboardRatio)) * 0.15
      weight += 0.30
    }

    return weight > 0 ? score / weight : 0.5
  }

  identify(sessionId, fingerprint) {
    if (!this.profiles.has(sessionId)) {
      this.profiles.set(sessionId, { fingerprint, firstSeen: Date.now(), lastSeen: Date.now() })
      return { known: false, similarity: 0 }
    }

    const profile = this.profiles.get(sessionId)
    profile.lastSeen = Date.now()
    const similarity = this.compare(profile.fingerprint, fingerprint)

    return {
      known: similarity > 0.8,
      similarity,
      isAutomated: similarity < 0.3,
    }
  }
}