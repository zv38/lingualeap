import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getClientIP } from './auditLogger.js'
import { encrypt as vaultEncrypt, decrypt as vaultDecrypt, hasEncryptionKey } from '../privacy/fileVault.js'
import { setString, getString, deleteString } from '../../lib/sharedState.js'

const SECURITY_DIR = path.resolve('.security')
const AUDIT_LOG = path.join(SECURITY_DIR, 'audit.log')
const CSRF_SESSION_COOKIE = 'll_csrf_sid'

// 黑名单请求头：由后端维护，不暴露给前端，防止攻击者得知被拦截字段
const BLACKLISTED_HEADERS = [
  'x-opencode-auth',
  'x-admin-bypass',
  'x-internal-secret',
  'x-override-auth',
  'x-debug-token',
  'x-env-override',
]

try {
  if (!fs.existsSync(SECURITY_DIR)) {
    fs.mkdirSync(SECURITY_DIR, { recursive: true })
  }
} catch {}

function encryptLogEntry(entryJson) {
  if (hasEncryptionKey()) {
    return vaultEncrypt(entryJson, { context: 'audit-log' })
  }
  // 仅在没有配置密钥的开发/测试环境降级为明文，并给出明确警告
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[SecurityLogger] 未配置文件加密密钥，审计日志将以明文写入。生产环境必须配置 FILE_ENCRYPTION_KEY(S)。')
  }
  return entryJson
}

function decryptLogLine(line) {
  if (line.startsWith('enc:v2:') || line.startsWith('enc:v1:')) {
    return vaultDecrypt(line)
  }
  return line
}

export class SecurityLogger {
  static async log(event) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: event.type,
      severity: event.severity || 'info',
      actor: {
        ip: event.ip || 'unknown',
        userId: event.userId || null,
        sessionId: event.sessionId || null,
      },
      action: {
        method: event.method || null,
        path: event.path || null,
        statusCode: event.statusCode || null,
      },
      details: event.details || {},
    }

    const lastHash = this.getLastHash()
    entry.previousHash = lastHash
    entry.hash = crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex')

    // 控制台实时输出：让防御日志在后端终端可见
    const sevColors = { high: '\x1b[41m', warning: '\x1b[43m', info: '\x1b[44m', critical: '\x1b[41m' }
    const sevLabels = { high: '■ 拦截', warning: '▲ 警告', info: '● 信息', critical: '■ 严重' }
    const color = sevColors[event.severity] || '\x1b[44m'
    const label = sevLabels[event.severity] || '● 信息'
    const time = new Date().toLocaleTimeString('zh-CN')
    console.log('')
    console.log(`${color}\x1b[30m ${label} \x1b[0m \x1b[33m${event.type}\x1b[0m  ${time}`)
    console.log(`  路径: ${event.method || '?'} ${event.path || '?'}`)
    console.log(`  来源: ${event.ip || 'unknown'}`)
    if (event.details && Object.keys(event.details).length > 0) {
      const detailStr = typeof event.details === 'string' ? event.details : JSON.stringify(event.details)
      console.log(`  详情: ${detailStr}`)
    }

    try {
      const encrypted = encryptLogEntry(JSON.stringify(entry))
      fs.appendFileSync(AUDIT_LOG, encrypted + '\n', { mode: 0o600 })
    } catch {}

    return entry
  }

  static getLastHash() {
    try {
      if (!fs.existsSync(AUDIT_LOG)) return null
      const lines = fs.readFileSync(AUDIT_LOG, 'utf-8').trim().split('\n').filter(l => l.trim())
      if (!lines.length) return null
      const lastLine = decryptLogLine(lines[lines.length - 1])
      return JSON.parse(lastLine).hash
    } catch {
      return null
    }
  }

  static verifyChain() {
    try {
      if (!fs.existsSync(AUDIT_LOG)) return { valid: true, count: 0 }
      const lines = fs.readFileSync(AUDIT_LOG, 'utf-8').trim().split('\n').filter(l => l.trim())
      let previousHash = null
      for (const line of lines) {
        const raw = decryptLogLine(line)
        const e = JSON.parse(raw)
        const content = JSON.stringify({ ...e, hash: undefined, previousHash: undefined })
        if (e.hash !== crypto.createHash('sha256').update(content).digest('hex')) {
          return { valid: false, brokenAt: e.id }
        }
        if (e.previousHash !== previousHash) return { valid: false, brokenAt: e.id }
        previousHash = e.hash
      }
      return { valid: true, count: lines.length }
    } catch {
      return { valid: false, error: '日志损坏' }
    }
  }
}

