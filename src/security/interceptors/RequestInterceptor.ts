import type { SecurityConfig, SecurityEvent } from '../types'
import { isApiAllowed, containsSensitiveField } from '../rules/SecurityRules'

export class RequestInterceptor {
  private config: SecurityConfig
  private report: (event: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>) => void

  constructor(
    config: SecurityConfig,
    reportFn: (event: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>) => void
  ) {
    this.config = config
    this.report = reportFn
  }

  intercept() {
    if (!this.config.enabled) return

    const originalFetch = window.fetch
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const path = this.extractPath(url)

      if (!this.isInternalApi(path)) {
        return originalFetch(input, init)
      }

      const violations = this.checkRequest(path, init)
      if (violations.length > 0) {
        violations.forEach(v => this.report(v))
      }

      // 安全规范：header 黑名单由后端 WAF 维护，前端不暴露具体名单。
      // 若配置中提供了黑名单（仅用于本地调试），则在前端发出前清理并上报。
      const headers = new Headers(init?.headers)
      const blockedHeaders = this.config.blockedHeaders || []
      let blockedHeader = ''
      for (const h of blockedHeaders) {
        if (headers.has(h)) {
          blockedHeader = h
          headers.delete(h)
        }
      }
      if (blockedHeader) {
        this.report({
          type: 'ANOMALY_PATTERN',
          severity: 'high',
          url: path,
          details: { reason: 'blocked_header_removed', header: blockedHeader },
        })
      }

      const safeInit = init ? { ...init, headers } : { headers }
      return originalFetch(input, safeInit)
    }
  }

  private extractPath(url: string): string {
    try {
      return new URL(url, window.location.origin).pathname
    } catch {
      return url.split('?')[0]
    }
  }

  private isInternalApi(path: string): boolean {
    return path.startsWith('/api/') || path.startsWith('/uploads/')
  }

  private checkRequest(path: string, init?: RequestInit): Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>[] {
    const violations: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>[] = []

    if (!isApiAllowed(path, this.config.apiWhitelist)) {
      violations.push({
        type: 'UNAUTHORIZED_API_ATTEMPT',
        severity: 'medium',
        url: path,
        details: { method: init?.method || 'GET' },
      })
    }

    if (init?.body) {
      let bodyObj: unknown
      try {
        bodyObj = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
      } catch {
        bodyObj = null
      }
      const sensitive = containsSensitiveField(bodyObj, this.config.sensitiveFields)
      if (sensitive.found) {
        violations.push({
          type: 'SENSITIVE_DATA_LEAK',
          severity: 'high',
          url: path,
          details: { reason: 'request_contains_sensitive_field', field: sensitive.field, method: init?.method || 'POST' },
        })
      }
    }

    return violations
  }
}
