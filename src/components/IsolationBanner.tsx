import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, AlertTriangle, ShieldOff, X } from 'lucide-react'

interface IsolationData {
  level: 'normal' | 'alert' | 'quarantine' | 'lockdown'
  isActive: boolean
  reason: string | null
  autoRecoverAt: number | null
  timeUntilRecovery: number | null
  escalationCount?: number
  ipBlocklistSize?: number
}

const LEVEL_CONFIG: Record<string, {
  icon: typeof ShieldAlert
  title: string
  bg: string
  border: string
  text: string
  desc: string
}> = {
  alert: {
    icon: ShieldAlert,
    title: '系统处于警戒模式',
    bg: 'bg-black/5/90',
    border: 'border-black/20',
    text: 'text-[var(--text-primary)]',
    desc: '安全系统已提升监控级别，正在密切关注异常访问。',
  },
  quarantine: {
    icon: AlertTriangle,
    title: '系统处于半隔离状态',
    bg: 'bg-black/5/90',
    border: 'border-black/20',
    text: 'text-[var(--text-primary)]',
    desc: '核心功能仍可使用，部分接口已受限，请联系管理员。',
  },
  lockdown: {
    icon: ShieldOff,
    title: '系统已完全隔离',
    bg: 'bg-[var(--bg-secondary)]/90',
    border: 'border-[var(--border-primary)]',
    text: 'text-[var(--text-primary)]',
    desc: '所有外部访问已被阻止，仅本地管理员可解除隔离。',
  },
}

export function IsolationBanner() {
  const [status, setStatus] = useState<IsolationData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const applyStatus = useCallback((level: string, reason?: string | null, autoRecoverAt?: number | null, extra?: Partial<IsolationData>) => {
    if (level === 'normal') {
      setStatus(null)
      return
    }
    const now = Date.now()
    const timeUntilRecovery = autoRecoverAt ? Math.max(0, autoRecoverAt - now) : null
    setStatus({
      level: level as IsolationData['level'],
      isActive: true,
      reason: reason || null,
      autoRecoverAt: autoRecoverAt || null,
      timeUntilRecovery,
      ...extra,
    })
    setDismissed(false)
  }, [])

  // 监听 API 返回的隔离事件（503 ISOLATION_BLOCKED）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      applyStatus(detail.level, detail.reason || detail.message)
    }
    window.addEventListener('system-isolation', handler)
    return () => window.removeEventListener('system-isolation', handler)
  }, [applyStatus])

  // 管理员轮询隔离状态 + 普通用户从健康检查感知
  useEffect(() => {
    let mounted = true
    let timer: ReturnType<typeof setInterval>

    const checkAdmin = async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' })
        if (!res.ok || !mounted) return
        const data = await res.json()
        const admin = data?.user?.role === 'admin' || data?.user?.isAdmin || data?.user?.requireAdminMfa
        if (mounted) setIsAdmin(admin)
      } catch {}
    }

    const fetchStatus = async () => {
      try {
        // 管理员直接查询隔离状态
        if (isAdmin) {
          const res = await fetch('/api/admin/isolation', { credentials: 'include' })
          if (!res.ok || !mounted) return
          const data = await res.json()
          if (data.success && data.data) {
            applyStatus(data.data.level, data.data.reason, data.data.autoRecoverAt, {
              escalationCount: data.data.escalationCount,
              ipBlocklistSize: data.data.ipBlocklistSize,
            })
          }
          return
        }

        // 普通用户通过 health 接口的隔离头感知（不破坏 /api/health 简洁性）
        const res = await fetch('/api/health', { credentials: 'include' })
        if (!res.ok || !mounted) return
        const level = res.headers.get('X-Isolation-Level')
        if (level && level !== 'normal') {
          applyStatus(level, '安全系统检测到威胁，已提升防御级别')
        } else {
          setStatus(null)
        }
      } catch {
        // 健康检查失败时不显示，避免打扰
      }
    }

    checkAdmin().then(() => {
      if (!mounted) return
      fetchStatus()
      timer = setInterval(fetchStatus, 15000)
    })

    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [isAdmin, applyStatus])

  if (!status || status.level === 'normal' || dismissed) return null

  const config = LEVEL_CONFIG[status.level]
  if (!config) return null

  const Icon = config.icon

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed left-0 right-0 top-16 z-[9000] border-b ${config.border} ${config.bg} backdrop-blur-md`}
      >
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-full bg-white/60 p-1.5 ${config.text}`}>
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className={`flex flex-wrap items-center gap-x-2 text-sm font-medium ${config.text}`}>
                {config.title}
                {status.timeUntilRecovery ? (
                  <span className="opacity-80 text-xs">
                    预计 {Math.ceil(status.timeUntilRecovery / 1000 / 60)} 分钟后自动恢复
                  </span>
                ) : null}
                {status.escalationCount ? (
                  <span className="opacity-80 text-xs">
                    连续触发 ×{status.escalationCount}
                  </span>
                ) : null}
              </div>
              <div className={`text-xs opacity-90 ${config.text}`}>
                {status.reason || config.desc}
                {status.ipBlocklistSize ? ` · 已封禁 ${status.ipBlocklistSize} 个 IP` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <a
                href="/security-center"
                className={`rounded-full border ${config.border} ${config.text} px-3 py-1.5 text-xs hover:bg-white/50 transition-colors`}
              >
                安全中心
              </a>
            )}
            <button
              onClick={() => setDismissed(true)}
              className={`rounded-full p-1.5 hover:bg-white/50 ${config.text} transition-colors`}
              aria-label="关闭提示"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default IsolationBanner

