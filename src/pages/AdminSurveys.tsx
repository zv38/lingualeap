import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  Plus, FileText, X, Trash2, Eye, Clock, CheckCircle, XCircle,
  ChevronDown, ChevronUp, BarChart3, MessageSquare, Star, LogOut
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import EmptyState from '../components/EmptyState'
import Tooltip from '../components/Tooltip'
import { API_BASE, getAuthHeaders } from '../utils/api'

const spring = { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 }

interface SurveyQuestion {
  id: string
  type: 'text' | 'choice' | 'rating'
  title: string
  required: boolean
  options?: string[]
}

interface Survey {
  id: string
  title: string
  description: string
  questions: SurveyQuestion[]
  status: string
  createdAt: string
  createdBy: string
  responseCount: number
}

interface AggregatedResult {
  questionId: string
  title: string
  type: string
  total: number
  average?: string
  distribution?: { option: string; count: number }[]
  responses?: string[]
}

interface SurveyResult {
  survey: Survey
  aggregated: AggregatedResult[]
  totalResponses: number
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  active: { label: '进行中', color: 'var(--success)', bg: 'rgba(0, 0, 0, 0.08)', icon: CheckCircle },
  closed: { label: '已关闭', color: 'var(--text-muted)', bg: 'rgba(0, 0, 0, 0.06)', icon: XCircle },
}

const questionTypes = [
  { value: 'text', label: '文本', icon: MessageSquare },
  { value: 'choice', label: '选择', icon: BarChart3 },
  { value: 'rating', label: '评分', icon: Star },
]

