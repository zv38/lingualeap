import type { SecurityConfig } from '../types'
import type { SecurityEvent } from '../types'

/**
 * ConsoleGuard：生产环境清理控制台输出，防止攻击者通过浏览器开发者工具
 * 获取内部日志、调试信息、错误堆栈等敏感内容。
 */
export class ConsoleGuard {
  private config: SecurityConfig
  private report: (event: SecurityEvent) => void
  private restored = false

  constructor(config: SecurityConfig, report: (event: SecurityEvent) => void) {
    this.config = config
    this.report = report
  }

  protect() {
    if (!this.config.enabled || import.meta.env.DEV) return
    if (typeof window === 'undefined' || typeof console === 'undefined') return

    const noop = () => {}
    const originalMethods = new Map<string, unknown>()
    const methodsToDisable: (keyof Console)[] = [
      'log',
      'info',
      'debug',
      'trace',
      'dir',
      'dirxml',
      'table',
      'group',
      'groupCollapsed',
      'groupEnd',
      'count',
      'countReset',
      'time',
      'timeEnd',
      'timeLog',
      'profile',
      'profileEnd',
    ]

    const consoleRecord = console as unknown as Record<string, unknown>
    methodsToDisable.forEach((method) => {
      if (typeof consoleRecord[method] === 'function') {
        originalMethods.set(method, consoleRecord[method])
        consoleRecord[method] = noop
      }
    })

    // 保留 console.error 和 console.warn 但做脱敏处理
    const originalError = console.error
    const originalWarn = console.warn
    console.error = (...args: unknown[]) => {
      if (this.restored) {
        originalError.apply(console, args)
        return
      }
      // 只输出简短提示，不上报完整错误对象
      originalError.call(console, '[Redacted] 生产环境已隐藏详细错误信息')
    }
    console.warn = (...args: unknown[]) => {
      if (this.restored) {
        originalWarn.apply(console, args)
        return
      }
      originalWarn.call(console, '[Redacted] 生产环境已隐藏详细警告信息')
    }

    // 防止通过 console.clear 恢复（保留原功能但可监控）
    const originalClear = console.clear
    console.clear = () => {
      this.report({
        id: this.generateId(),
        type: 'ANOMALY_PATTERN',
        severity: 'low',
        url: window.location.href,
        details: { pattern: 'console_clear_called' },
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      })
      originalClear.call(console)
    }
  }

  restore() {
    this.restored = true
  }

  private generateId(): string {
    return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
