// ============================================================
// mTLS Client Certificate Auth — 管理员证书登录/认证模块
// 设计目标：
//   - 管理员登录时可要求提供客户端 TLS 证书作为强身份因子
//   - 证书指纹白名单加密持久化，防止本地文件泄露后直接可用
//   - 与现有会话体系、审计日志集成
// ============================================================

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { readEncryptedFile, writeEncryptedFile } from '../privacy/fileVault.js'
import { logAudit, getClientIP } from '../core/auditLogger.js'

// 生产环境默认强制启用 mTLS；开发环境可通过 ADMIN_MTLS_ENABLED=false 关闭。
const MTLS_ENABLED = process.env.NODE_ENV === 'production'
  ? process.env.ADMIN_MTLS_ENABLED !== 'false'
  : process.env.ADMIN_MTLS_ENABLED === 'true'
const MTLS_FILE = process.env.ADMIN_MTLS_FILE || 'data/admin-mtls-certificates.json'
// 生产环境默认强制要求管理员客户端证书；开发环境默认不强制，除非显式开启
const MTLS_REQUIRED_FOR_ADMIN = process.env.NODE_ENV === 'production'
  ? process.env.ADMIN_MTLS_REQUIRED !== 'false'
  : process.env.ADMIN_MTLS_REQUIRED === 'true'

// 内存缓存
let certCache = null
let certLoaded = false

async function loadCertificates() {
  if (certLoaded) return certCache || new Map()
  try {
    const raw = await readEncryptedFile(MTLS_FILE, { context: 'admin-mtls-certificates' })
    if (raw) {
      const parsed = JSON.parse(raw)
      certCache = new Map(Object.entries(parsed))
    }
  } catch (err) {
    console.warn('[mTLS] 加载证书白名单失败:', err.message)
  }
  if (!certCache) certCache = new Map()
  certLoaded = true
  return certCache
}

async function saveCertificates() {
  const map = await loadCertificates()
  await writeEncryptedFile(MTLS_FILE, JSON.stringify(Object.fromEntries(map)), { context: 'admin-mtls-certificates' })
}

function fingerprintFromCert(cert) {
  if (!cert || !cert.raw) return null
  return crypto.createHash('sha256').update(cert.raw).digest('hex')
}

function isExpired(cert) {
  if (!cert?.valid_from || !cert?.valid_to) return true
  const now = new Date()
  return now < new Date(cert.valid_from) || now > new Date(cert.valid_to)
}

/**
 * 验证客户端证书是否匹配某个管理员的允许列表
 * @param {string} userId
 * @param {object} cert req.socket.getPeerCertificate() 返回的证书对象
 * @returns {Promise<{valid: boolean, reason?: string, fingerprint?: string}>}
 */
export async function verifyAdminClientCertificate(userId, cert) {
  if (!cert || !cert.fingerprint256) {
    return { valid: false, reason: '未提供客户端证书' }
  }

  const map = await loadCertificates()
  const entries = map.get(userId) || []
  const fp = fingerprintFromCert(cert) || cert.fingerprint256.replace(/:/g, '').toLowerCase()

  const entry = entries.find(e => e.fingerprint.toLowerCase() === fp.toLowerCase())
  if (!entry) {
    logAudit({ userId, action: 'mtls_cert_rejected', ip: getClientIP({ socket: { remoteAddress: null } }), details: `未知证书指纹 ${fp}`, success: false })
    return { valid: false, reason: '证书未在白名单中', fingerprint: fp }
  }

  if (entry.revoked) {
    return { valid: false, reason: '证书已被吊销', fingerprint: fp }
  }

  if (isExpired(cert)) {
    return { valid: false, reason: '证书已过期', fingerprint: fp }
  }

  if (entry.validFrom && new Date() < new Date(entry.validFrom)) {
    return { valid: false, reason: '证书尚未生效', fingerprint: fp }
  }
  if (entry.validTo && new Date() > new Date(entry.validTo)) {
    return { valid: false, reason: '证书已超过白名单有效期', fingerprint: fp }
  }

  return { valid: true, fingerprint: fp, entry }
}

