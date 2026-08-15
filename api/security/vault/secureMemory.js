// ============================================================
// Secure Memory — 军工级密钥内存保护
// 目标：减少密钥在内存中的暴露时间与可dump风险
// 限制：Node.js/V8 不保证 GC 后物理清零，本模块提供最佳努力保护
// ============================================================

import crypto from 'crypto'

const ACTIVE_SECRETS = new WeakSet()

/**
 * 安全Buffer：创建后尽量缩短生命周期，提供显式清零
 */
export class SecureBuffer {
  constructor(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('SecureBuffer 需要 Buffer')
    }
    this._buf = buffer
    this._zeroed = false
    ACTIVE_SECRETS.add(this)
  }

  static random(length) {
    return new SecureBuffer(crypto.randomBytes(length))
  }

  static fromString(str, encoding = 'utf-8') {
    return new SecureBuffer(Buffer.from(str, encoding))
  }

  get buffer() {
    if (this._zeroed) throw new Error('SecureBuffer 已清零，不可再访问')
    return this._buf
  }

  get length() {
    return this._zeroed ? 0 : this._buf.length
  }

  toString(encoding = 'utf-8') {
    if (this._zeroed) return ''
    return this._buf.toString(encoding)
  }

  /**
   * 用随机数据覆盖后释放引用，触发 GC
   */
  zeroize() {
    if (this._zeroed || !this._buf) return
    this._buf.fill(crypto.randomBytes(this._buf.length))
    this._buf.fill(0)
    this._buf = null
    this._zeroed = true
  }

  /**
   * 派生临时子密钥（HKDF-SHA256），父密钥保持安全
   */
  derive(context, length = 32) {
    if (this._zeroed) throw new Error('SecureBuffer 已清零')
    const derived = crypto.hkdfSync('sha256', this._buf, Buffer.alloc(0), Buffer.from(context), length)
    return new SecureBuffer(Buffer.from(derived))
  }
}

/**
 * 一次性读取 SecureBuffer，读取后自动清零
 */
export function withSecureBuffer(secureBuf, fn) {
  if (!(secureBuf instanceof SecureBuffer)) {
    throw new TypeError('withSecureBuffer 需要 SecureBuffer')
  }
  try {
    return fn(secureBuf.buffer)
  } finally {
    secureBuf.zeroize()
  }
}

/**
 * 对普通字符串/Buffer 进行一次性派生并清零
 */
export function ephemeralDerive(secret, context, length = 32) {
  const sb = typeof secret === 'string' ? SecureBuffer.fromString(secret) : new SecureBuffer(Buffer.from(secret))
  return withSecureBuffer(sb, (buf) => Buffer.from(crypto.hkdfSync('sha256', buf, Buffer.alloc(0), Buffer.from(context), length)))
}

/**
 * 覆盖并释放 Buffer（向后兼容）
 */
export function secureZero(value) {
  if (Buffer.isBuffer(value)) {
    value.fill(0)
  } else if (typeof value === 'string') {
    try {
      const buf = Buffer.from(value, 'utf-8')
      buf.fill(0)
    } catch {}
  }
}
