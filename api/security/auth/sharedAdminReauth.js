import crypto from 'crypto'
import bcrypt from 'bcrypt'
import speakeasy from 'speakeasy'
import { logAudit, getClientIP } from '../core/auditLogger.js'
import { isRedisReady } from '../../lib/redisClient.js'
import {
  setString,
  getString,
  deleteKey,
  addSetMember,
  removeSetMember,
  getSetMembers,
} from '../../lib/sharedState.js'

const ADMIN_REAUTH_TTL_MS = 10 * 60 * 1000 // 绝对有效期 10 分钟
const INACTIVITY_TTL_MS = 2 * 60 * 1000 // 空闲有效期 2 分钟
const FRESH_TTL_MS = 60 * 1000 // 高危操作要求 1 分钟内 freshly reauth
const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

const PREFIX = 'admin:reauth:'
const sessionKey = (token) => `${PREFIX}session:${token}`
const adminIndexKey = (adminId) => `${PREFIX}admin:${adminId}`
const sessionIndexKey = (sessionId) => `${PREFIX}sessidx:${sessionId}`
const attemptKey = (key) => `${PREFIX}attempt:${key}`
const lockoutKey = (key) => `${PREFIX}lockout:${key}`

// 内存回退（Redis 不可用时使用）
const memorySessions = new Map()
const memoryAttempts = new Map()
const memoryLockouts = new Map()

let _getUserById = null

export function configureAdminReauth({ getUserById }) {
  _getUserById = getUserById
}

function hashClientContext(req) {
  const ip = getClientIP(req) || req.socket?.remoteAddress || 'unknown'
  const ua = req.headers['user-agent'] || 'unknown'
  return {
    ipHash: crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32),
    uaHash: crypto.createHash('sha256').update(ua).digest('hex').slice(0, 32),
  }
}

function getAttemptKey(req) {
  const { ipHash } = hashClientContext(req)
  return `${ipHash}:${req.tokenPayload?.userId || 'anon'}`
}

async function isLockedOut(key) {
  const redisReady = isRedisReady()
  if (redisReady) {
    const data = await getString(lockoutKey(key))
    if (!data) return false
    try {
      const lock = JSON.parse(data)
      if (Date.now() > lock.lockedUntil) return false
      return true
    } catch {
      return false
    }
  }

  const lock = memoryLockouts.get(key)
  if (!lock) return false
  if (Date.now() > lock.lockedUntil) {
    memoryLockouts.delete(key)
    return false
  }
  return true
}

async function recordLockout(key, reason) {
  const lockedUntil = Date.now() + LOCKOUT_DURATION_MS
  const payload = { lockedUntil, reason }
  const ttlSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000)

  memoryLockouts.set(key, payload)
  await setString(lockoutKey(key), JSON.stringify(payload), ttlSeconds)

  logAudit({
    userId: 'admin',
    action: 'admin_reauth_lockout',
    ip: key.split(':')[0],
    details: reason,
    success: false,
  })
}

async function isRateLimited(key) {
  if (await isLockedOut(key)) return true

  const redisReady = isRedisReady()
  let counter = null

  if (redisReady) {
    const data = await getString(attemptKey(key))
    if (data) {
      try {
        counter = JSON.parse(data)
      } catch {
        counter = null
      }
    }
  } else {
    counter = memoryAttempts.get(key)
    if (counter && Date.now() - counter.firstAttempt > ATTEMPT_WINDOW_MS) {
      memoryAttempts.delete(key)
      counter = null
    }
  }

  if (!counter) return false
  if (Date.now() - counter.firstAttempt > ATTEMPT_WINDOW_MS) {
    await deleteKey(attemptKey(key))
    memoryAttempts.delete(key)
    return false
  }

  if (counter.count >= MAX_ATTEMPTS) {
    const reason = `管理员二次验证暴力尝试被锁定: ${counter.count} 次`
    await recordLockout(key, reason)
    logAudit({
      userId: 'admin',
      action: 'admin_reauth_brute_force',
      ip: key.split(':')[0],
      details: reason,
      success: false,
    })
    return true
  }

  return false
}

