// 自动隔离系统测试脚本
// 用法：
//   1. 先启动后端：npm run dev:api
//   2. 可选设置 AUTO_ISOLATION_DEV=true 让本地 IP 也触发隔离
//   3. 运行：node scripts/test-auto-isolation.js
//
// 本脚本通过 X-Forwarded-For 模拟外部攻击者，验证自动隔离能否实时检测并升级。
// 每次运行使用不同的攻击者 IP，避免历史状态干扰；开始/结束会自动重置隔离状态。
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
dotenv.config({ path: ['.env', '.env.local'], override: true })

const BASE = 'http://localhost:3001'
// 使用随机攻击者 IP，避免与之前测试遗留状态混淆
const ATTACKER_IP = `198.51.100.${10 + Math.floor(Math.random() * 240)}`
const UA = 'IsolationTester/1.0'
const JWT_SECRET = process.env.JWT_SECRET
const ADMIN_ID = 'admin-1'

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET 未设置')
  process.exit(1)
}

const KEY_VERSION = crypto.createHash('sha256').update(JWT_SECRET).digest('hex').substring(0, 16)
function makeAdminToken() {
  return jwt.sign(
    { userId: ADMIN_ID, type: 'access', role: 'admin', kv: KEY_VERSION },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  )
}

const adminToken = makeAdminToken()
let csrfToken = null

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function rawReq(method, path, { externalIp, token, body, withCsrf = true } = {}) {
  const headers = {
    'User-Agent': UA,
    'X-Forwarded-For': externalIp || ATTACKER_IP,
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (withCsrf && csrfToken && method.toUpperCase() !== 'GET') headers['X-CSRF-Token'] = csrfToken
  let fetchBody
  if (body) {
    headers['Content-Type'] = 'application/json'
    fetchBody = JSON.stringify(body)
  }
  await sleep(50)
  const res = await fetch(`${BASE}${path}`, { method, headers, body: fetchBody })
  const text = await res.text()
  let json = null
  if (text) try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, headers: Object.fromEntries(res.headers) }
}

const get = (path, opts) => rawReq('GET', path, opts)
const post = (path, opts) => rawReq('POST', path, opts)

function check(label, condition) {
  const ok = !!condition
  console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  return ok
}

async function fetchCsrfToken() {
  const res = await get('/api/csrf-token', { externalIp: '127.0.0.1', token: adminToken })
  if (res.json?.data?.csrfToken || res.json?.data?.token) {
    csrfToken = res.json.data.csrfToken || res.json.data.token
    return true
  }
  return false
}

async function getStatus(opts = {}) {
  // 状态查询使用本地 IP，避免被隔离策略误拦
  const res = await get('/api/admin/isolation', { token: adminToken, externalIp: '127.0.0.1', ...opts })
  if (res.json?.data) return res.json.data
  return { level: 'normal' }
}

async function resetIsolation() {
  const status = await getStatus()
  if (status.level === 'normal') return true
  console.log(`  ℹ️ 当前处于 ${status.level}，先重置隔离状态`)
  if (!csrfToken && !(await fetchCsrfToken())) {
    console.error('  ❌ 无法获取 CSRF token，跳过重置')
    return false
  }
  const res = await post('/api/admin/isolation/deactivate', { externalIp: '127.0.0.1', token: adminToken })
  if (res.json?.success) {
    console.log(`  ✅ 已重置为 normal`)
    return true
  }
  console.error('  ❌ 重置失败:', res.json?.message || res.status)
  return false
}

console.log('\n🔒 自动隔离系统测试')
console.log(`攻击者 IP: ${ATTACKER_IP}\n`)

// 0. 获取 CSRF token（后续重置需要）
if (!(await fetchCsrfToken())) {
  console.error('❌ 无法获取 CSRF token，测试终止')
  process.exit(1)
}

// 1. 确保从 normal 开始
const resetOk = await resetIsolation()
if (!resetOk) {
  console.error('❌ 无法重置隔离状态，测试终止')
  process.exit(1)
}

let status = await getStatus()
console.log(`初始隔离状态: ${status.level || 'normal'}`)
check('初始状态为 normal', status.level === 'normal')

// 2. 敏感路径扫描 -> 半隔离
console.log('\n1. 模拟外部 IP 扫描敏感路径')
for (let i = 0; i < 3; i++) {
  await get('/src/utils/security.ts')
  await get('/.env')
  await get('/vite.config.ts')
}
await sleep(500)
status = await getStatus()
console.log(`   当前隔离状态: ${status.level}, 原因: ${status.triggeredBy || '无'}`)
check('扫描敏感路径后触发 quarantine 或以上隔离', ['quarantine', 'lockdown'].includes(status.level))

const isLockedDown = status.level === 'lockdown'

// 3. 未授权管理员接口访问 -> 升级隔离
if (!isLockedDown) {
  console.log('\n2. 模拟外部 IP 未授权访问管理员接口')
  for (let i = 0; i < 4; i++) {
    await get('/api/admin/surveys')
    await get('/api/admin/isolation')
  }
  await sleep(500)
  status = await getStatus()
  console.log(`   当前隔离状态: ${status.level}, 原因: ${status.triggeredBy || '无'}`)
  check('admin 攻击后隔离级别保持/升级到 quarantine 或 lockdown', ['quarantine', 'lockdown'].includes(status.level))
}

// 4. JWT 异常 -> 至少警戒
if (!isLockedDown && status.level !== 'lockdown') {
  console.log('\n3. 模拟外部 IP 伪造 JWT')
  for (let i = 0; i < 6; i++) {
    await get('/api/admin/surveys', { token: 'invalid-token' })
    await get('/api/me', { token: 'invalid-token' })
  }
  await sleep(500)
  status = await getStatus()
  console.log(`   当前隔离状态: ${status.level}, 原因: ${status.triggeredBy || '无'}`)
  check('JWT 异常后隔离级别至少为 alert', ['alert', 'quarantine', 'lockdown'].includes(status.level))
}

// 5. 检查隔离生效：外部 IP 访问非核心接口应被 503 拒绝
console.log('\n4. 验证隔离生效')
const probe = await get('/api/admin/surveys')
console.log(`   外部 IP 探测返回状态: ${probe.status}`)
const blocked = probe.status === 503 || probe.status === 403
check('隔离状态下外部 IP 访问受限', blocked)

// 6. 清理：恢复 normal，避免影响后续开发
console.log('\n5. 清理：解除隔离状态')
const cleaned = await resetIsolation()
check('测试结束后恢复 normal', cleaned)

console.log('\n测试结果可在 AdminPanel -> 安全运营中心查看，或访问 GET /api/admin/isolation')
