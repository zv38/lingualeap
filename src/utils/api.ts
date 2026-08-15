import {
  setCachedToken as persistAccessToken,
  getCachedToken as readStoredAccessToken,
} from './authCache'
import { getAdminReauthToken, isAdminPath } from './adminReauthCache'

export const API_BASE = '/api'

// 请求签名密钥：与后端 api/security/defense/requestSignature.js 的默认值一致。
// 生产可通过环境变量 REQUEST_SIGNATURE_SECRET 覆盖，覆盖后必须同步更新前端。
// 该密钥在构建时随业务源码被混淆，用于提高抓包伪造/重放的真实成本。
const SIGNING_SECRET = 'll_hmac_v1_9f3c2b7a1e8d4f6a0c5b9e2d7a3f1c8b'

function randomHex(len: number): string {
  const bytes = new Uint8Array(len)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  let out = ''
  for (let i = 0; i < len; i++) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  }
  return out
}

// 对写请求计算 HMAC-SHA256 签名，签名串与后端完全一致：METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
async function signRequest(
  method: string,
  path: string,
  body?: string,
): Promise<{ timestamp: string; nonce: string; signature: string }> {
  const timestamp = String(Date.now())
  const nonce = randomHex(16)
  const data = `${method}\n${API_BASE}${path}\n${timestamp}\n${nonce}\n${body || ''}`
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SIGNING_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data))
    const signature = Array.from(new Uint8Array(sigBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return { timestamp, nonce, signature }
  } catch {
    // Web Crypto 不可用（如非安全上下文）时降级：不签名，由后端渐进式放行
    return { timestamp, nonce, signature: '' }
  }
}

/**
 * 服务端错误信息脱敏：对认证、管理员等高敏感接口统一响应文案，
 * 防止攻击者通过错误信息差异进行用户名枚举或系统分析。
 */
function sanitizeApiError(path: string, status: number, message: string): string {
  const normalizedPath = path.split('?')[0].toLowerCase()
  const isAuthEndpoint =
    normalizedPath === '/login' ||
    normalizedPath === '/register' ||
    normalizedPath === '/forgot-password' ||
    normalizedPath === '/refresh-token' ||
    normalizedPath.startsWith('/admin/login') ||
    normalizedPath.startsWith('/admin/2fa') ||
    normalizedPath.startsWith('/auth/') ||
    normalizedPath.startsWith('/webauthn/')

  if (isAuthEndpoint && (status === 400 || status === 401 || status === 403 || status === 404)) {
    return '账号或密码错误，请重试'
  }

  if (status >= 500) {
    return '服务繁忙，请稍后重试'
  }

  // 其他接口保留服务端 message，但截断长度避免泄露长文本
  return message ? message.slice(0, 200) : `请求失败，请稍后重试 (${status})`
}

let cachedToken: string | null = null
let csrfToken: string | null = null
let isRefreshing = false
let refreshQueue: Array<() => void> = []

interface PendingAdminRequest {
  path: string
  options: RequestInit
  resolve: (value: any) => void
}
let pendingAdminRequest: PendingAdminRequest | null = null

function setPendingAdminRequest(path: string, options: RequestInit, resolve: (value: any) => void) {
  pendingAdminRequest = { path, options, resolve }
}

function clearPendingAdminRequest() {
  pendingAdminRequest = null
}

export function retryPendingAdminRequest() {
  if (!pendingAdminRequest) return Promise.resolve({ success: false, data: null, message: '没有待重试的请求' })
  const { path, options, resolve } = pendingAdminRequest
  clearPendingAdminRequest()
  const promise = request(path, options, 1)
  promise.then(resolve)
  return promise
}

export function setCachedToken(token: string | null) {
  cachedToken = token
  persistAccessToken(token)
}

export function getCachedToken(): string | null {
  if (cachedToken) return cachedToken
  return readStoredAccessToken()
}

