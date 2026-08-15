import React, { useState, useEffect, useCallback } from 'react'
import { Shield, ShieldAlert, ShieldOff, AlertTriangle, Lock, Unlock } from 'lucide-react'

interface IsolationStatus {
  level: 'normal' | 'alert' | 'quarantine' | 'lockdown'
  isActive: boolean
  triggeredAt: number | null
  triggeredBy: string | null
  reason: string | null
  autoRecoverAt: number | null
  timeUntilRecovery: number | null
  recentDecisionEvents: any[]
  recentSensitiveAccess: any[]
  recentTokenReuse: any[]
  history: any[]
}

const LEVEL_INFO: Record<string, { label: string; color: string; icon: React.ElementType; desc: string }> = {
  normal: {
    label: '正常运行',
    color: 'bg-black/5 text-[var(--text-primary)] border-black/10',
    icon: Shield,
    desc: '系统未检测到需要隔离的威胁。',
  },
  alert: {
    label: '警戒模式',
    color: 'bg-black/50/10 text-[var(--text-secondary)] border-black/20',
    icon: ShieldAlert,
    desc: '威胁信号增加，系统正在加强审查，所有请求会被额外记录。',
  },
  quarantine: {
    label: '半隔离',
    color: 'bg-black/50/10 text-[var(--text-secondary)] border-black/20',
    icon: AlertTriangle,
    desc: '仅保留登录、健康检查等核心接口，其他外部请求被拒绝。',
  },
  lockdown: {
    label: '完全隔离',
    color: 'bg-black/10 text-[var(--text-primary)] border-black/20',
    icon: ShieldOff,
    desc: '所有外部访问被拒绝，仅本地管理员可解除隔离。',
  },
}

export function IsolationControl() {
  const [status, setStatus] = useState<IsolationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/isolation', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) setStatus(data.data)
    } catch (err) {
      setError('无法获取隔离状态')
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const timer = setInterval(fetchStatus, 10000)
    return () => clearInterval(timer)
  }, [fetchStatus])

  const activate = async (level: string) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/isolation/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ level, reason: 'manual_admin' }),
      })
      const data = await res.json()
      if (data.success) setStatus(data.data)
      else setError(data.message || '激活失败')
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const deactivate = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/isolation/deactivate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) setStatus(data.data)
      else setError(data.message || '解除失败')
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  if (!status) {
    return <div className="p-4 text-sm text-[var(--text-muted)]">正在加载隔离状态...</div>
  }

  const info = LEVEL_INFO[status.level] || LEVEL_INFO.normal
  const Icon = info.icon

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-primary)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${info.color}`}>
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">自动隔离系统</h3>
            <p className="text-xs text-[var(--text-secondary)]">{info.label} · {status.isActive ? '隔离中' : '正常'}</p>
          </div>
        </div>
        {status.isActive ? (
          <button
            onClick={deactivate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-indigo)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-indigo)]/90 disabled:opacity-50"
          >
            <Unlock className="h-3.5 w-3.5" />
            {loading ? '处理中...' : '解除隔离'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => activate('alert')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/20 bg-black/50/10 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-black/50/15 disabled:opacity-50"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              警戒
            </button>
            <button
              onClick={() => activate('quarantine')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/20 bg-black/50/10 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-black/50/15 disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              半隔离
            </button>
            <button
              onClick={() => activate('lockdown')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/20 bg-black/10 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-black/15 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              完全隔离
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-[var(--bg-secondary)]/50 p-3 text-xs text-[var(--text-secondary)]">
        {info.desc}
      </div>

      {status.reason && (
        <div className="mt-3 text-xs text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text-secondary)]">触发原因：</span>
          {status.reason}
        </div>
      )}

      {status.autoRecoverAt && (
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text-secondary)]">自动恢复：</span>
          {status.timeUntilRecovery ? `${Math.ceil(status.timeUntilRecovery / 1000 / 60)} 分钟后` : '即将恢复'}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-[var(--error)]">{error}</p>}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">{status.recentDecisionEvents.length}</p>
          <p className="text-[10px] text-[var(--text-muted)]">近期决策事件</p>
        </div>
        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">{status.recentSensitiveAccess.length}</p>
          <p className="text-[10px] text-[var(--text-muted)]">敏感访问</p>
        </div>
        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">{status.recentTokenReuse.length}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Token 重用</p>
        </div>
      </div>
    </div>
  )
}