export class BlockList {
  static store = new Map()
  static LOCAL_IPS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'])

  static add(ip, duration = 3600000) {
    this.store.set(ip, Date.now() + duration)
  }

  static isBlocked(ip) {
    // 军工级：封禁策略对所有来源一视同仁，本地 IP 也不例外。
    // 攻击者可能伪造 X-Forwarded-For 假装本地来源以绕过封禁。
    const expiry = this.store.get(ip)
    if (!expiry) return false
    if (Date.now() > expiry) {
      this.store.delete(ip)
      return false
    }
    return true
  }

  static remove(ip) {
    this.store.delete(ip)
  }
}

// CSRF token 存储（绑定会话 cookie，防止跨会话重放）
// 军工级：使用 Redis/sharedState 共享存储，确保 PM2 多实例下一半 token 同步与一次性消费
const CSRF_TTL = 60 * 60 * 1000; // 1小时
const CSRF_MAX_PER_SESSION = 10; // 每个会话最多同时持有的 token 数

function csrfTokenKey(token) {
  return `csrf:token:${token}`
}

function csrfSessionKey(sid) {
  return `csrf:session:${sid}`
}

function getCsrfSessionId(req, res) {
  let sid = req.cookies?.[CSRF_SESSION_COOKIE]
  if (!sid || typeof sid !== 'string' || sid.length !== 64) {
    sid = crypto.randomBytes(32).toString('hex')
    if (res) {
      res.cookie(CSRF_SESSION_COOKIE, sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: CSRF_TTL,
        path: '/',
      })
    }
  }
  return sid
}

function computeCsrfTokenSignature(sid, nonce) {
  const secret = process.env.CSRF_SIGN_SECRET || crypto.randomBytes(32).toString('hex')
  return crypto.createHmac('sha256', secret).update(`${nonce}.${sid}`).digest('hex')
}

async function loadSessionTokens(sid) {
  const data = await getString(csrfSessionKey(sid))
  if (!data) return []
  try {
    const arr = JSON.parse(data)
    if (Array.isArray(arr)) return arr
  } catch {}
  return []
}

async function saveSessionTokens(sid, tokens) {
  const ttlSeconds = Math.ceil(CSRF_TTL / 1000)
  await setString(csrfSessionKey(sid), JSON.stringify(tokens), ttlSeconds)
}

async function pruneSessionTokens(sid) {
  const now = Date.now()
  const tokens = await loadSessionTokens(sid)
  const valid = []
  for (const t of tokens) {
    const data = await getString(csrfTokenKey(t))
    if (!data) continue
    try {
      const rec = JSON.parse(data)
      if (rec.expiry > now) valid.push(t)
    } catch {}
  }
  if (valid.length !== tokens.length) {
    await saveSessionTokens(sid, valid)
  }
  return valid
}

export async function generateCsrfToken(req, res) {
  const sid = getCsrfSessionId(req, res)
  const now = Date.now()

  // 清理过期 token 并限制每个会话可持有的 token 数量
  let tokens = await pruneSessionTokens(sid)
  while (tokens.length >= CSRF_MAX_PER_SESSION) {
    const oldest = tokens.shift()
    await deleteString(csrfTokenKey(oldest))
  }

  const nonce = crypto.randomBytes(24).toString('base64url')
  const sig = computeCsrfTokenSignature(sid, nonce)
  const token = `${nonce}.${sig}`
  const expiry = now + CSRF_TTL

  await setString(csrfTokenKey(token), JSON.stringify({ sid, expiry, createdAt: now }), Math.ceil(CSRF_TTL / 1000))
  tokens.push(token)
  await saveSessionTokens(sid, tokens)
  return token
}