export function getAuthHeaders(): Record<string, string> {
  // 安全规范：Access Token 已迁移到 HttpOnly Cookie，认证请求会自动携带 cookie。
  // 这里不再手动设置 Authorization 头，避免前端需要读取 token 带来的 XSS 风险。
  return {}
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken

    // 安全规范：Refresh Token 由后端 HttpOnly Cookie 管理，请求体中不再携带。
    // 后端刷新成功后会通过 Set-Cookie 下发新的 access_token 与 refresh_token。
    const response = await fetch(`${API_BASE}/refresh-token`, {
      method: 'POST',
      headers,
      credentials: 'include',
    })

    return response.ok
  } catch {
    return false
  }
}

export async function getCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken
  try {
    const response = await fetch(`${API_BASE}/csrf-token`, { credentials: 'include' })
    const data = await response.json()
    if (data.success) {
      csrfToken = data.data.csrfToken
      return csrfToken
    }
    return null
  } catch {
    return null
  }
}

interface ApiResponse {
  success: boolean
  data: any
  message: string
}

export async function request(path: string, options: RequestInit = {}, retries = 2): Promise<ApiResponse> {
  const method = (options.method || 'GET').toUpperCase()
  // CSRF Token 改为一次性消费：每次非 GET 请求前都确保拿到最新 Token
  if (method !== 'GET') {
    await getCsrfToken().catch(() => {})
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  // 安全规范：Access Token 已迁移到 HttpOnly Cookie，请求会自动携带 cookie，
  // 不再从 localStorage 读取并设置 Authorization 头。

  if (method !== 'GET' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  // 管理员敏感操作自动附加二次验证令牌
  if (isAdminPath(path)) {
    const adminReauthToken = getAdminReauthToken()
    if (adminReauthToken) {
      headers['X-Admin-Reauth-Token'] = adminReauthToken
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 每次尝试重新签名（新 nonce），避免重试与后端 nonce 去重冲突
      const finalHeaders: Record<string, string> = { ...headers }
      if (method !== 'GET') {
        const sig = await signRequest(method, path, typeof options.body === 'string' ? options.body : undefined)
        if (sig.signature) {
          finalHeaders['X-Signature'] = sig.signature
          finalHeaders['X-Signature-Timestamp'] = sig.timestamp
          finalHeaders['X-Signature-Nonce'] = sig.nonce
        }
      }
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: finalHeaders,
        credentials: 'include',
      })

      // CSRF Token 一次性消费：请求发出后立即清除，下次非 GET 请求会重新获取
      if (method !== 'GET') {
        csrfToken = null
      }

      if (response.status === 401 && path !== '/login' && path !== '/register' && path !== '/me' && path !== '/refresh-token') {
        if (!isRefreshing) {
          isRefreshing = true
          const refreshed = await refreshAccessToken()
          isRefreshing = false
          refreshQueue.forEach(resolve => resolve())
          refreshQueue = []

          if (refreshed) {
            // Cookie 已由后端刷新，继续重试即可，无需手动设置 Authorization 头
            continue
          }
        } else {
          await new Promise<void>(resolve => refreshQueue.push(resolve))
          // Cookie 刷新后由请求自动携带
          continue
        }

        cachedToken = null
        persistAccessToken(null)
        try {
          window.dispatchEvent(new CustomEvent('auth-expired', { detail: { path } }))
        } catch {}
        return { success: false, data: null, message: '登录已过期，请重新登录' }
      }

      if (response.status >= 500 && attempt < retries) {
        await delay((attempt + 1) * 1000)
        continue
      }

      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      const message = data && typeof data.message === 'string' ? data.message : ''

      // CSRF Token 被消费后重放或并发冲突，自动重试一次
      if (response.status === 403 && data?.code === 'CSRF_BLOCKED' && attempt < retries) {
        csrfToken = null
        continue
      }

      // 隔离状态检测：后端进入半隔离/完全隔离时触发全局事件
      if (response.status === 503 && data?.code === 'ISOLATION_BLOCKED') {
        try {
          window.dispatchEvent(new CustomEvent('system-isolation', {
            detail: { level: data.isolation?.level, reason: data.isolation?.reason, message },
          }))
        } catch {}
      }

      // 管理员敏感操作需要二次验证：挂起当前请求并触发全局弹窗
      if (response.status === 403 && data?.code === 'ADMIN_REAUTH_REQUIRED') {
        try {
          window.dispatchEvent(new CustomEvent('admin-reauth-required', {
            detail: { path, method, message: data.message || message },
          }))
        } catch {}
        return new Promise(resolve => {
          setPendingAdminRequest(path, options, resolve)
        })
      }

      if (!response.ok) {
        return {
          success: false,
          data: null,
          message: sanitizeApiError(path, response.status, message),
        }
      }

      if (data?.csrfToken) {
        csrfToken = data.csrfToken
      }

      return { success: true, data: data || {}, message }
    } catch (error) {
      // 请求被取消时不再重试，立即抛出让调用方处理
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      if (attempt < retries) {
        await delay((attempt + 1) * 800)
        continue
      }
      return {
        success: false,
        data: null,
        message: '网络请求失败，请检查网络连接',
      }
    }
  }

  return { success: false, data: null, message: '请求超时' }
}

