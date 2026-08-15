import { queryExternalThreatIntel } from './externalThreatIntel.js'

// ===== 本地威胁情报缓存 =====
// 维护恶意 IP、UA、路径指纹缓存，供决策引擎快速查询
// 已接入外部情报源（AbuseIPDB / FireHOL / IPinfo / ip-api.com），结果异步缓存。

export class ThreatIntel {
  constructor() {
    this.enabled = process.env.AI_THREAT_INTEL !== 'false' && process.env.AI_ENHANCED_DEFENSE === 'true'
    this.externalEnabled = process.env.AI_EXTERNAL_THREAT_INTEL !== 'false'
    this.maliciousIps = new Set()
    this.suspiciousUas = new Set([
      'sqlmap',
      'nikto',
      'nmap',
      'masscan',
      'gobuster',
      'dirb',
      'wfuzz',
      'burp',
      'metasploit',
    ])
    this.attackFingerprints = new Set([
      '/.env',
      '/.git/config',
      '/wp-admin',
      '/phpmyadmin',
      '/config.json',
      '/backup.sql',
      '/debug',
      '/api/internal',
      '/admin/legacy',
    ])
    this.ipReputation = new Map()
    this.externalCache = new Map()
  }

  addMaliciousIp(ip) {
    this.maliciousIps.add(ip)
    this.ipReputation.set(ip, 1.0)
  }

  check(context) {
    if (!this.enabled) return { enabled: false, score: 0 }

    const signals = []
    let score = 0

    if (this.maliciousIps.has(context.ip)) {
      signals.push({ type: 'KNOWN_MALICIOUS_IP', value: context.ip, risk: 'critical' })
      score += 0.9
    }

    const ua = (context.userAgent || '').toLowerCase()
    for (const badUa of this.suspiciousUas) {
      if (ua.includes(badUa)) {
        signals.push({ type: 'SUSPICIOUS_USER_AGENT', value: badUa, risk: 'high' })
        score += 0.5
      }
    }

    const path = (context.path || '').toLowerCase()
    for (const fp of this.attackFingerprints) {
      if (path.includes(fp)) {
        signals.push({ type: 'KNOWN_ATTACK_FINGERPRINT', value: fp, risk: 'high' })
        score += 0.4
      }
    }

    const rep = this.ipReputation.get(context.ip) || 0
    if (rep > 0) {
      signals.push({
        type: 'IP_REPUTATION',
        value: rep.toFixed(2),
        risk: rep > 0.7 ? 'high' : 'medium',
      })
      score += rep * 0.3
    }

    // 外部情报缓存：同步命中时直接使用；未命中时异步刷新，供下一次请求使用
    const cachedExternal = this.externalCache.get(context.ip)
    if (cachedExternal && Date.now() < cachedExternal.expiresAt) {
      const ext = cachedExternal.value
      if (ext.isMalicious) {
        signals.push({ type: 'EXTERNAL_THREAT_INTEL', value: ext.sources.map(s => s.source).join(','), risk: 'critical' })
        score = Math.max(score, ext.score)
      }
      if (ext.geo?.isTor) signals.push({ type: 'TOR_EXIT_NODE', value: context.ip, risk: 'high' })
      if (ext.geo?.isProxy) signals.push({ type: 'PROXY_IP', value: context.ip, risk: 'medium' })
      if (ext.geo?.isHosting) signals.push({ type: 'HOSTING_DATACENTER', value: context.ip, risk: 'low' })
    } else if (this.externalEnabled && context.ip && context.ip !== 'unknown') {
      this._refreshExternal(context.ip)
    }

    const finalScore = Math.min(score, 0.99)
    return {
      enabled: true,
      score: finalScore,
      signals,
      alert: finalScore >= 0.5,
      recommendedAction: finalScore >= 0.75 ? 'BLOCK' : finalScore >= 0.5 ? 'CHALLENGE' : 'OBSERVE',
    }
  }

  async _refreshExternal(ip) {
    try {
      const result = await queryExternalThreatIntel(ip)
      this.externalCache.set(ip, {
        value: result,
        expiresAt: Date.now() + 3600 * 1000,
      })
      if (result.isMalicious) {
        this.maliciousIps.add(ip)
        this.ipReputation.set(ip, Math.max(this.ipReputation.get(ip) || 0, result.score))
      }
    } catch (err) {
      // 外部情报失败不应影响主流程
      console.warn('[ThreatIntel] 外部情报刷新失败:', err.message)
    }
  }

  updateReputation(ip, delta) {
    const current = this.ipReputation.get(ip) || 0
    const next = Math.max(0, Math.min(1, current + delta))
    this.ipReputation.set(ip, next)
    if (next >= 0.95) this.maliciousIps.add(ip)
  }

  getStats() {
    return {
      enabled: this.enabled,
      maliciousIpCount: this.maliciousIps.size,
      reputationEntries: this.ipReputation.size,
    }
  }
}

export const threatIntel = new ThreatIntel()
