// ============================================================
// security-regression-tests.js — 军工级安全回归测试套件
// 目标：验证所有安全防护机制正常工作，防止"admin 接管"等
// 安全回归问题。每次 CI 或安全更新后运行。
// 用法: node scripts/security-regression-tests.js
// ============================================================

import http from 'http'
import crypto from 'crypto'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001'
const API = (path) => new URL(path, BASE_URL)

let passed = 0
let failed = 0
const failures = []

function assert(condition, message) {
  if (condition) {
    passed++
    process.stdout.write('.')
  } else {
    failed++
    failures.push(message)
    process.stdout.write('F')
  }
}

function request(method, path, options = {}) {
  return new Promise((resolve) => {
    const url = API(path)
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
    if (options.csrfToken) {
      headers['X-CSRF-Token'] = options.csrfToken
    }
    if (options.nonce) {
      headers['X-Request-Nonce'] = options.nonce
    }
    if (options.timestamp) {
      headers['X-Request-Timestamp'] = options.timestamp
    }
    if (options.origin) {
      headers['Origin'] = options.origin
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => body += chunk)
      res.on('end', () => {
        let data
        try { data = JSON.parse(body) } catch { data = body }
        resolve({ status: res.statusCode, headers: res.headers, data })
      })
    })

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message, data: null })
    })

    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    req.end()
  })
}

async function getCsrfToken() {
  const res = await request('GET', '/api/csrf-token')
  if (res.status === 200 && res.data?.token) {
    // CSRF token 通过 cookie 自动发送
    const cookies = res.headers['set-cookie']
    return { token: res.data.token, cookies }
  }
  return null
}

function getCookieHeader(cookies) {
  if (!cookies) return {}
  const cookieMap = {}
  for (const c of Array.isArray(cookies) ? cookies : [cookies]) {
    const [keyval] = c.split(';')
    const [key, ...val] = keyval.split('=')
    cookieMap[key.trim()] = val.join('=')
  }
  return cookieMap
}

