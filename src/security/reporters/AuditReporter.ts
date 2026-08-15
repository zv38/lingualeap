import type { SecurityConfig, SecurityEvent } from '../types'

export class AuditReporter {
  private config: SecurityConfig
  private queue: SecurityEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(config: SecurityConfig) {
    this.config = config
  }

  start() {
    if (!this.config.enabled) return
    this.timer = setInterval(() => this.flush(), this.config.reportIntervalMs)
    window.addEventListener('beforeunload', () => this.flush())
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  report(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>) {
    if (!this.config.enabled) return
    const full: SecurityEvent = {
      ...event,
      id: this.generateId(),
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    }
    this.queue.push(full)
    if (this.queue.length >= this.config.reportBatchSize) {
      this.flush()
    }
  }

  private async flush() {
    if (this.queue.length === 0) return
    const batch = this.queue.splice(0, this.config.reportBatchSize)
    try {
      await fetch(this.config.reportEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      })
    } catch {
      // 上报失败不阻塞业务，可选：本地暂存后重试
    }
  }

  private generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
