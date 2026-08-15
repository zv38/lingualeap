// ===== AI 决策引擎 — 主核心 =====

import { RuleEngine } from './ruleEngine.js'
import { StatisticalModel } from './statisticalModel.js'
import { BayesianFusion } from './bayesianFusion.js'
import { FeedbackLoop } from './feedbackLoop.js'
import { patternDetector } from './patternDetector.js'
import { semanticDetector } from './semanticDetector.js'
import { behaviorAnalyzer } from './behaviorAnalyzer.js'
import { thresholdOptimizer } from './thresholdOptimizer.js'
import { temporalModel } from './temporalModel.js'
import { threatIntel } from './threatIntel.js'
import { llmSecurityAnalyst } from './llmSecurityAnalyst.js'
import { baselineLearner } from './baselineLearner.js'
import { ruleEvolution } from './ruleEvolution.js'

export class DecisionEngine {
  constructor() {
    this.enabled = process.env.AI_ENHANCED_DEFENSE !== 'false'
    this.ruleEngine = new RuleEngine()
    this.statistical = new StatisticalModel()
    this.fusion = new BayesianFusion()
    this.feedback = new FeedbackLoop(this)
    this.history = new Map()
    this.decisionCounter = 0
    this.latencyTotal = 0
  }

  async decide(context) {
    const start = Date.now()
    const id = `DEC-${++this.decisionCounter}-${Date.now()}`

    // 如果 AI 增强防御被显式关闭，直接放行（降低延迟）
    if (!this.enabled) {
      return this.buildFastDecision(id, context, start, 'DEFENSE_DISABLED', 'ALLOW', 0)
    }

    // 自适应基线学习（不阻塞主决策）
    baselineLearner.learn(context)

    patternDetector.record(context)

    // 1. 白名单快速通道：可信设备 + 无历史风险
    if (context.trustedDevice && context.historyRiskScore < 0.2) {
      const decision = this.buildFastDecision(id, context, start, 'TRUSTED_DEVICE')
      this.recordDecision(decision)
      return decision
    }

    // 2. 规则层（短路严重模式）
    const ruleResult = this.ruleEngine.evaluate(context)
    if (ruleResult?.severity === 'critical' && ruleResult.confidence > 0.9) {
      const decision = this.buildFastDecision(id, context, start, 'RULE_CRITICAL', 'BLOCK', ruleResult.confidence)
      decision.reasoning = `规则层严重命中: ${ruleResult.matchedRules?.join(', ') || 'critical'}`
      decision.modelContributions.rule = ruleResult.confidence
      this.recordDecision(decision)
      return decision
    }

    const statResult = this.statistical.predict(context)
    const patterns = patternDetector.detect(context)
    const temporalResult = temporalModel.record(context)
    const intelResult = threatIntel.check(context)
    const baselineAnomaly = baselineLearner.anomalyScore(context)

    // 3. 语义层检测（针对 AI 聊天输入）
    let semanticResult = { enabled: true, score: 0, findings: [], triggered: false }
    if (context.promptText && process.env.SEMANTIC_DETECTION !== 'false') {
      semanticResult = semanticDetector.analyze(context.promptText, context)
    }

    const fused = this.fusion.fuse({
      rule: ruleResult,
      statistical: statResult,
      temporal: temporalResult,
      threatIntel: intelResult,
      baseline: baselineAnomaly,
    })

    if (patterns.length > 0) {
      const maxPatternConfidence = Math.max(...patterns.map(p => p.confidence))
      const maxPatternSeverity = patterns.reduce((max, p) =>
        p.severity === 'critical' ? 'critical' : max, 'low')
      fused.confidence = Math.max(fused.confidence, maxPatternConfidence * 0.85)
      if (fused.action === 'ALLOW' && (maxPatternSeverity === 'critical' || maxPatternSeverity === 'high')) {
        fused.action = maxPatternSeverity === 'critical' ? 'BLOCK' : 'CHALLENGE'
      }
    }

    // 语义层提升风险
    if (semanticResult.triggered) {
      fused.confidence = Math.max(fused.confidence, semanticResult.score)
      if (fused.action === 'ALLOW' && semanticResult.recommendedAction !== 'OBSERVE') {
        fused.action = semanticResult.recommendedAction
      }
    }

    const baseDecision = {
      id,
      action: this.resolveAction(fused, context),
      confidence: fused.confidence,
      explanation: fused.explanation,
      severity: this.determineSeverity(fused.action),
      duration: this.getDuration(fused.action),
      reasoning: this.buildReasoning(fused, ruleResult, statResult, patterns, semanticResult),
      modelContributions: {
        rule: ruleResult?.confidence || 0,
        statistical: statResult?.confidence || 0,
        semantic: semanticResult.score || 0,
        temporal: temporalResult?.score || 0,
        threatIntel: intelResult?.score || 0,
        baseline: baselineAnomaly?.score || 0,
      },
      patterns: patterns.map(p => ({ type: p.pattern, severity: p.severity, confidence: p.confidence })),
      semantic: semanticResult,
      temporal: temporalResult,
      threatIntel: intelResult,
      baseline: baselineAnomaly,
      context: {
        ip: context.ip,
        endpoint: context.path,
        userId: context.userId,
        fingerprint: context.fingerprint,
      },
      latency: Date.now() - start,
      timestamp: new Date().toISOString(),
    }

    // 4. 行为层（异步、不阻塞响应）
    const behaviorResult = behaviorAnalyzer.record({
      ...context,
      decision: baseDecision.action,
      latency: baseDecision.latency,
    })
    baseDecision.behavior = behaviorResult
    if (behaviorResult.recommendedAction === 'BLOCK' && baseDecision.action !== 'BLOCK') {
      baseDecision.action = 'BLOCK'
      baseDecision.severity = 'critical'
      baseDecision.reasoning += ` | 行为层异常: ${behaviorResult.signals.map(s => s.type).join(', ')}`
    } else if (behaviorResult.recommendedAction === 'CHALLENGE' && baseDecision.action === 'ALLOW') {
      baseDecision.action = 'CHALLENGE'
      baseDecision.severity = 'high'
    }

    // 5. 进化规则应用
    const evolved = ruleEvolution.evaluate(context)
    if (evolved && evolved.matched) {
      baseDecision.action = evolved.action
      baseDecision.reasoning += ` | 进化规则命中: ${evolved.rule.id}`
      baseDecision.evolvedRule = evolved.rule
      if (baseDecision.action === 'BLOCK') baseDecision.severity = 'critical'
      else if (baseDecision.action === 'CHALLENGE') baseDecision.severity = 'high'
    }

    // 6. LLM 安全分析师复核 — 异步执行，结果更新 IP 信誉分
    llmSecurityAnalyst.analyze(baseDecision, context).then(llmResult => {
      if (llmResult && llmResult.action && llmResult.action !== 'ALLOW') {
        baseDecision.llmVerdict = llmResult;
        baseDecision.llmAction = llmResult.action;
        // 如果 LLM 建议更严厉的措施，更新决策标记供后续请求使用
        if (llmResult.action === 'BLOCK' && baseDecision.action !== 'BLOCK') {
          baseDecision.llmUpgrade = true;
        }
        // LLM 研判结果反馈到 IP 信誉系统
        try {
          const { ipReputation } = require('../security/defense/dynamicHoneypot.js');
          if (llmResult.action === 'BLOCK') {
            ipReputation.recordSignal(context.ip, 'LLM_BLOCKED', 15);
          } else if (llmResult.action === 'CHALLENGE') {
            ipReputation.recordSignal(context.ip, 'LLM_CHALLENGED', 8);
          }
        } catch {}
      }
    }).catch(() => {})

    // 7. 规则进化观察
    ruleEvolution.observe(baseDecision, context)

    this.recordDecision(baseDecision)
    return baseDecision
  }