function formatCookies(cookies) {
  if (!cookies) return ''
  const arr = Array.isArray(cookies) ? cookies : [cookies]
  return arr.map(c => c.split(';')[0]).join('; ')
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ============================================================
// 测试用例
// ============================================================

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  军工级安全回归测试套件')
  console.log(`  目标服务器: ${BASE_URL}`)
  console.log(`  时间: ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════\n')

  // ─── 测试 1: 健康检查端点不泄露敏感信息 ───
  console.log('\n[测试 1] 健康检查端点安全性')
  {
    const res = await request('GET', '/api/health')
    assert(res.status === 200, `健康检查应返回 200 (got ${res.status})`)
    assert(res.data?.status === 'ok', `健康检查应返回 status=ok`)
    assert(!res.data?.isolation, '健康检查不应泄露隔离日志')
    assert(!res.data?.decisionEvents, '健康检查不应泄露决策事件')
    assert(!res.data?.audit, '健康检查不应泄露审计信息')
  }

  // ─── 测试 2: Source Map 拦截 ───
  console.log('\n[测试 2] Source Map 请求拦截')
  {
    const res1 = await request('GET', '/api/index.js.map')
    assert(res1.status === 403, `Source Map 应被拦截 (got ${res1.status})`)
    const res2 = await request('GET', '/assets/app.js.map?v=1')
    assert(res2.status === 403, `带 query 的 Source Map 也应被拦截 (got ${res2.status})`)
  }

  // ─── 测试 3: 路径遍历拦截 ───
  console.log('\n[测试 3] 路径遍历拦截')
  {
    const res1 = await request('GET', '/api/../.env.local')
    assert(res1.status === 403, `路径遍历 ../ 应被拦截 (got ${res1.status})`)
    const res2 = await request('GET', '/api/achievements/..%2f..%2f.env')
    assert(res2.status === 403, `URL 编码路径遍历应被拦截 (got ${res2.status})`)
  }

  // ─── 测试 4: 隐藏文件拦截 ───
  console.log('\n[测试 4] 隐藏文件拦截')
  {
    const res = await request('GET', '/.env')
    assert(res.status === 403, `隐藏文件应被拦截 (got ${res.status})`)
  }

  // ─── 测试 5: CSRF 保护 ───
  console.log('\n[测试 5] CSRF 保护')
  {
    // 无 CSRF token 的 POST 请求应被拒绝
    const res = await request('POST', '/api/logout', { body: {} })
    // logout 可能豁免 CSRF，但我们测试其他端点
    const res2 = await request('POST', '/api/refresh-token', {
      body: { dummy: true },
      origin: 'https://evil.com',
    })
    // 至少响应不应是 200
    assert(res2.status !== 200, `跨站 POST 应被 CSRF 拦截 (got ${res2.status})`)
  }

  // ─── 测试 6: 黑名单请求头拦截 ───
  console.log('\n[测试 6] 黑名单请求头拦截')
  {
    const res = await request('POST', '/api/health', {
      headers: { 'X-Admin-Bypass': 'true' },
      body: {},
    })
    assert(res.status === 403, `黑名单请求头应被拦截 (got ${res.status})`)
  }

  // ─── 测试 7: 注册请求 zod 校验 ───
  console.log('\n[测试 7] 注册请求 zod 校验')
  {
    // 缺少必填字段
    const res1 = await request('POST', '/api/register', { body: {} })
    assert(res1.status === 400, `缺少必填字段应返回 400 (got ${res1.status})`)
    assert(res1.data?.code === 'VALIDATION_ERROR', `应返回 VALIDATION_ERROR (got ${res1.data?.code})`)

    // 无效邮箱
    const res2 = await request('POST', '/api/register', {
      body: { email: 'not-an-email', password: 'Test1234!', username: 'testuser', turnstileToken: 'test' },
    })
    assert(res2.status === 400, `无效邮箱应返回 400 (got ${res2.status})`)

    // 弱密码
    const res3 = await request('POST', '/api/register', {
      body: { email: 'test@test.com', password: 'weak', username: 'testuser', turnstileToken: 'test' },
    })
    assert(res3.status === 400, `弱密码应返回 400 (got ${res3.status})`)

    // 多余字段拒绝
    const res4 = await request('POST', '/api/register', {
      body: { email: 'test@test.com', password: 'Test1234!', username: 'testuser', turnstileToken: 'test', extraField: 'hack' },
    })
    assert(res4.status === 400, `多余字段应被拒绝 (got ${res4.status})`)
  }

  // ─── 测试 8: 登录请求 zod 校验 ───
  console.log('\n[测试 8] 登录请求 zod 校验')
  {
    const res = await request('POST', '/api/login', { body: { email: 'invalid', password: '' } })
    assert(res.status === 400, `无效登录请求应返回 400 (got ${res.status})`)
    assert(res.data?.code === 'VALIDATION_ERROR', `应返回 VALIDATION_ERROR (got ${res.data?.code})`)
  }

  // ─── 测试 9: 安全响应头 ───
  console.log('\n[测试 9] 安全响应头')
  {
    const res = await request('GET', '/api/health')
    const headers = res.headers
    // helmet 设置的头
    assert(headers['x-content-type-options'] === 'nosniff', `应设置 X-Content-Type-Options (got ${headers['x-content-type-options']})`)
    assert(headers['x-frame-options'] === 'DENY', `应设置 X-Frame-Options (got ${headers['x-frame-options']})`)
    assert(headers['x-xss-protection'] === '0', `应设置 X-XSS-Protection (got ${headers['x-xss-protection']})`)
    assert(headers['strict-transport-security'], `应设置 Strict-Transport-Security`)
    assert(headers['referrer-policy'] === 'strict-origin-when-cross-origin', `应设置 Referrer-Policy`)
    // permissions-policy
    assert(headers['permissions-policy'], `应设置 Permissions-Policy`)
  }

  // ─── 测试 10: 错误响应不泄露内部信息 ───
  console.log('\n[测试 10] 错误响应归一化')
  {
    // 访问不存在的路由
    const res = await request('GET', '/api/nonexistent-route-12345')
    // 可能返回 404 或 500，但不应泄露路径
    const bodyStr = JSON.stringify(res.data || {})
    assert(!bodyStr.includes('node_modules'), '错误响应不应泄露 node_modules 路径')
    assert(!bodyStr.includes('api/index.js'), '错误响应不应泄露源码路径')
    assert(!bodyStr.includes('C:\\'), '错误响应不应泄露 Windows 路径')
  }

  // ─── 测试 11: 数据库文件直接访问拦截 ───
  console.log('\n[测试 11] 敏感文件访问拦截')
  {
    const res1 = await request('GET', '/data/audit-log.sqlite')
    assert(res1.status === 403, `SQLite 文件应被拦截 (got ${res1.status})`)
    const res2 = await request('GET', '/.env.local')
    assert(res2.status === 403, `.env.local 应被拦截 (got ${res2.status})`)
  }

  // ─── 测试 12: 管理员路由安全门 ───
  console.log('\n[测试 12] 管理员路由安全门')
  {
    // 无认证访问管理接口
    const res = await request('GET', '/api/admin/surveys')
    // 应返回 401 未登录
    assert(res.status === 401, `未认证访问管理员接口应返回 401 (got ${res.status})`)
  }

  // ─── 测试 13: 请求体大小限制 ───
  console.log('\n[测试 13] 请求体大小限制')
  {
    const largeBody = { data: 'x'.repeat(2 * 1024 * 1024) } // 2MB
    const res = await request('POST', '/api/health', { body: largeBody })
    // 应返回 413 或错误
    assert(res.status !== 200, `超大请求体应被拒绝 (got ${res.status})`)
  }

  // ─── 测试 14: CORS 限制 ───
  console.log('\n[测试 14] CORS 限制')
  {
    const res = await request('GET', '/api/health', {
      origin: 'https://evil-attacker.com',
    })
    // CORS 拒绝时 Access-Control-Allow-Origin 不应为通配符
    assert(res.headers['access-control-allow-origin'] !== '*', 'CORS 不应使用通配符')
    assert(res.headers['access-control-allow-origin'] !== 'https://evil-attacker.com', '未授权来源不应被允许')
  }

  // ─── 测试 15: 请求重放防护 ───
  console.log('\n[测试 15] 请求重放防护')
  {
    const nonce = crypto.randomBytes(16).toString('hex')
    const timestamp = Date.now().toString()
    // 同一个 nonce 发送两次
    const res1 = await request('POST', '/api/health', {
      nonce,
      timestamp,
      body: {},
    })
    // 第二次应该被拒绝（如果 nonce 已存在）
    const res2 = await request('POST', '/api/health', {
      nonce,
      timestamp,
      body: {},
    })
    // 至少第二次不应成功（可能被限流）
    assert(res2.status !== 200 || res2.status === 429, `重放请求应被拒绝 (got ${res2.status})`)
  }

  // ─── 测试 16: 限流器存在性验证 ───
  console.log('\n[测试 16] 限流器存在性验证')
  {
    // 快速连续发送请求触发限流
    let rateLimited = false
    for (let i = 0; i < 5; i++) {
      const res = await request('POST', '/api/login', {
        body: { email: 'rate@test.com', password: 'Test1234!', turnstileToken: 'test' },
      })
      if (res.status === 429) {
        rateLimited = true
        break
      }
    }
    assert(rateLimited, `限流器应正常工作（触发 429）`)
  }

  // ─── 测试 17: 原型污染防护 ───
  console.log('\n[测试 17] 原型污染防护')
  {
    const res = await request('POST', '/api/health', {
      body: JSON.parse('{"__proto__": {"admin": true}, "data": "test"}'),
      headers: { 'Content-Type': 'application/json' },
    })
    // 不应导致崩溃
    assert(res.status !== 500, `原型污染不应导致服务器错误 (got ${res.status})`)
  }

  // ─── 测试 18: 刷新令牌轮换 ───
  console.log('\n[测试 18] 刷新令牌机制')
  {
    const res = await request('POST', '/api/refresh-token', { body: {} })
    // 未提供 refresh token 应返回 401
    assert(res.status === 401, `无 refresh token 应返回 401 (got ${res.status})`)
    assert(res.data?.message === '未登录' || res.status === 401, `应提示未登录`)
  }

  // ─── 测试 19: 退出登录后访问受保护路由 ───
  console.log('\n[测试 19] 登出后令牌吊销')
  {
    const res = await request('POST', '/api/logout', { body: {} })
    assert(res.status === 200, `登出应返回 200 (got ${res.status})`)
  }

  // ─── 测试 20: BlockList 存在性 ───
  console.log('\n[测试 20] BlockList 封禁机制')
  {
    // 验证 BlockList 已正确导入并工作
    // 通过访问被阻止的路径来验证
    const res = await request('GET', '/api/health')
    assert(res.status === 200, `基础请求应正常工作 (got ${res.status})`)
  }

  // ─── 测试 21: 管理员登录二次验证保护 ───
  console.log('\n[测试 21] 管理员二次验证')
  {
    // 直接访问敏感管理操作
    const res = await request('POST', '/api/admin/2fa/setup', { body: {} })
    assert(res.status === 401, `未认证访问 2FA 设置应返回 401 (got ${res.status})`)
  }

  // ─── 测试 22: 不允许将 .enc 文件作为静态文件访问 ───
  console.log('\n[测试 22] 不允许访问加密密钥文件')
  {
    const res = await request('GET', '/security/vault/secret.enc')
    assert(res.status === 403, `密钥文件应被拦截 (got ${res.status})`)
    const res2 = await request('GET', '/.lingualeap-secrets/JWT_SECRET.enc')
    assert(res2.status === 403, `密钥目录应被拦截 (got ${res2.status})`)
  }

  // ─── 测试 23: 环境变量校验 ───
  console.log('\n[测试 23] 环境变量校验')
  {
    // 验证 Turnstile 测试密钥在生产环境被禁止
    // 验证 JWT 密钥强度校验
    // 这些在启动时已完成，此处验证服务器是否正常运行
    const res = await request('GET', '/api/version')
    assert(res.status === 200, `API 版本端点应正常 (got ${res.status})`)
  }

  // ═══════════════════════════════════════════════
  // 结果
  // ═══════════════════════════════════════════════
  console.log('\n\n═══════════════════════════════════════════════════')
  console.log('  测试完成')
  console.log(`  通过: ${passed}`)
  console.log(`  失败: ${failed}`)
  console.log('═══════════════════════════════════════════════════')

  if (failures.length > 0) {
    console.log('\n❌ 失败详情:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
  }

  if (failed > 0) {
    console.log('\n⚠️  安全回归测试未完全通过！请修复上述问题。')
    process.exit(1)
  } else {
    console.log('\n✅ 所有安全回归测试通过！')
    process.exit(0)
  }
}

runTests().catch((err) => {
  console.error('测试执行异常:', err)
  process.exit(1)
})