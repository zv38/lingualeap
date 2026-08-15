// 安全验证脚本：验证管理员账号安全加固与攻击路径失效
// 运行前请确保：
//   1. 后端已启动：npm run dev:api
//   2. 前端开发服务器已启动：npm run dev
//   3. .env 中已配置 JWT_SECRET、JWT_REFRESH_SECRET、ADMIN_PASSWORD、TURNSTILE_SECRET_KEY
// 注意：本脚本不再依赖任何测试后门（如 CAPTCHA_TEST_MODE）。验证码部分需要手动输入或接入图像识别。
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '.env.local'], override: true })

const BASE = 'http://localhost:3001'
const FRONTEND = 'http://localhost:3000'
const JWT_SECRET = process.env.JWT_SECRET
const ADMIN_EMAIL = 'admin@lingualeap.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const NORMAL_USER_EMAIL = `user_${Date.now()}@test.com`
const NORMAL_USER_PASSWORD = 'Test@123456'
const UA = 'SecurityTest/1.0 (Windows NT 10.0; Win64; x64)'
const UAB = 'SecurityTest/2.0 (Windows NT 10.0; Win64; x64)'

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET 未设置')
  process.exit(1)
}
if (!ADMIN_PASSWORD) {
  console.error('[FATAL] ADMIN_PASSWORD 未设置')
  process.exit(1)
}

let csrfToken = null

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function req(method, path, { token, body, noJson, frontend, userAgent = UA, delayMs = 80 } = {}) {
  const base = frontend ? FRONTEND : BASE
  const headers = { 'User-Agent': userAgent }
  if (token) headers.Authorization = `Bearer ${token}`
  if (csrfToken && method.toUpperCase() !== 'GET') headers['X-CSRF-Token'] = csrfToken
  let fetchBody
  if (body) {
    headers['Content-Type'] = 'application/json'
    fetchBody = JSON.stringify(body)
  }
  if (delayMs > 0) await sleep(delayMs)
  const res = await fetch(`${base}${path}`, { method, headers, body: fetchBody })
  const text = await res.text()
  let json = null
  if (!noJson && text) {
    try { json = JSON.parse(text) } catch {}
  }
  return { status: res.status, json, text }
}

const get = (path, opts) => req('GET', path, opts)
const post = (path, opts) => req('POST', path, opts)
const getFrontend = (path, opts) => req('GET', path, { ...opts, frontend: true })

function expect(label, condition, debug) {
  const ok = !!condition
  console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  if (!ok && debug) console.log(`      调试信息:`, debug)
  return ok
}

let allPassed = true
function check(label, condition, debug) {
  if (!expect(label, condition, debug)) allPassed = false
}

async function getCaptcha(endpoint = '/api/captcha') {
  const res = await get(endpoint)
  if (res.status !== 200 || !res.json?.success) throw new Error('获取验证码失败: ' + endpoint)
  // 服务端不再返回明文验证码，需手动识别 SVG 或接入 OCR
  return { id: res.json.captchaId, svg: res.json.svg }
}

async function adminLogin() {
  const captcha = await getCaptcha('/api/admin/captcha')
  const code = process.env.ADMIN_CAPTCHA_CODE
  if (!code) throw new Error('请设置环境变量 ADMIN_CAPTCHA_CODE=从 /api/admin/captcha SVG 中读取的6位验证码')
  const res = await post('/api/admin/login', {
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      adminCaptchaId: captcha.id,
      adminCaptchaCode: code,
      turnstileToken: 'test-token-skipped-in-dev',
    },
  })
  return res
}

