// scripts/test-smart-isolation.js
// 验证智能隔离扩展能力（无需启动服务器）

import { SmartIsolation } from '../api/security/isolation/smartIsolation.js'
import { AutoIsolationSystem } from '../api/security/isolation/autoIsolation.js'

process.env.AI_SMART_ISOLATION = 'true'

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    console.error(`  ❌ ${label}`)
    process.exit(1)
  }
}

console.log('\n🛡️ 智能隔离系统测试\n')

const isolation = new AutoIsolationSystem()
const smart = new SmartIsolation(isolation)

const attackerIp = '198.51.100.88'

// 模拟侦察行为决策 -> 警戒
for (let i = 0; i < 3; i++) {
  smart.recordDecision(
    {
      action: 'CHALLENGE',
      confidence: 0.6,
      modelContributions: { temporal: 0.6, rule: 0.2 },
      patterns: [],
    },
    { ip: attackerIp, path: '/admin/1', method: 'GET' }
  )
}
assert('侦察行为触发 alert 或更高级别', ['alert', 'quarantine', 'lockdown'].includes(isolation.level))

// 模拟完整攻击链 -> 升级
smart.recordDecision(
  { action: 'BLOCK', confidence: 0.9, modelContributions: { rule: 0.8 }, patterns: [{ type: 'sensitive_path' }] },
  { ip: attackerIp, path: '/.env', method: 'GET' }
)
smart.recordDecision(
  { action: 'BLOCK', confidence: 0.9, modelContributions: { rule: 0.8 }, patterns: [{ type: 'admin_unauthorized' }] },
  { ip: attackerIp, path: '/api/admin/users', method: 'GET' }
)
assert('完整攻击链触发 quarantine 或 lockdown', ['quarantine', 'lockdown'].includes(isolation.level))

// 蜜罐触发 -> 完全隔离
smart.recordDecision(
  { action: 'BLOCK', confidence: 1.0, modelContributions: {}, patterns: [] },
  { ip: attackerIp, path: '/admin/legacy/login', method: 'POST', honeypotTriggered: true }
)
assert('蜜罐触发最终升级到 lockdown', isolation.level === 'lockdown')

const stats = smart.getStats()
assert('智能隔离统计包含跟踪 IP', stats.trackedIps > 0)
assert('智能隔离统计包含威胁分数', stats.topThreats.length > 0)

console.log('\n✅ 智能隔离测试通过')
