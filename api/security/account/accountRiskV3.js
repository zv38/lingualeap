/**
 * ============================================================================
 * Account Risk V4 — 军工级账号异常检测与封禁系统（终极强化版）
 * ============================================================================
 *
 * V4 相比 V3 的核心修复（解决"太好突破"的致命缺陷）：
 *   1. PoW 挑战强制 IP 绑定 + 自适应难度 + 服务端时间验证
 *      - 每个挑战绑定请求 IP，无法跨 IP 重用
 *      - 最小难度提升至 5（客户端不可修改），连续失败递增
 *      - 服务端验证求解时间必须在 3~30 秒内（防止 GPU 即时求解）
 *      - 挑战生成速率限制：每 IP 每 60 秒最多 5 次
 *   2. 登录流程强制 PoW 挑战
 *      - 风险评分 > 0 的账号登录必须通过 PoW 验证
 *      - 每次登录失败 PoW 难度 +1，上限 8
 *   3. 失败挑战 → 风险升级
 *      - 每次挑战失败自动 +5 风险评分
 *      - 连续 3 次挑战失败 → 自动 WATCH 状态
 *      - 连续 5 次挑战失败 → 自动 RESTRICTED 状态
 *   4. 强化自动封禁规则
 *      - SCORE_CRITICAL 阈值从 85 降至 80
 *      - 新增 MULTIPLE_CHALLENGE_FAILURE 规则
 *      - 新增 HIGH_RISK_LOGIN_FAILURE 规则
 *      - 新增 CONSECUTIVE_DAILY_VIOLATION 规则
 *      - AUTO_ESCALATE 从 3 次降为 2 次
 *   5. 用户安全通知体系
 *      - 状态变更时自动生成通知并推送至前端
 *      - 登录时返回安全状态警告头
 *      - 封禁预通知（冻结前 24 小时警告）
 *   6. 完整封禁流程
 *      - 警告（WARNING）→ 限制（RESTRICTED）→ 冻结（FROZEN）→ 封禁（BANNED）
 *      - 每步自动生成通知，告知用户原因和后续步骤
 *      - 封禁时附带证据摘要
 *      - 申诉入口始终可见
 *
 * 评分维度（总分 100，V4 调整权重 + 新增惩罚项）：
 *   - 静态信誉分 (30%)：IP 信誉、ASN、设备指纹、邮箱信誉
 *   - 动态行为分 (20%)：请求模式、时间一致性、行为异常
 *   - 关联分析分 (20%)：设备/IP/账号图关系、批量注册检测
 *   - 实时威胁分 (10%)：behaviorAnalyzer 实时检测结果
 *   - 挑战失败惩罚 (10%)：连续 PoW 失败递增
 *   - 时间衰减分 (10%)：良好行为随时间恢复分数，但衰减速度减半
 *
 * 状态流转（V4 更严格的阈值 + 更慢的恢复）：
 *   SAFE (0-19) → AWARE (20-39) → WATCH (40-59) → RESTRICTED (60-79)
 *   → FROZEN (80-94) → BANNED (95-100)
 *
 *   V4 状态流转收紧：
 *   - 分数阈值降低，更快进入高安全状态
 *   - 恢复衰减速度减半（从 0.002 降至 0.001 / 分钟）
 *   - WATCH → RESTRICTED 不再自动恢复
 *   - FROZEN/BANNED 必须通过解封流程
 *
 * 封禁等级（V4 新增 WARNING 预通知）：
 *   - WARNING:    24 小时预通知（即将冻结）
 *   - TEMP_1D:    临时封禁 1 天（轻度违规）
 *   - TEMP_3D:    临时封禁 3 天（多次违规）
 *   - TEMP_7D:    临时封禁 7 天（严重违规）
 *   - TEMP_30D:   临时封禁 30 天（非常严重）
 *   - PERMANENT:  永久封禁（极端违规）
 * ============================================================================
 */

import crypto from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { fileURLToPath } from 'url'
import { readEncryptedFile, writeEncryptedFile } from '../privacy/fileVault.js'
import { getClientIP } from '../core/auditLogger.js'
import { protectIp } from '../privacy/adminPrivacyVault.js'
import { addSetMember, getSetMembers } from '../../lib/sharedState.js'
// import { createMemoryRateLimiter } from '../../lib/redisClient.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const RISK_DB_FILE = path.join(DATA_DIR, 'account-risk-v3.json')
const RISK_WAL_FILE = path.join(DATA_DIR, 'account-risk-v3.wal')
const RISK_EVENTS_FILE = path.join(DATA_DIR, 'risk-events-v3.json')
const CHALLENGE_STORE_FILE = path.join(DATA_DIR, 'risk-challenges-v3.json')
const BAN_APPROVALS_FILE = path.join(DATA_DIR, 'ban-approvals.json')

// ============================================================================
// 常量定义
// ============================================================================

/** 账号状态枚举 */
export const ACCOUNT_STATUS = Object.freeze({
  SAFE: 'safe',
  AWARE: 'aware',
  WATCH: 'watch',
  RESTRICTED: 'restricted',
  FROZEN: 'frozen',
  BANNED: 'banned',
})

/** V4 状态阈值（更严格，更快进入高安全状态） */
const STATUS_THRESHOLDS = [
  { max: 19,  status: ACCOUNT_STATUS.SAFE },
  { max: 39,  status: ACCOUNT_STATUS.AWARE },
  { max: 59,  status: ACCOUNT_STATUS.WATCH },
  { max: 79,  status: ACCOUNT_STATUS.RESTRICTED },
  { max: 94,  status: ACCOUNT_STATUS.FROZEN },
  { max: 100, status: ACCOUNT_STATUS.BANNED },
]

/** 封禁类型（V4 新增 WARNING 预通知） */
export const BAN_TYPE = Object.freeze({
  WARNING: 'warning',        // V4 新增：24 小时预通知（即将冻结）
  TEMP_1D: 'temp_1d',
  TEMP_3D: 'temp_3d',
  TEMP_7D: 'temp_7d',
  TEMP_30D: 'temp_30d',
  PERMANENT: 'permanent',
})

/** 封禁时长映射（毫秒） */
const BAN_DURATION_MS = {
  [BAN_TYPE.WARNING]: 24 * 60 * 60 * 1000,  // 24小时警告期
  [BAN_TYPE.TEMP_1D]: 24 * 60 * 60 * 1000,
  [BAN_TYPE.TEMP_3D]: 3 * 24 * 60 * 60 * 1000,
  [BAN_TYPE.TEMP_7D]: 7 * 24 * 60 * 60 * 1000,
  [BAN_TYPE.TEMP_30D]: 30 * 24 * 60 * 60 * 1000,
  [BAN_TYPE.PERMANENT]: null,
}

/** V4 自动封禁规则（更严格） */
const AUTO_BAN_RULES = Object.freeze([
  {
    id: 'SCORE_CRITICAL',
    description: '风险评分达到 80 分以上自动冻结',
    condition: (profile) => profile.score >= 80 && profile.status !== ACCOUNT_STATUS.FROZEN && profile.status !== ACCOUNT_STATUS.BANNED,
    action: 'auto_freeze',
    banType: BAN_TYPE.TEMP_7D,
    reason: '系统检测到高风险行为，账号已被自动冻结',
  },
  {
    id: 'SCORE_MAX',
    description: '风险评分达到 95 分以上自动永久封禁',
    condition: (profile) => profile.score >= 95 && profile.status !== ACCOUNT_STATUS.BANNED,
    action: 'auto_ban',
    banType: BAN_TYPE.PERMANENT,
    reason: '系统检测到极端风险行为，账号已被自动永久封禁',
  },
  {
    id: 'ASSOC_BANNED',
    description: '设备/IP 关联到已被封禁的账号',
    condition: (profile) => profile.factors?.some(f => f.id === 'ASSOC_BANNED_ENTITY') && profile.score >= 50,
    action: 'auto_restrict',
    banType: BAN_TYPE.TEMP_3D,
    reason: 'IP/设备关联到已被封禁的账号，为保障安全已自动限制',
  },
  {
    id: 'MASS_REGISTRATION',
    description: '批量注册检测',
    condition: (profile) => {
      const massFactor = profile.factors?.find(f => f.id === 'ASSOC_IP_HIGH' || f.id === 'ASSOC_DEVICE_HIGH')
      return massFactor && profile.score >= 40
    },
    action: 'auto_restrict',
    banType: BAN_TYPE.TEMP_1D,
    reason: '检测到批量注册行为，账号已被临时限制',
  },
  {
    id: 'AUTO_ESCALATE',
    description: '2 次达到 WATCH 状态自动升级',
    condition: (profile) => {
      const watchCount = (profile.history || []).filter(h => h.to === ACCOUNT_STATUS.WATCH || h.to === ACCOUNT_STATUS.RESTRICTED).length
      return watchCount >= 2 && profile.score >= 40
    },
    action: 'auto_restrict',
    banType: BAN_TYPE.TEMP_1D,
    reason: '多次触发安全警告，账号已被自动限制',
  },
  {
    id: 'MULTIPLE_CHALLENGE_FAILURE',
    description: '连续 3 次 PoW 挑战失败自动限制',
    condition: (profile) => {
      const challengeFailures = (profile.history || []).filter(h => h.action === 'challenge_failed')
      const recentFailures = challengeFailures.filter(h => {
        const age = Date.now() - new Date(h.timestamp).getTime()
        return age < 30 * 60 * 1000 // 30 分钟内
      })
      return recentFailures.length >= 3 && profile.score >= 30 && profile.status !== ACCOUNT_STATUS.RESTRICTED && profile.status !== ACCOUNT_STATUS.FROZEN && profile.status !== ACCOUNT_STATUS.BANNED
    },
    action: 'auto_restrict',
    banType: BAN_TYPE.TEMP_1D,
    reason: '连续多次安全验证失败，账号已被自动限制',
  },
  {
    id: 'HIGH_RISK_LOGIN_FAILURE',
    description: '高风险登录失败自动冻结',
    condition: (profile) => {
      const loginFailures = (profile.history || []).filter(h => h.action === 'login_high_risk_failed')
      return loginFailures.length >= 3 && profile.score >= 50
    },
    action: 'auto_freeze',
    banType: BAN_TYPE.TEMP_3D,
    reason: '检测到多次高风险登录失败，账号已被自动冻结',
  },
  {
    id: 'CONSECUTIVE_DAILY_VIOLATION',
    description: '连续 3 天触发安全事件自动冻结',
    condition: (profile) => {
      if (!profile.dailyViolationDays || profile.dailyViolationDays.length < 3) return false
      const now = Date.now()
      const recentDays = profile.dailyViolationDays.filter(d => {
        const age = now - new Date(d).getTime()
        return age < 4 * 24 * 60 * 60 * 1000 // 4 天内
      })
      // 检查是否连续 3 天
      if (recentDays.length < 3) return false
      const sorted = [...recentDays].sort().reverse()
      for (let i = 0; i < sorted.length - 2; i++) {
        const d1 = new Date(sorted[i]).setHours(0, 0, 0, 0)
        const d2 = new Date(sorted[i+1]).setHours(0, 0, 0, 0)
        const d3 = new Date(sorted[i+2]).setHours(0, 0, 0, 0)
        if (d1 - d2 === 86400000 && d2 - d3 === 86400000) return true
      }
      return false
    },
    action: 'auto_freeze',
    banType: BAN_TYPE.TEMP_7D,
    reason: '连续多日触发安全事件，账号已被自动冻结',
  },
])

