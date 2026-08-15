import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import { createEventsRouter } from '../routes/events.js'
import createSecurityRouter from '../routes/security.js'

/**
 * 横向越权（水平访问控制）回归测试。
 *
 * 覆盖此前发现的两类横向越权漏洞：
 * 1. GET /logs、/logs/stats 曾仅鉴权未校验管理员，导致任意登录用户可读敏感审计日志；
 * 2. GET /security/dashboard 曾完全无鉴权，任何匿名请求可读取 WAF 封禁 IP、运行时违规等敏感信息。
 *
 * 修复后：未登录 -> 401，普通用户 -> 403，管理员 -> 200。
 */

// ---- 与生产语义一致的 mock 鉴权中间件 ----
// 生产 authMiddleware：无 token -> 401；非法 token -> 401；合法 -> 挂载 tokenPayload/user
function makeAuthMiddleware() {
  return function authMiddleware(req, res, next) {
    const token = req.headers['authorization'] || ''
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录或令牌已过期' })
    }
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

// 生产 requireAdmin：未登录 -> 401；非 admin -> 403
function makeRequireAdmin() {
  return function requireAdmin(req, res, next) {
    if (!req.tokenPayload) {
      return res.status(401).json({ success: false, message: '未登录' })
    }
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权访问' })
    }
    return next()
  }
}

const noop = (req, res, next) => next()

// ---- 构建被测应用 ----
function buildApp() {
  const app = express()
  app.use(express.json())

  const authMiddleware = makeAuthMiddleware()
  const requireAdmin = makeRequireAdmin()

  app.use('/api', createEventsRouter({
    express,
    authMiddleware,
    adminClientCertGate: requireAdmin,
    publicLimiter: noop,
    csrfTokenLimiter: noop,
    healthLimiter: noop,
    sseMiddleware: noop,
    broadcastVersionUpdate: () => 0,
    setVersionInfo: () => {},
    getVersionInfo: () => ({}),
    getSSEStats: () => ({}),
    path: {},
    fs: {},
    generateCsrfToken: async () => 'csrf',
    os: {},
    server: {},
    getAuditLog: () => ({ total: 0, data: [] }),
    getAuditLogStats: () => ({ total: 0 }),
  }))

  const connectionTracker = {
    blockedIPs: new Map(),
    connections: new Map(),
  }
  app.use('/api', createSecurityRouter({
    usersDB: new Map(),
    sessionsDB: new Map(),
    authMiddleware,
    adminClientCertGate: requireAdmin,
    requireAdminReauth: noop,
    getClientIP: (req) => req.ip || '0.0.0.0',
    logAudit: () => {},
    getIPRisk: async () => null,
    invalidateUserSessions: async () => {},
    getSecurityOverview: () => ({}),
    getRiskEvents: () => [],
    markRiskEventsRead: () => {},
    generateRiskChallenge: () => ({ challengeId: 'c' }),
    verifyRiskChallenge: () => ({ valid: true }),
    checkTempBanExpiry: () => {},
    generateAntiOcrNoise: () => '',
    getCurrentPolicy: () => ({}),
    needsAcceptance: () => false,
    getUserAcceptance: () => ({}),
    getAdaptiveDifficulty: () => 3,
    getAccountStatusForUser: () => ({}),
    getUnreadRiskEventCount: () => 0,
    createHumanChallenge: () => ({ token: 't' }),
    verifyHumanChallenge: () => ({ success: true }),
    generateNumericCaptcha: () => ({}),
    generateMathCaptcha: () => ({}),
    generateRotateCaptcha: () => ({}),
    generateSequenceCaptcha: () => ({}),
    generateAudioCaptcha: () => ({ hint: '' }),
    getImageCaptchaStats: () => ({}),
    ipReputation: {},
    requestTracker: {},
    publicLimiter: noop,
    captchaLimiter: noop,
    connectionTracker,
    getRuntimeSecurityStatus: () => ({}),
    getRuntimeGuardViolations: () => [],
    getAuditLog: () => ({ total: 0 }),
    getGovernorStatus: () => ({}),
    getResourceShieldStatus: () => ({}),
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

async function request(app, path, auth) {
  const srv = createServer(app)
  await new Promise((resolve) => srv.listen(0, resolve))
  server = srv
  const port = srv.address().port
  const headers = {}
  if (auth) headers['authorization'] = `Bearer ${auth}`
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers })
  return res.status
}

describe('横向越权 · 审计日志端点 (/logs)', () => {
  const app = buildApp()

  it('未登录访问审计日志 -> 401', async () => {
    expect(await request(app, '/api/logs')).toBe(401)
  })

  it('普通用户访问审计日志 -> 403', async () => {
    expect(await request(app, '/api/logs', 'user-token')).toBe(403)
  })

  it('管理员访问审计日志 -> 200', async () => {
    expect(await request(app, '/api/logs', 'admin-token')).toBe(200)
  })

  it('普通用户访问日志统计 -> 403', async () => {
    expect(await request(app, '/api/logs/stats', 'user-token')).toBe(403)
  })

  it('管理员访问日志统计 -> 200', async () => {
    expect(await request(app, '/api/logs/stats', 'admin-token')).toBe(200)
  })
})

describe('横向越权 · 安全仪表盘 (/security/dashboard)', () => {
  const app = buildApp()

  it('匿名访问安全仪表盘 -> 401', async () => {
    expect(await request(app, '/api/security/dashboard')).toBe(401)
  })

  it('普通用户访问安全仪表盘 -> 403', async () => {
    expect(await request(app, '/api/security/dashboard', 'user-token')).toBe(403)
  })

  it('管理员访问安全仪表盘 -> 200', async () => {
    expect(await request(app, '/api/security/dashboard', 'admin-token')).toBe(200)
  })
})