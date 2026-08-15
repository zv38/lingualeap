import { removeSecureItem } from './secureStorage'

const LEGACY_CACHE_KEY = 'auth_cache_token'
const REFRESH_CACHE_KEY = 'lingualeap_refresh_token'

// 安全规范：Access Token 已迁移到 HttpOnly Cookie，前端 JavaScript 无法读取。
// 该模块不再将 token 写入 localStorage，避免 XSS 攻击直接窃取用户凭证。
// 登录状态通过 /api/me 与 cookie 共同维护。

export function setCachedToken(_token: string | null) {
  // Access Token 由后端通过 HttpOnly Cookie 下发，前端不再缓存到任何可读存储。
  // 登出时清理本地可能残留的 legacy token，作为向后兼容的防御性清理。
  if (_token === null) {
    try {
      localStorage.removeItem(LEGACY_CACHE_KEY)
    } catch {}
  }
}

export function getCachedToken(): string | null {
  // HttpOnly Cookie 无法被 JavaScript 读取，因此返回 null。
  // 认证请求会自动携带 cookie，无需手动设置 Authorization 头。
  return null
}

// 刷新令牌已迁移到 HttpOnly Cookie，客户端不再存储。
export async function setCachedRefreshToken(_token: string | null) {
  if (_token === null) {
    try {
      removeSecureItem(REFRESH_CACHE_KEY)
    } catch {}
  }
}

export async function getCachedRefreshToken(): Promise<string | null> {
  return null
}