  buildFastDecision(id, context, start, reason, action = 'ALLOW', confidence = 0.05) {
    return {
      id,
      action,
      confidence,
      explanation: reason,
      severity: this.determineSeverity(action),
      duration: this.getDuration(action),
      reasoning: `快速通道: ${reason}`,
      modelContributions: { rule: 0, statistical: 0, semantic: 0 },
      patterns: [],
      semantic: { score: 0, findings: [] },
      behavior: { score: 0, signals: [] },
      context: {
        ip: context.ip,
        endpoint: context.path,
        userId: context.userId,
        fingerprint: context.fingerprint,
      },
      latency: Date.now() - start,
      timestamp: new Date().toISOString(),
    }
  }

  recordDecision(decision) {
    this.history.set(decision.id, decision)
    this.latencyTotal += decision.latency
    if (this.history.size > 10000) {
      const firstKey = this.history.keys().next().value
      this.history.delete(firstKey)
    }
  }

  resolveAction(fused, context) {
    if (fused.confidence < 0.5) {
      return context.honeypotTriggered ? 'BLOCK' :
             context.promptInjectScore >= 60 ? 'BLOCK' :
             context.failedLogins >= 5 ? 'CHALLENGE' : 'ALLOW'
    }
    return fused.action
  }

  determineSeverity(action) {
    return { BLOCK: 'critical', CHALLENGE: 'high', DEGRADE: 'medium', OBSERVE: 'low', ALLOW: 'info' }[action] || 'info'
  }

