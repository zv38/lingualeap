import type { SecurityConfig } from '../types'
import type { SecurityEvent } from '../types'

/**
 * ErrorGuard：统一全局错误处理，防止运行时错误和未处理的 Promise 拒绝
 * 向用户/控制台泄露原始堆栈和内部错误信息。
 */
export class ErrorGuard {
  private config: SecurityConfig
  private report: (event: SecurityEvent) => void
  private isHandling = false

  constructor(config: SecurityConfig, report: (event: SecurityEvent) => void) {
    this.config = config
    this.report = report
  }

  protect() {
    if (!this.config.enabled || typeof window === 'undefined') return

    window.addEventListener(
      'error',
      (event) => {
        this.handleError(event)
      },
      true
    )

    window.addEventListener(
      'unhandledrejection',
      (event) => {
        this.handleRejection(event)
      },
      true
    )
  }

  private handleError(event: ErrorEvent) {
    // 防止递归（错误处理本身出错）
    if (this.isHandling) return
    this.isHandling = true

    try {
      // 开发环境保留原始错误，方便调试
      if (!import.meta.env.DEV) {
        event.preventDefault()
      }

      const message = event.message ? String(event.message).slice(0, 200) : 'unknown error'
      const filename = event.filename ? String(event.filename).split('/').pop()?.slice(0, 100) : ''

      this.report({
        id: this.generateId(),
        type: 'ANOMALY_PATTERN',
        severity: 'medium',
        url: window.location.href,
        details: {
          pattern: 'client_runtime_error',
          message,
          filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      })

      // 生产环境下不输出原始堆栈
      if (!import.meta.env.DEV) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[Redacted] 应用发生错误，请刷新页面重试')
        }
      }
    } finally {
      this.isHandling = false
    }
  }

  private handleRejection(event: PromiseRejectionEvent) {
    if (this.isHandling) return
    this.isHandling = true

    try {
      if (!import.meta.env.DEV) {
        event.preventDefault()
      }

      const reason = event.reason
      let message = 'unhandled rejection'
      if (typeof reason === 'string') {
        message = reason.slice(0, 200)
      } else if (reason && typeof reason.message === 'string') {
        message = reason.message.slice(0, 200)
      }

      this.report({
        id: this.generateId(),
        type: 'ANOMALY_PATTERN',
        severity: 'medium',
        url: window.location.href,
        details: {
          pattern: 'client_unhandled_rejection',
          message,
        },
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      })

      if (!import.meta.env.DEV && typeof console !== 'undefined' && console.error) {
        console.error('[Redacted] 应用发生错误，请刷新页面重试')
      }
    } finally {
      this.isHandling = false
    }
  }

  private generateId(): string {
    return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