/**
 * Express 中间件：要求管理员接口必须提供有效 mTLS 证书
 * 用法：app.use('/api/admin', mtlsAdminAuthMiddleware)
 */
export function requireAdminClientCertificate() {
  return async (req, res, next) => {
    if (!MTLS_ENABLED) return next()

    const cert = req.socket?.getPeerCertificate?.()
    const userId = req.tokenPayload?.userId

    if (!cert || !cert.fingerprint256) {
      logAudit({ userId: userId || 'anon', action: 'mtls_required_missing', ip: getClientIP(req), details: '缺少客户端证书', success: false })
      return res.status(401).json({ success: false, code: 'MTLS_CERT_REQUIRED', message: '需要提供管理员客户端证书' })
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const result = await verifyAdminClientCertificate(userId, cert)
    if (!result.valid) {
      logAudit({ userId, action: 'mtls_cert_invalid', ip: getClientIP(req), details: result.reason, success: false })
      return res.status(403).json({ success: false, code: 'MTLS_CERT_INVALID', message: result.reason })
    }

    req.clientCert = { fingerprint: result.fingerprint, subject: cert.subject }
    next()
  }
}

/**
 * 检查管理员是否配置了 mTLS 证书
 */
export async function hasAdminClientCertificate(userId) {
  const map = await loadCertificates()
  const entries = map.get(userId) || []
  return entries.some(e => !e.revoked)
}

/**
 * 注册管理员证书（需先通过强身份验证）
 */
export async function registerAdminClientCertificate(userId, cert, meta = {}) {
  const fp = fingerprintFromCert(cert)
  if (!fp) throw new Error('无法提取证书指纹')

  const map = await loadCertificates()
  const entries = map.get(userId) || []
  if (entries.some(e => e.fingerprint.toLowerCase() === fp.toLowerCase())) {
    throw Object.assign(new Error('该证书已注册'), { code: 'MTLS_CERT_EXISTS' })
  }

  entries.push({
    fingerprint: fp,
    subject: cert.subject,
    issuer: cert.issuer,
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    name: meta.name || '管理员证书',
    createdAt: new Date().toISOString(),
    revoked: false,
  })
  map.set(userId, entries)
  await saveCertificates()

  logAudit({ userId, action: 'mtls_cert_registered', ip: getClientIP(meta.req), details: `注册证书 ${fp}`, success: true })
  return { fingerprint: fp }
}

/**
 * 吊销管理员证书
 */
export async function revokeAdminClientCertificate(userId, fingerprint) {
  const map = await loadCertificates()
  const entries = map.get(userId) || []
  const entry = entries.find(e => e.fingerprint.toLowerCase() === fingerprint.toLowerCase())
  if (!entry) return false
  entry.revoked = true
  entry.revokedAt = new Date().toISOString()
  await saveCertificates()
  logAudit({ userId, action: 'mtls_cert_revoked', ip: 'system', details: `吊销证书 ${fingerprint}`, success: true })
  return true
}

/**
 * 获取管理员证书列表（用于后台管理）
 */
export async function getAdminClientCertificates(userId) {
  const map = await loadCertificates()
  const entries = map.get(userId) || []
  return entries.map(e => ({
    fingerprint: e.fingerprint,
    name: e.name,
    subject: e.subject,
    issuer: e.issuer,
    validFrom: e.validFrom,
    validTo: e.validTo,
    createdAt: e.createdAt,
    revoked: !!e.revoked,
  }))
}

/**
 * 读取 PEM 文件并计算指纹（管理员上传证书时使用）
 */
export async function fingerprintFromPemFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8')
  const base64 = content.replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '')
  const raw = Buffer.from(base64, 'base64')
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function isMtlsEnabled() {
  return MTLS_ENABLED
}

export function isMtlsRequiredForAdmin() {
  return MTLS_REQUIRED_FOR_ADMIN
}
