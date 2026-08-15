const ATTACK_PATTERNS = {
  CREDENTIAL_STUFFING: 'CREDENTIAL_STUFFING',
  SLOW_LORIS: 'SLOW_LORIS',
  DISTRIBUTED_BRUTE_FORCE: 'DISTRIBUTED_BRUTE_FORCE',
  WEB_SCRAPING: 'WEB_SCRAPING',
  RECONNAISSANCE: 'RECONNAISSANCE',
  API_ABUSE: 'API_ABUSE',
}

class PatternDetector {
  constructor() {
    this.ipWindowHistory = new Map()
    this.patternLog = []
    this.WINDOW_COOLDOWN = 300000
  }

  record(context) {
    const ip = context.ip
    if (!this.ipWindowHistory.has(ip)) {
      this.ipWindowHistory.set(ip, [])
    }

    const history = this.ipWindowHistory.get(ip)
    history.push({
      ...context,
      t: Date.now(),
    })

    if (history.length > 200) history.splice(0, history.length - 200)
  }

  detect(context) {
    const findings = []
    const ip = context.ip
    const history = this.ipWindowHistory.get(ip) || []

    // 1. 凭证填充检测 — 短时间内大量不同邮箱登录
    if (context.uniqueEmails >= 8 && context.requestsPerMinute >= 15) {
      findings.push({
        pattern: ATTACK_PATTERNS.CREDENTIAL_STUFFING,
        confidence: Math.min(0.95, 0.5 + context.uniqueEmails * 0.05),
        severity: 'critical',
        evidence: `唯一邮箱=${context.uniqueEmails}, 请求=${context.requestsPerMinute}/min`,
      })
    }

    // 2. Slow Loris检测 — 极低间隔但持续不断的请求
    if (context.avgInterval > 0 && context.avgInterval < 200 && context.requestCount >= 30 && context.sessionDuration > 30000) {
      findings.push({
        pattern: ATTACK_PATTERNS.SLOW_LORIS,
        confidence: Math.min(0.9, 0.4 + (200 - context.avgInterval) / 200 * 0.5),
        severity: 'high',
        evidence: `平均间隔=${context.avgInterval.toFixed(0)}ms, 持续=${context.sessionDuration}ms`,
      })
    }

    // 3. 信息收集检测 — 访问多个不常见路径 + 蜜罐触发
    if ((context.honeypotTriggered || context.pathCount >= 15) && context.requestsPerMinute >= 10) {
      findings.push({
        pattern: ATTACK_PATTERNS.RECONNAISSANCE,
        confidence: context.honeypotTriggered ? 0.9 : 0.6,
        severity: 'high',
        evidence: context.honeypotTriggered ? '蜜罐触发' : `路径数=${context.pathCount}`,
      })
    }

    // 4. API滥用检测 — 极高请求频率 + 非浏览器 + 无指纹
    if (context.requestsPerMinute >= 80 || (context.requestsPerMinute >= 40 && !context.isBrowser)) {
      findings.push({
        pattern: ATTACK_PATTERNS.API_ABUSE,
        confidence: Math.min(0.95, context.requestsPerMinute / 100),
        severity: 'medium',
        evidence: `请求=${context.requestsPerMinute}/min, 浏览器=${context.isBrowser}`,
      })
    }

    // 5. Web爬虫检测 — 极低间隔遍历大量路径
    const visitedPaths = new Set(history.map(h => h.path).filter(Boolean))
    if (visitedPaths.size >= 20 && context.minInterval < 100 && context.isBrowser) {
      findings.push({
        pattern: ATTACK_PATTERNS.WEB_SCRAPING,
        confidence: Math.min(0.85, visitedPaths.size / 50),
        severity: 'medium',
        evidence: `路径数=${visitedPaths.size}, 最小间隔=${context.minInterval}ms`,
      })
    }

    return findings
  }

  getPatternStats() {
    const counts = {}
    for (const entry of this.patternLog) {
      counts[entry.pattern] = (counts[entry.pattern] || 0) + 1
    }
    return counts
  }
}

export { ATTACK_PATTERNS }
export const patternDetector = new PatternDetector()