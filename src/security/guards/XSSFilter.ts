import type { SecurityConfig, SecurityEvent } from '../types'

export class XSSFilter {
  private config: SecurityConfig
  private report: (event: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>) => void

  constructor(
    config: SecurityConfig,
    reportFn: (event: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>) => void
  ) {
    this.config = config
    this.report = reportFn
  }

  protect() {
    if (!this.config.enabled) return
    this.scanUrlParams()
    this.patchInnerHTML()
  }

  scanUrlParams() {
    const params = new URLSearchParams(window.location.search)
    params.forEach((value, key) => {
      for (const pattern of this.config.xssPatterns) {
        if (pattern.test(value)) {
          this.report({
            type: 'XSS_ATTEMPT',
            severity: 'high',
            url: window.location.pathname + window.location.search,
            details: { reason: 'xss_in_url_param', key, value: value.substring(0, 100) },
          })
          pattern.lastIndex = 0
        }
      }
    })
  }

  patchInnerHTML() {
    if (typeof Element === 'undefined') return
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
    if (!original || !original.set) return

    Object.defineProperty(Element.prototype, 'innerHTML', {
      set: (value: string) => {
        for (const pattern of this.config.xssPatterns) {
          if (pattern.test(value)) {
            this.report({
              type: 'XSS_ATTEMPT',
              severity: 'critical',
              url: window.location.pathname,
              details: { reason: 'dangerous_innerHTML', value: value.substring(0, 100) },
            })
            pattern.lastIndex = 0
            break
          }
        }
        original.set!.call(this, value)
      },
      get: original.get,
      configurable: true,
    })
  }
}
