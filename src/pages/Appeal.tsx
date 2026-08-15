import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, CheckCircle, XCircle, Send, FileText } from 'lucide-react'
import { useStore } from '../store/useStore'
import { authApi } from '../utils/api'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

interface AppealItem {
  id: string
  status: 'pending' | 'reviewing' | 'approved' | 'rejected'
  createdAt: number
  updatedAt: number
  reviewedAt: number | null
  reviewNote: string | null
  reviewAction: string | null
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '待审核', color: 'var(--warning)', icon: <Clock className="w-4 h-4" /> },
  reviewing: { label: '审核中', color: 'var(--accent-primary)', icon: <FileText className="w-4 h-4" /> },
  approved: { label: '已通过', color: 'var(--success)', icon: <CheckCircle className="w-4 h-4" /> },
  rejected: { label: '已驳回', color: 'var(--error)', icon: <XCircle className="w-4 h-4" /> },
}

export default function Appeal() {
  const { user, isAuthenticated } = useStore()
  const navigate = useNavigate()
  const [contactEmail, setContactEmail] = useState('')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [loading, setLoading] = useState(false)
  const [appeals, setAppeals] = useState<AppealItem[]>([])
  const [fetching, setFetching] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth', { replace: true })
      return
    }
    loadAppeals()
  }, [isAuthenticated, navigate])

  async function loadAppeals() {
    try {
      const result = await authApi.getAppeals()
      if (result.success && result.data) {
        setAppeals(result.data)
      }
    } finally {
      setFetching(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!reason.trim() || reason.trim().length < 20) {
      setError('申诉说明至少需要 20 个字符')
      return
    }

    setLoading(true)
    try {
      const result = await authApi.submitAppeal(contactEmail, reason, evidence)
      if (result.success) {
        setMessage('申诉已提交，管理员会在 1-3 个工作日内处理')
        setReason('')
        setEvidence('')
        loadAppeals()
      } else {
        setError(result.message || '提交失败，请稍后重试')
      }
    } catch {
      setError('提交失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const status = (user?.accountStatus as string) || 'normal'
  const canAppeal = status !== 'normal' && status !== 'watch'
  const hasPending = appeals.some(a => a.status === 'pending' || a.status === 'reviewing')

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pt-8 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">账号申诉与复核</h1>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          如果您认为账号被系统误判，可以提交申诉。每个账号 7 天内只能提交一次。
        </p>

        {status !== 'normal' && (
          <Card className="mb-6 p-4 border-l-4" style={{ borderLeftColor: 'var(--error)' }}>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
              <div>
                <div className="font-semibold">当前账号状态：{STATUS_LABEL[status]?.label || status}</div>
                <div className="text-sm text-[var(--text-muted)] mt-0.5">
                  提交申诉后，管理员会复核您的账号行为与注册信息。
                </div>
              </div>
            </div>
          </Card>
        )}

        {message && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--success)]/10 text-[var(--success)] text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--error)]/10 text-[var(--error)] text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {canAppeal && !hasPending && (
          <Card className="p-6 mb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">联系邮箱</label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="用于接收审核结果"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">申诉说明 <span className="text-[var(--text-muted)]">（至少 20 字）</span></label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="请说明您认为账号被误判的原因，以及最近的正常操作"
                  className="w-full min-h-[120px] rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--bg-secondary)] p-3 text-sm outline-none focus:border-[var(--accent-indigo)] focus:ring-2 focus:ring-[var(--accent-indigo)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">补充材料 <span className="text-[var(--text-muted)]">（可选）</span></label>
                <textarea
                  value={evidence}
                  onChange={e => setEvidence(e.target.value)}
                  placeholder="可补充最近的操作时间、设备信息、网络环境等"
                  className="w-full min-h-[80px] rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--bg-secondary)] p-3 text-sm outline-none focus:border-[var(--accent-indigo)] focus:ring-2 focus:ring-[var(--accent-indigo)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? '提交中...' : <><Send className="w-4 h-4 mr-2" /> 提交申诉</>}
              </Button>
            </form>
          </Card>
        )}

        {hasPending && (
          <Card className="p-4 mb-6 bg-[var(--warning)]/5 border-[var(--warning)]/20">
            <div className="text-sm text-[var(--warning)]">
              您已有一条进行中的申诉，请等待管理员审核，暂不能提交新申诉。
            </div>
          </Card>
        )}

        <h2 className="text-lg font-semibold mb-3">申诉记录</h2>
        {fetching ? (
          <div className="text-sm text-[var(--text-muted)]">加载中...</div>
        ) : appeals.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">暂无申诉记录</div>
        ) : (
          <div className="space-y-3">
            {appeals.map(appeal => {
              const cfg = STATUS_LABEL[appeal.status] || STATUS_LABEL.pending
              return (
                <Card key={appeal.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: cfg.color }}>
                      {cfg.icon}
                      {cfg.label}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {new Date(appeal.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  {appeal.reviewNote && (
                    <div className="text-sm text-[var(--text-muted)] mt-2 pt-2 border-t border-[var(--border-input)]">
                      审核备注：{appeal.reviewNote}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
