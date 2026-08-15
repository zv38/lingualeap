// ===== 军工级证书固定（HPKP / TLS 证书指纹固定）=====
// 为出站或入站 TLS 连接提供证书指纹生成、固定 pinset 校验与管理。
//
// 使用示例：
//   import { CertificatePinset, generatePin } from './security/network/index.js'
//   const pinset = new CertificatePinset({
//     pins: ['sha256/AAAAAAAA...=', 'sha256/BBBBBBBB...='],
//     reportOnly: false,
//   })
//   const ok = pinset.verify(serverCertDer)

import crypto from 'crypto'

const PEM_HEADER = '-----BEGIN CERTIFICATE-----'
const PEM_FOOTER = '-----END CERTIFICATE-----'

function isPem(cert) {
  return typeof cert === 'string' && cert.includes(PEM_HEADER)
}

function pemToDer(pem) {
  const base64 = pem
    .replace(new RegExp(PEM_HEADER, 'g'), '')
    .replace(new RegExp(PEM_FOOTER, 'g'), '')
    .replace(/\s+/g, '')
  return Buffer.from(base64, 'base64')
}

function normalizeInput(cert) {
  if (Buffer.isBuffer(cert)) return cert
  if (isPem(cert)) return pemToDer(cert)
  if (typeof cert === 'string') {
    // 允许直接传入 base64 编码的 DER
    return Buffer.from(cert, 'base64')
  }
  throw new Error('证书固定仅支持 PEM 字符串、DER Buffer 或 base64 DER 字符串')
}

/**
 * 生成证书公钥指纹（默认 SHA-256，输出 base64）。
 * 兼容 HPKP 风格前缀 "sha256/xxxx"，输入会自动去掉前缀。
 *
 * @param {string|Buffer} certificate - PEM/DER/base64 证书
 * @param {object} [options]
 * @param {'sha256'|'sha384'|'sha512'} [options.algorithm='sha256']
 * @param {'base64'|'hex'} [options.encoding='base64']
 * @returns {string}
 */
export function generatePin(certificate, { algorithm = 'sha256', encoding = 'base64' } = {}) {
  const der = normalizeInput(certificate)
  return crypto.createHash(algorithm).update(der).digest(encoding)
}

/**
 * 生成 HPKP 风格固定字符串，例如 "sha256/abc123...="。
 *
 * @param {string|Buffer} certificate
 * @param {'sha256'|'sha384'|'sha512'} [algorithm='sha256']
 * @returns {string}
 */
export function generateHpkpPin(certificate, algorithm = 'sha256') {
  return `${algorithm}/${generatePin(certificate, { algorithm, encoding: 'base64' })}`
}

/**
 * 使用不同算法生成一个备用固定 pin，满足 HPKP "至少包含一个 backup pin" 的规范。
 *
 * @param {string|Buffer} certificate
 * @returns {{primary: string, backup: string}}
 */
export function generatePinPair(certificate) {
  return {
    primary: generateHpkpPin(certificate, 'sha256'),
    backup: generateHpkpPin(certificate, 'sha384'),
  }
}

/**
 * 将用户输入的 pin 统一为 "algorithm/base64digest" 格式。
 * 支持 "sha256/xxxxx" 或纯 base64/hex digest。
 *
 * @param {string} rawPin
 * @returns {string}
 */
function normalizeHpkpPin(rawPin) {
  const pin = String(rawPin).trim()
  const match = pin.match(/^(sha256|sha384|sha512)\/(.+)$/i)
  if (match) {
    // 只规范算法前缀为小写，指纹摘要保持原大小写（base64 大小写敏感）
    return `${match[1].toLowerCase()}/${match[2]}`
  }
  // 无显式算法前缀时默认按 sha256/base64 处理
  return `sha256/${pin}`
}