async function recordAttempt(key, success) {
  if (success) {
    memoryAttempts.delete(key)
    memoryLockouts.delete(key)
    await deleteKey(attemptKey(key))
    await deleteKey(lockoutKey(key))
    return
  }

  const redisReady = isRedisReady()
  let counter = null

  if (redisReady) {
    const data = await getString(attemptKey(key))
    if (data) {
      try {
        counter = JSON.parse(data)
      } catch {
        counter = null
      }
    }
  } else {
    counter = memoryAttempts.get(key)
  }

  if (!counter || Date.now() - counter.firstAttempt > ATTEMPT_WINDOW_MS) {
    counter = { count: 1, firstAttempt: Date.now() }
  } else {
    counter.count += 1
  }

  memoryAttempts.set(key, counter)
  const ttlSeconds = Math.ceil(ATTEMPT_WINDOW_MS / 1000)
  await setString(attemptKey(key), JSON.stringify(counter), ttlSeconds)
}

function cleanupMemory() {
  const now = Date.now()
  for (const [token, session] of memorySessions) {
    if (now > session.expiresAt || now - session.lastUsedAt > INACTIVITY_TTL_MS) {
      memorySessions.delete(token)
    }
  }
  for (const [key, counter] of memoryAttempts) {
    if (now - counter.firstAttempt > ATTEMPT_WINDOW_MS) {
      memoryAttempts.delete(key)
    }
  }
  for (const [key, lock] of memoryLockouts) {
    if (now > lock.lockedUntil) {
      memoryLockouts.delete(key)
    }
  }
}

setInterval(cleanupMemory, 60 * 1000)

async function loadSession(token) {
  const redisReady = isRedisReady()
  if (redisReady) {
    const data = await getString(sessionKey(token))
    if (!data) return null
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  const session = memorySessions.get(token)
  if (!session) return null
  const now = Date.now()
  if (now > session.expiresAt || now - session.lastUsedAt > INACTIVITY_TTL_MS) {
    memorySessions.delete(token)
    return null
  }
  return session
}

async function saveSession(token, session) {
  const ttlMs = session.expiresAt - Date.now()
  const ttlSeconds = ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 1
  memorySessions.set(token, session)
  await setString(sessionKey(token), JSON.stringify(session), ttlSeconds)
  await addSetMember(adminIndexKey(session.adminId), token)
  if (session.sessionId) {
    await addSetMember(sessionIndexKey(session.sessionId), token)
  }
}

async function removeSession(token, session) {
  memorySessions.delete(token)
  await deleteKey(sessionKey(token))
  await removeSetMember(adminIndexKey(session.adminId), token)
  if (session.sessionId) {
    await removeSetMember(sessionIndexKey(session.sessionId), token)
  }
}

/**
 * 创建管理员二次验证会话
 */
export function createAdminReauthSession(adminId, { sessionId, req, singleUse = false } = {}) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  const context = req ? hashClientContext(req) : { ipHash: null, uaHash: null }
  const session = {
    adminId,
    token,
    sessionId: sessionId || null,
    createdAt: now,
    expiresAt: now + ADMIN_REAUTH_TTL_MS,
    lastUsedAt: now,
    ipHash: context.ipHash,
    uaHash: context.uaHash,
    singleUse,
    used: false,
  }

  // 同步写入内存，异步写入 Redis
  memorySessions.set(token, session)
  saveSession(token, session).catch(() => {})

  return { token, expiresAt: session.expiresAt }
}

/**
 * 验证管理员二次验证凭据
 */