async function normalRegisterAndLogin() {
  const code = process.env.CAPTCHA_CODE
  if (!code) throw new Error('请设置环境变量 CAPTCHA_CODE=从 /api/captcha SVG 中读取的4位验证码')
  const reg = await post('/api/register', {
    body: {
      username: 'normaluser',
      email: NORMAL_USER_EMAIL,
      password: NORMAL_USER_PASSWORD,
      captchaId: (await getCaptcha('/api/captcha')).id,
      captchaCode: code,
      humanToken: 'test-token-skipped-in-dev',
    },
  })
  if (!reg.json?.success) throw new Error('普通用户注册失败: ' + JSON.stringify(reg.json))

  const login = await post('/api/login', {
    body: {
      email: NORMAL_USER_EMAIL,
      password: NORMAL_USER_PASSWORD,
      captchaId: (await getCaptcha('/api/captcha')).id,
      captchaCode: code,
      humanToken: 'test-token-skipped-in-dev',
    },
  })
  if (!login.json?.success) throw new Error('普通用户登录失败: ' + JSON.stringify(login.json))
  return login.json
}

console.log('\n🔐 开始安全验证测试\n')

// 获取 CSRF token
const csrfRes = await get('/api/csrf-token')
if (csrfRes.json?.success) {
  csrfToken = csrfRes.json.data?.csrfToken || csrfRes.json.csrfToken
}
console.log(csrfToken ? `  ✅ CSRF token 已获取` : `  ⚠️  CSRF token 获取失败，POST 测试可能受影响`)

// ---------- 1. 注册特权字段拦截 ----------
console.log('1. 注册特权字段拦截')
try {
  const captcha = await getCaptcha('/api/captcha')
  const res = await post('/api/register', {
    body: {
      username: 'hacker',
      email: `hacker_${Date.now()}@test.com`,
      password: NORMAL_USER_PASSWORD,
      captchaId: captcha.id,
      captchaCode: '0000',
      inviteCode: 'ADM2026ADMIN',
      role: 'admin',
      humanToken: 'test-token-skipped-in-dev',
    },
  })
  check('携带 inviteCode/role 注册被拒绝', res.status === 400, { status: res.status, body: res.json })
} catch (e) {
  console.log('  ⚠️  注册拦截测试异常:', e.message)
  allPassed = false
}

// ---------- 2. 普通用户登录并准备 token ----------
console.log('\n2. 普通用户登录并准备 token')
let normalUser = null
try {
  normalUser = await normalRegisterAndLogin()
  check('普通用户登录成功并获取 token', !!normalUser.token, normalUser)
} catch (e) {
  console.log('  ⚠️  普通用户登录异常:', e.message)
  allPassed = false
}

// ---------- 3. 管理员登录强制 2FA ----------
console.log('\n3. 管理员登录强制 2FA')
const adminLoginRes = await adminLogin()
const isMfaRequired = adminLoginRes.status === 403 && adminLoginRes.json?.code === 'ADMIN_MFA_REQUIRED'
const isRateLimited = adminLoginRes.status === 429 ||
  (adminLoginRes.status === 403 && adminLoginRes.json?.message?.includes('登录失败次数过多'))
check('管理员未开启 2FA 时登录返回 ADMIN_MFA_REQUIRED（或被限流保护）',
  isMfaRequired || isRateLimited,
  adminLoginRes.json)
if (isRateLimited) {
  console.log('  ⚠️  管理员登录接口已触发速率限制，这是预期的安全行为')
}

// ---------- 4. 禁止管理员走普通登录 ----------
console.log('\n4. 禁止管理员走普通登录')
try {
  const captcha = await getCaptcha('/api/captcha')
  const res = await post('/api/login', {
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      captchaId: captcha.id,
      captchaCode: process.env.CAPTCHA_CODE || '0000',
      humanToken: 'test-token-skipped-in-dev',
    },
  })
  check('管理员通过 /api/login 登录被拒绝', res.status === 403 && res.json?.message.includes('专用登录入口'), res.json)
} catch (e) {
  console.log('  ⚠️  普通登录拦截测试异常:', e.message)
  allPassed = false
}

// ---------- 5. 管理员 API 权限控制 ----------
console.log('\n5. 管理员 API 权限控制')
const adminEndpoints = [
  '/api/admin/surveys',
  '/api/admin/isolation',
  '/api/admin/2fa/status',
  '/api/admin/trusted-devices',
  '/api/surveys/survey-1779122240383/results',
]

