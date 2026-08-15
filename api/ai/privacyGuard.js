// ===== AI 隐私卫士 — 输入脱敏 / 输出敏感信息过滤 / 隐私事件审计 =====

import { logAudit } from '../security/core/auditLogger.js'

// PII 检测规则（正则 + 类型标签）
const PII_RULES = [
  { type: 'MOBILE_PHONE', name: '手机号', pattern: /(?<![\d])1[3-9]\d{9}(?![\d])/g, risk: 'high' },
  { type: 'ID_CARD', name: '身份证号', pattern: /[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, risk: 'critical' },
  { type: 'EMAIL', name: '邮箱', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, risk: 'medium' },
  { type: 'BANK_CARD', name: '银行卡号', pattern: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9]{2})[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11}|(?:62[0-9]{14,17}))/g, risk: 'critical' },
  { type: 'LICENSE_PLATE', name: '车牌号', pattern: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{4,5}[A-Z0-9挂学警港澳]/g, risk: 'low' },
  { type: 'BIRTH_DATE', name: '出生日期', pattern: /(?:19|20)\d{2}[年/-](?:0?[1-9]|1[0-2])[月/-](?:0?[1-9]|[12]\d|3[01])[日]?/g, risk: 'low' },
  { type: 'ADDRESS', name: '住址', pattern: /(?:省|市|区|县|乡|镇|村|街道|路|号|楼|单元|室){2,}/g, risk: 'medium' },
  { type: 'NAME', name: '姓名', pattern: /(?:[\u4e00-\u9fa5]{2,4}(?:先生|女士|老师|医生|同学))|(?:[A-Z][a-z]+\s[A-Z][a-z]+)/g, risk: 'low' },
]

// 输出侧敏感信息检测规则
const OUTPUT_SENSITIVE_RULES = [
  { type: 'API_KEY', name: 'API 密钥', pattern: /(?:sk|pk|ak)-[a-zA-Z0-9]{16,}/g, risk: 'critical' },
  { type: 'JWT_TOKEN', name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, risk: 'critical' },
  { type: 'PASSWORD', name: '密码', pattern: /(?:password|passwd|pwd|密码|密钥)\s*[=:]\s*["']?[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}/gi, risk: 'critical' },
  { type: 'PRIVATE_IP', name: '私有 IP', pattern: /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})/g, risk: 'medium' },
  { type: 'INTERNAL_URL', name: '内部 URL', pattern: /https?:\/\/[^\s]*(?:internal|private|secret|admin|localhost|127\.0\.0\.1|0\.0\.0\.0)[^\s]*/gi, risk: 'medium' },
]

// 简单中文分词辅助：用于上下文判断
function roughTokenize(text) {
  return text.split(/\s+|([\u4e00-\u9fa5])/g).filter(Boolean)
}

class PrivacyGuard {
  constructor() {
    this.strictMode = process.env.PRIVACY_STRICT_MODE === 'true'
    this.eventLog = []
    this.maxEvents = 2000
  }

  // 输入侧 PII 扫描
  scanInput(text, context = {}) {
    const findings = []
    for (const rule of PII_RULES) {
      const matches = Array.from(text.matchAll(rule.pattern)).map(m => ({
        matched: m[0],
        index: m.index,
        type: rule.type,
        name: rule.name,
        risk: rule.risk,
      }))
      findings.push(...matches)
    }

    // 去重（按位置）
    const unique = []
    const seen = new Set()
    for (const f of findings) {
      const key = `${f.index}-${f.matched}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(f)
    }
    unique.sort((a, b) => a.index - b.index)

    const hasCritical = unique.some(f => f.risk === 'critical')
    const hasHigh = unique.some(f => f.risk === 'high')

    // 严格模式：含 critical/high PII 直接阻止
    const blocked = this.strictMode && (hasCritical || hasHigh)

    const result = {
      hasPII: unique.length > 0,
      blocked,
      findings: unique,
      riskLevel: hasCritical ? 'critical' : hasHigh ? 'high' : unique.length > 0 ? 'medium' : 'none',
    }

    if (unique.length > 0) {
      this.logEvent('pii_detected', context, {
        count: unique.length,
        types: unique.map(f => f.type),
        blocked,
      })
    }

    return result
  }

  // 输入脱敏
  redactInput(text, findings) {
    if (!findings || findings.length === 0) return text
    let result = ''
    let last = 0
    for (const f of findings.sort((a, b) => a.index - b.index)) {
      result += text.slice(last, f.index)
      result += `[${f.name}_REDACTED]`
      last = f.index + f.matched.length
    }
    result += text.slice(last)
    return result
  }

  // 输出侧敏感信息扫描
  scanOutput(text, context = {}) {
    const findings = []
    for (const rule of OUTPUT_SENSITIVE_RULES) {
      const matches = Array.from(text.matchAll(rule.pattern)).map(m => ({
        matched: m[0],
        index: m.index,
        type: rule.type,
        name: rule.name,
        risk: rule.risk,
      }))
      findings.push(...matches)
    }

    // 大量邮箱泄露
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    const emails = Array.from(text.matchAll(emailPattern))
    if (emails.length > 5) {
      findings.push({
        matched: `发现 ${emails.length} 个邮箱`,
        index: emails[0].index,
        type: 'MASS_EMAIL_LEAK',
        name: '批量邮箱泄露',
        risk: 'high',
      })
    }

    const unique = []
    const seen = new Set()
    for (const f of findings) {
      const key = `${f.index}-${f.matched}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(f)
    }
    unique.sort((a, b) => a.index - b.index)

    const result = {
      hasSensitive: unique.length > 0,
      findings: unique,
      riskLevel: unique.some(f => f.risk === 'critical') ? 'critical' : unique.some(f => f.risk === 'high') ? 'high' : unique.length > 0 ? 'medium' : 'none',
    }

    if (unique.length > 0) {
      this.logEvent('output_filter_triggered', context, {
        count: unique.length,
        types: unique.map(f => f.type),
      })
    }

    return result
  }