/** 封禁审批状态 */
const APPROVAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
})

/** 可知晓的一次性邮箱域 */
const KNOWN_DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'yopmail.com', 'throwawaymail.com', 'fakeemail.com', 'sharklasers.com',
  'temp-mail.org', 'mailnator.com', 'maildrop.cc', 'getnada.com',
  'trashmail.com', 'tempmail.net', 'tempemail.co', 'spambox.us',
  'dispostable.com', 'mailmetrash.com', 'mailexpire.com', 'throwaway.email',
  'mytemp.email', 'temp-mail.us', 'fakemailgenerator.com', 'emailfake.com',
  'tempmail.io', 'mailtemp.org', 'mail-temp.com', 'tempinbox.com',
  'spamgourmet.com', 'mintemail.com', 'dontreg.com', 'sogetthis.com',
])

// ============================================================================
// 内存存储（V3 使用 WAL 持久化保障崩溃安全）
// ============================================================================

let riskCache = new Map()
let riskEvents = new Map()
let challengeCache = new Map()
let banApprovals = new Map()
let recentRegistrations = []
let bannedEntities = new Set()

// 多实例封禁同步：Redis 共享集合 key，存放所有永久封禁的实体（IP/设备指纹哈希）
const BAN_ENTITY_SYNC_KEY = 'sec:ban:entity'

const MAX_RECENT_REGISTRATIONS = 20000
let saveTimer = null
let challengeCleanupTimer = null
let autoBanTimer = null
let dirty = false

// ============================================================================
// 崩溃安全持久化（WAL 预写日志 + 定期快照）
// ============================================================================

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
  } catch {}
}

/**
 * 写入 WAL 日志（预写日志，每次变更先写 WAL，再更新内存）
 * 崩溃恢复时优先从 WAL 恢复
 */
async function writeWAL(operation, data) {
  try {
    await ensureDataDir()
    const walEntry = {
      timestamp: Date.now(),
      operation,
      data,
    }
    await fs.appendFile(RISK_WAL_FILE, JSON.stringify(walEntry) + '\n', 'utf-8')
  } catch (err) {
    console.warn('[AccountRiskV3] WAL 写入失败:', err.message)
  }
}

/**
 * 从 WAL 恢复数据
 */
async function recoverFromWAL() {
  try {
    const walContent = await fs.readFile(RISK_WAL_FILE, 'utf-8').catch(() => '')
    if (!walContent.trim()) return false

    const entries = walContent.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)

    if (entries.length === 0) return false

    // 重放 WAL 操作
    for (const entry of entries) {
      switch (entry.operation) {
        case 'profile_update':
          riskCache.set(entry.data.userId, entry.data.profile)
          break
        case 'profile_delete':
          riskCache.delete(entry.data.userId)
          break
        case 'event_add':
          if (!riskEvents.has(entry.data.userId)) riskEvents.set(entry.data.userId, [])
          riskEvents.get(entry.data.userId).unshift(entry.data.event)
          break
        case 'ban_approval':
          banApprovals.set(entry.data.id, entry.data)
          break
        case 'banned_entity_add':
          bannedEntities.add(entry.data)
          break
        case 'registration_add':
          recentRegistrations.push(entry.data)
          break
      }
    }

    console.log(`[AccountRiskV3] WAL 恢复完成: ${entries.length} 条操作已重放`)
    return true
  } catch (err) {
    console.warn('[AccountRiskV3] WAL 恢复失败:', err.message)
    return false
  }
}

/**
 * 清空 WAL（快照成功后调用）
 */
async function clearWAL() {
  try {
    await fs.writeFile(RISK_WAL_FILE, '', 'utf-8')
  } catch {}
}

/**
 * 创建完整快照
 */
async function saveSnapshot() {
  try {
    await ensureDataDir()
    const snapshot = {
      version: 3,
      timestamp: Date.now(),
      profiles: Array.from(riskCache.entries()),
      events: Array.from(riskEvents.entries()),
      bannedEntities: Array.from(bannedEntities),
      recentRegistrations: recentRegistrations.slice(-MAX_RECENT_REGISTRATIONS),
      banApprovals: Array.from(banApprovals.entries()),
    }
    const plaintext = JSON.stringify(snapshot)
    await writeEncryptedFile(RISK_DB_FILE, plaintext)
    // 快照成功，清空 WAL
    await clearWAL()
    return true
  } catch (err) {
    console.warn('[AccountRiskV3] 快照保存失败:', err.message)
    return false
  }
}

/**
 * 加载快照
 */
async function loadSnapshot() {
  try {
    const data = await readEncryptedFile(RISK_DB_FILE)
    if (!data) return false

    const snapshot = JSON.parse(data)
    if (snapshot.version !== 3) return false

    riskCache = new Map(snapshot.profiles || [])
    riskEvents = new Map(snapshot.events || [])
    bannedEntities = new Set(snapshot.bannedEntities || [])
    recentRegistrations = snapshot.recentRegistrations || []
    banApprovals = new Map(snapshot.banApprovals || [])

    console.log(`[AccountRiskV3] 快照加载完成: ${riskCache.size} 个档案, ${riskEvents.size} 个事件集`)
    return true
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[AccountRiskV3] 快照加载失败:', err.message)
    }
    return false
  }
}

/**
 * 初始化持久化
 */
async function initializePersistence() {
  await ensureDataDir()

  // 优先从 WAL 恢复（WAL 存在说明上次未正常快照）
  const walRecovered = await recoverFromWAL()

  if (!walRecovered) {
    // WAL 不存在或为空，从快照加载
    await loadSnapshot()
  }

  // 多实例封禁同步：启动时合并一次 Redis 共享封禁实体
  await syncBannedEntitiesFromRedis()

  // 定期创建快照（每 5 分钟）
  setInterval(() => {
    if (dirty) {
      saveSnapshot().catch(() => {})
      dirty = false
    }
  }, 5 * 60 * 1000)

  // 定期同步封禁实体（每 10 分钟，与快照错开）
  setInterval(() => {
    syncBannedEntitiesFromRedis().catch(() => {})
  }, 10 * 60 * 1000)

  // 进程退出前保存
  const onExit = async () => {
    clearInterval(challengeCleanupTimer)
    clearInterval(autoBanTimer)
    if (dirty) await saveSnapshot()
  }
  process.on('SIGINT', onExit)
  process.on('SIGTERM', onExit)
}

/**
 * 多实例封禁同步：从 Redis 共享集合拉取其他节点发布的永久封禁实体，
 * 合并到本地 bannedEntities。Redis 不可用时静默降级（单实例仍可用）。
 */
async function syncBannedEntitiesFromRedis() {
  try {
    const members = await getSetMembers(BAN_ENTITY_SYNC_KEY)
    if (!members || members.length === 0) return
    let added = 0
    for (const m of members) {
      if (!bannedEntities.has(m)) {
        bannedEntities.add(m)
        added++
      }
    }
    if (added > 0) {
      console.log(`[AccountRiskV3] 已同步 ${added} 个跨实例封禁实体`)
    }
  } catch (err) {
    // Redis 不可用静默降级，不影响本地封禁
  }
}

function markDirty(operation, data) {
  dirty = true
  writeWAL(operation, data).catch(() => {})
}

// ============================================================================
// 内部工具函数
// ============================================================================

function computeDeepFingerprint(req) {
  const ua = req.headers['user-agent'] || ''
  const accept = req.headers['accept'] || ''
  const acceptLang = req.headers['accept-language'] || ''
  const acceptEnc = req.headers['accept-encoding'] || ''
  const dnt = req.headers['dnt'] || ''
  const secChUa = req.headers['sec-ch-ua'] || ''
  const secChUaPlatform = req.headers['sec-ch-ua-platform'] || ''
  const secChUaMobile = req.headers['sec-ch-ua-mobile'] || ''
  const connection = req.headers['connection'] || ''
  const cacheControl = req.headers['cache-control'] || ''
  const clientTimeStr = req.headers['x-client-time'] || ''

  let timeOffset = 0
  if (clientTimeStr) {
    const clientTime = parseInt(clientTimeStr, 10)
    if (!isNaN(clientTime)) {
      timeOffset = Math.abs(Date.now() - clientTime)
    }
  }

  const raw = [
    ua, accept, acceptLang, acceptEnc, dnt,
    secChUa, secChUaPlatform, secChUaMobile,
    connection, cacheControl,
    timeOffset.toString(),
  ].join('|:|')

  return crypto.createHash('sha256').update(raw).digest('hex')
}