export async function verifyAdminReauth({ req, adminUser, password, totpCode, sessionId, totpSecret }) {
  const key = getAttemptKey(req)
  if (await isRateLimited(key)) {
    const err = new Error('验证尝试次数过多，请 15 分钟后重试')
    err.code = 'RATE_LIMITED'
    throw err
  }

  if (!password || typeof password !== 'string') {
    await recordAttempt(key, false)
    const err = new Error('请输入当前登录密码')
    err.code = 'PASSWORD_REQUIRED'
    throw err
  }

  const passwordHash = adminUser.passwordHash || adminUser.password
  if (!passwordHash) {
    const err = new Error('账号状态异常')
    err.code = 'ACCOUNT_ERROR'
    throw err
  }

  const passwordValid = await bcrypt.compare(password, passwordHash)
  if (!passwordValid) {
    await recordAttempt(key, false)
    const err = new Error('密码错误')
    err.code = 'INVALID_PASSWORD'
    throw err
  }

  // 强制二次验证：管理员必须已开启 TOTP 才能完成二次身份验证。
  // 未开启时直接拒绝，避免"未启用 2FA 也能通过敏感操作二次验证"的绕过。
  if (!adminUser.adminTotpEnabled) {
    await recordAttempt(key, false)
    logAudit({
      userId: adminUser.id,
      action: 'admin_reauth_mfa_required',
      ip: key.split(':')[0],
      details: '管理员未开启二次验证，拒绝二次验证请求',
      success: false,
    })
    const err = new Error('管理员必须开启二次验证，请先完成 TOTP 绑定')
    err.code = 'ADMIN_MFA_REQUIRED'
    throw err
  }

  if (!totpCode || typeof totpCode !== 'string') {
    await recordAttempt(key, false)
    const err = new Error('请输入两步验证码')
    err.code = 'TOTP_REQUIRED'
    throw err
  }
  const secret = totpSecret || adminUser.twoFactorSecret
  if (!secret) {
    await recordAttempt(key, false)
    const err = new Error('TOTP 配置异常，请联系超级管理员')
    err.code = 'TOTP_CONFIG_ERROR'
    throw err
  }
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: totpCode.replace(/\s/g, ''),
    window: 1,
  })
  if (!verified) {
    await recordAttempt(key, false)
    const err = new Error('两步验证码错误')
    err.code = 'INVALID_TOTP'
    throw err
  }

  await recordAttempt(key, true)
  return createAdminReauthSession(adminUser.id, { sessionId, req })
}

/**
 * 校验管理员二次验证令牌
 */
export async function validateAdminReauthToken(token, adminId, options = {}) {
  const { sessionId, maxAgeMs, req, consume = false } = options
  if (!token || typeof token !== 'string') return false

  const session = await loadSession(token)
  if (!session) return false
  if (session.adminId !== adminId) return false

  const tokenBuf = Buffer.from(token)
  const sessionTokenBuf = Buffer.from(session.token)
  if (tokenBuf.length !== sessionTokenBuf.length) return false
  try {
    if (!crypto.timingSafeEqual(tokenBuf, sessionTokenBuf)) return false
  } catch {
    return false
  }

  const now = Date.now()
  if (now > session.expiresAt) {
    await removeSession(token, session)
    return false
  }
  if (now - session.lastUsedAt > INACTIVITY_TTL_MS) {
    await removeSession(token, session)
    return false
  }
  if (maxAgeMs && now - session.createdAt > maxAgeMs) {
    return false
  }
  if (sessionId && session.sessionId && session.sessionId !== sessionId) {
    return false
  }
  if (session.singleUse && session.used) {
    return false
  }
  if (req && (session.ipHash || session.uaHash)) {
    const ctx = hashClientContext(req)
    if (session.ipHash && session.ipHash !== ctx.ipHash) return false
    if (session.uaHash && session.uaHash !== ctx.uaHash) return false
  }

  session.lastUsedAt = now
  if (consume || session.singleUse) {
    session.used = true
    await removeSession(token, session)
  } else {
    await saveSession(token, session)
  }
  return true
}

