// ===== 军工级 mTLS 客户端证书认证中间件 =====
// 解析 TLS 握手后的客户端证书，校验指纹白名单、有效期、Issuer CN，
// 并将脱敏后的证书信息绑定到 req.clientCert。
//
// 挂载示例（在 api/index.js 中）：
//   import { createMtlsMiddleware } from './security/network/index.js'
//   app.use('/admin/api', createMtlsMiddleware({
//     allowedFingerprints: ['aa:bb:cc:...', '112233...'],
//     allowedIssuerCN: 'LinguaLeap-Device-CA',
//     requireAuthorized: true,
//   }))

import { logAudit, getClientIP } from '../core/auditLogger.js'

function normalizeFingerprint(fp) {
  if (!fp) return ''
  return String(fp).replace(/[^0-9a-fA-F]/g, '').toLowerCase()
}

function maskFingerprint(fp) {
  if (!fp || fp.length < 8) return '***'
  return fp.slice(0, 4) + '...' + fp.slice(-4)
}

function parseCertDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? null : d
}

function isCertificateExpired(cert) {
  const now = new Date()
  const notBefore = parseCertDate(cert.valid_from)
  const notAfter = parseCertDate(cert.valid_to)
  if (!notBefore || !notAfter) return '证书日期无法解析'
  if (now < notBefore) return `证书尚未生效 (valid_from=${cert.valid_from})`
  if (now > notAfter) return `证书已过期 (valid_to=${cert.valid_to})`
  return null
}

/**
 * 创建 mTLS 认证 Express 中间件。
 *
 * @param {object} options
 * @param {string[]} [options.allowedFingerprints] - 允许的客户端证书指纹列表（支持 SHA-256 colon/space 格式或纯 hex）
 * @param {string|string[]} [options.allowedIssuerCN] - 允许的 Issuer CN
 * @param {boolean} [options.requireAuthorized=true] - 是否要求 Node TLS 已完成证书链校验
 * @param {'sha256'|'sha1'} [options.fingerprintAlgorithm='sha256'] - 优先使用哪种指纹
 * @param {number} [options.errorStatus=401] - 失败时返回的 HTTP 状态码
 * @param {Function} [options.onFail] - 自定义失败处理 (req, res, reason) => void
 * @returns {Function} Express middleware (req, res, next)
 */
export function createMtlsMiddleware(options = {}) {
  const {
    allowedFingerprints = [],
    allowedIssuerCN,
    requireAuthorized = true,
    fingerprintAlgorithm = 'sha256',
    errorStatus = 401,
    onFail,
  } = options

  const allowedFpSet = new Set(allowedFingerprints.map(normalizeFingerprint).filter(Boolean))
  const allowedIssuerSet = allowedIssuerCN
    ? new Set(
        Array.isArray(allowedIssuerCN)
          ? allowedIssuerCN.filter(Boolean)
          : [String(allowedIssuerCN)]
      )
    : null

  return function mtlsMiddleware(req, res, next) {
    const socket = req.socket || req.connection

    function reject(reason, code = 'MTLS_REJECTED') {
      logAudit({
        action: 'mtls.reject',
        ip: getClientIP(req),
        req,
        details: { reason, code },
        success: false,
      })

      if (typeof onFail === 'function') {
        return onFail(req, res, reason)
      }

      return res.status(errorStatus).json({
        error: 'Client certificate authentication failed',
        code,
        reason: process.env.NODE_ENV === 'production' ? undefined : reason,
      })
    }

    if (!socket) {
      return reject('无法获取底层 socket', 'MTLS_NO_SOCKET')
    }

    if (!socket.encrypted) {
      return reject('请求未通过 TLS 加密传输', 'MTLS_NOT_TLS')
    }

    if (typeof socket.getPeerCertificate !== 'function') {
      return reject('当前 socket 不支持客户端证书读取', 'MTLS_UNSUPPORTED')
    }

    const cert = socket.getPeerCertificate(true)
    if (!cert || Object.keys(cert).length === 0) {
      return reject('客户端未提供证书', 'MTLS_NO_CERT')
    }

    const fingerprint256 = normalizeFingerprint(cert.fingerprint256)
    const fingerprint = normalizeFingerprint(cert.fingerprint)
    const chosenFingerprint = fingerprintAlgorithm === 'sha1' ? fingerprint : fingerprint256

    if (!chosenFingerprint) {
      return reject('客户端证书缺少指纹信息', 'MTLS_NO_FINGERPRINT')
    }

    const expiryError = isCertificateExpired(cert)
    if (expiryError) {
      return reject(expiryError, 'MTLS_CERT_EXPIRED')
    }

    const issuerCN = cert.issuer?.CN || cert.issuer?.O || ''
    if (allowedIssuerSet && !allowedIssuerSet.has(issuerCN)) {
      return reject(
        `Issuer CN 不匹配: got="${issuerCN}"`,
        'MTLS_ISSER_NOT_ALLOWED'
      )
    }

    if (allowedFpSet.size > 0 && !allowedFpSet.has(chosenFingerprint)) {
      return reject(
        `客户端证书指纹不在白名单: ${maskFingerprint(chosenFingerprint)}`,
        'MTLS_FINGERPRINT_NOT_ALLOWED'
      )
    }

    if (requireAuthorized && !socket.authorized) {
      return reject(
        `证书链校验失败: ${socket.authorizationError || 'unknown'}`,
        'MTLS_UNAUTHORIZED'
      )
    }

    req.clientCert = Object.freeze({
      fingerprint: chosenFingerprint,
      fingerprint256,
      fingerprintSha1: fingerprint,
      subject: cert.subject || {},
      issuer: cert.issuer || {},
      serialNumber: cert.serialNumber || '',
      validFrom: cert.valid_from,
      validTo: cert.valid_to,
      authorized: !!socket.authorized,
      authorizationError: socket.authorizationError || null,
      pemEncoded: cert.pemEncoded || null,
    })

    logAudit({
      action: 'mtls.accept',
      ip: getClientIP(req),
      req,
      details: {
        subjectCN: req.clientCert.subject.CN,
        issuerCN: req.clientCert.issuer.CN,
        fingerprint: maskFingerprint(chosenFingerprint),
      },
      success: true,
    })

    next()
  }
}

/**
 * 从 Express 请求中安全提取客户端证书对象（未安装中间件时返回 null）。
 *
 * @param {import('express').Request} req
 * @returns {object|null}
 */
export function getClientCert(req) {
  return req?.clientCert || null
}