export async function validateCsrfToken(token, req) {
  if (!token || typeof token !== 'string') return false

  const data = await getString(csrfTokenKey(token))
  if (!data) return false

  let record
  try {
    record = JSON.parse(data)
  } catch {
    return false
  }

  if (Date.now() > record.expiry) {
    await deleteString(csrfTokenKey(token))
    return false
  }

  // 会话绑定校验：token 必须属于当前会话 cookie
  const sid = req?.cookies?.[CSRF_SESSION_COOKIE]
  if (!sid || sid !== record.sid) {
    return false
  }

  // 签名校验：防止 token 被篡改或跨会话构造
  const [nonce] = token.split('.')
  if (!nonce || computeCsrfTokenSignature(sid, nonce) !== token.split('.')[1]) {
    return false
  }

  // 一次性消费：验证通过立即删除，防止 Token 被重放利用
  await deleteString(csrfTokenKey(token))
  const tokens = await loadSessionTokens(sid)
  await saveSessionTokens(sid, tokens.filter(t => t !== token))
  return true
}

export async function csrfTokenLimiter(req, res, next) {
  // 只读，不设置 cookie — 统一由 generateCsrfToken 处理
  const sid = req.cookies?.[CSRF_SESSION_COOKIE]
  if (!sid || typeof sid !== 'string' || sid.length !== 64) {
    // 没有有效 sid，说明尚未初始化，跳过限流
    return next()
  }
  const tokens = await pruneSessionTokens(sid)
  if (tokens.length >= CSRF_MAX_PER_SESSION) {
    return res.status(429).json({ success: false, message: '请求过于频繁', code: 'RATE_LIMITED' })
  }
  next()
}