  // 输出侧替换
  redactOutput(text, findings) {
    if (!findings || findings.length === 0) return text
    let result = ''
    let last = 0
    for (const f of findings.sort((a, b) => a.index - b.index)) {
      result += text.slice(last, f.index)
      result += `***${f.name}_REDACTED***`
      last = f.index + f.matched.length
    }
    result += text.slice(last)
    return result
  }

  // 处理 AI 聊天输入（严格模式阻断或脱敏）
  sanitizeChatInput(text, context = {}) {
    const scan = this.scanInput(text, context)
    if (scan.blocked) {
      return {
        allowed: false,
        reason: '检测到高风险个人信息，请移除后重新发送',
        scan,
        sanitized: null,
      }
    }
    if (scan.hasPII) {
      return {
        allowed: true,
        sanitized: this.redactInput(text, scan.findings),
        scan,
      }
    }
    return { allowed: true, sanitized: text, scan }
  }

  // 处理 AI 聊天输出
  sanitizeChatOutput(text, context = {}) {
    const scan = this.scanOutput(text, context)
    if (!scan.hasSensitive) return { text, scan, blocked: false }
    return {
      text: this.redactOutput(text, scan.findings),
      scan,
      blocked: scan.riskLevel === 'critical',
    }
  }

  logEvent(action, context, details) {
    const event = {
      id: `PRIV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      userId: context.userId || 'anonymous',
      ip: context.ip || 'unknown',
      sessionId: context.sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      details,
    }
    this.eventLog.push(event)
    if (this.eventLog.length > this.maxEvents) {
      this.eventLog.shift()
    }

    logAudit({
      userId: context.userId || 'anonymous',
      action: `privacy_${action}`,
      ip: context.ip || 'unknown',
      details: JSON.stringify(details),
      success: true,
    })
  }

  getEvents(filters = {}) {
    let events = [...this.eventLog].reverse()
    if (filters.action) events = events.filter(e => e.action === filters.action)
    if (filters.userId) events = events.filter(e => e.userId === filters.userId)
    if (filters.limit) events = events.slice(0, filters.limit)
    return events
  }

  getStats() {
    const totalScans = this.eventLog.filter(e => e.action === 'pii_detected').length
    const totalFilters = this.eventLog.filter(e => e.action === 'output_filter_triggered').length
    const typeCounts = {}
    for (const e of this.eventLog) {
      const types = e.details?.types || []
      for (const t of types) {
        typeCounts[t] = (typeCounts[t] || 0) + 1
      }
    }
    return { totalScans, totalFilters, typeCounts }
  }
}

export const privacyGuard = new PrivacyGuard()

/**
 * 检测文本中是否包含 PII，返回 findings 数组
 */
export function detectPII(text) {
  if (typeof text !== 'string') return []
  const result = privacyGuard.scanInput(text)
  return result.findings || []
}

/**
 * 对文本中的 PII 进行脱敏，返回脱敏后的字符串
 */
export function sanitize(text) {
  if (typeof text !== 'string') return text
  const result = privacyGuard.sanitizeChatInput(text)
  return result.sanitized || text
}
