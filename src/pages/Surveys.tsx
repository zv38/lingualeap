import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  ClipboardList, Send, CheckCircle, AlertTriangle,
  Star, ChevronLeft, ExternalLink, FileText, HelpCircle,
} from 'lucide-react'
import InlineLoading from '../components/ui/InlineLoading'
import EmptyState from '../components/EmptyState'
import { staggerContainer, staggerItem, cardHover, buttonTap, pageEnter } from '../utils/animations'

const API_BASE = '/api'

interface ChoiceQuestion {
  id: string
  type: 'choice'
  title: string
  required: boolean
  options: string[]
}

interface TextQuestion {
  id: string
  type: 'text'
  title: string
  required: boolean
  placeholder?: string
}

interface RatingQuestion {
  id: string
  type: 'rating'
  title: string
  required: boolean
  max: number
}

type Question = ChoiceQuestion | TextQuestion | RatingQuestion

interface Survey {
  id: string
  title: string
  description: string
  questions: Question[]
  questionCount: number
  status: 'active' | 'closed'
}

type ViewState = 'list' | 'detail' | 'success'

export default function Surveys() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewState>('list')
  const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    fetchSurveys()
  }, [])

  const fetchSurveys = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/surveys`, { credentials: 'include' })
      if (!res.ok) throw new Error(`请求失败 (${res.status})`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : data.data || data.surveys || []
      setSurveys(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载问卷失败')
    } finally {
      setLoading(false)
    }
  }

  const openSurvey = (survey: Survey) => {
    setCurrentSurvey(survey)
    setAnswers({})
    setSubmitError(null)
    setView('detail')
  }

  const handleChoice = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const handleText = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const handleRating = (questionId: string, value: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async () => {
    if (!currentSurvey) return

    const missingRequired = currentSurvey.questions.filter(
      q => q.required && (answers[q.id] === undefined || answers[q.id] === '')
    )
    if (missingRequired.length > 0) {
      setSubmitError(`请完成所有必填问题`)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_BASE}/surveys/${currentSurvey.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) throw new Error(`提交失败 (${res.status})`)
      setView('success')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const goBack = () => {
    setView('list')
    setCurrentSurvey(null)
    setAnswers({})
    setSubmitError(null)
  }

  const renderQuestion = (question: Question) => {
    switch (question.type) {
      case 'choice':
        return (
          <div className="space-y-2">
            {(question as ChoiceQuestion).options.map(option => {
              const selected = answers[question.id] === option
              return (
                <motion.button
                  key={option}
                  type="button"
                  onClick={() => handleChoice(question.id, option)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                    selected
                      ? 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 text-[var(--text-primary)]'
                    : 'bg-white/40 border border-[var(--accent-primary)]/10 text-[var(--text-secondary)] hover:border-[var(--accent-primary)]/25'
                  }`}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selected ? 'border-[var(--accent-primary)]' : 'border-[var(--accent-primary)]/30'
                    }`}>
                      {selected && <div className="w-3 h-3 rounded-full bg-[var(--accent-primary)]" />}
                    </div>
                    <span>{option}</span>
                  </div>
                </motion.button>
              )
            })}
          </div>
        )

      case 'text':
        return (
          <textarea
            value={(answers[question.id] as string) || ''}
            onChange={e => handleText(question.id, e.target.value)}
            placeholder={(question as TextQuestion).placeholder || '请输入你的回答...'}
            className="w-full glass-input rounded-xl px-4 py-3 h-28 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none"
          />
        )

      case 'rating': {
        const ratingQuestion = question as RatingQuestion
        const currentRating = (answers[question.id] as number) || 0
        return (
          <div className="flex items-center gap-2">
            {Array.from({ length: ratingQuestion.max }, (_, i) => i + 1).map(value => (
              <motion.button
                key={value}
                type="button"
                onClick={() => handleRating(question.id, value)}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                className="focus:outline-none"
              >
                <Star
                  size={32}
                  className={`transition-all duration-200 ${
                    value <= currentRating
                      ? 'fill-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : 'text-[var(--accent-primary)]/20 hover:text-[var(--accent-primary)]/40'
                  }`}
                />
              </motion.button>
            ))}
            {currentRating > 0 && (
              <span className="ml-2 text-sm text-[var(--text-secondary)] font-mono">
                {currentRating}/{ratingQuestion.max}
              </span>
            )}
          </div>
        )
      }

      default:
        return null
    }
  }

  if (view === 'success' && currentSurvey) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="min-h-screen bg-[var(--bg-primary)] py-20 px-4 flex items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 22, mass: 0.8 }}
          className="max-w-md w-full glass-panel rounded-[2rem] p-12 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25, delay: 0.2 }}
          >
            <CheckCircle className="w-20 h-20 text-[var(--success)] mx-auto mb-6" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-serif text-2xl text-[var(--text-primary)] mb-2"
          >
            问卷已提交
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-[var(--text-secondary)] mb-1"
          >
            感谢你的反馈，帮助我们变得更好
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xs text-[var(--text-muted)] mb-8"
          >
            「{currentSurvey.title}」
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col gap-3"
          >
            <button
              onClick={goBack}
              className="btn-amber rounded-full px-6 py-3 flex items-center justify-center gap-2"
            >
              <ClipboardList size={16} />
              返回问卷列表
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="relative min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
      variants={pageEnter}
      initial="initial"
      animate="animate"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {view === 'detail' && currentSurvey ? (
          <>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="mb-8"
            >
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4"
              >
                <ChevronLeft size={16} />
                返回列表
              </button>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
              >
                <h1 className="font-serif text-4xl gradient-text mb-2">{currentSurvey.title}</h1>
                <p className="text-[var(--text-secondary)]">{currentSurvey.description}</p>
                <div className="ornament mt-4" />
              </motion.div>
            </motion.div>

            <motion.div
              className="glass-panel rounded-[2rem] p-8"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <div className="flex items-center gap-2 mb-6">
                <HelpCircle size={16} className="text-[var(--accent-primary)]" />
                <span className="text-sm text-[var(--text-secondary)]">
                  共 {currentSurvey.questions.length} 题
                  {currentSurvey.questions.filter(q => q.required).length > 0 && (
                    <span className="text-[var(--warning)] ml-1">
                      （{currentSurvey.questions.filter(q => q.required).length} 题必填）
                    </span>
                  )}
                </span>
              </div>

              <div className="space-y-8">
                {currentSurvey.questions.map((question, index) => (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 + index * 0.06, ease: [0.22, 1, 0.36, 1] as const }}
                  >
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-sm font-mono text-[var(--accent-primary)] w-6 shrink-0 pt-0.5">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <label className="text-sm font-medium text-[var(--text-primary)]">
                          {question.title}
                          {question.required && <span className="text-[var(--warning)] ml-1">*</span>}
                        </label>
                      </div>
                    </div>
                    <div className="ml-8">
                      {renderQuestion(question)}
                    </div>
                  </motion.div>
                ))}
              </div>

              {submitError && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 rounded-xl flex items-start gap-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.03))',
                    border: '1px solid rgba(0, 0, 0, 0.15)',
                  }}
                >
                  <AlertTriangle className="w-5 h-5 text-[var(--warning)] shrink-0 mt-0.5" />
                  <p className="text-sm text-[var(--warning)]">{submitError}</p>
                </motion.div>
              )}

              <motion.div
                className="mt-8 pt-6 border-t border-[var(--accent-primary)]/5 flex items-center justify-between"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <p className="text-xs text-[var(--text-muted)]">
                  你的反馈将帮助我们改进产品
                </p>
                <motion.button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-amber rounded-full px-8 py-3 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  {...buttonTap}
                >
                  {submitting ? (
                    <>
                      <InlineLoading size="sm" color="white" />
                      提交中...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      提交问卷
                    </>
                  )}
                </motion.button>
              </motion.div>
            </motion.div>
          </>
        ) : (
          <>
            <motion.div className="mb-10">
              <h1 className="font-serif text-5xl gradient-text">用户反馈问卷</h1>
              <p className="italic text-[var(--text-secondary)] mt-2">帮助我们改进产品</p>
              <div className="ornament mt-4" />
            </motion.div>

            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid md:grid-cols-2 gap-4"
              >
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="glass-panel rounded-[2rem] p-6">
                    <div className="h-5 w-36 bg-black/[0.04] rounded animate-pulse mb-3" />
                    <div className="h-4 w-full bg-black/[0.03] rounded animate-pulse mb-2" />
                    <div className="h-3 w-24 bg-black/[0.02] rounded animate-pulse" />
                  </div>
                ))}
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-panel rounded-[2rem] p-12 text-center"
              >
                <div className="mb-4 text-[var(--warning)]">
                  <AlertTriangle size={48} className="mx-auto" />
                </div>
                <h3 className="font-serif text-xl text-[var(--text-primary)] mb-2">加载失败</h3>
                <p className="text-[var(--text-secondary)] mb-6">{error}</p>
                <button
                  onClick={fetchSurveys}
                  className="btn-amber rounded-full px-6 py-3"
                >
                  重新加载
                </button>
              </motion.div>
            ) : surveys.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={48} />}
                title="暂无问卷"
                description="目前没有可用的问卷，请稍后再来"
                action={{ label: '刷新', onClick: fetchSurveys }}
              />
            ) : (
              <motion.div
                className="grid md:grid-cols-2 gap-4"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {surveys.map(survey => (
                  <motion.div
                    key={survey.id}
                    variants={staggerItem}
                    {...cardHover}
                    onClick={() => openSurvey(survey)}
                    className="glass-panel rounded-[2rem] p-6 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/10 flex items-center justify-center shrink-0">
                        <FileText size={24} className="text-[var(--accent-primary)]" />
                      </div>
                      <span className={`text-xs font-mono px-2 py-1 rounded-full ${
                        survey.status === 'active'
                          ? 'bg-[var(--success)]/10 text-[var(--success)]'
                          : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                      }`}>
                        {survey.status === 'active' ? '进行中' : '已结束'}
                      </span>
                    </div>
                    <h3 className="font-serif text-lg text-[var(--text-primary)] mb-1 line-clamp-1">
                      {survey.title}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-2">
                      {survey.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                        <HelpCircle size={12} />
                        {survey.questionCount || survey.questions?.length || 0} 题
                      </span>
                      <span className="text-xs text-[var(--accent-primary)] flex items-center gap-1">
                        <ExternalLink size={12} />
                        开始填写
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
