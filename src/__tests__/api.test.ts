import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock authCache before importing api
vi.mock('../utils/authCache', () => ({
  getCachedToken: () => null,
  setCachedToken: () => {},
}))

vi.mock('../utils/adminReauthCache', () => ({
  getAdminReauthToken: () => null,
  isAdminPath: () => false,
}))

describe('API Utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should export API_BASE as /api', async () => {
    const { API_BASE } = await import('../utils/api')
    expect(API_BASE).toBe('/api')
  })

  it('should sanitize auth errors to generic message', async () => {
    // Test the sanitizeApiError behavior through the request function
    vi.stubGlobal('fetch', vi.fn(async (url: string, _init?: RequestInit) => {
      const urlStr = url.toString()
      if (urlStr.includes('/csrf-token')) {
        return new Response(JSON.stringify({ success: true, data: { csrfToken: 'test-csrf' } }))
      }
      if (urlStr.includes('/login') || urlStr.includes('/register')) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ success: true, data: {}, message: 'ok' }), { status: 200 })
    }))

    const { post } = await import('../utils/api')
    const result = await post('/login')
    expect(result.success).toBe(false)
    expect(result.message).toBe('账号或密码错误，请重试')
  })

  it('should sanitize server errors to generic message', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, _init?: RequestInit) => {
      const urlStr = url.toString()
      if (urlStr.includes('/csrf-token')) {
        return new Response(JSON.stringify({ success: true, data: { csrfToken: 'test-csrf' } }))
      }
      return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const { post } = await import('../utils/api')
    const result = await post('/courses')
    expect(result.success).toBe(false)
    expect(result.message).toBe('服务繁忙，请稍后重试')
  })

  it('should return success for valid responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, _init?: RequestInit) => {
      const urlStr = url.toString()
      if (urlStr.includes('/csrf-token')) {
        return new Response(JSON.stringify({ success: true, data: { csrfToken: 'test-csrf' } }))
      }
      return new Response(JSON.stringify({ success: true, data: { user: 'test' }, message: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const { get } = await import('../utils/api')
    const result = await get('/me')
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })
})