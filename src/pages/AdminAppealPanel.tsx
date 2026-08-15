import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Gavel, Clock, CheckCircle, XCircle, FileText, ChevronLeft,
  Search, Filter, User, ShieldAlert, AlertTriangle, Lock, Ban,
  Info, RefreshCw, ChevronDown, Mail
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { authApi } from '../utils/api'
import { getCachedToken } from '../utils/authCache'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import EmptyState from '../components/EmptyState'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

interface AppealItem {
  id: string
  userId: string
  contactEmail: string
  reason: string
  evidence: string
  status: 'pending' | 'reviewing' | 'approved' | 'rejected'
  createdAt: number
  updatedAt: number
  reviewedAt: number | null
  reviewedBy: string | null
  reviewNote: string | null
  reviewAction: string | null
}

interface AppealListResponse {
  total: number
  page: number
  limit: number
  data: AppealItem[]
}

interface UserStatus {
  id: string
  username: string
  email: string
  accountStatus: string
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '待审核', color: 'var(--warning)', icon: <Clock className="w-4 h-4" /> },
  reviewing: { label: '审核中', color: 'var(--accent-primary)', icon: <FileText className="w-4 h-4" /> },
  approved: { label: '已通过', color: 'var(--success)', icon: <CheckCircle className="w-4 h-4" /> },
  rejected: { label: '已驳回', color: 'var(--error)', icon: <XCircle className="w-4 h-4" /> },
}

const ACCOUNT_STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  normal: { label: '正常', color: 'var(--success)', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  watch: { label: '观察', color: 'var(--warning)', icon: <Info className="w-3.5 h-3.5" /> },
  restricted: { label: '受限', color: 'var(--error)', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  frozen: { label: '冻结', color: 'var(--error)', icon: <Lock className="w-3.5 h-3.5" /> },
  banned: { label: '封禁', color: 'var(--danger)', icon: <Ban className="w-3.5 h-3.5" /> },
}

const FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'reviewing', label: '审核中' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
]

