// ===== 军工级请求签名校验模块 =====
// 对写请求（POST/PUT/DELETE/PATCH）做 HMAC-SHA256 签名校验，防止 API 被直接抓包伪造调用。
// 签名串：`METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY`
// 前端（src/utils/api.ts）使用 Web Crypto 以同一密钥签名，后端用 Node crypto 复算比对。
// 采用渐进式上线：带上 X-Signature 的请求严格校验；缺失签名的旧客户端仍放行并告警，
// 待全部客户端升级后可把 STRICT 置为 true 强制校验。

import crypto from 'crypto'

// 与前端 src/utils/api.ts 中 SIGNING_SECRET 保持一致；生产可在环境变量覆盖，
// 覆盖后必须同步更新前端，否则校验必失败。
const SIGNING_SECRET = process.env.REQUEST_SIGNATURE_SECRET || 'll_hmac_v1_9f3c2b7a1e8d4f6a0c5b9e2d7a3f1c8b'

// 时间戳允许窗口（毫秒），与 requestReplay 保持一致
const TIME_WINDOW_MS = 300 * 1000

// 待签名校验的写方法
const WRITE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH']

// 渐进式强制开关：true 时缺少签名直接拒绝（需全部客户端升级后开启）
const STRICT = process.env.REQUEST_SIGNATURE_STRICT === 'true'

/**
 * 计算期望签名（用于校验）。
 * @param {string} method
 * @param {string} path    - 含 /api 前缀的完整路径，如 /api/login
 * @param {number|string} timestamp
 * @param {string} nonce
 * @param {string} body    - 请求体字符串（GET 为空串）
 */
function computeSignature(method, path, timestamp, nonce, body) {
  const data = `${method}\n${path}\n${timestamp}\n${nonce}\n${body || ''}`
  return crypto.createHmac('sha256', SIGNING_SECRET).update(data).digest('hex')
}

/**
 * 校验单个请求的签名。
 * @param {object} params
 * @param {string} params.method
 * @param {string} params.path
 * @param {number|string} params.timestamp
 * @param {string} params.nonce
 * @param {string} [params.body]
 * @param {string} [params.signature]
 * @returns {{valid: boolean, reason?: string}}
 */
export function verifySignature({ method, path, timestamp, nonce, body = '', signature }) {
  if (!signature || typeof signature !== 'string') {
    return { valid: false, reason: '缺少签名' }
  }
  if (!timestamp) {
    return { valid: false, reason: '缺少时间戳' }
  }
  if (!nonce || typeof nonce !== 'string') {
    return { valid: false, reason: '缺少 nonce' }
  }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: '时间戳无效' }
  }
  if (Math.abs(Date.now() - ts) > TIME_WINDOW_MS) {
    return { valid: false, reason: '时间戳超出允许窗口' }
  }

  const expected = computeSignature(method, path, ts, nonce, body)
  // 常量时间比较，避免时序侧信道
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: '签名不匹配' }
  }
  return { valid: true }
}

/**
 * Express 中间件：对写请求做签名校验。
 * 需在 nonce 去重（requestReplay）之前挂载；签名校验通过后再由 nonce 防重放。
 */
export function signatureMiddleware(req, res, next) {
  if (!WRITE_METHODS.includes(req.method)) return next()

  // 与重放防护一致的豁免路径：流式/上传/高频采集端点
  if (req.path.startsWith('/api/bug-report/upload')) return next()
  if (req.path.startsWith('/api/ai/chat/stream')) return next()
  if (req.path === '/api/security/behavior' || req.path === '/api/security/environment-check') return next()

  const signature = req.headers['x-signature']
  const timestamp = req.headers['x-signature-timestamp'] || req.headers['x-timestamp']
  const nonce = req.headers['x-signature-nonce'] || req.headers['x-nonce']

  // 渐进式：缺失签名时放行并告警（兼容旧客户端）
  if (!signature) {
    if (STRICT) {
      return res.status(401).json({ success: false, message: '请求未签名', code: 'SIGNATURE_MISSING' })
    }
    console.warn(`[RequestSignature] 缺少签名: ${req.method} ${req.path}`)
    return next()
  }

  // 请求体序列化：与前端签名时使用的 options.body 保持一致。
  // GET 无 body；有 body 时用 JSON.stringify 保证前后端一致。
  let bodyStr = ''
  if (req.body && (typeof req.body === 'object') && Object.keys(req.body).length > 0) {
    bodyStr = JSON.stringify(req.body)
  } else if (typeof req.body === 'string') {
    bodyStr = req.body
  }

  const result = verifySignature({
    method: req.method,
    path: req.path,
    timestamp,
    nonce,
    body: bodyStr,
    signature,
  })

  if (!result.valid) {
    console.warn(`[RequestSignature] ${result.reason}: ${req.method} ${req.path}`)
    return res.status(401).json({ success: false, message: '请求签名校验失败', code: 'SIGNATURE_INVALID' })
  }

  // 签名通过后，把客户端 nonce 同步到下游 requestReplay 中间件读取的字段，
  // 使签名真实性校验与 nonce 唯一性去重（防重放）组合生效。
  if (nonce) req.headers['x-request-nonce'] = nonce
  if (timestamp) req.headers['x-request-timestamp'] = String(timestamp)

  next()
}

/**
 * 供仪表盘/测试读取配置状态。
 */
export function getSignatureStatus() {
  return {
    enabled: true,
    strict: STRICT,
    timeWindowMs: TIME_WINDOW_MS,
    secretConfigured: !!process.env.REQUEST_SIGNATURE_SECRET,
  }
}