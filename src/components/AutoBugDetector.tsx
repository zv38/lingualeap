import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, RefreshCw, X, MessageCircle, Trash2, Bug, Bot,
  CheckCircle, Shield, Eye, Search, Upload, ChevronRight,
  Layers, Clock
} from 'lucide-react'
import { useStore } from '../store/useStore'

// ============================================================
// 类型定义
// ============================================================

interface CapturedError {
  id: string
  incidentId: string      // 关联 ID，用于自动-手动关联
  message: string
  stack: string
  type: 'error' | 'unhandledrejection' | 'api' | 'network' | 'chunk' | 'blank'
  url: string
  timestamp: number
  userAgent: string
  userId?: string
  username?: string
  metadata?: Record<string, unknown>
  severity: 'critical' | 'warning' | 'info'
  context?: EnhancedContext  // 增强上下文
}

/** 增强上下文信息 */
interface EnhancedContext {
  storeState?: Record<string, unknown>    // 关键 store 状态快照
  consoleLogs?: string[]                  // 最近 N 条 console warn/error
  routePath?: string                      // 当前路由路径
  routeParams?: string                    // 路由参数
  version?: string                        // 应用版本号
  environment?: string                    // 环境标识
  performance?: {                         // 性能指标
    memory?: number
    loadTime?: number
    fcp?: number
  }
}

/** 用于相似度匹配的指纹 */
interface FuzzyFingerprint {
  type: string
  messageNormalized: string
  stackFrameKeys: string[]
  urlBase: string
}

type RecoveryStage = 'detect' | 'reported' | 'refresh-failed' | 'escalated'

// ============================================================
// 常量
// ============================================================

const SESSION_KEY = 'guardian_session_reported'
const LAST_ERROR_KEY = 'guardian_last_error'
const REFRESH_COUNT_KEY = 'guardian_refresh_count'
const STATS_KEY = 'guardian_stats'
const PENDING_QUEUE_KEY = 'guardian_pending_queue'
const BATCH_BUFFER_KEY = 'guardian_batch_buffer'
const CONSOLE_LOG_KEY = 'guardian_console_logs'
const INCIDENT_COUNTER_KEY = 'guardian_incident_counter'

// 重试退避（秒）：更长的间隔，更多重试次数
const RETRY_DELAYS = [30, 120, 300, 900, 1800, 3600, 7200, 14400]
const MAX_RETRIES = 8

// 批量上报配置
const BATCH_INTERVAL_MS = 10_000   // 每 10 秒批量发送一次
const BATCH_MAX_SIZE = 5           // 或累积 5 条后立即发送

// 相似度阈值（0~1），低于此值认为是同类错误
const SIMILARITY_THRESHOLD = 0.65

// 控制台日志捕获：最多保留条数
const MAX_CONSOLE_LOGS = 20

// 同一错误弹窗节流（毫秒）
const PROMPT_THROTTLE_MS = 60_000

// 忽略的低价值噪声
const IGNORED_MESSAGES = [
  'getThemeColors', 'preload script', 'preload-browserView',
  'React will try to', 'download the React DevTools',
  'net::ERR_BLOCKED_BY_ORB', 'ResizeObserver loop',
  'Uncaught Error: Minified React error', 'Warning: ',
  'Future Flag Warning', 'v7_startTransition', 'v7_relativeSplatPath',
]

const IGNORED_API_STATUSES = new Set([401, 403, 404, 409])
const IGNORED_API_URLS = /(images\.unsplash\.com|picsum\.photos|gravatar\.com|google-analytics|googletagmanager|doubleclick)/i

// ============================================================
// Guardian 统计
// ============================================================

interface GuardianStats {
  status: 'running' | 'paused' | 'escalated'
  detectedCount: number
  reportedCount: number
  batchedCount: number
  dedupSkippedCount: number
  lastEvent: { type: string; message: string; time: number; severity: string } | null
  lastUpdated: number
}

function readStats(): GuardianStats {
  try {
    const raw = sessionStorage.getItem(STATS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as GuardianStats
    }
  } catch {}
  return {
    status: 'running', detectedCount: 0, reportedCount: 0,
    batchedCount: 0, dedupSkippedCount: 0,
    lastEvent: null, lastUpdated: Date.now(),
  }
}

function writeStats(stats: GuardianStats) {
  try { sessionStorage.setItem(STATS_KEY, JSON.stringify(stats)) } catch {}
}

export function updateGuardianStats(update: Partial<GuardianStats>) {
  const stats = readStats()
  writeStats({ ...stats, ...update, lastUpdated: Date.now() })
}

export function getGuardianStats(): GuardianStats {
  return readStats()
}

// ============================================================
// 控制台日志捕获
// ============================================================