export default function AdminAppealPanel() {
  const navigate = useNavigate()
  const { addToast } = useStore()

  const [appeals, setAppeals] = useState<AppealItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({})
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    appealId: string
    decision: 'approved' | 'rejected'
  }>({ open: false, appealId: '', decision: 'approved' })

  const fetchAppeals = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' }
      if (filter !== 'all') params.status = filter
      const result = await authApi.getAdminAppeals(params)
      if (result.success && result.data) {
        const listData = result.data as AppealListResponse
        setAppeals(listData.data || [])
        setTotal(listData.total || 0)
      } else {
        addToast(result.message || '加载申诉列表失败', 'error', 3000)
      }
    } catch {
      addToast('加载申诉列表失败', 'error', 3000)
    } finally {
      setLoading(false)
    }
  }, [filter, page, addToast])

  useEffect(() => {
    fetchAppeals()
  }, [fetchAppeals])

  useEffect(() => {
    async function fetchUserStatuses() {
      const userIds = [...new Set(appeals.map(a => a.userId))]
      const map: Record<string, UserStatus> = {}
      await Promise.all(
        userIds.map(async (id) => {
          try {
            const res = await fetch(`/api/admin/users/${id}/status`, {
              headers: { Authorization: `Bearer ${getCachedToken() || ''}` },
            })
            if (res.ok) {
              const data = await res.json()
              if (data.success && data.data) {
                map[id] = data.data as UserStatus
              }
            }
          } catch {
            // ignore
          }
        })
      )
      setUserStatuses(map)
    }
    if (appeals.length > 0) fetchUserStatuses()
  }, [appeals])

  async function handleReview(decision: 'approved' | 'rejected') {
    const appealId = confirmDialog.appealId
    if (!appealId) return
    setReviewingId(appealId)
    setConfirmDialog(prev => ({ ...prev, open: false }))
    try {
      const result = await authApi.reviewAppeal(appealId, decision, reviewNote)
      if (result.success) {
        addToast(decision === 'approved' ? '申诉已通过，账号已恢复正常' : '申诉已驳回', 'success', 3000)
        setReviewNote('')
        setExpandedId(null)
        fetchAppeals()
      } else {
        addToast(result.message || '审核失败', 'error', 3000)
      }
    } catch {
      addToast('审核失败，请稍后重试', 'error', 3000)
    } finally {
      setReviewingId(null)
    }
  }

  async function handleManualStatus(userId: string, status: string) {
    try {
      const result = await authApi.updateUserStatus(userId, status, '管理员在申诉面板手动调整')
      if (result.success) {
        addToast('账号状态已更新', 'success', 3000)
        setUserStatuses(prev => ({
          ...prev,
          [userId]: { ...(prev[userId] || {} as UserStatus), accountStatus: status } as UserStatus,
        }))
      } else {
        addToast(result.message || '状态更新失败', 'error', 3000)
      }
    } catch {
      addToast('状态更新失败', 'error', 3000)
    }
  }

  const filteredAppeals = appeals.filter(a => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const user = userStatuses[a.userId]
    return (
      a.id.toLowerCase().includes(q) ||
      a.userId.toLowerCase().includes(q) ||
      a.contactEmail.toLowerCase().includes(q) ||
      a.reason.toLowerCase().includes(q) ||
      user?.username?.toLowerCase().includes(q) ||
      user?.email?.toLowerCase().includes(q)
    )
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <motion.button
                type="button"
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <ChevronLeft className="w-4 h-4" />
                返回运营中心
              </motion.button>
            </div>
            <h1 className="font-serif text-4xl gradient-text mb-2">账号申诉审核</h1>
            <p className="text-[var(--text-secondary)]">
              复核用户提交的账号状态申诉，支持误判恢复与状态手动调整
            </p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              onClick={fetchAppeals}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </motion.button>
          </div>
        </div>

        <Card className="p-5 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索申诉 ID、用户、邮箱或关键词..."
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <Filter className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setFilter(opt.value); setPage(1) }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    filter === opt.value
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--accent-primary)]/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {loading && appeals.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</div>
        ) : filteredAppeals.length === 0 ? (
          <EmptyState
            icon={<Gavel className="w-7 h-7" />}
            title="暂无申诉记录"
            description={search ? '未找到匹配的申诉，请尝试其他关键词' : '当前没有用户提交的账号申诉'}
          />
        ) : (
          <div className="space-y-4">
            {filteredAppeals.map((appeal, index) => {
              const expanded = expandedId === appeal.id
              const cfg = STATUS_LABEL[appeal.status] || STATUS_LABEL.pending
              const user = userStatuses[appeal.userId]
              const statusCfg = ACCOUNT_STATUS_LABEL[user?.accountStatus || 'normal'] || ACCOUNT_STATUS_LABEL.normal

              return (
                <motion.div
                  key={appeal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.35 }}
                >
                  <Card className={`overflow-hidden ${expanded ? 'ring-1 ring-[var(--accent-primary)]/20' : ''}`}>
                    <div
                      className="p-5 cursor-pointer"
                      onClick={() => setExpandedId(expanded ? null : appeal.id)}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                          >
                            {cfg.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[var(--text-primary)] text-sm">{appeal.id}</span>
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                              >
                                {cfg.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {user?.username || appeal.userId.slice(0, 12)}
                              </span>
                              {user?.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {user.email}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(appeal.createdAt).toLocaleString('zh-CN')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: `${statusCfg.color}12`, color: statusCfg.color }}
                          >
                            {statusCfg.icon}
                            当前状态：{statusCfg.label}
                          </span>
                          <motion.div
                            animate={{ rotate: expanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                          </motion.div>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 border-t border-[var(--border-primary)] pt-4">
                            <div className="grid md:grid-cols-2 gap-5">
                              <div>
                                <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5" />
                                  申诉说明
                                </h4>
                                <div className="bg-[var(--bg-secondary)] rounded-xl p-4 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap min-h-[100px]">
                                  {appeal.reason}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  补充材料
                                </h4>
                                <div className="bg-[var(--bg-secondary)] rounded-xl p-4 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap min-h-[100px]">
                                  {appeal.evidence || '未提供补充材料'}
                                </div>
                              </div>
                            </div>

                            {appeal.reviewNote && (
                              <div className="mt-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                                <div className="text-xs text-[var(--text-muted)] mb-1">审核备注</div>
                                <div className="text-sm text-[var(--text-primary)]">{appeal.reviewNote}</div>
                                {appeal.reviewedAt && (
                                  <div className="text-[10px] text-[var(--text-muted)] mt-2">
                                    审核时间：{new Date(appeal.reviewedAt).toLocaleString('zh-CN')}
                                  </div>
                                )}
                              </div>
                            )}

                            {appeal.status === 'pending' || appeal.status === 'reviewing' ? (
                              <div className="mt-5 space-y-4">
                                <div>
                                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                                    审核备注（可选，最多 1000 字）
                                  </label>
                                  <textarea
                                    value={reviewNote}
                                    onChange={e => setReviewNote(e.target.value)}
                                    placeholder="说明审核依据，例如：已复核注册行为与风险信号，确认为正常用户误触发。"
                                    className="w-full min-h-[100px] rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-indigo)] focus:ring-2 focus:ring-[var(--accent-indigo)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]"
                                  />
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                  <Button
                                    variant="secondary"
                                    className="flex-1"
                                    disabled={reviewingId === appeal.id}
                                    onClick={() => setConfirmDialog({ open: true, appealId: appeal.id, decision: 'rejected' })}
                                  >
                                    <XCircle className="w-4 h-4" />
                                    驳回申诉
                                  </Button>
                                  <Button
                                    className="flex-1"
                                    disabled={reviewingId === appeal.id}
                                    onClick={() => setConfirmDialog({ open: true, appealId: appeal.id, decision: 'approved' })}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                    通过并恢复账号
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            <div className="mt-5 pt-4 border-t border-[var(--border-primary)]">
                              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">手动调整账号状态</div>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(ACCOUNT_STATUS_LABEL).map(([status, cfg]) => (
                                  <button
                                    key={status}
                                    onClick={() => handleManualStatus(appeal.userId, status)}
                                    disabled={user?.accountStatus === status}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                      user?.accountStatus === status
                                        ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--accent-primary)]/10 hover:text-[var(--accent-primary)]'
                                    }`}
                                  >
                                    {cfg.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              )
            })}

            {total > 20 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  上一页
                </Button>
                <span className="text-sm text-[var(--text-muted)]">第 {page} 页</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page * 20 >= total}
                  onClick={() => setPage(p => p + 1)}
                >
                  下一页
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.decision === 'approved' ? '确认通过申诉？' : '确认驳回申诉？'}
        description={
          confirmDialog.decision === 'approved'
            ? '通过后，该用户账号状态将恢复为正常，所有功能限制将解除。'
            : '驳回后，用户当前账号状态将保持不变。请确保审核依据已写入备注。'
        }
        variant={confirmDialog.decision === 'approved' ? 'info' : 'warning'}
        confirmText={confirmDialog.decision === 'approved' ? '确认通过' : '确认驳回'}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        onConfirm={() => handleReview(confirmDialog.decision)}
      />
    </motion.div>
  )
}

