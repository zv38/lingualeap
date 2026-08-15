// ===== AI 会话数据生命周期管理 =====

import { logAudit } from '../security/core/auditLogger.js'

const DEFAULT_RETENTION_DAYS = 30
const SHORT_RETENTION_DAYS = 1 // 未授权用户
const CONSENT_WITHDRAW_DELETE_DAYS = 7

class ChatRetention {
  constructor() {
    this.messages = new Map() // userId -> Array<ChatMessage>
    this.retentionDays = parseInt(process.env.CHAT_RETENTION_DAYS, 10) || DEFAULT_RETENTION_DAYS
    this.lastCleanup = Date.now()
    this.cleanupInterval = 24 * 60 * 60 * 1000
    this.startCleanupTimer()
  }

  startCleanupTimer() {
    setInterval(() => this.cleanupExpired(), this.cleanupInterval)
  }

  getMessages(userId, consent = false) {
    const list = this.messages.get(userId) || []
    const now = Date.now()
    return list.filter(m => {
      const retention = m.consent === false ? SHORT_RETENTION_DAYS : this.retentionDays
      return now - new Date(m.createdAt).getTime() < retention * 24 * 60 * 60 * 1000
    })
  }

  addMessage(userId, message, consent = false) {
    if (!userId) return null
    const list = this.messages.get(userId) || []
    const record = {
      id: `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      role: message.role,
      content: message.content,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (consent ? this.retentionDays : SHORT_RETENTION_DAYS) * 24 * 60 * 60 * 1000).toISOString(),
      privacyConsent: consent,
      sanitized: message.sanitized || false,
    }
    list.push(record)
    this.messages.set(userId, list)
    return record
  }

  deleteUserHistory(userId, context = {}) {
    const count = (this.messages.get(userId) || []).length
    this.messages.delete(userId)
    logAudit({
      userId,
      action: 'privacy_chat_history_deleted',
      ip: context.ip || 'unknown',
      details: `deleted ${count} messages`,
      success: true,
    })
    return { deleted: count }
  }

  cleanupExpired() {
    const now = Date.now()
    let removed = 0
    for (const [userId, list] of this.messages.entries()) {
      const kept = list.filter(m => {
        const retention = m.privacyConsent ? this.retentionDays : SHORT_RETENTION_DAYS
        const expired = now - new Date(m.createdAt).getTime() > retention * 24 * 60 * 60 * 1000
        if (expired) removed++
        return !expired
      })
      if (kept.length === 0) {
        this.messages.delete(userId)
      } else {
        this.messages.set(userId, kept)
      }
    }
    this.lastCleanup = now
    if (removed > 0) {
      logAudit({
        userId: 'system',
        action: 'privacy_retention_cleanup',
        ip: '127.0.0.1',
        details: `removed ${removed} expired messages`,
        success: true,
      })
    }
    return { removed }
  }

  getStats() {
    let total = 0
    let expired = 0
    const now = Date.now()
    for (const list of this.messages.values()) {
      total += list.length
      for (const m of list) {
        const retention = m.privacyConsent ? this.retentionDays : SHORT_RETENTION_DAYS
        if (now - new Date(m.createdAt).getTime() > retention * 24 * 60 * 60 * 1000) expired++
      }
    }
    return { totalMessages: total, expiredMessages: expired, retentionDays: this.retentionDays }
  }
}

export const chatRetention = new ChatRetention()

/**
 * 异步归档 AI 聊天交互记录
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.sessionId
 * @param {Array} params.messages
 * @param {string} params.response
 * @param {object} params.metadata
 */
export async function logChatInteraction({ userId, sessionId, messages, response, metadata = {} }) {
  if (!userId) return

  const records = []
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (m && typeof m.content === 'string') {
        records.push(chatRetention.addMessage(userId, { role: m.role || 'user', content: m.content }, true))
      }
    }
  }
  if (typeof response === 'string' && response.length > 0) {
    records.push(chatRetention.addMessage(userId, { role: 'assistant', content: response }, true))
  }

  logAudit({
    userId,
    action: 'ai_chat_archived',
    ip: metadata.ip || 'unknown',
    details: JSON.stringify({
      sessionId,
      messageCount: records.length,
      endpoint: metadata.endpoint,
      model: metadata.model,
    }),
    success: true,
  })
}
