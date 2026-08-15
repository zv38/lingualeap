import type { SecurityConfig, SecurityEvent, ScanResult } from '../types'

export class LeakScanner {
  private config: SecurityConfig
  private report: (event: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>) => void

  constructor(
    config: SecurityConfig,
    reportFn: (event: Omit<SecurityEvent, 'id' | 'timestamp' | 'userAgent'>) => void
  ) {
    this.config = config
    this.report = reportFn
  }

  scan() {
    if (!this.config.enabled) return
    if (typeof document === 'undefined') return

    const results: ScanResult[] = []

    // 扫描 script 标签的 src
    document.querySelectorAll('script[src]').forEach((script: Element) => {
      const src = (script as HTMLScriptElement).src
      if (src.includes('.map')) {
        results.push({ type: 'SOURCE_CODE_EXPOSED', severity: 'high', details: { reason: 'source_map_script', src } })
      }
    })

    // 扫描页面文本内容
    const bodyText = document.body?.innerText || ''
    for (const pattern of this.config.leakPatterns) {
      const matches = bodyText.match(pattern)
      if (matches) {
        results.push({
          type: 'SOURCE_CODE_EXPOSED',
          severity: 'critical',
          details: { reason: 'sensitive_pattern_in_page', pattern: pattern.source, match: matches[0].substring(0, 50) },
        })
      }
    }

    // 扫描注释
    const html = document.documentElement?.innerHTML || ''
    const commentPattern = /<!--[\s\S]*?-->/g
    let match: RegExpExecArray | null
    while ((match = commentPattern.exec(html)) !== null) {
      for (const pattern of this.config.leakPatterns) {
        if (pattern.test(match[0])) {
          results.push({ type: 'SOURCE_CODE_EXPOSED', severity: 'high', details: { reason: 'sensitive_comment', match: match[0].substring(0, 50) } })
        }
      }
    }

    results.forEach(r => this.report({ type: r.type, severity: r.severity, url: window.location.pathname, details: r.details }))
  }
}
