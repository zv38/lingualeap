// scripts/test-active-defense.js
// 验证主动防御与欺骗能力（无需启动服务器）

import { ActiveDefense } from '../api/security/defense/activeDefense.js'

process.env.AI_ACTIVE_DEFENSE = 'true'
process.env.AI_HONEYPOT_DYNAMIC = 'true'
process.env.AI_DECEPTION_RESPONSE = 'true'

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    console.error(`  ❌ ${label}`)
    process.exit(1)
  }
}

function mockRes() {
  let sent = false
  let statusCode = 0
  let body = null
  return {
    status(code) {
      statusCode = code
      return this
    },
    set() {
      return this
    },
    json(data) {
      sent = true
      body = data
      return this
    },
    send(data) {
      sent = true
      body = data
      return this
    },
    get sent() {
      return sent
    },
    get statusCode() {
      return statusCode
    },
    get body() {
      return body
    },
  }
}

function mockReq(ip, path) {
  return {
    headers: { 'x-forwarded-for': ip, 'user-agent': 'TestAgent/1.0' },
    path,
    method: 'GET',
  }
}

console.log('\n🎭 主动防御系统测试\n')

const defense = new ActiveDefense()

// 1. 蜜罐路径访问直接触发隔离上报
const req1 = mockReq('4.4.4.4', '/admin/legacy/login')
const res1 = mockRes()
const handled1 = defense.handleRequest(
  req1,
  res1,
  { action: 'BLOCK', confidence: 0.9 },
  { ip: '4.4.4.4', path: '/admin/legacy/login' }
)
assert('蜜罐路径被拦截', handled1 === true)
assert('蜜罐响应状态 200', res1.statusCode === 200)
assert('req 标记 honeypotTriggered', req1.honeypotTriggered === true)

// 2. 可疑 IP 访问敏感路径触发欺骗响应
const req2 = mockReq('5.5.5.5', '/src/utils/security.ts')
const res2 = mockRes()
const handled2 = defense.handleRequest(
  req2,
  res2,
  { action: 'BLOCK', confidence: 0.85, temporal: { alert: true }, threatIntel: { alert: false } },
  { ip: '5.5.5.5', path: '/src/utils/security.ts' }
)
assert('敏感路径欺骗响应被触发', handled2 === true)
assert('欺骗响应包含假代码', typeof res2.body === 'string' && res2.body.includes('auto-generated stub'))

// 3. 攻击者画像生成
const profiles = defense.getProfiles()
assert('攻击者画像已生成', profiles.length >= 1)
assert('蜜罐触发画像标记隔离', profiles.some((p) => p.isolationTriggered))

// 4. 手动投放蜜罐
const req3 = mockReq('6.6.6.6', '/admin/legacy/login')
const res3 = mockRes()
defense.seedHoneypots('6.6.6.6', ['/admin/legacy/login'])
const handled3 = defense.handleRequest(
  req3,
  res3,
  { action: 'ALLOW', confidence: 0.1 },
  { ip: '6.6.6.6', path: '/admin/legacy/login' }
)
assert('手动投放蜜罐生效', handled3 === true)

console.log('\n✅ 主动防御测试通过')
