// ===== 军工级 TLS 传输安全配置 =====
// 提供 TLS 1.2/1.3 服务端模板与 cipher 套件白名单检查，拒绝一切弱协议与弱套件。
//
// 挂载示例（在 api/index.js 中）：
//   import https from 'https'
//   import { SECURE_TLS_OPTIONS, checkMinimumCipherSuites } from './security/network/index.js'
//   const server = https.createServer({
//     key: fs.readFileSync('server.key'),
//     cert: fs.readFileSync('server.crt'),
//     ...SECURE_TLS_OPTIONS,
//     requestCert: true,
//     rejectUnauthorized: false, // 由 mtlsMiddleware.js 做细粒度校验
//   }, app)

import crypto from 'crypto'

/**
 * TLS 1.3 强制 AEAD 套件（Node.js 默认即使用，显式列出便于审计）。
 */
export const TLS_1_3_CIPHERS = [
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_AES_128_GCM_SHA256',
]

/**
 * TLS 1.2 仅启用前向安全、AEAD/GCM、ECDHE/DHE 密钥交换套件。
 * 明确排除 CBC、RC4、DES/3DES、MD5、SHA1、EXPORT、aNULL 等弱套件。
 */
export const TLS_1_2_CIPHERS = [
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'DHE-RSA-AES256-GCM-SHA384',
  'DHE-RSA-AES128-GCM-SHA256',
]

/**
 * 受信 ECDH 曲线，按性能与安全性排序。
 */
export const SECURE_ECDH_CURVES = 'X25519:P-256:P-384:P-521'

/**
 * 同时支持 TLS 1.2/1.3 的安全服务端配置模板。
 * 适用于大多数业务入口；如需强制 TLS 1.3 请使用 TLS_1_3_ONLY_OPTIONS。
 */
export const SECURE_TLS_OPTIONS = Object.freeze({
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  ciphers: TLS_1_2_CIPHERS.join(':'),
  honorCipherOrder: true,
  ecdhCurve: SECURE_ECDH_CURVES,
})

/**
 * 强制 TLS 1.3 的配置模板，用于最高安全等级接口。
 */
export const TLS_1_3_ONLY_OPTIONS = Object.freeze({
  minVersion: 'TLSv1.3',
  maxVersion: 'TLSv1.3',
  honorCipherOrder: true,
  ecdhCurve: SECURE_ECDH_CURVES,
})

const WEAK_PROTOCOLS = new Set([
  'SSLv2',
  'SSLv3',
  'TLSv1',
  'TLSv1.1',
])

const PROTOCOL_ORDER = {
  SSLv2: 0,
  SSLv3: 1,
  TLSv1: 2,
  'TLSv1.1': 3,
  'TLSv1.2': 4,
  'TLSv1.3': 5,
}

const WEAK_CIPHER_PATTERNS = [
  /\bRC4\b/i,
  /\bDES\b/i,
  /\b3DES\b/i,
  /\bMD5\b/i,
  /\bSHA1\b/i,
  /\bNULL\b/i,
  /\bEXPORT\b/i,
  /\bANON\b/i,
  /\bIDEA\b/i,
  /\bSEED\b/i,
  /\bCAMELLIA\b/i,
  /_CBC_\b/i,
  /\bCBC\b/i,
]

function normalizeProtocol(version) {
  if (!version) return null
  const v = String(version).trim()
  if (v === 'TLSv1') return 'TLSv1'
  return v
}

function protocolRank(version) {
  return PROTOCOL_ORDER[normalizeProtocol(version)] ?? -1
}

/**
 * 校验服务端 TLS 协议版本范围。
 * 拒绝 SSLv2/SSLv3/TLSv1/TLSv1.1，且 minVersion 不得低于 TLSv1.2。
 *
 * @param {object} options
 * @param {string} [options.minVersion]
 * @param {string} [options.maxVersion]
 * @returns {{ok: boolean, reason?: string}}
 */