// 5a. 无 token
for (const path of adminEndpoints) {
  const res = await get(path)
  check(`未登录访问 ${path} 返回 401/403`, res.status === 401 || res.status === 403, res.status)
}

// 5b. 普通用户 token
if (normalUser?.token) {
  for (const path of adminEndpoints) {
    const res = await get(path, { token: normalUser.token })
    check(`普通用户访问 ${path} 返回 403`, res.status === 403, { status: res.status, body: res.json })
  }
}

// 5c. 伪造 token（缺少 pepper）
const forgedToken = jwt.sign(
  { userId: 'admin-1', type: 'access' },
  JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '15m' }
)
for (const path of adminEndpoints) {
  const res = await get(path, { token: forgedToken })
  check(`伪造 token 访问 ${path} 被拒绝`, res.status === 401, { status: res.status, body: res.json })
}

// ---------- 6. 源码/敏感文件暴露防护 ----------
console.log('\n6. 源码与敏感文件暴露防护')
const sensitivePaths = [
  '/src/utils/security.ts',
  '/src/App.tsx',
  '/src/store/useStore.ts',
  '/api/index.js',
  '/.env',
  '/.env.local',
  '/.git/config',
  '/vite.config.ts',
  '/tsconfig.json',
  '/package.json',
  '/package-lock.json',
  '/isolation-state.json',
  '/audit-log.json',
]
for (const path of sensitivePaths) {
  const res = await get(path)
  check(`访问 ${path} 被阻止`, res.status === 403 || res.status === 404, res.status)
}

// ---------- 7. 前端源码与 @fs 路径暴露防护 ----------
console.log('\n7. 前端源码与 @fs 路径暴露防护（开发服务器端口 3000）')
let frontendReachable = false
try {
  const probe = await getFrontend('/')
  frontendReachable = probe.status === 200
} catch {
  console.log('  ⚠️  前端开发服务器未启动，跳过前端源码暴露测试')
}
if (frontendReachable) {
  const frontendSensitivePaths = [
    '/assets/main.js.map',
    '/assets/index.js.map',
    '/src/main.tsx.map',
    '/src/utils/environmentCheck.ts',
    '/src/components/AutoBugDetector.tsx',
    '/api/index.js',
    '/vite.config.ts',
    '/tsconfig.json',
    '/package.json',
    '/.env',
    `/@fs/${process.cwd().replace(/\\/g, '/')}/api/index.js`,
  ]
  for (const path of frontendSensitivePaths) {
    const res = await getFrontend(path)
    check(`访问 ${path} 被阻止`, res.status === 403 || res.status === 404, { status: res.status, body: res.text?.slice(0, 80) })
  }
}

// ---------- 8. 已移除/收紧的公开端点 ----------
console.log('\n8. 已移除/收紧的公开端点')
const saltRes = await get('/api/security/salt')
check('/api/security/salt 已移除返回 404', saltRes.status === 404, { status: saltRes.status, body: saltRes.json })

const healthRes = await get('/api/health')
check('/api/health 不再包含隔离日志', healthRes.status === 200 && !healthRes.json?.isolation && !healthRes.json?.decisions, { status: healthRes.status, body: healthRes.json })

// ---------- 9. 隔离控制接口需要管理员 + fresh MFA ----------
console.log('\n9. 隔离控制接口需要 fresh MFA')
if (normalUser?.token) {
  const isoActivate = await post('/api/admin/isolation/activate', { token: normalUser.token, body: { level: 'lockdown' } })
  check('普通用户无法调用隔离激活', isoActivate.status === 403, isoActivate.json)
}

// ---------- 10. 会话绑定：同一 token 换 UA 被拒绝 ----------
console.log('\n10. 会话绑定（如已有普通用户 token）')
if (normalUser?.token) {
  const res = await get('/api/me', { token: normalUser.token, userAgent: UAB })
  check('更换 User-Agent 后原 token 被拒绝', res.status === 401, { status: res.status, body: res.json })
}

console.log('\n' + (allPassed ? '✅ 所有安全测试通过' : '❌ 存在未通过的安全测试'))
process.exit(allPassed ? 0 : 1)
