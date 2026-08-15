import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { readEncryptedFile, writeEncryptedFile } from '../privacy/fileVault.js'
import { getClientIP } from '../core/auditLogger.js'
import { protectText } from '../privacy/adminPrivacyVault.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APPEALS_FILE = path.join(__dirname, '..', 'data', 'account-appeals.json')

const APPEAL_STATUS = Object.freeze({
  PENDING: 'pending',
  REVIEWING: 'reviewing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
})

const appeals = new Map()
let saveTimer = null

async function loadAppeals() {
  try {
    const data = await readEncryptedFile(APPEALS_FILE)
    if (data) {
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        parsed.forEach(item => appeals.set(item.id, item))
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[AccountAppeal] 加载申诉数据失败:', err.message)
    }
  }
}

async function saveAppeals() {
  try {
    const data = JSON.stringify(Array.from(appeals.values()), null, 2)
    await writeEncryptedFile(APPEALS_FILE, data)
  } catch (err) {
    console.warn('[AccountAppeal] 保存申诉数据失败:', err.message)
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveAppeals().catch(() => {}), 1000)
}

/**
 * 检查用户是否可以提交新申诉（冷却期 7 天）
 */
export function canSubmitAppeal(userId) {
  const now = Date.now()
  const cooldownMs = 7 * 24 * 60 * 60 * 1000
  for (const appeal of appeals.values()) {
    if (appeal.userId === userId && appeal.createdAt && now - appeal.createdAt < cooldownMs) {
      return false
    }
  }
  return true
}

/**
 * 提交申诉
 */
export function submitAppeal(userId, { contactEmail, reason, evidence = '' }) {
  if (!canSubmitAppeal(userId)) {
    throw new Error('申诉过于频繁，请 7 天后再试')
  }

  if (!reason || String(reason).trim().length < 20) {
    throw new Error('申诉说明至少需要 20 个字符')
  }

  const id = 'appeal-' + crypto.randomUUID()
  const now = Date.now()
  const appeal = {
    id,
    userId,
    contactEmail: String(contactEmail || '').trim().slice(0, 120),
    reason: String(reason).trim().slice(0, 2000),
    evidence: String(evidence).trim().slice(0, 5000),
    status: APPEAL_STATUS.PENDING,
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    reviewAction: null,
  }

  appeals.set(id, appeal)
  scheduleSave()
  return appeal
}

/**
 * 获取用户的申诉列表
 */
export function getAppealsByUser(userId) {
  return Array.from(appeals.values())
    .filter(a => a.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(a => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      reviewedAt: a.reviewedAt,
      reviewNote: a.reviewNote,
      reviewAction: a.reviewAction,
    }))
}

/**
 * 获取单个申诉（包含敏感详情）
 */
export function getAppealById(appealId) {
  return appeals.get(appealId) || null
}

/**
 * 获取所有申诉（管理员用）
 */
export function getAllAppeals({ status, page = 1, limit = 50 } = {}) {
  let list = Array.from(appeals.values())
  if (status && Object.values(APPEAL_STATUS).includes(status)) {
    list = list.filter(a => a.status === status)
  }
  list.sort((a, b) => b.createdAt - a.createdAt)
  const total = list.length
  const start = (page - 1) * limit
  return {
    total,
    page,
    limit,
    data: list.slice(start, start + limit),
  }
}

/**
 * 管理员审核申诉
 */
export function reviewAppeal(appealId, { decision, reviewNote, reviewedBy }) {
  const appeal = appeals.get(appealId)
  if (!appeal) {
    throw new Error('申诉不存在')
  }
  if (![APPEAL_STATUS.APPROVED, APPEAL_STATUS.REJECTED, APPEAL_STATUS.REVIEWING].includes(decision)) {
    throw new Error('无效的审核决定')
  }

  const now = Date.now()
  appeal.status = decision
  appeal.reviewedAt = now
  appeal.reviewedBy = reviewedBy
  appeal.reviewNote = String(reviewNote || '').trim().slice(0, 1000)
  appeal.reviewAction = decision
  appeal.updatedAt = now
  scheduleSave()
  return appeal
}

export { APPEAL_STATUS }

// 启动时加载
loadAppeals().catch(() => {})

// 进程退出前保存
process.on('SIGINT', () => saveAppeals().catch(() => {}))
process.on('SIGTERM', () => saveAppeals().catch(() => {}))