export function checkSecureProtocolRange({ minVersion, maxVersion } = {}) {
  if (minVersion && WEAK_PROTOCOLS.has(normalizeProtocol(minVersion))) {
    return { ok: false, reason: `最低协议 ${minVersion} 属于弱协议，必须 >= TLSv1.2` }
  }
  if (maxVersion && WEAK_PROTOCOLS.has(normalizeProtocol(maxVersion))) {
    return { ok: false, reason: `最高协议 ${maxVersion} 属于弱协议，必须 >= TLSv1.2` }
  }
  if (minVersion && maxVersion && protocolRank(minVersion) > protocolRank(maxVersion)) {
    return { ok: false, reason: `minVersion(${minVersion}) 不得高于 maxVersion(${maxVersion})` }
  }
  if (minVersion && protocolRank(minVersion) < protocolRank('TLSv1.2')) {
    return { ok: false, reason: `最低协议 ${minVersion} 低于 TLSv1.2` }
  }
  return { ok: true }
}

/**
 * 检查给定的 cipher 套件列表是否满足最低安全基线。
 *
 * @param {string|string[]} suites - 冒号分隔字符串或数组
 * @param {object} [options]
 * @param {string} [options.minVersion='TLSv1.2']
 * @returns {{ok: boolean, allowed: string[], rejected: string[], reason?: string}}
 */
export function checkMinimumCipherSuites(suites, { minVersion = 'TLSv1.2' } = {}) {
  if (!suites) {
    return { ok: false, allowed: [], rejected: [], reason: '未提供 cipher 套件列表' }
  }

  const list = Array.isArray(suites) ? suites : String(suites).split(':').filter(Boolean)
  const allowedSet = new Set(
    minVersion === 'TLSv1.3'
      ? TLS_1_3_CIPHERS
      : [...TLS_1_2_CIPHERS, ...TLS_1_3_CIPHERS]
  )

  const allowed = []
  const rejected = []

  for (const raw of list) {
    const suite = raw.trim()
    if (!suite) continue

    if (WEAK_CIPHER_PATTERNS.some(p => p.test(suite))) {
      rejected.push(suite)
      continue
    }

    if (!allowedSet.has(suite)) {
      rejected.push(suite)
      continue
    }

    allowed.push(suite)
  }

  if (rejected.length > 0) {
    return {
      ok: false,
      allowed,
      rejected,
      reason: `发现 ${rejected.length} 个不安全或未被列入白名单的 cipher 套件`,
    }
  }

  if (allowed.length === 0) {
    return { ok: false, allowed, rejected, reason: '未提供任何有效 cipher 套件' }
  }

  return { ok: true, allowed, rejected }
}

/**
 * 基于安全模板创建最终 TLS 配置对象，并可自动校验 cipher 白名单。
 *
 * @param {object} [overrides] - 覆盖项，如 key/cert/ca
 * @param {'SECURE'|'TLS_1_3_ONLY'} [template='SECURE']
 * @returns {{ok: boolean, options?: object, error?: string}}
 */
export function createSecureTlsOptions(overrides = {}, template = 'SECURE') {
  const base = template === 'TLS_1_3_ONLY' ? TLS_1_3_ONLY_OPTIONS : SECURE_TLS_OPTIONS
  const options = { ...base, ...overrides }

  const protoCheck = checkSecureProtocolRange(options)
  if (!protoCheck.ok) {
    return { ok: false, error: protoCheck.reason }
  }

  if (options.ciphers) {
    const cipherCheck = checkMinimumCipherSuites(options.ciphers, {
      minVersion: options.minVersion || 'TLSv1.2',
    })
    if (!cipherCheck.ok) {
      return { ok: false, error: cipherCheck.reason, rejected: cipherCheck.rejected }
    }
  }

  return { ok: true, options }
}

/**
 * 为 HPKP / 证书固定场景生成 TLS 证书公钥指纹（SPKI hash）。
 * 输入为 PEM 格式证书字符串或 DER Buffer。
 *
 * @param {string|Buffer} cert - PEM 证书或 DER Buffer
 * @param {string} [algorithm='sha256']
 * @returns {string} base64 编码指纹
 */
export function generateCertificateFingerprint(cert, algorithm = 'sha256') {
  let der = cert
  if (typeof cert === 'string' && cert.includes('-----BEGIN CERTIFICATE-----')) {
    const base64 = cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')
    der = Buffer.from(base64, 'base64')
  }
  if (!Buffer.isBuffer(der)) {
    throw new Error('generateCertificateFingerprint 需要 PEM 字符串或 DER Buffer')
  }
  return crypto.createHash(algorithm).update(der).digest('base64')
}
