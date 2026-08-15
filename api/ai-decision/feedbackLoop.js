// ===== 决策反馈闭环 =====

export class FeedbackLoop {
  constructor(decisionEngine) {
    this.engine = decisionEngine
    this.feedback = []
    this.minForRetrain = 50
  }

  record(decisionId, actualOutcome) {
    const decision = this.engine.history?.get(decisionId)
    if (!decision) return null

    const entry = {
      decisionId,
      predicted: decision.action,
      confidence: decision.confidence,
      outcome: actualOutcome, // 'TP' | 'FP' | 'FN' | 'TN'
      modelContributions: decision.modelContributions,
      timestamp: Date.now(),
      latency: decision.latency,
    }

    this.feedback.push(entry)
    if (this.feedback.length > 1000) this.feedback.shift()

    // 调整模型信任度
    if (entry.outcome === 'FP' || entry.outcome === 'FN') {
      const penalty = entry.outcome === 'FP' ? -0.03 : -0.05
      for (const [model, contrib] of Object.entries(entry.modelContributions || {})) {
        this.engine.fusion.adjustTrust(model, penalty * (contrib || 0.5))
      }
    }

    // 达到阈值触发重新评估
    if (this.feedback.filter(f => f.outcome === 'FP' || f.outcome === 'FN').length >= this.minForRetrain) {
      this.retrain()
    }

    return entry
  }

  getStats() {
    const total = this.feedback.length
    if (total === 0) return { accuracy: 0, total: 0 }
    const correct = this.feedback.filter(f => f.outcome === 'TP' || f.outcome === 'TN').length
    return {
      accuracy: correct / total,
      total,
      falsePositives: this.feedback.filter(f => f.outcome === 'FP').length,
      falseNegatives: this.feedback.filter(f => f.outcome === 'FN').length,
      modelTrust: this.engine.fusion.modelTrust,
    }
  }

  retrain() {
    const falsePositives = this.feedback.filter(f => f.outcome === 'FP')
    const falseNegatives = this.feedback.filter(f => f.outcome === 'FN')

    const fpRate = falsePositives.length / Math.max(this.feedback.length, 1)
    const fnRate = falseNegatives.length / Math.max(this.feedback.length, 1)

    if (fpRate > 0.05 || fnRate > 0.01) {
      import('./thresholdOptimizer.js').then(({ thresholdOptimizer }) => {
        thresholdOptimizer.optimizeWithEngine(this.engine).catch(() => {})
      })
    }

    this.feedback = []
  }

  recordOutcome(decision, actualOutcome) {
    // actualOutcome: 'attack_confirmed' | 'benign_confirmed'
    const isAttackPredicted = decision.action === 'BLOCK' || decision.action === 'CHALLENGE'
    const isActuallyAttack = actualOutcome === 'attack_confirmed'

    let outcome
    if (isAttackPredicted && isActuallyAttack) outcome = 'correct'
    else if (!isAttackPredicted && !isActuallyAttack) outcome = 'true_negative'
    else if (isAttackPredicted && !isActuallyAttack) outcome = 'false_positive'
    else outcome = 'false_negative'

    const contributions = decision.modelContributions || {}
    for (const model of Object.keys(contributions)) {
      if (contributions[model] > 0.2) {
        this.engine.fusion.updateTrust(model, outcome)
      }
    }

    this.feedback.push({
      decisionId: decision.id,
      predicted: decision.action,
      confidence: decision.confidence,
      outcome: isAttackPredicted && isActuallyAttack ? 'TP' :
               !isAttackPredicted && !isActuallyAttack ? 'TN' :
               isAttackPredicted && !isActuallyAttack ? 'FP' : 'FN',
      modelContributions: contributions,
      timestamp: Date.now(),
      latency: decision.latency,
    })
    if (this.feedback.length > 1000) this.feedback.shift()
  }
}