  getDuration(action) {
    return { BLOCK: 86400000, CHALLENGE: 3600000, DEGRADE: 600000, OBSERVE: 0, ALLOW: 0 }[action] || 0
  }

  buildReasoning(fused, rule, stat, patterns, semantic) {
    const parts = []
    parts.push(`融合决策: ${fused.action} (置信度:${(fused.confidence * 100).toFixed(0)}%)`)
    if (rule?.matchedRules?.length) {
      parts.push(`规则触发: [${rule.matchedRules.join(', ')}]`)
    }
    if (stat?.topAnomalies?.length) {
      const top = stat.topAnomalies[0]
      if (top.zScore > 2) parts.push(`统计异常: ${top.feature}(Z=${top.zScore.toFixed(1)})`)
    }
    if (patterns && patterns.length > 0) {
      parts.push(`攻击模式: [${patterns.map(p => p.pattern).join(', ')}]`)
    }
    if (semantic?.triggered && semantic.findings?.length > 0) {
      parts.push(`语义风险: [${semantic.findings.map(f => f.type).join(', ')}]`)
    }
    return parts.join(' | ')
  }

  getStats() {
    const total = this.decisionCounter
    const blocked = [...this.history.values()].filter(d => d.action === 'BLOCK').length
    const challenged = [...this.history.values()].filter(d => d.action === 'CHALLENGE').length
    const avgLatency = total > 0 ? this.latencyTotal / total : 0

    return {
      totalDecisions: total,
      blocked,
      challenged,
      avgLatency: `${avgLatency.toFixed(0)}ms`,
      modelTrust: this.fusion.modelTrust,
      feedbackAccuracy: this.feedback.getStats().accuracy,
      patternCounts: patternDetector.getPatternStats(),
      semanticStats: semanticDetector.getStats(),
      behaviorStats: behaviorAnalyzer.getStats(),
      thresholdConfig: thresholdOptimizer.getThresholds(),
      temporalStats: temporalModel.getStats(),
      threatIntelStats: threatIntel.getStats(),
      llmStats: llmSecurityAnalyst.getStats(),
      baselineStats: baselineLearner.getStats(),
      ruleEvolutionStats: ruleEvolution.getStats(),
    }
  }
}

export const decisionEngine = new DecisionEngine()