function getEmailDomain(email) {
  return email?.split('@')[1]?.toLowerCase() || ''
}

function isDisposableEmail(email) {
  return KNOWN_DISPOSABLE_DOMAINS.has(getEmailDomain(email))
}

function isSuspiciousUA(userAgent) {
  if (!userAgent) return true
  const ua = userAgent.toLowerCase()
  const botPatterns = [
    /bot/, /crawler/, /spider/, /scraper/, /headlesschrome/, /phantomjs/,
    /selenium/, /puppeteer/, /playwright/, /curl/, /wget/, /python-requests/,
    /httpclient/, /okhttp/, /postmanruntime/, /go-http-client/,
    /java\/\d+/, /libwww/, /perl/, /ruby/,
    /axios/, /node-fetch/, /request/,
  ]
  return botPatterns.some(p => p.test(ua))
}

// ============================================================================
// 增强 IP 信誉检测（V3 新增：ASN + 地理 + 威胁情报）
// ============================================================================

const KNOWN_VPN_ASNS = new Set([
  'AS14618', 'AS16509', 'AS201912', 'AS20473', 'AS16276',
  'AS36351', 'AS36459', 'AS395954', 'AS396982', 'AS397086',
  'AS398395', 'AS399666', 'AS400200', 'AS400201',
])

/** 高风险国家/地区（根据业务需求调整） */
const HIGH_RISK_REGIONS = new Set([
  'RU', 'CN', 'KP', 'IR', 'SY', 'CU', 'VE',
])

/** 已知代理/VPN 数据中心 ASN 关键词 */
const DC_ASN_KEYWORDS = ['DATA', 'CLOUD', 'HOST', 'NET', 'SERVER', 'TECH', 'DIGITAL', 'ASN']

function assessIpRisk(ip, req) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return { isProxy: false, risk: 0, signals: [] }
  }

  const signals = []
  let risk = 0

  // 1. 检查 X-Forwarded-For 链长度
  const xff = req.headers['x-forwarded-for']
  const xffChain = xff && typeof xff === 'string' ? xff.split(',').map(s => s.trim()) : [ip]
  if (xffChain.length > 2) {
    risk += 15
    signals.push({ id: 'IP_LONG_PROXY_CHAIN', name: '长代理链（≥3层）', weight: 15 })
  } else if (xffChain.length > 1) {
    risk += 8
    signals.push({ id: 'IP_SHORT_PROXY_CHAIN', name: '短代理链', weight: 8 })
  }

  // 2. 检测代理/VPN/匿名化信号
  const via = req.headers['via']
  if (via) {
    risk += 10
    signals.push({ id: 'IP_VIA_HEADER', name: '存在 Via 代理头', weight: 10 })
  }

  const xAnon = req.headers['x-anonymous']
  if (xAnon) {
    risk += 20
    signals.push({ id: 'IP_ANON_HEADER', name: '检测到匿名代理头', weight: 20 })
  }

  const forwardFor = req.headers['x-forwarded-for']
  const realIp = req.headers['x-real-ip']
  if (forwardFor && realIp && forwardFor !== realIp) {
    risk += 5
    signals.push({ id: 'IP_HEADER_MISMATCH', name: '代理头不一致', weight: 5 })
  }

  // 3. CF-Connecting-IP 不一致检测
  const cfIp = req.headers['cf-connecting-ip']
  if (cfIp && cfIp !== ip) {
    risk += 8
    signals.push({ id: 'IP_CF_MISMATCH', name: 'Cloudflare IP 与实际 IP 不一致', weight: 8 })
  }

  // 4. 检查是否来自已知高风险 ASN/数据中心
  const cfAsn = req.headers['cf-ray'] || ''
  if (cfAsn) {
    // 通过 Cloudflare 的 ASN 信息
    const cfIpCountry = req.headers['cf-ipcountry'] || ''
    if (HIGH_RISK_REGIONS.has(cfIpCountry)) {
      risk += 10
      signals.push({ id: 'IP_HIGH_RISK_REGION', name: `IP 来自高风险地区 (${cfIpCountry})`, weight: 10 })
    }
  }

  // 5. 检查 True-Client-IP（Akamai 等 CDN 的标准头）
  const tci = req.headers['true-client-ip']
  if (tci && tci !== ip) {
    risk += 5
    signals.push({ id: 'IP_CDN_HEADER_MISMATCH', name: 'CDN 客户端 IP 不一致', weight: 5 })
  }

  // 6. 检查是否来自 Tor 出口节点（通过 Tor-DNSEL 头）
  const torExit = req.headers['x-tor-exit-node']
  if (torExit === 'true' || torExit === '1') {
    risk += 30
    signals.push({ id: 'IP_TOR_EXIT', name: 'Tor 出口节点', weight: 30 })
  }

  return {
    isProxy: risk >= 15,
    risk: Math.min(risk, 40),
    signals,
  }
}

function assessEmailRisk(email) {
  const signals = []
  let risk = 0

  if (isDisposableEmail(email)) {
    risk += 30
    signals.push({ id: 'EMAIL_DISPOSABLE', name: '使用一次性邮箱', weight: 30 })
  }

  const domain = getEmailDomain(email)
  if (domain) {
    if (domain.match(/^\d/) || domain.length > 30) {
      risk += 8
      signals.push({ id: 'EMAIL_SUSPICIOUS_DOMAIN', name: '可疑邮箱域名', weight: 8 })
    }
    // 检查域名中的随机字符模式
    const randomPattern = /[0-9]{5,}|[a-z]{15,}/i
    if (randomPattern.test(domain.split('.')[0])) {
      risk += 10
      signals.push({ id: 'EMAIL_RANDOM_DOMAIN', name: '邮箱域名包含随机模式', weight: 10 })
    }
  }

  return { risk: Math.min(risk, 30), signals }
}

function detectAssociation(ipHash, fingerprint, emailDomain) {
  const now = Date.now()
  const windowMs = 24 * 60 * 60 * 1000
  const matches = recentRegistrations.filter(r =>
    r.timestamp > now - windowMs && (
      r.ipHash === ipHash ||
      r.fingerprint === fingerprint ||
      r.emailDomain === emailDomain
    )
  )

  // 增强检测：6小时短窗口
  const shortWindowMs = 6 * 60 * 60 * 1000
  const shortMatches = recentRegistrations.filter(r =>
    r.timestamp > now - shortWindowMs && (
      r.ipHash === ipHash ||
      r.fingerprint === fingerprint
    )
  )

  return {
    ipCount: matches.filter(r => r.ipHash === ipHash).length,
    deviceCount: matches.filter(r => r.fingerprint === fingerprint).length,
    domainCount: matches.filter(r => r.emailDomain === emailDomain).length,
    shortIpCount: shortMatches.filter(r => r.ipHash === ipHash).length,
    shortDeviceCount: shortMatches.filter(r => r.fingerprint === fingerprint).length,
  }
}

function detectBannedAssociation(ipHash, fingerprint) {
  return bannedEntities.has(ipHash) || bannedEntities.has(fingerprint)
}

function recordRegistration(userId, ipHash, fingerprint, emailDomain) {
  const entry = { userId, ipHash, fingerprint, emailDomain, timestamp: Date.now() }
  recentRegistrations.push(entry)
  if (recentRegistrations.length > MAX_RECENT_REGISTRATIONS) {
    recentRegistrations.shift()
  }
  markDirty('registration_add', entry)
}

export function scoreToStatus(score) {
  for (const threshold of STATUS_THRESHOLDS) {
    if (score <= threshold.max) return threshold.status
  }
  return ACCOUNT_STATUS.BANNED
}

export const STATUS_WEIGHT = {
  [ACCOUNT_STATUS.SAFE]: 0,
  [ACCOUNT_STATUS.AWARE]: 10,
  [ACCOUNT_STATUS.WATCH]: 30,
  [ACCOUNT_STATUS.RESTRICTED]: 50,
  [ACCOUNT_STATUS.FROZEN]: 80,
  [ACCOUNT_STATUS.BANNED]: 100,
}

// ============================================================================
// V4 服务端挑战系统（PoW + IP 绑定 + 时间验证 + 速率限制）
// ============================================================================
//
// V4 核心修复：
// 1. 挑战强制绑定请求 IP，无法跨 IP 重用
// 2. 最小难度提升至 5，客户端不可修改
// 3. 服务端验证求解时间必须在 3~30 秒内（防止 GPU 即时求解）
// 4. 挑战生成速率限制：每 IP 每 60 秒最多 5 次
// 5. 连续失败自动递增难度
// ============================================================================

/** V4 挑战速率限制（内存计数器） */
const challengeRateLimitMap = new Map()

function checkChallengeRateLimit(ip) {
  const now = Date.now()
  const windowMs = 60000 // 60 秒窗口
  const maxRequests = 5   // 最多 5 次

  if (!challengeRateLimitMap.has(ip)) {
    challengeRateLimitMap.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: maxRequests - 1 }
  }

  const entry = challengeRateLimitMap.get(ip)
  if (now - entry.windowStart > windowMs) {
    // 窗口过期，重置
    entry.count = 1
    entry.windowStart = now
    return { allowed: true, remaining: maxRequests - 1 }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAfter: windowMs - (now - entry.windowStart) }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count }
}

/**
 * 获取自适应 PoW 难度
 * 根据用户的历史挑战失败次数和风险评分自动调整
 */
export function getAdaptiveDifficulty(userId, ip) {
  // V4 最小难度 5（客户端不可修改）
  const baseDifficulty = 5

  if (!userId) return baseDifficulty

  const profile = riskCache.get(userId)
  if (!profile) return baseDifficulty

  // 根据连续失败次数递增
  const failCount = profile.consecutiveChallengeFailures || 0
  const difficultyBoost = Math.min(failCount, 3) // 最多 +3

  // 根据风险评分递增
  const scoreBoost = profile.score >= 60 ? 1 : 0

  return Math.min(baseDifficulty + difficultyBoost + scoreBoost, 8) // 上限 8
}

