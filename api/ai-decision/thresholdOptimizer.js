import { aiConfigurator } from './aiConfigurator.js'

class ThresholdOptimizer {
  constructor() {
    this.lastOptimization = 0
    this.optimizationHistory = []
    this.COOLDOWN = 3600000
    this.reviewQueue = [] // 人工复核队列
    this.maxQueueSize = 500
    this.thresholds = {
      block: 0.85,
      challenge: 0.55,
      degrade: 0.35,
    }
  }

  async optimize(feedbackLoop, ruleEngine) {
    const now = Date.now()
    if (now - this.lastOptimization < this.COOLDOWN && this.optimizationHistory.length > 0) {
      return { skipped: true, reason: '冷却中', lastRun: this.lastOptimization }
    }

    const stats = feedbackLoop.getStats()
    if (stats.total < 20) {
      return { skipped: true, reason: `样本不足(${stats.total}<20)` }
    }

    const ruleStats = this.collectRuleStats(ruleEngine)
    const prompt = this.buildPrompt(stats, ruleStats)

    try {
      const response = await aiConfigurator.call([
        { role: 'system', content: '你是一个安全系统配置优化专家。分析运行数据，返回JSON格式的配置调整建议。' },
        { role: 'user', content: prompt },
      ])

      const config = this.parseResponse(response)
      if (config) {
        this.applyConfig(config, ruleEngine)
        this.optimizationHistory.push({ time: now, config, stats })
        this.lastOptimization = now

        return { success: true, config, stats }
      }

      return { skipped: true, reason: 'AI返回格式无效' }
    } catch (err) {
      return { skipped: true, reason: err.message }
    }
  }

  collectRuleStats(ruleEngine) {
    const triggers = {}
    for (const [ruleId, count] of ruleEngine.stats) {
      triggers[ruleId] = count
    }
    return triggers
  }

  buildPrompt(stats, ruleStats) {
    const ruleSummary = Object.entries(ruleStats)
      .map(([id, count]) => `  ${id}: 触发${count}次`)
      .join('\n')

    return `过去24小时决策系统运行数据：

【整体概览】
总决策: ${stats.total}次
准确率: ${(stats.accuracy * 100).toFixed(1)}%
误报(FP): ${stats.falsePositives}次
漏报(FN): ${stats.falseNegatives}次

【规则触发频率】
${ruleSummary || '  (无数据)'}

【模型信任度】
规则引擎: ${((stats.modelTrust?.rule || 0) * 100).toFixed(0)}%
统计模型: ${((stats.modelTrust?.statistical || 0) * 100).toFixed(0)}%

请返回JSON格式的优化建议，格式如下：
{
  "rules": [
    { "id": "R001", "field": "failedLogins", "operator": ">=", "value": 7, "reason": "FP率8%，提高阈值" }
  ],
  "modelTrust": { "rule": 0.90, "statistical": 0.70 },
  "rationale": "简要解释调整理由"
}

注意：
- value必须在合理范围内
- modelTrust在0.3-0.98之间
- 只调整确实有数据支撑的规则`
  }

  parseResponse(response) {
    try {
      const json = response.match(/\{[\s\S]*\}/)
      if (!json) return null
      return JSON.parse(json[0])
    } catch {
      return null
    }
  }

  applyConfig(config, ruleEngine) {
    if (config.rules) {
      for (const change of config.rules) {
        ruleEngine.updateRule(change.id, change)
      }
    }
    this.configCache = config
  }

  applyModelTrust(config, decisionEngine) {
    if (config.modelTrust && decisionEngine.fusion) {
      for (const [model, trust] of Object.entries(config.modelTrust)) {
        const current = decisionEngine.fusion.modelTrust[model] || 0.5
        const delta = trust - current
        decisionEngine.fusion.adjustTrust(model, delta)
      }
    }
  }

  async optimizeWithEngine(decisionEngine) {
    const result = await this.optimize(decisionEngine.feedback, decisionEngine.ruleEngine)
    if (result.success) {
      this.applyModelTrust(result.config, decisionEngine)
    }
    return result
  }

  getCurrentConfig() {
    return this.configCache || null
  }

  // 提交到人工复核队列
  submitForReview(decision, actualOutcome, reason = '') {
    const entry = {
      id: `REV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      decisionId: decision.id,
      predicted: decision.action,
      actualOutcome,
      reason,
      timestamp: new Date().toISOString(),
      context: decision.context,
      reasoning: decision.reasoning,
    }
    this.reviewQueue.push(entry)
    if (this.reviewQueue.length > this.maxQueueSize) this.reviewQueue.shift()
    return entry
  }

  getReviewQueue(filters = {}) {
    let queue = [...this.reviewQueue].reverse()
    if (filters.outcome) queue = queue.filter(r => r.actualOutcome === filters.outcome)
    if (filters.limit) queue = queue.slice(0, filters.limit)
    return queue
  }

  // 根据误报反馈动态调整阈值
  adjustThresholdsFromFeedback(feedbackStats) {
    const fpRate = feedbackStats.falsePositives / Math.max(feedbackStats.total, 1)
    const fnRate = feedbackStats.falseNegatives / Math.max(feedbackStats.total, 1)

    let adjusted = false
    if (fpRate > 0.08) {
      this.thresholds.block = Math.min(this.thresholds.block + 0.03, 0.95)
      this.thresholds.challenge = Math.min(this.thresholds.challenge + 0.02, 0.75)
      adjusted = true
    } else if (fpRate < 0.02 && fnRate > 0.05) {
      this.thresholds.block = Math.max(this.thresholds.block - 0.02, 0.65)
      this.thresholds.challenge = Math.max(this.thresholds.challenge - 0.02, 0.40)
      adjusted = true
    }

    return { adjusted, thresholds: { ...this.thresholds }, fpRate, fnRate }
  }

  getThresholds() {
    return { ...this.thresholds }
  }
}

export const thresholdOptimizer = new ThresholdOptimizer()