/**
 * 校验证书指纹是否匹配给定的 pinset。
 *
 * @param {string|Buffer} certificate
 * @param {string[]} pins - HPKP 风格或纯 digest 字符串数组
 * @param {object} [options]
 * @param {'sha256'|'sha384'|'sha512'} [options.algorithm='sha256']
 * @returns {{pinned: boolean, matchedPin: string|null, reason?: string}}
 */
export function verifyPin(certificate, pins, { algorithm = 'sha256' } = {}) {
  if (!Array.isArray(pins) || pins.length === 0) {
    return { pinned: false, matchedPin: null, reason: 'pinset 为空' }
  }

  const der = normalizeInput(certificate)
  const digest = generatePin(der, { algorithm, encoding: 'base64' })
  const candidate = `sha256/${digest}`

  for (const raw of pins) {
    const normalized = normalizeHpkpPin(raw)
    if (normalized === candidate) {
      return { pinned: true, matchedPin: normalized }
    }
  }

  return {
    pinned: false,
    matchedPin: null,
    reason: `没有匹配的固定 pin（证书指纹=${candidate}）`,
  }
}

/**
 * 证书固定 pinset 管理器。
 */
export class CertificatePinset {
  /**
   * @param {object} [options]
   * @param {string[]} [options.pins=[]]
   * @param {boolean} [options.reportOnly=false] - report-only 模式：不匹配时仅记录，不抛出
   * @param {Function} [options.onViolation] - (certificate, reason) => void
   */
  constructor(options = {}) {
    const { pins = [], reportOnly = false, onViolation } = options
    this._pins = new Set()
    this.reportOnly = !!reportOnly
    this.onViolation = typeof onViolation === 'function' ? onViolation : null
    this.add(pins)
  }

  /**
   * 添加一个或多个 pin。
   * @param {string|string[]} pins
   */
  add(pins) {
    const list = Array.isArray(pins) ? pins : [pins]
    for (const p of list) {
      const normalized = normalizeHpkpPin(p)
      if (normalized.split('/')[1]) {
        this._pins.add(normalized)
      }
    }
    return this
  }

  /**
   * 移除一个或多个 pin。
   * @param {string|string[]} pins
   */
  remove(pins) {
    const list = Array.isArray(pins) ? pins : [pins]
    for (const p of list) {
      this._pins.delete(normalizeHpkpPin(p))
    }
    return this
  }

  /**
   * 清空并重新设置 pinset。
   * @param {string[]} pins
   */
  set(pins) {
    this._pins.clear()
    this.add(pins)
    return this
  }

  /** 当前所有固定 pin */
  get pins() {
    return Array.from(this._pins)
  }

  /** pinset 是否包含某个 pin */
  has(pin) {
    return this._pins.has(normalizeHpkpPin(pin))
  }

  /**
   * 校验证书是否命中 pinset。
   * reportOnly=false 时，未命中会抛出安全异常。
   *
   * @param {string|Buffer} certificate
   * @param {'sha256'|'sha384'|'sha512'} [algorithm='sha256']
   * @returns {{pinned: boolean, matchedPin: string|null, reportOnly: boolean, reason?: string}}
   */
  verify(certificate, algorithm = 'sha256') {
    const result = verifyPin(certificate, this.pins, { algorithm })

    if (!result.pinned) {
      const reason = result.reason || '证书固定校验失败'
      if (this.onViolation) {
        try {
          this.onViolation(certificate, reason)
        } catch {}
      }
      if (!this.reportOnly) {
        const err = new Error(`Certificate pinning violation: ${reason}`)
        err.code = 'CERT_PINNING_VIOLATION'
        err.pinned = false
        throw err
      }
    }

    return { ...result, reportOnly: this.reportOnly }
  }

  /**
   * 检查当前 pinset 是否包含至少一个主 pin 和一个 backup pin。
   * HPKP 最佳实践要求：主 pin 之外必须配置 backup pin，避免证书轮换时服务不可用。
   */
  hasBackupPin() {
    const algorithms = new Set()
    for (const pin of this._pins) {
      algorithms.add(pin.split('/')[0])
    }
    return algorithms.size >= 2
  }
}