function denyNonAdmin(req, res) {
  const userId = req.tokenPayload?.userId
  const user = userId && _getUserById ? _getUserById(userId) : null
  const isAdmin = user ? user.role === 'admin' : req.tokenPayload?.role === 'admin'
  if (!isAdmin) {
    logAudit({
      userId: userId || 'anon',
      action: 'admin_reauth_denied',
      req,
      details: '非管理员请求敏感管理接口',
      success: false,
    })
    return res.status(403).json({ success: false, message: '仅管理员可执行此操作' })
  }
  return null
}

/**
 * Express 中间件：要求敏感管理操作前已完成二次验证
 */
export async function requireAdminReauth(req, res, next) {
  try {
    const denied = denyNonAdmin(req, res)
    if (denied) return denied

    const adminUser = req.tokenPayload
    const token = req.headers['x-admin-reauth-token']
    if (!(await validateAdminReauthToken(token, adminUser.userId, { sessionId: adminUser.sid, req }))) {
      logAudit({
        userId: adminUser.userId,
        action: 'admin_reauth_required',
        req,
        details: '缺少或无效二次验证令牌',
        success: false,
      })
      return res.status(403).json({
        success: false,
        code: 'ADMIN_REAUTH_REQUIRED',
        message: '请先进行二次身份验证',
      })
    }
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Express 中间件：要求高危敏感操作前在极短时间内完成二次验证
 */
export function requireFreshAdminReauth(maxAgeMs = FRESH_TTL_MS) {
  return async (req, res, next) => {
    try {
      const denied = denyNonAdmin(req, res)
      if (denied) return denied

      const adminUser = req.tokenPayload
      const token = req.headers['x-admin-reauth-token']
      if (
        !(await validateAdminReauthToken(token, adminUser.userId, {
          sessionId: adminUser.sid,
          maxAgeMs,
          req,
          consume: true,
        }))
      ) {
        logAudit({
          userId: adminUser.userId,
          action: 'admin_reauth_fresh_required',
          req,
          details: `高危操作需要 ${maxAgeMs}ms 内的二次验证`,
          success: false,
        })
        return res.status(403).json({
          success: false,
          code: 'ADMIN_REAUTH_REQUIRED',
          message: '该敏感操作需要重新进行二次身份验证',
        })
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

/**
 * 撤销指定管理员的所有二次验证会话
 */
export function revokeAdminReauthSessions(adminId) {
  // 立即清理本实例内存
  for (const [token, session] of memorySessions) {
    if (session.adminId === adminId) {
      memorySessions.delete(token)
    }
  }

  // 异步清理 Redis
  ;(async () => {
    const tokens = await getSetMembers(adminIndexKey(adminId))
    for (const token of tokens) {
      const data = await getString(sessionKey(token))
      if (data) {
        try {
          const session = JSON.parse(data)
          await removeSession(token, session)
          continue
        } catch {}
      }
      await deleteKey(sessionKey(token))
      await removeSetMember(adminIndexKey(adminId), token)
    }
  })().catch(() => {})
}

/**
 * 撤销与指定会话 ID 绑定的所有二次验证会话
 */
export function revokeAdminReauthBySession(sessionId) {
  if (!sessionId) return

  for (const [token, session] of memorySessions) {
    if (session.sessionId === sessionId) {
      memorySessions.delete(token)
    }
  }

  ;(async () => {
    const tokens = await getSetMembers(sessionIndexKey(sessionId))
    for (const token of tokens) {
      const data = await getString(sessionKey(token))
      if (data) {
        try {
          const session = JSON.parse(data)
          await removeSession(token, session)
          continue
        } catch {}
      }
      await deleteKey(sessionKey(token))
      await removeSetMember(sessionIndexKey(sessionId), token)
    }
  })().catch(() => {})
}
