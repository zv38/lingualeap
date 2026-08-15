// ===== 贝叶斯融合层 =====

const PRIORITIES = { BLOCK: 5, CHALLENGE: 4, DEGRADE: 3, OBSERVE: 2, ALLOW: 1 }

export class BayesianFusion {
  constructor() {
    this.modelTrust = { rule: 0.85, statistical: 0.75, temporal: 0.7, threatIntel: 0.8, baseline: 0.6 }
  }

  fuse(results) {
    const actionScores = { BLOCK: 0, CHALLENGE: 0, DEGRADE: 0, OBSERVE: 0, ALLOW: 0 }
    let totalWeight = 0

    for (const [model, result] of Object.entries(results)) {
      if (!result) continue
      const trust = this.modelTrust[model] || 0.5
      const weight = trust * (result.confidence || 0.5)
      const action = result.action || 'ALLOW'
      actionScores[action] += weight
      totalWeight += weight
    }

    if (totalWeight === 0) {
      return { action: 'ALLOW', confidence: 0.3, explanation: '无模型输出' }
    }

    const sorted = Object.entries(actionScores).sort((a, b) => b[1] - a[1])
    const best = sorted[0]

    return {
      action: best[0],
      confidence: best[1] / totalWeight,
      explanation: sorted.filter(([, s]) => s > 0).map(([a, s]) => `${a}:${(s * 100 / totalWeight).toFixed(0)}%`).join(' '),
      detail: sorted.map(([a, s]) => ({ action: a, probability: s / totalWeight })),
    }
  }

  adjustTrust(model, delta) {
    const current = this.modelTrust[model] || 0.5
    this.modelTrust[model] = Math.max(0.3, Math.min(0.98, current + delta))
  }

  updateTrust(model, outcome) {
    // outcome: 'correct', 'false_positive', 'false_negative', 'true_negative'
    const delta = {
      correct: 0.05,
      true_negative: 0.02,
      false_positive: -0.1,
      false_negative: -0.08,
    }[outcome] || 0
    this.adjustTrust(model, delta)
  }
}