export function get(path: string) {
  return request(path)
}

export function post(path: string, body?: Record<string, unknown>) {
  return request(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function put(path: string, body?: Record<string, unknown>) {
  return request(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function patch(path: string, body?: Record<string, unknown>) {
  return request(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function del(path: string) {
  return request(path, { method: 'DELETE' })
}

export interface HumanSignals {
  timeOnPage: number
  mouseMoveCount: number
  keyPressCount: number
  scrollCount: number
  screenWidth: number
  screenHeight: number
  timezone: string
}

export interface BehaviorSignals {
  timeOnForm: number
  mouseMoveCount: number
  keyPressCount: number
  copyPasteCount: number
  noMouseMovements: boolean
  noKeyboardEvents: boolean
  devtoolsOpen: boolean
  screenWidth: number
  screenHeight: number
  timezone: string
}

export const authApi = {
  login(email: string, password: string, captcha: { token: string; code: string }, humanToken: string, humanSignals: HumanSignals, turnstileToken: string) {
    return post('/login', { email, password, imageCaptchaToken: captcha.token, imageCaptchaCode: captcha.code, humanToken, humanSignals, turnstileToken })
  },

  register(username: string, email: string, password: string, captcha: { token: string; code: string }, humanToken: string, humanSignals: HumanSignals, behaviorSignals: BehaviorSignals | undefined, turnstileToken: string) {
    return post('/register', { username, email, password, imageCaptchaToken: captcha.token, imageCaptchaCode: captcha.code, humanToken, humanSignals, behaviorSignals, turnstileToken })
  },

  async logout() {
    const result = await post('/logout')
    cachedToken = null
    csrfToken = null
    persistAccessToken(null)
    return result
  },

  me() {
    return get('/me')
  },

  async refreshToken() {
    return post('/refresh-token')
  },

  getCaptcha() {
    return get('/api/captcha')
  },

  getSessions() {
    return get('/auth/sessions')
  },

  getLoginHistory() {
    return get('/auth/login-history')
  },

  revokeSession(sessionId: string) {
    return post('/auth/revoke-session', { sessionId })
  },

  get2FAStatus() {
    return get('/auth/2fa/status')
  },

  setup2FA() {
    return post('/auth/2fa/setup')
  },

  verify2FA(code: string) {
    return post('/auth/2fa/verify', { code })
  },

  disable2FA() {
    return post('/auth/2fa/disable')
  },

  submitAppeal(contactEmail: string, reason: string, evidence?: string) {
    return post('/appeals', { contactEmail, reason, evidence })
  },

  getAppeals() {
    return get('/appeals')
  },

  getCurrentPolicy() {
    return get('/policies/current')
  },

  acceptPolicy() {
    return post('/policies/accept')
  },

  getAdminAppeals(params?: { status?: string; page?: number; limit?: number }) {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return get(`/admin/appeals${query}`)
  },

  reviewAppeal(appealId: string, decision: string, reviewNote?: string) {
    return post(`/admin/appeals/${appealId}/review`, { decision, reviewNote })
  },

  updateUserStatus(userId: string, status: string, reason?: string) {
    return post(`/admin/users/${userId}/status`, { status, reason })
  },

  adminReauth(password: string, totpCode?: string) {
    return post('/admin/reauth', { password, totpCode })
  },

  getCsrfToken() {
    return get('/csrf-token')
  },

  getPrivacyConsent() {
    return get('/user/privacy-consent')
  },

  updatePrivacyConsent(consent: boolean) {
    return post('/user/privacy-consent', { consent })
  },

  getPaymentProtectionStatus() {
    return get('/membership/payment-protection/status')
  },

  webauthnRegisterOptions() {
    return post('/webauthn/register-options')
  },

  webauthnRegisterVerify(attestationResponse: unknown) {
    return post('/webauthn/register-verify', { response: attestationResponse })
  },

  webauthnLoginOptions(email: string, turnstileToken?: string) {
    return post('/webauthn/login-options', { email, turnstileToken })
  },

  webauthnLoginVerify(userId: string, assertionResponse: unknown, turnstileToken?: string) {
    return post('/webauthn/login-verify', { userId, response: assertionResponse, turnstileToken })
  },

  webauthnStatus() {
    return get('/webauthn/status')
  },

  webauthnRemoveCredential(credentialId: string) {
    return del(`/webauthn/credentials/${credentialId}`)
  },

  adminWebauthnLoginOptions(sessionId: string) {
    return post('/admin/webauthn/login-options', { sessionId })
  },

  adminWebauthnLoginVerify(sessionId: string, response: unknown) {
    return post('/admin/webauthn/login-verify', { sessionId, response })
  },

  getChatHistory() {
    return get('/ai/chat/history')
  },

  deleteChatHistory() {
    return del('/ai/chat/history')
  },
}

export const notificationsApi = {
  getList(category?: string) {
    const query = category ? `?category=${category}` : ''
    return get(`/notifications${query}`)
  },

  getUnreadCount() {
    return get('/notifications/unread-count')
  },

  markAsRead(id: string) {
    return patch(`/notifications/${id}/read`, {})
  },

  markAllAsRead() {
    return post('/notifications/read-all', {})
  },

  deleteNotification(id: string) {
    return del(`/notifications/${id}`)
  },
}

export const securityApi = {
  getOverview() {
    return get('/security/overview')
  },

  getEvents(limit = 20) {
    return get(`/security/events?limit=${limit}`)
  },

  markEventsRead(eventIds: string[]) {
    return post('/security/events/read', { eventIds })
  },

  getStatus() {
    return get('/security/status')
  },

  getChallenge(difficulty = 3) {
    return get(`/security/challenge?difficulty=${difficulty}`)
  },

  verifyChallenge(challengeId: string, nonce: string, clientTimestamp: number) {
    return post('/security/challenge/verify', { challengeId, nonce, clientTimestamp })
  },

  // V3 新增 API
  getUnreadEvents() {
    return get('/security/unread-events')
  },

  getBanInfo() {
    return get('/security/ban-info')
  },

  invalidateSessions() {
    return post('/security/invalidate-sessions', {})
  },

  getPendingBanApprovals(limit = 50) {
    return get(`/admin/ban-approvals/pending?limit=${limit}`)
  },

  getAllBanApprovals(status?: string, page = 1, limit = 50) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (status) params.set('status', status)
    return get(`/admin/ban-approvals?${params}`)
  },

  createBanApproval(userId: string, banType: string, reason: string) {
    return post('/admin/ban-approvals', { userId, banType, reason })
  },

  reviewBanApproval(approvalId: string, decision: 'approve' | 'reject', reviewNote?: string) {
    return post('/admin/ban-approvals/review', { approvalId, decision, reviewNote })
  },
}

export function initAuth() {
  cachedToken = readStoredAccessToken()
  getCsrfToken()
}