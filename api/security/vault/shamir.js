// ============================================================
// Shamir Secret Sharing over GF(2^8)
// 将军工级敏感密钥拆分为 n 份，只需 k 份即可还原。
// 使用本原多项式 x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
// ============================================================

const GF_SIZE = 256

// 预计算对数/反对数表
function buildLogTables() {
  const log = new Uint8Array(GF_SIZE)
  const alog = new Uint8Array(GF_SIZE * 2 - 1)
  let x = 1
  for (let i = 0; i < GF_SIZE - 1; i++) {
    alog[i] = x
    log[x] = i
    x <<= 1
    if (x & GF_SIZE) x ^= 0x11d
  }
  alog[GF_SIZE - 1] = 1
  for (let i = 0; i < GF_SIZE - 2; i++) {
    alog[GF_SIZE + i] = alog[i + 1]
  }
  return { log, alog }
}

const { log: GF_LOG, alog: GF_ALOG } = buildLogTables()

function gfAdd(a, b) {
  return a ^ b
}

function gfSub(a, b) {
  return a ^ b
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return GF_ALOG[GF_LOG[a] + GF_LOG[b]]
}

function gfDiv(a, b) {
  if (a === 0) return 0
  if (b === 0) throw new Error('GF 除零错误')
  return GF_ALOG[(GF_LOG[a] - GF_LOG[b] + (GF_SIZE - 1)) % (GF_SIZE - 1)]
}

function gfPow(x, exp) {
  if (x === 0) return 0
  return GF_ALOG[(GF_LOG[x] * exp) % (GF_SIZE - 1)]
}

// 在点 x 处求多项式值，系数按常数项到高次项排列
function evaluatePolynomial(coeffs, x) {
  let result = 0
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coeffs[i])
  }
  return result
}

// 拉格朗日插值，还原常数项（secret）
function interpolateConstant(points) {
  let secret = 0
  for (let i = 0; i < points.length; i++) {
    const [xi, yi] = points[i]
    let numerator = 1
    let denominator = 1
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue
      const xj = points[j][0]
      numerator = gfMul(numerator, xj)
      denominator = gfMul(denominator, gfSub(xi, xj))
    }
    const lagrange = gfDiv(numerator, denominator)
    secret = gfAdd(secret, gfMul(yi, lagrange))
  }
  return secret
}

/**
 * 将 Secret 拆分为 n 份，k 份可还原
 * @param {Buffer} secret - 待拆分秘密
 * @param {number} k - 还原阈值
 * @param {number} n - 总份数
 * @returns {Array<{x: number, value: Buffer}>}
 */
export function splitSecret(secret, k, n) {
  if (k < 2 || k > n || n > 255) {
    throw new Error('Shamir 参数无效：需满足 2 <= k <= n <= 255')
  }
  if (!Buffer.isBuffer(secret) || secret.length === 0) {
    throw new Error('secret 必须为 non-empty Buffer')
  }

  const shares = Array.from({ length: n }, (_, idx) => ({
    x: idx + 1,
    value: Buffer.alloc(secret.length),
  }))

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    // 每字节独立构造一个 k-1 次多项式
    const coeffs = [secret[byteIdx]]
    for (let i = 1; i < k; i++) {
      // 随机系数，不能为 0（否则降次）
      let r
      do {
        r = Math.floor(Math.random() * 255) + 1
      } while (r === 0)
      coeffs.push(r)
    }

    for (let s = 0; s < n; s++) {
      const x = s + 1
      shares[s].value[byteIdx] = evaluatePolynomial(coeffs, x)
    }
  }

  return shares
}

/**
 * 从若干份 share 中还原 secret
 * @param {Array<{x: number, value: Buffer}>} shares
 * @returns {Buffer}
 */
export function combineShares(shares) {
  if (!Array.isArray(shares) || shares.length < 2) {
    throw new Error('还原 Shamir 需要至少 2 份 share')
  }
  const length = shares[0].value.length
  if (!shares.every(s => s.value.length === length)) {
    throw new Error('所有 share 长度必须一致')
  }

  const secret = Buffer.alloc(length)
  for (let byteIdx = 0; byteIdx < length; byteIdx++) {
    const points = shares.map(s => [s.x, s.value[byteIdx]])
    secret[byteIdx] = interpolateConstant(points)
  }
  return secret
}

/**
 * 将 share 编码为可安全存储的字符串（base64url）
 */
export function encodeShare(share) {
  const meta = Buffer.from([share.x])
  return Buffer.concat([meta, share.value]).toString('base64url')
}

/**
 * 从字符串解码 share
 */
export function decodeShare(encoded) {
  const buf = Buffer.from(encoded, 'base64url')
  if (buf.length < 2) throw new Error('share 格式错误')
  return {
    x: buf[0],
    value: buf.slice(1),
  }
}
