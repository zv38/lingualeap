// ===== LLM 安全分析师 =====
// 对灰色请求异步调用大模型，给出风险解释和建议动作

import { aiConfigurator } from './aiConfigurator.js'

export class LLMSecurityAnalyst {
  constructor() {
    this.enabled = process.env.AI_LLM_ANALYST !== 'false' && process.env.AI_ENHANCED_DEFENSE === 'true'
    this.lowThreshold = parseFloat(process.env.AI_LLM_CONFIDENCE_LOW || '0.4')
    this.highThreshold = parseFloat(process.env.AI_LLM_CONFIDENCE_HIGH || '0.85')
    this.queue = []
    this.maxQueue = 1000
    this.processing = false
    this.callCount = 0
    this.errorCount = 0
  }

  shouldAnalyze(decision) {
    if (!this.enabled) return false
    const c = decision.confidence
    return c >= this.lowThreshold && c <= this.highThreshold && decision.action !== 'BLOCK'
  }

  buildPrompt(decision, context) {
    return [
      {
        role: 'system',
        content: `你是一位 Web 应用安全分析师。请根据以下请求上下文判断是否存在攻击风险。
只能输出纯 JSON，不要任何解释。JSON 格式：
{
  "riskLevel": "low|medium|high|critical",
  "recommendedAction": "ALLOW|CHALLENGE|BLOCK",
  "confidence": 0.0-1.0,
  "reasoning": "简短中文理由",
  "indicators": ["指标1", "指标2"]
}
注意：正常用户浏览、登录、提交表单应判定为 low。扫描、未授权访问、异常 JWT、高频爆破应判定为 high 或 critical。`,
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            ip: context.ip,
            method: context.method,
            path: context.path,
            userAgent: context.userAgent,
            action: decision.action,
            confidence: decision.confidence,
            severity: decision.severity,
            matchedRules: decision.patterns?.map((p) => p.type) || [],
            modelContributions: decision.modelContributions,
            historyRiskScore: context.historyRiskScore,
          },
          null,
          2
        ),
      },
    ]
  }

  async analyze(decision, context) {
    if (!this.shouldAnalyze(decision)) return null

    // 直接执行分析（不排队），返回 Promise
    try {
      const prompt = this.buildPrompt(decision, context)
      const raw = await aiConfigurator.call(prompt, { maxTokens: 512, temperature: 0.2 })
      const result = this._parse(raw)
      decision.llmAnalysis = result
      decision.llmAnalyzedAt = new Date().toISOString()
      this.callCount++
      return {
        action: result.recommendedAction,
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        reasoning: result.reasoning,
        indicators: result.indicators,
      }
    } catch (err) {
      this.errorCount++
      console.error('[LLMSecurityAnalyst] 分析失败:', err.message)
      return null
    }
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    while (this.queue.length > 0) {
      const task = this.queue.shift()
      try {
        const prompt = this.buildPrompt(task.decision, task.context)
        const raw = await aiConfigurator.call(prompt, { maxTokens: 512, temperature: 0.2 })
        const result = this._parse(raw)
        task.decision.llmAnalysis = result
        task.decision.llmAnalyzedAt = new Date().toISOString()
        this.callCount++
      } catch (err) {
        this.errorCount++
        console.error('[LLMSecurityAnalyst] 分析失败:', err.message)
      }
    }

    this.processing = false
  }

  _parse(raw) {
    const clean = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      riskLevel: parsed.riskLevel || 'low',
      recommendedAction: parsed.recommendedAction || 'ALLOW',
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
      reasoning: parsed.reasoning || '',
      indicators: parsed.indicators || [],
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      callCount: this.callCount,
      errorCount: this.errorCount,
      queueLength: this.queue.length,
    }
  }
}

export const llmSecurityAnalyst = new LLMSecurityAnalyst()
