// Test setup for frontend tests
import '@testing-library/jest-dom'

// Mock crypto.subtle for browser crypto tests
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256)
        }
        return arr
      },
      subtle: {
        importKey: async () => ({}),
        deriveKey: async () => ({}),
        encrypt: async () => new ArrayBuffer(32),
        decrypt: async () => new ArrayBuffer(32),
      } as any,
    },
    writable: true,
  })
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock fetch
globalThis.fetch = ((async (url: string, _init?: RequestInit) => {
  if (url.toString().includes('/csrf-token')) {
    return new Response(JSON.stringify({ success: true, data: { csrfToken: 'test-csrf-token' } }))
  }
  return new Response(JSON.stringify({ success: true, data: {}, message: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}) as unknown) as typeof fetch

// Mock btoa/atob if not available (jsdom)
if (typeof globalThis.btoa === 'undefined') {
  ;(globalThis as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64')
  ;(globalThis as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary')
}

// Mock TextEncoder/TextDecoder if not available (jsdom)
if (typeof globalThis.TextEncoder === 'undefined') {
  class SimpleTextEncoder {
    encode(str: string): Uint8Array {
      const buf = Buffer.from(str, 'utf-8')
      return new Uint8Array(buf)
    }
  }
  class SimpleTextDecoder {
    decode(buf?: Uint8Array): string {
      if (!buf) return ''
      return Buffer.from(buf).toString('utf-8')
    }
  }
  globalThis.TextEncoder = SimpleTextEncoder as any
  globalThis.TextDecoder = SimpleTextDecoder as any
}