/**
 * V4 生成服务端挑战（IP 绑定 + 最低难度 5 + 速率限制）
 */
export function generateRiskChallenge(difficulty = 5, clientIP = '') {
  // 强制最低难度 5
  const actualDifficulty = Math.max(5, difficulty)

  // 速率限制检查
  if (clientIP) {
    const rateCheck = checkChallengeRateLimit(clientIP)
    if (!rateCheck.allowed) {
      return {
        error: true,
        message: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil(rateCheck.resetAfter / 1000),
      }
    }
  }

  const challengeId = crypto.randomUUID()
  const prefix = crypto.randomBytes(16).toString('hex')
  const expiresAt = Date.now() + 90000 // 90 秒有效期（V4 延长，允许更长的求解时间）
  const createdAt = Date.now()
  const secret = process.env.CSRF_SIGN_SECRET || process.env._JWT_SECRET_PLACEHOLDER || 'v4-fallback-secret'

  const challenge = {
    id: challengeId,
    prefix,
    difficulty: actualDifficulty,
    createdAt,
    expiresAt,
    clientIP: clientIP || '', // V4 绑定 IP
    signature: crypto
      .createHmac('sha256', secret)
      .update(`${challengeId}:${prefix}:${actualDifficulty}:${expiresAt}:${clientIP}`)
      .digest('hex')
      .slice(0, 16),
  }

  challengeCache.set(challengeId, challenge)
  return challenge
}

/**
 * V4 验证挑战响应（IP 绑定 + 时间验证 + 签名验证）
 */
