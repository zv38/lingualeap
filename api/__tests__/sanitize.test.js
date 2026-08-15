import { describe, it, expect } from 'vitest'

describe('Error Sanitization Logic', () => {
  // Simulated sanitize function matching backend behavior
  function sanitizeApiError(path, status, message) {
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

    return message ? message.slice(0, 200) : `请求失败，请稍后重试 (${status})`
  }

  it('should return generic message for auth 401 errors', () => {
    const result = sanitizeApiError('/login', 401, 'Invalid password')
    expect(result).toBe('账号或密码错误，请重试')
  })

  it('should return generic message for auth 403 errors', () => {
    const result = sanitizeApiError('/register', 403, 'Account locked')
    expect(result).toBe('账号或密码错误，请重试')
  })

  it('should return generic message for auth 404 errors', () => {
    const result = sanitizeApiError('/auth/login', 404, 'Not found')
    expect(result).toBe('账号或密码错误，请重试')
  })

  it('should return generic message for admin auth errors', () => {
    const result = sanitizeApiError('/admin/login', 401, 'Invalid admin credentials')
    expect(result).toBe('账号或密码错误，请重试')
  })

  it('should return generic 500 message', () => {
    const result = sanitizeApiError('/courses', 500, 'Database connection failed')
    expect(result).toBe('服务繁忙，请稍后重试')
  })

  it('should return truncated message for other errors', () => {
    const longMsg = 'a'.repeat(300)
    const result = sanitizeApiError('/courses', 400, longMsg)
    expect(result.length).toBe(200)
  })

  it('should return status-based message when no message provided', () => {
    const result = sanitizeApiError('/courses', 404, '')
    expect(result).toBe('请求失败，请稍后重试 (404)')
  })

  it('should not sanitize non-auth 400 errors', () => {
    const result = sanitizeApiError('/courses', 400, 'Invalid course ID')
    expect(result).toBe('Invalid course ID')
  })
})