function CreateQuestionEditor({
  question,
  onChange,
  onDelete,
  index,
}: {
  question: { title: string; type: string; options: string[] }
  onChange: (q: { title: string; type: string; options: string[] }) => void
  onDelete: () => void
  index: number
}) {
  const TypeIcon = questionTypes.find(t => t.value === question.type)?.icon || MessageSquare

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={spring}
      className="glass-card rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
          <TypeIcon className="w-3.5 h-3.5" />
          问题 {index + 1}
        </div>
        <motion.button
          type="button"
          onClick={onDelete}
          className="text-[var(--text-muted)] hover:text-[var(--warning)] transition-colors p-1"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Trash2 className="w-4 h-4" />
        </motion.button>
      </div>

      <input
        type="text"
        value={question.title}
        onChange={(e) => onChange({ ...question, title: e.target.value })}
        placeholder="请输入问题标题"
        className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
      />

      <div className="flex gap-2">
        {questionTypes.map((t) => {
          const Icon = t.icon
          const isActive = question.type === t.value
          return (
            <motion.button
              key={t.value}
              type="button"
              onClick={() => onChange({ ...question, type: t.value, options: t.value === 'choice' ? question.options : [] })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'text-white'
                  : 'text-[var(--text-secondary)] bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10'
              }`}
              style={isActive ? { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary))' } : {}}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              <Icon className="w-3 h-3" />
              {t.label}
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {question.type === 'choice' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="space-y-2 overflow-hidden"
          >
            {question.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const opts = [...question.options]
                    opts[oi] = e.target.value
                    onChange({ ...question, options: opts })
                  }}
                  placeholder={`选项 ${oi + 1}`}
                  className="flex-1 glass-input rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                />
                {question.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...question, options: question.options.filter((_, j) => j !== oi) })}
                    className="text-[var(--text-muted)] hover:text-[var(--warning)] p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            <motion.button
              type="button"
              onClick={() => onChange({ ...question, options: [...question.options, ''] })}
              className="text-xs text-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              + 添加选项
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ResultsModal({
  surveyId,
  onClose,
}: {
  surveyId: string
  onClose: () => void
}) {
  const [result, setResult] = useState<SurveyResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const headers: Record<string, string> = {}
    const authHeaders = getAuthHeaders()
    Object.assign(headers, authHeaders)
    fetch(`${API_BASE}/api/surveys/${surveyId}/results`, {
      headers,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setResult(d.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [surveyId])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 250, damping: 26, mass: 0.8 }}
        className="glass-modal rounded-[2rem] p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto relative z-10"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl gradient-text">问卷结果</h2>
          <motion.button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[var(--accent-primary)]/30 border-t-[var(--accent-primary)] rounded-full animate-spin" />
          </div>
        ) : result ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-serif text-[var(--text-primary)] mb-1">{result.survey.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">共 {result.totalResponses} 条回复</p>
            </div>

            {result.aggregated.map((q) => (
              <div key={q.questionId} className="glass-card rounded-2xl p-5 space-y-3">
                <h4 className="text-sm font-medium text-[var(--text-primary)]">{q.title}</h4>

                {q.type === 'text' && (
                  <div className="space-y-2">
                    {q.responses && q.responses.length > 0 ? (
                      q.responses.map((r, i) => (
                        <div key={i} className="text-sm text-[var(--text-secondary)] bg-[var(--accent-primary)]/3 rounded-xl px-4 py-2.5">
                          {r}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">暂无回复</p>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)]">最近 {q.responses?.length || 0} 条回复</p>
                  </div>
                )}

                {q.type === 'choice' && q.distribution && (
                  <div className="space-y-2">
                    {q.distribution.map((d) => {
                      const maxCount = Math.max(...q.distribution!.map((x) => x.count), 1)
                      const pct = Math.round((d.count / maxCount) * 100)
                      return (
                        <div key={d.option} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-secondary)]">{d.option}</span>
                            <span className="text-[var(--text-muted)]">{d.count} 票</span>
                          </div>
                          <div className="glass-progress h-2">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                              className="glass-progress-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {q.type === 'rating' && (
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold gradient-text">{q.average || '-'}</div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        平均评分
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">共 {q.total} 次评分</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-[var(--text-muted)] py-8">加载失败</p>
        )}
      </motion.div>
    </motion.div>
  )
}

function CreateSurveyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<{ title: string; type: string; options: string[] }[]>([
    { title: '', type: 'text', options: [] },
  ])
  const [submitting, setSubmitting] = useState(false)

  const addQuestion = () => {
    setQuestions([...questions, { title: '', type: 'text', options: [] }])
  }

  const updateQuestion = (index: number, q: { title: string; type: string; options: string[] }) => {
    const qs = [...questions]
    qs[index] = q
    setQuestions(qs)
  }

  const deleteQuestion = (index: number) => {
    if (questions.length <= 1) return
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!title.trim() || questions.some((q) => !q.title.trim())) return
    setSubmitting(true)

    const authHeaders = getAuthHeaders()

    try {
      const res = await fetch(`${API_BASE}/api/surveys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          questions: questions.map((q) => ({
            title: q.title.trim(),
            type: q.type,
            options: q.type === 'choice' ? q.options.filter((o) => o.trim()) : [],
          })),
        }),
      })

      const data = await res.json()
      if (data.success) {
        onCreated()
        onClose()
      }
    } catch {}
    setSubmitting(false)
  }

  const isValid = title.trim() && questions.every((q) => q.title.trim())

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 250, damping: 26, mass: 0.8 }}
        className="glass-modal rounded-[2rem] p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto relative z-10"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl gradient-text">创建问卷</h2>
          <motion.button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">问卷标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入问卷标题"
              className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">问卷描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入问卷描述（可选）"
              rows={3}
              className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-[var(--text-muted)]">问题列表</label>
              <motion.button
                type="button"
                onClick={addQuestion}
                className="flex items-center gap-1 text-xs text-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <Plus className="w-3 h-3" />
                添加问题
              </motion.button>
            </div>

            <AnimatePresence mode="popLayout">
              {questions.map((q, i) => (
                <div key={i} className="mb-3">
                  <CreateQuestionEditor
                    index={i}
                    question={q}
                    onChange={(updated) => updateQuestion(i, updated)}
                    onDelete={() => deleteQuestion(i)}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>

          <div className="flex gap-3 pt-2">
            <motion.button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 transition-all"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
            >
              取消
            </motion.button>
            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary))',
                opacity: isValid && !submitting ? 1 : 0.5,
              }}
              whileHover={isValid && !submitting ? { scale: 1.01 } : {}}
              whileTap={isValid && !submitting ? { scale: 0.97 } : {}}
            >
              {submitting ? '创建中...' : '创建问卷'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function AdminSurveys() {
  const navigate = useNavigate()
  const { user, logout } = useStore()
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [resultSurveyId, setResultSurveyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchSurveys = async () => {
    setLoading(true)
    const authHeaders = getAuthHeaders()

    try {
      const res = await fetch(`${API_BASE}/api/admin/surveys`, {
        headers: authHeaders,
      })
      const data = await res.json()
      if (data.success) setSurveys(data.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    fetchSurveys()
  }, [])

  const handleCloseSurvey = async (id: string) => {
    const authHeaders = getAuthHeaders()

    try {
      const res = await fetch(`${API_BASE}/api/surveys/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ status: 'closed' }),
      })
      const data = await res.json()
      if (data.success) fetchSurveys()
    } catch {}
  }

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.8 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
              className="font-serif text-4xl gradient-text mb-2"
            >
              问卷管理
            </motion.h1>
            <p className="text-[var(--text-secondary)]">
              欢迎回来，{user?.username} · 共 {surveys.length} 份问卷
            </p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-amber flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              <Plus className="w-4 h-4" />
              创建问卷
            </motion.button>
            <motion.button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--warning)] hover:bg-[var(--warning)]/8 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <LogOut className="w-4 h-4" />
              退出管理
            </motion.button>
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--accent-primary)]/30 border-t-[var(--accent-primary)] rounded-full animate-spin" />
            </div>
          ) : surveys.length === 0 ? (
            <EmptyState
              icon={<FileText size={48} />}
              title="暂无问卷"
              description="点击「创建问卷」按钮创建第一份问卷"
            />
          ) : (
            <div className="space-y-3">
              <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
                <div className="col-span-3">标题</div>
                <div className="col-span-1 text-center">问题数</div>
                <div className="col-span-1 text-center">响应数</div>
                <div className="col-span-2 text-center">状态</div>
                <div className="col-span-2 text-center">创建时间</div>
                <div className="col-span-3 text-center">操作</div>
              </div>

              <AnimatePresence mode="popLayout">
                {surveys.map((survey, index) => {
                  const StatusIcon = statusConfig[survey.status]?.icon || Clock
                  const status = statusConfig[survey.status] || { label: survey.status, color: 'var(--text-muted)', bg: 'rgba(0, 0, 0, 0.06)' }
                  const isExpanded = expandedId === survey.id

                  return (
                    <motion.div
                      key={survey.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, type: 'spring', stiffness: 200, damping: 24 }}
                      className="glass-card rounded-2xl overflow-hidden"
                    >
                      <motion.button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : survey.id)}
                        className="w-full p-4 text-left"
                        whileHover={{ background: 'rgba(0, 0, 0, 0.03)' }}
                        transition={spring}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                          <div className="md:col-span-3 flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: status.bg }}
                            >
                              <StatusIcon className="w-4 h-4" style={{ color: status.color }} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{survey.title}</h3>
                              {survey.description && (
                                <p className="text-[10px] text-[var(--text-muted)] truncate">{survey.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="md:col-span-1 flex md:block items-center gap-2">
                            <span className="md:hidden text-[10px] text-[var(--text-muted)]">问题数:</span>
                            <span className="text-sm text-[var(--text-secondary)]">{survey.questions.length}</span>
                          </div>

                          <div className="md:col-span-1 flex md:block items-center gap-2">
                            <span className="md:hidden text-[10px] text-[var(--text-muted)]">响应数:</span>
                            <span className="text-sm text-[var(--text-secondary)]">{survey.responseCount || 0}</span>
                          </div>

                          <div className="md:col-span-2 flex md:justify-center">
                            <span
                              className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                              style={{ color: status.color, background: status.bg }}
                            >
                              {status.label}
                            </span>
                          </div>

                          <div className="md:col-span-2 flex md:justify-center">
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {survey.createdAt ? new Date(survey.createdAt).toLocaleDateString('zh-CN') : '-'}
                            </span>
                          </div>

                          <div className="md:col-span-3 flex items-center justify-end gap-2">
                            <Tooltip content="查看结果">
                              <motion.button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setResultSurveyId(survey.id)
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent-primary)] bg-[var(--accent-primary)]/8 hover:bg-[var(--accent-primary)]/15 transition-all"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                              >
                                <Eye className="w-3 h-3" />
                                <span className="hidden sm:inline">查看结果</span>
                              </motion.button>
                            </Tooltip>

                            {survey.status === 'active' && (
                              <Tooltip content="关闭问卷">
                                <motion.button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCloseSurvey(survey.id)
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--warning)] bg-[var(--warning)]/8 hover:bg-[var(--warning)]/15 transition-all"
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.97 }}
                                >
                                  <XCircle className="w-3 h-3" />
                                  <span className="hidden sm:inline">关闭</span>
                                </motion.button>
                              </Tooltip>
                            )}

                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                            )}
                          </div>
                        </div>
                      </motion.button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 space-y-3 border-t border-[var(--accent-primary)]/5 pt-4">
                              <h4 className="text-xs font-medium text-[var(--text-muted)]">问题列表</h4>
                              {survey.questions.map((q, qi) => (
                                <div key={q.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                  <span className="text-[10px] font-mono text-[var(--text-muted)] w-5">{qi + 1}.</span>
                                  <span className="flex-1">{q.title}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                                    color: q.type === 'text' ? 'var(--success)'
                                      : q.type === 'choice' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                    background: q.type === 'text' ? 'rgba(0, 0, 0, 0.08)'
                                      : q.type === 'choice' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                                  }}>
                                    {questionTypes.find(t => t.value === q.type)?.label || q.type}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateSurveyModal
            onClose={() => setShowCreate(false)}
            onCreated={fetchSurveys}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {resultSurveyId && (
          <ResultsModal
            surveyId={resultSurveyId}
            onClose={() => setResultSurveyId(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
