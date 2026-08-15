import type { SecurityConfig } from '../types'

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enabled: true,
  apiWhitelist: [
    '/api/health',
    '/api/ping',
    '/api/csrf-token',
    '/api/captcha',
    '/api/login',
    '/api/register',
    '/api/refresh-token',
    '/api/logout',
    '/api/forgot-password',
    '/api/me',
    '/api/auth/',
    '/api/webauthn/',
    '/api/courses',
    '/api/words',
    '/api/grammar',
    '/api/progress',
    '/api/achievements',
    '/api/posts',
    '/api/surveys',
    '/api/admin/',
    '/api/security/',
    '/api/user/',
    '/api/ai/',
  ],
  sensitiveFields: [
    'password',
    'token',
    'refreshToken',
    'secret',
    'jwt',
    'creditCard',
    'idCard',
    'phone',
    'email',
  ],
  // 安全规范：header 黑名单为空，具体黑名单由后端 WAF 维护，不暴露在前端源码中
  blockedHeaders: [],
  leakPatterns: [
    /JWT_SECRET\s*=/i,
    /DATABASE_URL\s*=/i,
    /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    /sk-[a-zA-Z0-9]{48}/,
    /AKIA[0-9A-Z]{16}/,
  ],
  xssPatterns: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:text\/html/i,
  ],
  reportEndpoint: '/api/security/events',
  reportBatchSize: 10,
  reportIntervalMs: 5000,
  reducedMotion: false,
}

export function mergeConfig(partial: Partial<SecurityConfig>): SecurityConfig {
  return { ...DEFAULT_SECURITY_CONFIG, ...partial }
}

export function isApiAllowed(path: string, whitelist: string[]): boolean {
  const normalized = path.split('?')[0]
  return whitelist.some(p => normalized === p || normalized.startsWith(p))
}

export function containsSensitiveField(obj: unknown, fields: string[]): { found: boolean; field?: string } {
  if (!obj || typeof obj !== 'object') return { found: false }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase()
    if (fields.some(f => lower.includes(f.toLowerCase()))) {
      return { found: true, field: key }
    }
  }
  return { found: false }
}

export function sanitizeObject<T>(obj: T, fields: string[]): T {
  if (!obj || typeof obj !== 'object') return obj
  const clone = Array.isArray(obj) ? ([...obj] as unknown as T) : ({ ...obj } as T)
  for (const key of Object.keys(clone as Record<string, unknown>)) {
    const lower = key.toLowerCase()
    if (fields.some(f => lower.includes(f.toLowerCase()))) {
      ;(clone as Record<string, unknown>)[key] = '***REDACTED***'
    } else if (typeof (clone as Record<string, unknown>)[key] === 'object') {
      ;(clone as Record<string, unknown>)[key] = sanitizeObject(
        (clone as Record<string, unknown>)[key],
        fields
      )
    }
  }
  return clone
}
