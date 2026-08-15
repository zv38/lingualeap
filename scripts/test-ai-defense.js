// scripts/test-ai-defense.js
// 验证 AI 防御系统核心能力（无需启动服务器）

import { TemporalModel } from '../api/ai-decision/temporalModel.js'
import { ThreatIntel } from '../api/ai-decision/threatIntel.js'
import { BaselineLearner } from '../api/ai-decision/baselineLearner.js'
import { RuleEvolution } from '../api/ai-decision/ruleEvolution.js'
import { BayesianFusion } from '../api/ai-decision/bayesianFusion.js'

process.env.AI_ENHANCED_DEFENSE = 'true'
process.env.AI_ADAPTIVE_LEARNING = 'true'
process.env.AI_RULE_EVOLUTION = 'true'

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    console.error(`  ❌ ${label}`)
    process.exit(1)
  }
}

console.log('\n🧠 AI 防御系统单元测试\n')

// 1. 时序模型识别扫描
const temporal = new TemporalModel({})
for (const p of ['/', '/about', '/products']) temporal.record({ path: p, ip: '1.1.1.1' })
for (let i = 0; i < 10; i++) {
  temporal.record({ path: `/admin/${i}`, ip: '1.1.1.1' })
  temporal.record({ path: `/config/${i}`, ip: '1.1.1.1' })
}
const temporalResult = temporal.record({ path: '/admin/users', ip: '1.1.1.1' })
assert('时序模型识别扫描行为', temporalResult.score >= 0.5)
assert('时序模型推荐 CHALLENGE/BLOCK', ['CHALLENGE', 'BLOCK'].includes(temporalResult.recommendedAction))

// 2. 威胁情报识别恶意 UA
const intel = new ThreatIntel()
const intelResult = intel.check({ ip: '1.1.1.1', path: '/.env', userAgent: 'sqlmap/1.0' })
assert('威胁情报识别 sqlmap UA', intelResult.score >= 0.5)
assert('威胁情报识别敏感路径', intelResult.signals.some((s) => s.type === 'KNOWN_ATTACK_FINGERPRINT'))

// 3. 基线学习检测异常时间
const baseline = new BaselineLearner({})
// 先学习 50 次正常请求
for (let i = 0; i < 60; i++) {
  baseline.learn({ path: '/api/courses', method: 'GET', ip: '2.2.2.2' })
}
const anomaly = baseline.anomalyScore({ path: '/api/courses', method: 'GET', ip: '2.2.2.2' })
assert('基线学习就绪', anomaly.ready === true)

// 4. 规则进化生成规则
const evolution = new RuleEvolution({})
const ctx = { ip: '3.3.3.3', path: '/admin/users', userAgent: 'python-requests/2.0' }
for (let i = 0; i < 12; i++) {
  evolution.observe({ action: 'BLOCK', confidence: 0.9 }, ctx)
}
// 观察期未过，不应晋升
let match = evolution.evaluate(ctx)
assert('规则进化观察期内未晋升', match === null)

// 5. 贝叶斯融合多专家
const fusion = new BayesianFusion()
const fused = fusion.fuse({
  rule: { action: 'BLOCK', confidence: 0.95 },
  statistical: { action: 'OBSERVE', confidence: 0.3 },
  temporal: { action: 'CHALLENGE', confidence: 0.7 },
  threatIntel: { action: 'BLOCK', confidence: 0.9 },
  baseline: { action: 'OBSERVE', confidence: 0.2 },
})
assert('融合结果高风险动作', ['BLOCK', 'CHALLENGE'].includes(fused.action))
assert('融合置信度合理', fused.confidence > 0 && fused.confidence <= 1)

console.log('\n✅ 所有 AI 防御单元测试通过')
