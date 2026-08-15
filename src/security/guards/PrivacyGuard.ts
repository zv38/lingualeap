import type { SecurityConfig, SecurityEvent } from '../types'
import { containsSensitiveField, sanitizeObject } from '../rules/SecurityRules'

export class PrivacyGuard {
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
    this.patchConsole()
    this.patchLocalStorage()
  }

  sanitize(data: unknown): unknown {
    return sanitizeObject(data, this.config.sensitiveFields)
  }

  checkResponse(url: string, data: unknown) {
    const sensitive = containsSensitiveField(data, this.config.sensitiveFields)
    if (sensitive.found) {
      this.report({
        type: 'SENSITIVE_DATA_LEAK',
        severity: 'critical',
        url,
        details: { reason: 'response_contains_sensitive_field', field: sensitive.field },
      })
    }
  }

  private patchConsole() {
    const levels: ('log' | 'warn' | 'error' | 'info')[] = ['log', 'warn', 'error', 'info']
    levels.forEach(level => {
      const original = console[level]
      console[level] = (...args: unknown[]) => {
        const sanitized = args.map(arg => this.sanitize(arg))
        original.apply(console, sanitized)
      }
    })
  }

  private patchLocalStorage() {
    const originalSetItem = localStorage.setItem
    localStorage.setItem = (key: string, value: string) => {
      if (this.config.sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        this.report({
          type: 'SENSITIVE_DATA_LEAK',
          severity: 'medium',
          url: window.location.pathname,
          details: { reason: 'localStorage_sensitive_key', key },
        })
      }
      originalSetItem.call(localStorage, key, value)
    }
  }
}