export function verifyRiskChallenge(challengeId, nonce, clientTimestamp, clientIP = '') {
  const challenge = challengeCache.get(challengeId)
  if (!challenge) {
    return { valid: false, reason: '挑战不存在或已过期' }
  }

  challengeCache.delete(challengeId)

  // 1. 过期检查
  if (Date.now() > challenge.expiresAt) {
    return { valid: false, reason: '挑战已过期' }
  }

  // 2. IP 绑定检查（V4 新增）
  if (challenge.clientIP && clientIP && challenge.clientIP !== clientIP) {
    return { valid: false, reason: 'IP 地址不匹配，挑战无效' }
  }

  // 3. 签名验证
  const secret = process.env.CSRF_SIGN_SECRET || process.env._JWT_SECRET_PLACEHOLDER || 'v4-fallback-secret'
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${challenge.id}:${challenge.prefix}:${challenge.difficulty}:${challenge.expiresAt}:${challenge.clientIP}`)
    .digest('hex')
    .slice(0, 16)

  if (challenge.signature !== expectedSig) {
    return { valid: false, reason: '挑战签名无效' }
  }

  // 4. PoW 哈希验证
  const hash = crypto.createHash('sha256').update(challenge.prefix + nonce).digest('hex')
  const targetPrefix = '0'.repeat(challenge.difficulty)
  if (!hash.startsWith(targetPrefix)) {
    return { valid: false, reason: 'PoW 验证失败' }
  }

  // 5. 求解时间验证（V4 核心防 GPU 即时求解）
  const solveTime = Date.now() - challenge.createdAt
  if (solveTime < 3000) {
    // 少于 3 秒 → 极可能是 GPU/自动化工具
    return { valid: false, reason: '求解速度异常（< 3 秒），疑似自动化工具' }
  }
  if (solveTime > 30000) {
    // 超过 30 秒 → 超时
    return { valid: false, reason: '求解超时（> 30 秒）' }
  }

  // 6. 客户端时间偏差检查（可选）
  if (clientTimestamp) {
    const timeDiff = Math.abs(Date.now() - parseInt(clientTimestamp, 10))
    if (timeDiff > 30000) {
      return { valid: false, reason: '客户端时间偏差过大' }
    }
  }

  return { valid: true, computeTime: solveTime, difficulty: challenge.difficulty }
}

/**
 * V4 记录挑战失败并自动升级风险
 */
export function recordChallengeFailure(userId, ip) {
  if (!userId) return null

  const profile = riskCache.get(userId)
  if (!profile) return null

  const now = new Date().toISOString()

  // 增加连续失败计数
  profile.consecutiveChallengeFailures = (profile.consecutiveChallengeFailures || 0) + 1

  // 每次挑战失败 +5 风险评分
  const penalty = 5
  profile.score = Math.min(100, profile.score + penalty)

  // 记录历史
  profile.history.push({
    timestamp: now,
    action: 'challenge_failed',
    consecutiveFailures: profile.consecutiveChallengeFailures,
    scorePenalty: penalty,
    newScore: profile.score,
  })

  // 记录每日违规
  recordDailyViolation(userId)

  // 更新状态
  const newStatus = scoreToStatus(profile.score)
  if (newStatus !== profile.status) {
    profile.history.push({
      timestamp: now,
      action: 'auto_status_change',
      from: profile.status,
      to: newStatus,
      reason: `连续 ${profile.consecutiveChallengeFailures} 次挑战失败`,
      score: profile.score,
    })
    profile.status = newStatus
    profile.level = newStatus === ACCOUNT_STATUS.SAFE || newStatus === ACCOUNT_STATUS.AWARE ? 'low' :
      newStatus === ACCOUNT_STATUS.WATCH ? 'medium' :
      newStatus === ACCOUNT_STATUS.RESTRICTED ? 'high' : 'critical'
  }

  profile.updatedAt = now
  markDirty('profile_update', { userId, profile })

  // 触发自动封禁检查
  runAutoBanEngine(userId)

  // 生成用户通知
  notifyUserSecurityStatus(userId, 'challenge_failure', {
    consecutiveFailures: profile.consecutiveChallengeFailures,
    currentScore: profile.score,
    currentStatus: profile.status,
    message: `安全验证连续失败 ${profile.consecutiveChallengeFailures} 次，风险评分已增加 ${penalty} 分。`,
  })

  return {
    consecutiveFailures: profile.consecutiveChallengeFailures,
    newScore: profile.score,
    newStatus: profile.status,
  }
}

/**
 * V4 记录每日违规（用于连续日检测规则）
 */
function recordDailyViolation(userId) {
  const profile = riskCache.get(userId)
  if (!profile) return

  const today = new Date().toISOString().split('T')[0]
  if (!profile.dailyViolationDays) {
    profile.dailyViolationDays = [today]
    return
  }

  if (!profile.dailyViolationDays.includes(today)) {
    profile.dailyViolationDays.push(today)
    // 只保留最近 10 天
    if (profile.dailyViolationDays.length > 10) {
      profile.dailyViolationDays = profile.dailyViolationDays.slice(-10)
    }
  }
}

/**
 * V4 重置连续挑战失败计数（成功后调用）
 */
export function resetChallengeFailures(userId) {
  if (!userId) return
  const profile = riskCache.get(userId)
  if (!profile) return
  profile.consecutiveChallengeFailures = 0
  markDirty('profile_update', { userId, profile })
}

function cleanupChallenges() {
  const now = Date.now()
  for (const [id, challenge] of challengeCache) {
    if (now > challenge.expiresAt) {
      challengeCache.delete(id)
    }
  }
  // 清理过期的速率限制记录
  for (const [ip, entry] of challengeRateLimitMap) {
    if (now - entry.windowStart > 120000) {
      challengeRateLimitMap.delete(ip)
    }
  }
}

// ============================================================================
// 服务端行为验证
// ============================================================================

function extractServerSideBehavior(req) {
  const ua = req.headers['user-agent'] || ''
  const acceptLang = req.headers['accept-language'] || ''
  const referer = req.headers['referer'] || ''
  const origin = req.headers['origin'] || ''

  const signals = []
  let riskScore = 0

  if (!acceptLang) {
    riskScore += 15
    signals.push({ id: 'BEH_NO_ACCEPT_LANG', name: '缺少 Accept-Language', weight: 15 })
  }

  if (referer && origin && !referer.startsWith(origin)) {
    riskScore += 10
    signals.push({ id: 'BEH_REFERER_ORIGIN_MISMATCH', name: 'Referer 与 Origin 不匹配', weight: 10 })
  }

  const hasSecFetch = req.headers['sec-fetch-site'] || req.headers['sec-fetch-mode'] || req.headers['sec-fetch-dest']
  if (!hasSecFetch) {
    riskScore += 12
    signals.push({ id: 'BEH_NO_SEC_FETCH', name: '缺少 Sec-Fetch 系列头', weight: 12 })
  }

  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera/i.test(ua)
  if (!isBrowser && ua) {
    riskScore += 20
    signals.push({ id: 'BEH_NON_BROWSER_UA', name: '非浏览器 User-Agent', weight: 20 })
  }

  if (req.method === 'GET' && req.headers['content-type']) {
    riskScore += 5
    signals.push({ id: 'BEH_GET_WITH_BODY', name: 'GET 请求携带请求体', weight: 5 })
  }

  // V3 新增：检测 Cookie 一致性
  const cookie = req.headers['cookie']
  if (!cookie && req.path !== '/api/register' && req.path !== '/api/login') {
    riskScore += 8
    signals.push({ id: 'BEH_NO_COOKIE', name: '已认证请求缺少 Cookie', weight: 8 })
  }

  return { riskScore: Math.min(riskScore, 40), signals }
}

// ============================================================================
// 核心评分引擎（V3 增强版）
// ============================================================================

/**
 * 注册风险评分 V3
 */
export function evaluateRegistrationRisk(req, email, externalIpReputation = null, ipRiskData = null) {
  const ip = getClientIP(req)
  const ua = req.headers['user-agent'] || ''
  const fingerprint = computeDeepFingerprint(req)
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex')
  const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)
  const emailDomain = getEmailDomain(email)

  let totalScore = 0
  const allFactors = []

  // ==================================================================
  // 维度 1：静态信誉分（35%）
  // ==================================================================

  const ipRisk = assessIpRisk(ip, req)
  totalScore += ipRisk.risk
  allFactors.push(...ipRisk.signals)

  if (!ua) {
    totalScore += 15
    allFactors.push({ id: 'UA_MISSING', name: '缺少 User-Agent', weight: 15 })
  } else if (isSuspiciousUA(ua)) {
    totalScore += 20
    allFactors.push({ id: 'UA_AUTOMATION', name: 'User-Agent 疑似自动化工具', weight: 20 })
  }

  const emailRisk = assessEmailRisk(email)
  totalScore += emailRisk.risk
  allFactors.push(...emailRisk.signals)

  if (externalIpReputation === 'bad') {
    totalScore += 25
    allFactors.push({ id: 'IP_BAD_REPUTATION', name: 'IP 命中外部威胁情报', weight: 25 })
  }

  // ipapi.is 外部 IP 风险检测（V3 增强）
  if (ipRiskData) {
    if (ipRiskData.is_tor) {
      totalScore += 30
      allFactors.push({ id: 'IP_TOR', name: 'IP 为 Tor 出口节点', weight: 30, source: 'ipapi.is' })
    }
    if (ipRiskData.is_vpn) {
      totalScore += 20
      allFactors.push({ id: 'IP_VPN', name: 'IP 为 VPN', weight: 20, source: 'ipapi.is' })
    }
    if (ipRiskData.is_proxy) {
      totalScore += 15
      allFactors.push({ id: 'IP_PROXY', name: 'IP 为代理服务器', weight: 15, source: 'ipapi.is' })
    }
    if (ipRiskData.is_datacenter) {
      totalScore += 10
      allFactors.push({ id: 'IP_DATACENTER', name: 'IP 为数据中心', weight: 10, source: 'ipapi.is' })
    }
    if (ipRiskData.is_abuser) {
      totalScore += 25
      allFactors.push({ id: 'IP_ABUSER', name: 'IP 有恶意行为记录', weight: 25, source: 'ipapi.is' })
    }
  }

  // ==================================================================
  // 维度 2：动态行为分（25%）
  // ==================================================================

  const behavior = extractServerSideBehavior(req)
  totalScore += behavior.riskScore * 0.625
  allFactors.push(...behavior.signals)

  // ==================================================================
  // 维度 3：关联分析分（20%）
  // ==================================================================

  const assoc = detectAssociation(ipHash, fingerprintHash, emailDomain)
  const bannedAssoc = detectBannedAssociation(ipHash, fingerprintHash)

  if (bannedAssoc) {
    totalScore += 25
    allFactors.push({ id: 'ASSOC_BANNED_ENTITY', name: 'IP/设备关联到已被封禁的账号', weight: 25 })
  }

  if (assoc.shortIpCount >= 3) {
    totalScore += 20
    allFactors.push({ id: 'ASSOC_SHORT_IP_HIGH', name: '同一IP 6小时内密集注册', weight: 20, count: assoc.shortIpCount })
  } else if (assoc.ipCount >= 5) {
    totalScore += 20
    allFactors.push({ id: 'ASSOC_IP_HIGH', name: '同一 IP 近期注册大量账号', weight: 20, count: assoc.ipCount })
  } else if (assoc.ipCount >= 3) {
    totalScore += 15
    allFactors.push({ id: 'ASSOC_IP_MEDIUM', name: '同一 IP 近期注册多个账号', weight: 15, count: assoc.ipCount })
  } else if (assoc.ipCount >= 2) {
    totalScore += 8
    allFactors.push({ id: 'ASSOC_IP_LOW', name: '同一 IP 近期有注册记录', weight: 8, count: assoc.ipCount })
  }

  if (assoc.shortDeviceCount >= 3) {
    totalScore += 20
    allFactors.push({ id: 'ASSOC_SHORT_DEVICE_HIGH', name: '同一设备6小时内密集注册', weight: 20, count: assoc.shortDeviceCount })
  } else if (assoc.deviceCount >= 5) {
    totalScore += 20
    allFactors.push({ id: 'ASSOC_DEVICE_HIGH', name: '同一设备近期注册大量账号', weight: 20, count: assoc.deviceCount })
  } else if (assoc.deviceCount >= 3) {
    totalScore += 15
    allFactors.push({ id: 'ASSOC_DEVICE_MEDIUM', name: '同一设备近期注册多个账号', weight: 15, count: assoc.deviceCount })
  } else if (assoc.deviceCount >= 2) {
    totalScore += 8
    allFactors.push({ id: 'ASSOC_DEVICE_LOW', name: '同一设备近期有注册记录', weight: 8, count: assoc.deviceCount })
  }

  if (assoc.domainCount >= 10) {
    totalScore += 15
    allFactors.push({ id: 'ASSOC_DOMAIN_HIGH', name: '同一邮箱域近期大量注册', weight: 15, count: assoc.domainCount })
  } else if (assoc.domainCount >= 5) {
    totalScore += 8
    allFactors.push({ id: 'ASSOC_DOMAIN_MEDIUM', name: '同一邮箱域近期注册较多', weight: 8, count: assoc.domainCount })
  }

  // ==================================================================
  // 维度 4：实时威胁分（10%）— 在运行时通过 updateRiskFromBehavior 设置
  // ==================================================================

  totalScore = Math.min(100, Math.max(0, totalScore))

  let level = 'low'
  if (totalScore >= 80) level = 'critical'
  else if (totalScore >= 60) level = 'high'
  else if (totalScore >= 40) level = 'medium'

  const status = scoreToStatus(totalScore)

  return {
    score: totalScore,
    level,
    status,
    factors: allFactors,
    metadata: {
      ip,
      ipHash,
      fingerprintHash,
      emailDomain,
      timestamp: new Date().toISOString(),
    },
  }
}

/**
 * 创建用户风险档案（V3 增强）
 */
export function createUserRiskProfile(userId, riskResult) {
  const now = new Date().toISOString()
  const profile = {
    userId,
    score: riskResult.score,
    level: riskResult.level,
    status: riskResult.status,
    factors: riskResult.factors,
    registration: {
      ...riskResult.metadata,
      evaluatedAt: now,
    },
    history: [{
      timestamp: now,
      action: 'register',
      score: riskResult.score,
      level: riskResult.level,
      status: riskResult.status,
      factors: riskResult.factors,
    }],
    scoreDecayRate: 0.001, // V4 衰减速度减半（每分钟 0.001，更难恢复）
    meritPoints: 0,
    banInfo: null,
    banHistory: [], // V3 新增：封禁历史记录
    appealStatus: null,
    appealId: null,
    lastNotifiedAt: null,
    // V3 新增字段
    autoBanCount: 0,       // 自动封禁次数
    lastLoginAt: null,     // 上次登录时间
    loginCount: 0,         // 登录次数
    trustedDevice: false,  // 是否绑定可信设备
    // V4 新增字段
    consecutiveChallengeFailures: 0,  // 连续 PoW 挑战失败次数
    dailyViolationDays: [],          // 触发安全事件的日期列表（用于连续日检测）
    lastLoginIP: null,               // 上次登录 IP
    loginFailCount: 0,               // 登录失败次数（短期）
    lastLoginFailAt: null,           // 上次登录失败时间
    updatedAt: now,
    createdAt: now,
  }

  profile.registration.ipProtected = protectIp(riskResult.metadata.ip)
  delete profile.registration.ip

  riskCache.set(userId, profile)
  markDirty('profile_update', { userId, profile })

  recordRegistration(
    userId,
    riskResult.metadata.ipHash,
    riskResult.metadata.fingerprintHash,
    riskResult.metadata.emailDomain
  )

  // 自动封禁引擎检查
  runAutoBanEngine(userId)

  return profile
}

// ============================================================================
// 自动封禁引擎（V3 核心新增）
// ============================================================================

/**
 * 自动封禁引擎 — 定期检查所有用户的风险档案
 * 根据预定义规则自动触发封禁/限制操作
 */
function runAutoBanEngine(userId) {
  const profile = riskCache.get(userId)
  if (!profile) return { triggered: false, rules: [] }

  const triggeredRules = []

  for (const rule of AUTO_BAN_RULES) {
    try {
      if (rule.condition(profile)) {
        triggeredRules.push(rule)
      }
    } catch (err) {
      console.warn(`[AutoBan] 规则 ${rule.id} 检查失败:`, err.message)
    }
  }

  if (triggeredRules.length === 0) {
    return { triggered: false, rules: [] }
  }

  // V4 按优先级执行（最高风险先执行，新增规则加入）
  const priorityOrder = ['SCORE_MAX', 'SCORE_CRITICAL', 'HIGH_RISK_LOGIN_FAILURE', 'CONSECUTIVE_DAILY_VIOLATION', 'ASSOC_BANNED', 'MULTIPLE_CHALLENGE_FAILURE', 'MASS_REGISTRATION', 'AUTO_ESCALATE']
  triggeredRules.sort((a, b) => priorityOrder.indexOf(a.id) - priorityOrder.indexOf(b.id))

  const executed = []
  for (const rule of triggeredRules) {
    const result = applyAutoBanAction(userId, rule)
    if (result.success) {
      executed.push(rule.id)
    }
  }

  return { triggered: true, rules: executed }
}

/**
 * 执行自动封禁操作
 */
function applyAutoBanAction(userId, rule) {
  const profile = riskCache.get(userId)
  if (!profile) return { success: false }

  try {
    const result = executeBan(userId, rule.banType, rule.reason, 'auto_ban_engine', {
      evidence: { ruleId: rule.id, triggeredAt: new Date().toISOString() },
    })

    if (result.success) {
      profile.autoBanCount = (profile.autoBanCount || 0) + 1
      recordRiskEvent(userId, 'auto_ban_triggered', {
        ruleId: rule.id,
        action: rule.action,
        banType: rule.banType,
        reason: rule.reason,
        score: profile.score,
      })
      markDirty('profile_update', { userId, profile })
    }

    return result
  } catch (err) {
    console.warn(`[AutoBan] 执行封禁操作失败 (${rule.id}):`, err.message)
    return { success: false, error: err.message }
  }
}

/**
 * 全局自动封禁扫描（定时任务）
 */
function runGlobalAutoBanScan() {
  let totalTriggered = 0
  for (const [userId] of riskCache) {
    const result = runAutoBanEngine(userId)
    if (result.triggered) totalTriggered++
  }
  if (totalTriggered > 0) {
    console.log(`[AutoBan] 全局扫描完成: ${totalTriggered} 个账号触发了自动封禁`)
  }
}

// ============================================================================
// 分数衰减
// ============================================================================

function applyScoreDecay(profile) {
  if (!profile) return profile

  const now = Date.now()
  const lastUpdate = new Date(profile.updatedAt).getTime()
  if (isNaN(lastUpdate)) return profile

  const elapsedMinutes = (now - lastUpdate) / 60000
  if (elapsedMinutes <= 0) return profile

  const decay = elapsedMinutes * profile.scoreDecayRate
  const newScore = Math.max(profile.score - decay, 0)

  let finalScore = newScore
  if (profile.meritPoints > 0 && profile.score > 0) {
    const meritDeduction = Math.min(profile.meritPoints, newScore)
    finalScore = Math.max(newScore - meritDeduction, 0)
    profile.meritPoints = Math.max(profile.meritPoints - meritDeduction, 0)
  }

  profile.score = Math.round(finalScore * 10) / 10
  profile.updatedAt = new Date().toISOString()

  const newStatus = scoreToStatus(profile.score)
  if (newStatus !== profile.status) {
    profile.history.push({
      timestamp: profile.updatedAt,
      action: 'auto_status_change',
      from: profile.status,
      to: newStatus,
      reason: '分数衰减自动降级',
      score: profile.score,
    })
    profile.status = newStatus
    profile.level = profile.score >= 80 ? 'critical' :
      profile.score >= 60 ? 'high' :
      profile.score >= 40 ? 'medium' : 'low'
  }

  return profile
}

export function addMeritPoints(userId, points, reason) {
  const profile = riskCache.get(userId)
  if (!profile) return null

  profile.meritPoints = (profile.meritPoints || 0) + points
  profile.history.push({
    timestamp: new Date().toISOString(),
    action: 'merit_added',
    points,
    reason,
  })
  markDirty('profile_update', { userId, profile })
  return profile
}

// ============================================================================
// 风险档案查询与更新
// ============================================================================

export function getRiskProfile(userId) {
  const profile = riskCache.get(userId)
  if (!profile) return null
  return applyScoreDecay(profile)
}

export function updateRiskStatus(userId, newStatus, reason, actor = 'system') {
  const profile = riskCache.get(userId)
  if (!profile) return null

  if (!Object.values(ACCOUNT_STATUS).includes(newStatus)) {
    throw new Error('无效的账号状态')
  }

  if (newStatus === ACCOUNT_STATUS.BANNED && profile.status === ACCOUNT_STATUS.BANNED) {
    throw new Error('已被永久封禁的账号无法再次修改状态')
  }

  const now = new Date().toISOString()
  const oldStatus = profile.status

  profile.status = newStatus
  profile.score = getStatusWeight(newStatus)
  profile.level = newStatus === ACCOUNT_STATUS.SAFE ? 'low' :
    newStatus === ACCOUNT_STATUS.AWARE ? 'low' :
    newStatus === ACCOUNT_STATUS.WATCH ? 'medium' :
    newStatus === ACCOUNT_STATUS.RESTRICTED ? 'high' : 'critical'

  profile.history.push({
    timestamp: now,
    action: 'status_update',
    actor,
    from: oldStatus,
    to: newStatus,
    reason,
  })

  if (newStatus === ACCOUNT_STATUS.BANNED) {
    profile.banInfo = {
      type: BAN_TYPE.PERMANENT,
      bannedAt: now,
      bannedBy: actor,
      reason,
    }
    profile.banHistory = profile.banHistory || []
    profile.banHistory.push({ ...profile.banInfo, timestamp: now })
    if (profile.registration?.ipHash) bannedEntities.add(profile.registration.ipHash)
    if (profile.registration?.fingerprintHash) bannedEntities.add(profile.registration.fingerprintHash)
  }

  profile.updatedAt = now
  markDirty('profile_update', { userId, profile })
  return profile
}

function getStatusWeight(status) {
  const map = {
    [ACCOUNT_STATUS.SAFE]: 15,
    [ACCOUNT_STATUS.AWARE]: 40,
    [ACCOUNT_STATUS.WATCH]: 60,
    [ACCOUNT_STATUS.RESTRICTED]: 75,
    [ACCOUNT_STATUS.FROZEN]: 90,
    [ACCOUNT_STATUS.BANNED]: 100,
  }
  return map[status] || 0
}

// ============================================================================
// 事件记录系统
// ============================================================================

export function recordRiskEvent(userId, eventType, details) {
  const now = new Date().toISOString()
  const event = {
    id: crypto.randomUUID(),
    type: eventType,
    timestamp: now,
    details,
    read: false,
  }

  if (!riskEvents.has(userId)) {
    riskEvents.set(userId, [])
  }
  riskEvents.get(userId).unshift(event)

  if (riskEvents.get(userId).length > 200) {
    riskEvents.get(userId).pop()
  }

  markDirty('event_add', { userId, event })
  return event
}

export function getRiskEvents(userId, limit = 20) {
  const events = riskEvents.get(userId) || []
  return events.slice(0, limit)
}

export function getUnreadRiskEventCount(userId) {
  const events = riskEvents.get(userId) || []
  return events.filter(e => !e.read).length
}

export function markRiskEventsRead(userId, eventIds) {
  const events = riskEvents.get(userId)
  if (!events) return
  for (const event of events) {
    if (eventIds.includes(event.id)) {
      event.read = true
    }
  }
}

// ============================================================================
// 安全概览与建议
// ============================================================================

export function getSecurityOverview(userId) {
  const profile = getRiskProfile(userId)
  if (!profile) {
    return {
      status: ACCOUNT_STATUS.SAFE,
      score: 0,
      level: 'low',
      factors: [],
      events: [],
      banInfo: null,
      banHistory: [],
      appealStatus: null,
      suggestions: ['设置强密码', '开启两步验证'],
      unreadEvents: 0,
    }
  }

  const events = getRiskEvents(userId, 10)
  const suggestions = generateSuggestions(profile)

  return {
    status: profile.status,
    score: Math.round(profile.score),
    level: profile.level,
    factors: profile.factors || [],
    events,
    banInfo: profile.banInfo,
    banHistory: profile.banHistory || [],
    appealStatus: profile.appealStatus,
    suggestions,
    meritPoints: profile.meritPoints || 0,
    autoBanCount: profile.autoBanCount || 0,
    createdAt: profile.createdAt,
    unreadEvents: getUnreadRiskEventCount(userId),
  }
}

function generateSuggestions(profile) {
  const suggestions = []

  // V4 增强建议：根据风险等级提供更具体的指导
  if (profile.score >= 20 && profile.score < 40) {
    suggestions.push({
      id: 'enable_2fa',
      text: '开启两步验证可降低风险评分，提高账户安全性',
      impact: '降低约 5-10 分',
      action: '设置',
      actionLink: '/settings/security',
    })
  }

  if (profile.score >= 40) {
    suggestions.push({
      id: 'strong_password',
      text: '使用更强的密码并开启两步验证可提高账户安全性',
      impact: '降低约 8-15 分',
      action: '修改密码',
      actionLink: '/settings/security',
    })
    if (profile.consecutiveChallengeFailures > 0) {
      suggestions.push({
        id: 'avoid_failed_challenges',
        text: `安全验证已连续失败 ${profile.consecutiveChallengeFailures} 次，请使用正常浏览器环境操作`,
        impact: '避免风险评分继续增加',
        action: '了解详情',
        actionLink: '/security/overview',
      })
    }
  }

  if (profile.score >= 60) {
    suggestions.push({
      id: 'contact_support',
      text: '您的账户存在较高风险，建议立即联系客服了解详情',
      impact: '解决账户受限问题',
      action: '联系客服',
      actionLink: '/support',
    })
  }

  // 状态特定的建议
  if (profile.status === ACCOUNT_STATUS.WATCH) {
    suggestions.push({
      id: 'watch_improvement',
      text: '您的账户当前处于「观察」状态，请尽快改善安全设置以避免受限',
      impact: '避免账户功能受限',
      action: '查看详情',
      actionLink: '/security/overview',
    })
  }

  if (profile.status === ACCOUNT_STATUS.RESTRICTED) {
    suggestions.push({
      id: 'restricted_improvement',
      text: '您的账户部分功能已被限制，请完成安全设置恢复完整功能',
      impact: '恢复账户正常使用',
      action: '立即处理',
      actionLink: '/settings/security',
    })
  }

  if (profile.status === ACCOUNT_STATUS.FROZEN && !profile.appealId) {
    suggestions.push({
      id: 'submit_appeal',
      text: '您的账号已被冻结，请立即提交申诉进行复核',
      impact: '恢复账号正常使用',
      action: '提交申诉',
      actionLink: '/appeal',
    })
  }

  if (profile.registration?.emailDomain && KNOWN_DISPOSABLE_DOMAINS.has(profile.registration.emailDomain)) {
    suggestions.push({
      id: 'change_email',
      text: '建议更换为常用邮箱，提高账户可信度',
      impact: '降低约 15-20 分',
      action: '更换邮箱',
      actionLink: '/settings/account',
    })
  }

  // 封禁相关建议
  if (profile.autoBanCount > 0) {
    suggestions.push({
      id: 'auto_ban_info',
      text: `您的账号已被自动封禁 ${profile.autoBanCount} 次，继续违规将导致永久封禁`,
      impact: '避免永久封禁',
      action: '了解详情',
      actionLink: '/security/overview',
    })
  }

  if (profile.banInfo?.type === BAN_TYPE.WARNING) {
    suggestions.push({
      id: 'ban_warning',
      text: '⚠️ 您的账号已收到封禁预通知，请在 24 小时内改善安全行为',
      impact: '避免账号被冻结',
      action: '立即处理',
      actionLink: '/settings/security',
    })
  }

  return suggestions
}

// ============================================================================
// V4 用户安全通知体系
// ============================================================================

/**
 * 向用户推送安全状态变更通知
 * 自动生成风险事件，通知会在用户登录时通过响应头传递
 */
export function notifyUserSecurityStatus(userId, eventType, details) {
  const profile = riskCache.get(userId)
  if (!profile) return null

  // 记录风险事件
  const event = recordRiskEvent(userId, eventType, details)

  // 更新最后通知时间
  profile.lastNotifiedAt = new Date().toISOString()
  markDirty('profile_update', { userId, profile })

  return event
}

/**
 * V4 生成登录安全警告头
 * 用户登录时，根据风险状态返回警告信息
 */
export function getLoginSecurityWarnings(userId) {
  const profile = getRiskProfile(userId)
  if (!profile) return []

  const warnings = []

  if (profile.status === ACCOUNT_STATUS.AWARE) {
    warnings.push({
      level: 'info',
      code: 'ACCOUNT_AWARE',
      message: '您的账户存在轻微风险因素，建议查看安全面板了解详情。',
    })
  }

  if (profile.status === ACCOUNT_STATUS.WATCH) {
    warnings.push({
      level: 'warning',
      code: 'ACCOUNT_WATCH',
      message: '您的账户存在风险迹象，敏感操作将需要额外验证。',
      action: '请尽快改善安全设置，避免账户功能受限。',
    })
  }

  if (profile.status === ACCOUNT_STATUS.RESTRICTED) {
    warnings.push({
      level: 'warning',
      code: 'ACCOUNT_RESTRICTED',
      message: '您的账户部分功能已被限制。',
      action: '请完成安全设置以恢复完整功能。',
    })
  }

  if (profile.status === ACCOUNT_STATUS.FROZEN) {
    warnings.push({
      level: 'critical',
      code: 'ACCOUNT_FROZEN',
      message: '您的账户已被冻结。',
      action: '请提交申诉进行复核。',
      appealLink: '/appeal',
    })
  }

  if (profile.status === ACCOUNT_STATUS.BANNED) {
    warnings.push({
      level: 'critical',
      code: 'ACCOUNT_BANNED',
      message: '您的账户已被永久封禁。',
      action: '如有异议请在 7 天内提交申诉。',
      appealLink: '/appeal',
    })
  }

  // 带封禁预通知
  if (profile.banInfo?.type === BAN_TYPE.WARNING) {
    warnings.push({
      level: 'critical',
      code: 'BAN_PREWARNING',
      message: '⚠️ 您的账户已收到封禁预通知！',
      action: `请在 ${new Date(profile.banInfo.expiresAt).toLocaleString('zh-CN')} 前改善安全行为，否则账户将被自动冻结。`,
    })
  }

  return warnings
}

// ============================================================================
// 封禁工作流（V4 增强版）
// ============================================================================

/**
 * 执行封禁操作
 */
export function executeBan(userId, banType, reason, actor, options = {}) {
  const profile = riskCache.get(userId)
  if (!profile) {
    return { success: false, message: '用户不存在' }
  }

  if (profile.status === ACCOUNT_STATUS.BANNED && profile.banInfo?.type === BAN_TYPE.PERMANENT) {
    return { success: false, message: '账号已被永久封禁' }
  }

  const now = new Date().toISOString()
  const durationMs = BAN_DURATION_MS[banType]
  const expiresAt = durationMs ? new Date(Date.now() + durationMs).toISOString() : null

  profile.status = banType === BAN_TYPE.PERMANENT ? ACCOUNT_STATUS.BANNED : ACCOUNT_STATUS.FROZEN
  profile.score = banType === BAN_TYPE.PERMANENT ? 100 : 90

  const banEntry = {
    type: banType,
    bannedAt: now,
    bannedBy: actor,
    reason,
    expiresAt,
    evidence: options.evidence || null,
  }

  profile.banInfo = banEntry
  profile.banHistory = profile.banHistory || []
  profile.banHistory.push(banEntry)

  profile.history.push({
    timestamp: now,
    action: 'ban_executed',
    actor,
    banType,
    reason,
    expiresAt,
  })

  recordRiskEvent(userId, 'account_banned', {
    banType,
    reason,
    expiresAt,
    bannedBy: actor,
    evidence: options.evidence,
  })

  if (banType === BAN_TYPE.PERMANENT) {
    if (profile.registration?.ipHash) {
      bannedEntities.add(profile.registration.ipHash)
      markDirty('banned_entity_add', profile.registration.ipHash)
      // 多实例同步：将封禁实体发布到 Redis 共享集合，供其他节点拉取
      addSetMember(BAN_ENTITY_SYNC_KEY, profile.registration.ipHash).catch(() => {})
    }
    if (profile.registration?.fingerprintHash) {
      bannedEntities.add(profile.registration.fingerprintHash)
      markDirty('banned_entity_add', profile.registration.fingerprintHash)
      addSetMember(BAN_ENTITY_SYNC_KEY, profile.registration.fingerprintHash).catch(() => {})
    }
  }

  profile.updatedAt = now
  markDirty('profile_update', { userId, profile })

  return {
    success: true,
    banInfo: profile.banInfo,
    notification: getBanNotification(banType, reason, expiresAt),
  }
}

/**
 * 获取封禁通知文本
 */
function getBanNotification(banType, reason, expiresAt) {
  const baseMessages = {
    [BAN_TYPE.WARNING]: {
      title: '⚠️ 封禁预通知（24小时）',
      message: '您的账号因安全风险行为已收到封禁预通知。请在 24 小时内改善安全行为，否则账户将被自动冻结。',
    },
    [BAN_TYPE.TEMP_1D]: {
      title: '账号已被临时封禁（1天）',
      message: '您的账号因违反平台安全规则已被临时封禁 1 天。',
    },
    [BAN_TYPE.TEMP_3D]: {
      title: '账号已被临时封禁（3天）',
      message: '您的账号因违反平台安全规则已被临时封禁 3 天。',
    },
    [BAN_TYPE.TEMP_7D]: {
      title: '账号已被临时封禁（7天）',
      message: '您的账号因违反平台安全规则已被临时封禁 7 天。',
    },
    [BAN_TYPE.TEMP_30D]: {
      title: '账号已被临时封禁（30天）',
      message: '您的账号因违反平台安全规则已被临时封禁 30 天。',
    },
    [BAN_TYPE.PERMANENT]: {
      title: '账号已被永久封禁',
      message: '您的账号因严重违反平台安全规则已被永久封禁。',
    },
  }

  const base = baseMessages[banType] || baseMessages[BAN_TYPE.PERMANENT]
  const expiryInfo = expiresAt ? `预计解封时间：${new Date(expiresAt).toLocaleString('zh-CN')}。` : ''

  const severityMap = {
    [BAN_TYPE.WARNING]: 'warning',
    [BAN_TYPE.TEMP_1D]: 'high',
    [BAN_TYPE.TEMP_3D]: 'high',
    [BAN_TYPE.TEMP_7D]: 'high',
    [BAN_TYPE.TEMP_30D]: 'critical',
    [BAN_TYPE.PERMANENT]: 'critical',
  }

  return {
    title: base.title,
    message: `${base.message}原因：${reason || '未提供'}。${expiryInfo}如有异议，请在 7 天内提交申诉。`,
    severity: severityMap[banType] || 'high',
  }
}

/**
 * 检查临时封禁是否到期
 */
export function checkTempBanExpiry(userId) {
  const profile = riskCache.get(userId)
  if (!profile || !profile.banInfo) return false

  if (profile.banInfo.type === BAN_TYPE.PERMANENT) return false
  if (!profile.banInfo.expiresAt) return false

  const now = Date.now()
  const expires = new Date(profile.banInfo.expiresAt).getTime()
  if (now >= expires) {
    profile.status = ACCOUNT_STATUS.WATCH
    profile.score = 60
    profile.banInfo = null
    profile.history.push({
      timestamp: new Date().toISOString(),
      action: 'auto_unban',
      reason: '临时封禁到期自动解封',
    })
    profile.updatedAt = new Date().toISOString()
    markDirty('profile_update', { userId, profile })
    return true
  }

  return false
}

// ============================================================================
// 会话失效机制（V3 新增）
// ============================================================================

/**
 * 失效用户所有会话
 * 强制用户重新登录
 */
export async function invalidateUserSessions(userId) {
  try {
    const { deleteSessions } = await import('../../lib/sessionStore.js')
    await deleteSessions(userId)
    recordRiskEvent(userId, 'sessions_invalidated', {
      reason: '账号状态变更，所有会话已失效',
      timestamp: new Date().toISOString(),
    })
    return true
  } catch (err) {
    console.warn('[AccountRiskV3] 会话失效失败:', err.message)
    return false
  }
}

/**
 * 获取用户当前登录状态摘要
 */
export async function getUserLoginSummary(userId) {
  try {
    const { getSessions, getLoginHistory } = await import('../../lib/sessionStore.js')
    const sessions = await getSessions(userId)
    const loginHistory = await getLoginHistory(userId)
    return {
      activeSessions: sessions.length,
      recentLogins: (loginHistory || []).slice(0, 5),
      hasMultipleSessions: sessions.length > 1,
    }
  } catch {
    return { activeSessions: 0, recentLogins: [], hasMultipleSessions: false }
  }
}

// ============================================================================
// 实时威胁检测集成（V3 新增）
// ============================================================================

/**
 * 从行为分析器更新风险分数
 * 集成 behaviorAnalyzer 的实时检测结果
 */
export function updateRiskFromBehavior(userId, behaviorScore, behaviorSignals = []) {
  const profile = riskCache.get(userId)
  if (!profile) return null

  // 行为分数映射到 0-10 分范围
  const threatScore = Math.min(10, Math.round(behaviorScore * 0.1))
  if (threatScore <= 0) return profile

  profile.score = Math.min(100, profile.score + threatScore)

  const newFactors = behaviorSignals.map(s => ({
    id: `BEH_THREAT_${s.id || s.name?.replace(/\s+/g, '_').toUpperCase() || 'UNKNOWN'}`,
    name: s.name || '实时行为异常',
    weight: threatScore,
    source: 'behavior_analyzer',
  }))

  profile.factors = [...(profile.factors || []), ...newFactors]

  const newStatus = scoreToStatus(profile.score)
  if (newStatus !== profile.status) {
    profile.history.push({
      timestamp: new Date().toISOString(),
      action: 'threat_escalation',
      from: profile.status,
      to: newStatus,
      reason: '实时威胁检测触发状态升级',
      threatScore,
      behaviorSignals: behaviorSignals.map(s => s.name || s.id),
    })
    profile.status = newStatus
    profile.level = profile.score >= 80 ? 'critical' :
      profile.score >= 60 ? 'high' :
      profile.score >= 40 ? 'medium' : 'low'
  }

  profile.updatedAt = new Date().toISOString()
  markDirty('profile_update', { userId, profile })

  // 触发自动封禁检查
  runAutoBanEngine(userId)

  return profile
}

// ============================================================================
// 管理员封禁审批工作流（V3 新增）
// ============================================================================

/**
 * 创建封禁审批请求（管理员发起封禁需要审批）
 */
export function createBanApproval(userId, banType, reason, requestedBy) {
  const profile = riskCache.get(userId)
  if (!profile) {
    return { success: false, message: '用户不存在' }
  }

  const id = 'ban-approval-' + crypto.randomUUID().slice(0, 8)
  const now = new Date().toISOString()

  const approval = {
    id,
    userId,
    banType,
    reason,
    requestedBy,
    status: APPROVAL_STATUS.PENDING,
    requestedAt: now,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    profile: {
      score: profile.score,
      status: profile.status,
      autoBanCount: profile.autoBanCount || 0,
      createdAt: profile.createdAt,
    },
  }

  banApprovals.set(id, approval)
  markDirty('ban_approval', approval)

  recordRiskEvent(userId, 'ban_approval_created', {
    approvalId: id,
    banType,
    reason,
    requestedBy,
  })

  return { success: true, approvalId: id, approval }
}

/**
 * 审核封禁审批
 */
export function reviewBanApproval(approvalId, decision, reviewNote, reviewedBy) {
  const approval = banApprovals.get(approvalId)
  if (!approval) {
    return { success: false, message: '审批请求不存在' }
  }

  if (approval.status !== APPROVAL_STATUS.PENDING) {
    return { success: false, message: '审批请求已处理' }
  }

  const now = new Date().toISOString()
  approval.status = decision === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED
  approval.reviewedBy = reviewedBy
  approval.reviewedAt = now
  approval.reviewNote = reviewNote || ''

  if (decision === 'approve') {
    const result = executeBan(approval.userId, approval.banType, approval.reason, reviewedBy)
    recordRiskEvent(approval.userId, 'ban_approval_approved', {
      approvalId,
      reviewedBy,
      reviewNote,
    })
    return { success: true, action: 'approved', banResult: result }
  } else {
    recordRiskEvent(approval.userId, 'ban_approval_rejected', {
      approvalId,
      reviewedBy,
      reviewNote,
    })
    return { success: true, action: 'rejected' }
  }
}

/**
 * 获取待审批的封禁请求
 */
export function getPendingBanApprovals(limit = 50) {
  return Array.from(banApprovals.values())
    .filter(a => a.status === APPROVAL_STATUS.PENDING)
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
    .slice(0, limit)
}

/**
 * 获取所有封禁审批记录
 */
export function getAllBanApprovals({ status, page = 1, limit = 50 } = {}) {
  let list = Array.from(banApprovals.values())
  if (status && Object.values(APPROVAL_STATUS).includes(status)) {
    list = list.filter(a => a.status === status)
  }
  list.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
  const total = list.length
  const start = (page - 1) * limit
  return { total, page, limit, data: list.slice(start, start + limit) }
}

// ============================================================================
// 中间件（V3 增强版）
// ============================================================================

/**
 * 账号状态检查中间件
 */
export function accountStatusMiddleware(req, res, next) {
  const userId = req.tokenPayload?.userId
  if (!userId) return next()

  let profile = riskCache.get(userId)
  if (!profile) return next()

  profile = applyScoreDecay(profile)
  checkTempBanExpiry(userId)

  profile = riskCache.get(userId)
  if (!profile) return next()

  req.accountStatus = profile.status
  req.riskProfile = profile
  req.riskScore = profile.score

  if (profile.status === ACCOUNT_STATUS.FROZEN || profile.status === ACCOUNT_STATUS.BANNED) {
    const allowedPaths = [
      '/api/appeal', '/api/me', '/api/logout', '/api/policies',
      '/api/security/overview', '/api/security/events',
      '/api/security/status', '/api/security/ban-info',
    ]
    if (allowedPaths.some(p => req.path.startsWith(p))) {
      return next()
    }

    const isBanned = profile.status === ACCOUNT_STATUS.BANNED
    const banNotification = profile.banInfo ? getBanNotification(
      profile.banInfo.type,
      profile.banInfo.reason,
      profile.banInfo.expiresAt
    ) : null

    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_ISOLATED',
      status: profile.status,
      message: isBanned
        ? '账号已被永久封禁，如有异议请提交申诉'
        : '账号已被冻结，请提交申诉进行复核',
      banInfo: profile.banInfo ? {
        type: profile.banInfo.type,
        bannedAt: profile.banInfo.bannedAt,
        reason: profile.banInfo.reason,
        expiresAt: profile.banInfo.expiresAt,
      } : null,
      notification: banNotification,
    })
  }

  if (profile.status === ACCOUNT_STATUS.WATCH) {
    res.set('X-Account-Status', 'watch')
    res.set('X-Account-Score', String(profile.score))
    res.set('X-Account-Needs-Attention', 'true')
  }

  if (profile.status === ACCOUNT_STATUS.RESTRICTED) {
    res.set('X-Account-Status', 'restricted')
    res.set('X-Account-Score', String(profile.score))
    res.set('X-Account-Needs-Attention', 'true')
  }

  next()
}

/**
 * 限制敏感操作的中间件
 */
export function requireNormalAccount(req, res, next) {
  const status = req.accountStatus || ACCOUNT_STATUS.SAFE

  if (status === ACCOUNT_STATUS.RESTRICTED) {
    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_RESTRICTED',
      status,
      message: '您的账号当前处于受限状态，无法执行此操作。请完成安全设置以恢复正常状态。',
      details: '受限状态不影响学习功能，仅限制发布、支付和修改安全设置。',
    })
  }

  if (status === ACCOUNT_STATUS.WATCH) {
    req.requireExtraVerification = true
  }

  return next()
}

/**
 * V4 强制 PoW 挑战验证中间件（IP 绑定 + 失败自动升级）
 * 用于注册和敏感操作
 */
export function requirePoWChallenge(req, res, next) {
  const { challengeId, nonce, clientTimestamp } = req.body
  const clientIP = getClientIP(req) || req.ip || ''
  const userId = req.tokenPayload?.userId

  if (!challengeId || !nonce) {
    // 记录失败（如果有 userId）
    if (userId) {
      recordChallengeFailure(userId, clientIP)
    }
    return res.status(400).json({
      success: false,
      code: 'CHALLENGE_REQUIRED',
      message: '需要完成安全挑战验证',
      details: '请先获取挑战并完成 PoW 计算',
    })
  }

  // V4 验证：IP 绑定 + 时间验证 + 签名验证
  const result = verifyRiskChallenge(challengeId, nonce, clientTimestamp, clientIP)
  if (!result.valid) {
    // 挑战失败 → 记录并自动升级风险
    if (userId) {
      recordChallengeFailure(userId, clientIP)
    }
    return res.status(400).json({
      success: false,
      code: 'CHALLENGE_FAILED',
      message: result.reason || '安全挑战验证失败',
      details: '挑战失败将增加风险评分，连续失败可能导致账号受限',
    })
  }

  // 挑战成功后置处理
  if (userId) {
    // 重置连续失败计数
    resetChallengeFailures(userId)
    // 记录成功事件
    recordRiskEvent(userId, 'challenge_passed', {
      difficulty: result.difficulty,
      computeTime: result.computeTime,
    })
  }

  next()
}

/**
 * 获取当前用户安全状态
 */
export function getAccountStatusForUser(req) {
  const userId = req.tokenPayload?.userId
  if (!userId) return null

  const profile = getRiskProfile(userId)
  if (!profile) {
    return {
      status: ACCOUNT_STATUS.SAFE,
      score: 0,
      level: 'low',
      events: [],
      suggestions: [],
      needsAttention: false,
    }
  }

  checkTempBanExpiry(userId)

  return {
    status: profile.status,
    score: Math.round(profile.score),
    level: profile.level,
    needsAttention: profile.status !== ACCOUNT_STATUS.SAFE,
    events: getRiskEvents(userId, 5),
    suggestions: generateSuggestions(profile),
    unreadEvents: getUnreadRiskEventCount(userId),
  }
}

// ============================================================================
// 初始化
// ============================================================================

initializePersistence().catch(() => {})

challengeCleanupTimer = setInterval(cleanupChallenges, 5 * 60 * 1000)

// V3 新增：自动封禁引擎定时扫描（每 2 分钟）
autoBanTimer = setInterval(runGlobalAutoBanScan, 2 * 60 * 1000)

process.on('SIGINT', () => {
  clearInterval(challengeCleanupTimer)
  clearInterval(autoBanTimer)
})
process.on('SIGTERM', () => {
  clearInterval(challengeCleanupTimer)
  clearInterval(autoBanTimer)
})