// 延迟读取环境变量，确保 api/index.js 中 dotenv.config() 已执行
function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function isSameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || ''
  if (!origin) return false
  try {
    const url = new URL(origin)
    // 安全规范：CSRF Origin/Referer 校验需与 CORS 白名单保持一致，防止 localhost 任意端口绕过
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false
    const allowedOrigins = getAllowedOrigins()
    return allowedOrigins.some(allowed => {
      try {
        const allowedUrl = new URL(allowed)
        return url.protocol === allowedUrl.protocol && url.host === allowedUrl.host
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export async function securityMiddleware(req, res, next) {
  const ip = getClientIP(req)
  const isDev = process.env.NODE_ENV !== 'production'
  const checks = []

  // 安全仪表盘端点豁免：终端看板脚本需要无状态访问
  if (req.path === '/api/security/dashboard') {
    next()
    return
  }

  if (BlockList.isBlocked(ip)) {
    checks.push('BlockList:BLOCKED')
    if (isDev) {
      const time = new Date().toLocaleTimeString('zh-CN')
      console.log(`\n\x1b[41m\x1b[30m ■ 拦截 \x1b[0m \x1b[33mBLOCKLIST\x1b[0m  ${time}`)
      console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
      console.log(`  详情: IP 在黑名单中，请求被拒绝`)
    }
    return res.status(403).json({ success: false, message: '请求被安全策略阻止', code: 'BLOCKED' })
  }
  checks.push('BlockList:PASS')

  // 黑名单请求头检测：任何请求都不应携带这些内部/管理 header
  const lowerHeaders = Object.keys(req.headers).map(h => h.toLowerCase())
  const blockedHeader = BLACKLISTED_HEADERS.find(bh => lowerHeaders.includes(bh.toLowerCase()))
  if (blockedHeader) {
    SecurityLogger.log({
      type: 'BLACKLISTED_HEADER',
      severity: 'high',
      ip,
      method: req.method,
      path: req.path,
      details: { header: blockedHeader },
    })
    return res.status(403).json({ success: false, message: '请求被安全策略拒绝', code: 'BLACKLISTED_HEADER' })
  }
  checks.push('HeaderCheck:PASS')

  // CSRF 校验：对非 GET/OPTIONS/HEAD 请求检查 x-csrf-token
  // AI/chat 端点豁免，无需 CSRF（聊天无副作用）
  // 安全检测端点豁免（行为采集/环境检测 — 数据采集而非状态变更，前端会频繁 POST）
  // 视频上传端点不再豁免：要求从 form body 或 query 中携带 CSRF token
  if (!['GET', 'OPTIONS', 'HEAD'].includes(req.method.toUpperCase())) {
    if (req.path.startsWith('/api/ai/')) {
      checks.push('CSRF:EXEMPT(AI)')
      next()
      return
    }
    // 安全规范：仅对明确无需 CSRF 保护的具体只读/采集端点豁免，并保留 Origin/Referer 校验
    // 禁止整体豁免 /api/security/ 前缀，防止该前缀下新增状态变更接口被 CSRF 攻击
    if (req.path === '/api/security/behavior' || req.path === '/api/security/environment-check' || req.path === '/api/security/ip-check') {
      checks.push('CSRF:EXEMPT(security)')
      next()
      return
    }
    // bug-report 端点豁免：前端自动检测上报时无法携带 CSRF token
    if (req.path.startsWith('/api/bug-report')) {
      checks.push('CSRF:EXEMPT(bug-report)')
      next()
      return
    }
    // 注意：events/trigger-update 已改为管理员+mTLS 双重鉴权，可携带 CSRF token，故不再豁免
    // 认证公开端点豁免：未登录用户无法获取 CSRF token
    if (req.path === '/api/forgot-password' || req.path === '/api/reset-password' ||
        req.path === '/api/register' || req.path === '/api/login') {
      checks.push('CSRF:EXEMPT(auth)')
      next()
      return
    }
    // 不再因本地 IP 跳过 CSRF：伪造 X-Forwarded-For: 127.0.0.1 即可绕过。
    // 支持 header、form body、query 三种携带方式，兼容文件上传场景
    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf || req.query?._csrf
    if (!(await validateCsrfToken(csrfToken, req))) {
      SecurityLogger.log({
        type: 'CSRF_BLOCKED',
        severity: 'warning',
        ip,
        method: req.method,
        path: req.path,
        details: { reason: '无效或缺失 CSRF token' },
      })
      return res.status(403).json({ success: false, message: 'CSRF 校验失败，拒绝请求', code: 'CSRF_BLOCKED' })
    }
    checks.push('CSRF:PASS')
    // 额外校验 Origin/Referer，防止跨站携带偷来的 token
    if (!isSameOrigin(req)) {
      SecurityLogger.log({
        type: 'CSRF_BLOCKED',
        severity: 'warning',
        ip,
        method: req.method,
        path: req.path,
        details: { reason: 'Origin/Referer 不匹配' },
      })
      return res.status(403).json({ success: false, message: 'CSRF 校验失败，拒绝请求', code: 'CSRF_BLOCKED' })
    }
    checks.push('Origin:PASS')
  } else {
    checks.push('CSRF:SKIP(GET)')
  }

  const sensitivePaths = ['/api/login', '/api/register', '/api/forgot-password', '/api/reset-password']
  if (sensitivePaths.some(p => req.path.startsWith(p))) {
    checks.push('SensitivePath:WATCH')
    // 安全规范：审计日志中禁止记录 token 片段，应记录用户 ID 或匿名标识
    SecurityLogger.log({
      type: 'SENSITIVE_REQUEST',
      severity: 'info',
      ip,
      userId: req.tokenPayload?.userId || 'anonymous',
      method: req.method,
      path: req.path,
    })
  }

  // 开发模式：输出安全检查追踪日志
  if (isDev) {
    const time = new Date().toLocaleTimeString('zh-CN')
    const checkStr = checks.join(' → ')
    console.log(`\x1b[90m  [Security] ${time} ${req.method} ${req.path}  ${checkStr}  ← ${ip}\x1b[0m`)
  }

  next()
}