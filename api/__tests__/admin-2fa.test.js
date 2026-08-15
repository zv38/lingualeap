import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import { createAdminRouter } from '../routes/admin.js'
import AdminTrust from '../security/auth/adminTrust.js'

/**
 * Phase 2 · 管理员强制 2FA 回归测试。
 *
 * 覆盖两类加固行为：
 * 1. 登录挑战门禁（AdminTrust.decideChallenges）：已开启 TOTP 的管理员必须走 TOTP 步骤；
 * 2. 2FA 绑定接口访问控制：/admin/2fa/setup 与 /admin/2fa/verify
 *    未登录 -> 401，非管理员 -> 403，管理员 -> 200（修复前依赖不可用的 fresh-reauth，恒 403）。
 */

// ---- 与生产语义一致的 mock 鉴权中间件 ----
function makeAuthMiddleware() {
  return function authMiddleware(req, res, next) {
    const token = req.headers['authorization'] || ''
    if (!token) return res.status(401).json({ success: false, message: '未登录或令牌已过期' })
    if (token === 'Bearer admin-token') {
      req.tokenPayload = { userId: 'admin-1', role: 'admin' }
      req.user = { id: 'admin-1', role: 'admin' }
      return next()
    }
    if (token === 'Bearer user-token') {
      req.tokenPayload = { userId: 'u-1', role: 'user' }
      req.user = { id: 'u-1', role: 'user' }
      return next()
    }
    return res.status(401).json({ success: false, message: '令牌无效或已过期' })
  }
}

function makeRequireAdmin() {
  return function requireAdmin(req, res, next) {
    if (!req.tokenPayload) return res.status(401).json({ success: false, message: '未登录' })
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权访问' })
    }
    return next()
  }
}

const noop = (req, res, next) => next()

function buildAdminApp() {
  const app = express()
  app.use(express.json())

  const authMiddleware = makeAuthMiddleware()
  const requireAdmin = makeRequireAdmin()
  const adminTOTPSecrets = new Map()
  const usersDB = new Map([
    ['admin-1', { id: 'admin-1', role: 'admin', email: 'admin@test.com' }],
    ['u-1', { id: 'u-1', role: 'user', email: 'user@test.com' }],
  ])

  app.use('/api', createAdminRouter({
    usersDB,
    sessionsDB: new Map(),
    revokedAccessTokens: new Map(),
    revokedRefreshTokens: new Map(),
    adminCaptchaStore: new Map(),
    adminTOTPSecrets,
    adminTrust: new AdminTrust({ dataDir: 'data' }),
    surveys: [],
    outboundFilter: { checkUrl: () => true },
    ADMIN_IP_WHITELIST: [],
    authMiddleware,
    requireAdmin,
    adminLoginLimiter: noop,
    getJwtSecret: () => 'test-secret',
    getJwtRefreshSecret: () => 'test-refresh-secret',
    KEY_VERSION: 'v1',
    REFRESH_KEY_VERSION: 'v1',
    DEVICE_FINGERPRINT_PEPPER: 'pepper',
    IS_DEV: true,
    readEncryptedJSON: async () => null,
    writeEncryptedJSON: async () => {},
    DATA_DIR: 'data',
  }))

  return app
}

let server
afterEach(() => {
  if (server) {
    server.close()
    server = null
  }
})

async function requestBody(app, path, { auth, body = {}, method = 'GET' } = {}) {
  const srv = createServer(app)
  await new Promise((resolve) => srv.listen(0, resolve))
  server = srv
  const port = srv.address().port
  const headers = { 'Content-Type': 'application/json' }
  if (auth) headers['authorization'] = `Bearer ${auth}`
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

describe('强制 2FA · 登录挑战门禁 (decideChallenges)', () => {
  const trust = new AdminTrust({ dataDir: 'data' })

  it('已开启 TOTP 的管理员登录必须包含 TOTP 步骤', () => {
    const { steps, blocked } = trust.decideChallenges({
      level: 'trusted',
      adminTotpEnabled: true,
      userHasEmail: false,
    })
    expect(blocked).toBe(false)
    const totp = steps.find((s) => s.type === 'totp')
    expect(totp).toBeTruthy()
    expect(totp.required).toBe(true)
  })

  it('高风险管理员登录仍包含 TOTP 与图形验证码', () => {
    const { steps } = trust.decideChallenges({
      level: 'high_risk',
      adminTotpEnabled: true,
      userHasEmail: true,
    })
    const types = steps.map((s) => s.type)
    expect(types).toContain('totp')
    expect(types).toContain('captcha')
    expect(types).toContain('emailCode')
  })

  it('阻断级环境直接拒绝', () => {
    const { blocked } = trust.decideChallenges({
      level: 'blocked',
      adminTotpEnabled: true,
      userHasEmail: false,
    })
    expect(blocked).toBe(true)
  })
})

describe('强制 2FA · 绑定接口访问控制 (/admin/2fa/*)', () => {
  const app = buildAdminApp()

  it('未登录访问 2FA 绑定 -> 401', async () => {
    const r = await requestBody(app, '/api/admin/2fa/setup', { method: 'POST', body: {} })
    expect(r.status).toBe(401)
  })

  it('普通用户访问 2FA 绑定 -> 403', async () => {
    const r = await requestBody(app, '/api/admin/2fa/setup', { method: 'POST', body: {}, auth: 'user-token' })
    expect(r.status).toBe(403)
  })

  it('管理员访问 2FA 绑定 -> 200（可获取 TOTP 密钥）', async () => {
    const r = await requestBody(app, '/api/admin/2fa/setup', { method: 'POST', body: {}, auth: 'admin-token' })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(typeof r.data.secret).toBe('string')
  })

  it('未登录访问 2FA 校验 -> 401', async () => {
    const r = await requestBody(app, '/api/admin/2fa/verify', { method: 'POST', body: { code: '000000' } })
    expect(r.status).toBe(401)
  })

  it('普通用户访问 2FA 校验 -> 403', async () => {
    const r = await requestBody(app, '/api/admin/2fa/verify', { method: 'POST', body: { code: '000000' }, auth: 'user-token' })
    expect(r.status).toBe(403)
  })
})