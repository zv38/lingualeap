import type { SecurityConfig } from '../types'
import type { SecurityEvent } from '../types'

/**
 * DevToolsGuard：轻量级开发者工具检测与反调试。
 * 仅在管理员路径启用，避免影响普通用户。
 *
 * 注意：所有前端反调试手段都可以被熟练攻击者绕过，本 Guard 仅作为提高
 * 攻击成本的辅助层，不能替代服务端权限校验。
 */
export class DevToolsGuard {
  private config: SecurityConfig
  private report: (event: SecurityEvent) => void
  private devToolsOpen = false
  private checking = false

  constructor(config: SecurityConfig, report: (event: SecurityEvent) => void) {
    this.config = config
    this.report = report
  }

  protect() {
    if (!this.config.enabled || import.meta.env.DEV || typeof window === 'undefined') return
    if (!this.isAdminPath()) return

    this.detectByWindowSize()
    this.detectByDebugger()
    this.blockShortcuts()
  }

  private isAdminPath(): boolean {
    return /\/admin(?:\/|$)/i.test(window.location.pathname)
  }

  /**
   * 通过窗口尺寸差异检测开发者工具是否打开。
   */
  private detectByWindowSize() {
    const threshold = 160
    const check = () => {
      if (this.checking) return
      this.checking = true
      try {
        const widthDiff = window.outerWidth - window.innerWidth
        const heightDiff = window.outerHeight - window.innerHeight
        const nowOpen = widthDiff > threshold || heightDiff > threshold

        if (nowOpen && !this.devToolsOpen) {
          this.devToolsOpen = true
          this.report({
            id: this.generateId(),
            type: 'ANOMALY_PATTERN',
            severity: 'medium',
            url: window.location.href,
            details: { pattern: 'admin_devtools_opened' },
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
          })
        } else if (!nowOpen && this.devToolsOpen) {
          this.devToolsOpen = false
        }
      } finally {
        this.checking = false
      }
    }

    setInterval(check, 2000)
  }

  /**
   * 通过 debugger 语句时间差检测是否被断点调试。
   */
  private detectByDebugger() {
    const check = () => {
      const start = performance.now()
      // eslint-disable-next-line no-debugger
      debugger
      const end = performance.now()
      if (end - start > 120) {
        this.report({
          id: this.generateId(),
          type: 'ANOMALY_PATTERN',
          severity: 'high',
          url: window.location.href,
          details: { pattern: 'admin_debugger_detected' },
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
        })
      }
    }

    setInterval(check, 3000)
  }

  /**
   * 阻止常见打开开发者工具的快捷键（仅管理员路径）。
   */
  private blockShortcuts() {
    document.addEventListener(
      'keydown',
      (e) => {
        // F12
        if (e.key === 'F12') {
          e.preventDefault()
          this.report({
            id: this.generateId(),
            type: 'ANOMALY_PATTERN',
            severity: 'low',
            url: window.location.href,
            details: { pattern: 'admin_f12_blocked' },
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
          })
          return
        }

        // Ctrl/Cmd + Shift + I / J / C
        if (
          (e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['I', 'J', 'C'].includes(e.key.toUpperCase())
        ) {
          e.preventDefault()
          this.report({
            id: this.generateId(),
            type: 'ANOMALY_PATTERN',
            severity: 'low',
            url: window.location.href,
            details: { pattern: 'admin_devtools_shortcut_blocked', key: e.key },
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
          })
        }
      },
      true
    )
  }

  private generateId(): string {
    return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