function readConsoleLogs(): string[] {
  try {
    const raw = sessionStorage.getItem(CONSOLE_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeConsoleLogs(logs: string[]) {
  try {
    sessionStorage.setItem(CONSOLE_LOG_KEY, JSON.stringify(logs.slice(-MAX_CONSOLE_LOGS)))
  } catch {}
}

function installConsoleCapture() {
  const origWarn = console.warn
  const origError = console.error
  const logs = readConsoleLogs()

  console.warn = function (...args) {
    logs.push(`[WARN] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`)
    writeConsoleLogs(logs)
    return origWarn.apply(console, args)
  }

  console.error = function (...args) {
    logs.push(`[ERROR] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`)
    writeConsoleLogs(logs)
    return origError.apply(console, args)
  }

  return () => {
    console.warn = origWarn
    console.error = origError
  }
}

// ============================================================
// 智能去重：基于堆栈相似度的模糊匹配
// ============================================================

function extractFuzzyFingerprint(err: CapturedError): FuzzyFingerprint {
  const messageNormalized = err.message
    .replace(/\d+/g, '0')           // 数字归一化
    .replace(/[a-f0-9]{6,}/gi, 'HASH') // 哈希值归一化
    .slice(0, 200)

  // 从堆栈中提取关键帧（函数名+行号模式）
  const stackFrames = (err.stack || '')
    .split('\n')
    .filter(line => line.includes('at ') || line.includes('@'))
    .map(line => {
      // 只保留相对路径部分，去掉绝对路径和行号
      return line.replace(/https?:\/\/[^/]+\//, '').replace(/:\d+:\d+/g, '')
    })
    .slice(0, 5)

  return {
    type: err.type,
    messageNormalized,
    stackFrameKeys: stackFrames,
    urlBase: err.url.split('?')[0].split('#')[0],
  }
}

function computeSimilarity(a: FuzzyFingerprint, b: FuzzyFingerprint): number {
  // 类型不同 = 不同错误
  if (a.type !== b.type) return 0

  // 消息相似度（Jaccard 相似度 on word level）
  const wordsA = new Set(a.messageNormalized.split(/\s+/))
  const wordsB = new Set(b.messageNormalized.split(/\s+/))
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)))
  const union = new Set([...wordsA, ...wordsB])
  const messageSimilarity = union.size === 0 ? 1 : intersection.size / union.size

  // 堆栈帧相似度
  const frameSimilarity = a.stackFrameKeys.length === 0 || b.stackFrameKeys.length === 0
    ? 0.5
    : a.stackFrameKeys.filter(f => b.stackFrameKeys.some(bf => bf.includes(f.slice(0, 30)))).length /
      Math.max(a.stackFrameKeys.length, b.stackFrameKeys.length)

  // 加权综合
  return messageSimilarity * 0.6 + frameSimilarity * 0.4
}

// 已知错误指纹库（会话级别）
const knownErrorFingerprints = new Map<string, { fingerprint: FuzzyFingerprint; count: number; lastSeen: number }>()

function isDuplicateError(err: CapturedError): boolean {
  const fp = extractFuzzyFingerprint(err)
  const key = `${fp.type}::${fp.urlBase}`

  const existing = knownErrorFingerprints.get(key)
  if (existing) {
    const similarity = computeSimilarity(existing.fingerprint, fp)
    if (similarity >= SIMILARITY_THRESHOLD) {
      existing.count++
      existing.lastSeen = Date.now()
      return true
    }
  }

  knownErrorFingerprints.set(key, { fingerprint: fp, count: 1, lastSeen: Date.now() })
  return false
}

function getErrorOccurrenceCount(err: CapturedError): number {
  const fp = extractFuzzyFingerprint(err)
  const key = `${fp.type}::${fp.urlBase}`
  return knownErrorFingerprints.get(key)?.count || 1
}

// ============================================================
// 增强上下文捕获
// ============================================================

function captureEnhancedContext(): EnhancedContext {
  const ctx: EnhancedContext = {
    routePath: window.location.pathname,
    routeParams: window.location.search,
    environment: import.meta.env?.MODE || 'unknown',
    version: import.meta.env?.VITE_APP_VERSION || 'unknown',
    performance: {
      loadTime: performance.now ? Math.round(performance.now()) : undefined,
    },
    consoleLogs: readConsoleLogs().slice(-10),
  }

  // 尝试捕获 performance 指标
  try {
    const perf = performance.getEntriesByType('paint')
    const fcp = perf.find(e => e.name === 'first-contentful-paint')
    if (fcp) ctx.performance!.fcp = Math.round(fcp.startTime)
  } catch {}

  // 尝试捕获内存
  try {
    const mem = (performance as any).memory
    if (mem) ctx.performance!.memory = Math.round(mem.usedJSHeapSize / 1024 / 1024)
  } catch {}

  return ctx
}

// ============================================================
// Incident ID 生成（用于自动-手动关联）
// ============================================================

function generateIncidentId(): string {
  let counter = parseInt(sessionStorage.getItem(INCIDENT_COUNTER_KEY) || '0', 10) + 1
  sessionStorage.setItem(INCIDENT_COUNTER_KEY, String(counter))
  return `inc_${Date.now().toString(36)}_${counter}`
}

// ============================================================
// 工具函数
// ============================================================

function isIgnoredMessage(message: string, filename = ''): boolean {
  return IGNORED_MESSAGES.some(m => message.includes(m) || filename.includes(m))
}

function isIgnoredApiUrl(url: string): boolean {
  return IGNORED_API_URLS.test(url)
}

function getBrowserInfo() {
  return {
    browser: navigator.userAgent,
    os: navigator.platform,
    resolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    online: navigator.onLine,
  }
}

function classifySeverity(type: CapturedError['type'], status?: number): CapturedError['severity'] {
  if (type === 'error' || type === 'unhandledrejection' || type === 'chunk' || type === 'blank') return 'critical'
  if (type === 'network') return 'critical'
  if (type === 'api' && status && status >= 500) return 'critical'
  if (type === 'api' && status && (status === 429 || status >= 400)) return 'warning'
  return 'info'
}

function captureContext(
  message: string,
  type: CapturedError['type'],
  stack = '',
  metadata?: Record<string, unknown>,
  extra?: { userId?: string; username?: string }
): CapturedError {
  return {
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    incidentId: generateIncidentId(),
    message,
    stack,
    type,
    url: window.location.href,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    userId: extra?.userId,
    username: extra?.username,
    metadata,
    severity: classifySeverity(type, metadata?.status as number | undefined),
    context: captureEnhancedContext(),
  }
}

// ============================================================
// 批量上报缓冲区
// ============================================================

interface BatchItem {
  incidentId: string
  title: string
  description: string
  category: string
  severity: string
  browserInfo: ReturnType<typeof getBrowserInfo>
  type: string
  url: string
  timestamp: number
  context?: EnhancedContext
}

function readBatchBuffer(): BatchItem[] {
  try {
    const raw = localStorage.getItem(BATCH_BUFFER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeBatchBuffer(buffer: BatchItem[]) {
  try { localStorage.setItem(BATCH_BUFFER_KEY, JSON.stringify(buffer)) } catch {}
}

function addToBatchBuffer(item: BatchItem) {
  const buffer = readBatchBuffer()
  buffer.push(item)
  writeBatchBuffer(buffer)
}

function clearBatchBuffer() {
  try { localStorage.removeItem(BATCH_BUFFER_KEY) } catch {}
}

// ============================================================
// 重试队列管理
// ============================================================

interface PendingReport {
  id: string
  incidentId: string
  fingerprint: string
  title: string
  description: string
  category: string
  severity: string
  browserInfo: ReturnType<typeof getBrowserInfo>
  context?: EnhancedContext
  retryCount: number
  nextRetryAt: number
  createdAt: number
}

function readPendingQueue(): PendingReport[] {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

function writePendingQueue(queue: PendingReport[]) {
  try { localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue)) } catch {}
}

function addToPendingQueue(report: PendingReport) {
  const queue = readPendingQueue()
  const exists = queue.some(r => r.fingerprint === report.fingerprint || r.incidentId === report.incidentId)
  if (exists) return
  queue.push(report)
  writePendingQueue(queue)
}

function removeFromPendingQueue(fingerprint: string) {
  const queue = readPendingQueue().filter(r => r.fingerprint !== fingerprint)
  writePendingQueue(queue)
}

function getNextRetryDelay(retryCount: number): number {
  return RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)] * 1000
}

// ============================================================
// 后台同步
// ============================================================

async function syncPendingQueue(submitFn: (report: PendingReport) => Promise<boolean>) {
  const queue = readPendingQueue()
  if (queue.length === 0) return
  const now = Date.now()
  const remaining: PendingReport[] = []
  for (const item of queue) {
    if (item.nextRetryAt > now) {
      remaining.push(item)
      continue
    }
    try {
      const ok = await submitFn(item)
      if (ok) continue
    } catch {}
    item.retryCount++
    if (item.retryCount < MAX_RETRIES) {
      item.nextRetryAt = now + getNextRetryDelay(item.retryCount)
      remaining.push(item)
    }
    // 超过最大重试次数则丢弃
  }
  writePendingQueue(remaining)
}

// ============================================================
// 主组件
// ============================================================

export default function AutoBugDetector() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const [currentError, setCurrentError] = useState<CapturedError | null>(null)
  const [stage, setStage] = useState<RecoveryStage>('detect')
  const [showPrompt, setShowPrompt] = useState(false)
  const [showSupportMenu, setShowSupportMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportStatus, setReportStatus] = useState<'idle' | 'reporting' | 'success' | 'failed'>('idle')
  const [showGuardianBadge, setShowGuardianBadge] = useState(false)
  const [showGuardianPanel, setShowGuardianPanel] = useState(false)
  const [guardianStats, setGuardianStats] = useState<GuardianStats>(readStats)

  const patchedRef = useRef(false)
  const consoleCleanupRef = useRef<(() => void) | null>(null)
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPromptTimeRef = useRef<Record<string, number>>({})
  const reportedThisSessionRef = useRef<Set<string>>(new Set())
  const origFetchRef = useRef<typeof window.fetch | null>(null)
  const isSubmittingRef = useRef(false)
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 刷新 Guardian 统计显示
  const refreshStats = useCallback(() => {
    setGuardianStats(readStats())
  }, [])

  // ====== 批量上报 ======

  const flushBatch = useCallback(async () => {
    const buffer = readBatchBuffer()
    if (buffer.length === 0) return

    const doFetch = origFetchRef.current || window.fetch
    try {
      const res = await doFetch('/api/bug-report/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reports: buffer,
          source: 'guardian-auto',
        }),
      })
      if (res.ok) {
        const count = buffer.length
        clearBatchBuffer()
        updateGuardianStats({ batchedCount: readStats().batchedCount + count })
        refreshStats()
      }
    } catch {
      // 批量上报失败不阻塞，下次继续
    }
  }, [refreshStats])

  // ====== 单条上报 ======

  const submitReport = useCallback(async (err: CapturedError, skipDedup = false): Promise<boolean> => {
    const fp = err.incidentId
    if (!skipDedup && reportedThisSessionRef.current.has(fp)) return true
    if (isSubmittingRef.current) return false

    // 先加入批量缓冲区
    const title = err.severity === 'critical'
      ? `[自动上报] ${err.type === 'chunk' ? '路由加载失败' : err.type === 'blank' ? '页面白屏' : '运行时异常'}: ${err.message.slice(0, 40)}`
      : `[自动记录] ${err.message.slice(0, 50)}`

    const description = `Guardian 自动检测到异常：

错误类型：${err.type}
严重级别：${err.severity}
错误信息：${err.message}
页面地址：${err.url}
发生时间：${new Date(err.timestamp).toLocaleString('zh-CN')}
用户：${err.username || '未登录'}（${err.userId || 'guest'}）
关联ID：${err.incidentId}

元数据：${JSON.stringify(err.metadata || {}, null, 2)}
堆栈：${err.stack || '（无堆栈）'}

环境：${err.context?.environment || 'unknown'}
版本：${err.context?.version || 'unknown'}
路由：${err.context?.routePath || 'unknown'}`

    const batchItem: BatchItem = {
      incidentId: err.incidentId,
      title,
      description,
      category: err.type === 'api' || err.type === 'network' ? '性能问题' : '功能异常',
      severity: err.severity === 'critical' ? 'high' : err.severity === 'warning' ? 'medium' : 'low',
      browserInfo: getBrowserInfo(),
      type: err.type,
      url: err.url,
      timestamp: err.timestamp,
      context: err.context,
    }

    addToBatchBuffer(batchItem)

    // 如果缓冲区达到阈值，立即批量发送
    const buffer = readBatchBuffer()
    if (buffer.length >= BATCH_MAX_SIZE) {
      await flushBatch()
    }

    // 标记为已上报（会话级别）
    reportedThisSessionRef.current.add(fp)
    updateGuardianStats({ reportedCount: readStats().reportedCount + 1 })
    refreshStats()

    // 同时尝试单个端点发送（确保及时性）
    const doFetch = origFetchRef.current || window.fetch
    isSubmittingRef.current = true
    try {
      const res = await doFetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          category: batchItem.category,
          severity: batchItem.severity,
          browserInfo: getBrowserInfo(),
          autoDetected: true,
          incidentId: err.incidentId,
          context: err.context,
        }),
      })

      if (res.ok) {
        removeFromPendingQueue(fp)
        return true
      }

      // 服务器响应但失败，加入重试队列
      const pendingReport: PendingReport = {
        id: err.id,
        incidentId: err.incidentId,
        fingerprint: fp,
        title,
        description,
        category: batchItem.category,
        severity: batchItem.severity,
        browserInfo: getBrowserInfo(),
        context: err.context,
        retryCount: 0,
        nextRetryAt: Date.now() + getNextRetryDelay(0),
        createdAt: Date.now(),
      }
      addToPendingQueue(pendingReport)
      return false
    } catch {
      // 网络错误，加入重试队列
      const pendingReport: PendingReport = {
        id: err.id,
        incidentId: err.incidentId,
        fingerprint: fp,
        title,
        description: `Guardian 自动检测到异常（网络暂不可用，排队待上报）\n\n错误类型：${err.type}\n信息：${err.message}\n页面：${err.url}\n时间：${new Date(err.timestamp).toLocaleString('zh-CN')}`,
        category: '功能异常',
        severity: batchItem.severity,
        browserInfo: getBrowserInfo(),
        context: err.context,
        retryCount: 0,
        nextRetryAt: Date.now() + getNextRetryDelay(0),
        createdAt: Date.now(),
      }
      addToPendingQueue(pendingReport)
      return false
    } finally {
      isSubmittingRef.current = false
      setReporting(false)
    }
  }, [flushBatch, refreshStats])

  const closePrompt = useCallback(() => {
    setShowPrompt(false)
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current)
  }, [])

  const canPrompt = useCallback((err: CapturedError) => {
    const fp = err.incidentId
    const last = lastPromptTimeRef.current[fp] || 0
    if (Date.now() - last < PROMPT_THROTTLE_MS) return false
    lastPromptTimeRef.current[fp] = Date.now()
    return true
  }, [])

  const escalateIfNeeded = useCallback((err: CapturedError) => {
    const fp = err.incidentId
    const last = sessionStorage.getItem(LAST_ERROR_KEY)
    const refreshCount = parseInt(sessionStorage.getItem(REFRESH_COUNT_KEY) || '0', 10)

    if (last === fp) {
      const nextCount = refreshCount + 1
      sessionStorage.setItem(REFRESH_COUNT_KEY, String(nextCount))
      if (nextCount >= 2) {
        setStage('escalated')
        updateGuardianStats({ status: 'escalated' })
      } else {
        setStage('refresh-failed')
      }
    } else {
      sessionStorage.setItem(LAST_ERROR_KEY, fp)
      sessionStorage.setItem(REFRESH_COUNT_KEY, '0')
      setStage('reported')
    }
  }, [])

  const handleCriticalError = useCallback(async (err: CapturedError) => {
    // 智能去重：相似错误跳过
    if (isDuplicateError(err)) {
      updateGuardianStats({ dedupSkippedCount: readStats().dedupSkippedCount + 1 })
      refreshStats()
      return
    }

    const shouldPrompt = canPrompt(err)
    updateGuardianStats({
      detectedCount: readStats().detectedCount + 1,
      lastEvent: {
        type: err.type,
        message: err.message.slice(0, 120),
        time: err.timestamp,
        severity: err.severity,
      },
    })
    refreshStats()

    setReportStatus('reporting')
    setCurrentError(err)
    setShowGuardianBadge(true)
    const reported = await submitReport(err)
    setReportStatus(reported ? 'success' : 'failed')
    if (shouldPrompt) {
      escalateIfNeeded(err)
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current)
      setTimeout(() => {
        setShowPrompt(true)
        promptTimerRef.current = setTimeout(() => setShowPrompt(false), 45_000)
      }, 600)
    }
  }, [canPrompt, submitReport, escalateIfNeeded, refreshStats])

  const handleRefresh = () => {
    sessionStorage.setItem(LAST_ERROR_KEY, currentError ? currentError.incidentId : '')
    sessionStorage.setItem(REFRESH_COUNT_KEY, String(parseInt(sessionStorage.getItem(REFRESH_COUNT_KEY) || '0', 10) + 1))
    window.location.reload()
  }

  const handleHardReset = () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  const submitFromQueue = useCallback(async (report: PendingReport): Promise<boolean> => {
    const doFetch = origFetchRef.current || window.fetch
    try {
      const res = await doFetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: report.title,
          description: report.description,
          category: report.category,
          severity: report.severity,
          browserInfo: report.browserInfo,
          autoDetected: true,
          incidentId: report.incidentId,
          context: report.context,
        }),
      })
      if (res.ok) {
        updateGuardianStats({ reportedCount: readStats().reportedCount + 1 })
        refreshStats()
      }
      return res.ok
    } catch {
      return false
    }
  }, [refreshStats])

  const handleRetry = useCallback(async () => {
    if (!currentError) return
    setReportStatus('reporting')
    const reported = await submitReport(currentError, true)
    setReportStatus(reported ? 'success' : 'failed')
  }, [currentError, submitReport])

  const openSupportMenu = () => setShowSupportMenu(true)
  const closeSupportMenu = () => setShowSupportMenu(false)

  const goToBugReport = () => {
    closePrompt()
    closeSupportMenu()
    const context = currentError
      ? `Guardian 自动诊断信息：
类型：${currentError.type}
信息：${currentError.message}
页面：${currentError.url}
时间：${new Date(currentError.timestamp).toLocaleString('zh-CN')}
关联ID：${currentError.incidentId}

堆栈：
${currentError.stack || '无'}

增强上下文：
环境：${currentError.context?.environment || 'unknown'}
版本：${currentError.context?.version || 'unknown'}
路由：${currentError.context?.routePath || 'unknown'}`
      : ''
    sessionStorage.setItem('guardian_bug_context', context)
    navigate('/bug-report')
  }

  const openAIChat = () => {
    closePrompt()
    closeSupportMenu()
    window.dispatchEvent(new CustomEvent('open-ai-chat'))
  }

  // ====== 初始化：错误监听 + 批量定时器 + 控制台捕获 ======

  useEffect(() => {
    if (patchedRef.current) return
    patchedRef.current = true

    updateGuardianStats({ status: 'running' })

    // 恢复会话上报记录
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const arr = JSON.parse(saved)
        if (Array.isArray(arr)) arr.forEach(fp => reportedThisSessionRef.current.add(fp))
      }
    } catch {}

    // 安装控制台日志捕获
    consoleCleanupRef.current = installConsoleCapture()

    const userId = user?.id
    const username = user?.username

    const origFetch = window.fetch.bind(window)
    origFetchRef.current = origFetch
    window.fetch = async function patchedFetch(input, init) {
      const startTime = performance.now()
      const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      const method = init?.method || (input instanceof Request ? input.method : 'GET')

      if (isIgnoredApiUrl(urlStr)) return origFetch(input, init)

      try {
        const response = await origFetch(input, init)
        const elapsed = performance.now() - startTime

        if (!response.ok && !IGNORED_API_STATUSES.has(response.status)) {
          const cloned = response.clone()
          cloned.text().then(body => {
            let message = `API ${method} ${urlStr.slice(0, 80)}: HTTP ${response.status}`
            try {
              const parsed = JSON.parse(body)
              message = `API ${method} ${urlStr.slice(0, 80)}: ${parsed.message || parsed.error || `HTTP ${response.status}`}`
            } catch {}
            const err = captureContext(message, 'api', '', { method, url: urlStr, status: response.status, elapsed: Math.round(elapsed) }, { userId, username })
            if (err.severity === 'critical') handleCriticalError(err)
          }).catch(() => {})
        }
        return response
      } catch (err) {
        const elapsed = performance.now() - startTime
        const errMsg = err instanceof TypeError ? '网络请求失败' : (err instanceof Error ? err.message : String(err))
        const contextErr = captureContext(
          `网络错误: ${method} ${urlStr.slice(0, 80)} — ${errMsg}`,
          'network',
          err instanceof Error ? err.stack || '' : '',
          { method, url: urlStr, elapsed: Math.round(elapsed) },
          { userId, username }
        )
        handleCriticalError(contextErr)
        throw err
      }
    }

    const handleError = (event: ErrorEvent) => {
      event.preventDefault()
      const message = event.message || '未知运行时错误'
      if (isIgnoredMessage(message, event.filename || '')) return
      const err = captureContext(
        message, 'error',
        event.error?.stack || event.message || '',
        { filename: event.filename, lineno: event.lineno, colno: event.colno },
        { userId, username }
      )
      if (err.severity === 'critical') handleCriticalError(err)
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault()
      const reason = event.reason
      const msg = reason?.message || String(reason)
      if (isIgnoredMessage(msg)) return

      const isChunk = typeof msg === 'string' && (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('Loading chunk')
      )
      const err = captureContext(
        isChunk ? `路由块加载失败: ${msg.slice(0, 120)}` : msg,
        isChunk ? 'chunk' : 'unhandledrejection',
        reason?.stack || '',
        { reasonType: typeof reason },
        { userId, username }
      )
      if (err.severity === 'critical') handleCriticalError(err)
    }

    const blankCheckTimer = setTimeout(() => {
      const root = document.getElementById('root')
      const rootHasContent = root && (root.childElementCount > 0 || root.innerText.trim().length > 0)
      const bodyHasContent = document.body && document.body.innerText.trim().length > 20
      if (!rootHasContent || !bodyHasContent) {
        const err = captureContext('页面白屏：加载完成后未渲染可见内容', 'blank', '', {}, { userId, username })
        handleCriticalError(err)
      }
    }, 5000)

    // 后台同步：页面加载时处理队列
    syncPendingQueue(submitFromQueue)

    // 定时重试队列（每 60 秒）
    const retryTimer = setInterval(() => {
      syncPendingQueue(submitFromQueue)
    }, 60_000)

    // 定时批量发送（每 10 秒）
    batchTimerRef.current = setInterval(() => {
      flushBatch()
    }, BATCH_INTERVAL_MS)

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
      window.fetch = origFetch
      patchedRef.current = false
      if (consoleCleanupRef.current) consoleCleanupRef.current()
      clearTimeout(blankCheckTimer)
      clearInterval(retryTimer)
      if (batchTimerRef.current) clearInterval(batchTimerRef.current)
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current)
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(reportedThisSessionRef.current)))
      } catch {}
    }
  }, [handleCriticalError, user, flushBatch, submitFromQueue])

  // ====== UI 定义 ======

  const FLOW_STEPS = [
    { id: 'detect', label: '检测异常', sub: '系统已捕获', icon: Search },
    { id: 'report', label: '上报中', sub: '发送至技术团队', icon: Upload },
    { id: 'success', label: '上报完成', sub: '已成功送达', icon: CheckCircle },
    { id: 'track', label: '技术跟进', sub: '进入处理流程', icon: Shield },
  ] as const

  type StepStatus = 'completed' | 'active' | 'pending' | 'error'

  const getStepStatus = useCallback((stepId: string, rs: string, sg: string): StepStatus => {
    if (stepId === 'detect') return 'completed'
    if (stepId === 'report') {
      if (rs === 'reporting') return 'active'
      if (rs === 'failed') return 'error'
      if (rs === 'success') return 'completed'
      return 'active'
    }
    if (stepId === 'success') {
      if (rs === 'success') return 'active'
      if (rs === 'failed') return 'error'
      return 'pending'
    }
    if (stepId === 'track') {
      if (sg === 'escalated') return 'active'
      if (rs === 'success') return 'pending'
      return 'pending'
    }
    return 'pending'
  }, [])

  const stepStatuses = useMemo(() => {
    const s: Record<string, StepStatus> = {}
    for (const step of FLOW_STEPS) s[step.id] = getStepStatus(step.id, reportStatus, stage)
    return s
  }, [reportStatus, stage, getStepStatus])

  const typeLabel: Record<string, string> = {
    error: '运行时错误', unhandledrejection: '异步异常',
    api: '服务异常', network: '网络中断',
    chunk: '页面加载失败', blank: '页面白屏',
  }

  const stageContent = {
    detect: {
      title: '遇到一点小问题',
      desc: '系统正在自动诊断并记录错误详情，上报完成后会通知你。',
      primary: { label: '刷新页面', icon: RefreshCw, action: handleRefresh },
      secondary: { label: '忽略', icon: X, action: closePrompt },
    },
    reported: {
      title: '已自动上报',
      desc: '错误详情已成功发送，技术团队会分析并修复此问题。你可以选择立即刷新恢复，或继续浏览。',
      primary: { label: '刷新页面', icon: RefreshCw, action: handleRefresh },
      secondary: { label: '知道了', icon: X, action: closePrompt },
    },
    'refresh-failed': {
      title: '刷新后仍未恢复',
      desc: '可能是本地缓存或旧版本代码导致，建议清除缓存后重试，或提交详细反馈给我们。',
      primary: { label: '清除缓存并刷新', icon: Trash2, action: handleHardReset },
      secondary: { label: '反馈详情', icon: Bug, action: goToBugReport },
    },
    escalated: {
      title: '该问题持续出现',
      desc: '多次尝试后问题仍未解决，建议联系客服或提交详细反馈，我们会尽快处理。',
      primary: { label: '联系客服', icon: MessageCircle, action: openSupportMenu },
      secondary: { label: '再试一次', icon: RefreshCw, action: handleRefresh },
    },
  }

  const content = stageContent[stage]
  const PrimaryIcon = content.primary.icon
  const SecondaryIcon = content.secondary.icon

  // 队列统计
  const pendingQueueCount = useMemo(() => readPendingQueue().length, [reportStatus])
  const batchBufferCount = useMemo(() => readBatchBuffer().length, [reportStatus])

  return (
    <>
      {/* ====== Guardian 浮动状态指示器 ====== */}
      <AnimatePresence>
        {showGuardianBadge && !showPrompt && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed bottom-6 left-6 z-[9998]"
          >
            <motion.button
              type="button"
              onClick={() => setShowGuardianPanel(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border-primary)] shadow-lg hover:shadow-xl transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="relative">
                <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
                <motion.div
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--success)]"
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                {guardianStats.detectedCount}
              </span>
              <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
            </motion.button>

            {/* 展开面板 */}
            <AnimatePresence>
              {showGuardianPanel && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-14 left-0 w-64 bg-[var(--bg-card)]/95 backdrop-blur-xl border border-[var(--border-primary)] rounded-2xl shadow-2xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span className="text-xs font-semibold text-[var(--text-primary)]">Guardian 守护者</span>
                    </div>
                    <span className="text-[10px] text-[var(--success)] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                      运行中
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-2.5 text-center">
                      <div className="text-lg font-bold text-[var(--accent-primary)]">{guardianStats.detectedCount}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">已检测</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-2.5 text-center">
                      <div className="text-lg font-bold text-[var(--success)]">{guardianStats.reportedCount}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">已上报</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-2.5 text-center">
                      <div className="text-lg font-bold text-[var(--warning)]">{guardianStats.dedupSkippedCount}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">已去重</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-2.5 text-center">
                      <div className="text-lg font-bold text-[var(--accent-indigo)]">{guardianStats.batchedCount}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">批量上报</div>
                    </div>
                  </div>

                  {/* 队列状态 */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[var(--text-muted)] flex items-center gap-1">
                        <Clock className="w-3 h-3" /> 重试队列
                      </span>
                      <span className="font-medium text-[var(--text-secondary)]">{pendingQueueCount} 条</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[var(--text-muted)] flex items-center gap-1">
                        <Layers className="w-3 h-3" /> 批量缓冲区
                      </span>
                      <span className="font-medium text-[var(--text-secondary)]">{batchBufferCount} 条</span>
                    </div>
                  </div>

                  {guardianStats.lastEvent && (
                    <div className="border-t border-[var(--border-primary)] pt-2.5">
                      <div className="text-[9px] text-[var(--text-muted)] mb-1">最近事件</div>
                      <div className="text-[10px] text-[var(--text-secondary)] truncate">
                        {guardianStats.lastEvent.message}
                      </div>
                      <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
                        {new Date(guardianStats.lastEvent.time).toLocaleTimeString('zh-CN')}
                      </div>
                    </div>
                  )}

                  {/* 跳转按钮 */}
                  <div className="mt-3 pt-2 border-t border-[var(--border-primary)] flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowGuardianPanel(false); navigate('/bug-report') }}
                      className="flex-1 text-[10px] py-1.5 rounded-lg bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 transition-colors font-medium"
                    >
                      提交反馈
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowGuardianPanel(false); navigate('/bug-history') }}
                      className="flex-1 text-[10px] py-1.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/80 transition-colors"
                    >
                      查看记录
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== 错误弹窗 ====== */}
      <AnimatePresence>
        {showPrompt && currentError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[var(--bg-primary)]/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.8 }}
              className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-xl)] p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--warning)]/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-[var(--warning)]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{content.title}</h3>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
                    {typeLabel[currentError.type] || currentError.type}
                    {getErrorOccurrenceCount(currentError) > 1 && (
                      <span className="ml-2 text-[var(--warning)]">
                        ×{getErrorOccurrenceCount(currentError)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* 流程步骤条 */}
              <div className="mb-5">
                <div className="flex items-center justify-between">
                  {FLOW_STEPS.map((step, idx) => {
                    const st = stepStatuses[step.id]
                    const isLast = idx === FLOW_STEPS.length - 1
                    const StepIcon = step.icon
                    return (
                      <div key={step.id} className="flex items-center flex-1">
                        <div className="flex flex-col items-center">
                          <div className={`
                            relative flex items-center justify-center w-8 h-8 rounded-full
                            transition-all duration-300
                            ${st === 'completed' ? 'bg-[var(--success)] text-white shadow-[0_2px_8px_rgba(var(--success-rgb),0.35)]'
                              : st === 'active' ? 'bg-[var(--accent-primary)] text-white shadow-[0_2px_8px_rgba(var(--accent-primary-rgb),0.35)]'
                              : st === 'error' ? 'bg-[var(--warning)] text-white shadow-[0_2px_8px_rgba(var(--warning-rgb),0.35)]'
                              : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-primary)]'
                            }
                          `}>
                            {st === 'completed' ? <CheckCircle size={14} />
                              : st === 'active' ? (
                                <motion.div animate={{ scale: [1, 1.15, 1] }}
                                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                ><StepIcon size={14} /></motion.div>
                              ) : <StepIcon size={14} />
                            }
                          </div>
                          <span className={`
                            mt-1.5 text-[10px] font-medium whitespace-nowrap transition-colors duration-300
                            ${st === 'completed' ? 'text-[var(--success)]'
                              : st === 'active' ? 'text-[var(--accent-primary)]'
                              : st === 'error' ? 'text-[var(--warning)]'
                              : 'text-[var(--text-muted)]'
                            }
                          `}>{step.label}</span>
                          <span className={`
                            text-[8px] mt-0.5 whitespace-nowrap
                            ${st === 'completed' ? 'text-[var(--success)]/70'
                              : st === 'active' ? 'text-[var(--accent-primary)]/70'
                              : st === 'error' ? 'text-[var(--warning)]/70'
                              : 'text-[var(--text-muted)]/60'
                            }
                          `}>{step.sub}</span>
                        </div>
                        {!isLast && (
                          <div className={`
                            flex-1 h-px mx-2 mt-[-1.2rem] transition-colors duration-300
                            ${stepStatuses[FLOW_STEPS[idx + 1].id] === 'completed' ? 'bg-[var(--success)]/40'
                              : stepStatuses[FLOW_STEPS[idx + 1].id] === 'active' ? 'bg-[var(--accent-primary)]/30'
                              : 'bg-[var(--border-primary)]'
                            }
                          `} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                {content.desc}
              </p>

              {/* 上报状态 */}
              <AnimatePresence mode="wait">
                {reportStatus === 'reporting' && (
                  <motion.div key="reporting" initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--accent-primary)]/8 px-3.5 py-2.5 text-xs text-[var(--accent-primary)]"
                  >
                    <RefreshCw size={14} className="animate-spin shrink-0" />
                    <span>正在自动上报问题详情给技术团队...</span>
                  </motion.div>
                )}
                {reportStatus === 'success' && (
                  <motion.div key="success" initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--success)]/10 px-3.5 py-2.5 text-xs text-[var(--success)]"
                  >
                    <CheckCircle size={14} className="shrink-0" />
                    <span>上报成功 ✓ — 技术团队已收到此问题的详细报告</span>
                  </motion.div>
                )}
                {reportStatus === 'failed' && (
                  <motion.div key="failed" initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mb-4 rounded-xl bg-[var(--warning)]/10 px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2 text-xs text-[var(--warning)] mb-2">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>上报失败，已加入重试队列（最多重试 {MAX_RETRIES} 次，最长间隔 4 小时）</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {pendingQueueCount > 0 ? `队列中还有 ${pendingQueueCount} 条待上报` : '排队中...'}
                      </span>
                      <button
                        type="button" onClick={handleRetry} disabled={reporting}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--warning)]/15 hover:bg-[var(--warning)]/25 text-[10px] font-medium text-[var(--warning)] transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={10} className={reporting ? 'animate-spin' : ''} />
                        {reporting ? '重试中...' : '立即重试'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 错误详情 */}
              {currentError && (
                <motion.div initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-4 rounded-xl bg-[var(--bg-secondary)] px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <Eye size={12} className="text-[var(--text-muted)]" />
                    <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">捕获详情</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                    <span>类型：<span className="font-medium">{typeLabel[currentError.type] || currentError.type}</span></span>
                    <span>时间：<span className="font-medium">{new Date(currentError.timestamp).toLocaleTimeString('zh-CN')}</span></span>
                    <span>关联：<span className="font-medium text-[var(--accent-indigo)]">{currentError.incidentId}</span></span>
                    <span className="w-full truncate" title={currentError.message}>
                      信息：<span className="font-medium">{currentError.message.slice(0, 120)}</span>
                    </span>
                  </div>
                </motion.div>
              )}

              {reporting && (
                <p className="text-xs text-[var(--text-muted)] mb-4">正在自动上报问题...</p>
              )}

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={content.primary.action} disabled={reporting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-medium shadow-sm hover:shadow-md transition-shadow disabled:opacity-60"
                >
                  <PrimaryIcon size={16} />
                  {content.primary.label}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={content.secondary.action} disabled={reporting}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-60"
                >
                  <SecondaryIcon size={16} />
                  {content.secondary.label}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== 联系客服菜单 ====== */}
      <AnimatePresence>
        {showSupportMenu && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-[var(--bg-primary)]/70 backdrop-blur-sm"
            onClick={closeSupportMenu}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.8 }}
              className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-xl)] p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">联系客服</h3>
                <button type="button" onClick={closeSupportMenu}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors"
                ><X size={18} /></button>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-5">请选择你需要的服务方式：</p>

              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={openAIChat}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--accent-indigo)]/5 border border-[var(--border-primary)] hover:border-[var(--accent-indigo)]/20 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-indigo)]/10 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-[var(--accent-indigo)]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">AI 客服</div>
                    <div className="text-xs text-[var(--text-muted)]">7×24 在线，智能解答常见问题</div>
                  </div>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={goToBugReport}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--warning)]/5 border border-[var(--border-primary)] hover:border-[var(--warning)]/20 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--warning)]/10 flex items-center justify-center shrink-0">
                    <Bug className="w-5 h-5 text-[var(--warning)]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">反馈 Bug</div>
                    <div className="text-xs text-[var(--text-muted)]">提交错误详情，技术团队跟进</div>
                  </div>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}