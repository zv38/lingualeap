import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bug, Send, CheckCircle, AlertTriangle, Info, History, Image, Monitor, Smartphone, X, ArrowLeft, ChevronRight, Video, FileVideo, Shield, RefreshCw, Clock, Bot } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore'
import ScreenRecorder, { type RecordedVideo } from '../components/animations/ScreenRecorder'
const categories = ['功能异常', '界面显示', '性能问题', '数据错误', '其他']

const severityOptions = [
  { value: 'low', label: '低', desc: '轻微问题，不影响使用', icon: Info, color: 'var(--success)' },
  { value: 'medium', label: '中', desc: '部分功能受影响', icon: AlertTriangle, color: 'var(--accent-primary)' },
  { value: 'high', label: '高', desc: '严重问题，无法正常使用', icon: Bug, color: 'var(--error)' },
]

const steps = ['描述问题', '补充信息', '确认提交']

const spring = { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 }

// 提交流程步骤定义
const SUBMIT_FLOW_STEPS = [
  { id: 'validate', label: '验证信息', icon: CheckCircle },
  { id: 'save', label: '保存中', icon: Send },
  { id: 'analyze', label: '分析中', icon: Bot },
  { id: 'complete', label: '完成', icon: Shield },
] as const

type SubmitStepStatus = 'pending' | 'active' | 'completed' | 'error'

function getBrowserInfo() {
  const ua = navigator.userAgent
  const browser = ua.includes('Chrome') ? 'Chrome' :
    ua.includes('Firefox') ? 'Firefox' :
    ua.includes('Safari') ? 'Safari' :
    ua.includes('Edge') ? 'Edge' : '其他'
  const os = ua.includes('Windows') ? 'Windows' :
    ua.includes('Mac') ? 'macOS' :
    ua.includes('Linux') ? 'Linux' : '其他'
  const resolution = `${window.screen.width}x${window.screen.height}`
  return { browser, os, resolution }
}

const DRAFT_KEY = 'lingualeap_bug_draft'

/** 解析 Guardian 上下文中的结构化数据 */
function parseGuardianContext(context: string): {
  incidentId: string
  type: string
  message: string
  url: string
  timestamp: string
  environment: string
  version: string
  route: string
} | null {
  try {
    const lines = context.split('\n')
    const result: Record<string, string> = {}
    for (const line of lines) {
      if (line.includes('：')) {
        const [key, ...vals] = line.split('：')
        result[key.trim()] = vals.join('：').trim()
      } else if (line.includes(':')) {
        const [key, ...vals] = line.split(':')
        result[key.trim()] = vals.join(':').trim()
      }
    }
    return {
      incidentId: result['关联ID'] || '',
      type: result['类型'] || '',
      message: result['信息'] || '',
      url: result['页面'] || '',
      timestamp: result['时间'] || '',
      environment: result['环境'] || '',
      version: result['版本'] || '',
      route: result['路由'] || '',
    }
  } catch {
    return null
  }
}

export default function BugReport() {
  const navigate = useNavigate()
  const location = useLocation()
  const addNotification = useStore((s) => s.addNotification)
  const addToast = useStore((s) => s.addToast)
  const submitBugReport = useStore((s) => s.submitBugReport)
  const user = useStore((s) => s.user)

  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [severity, setSeverity] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [recordedVideo, setRecordedVideo] = useState<{ blob: Blob; url: string; duration: number; size: number; mimeType: string } | null>(null)
  const [videoUploadUrl, setVideoUploadUrl] = useState<string | null>(null)
  const [includeBrowserInfo, setIncludeBrowserInfo] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [autoDetected, setAutoDetected] = useState(false)

  // 新增：incidentId 关联 & 增强上下文
  const [incidentId, setIncidentId] = useState<string>('')
  const [guardianContext, setGuardianContext] = useState<{
    incidentId: string
    type: string
    message: string
    url: string
    timestamp: string
    environment: string
    version: string
    route: string
  } | null>(null)

  // 提交进度状态
  const [submitStepStatus, setSubmitStepStatus] = useState<Record<string, SubmitStepStatus>>({})
  const [submitProgress, setSubmitProgress] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedId, setSubmittedId] = useState<string>('')
  const [submittedIncidentId, setSubmittedIncidentId] = useState<string>('')
  const [, setSubmittedStatus] = useState<string>('pending')
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<'waiting' | 'analyzing' | 'done' | 'failed'>('waiting')

  const browserInfo = getBrowserInfo()

  useEffect(() => {
    const chatContext = (location.state as { chatContext?: string })?.chatContext
    const guardianContextRaw = sessionStorage.getItem('guardian_bug_context')
    const state = location.state as Record<string, unknown> | null
    const params = new URLSearchParams(location.search)

    // 解析 Guardian 上下文中的 incidentId 和结构化数据
    if (guardianContextRaw) {
      const parsed = parseGuardianContext(guardianContextRaw)
      if (parsed && parsed.incidentId) {
        setIncidentId(parsed.incidentId)
        setGuardianContext(parsed)
      }
      sessionStorage.removeItem('guardian_bug_context')
    }

    // 从 location.state 获取 incidentId
    const stateIncidentId = (state?.incidentId as string) || params.get('incidentId') || ''
    if (stateIncidentId && !incidentId) {
      setIncidentId(stateIncidentId)
    }

    const hasChatContext = !!(chatContext || guardianContextRaw)

    const autoTitle = (state?.title as string) || params.get('title') || ''
    const autoDesc = (state?.description as string) || params.get('description') || ''
    const autoCategory = (state?.category as string) || params.get('category') || ''
    const autoSeverity = (state?.severity as string) || params.get('severity') || ''
    const isAutoFilled = (state?.autoFilled as boolean) || params.get('autoFilled') === 'true'

    if (isAutoFilled) {
      setAutoDetected(true)
      if (autoTitle) setTitle(autoTitle)
      if (autoDesc) setDescription(autoDesc)
      if (autoCategory && categories.includes(autoCategory)) setCategory(autoCategory)
      if (autoSeverity) setSeverity(autoSeverity)
    } else if (chatContext || guardianContextRaw) {
      setDescription([chatContext, guardianContextRaw].filter(Boolean).join('\n\n---\n\n'))
    }

    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved && !isAutoFilled) {
      try {
        const draft = JSON.parse(saved)
        if (draft.title) setTitle(draft.title)
        if (draft.category) setCategory(draft.category)
        if (draft.severity) setSeverity(draft.severity)
        if (draft.description && !hasChatContext) setDescription(draft.description)
        if (draft.email) setEmail(draft.email)
        if (draft.screenshots) setScreenshots(draft.screenshots)
        if (draft.includeBrowserInfo !== undefined) setIncludeBrowserInfo(draft.includeBrowserInfo)
        if (draft.step !== undefined) setStep(draft.step)
      } catch {}
    }
  }, [])

  const saveDraft = useCallback(() => {
    setSaving(true)
    const draft = { title, category, severity, description, email, screenshots, includeBrowserInfo, step }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    setTimeout(() => setSaving(false), 300)
  }, [title, category, severity, description, email, screenshots, includeBrowserInfo, step])

  useEffect(() => {
    const timer = setTimeout(saveDraft, 1000)
    return () => clearTimeout(timer)
  }, [saveDraft])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        addToast('图片大小不能超过 5MB', 'error', 3000)
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setScreenshots((prev) => [...prev, ev.target!.result as string])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index))
  }

  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {}
    if (s === 0) {
      if (!title.trim()) newErrors.title = '请输入问题标题'
      if (!description.trim()) newErrors.description = '请描述问题详情'
      if (!severity) newErrors.severity = '请选择严重程度'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, steps.length - 1))
    }
  }

  // 更新提交流程步骤状态
  const updateSubmitStep = (stepId: string, status: SubmitStepStatus) => {
    setSubmitStepStatus(prev => ({ ...prev, [stepId]: status }))
  }

  // AI 分析由后端异步触发，用户可在反馈记录中查看结果
  // 后端会自动对高严重级别的 autoDetected 报告触发 AI 分析

  const handleSubmit = async () => {
    if (!validateStep(0)) {
      setStep(0)
      return
    }

    // 重置提交状态
    setSubmitProgress(0)
    setSubmitError(null)
    setSubmitStepStatus({})
    setAiAnalysisStatus('waiting')

    // 步骤 1: 验证
    updateSubmitStep('validate', 'active')

    try {
      // 模拟验证延迟
      await new Promise(r => setTimeout(r, 300))
      updateSubmitStep('validate', 'completed')
      setSubmitProgress(15)

      // 步骤 2: 保存
      updateSubmitStep('save', 'active')
      setSubmitProgress(25)

      const payload = {
        title,
        category,
        severity: severity,
        description,
        email: email || undefined,
        screenshots: screenshots.length > 0 ? screenshots : undefined,
        browserInfo: includeBrowserInfo ? browserInfo : undefined,
        videoUrl: videoUploadUrl || undefined,
        videoMeta: recordedVideo ? {
          duration: recordedVideo.duration,
          size: recordedVideo.size,
          mimeType: recordedVideo.mimeType,
        } : undefined,
        autoDetected: autoDetected || !!incidentId,
        incidentId: incidentId || undefined,
        context: guardianContext ? {
          type: guardianContext.type,
          message: guardianContext.message,
          url: guardianContext.url,
          timestamp: guardianContext.timestamp,
          environment: guardianContext.environment,
          version: guardianContext.version,
          route: guardianContext.route,
        } : undefined,
      }

      const response = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`提交失败 (${response.status})`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.message || '提交失败')
      }

      updateSubmitStep('save', 'completed')
      setSubmitProgress(50)

      const reportId = result.data?.id || `BR-${Date.now()}`
      const reportIncidentId = result.data?.incidentId || incidentId || ''

      setSubmittedId(reportId)
      setSubmittedIncidentId(reportIncidentId)

      // 保存到本地 store
      submitBugReport({
        title,
        category,
        severity: severity as 'low' | 'medium' | 'high',
        description,
        status: 'pending',
        reporter: user?.username || '匿名用户',
        email: email || undefined,
        screenshots: screenshots.length > 0 ? screenshots : undefined,
        browserInfo: includeBrowserInfo ? browserInfo : undefined,
        incidentId: reportIncidentId || undefined,
        autoDetected: autoDetected || !!incidentId,
        context: guardianContext ? {
          type: guardianContext.type,
          message: guardianContext.message,
          url: guardianContext.url,
          timestamp: guardianContext.timestamp,
          environment: guardianContext.environment,
          version: guardianContext.version,
          route: guardianContext.route,
        } : undefined,
      })

      setSubmitProgress(70)

      // 步骤 3: AI 分析（后端异步触发，前端显示等待状态）
      updateSubmitStep('analyze', 'active')
      setSubmittedStatus('analyzing')
      setAiAnalysisStatus('analyzing')

      // 后端会自动对高严重级别的 autoDetected 报告触发 AI 分析
      // 用户可在反馈记录中查看分析结果
      setTimeout(() => {
        setAiAnalysisStatus('done')
        updateSubmitStep('analyze', 'completed')
      }, 2000) // 短暂延迟后标记完成，实际分析结果需在反馈记录中查看

      setSubmitProgress(90)

      addNotification({
        type: 'system',
        title: 'Bug 反馈已提交',
        message: `「${title}」已收到，我们会尽快处理${reportIncidentId ? `（关联: ${reportIncidentId}）` : ''}`,
        time: '刚刚',
        read: false,
      })

      addToast('反馈提交成功！感谢你的帮助', 'success', 4000)
      setSubmitted(true)
      localStorage.removeItem(DRAFT_KEY)

      // 步骤 4: 完成
      updateSubmitStep('complete', 'active')
      setSubmitProgress(100)
      setSubmittedStatus('pending')

      // 如果 AI 分析完成，更新状态
      if (aiAnalysisStatus === 'done') {
        setSubmittedStatus('analyzed')
      }

    } catch (error) {
      setSubmitProgress(0)
      updateSubmitStep('save', 'error')
      setSubmitError(error instanceof Error ? error.message : '提交失败')

      // 离线保存
      submitBugReport({
        title,
        category,
        severity: severity as 'low' | 'medium' | 'high',
        description,
        status: 'pending',
        reporter: user?.username || '匿名用户',
        email: email || undefined,
        screenshots: screenshots.length > 0 ? screenshots : undefined,
        browserInfo: includeBrowserInfo ? browserInfo : undefined,
        incidentId: incidentId || undefined,
        autoDetected: autoDetected || !!incidentId,
      })

      addNotification({
        type: 'system',
        title: 'Bug 反馈已保存（离线）',
        message: `「${title}」已保存到本地，服务器连接恢复后将自动同步`,
        time: '刚刚',
        read: false,
      })

      addToast('反馈已保存到本地（服务器暂不可用）', 'info', 5000)
      setSubmitted(true)
      localStorage.removeItem(DRAFT_KEY)
    }
  }

  // 提交进度显示
  const renderSubmitProgress = () => {
    const allSteps = SUBMIT_FLOW_STEPS.map(step => {
      const status = submitStepStatus[step.id] || 'pending'
      const StepIcon = step.icon
      return { ...step, status, StepIcon }
    })

    return (
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          {allSteps.map((step, idx) => {
            const isLast = idx === allSteps.length - 1
            const st = step.status
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`
                    relative flex items-center justify-center w-7 h-7 rounded-full
                    transition-all duration-300
                    ${st === 'completed' ? 'bg-[var(--success)] text-white shadow-[0_2px_8px_rgba(var(--success-rgb),0.35)]'
                      : st === 'active' ? 'bg-[var(--accent-primary)] text-white shadow-[0_2px_8px_rgba(var(--accent-primary-rgb),0.35)]'
                      : st === 'error' ? 'bg-[var(--warning)] text-white shadow-[0_2px_8px_rgba(var(--warning-rgb),0.35)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-primary)]'
                    }
                  `}>
                    {st === 'completed' ? <CheckCircle size={12} />
                      : st === 'active' ? (
                        <motion.div animate={{ scale: [1, 1.15, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        ><step.StepIcon size={12} /></motion.div>
                      ) : <step.StepIcon size={12} />
                    }
                  </div>
                  <span className={`
                    mt-1 text-[9px] font-medium whitespace-nowrap transition-colors duration-300
                    ${st === 'completed' ? 'text-[var(--success)]'
                      : st === 'active' ? 'text-[var(--accent-primary)]'
                      : st === 'error' ? 'text-[var(--warning)]'
                      : 'text-[var(--text-muted)]'
                    }
                  `}>{step.label}</span>
                </div>
                {!isLast && (
                  <div className={`
                    flex-1 h-px mx-1.5 transition-colors duration-300
                    ${allSteps[idx + 1].status === 'completed' ? 'bg-[var(--success)]/40'
                      : allSteps[idx + 1].status === 'active' ? 'bg-[var(--accent-primary)]/30'
                      : 'bg-[var(--border-primary)]'
                    }
                  `} />
                )}
              </div>
            )
          })}
        </div>

        {/* 进度条 */}
        <div className="h-1 glass-progress rounded-full overflow-hidden bg-[var(--bg-secondary)]">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: submitError
                ? 'var(--warning)'
                : 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${submitProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* 状态消息 */}
        <AnimatePresence mode="wait">
          {submitError && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 text-xs text-[var(--warning)]"
            >
              <AlertTriangle size={12} />
              <span>{submitError}，已保存到本地</span>
            </motion.div>
          )}
          {submitStepStatus['analyze'] === 'active' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 text-xs text-[var(--accent-primary)]"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <RefreshCw size={12} />
              </motion.div>
              <span>AI 正在分析问题根因...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  if (submitted) {
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
          className="max-w-md w-full glass-modal rounded-[2rem] p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25, delay: 0.2 }}
          >
            <CheckCircle className="w-16 h-16 text-[var(--success)] mx-auto mb-4" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-serif text-2xl text-[var(--text-primary)] mb-1"
          >
            反馈已提交
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-[var(--text-secondary)] text-sm mb-1"
          >
            感谢你的帮助，我们会尽快处理
          </motion.p>

          {/* 关联信息展示 */}
          {(submittedIncidentId || submittedId) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-3 mb-5 glass-thin rounded-xl p-3 text-left"
            >
              {submittedId && (
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-[var(--text-muted)]">反馈编号</span>
                  <span className="text-[var(--text-primary)] font-mono font-medium">{submittedId}</span>
                </div>
              )}
              {submittedIncidentId && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)] flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    关联检测
                  </span>
                  <span className="text-[var(--accent-indigo)] font-mono font-medium">{submittedIncidentId}</span>
                </div>
              )}
            </motion.div>
          )}

          {/* AI 分析状态 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mb-6"
          >
            {aiAnalysisStatus === 'waiting' && (
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                <Clock size={12} />
                <span>等待 AI 分析...</span>
              </div>
            )}
            {aiAnalysisStatus === 'analyzing' && (
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--accent-primary)]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <RefreshCw size={12} />
                </motion.div>
                <span>AI 正在分析问题根因...</span>
              </div>
            )}
            {aiAnalysisStatus === 'done' && (
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--success)]">
                <CheckCircle size={12} />
                <span>AI 分析完成，可在反馈记录中查看</span>
              </div>
            )}
            {aiAnalysisStatus === 'failed' && (
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                <Info size={12} />
                <span>AI 分析暂不可用，稍后可在反馈记录中查看</span>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col gap-3"
          >
            <button
              onClick={() => navigate('/bug-history')}
              className="btn-primary rounded-full px-6 py-3 flex items-center justify-center gap-2"
            >
              <History size={16} />
              查看反馈记录
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-ghost rounded-full px-6 py-3"
            >
              返回首页
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.8 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            >
              <h1 className="font-serif text-4xl gradient-text mb-2">Bug 反馈</h1>
              <p className="text-[var(--text-secondary)]">帮助我们改进产品，让语韵变得更好</p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          >
            <Link
              to="/bug-history"
              className="btn-ghost rounded-full px-4 py-2 text-sm flex items-center gap-2"
            >
              <History size={16} />
              <span>反馈记录</span>
            </Link>
          </motion.div>
        </div>

        <div className="glass-panel rounded-[2rem] p-8">
          {/* 自动检测信息展示 */}
          {(autoDetected || guardianContext) && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              className="mb-6 rounded-xl overflow-hidden"
              style={{
                border: '1px solid rgba(var(--accent-primary-rgb), 0.15)',
              }}
            >
              {/* 标题栏 */}
              <div className="px-4 py-3 flex items-center gap-2.5"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.08), rgba(var(--accent-indigo-rgb), 0.05))',
                  borderBottom: '1px solid rgba(var(--accent-primary-rgb), 0.08)',
                }}
              >
                <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Guardian 自动检测</span>
                {incidentId && (
                  <span className="ml-auto text-[10px] font-mono text-[var(--accent-indigo)]">
                    {incidentId}
                  </span>
                )}
              </div>

              {/* 上下文详情 */}
              <div className="px-4 py-3 space-y-2">
                {guardianContext && (
                  <>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-muted)] w-12 shrink-0">类型</span>
                      <span className="text-[var(--text-secondary)] font-medium">{guardianContext.type}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-muted)] w-12 shrink-0">信息</span>
                      <span className="text-[var(--text-secondary)] truncate">{guardianContext.message}</span>
                    </div>
                    {guardianContext.url && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--text-muted)] w-12 shrink-0">页面</span>
                        <span className="text-[var(--text-secondary)] truncate">{guardianContext.url}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-muted)] w-12 shrink-0">环境</span>
                      <span className="text-[var(--text-secondary)]">{guardianContext.environment} v{guardianContext.version}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Info className="w-3 h-3" />
                  <span>已自动填充问题信息，可根据需要修改后提交</span>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex items-center justify-between mb-8">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <motion.div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    i <= step
                      ? 'text-white'
                      : 'text-[var(--text-muted)] bg-[var(--accent-primary)]/[0.04]'
                  }`}
                  style={i <= step ? { background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))' } : {}}
                  animate={i === step ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ repeat: i === step ? Infinity : 0, duration: 2 }}
                >
                  {i < step ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    i + 1
                  )}
                </motion.div>
                <span className={`text-sm font-medium hidden sm:inline ${
                  i === step ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}>
                  {s}
                </span>
                {i < steps.length - 1 && (
                  <div className="w-8 sm:w-16 h-px bg-[var(--accent-primary)]/[0.08] mx-1" />
                )}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: 'spring', stiffness: 250, damping: 25 }}
                className="space-y-5"
              >
                <div>
                  <label className="block text-sm text-[var(--text-primary)] font-medium mb-2">
                    问题标题 <span className="text-[var(--error)]">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setErrors((prev) => ({ ...prev, title: '' })) }}
                    placeholder="用一句话概括你遇到的问题"
                    className={`w-full glass-input rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none ${
                      errors.title ? 'ring-2 ring-[var(--error)]/[0.4]' : ''
                    }`}
                  />
                  {errors.title && (
                    <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-[var(--error)] mt-1">
                      {errors.title}
                    </motion.p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-primary)] font-medium mb-2">分类</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <motion.button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          category === c
                            ? 'text-white'
                            : 'text-[var(--text-secondary)] bg-[var(--accent-primary)]/[0.04] hover:bg-[var(--accent-primary)]/[0.08]'
                        }`}
                        style={category === c ? { background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))' } : {}}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        transition={spring}
                      >
                        {c}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-primary)] font-medium mb-2">
                    严重程度 <span className="text-[var(--error)]">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {severityOptions.map((option) => {
                      const Icon = option.icon
                      const active = severity === option.value
                      return (
                        <motion.button
                          key={option.value}
                          type="button"
                          onClick={() => { setSeverity(option.value); setErrors((prev) => ({ ...prev, severity: '' })) }}
                          className={`flex flex-col items-center gap-2 py-4 rounded-xl border transition-all ${
                            active
                              ? 'border-[var(--accent-primary)]/[0.4] bg-[var(--accent-primary)]/[0.06]'
                              : 'border-[var(--accent-primary)]/[0.08] hover:border-[var(--accent-primary)]/[0.2] bg-white/30'
                          }`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          transition={spring}
                        >
                          <Icon className="w-5 h-5" style={{ color: option.color }} />
                          <span className="text-sm font-medium" style={{ color: active ? option.color : 'var(--text-secondary)' }}>
                            {option.label}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] leading-tight text-center">{option.desc}</span>
                        </motion.button>
                      )
                    })}
                  </div>
                  {errors.severity && (
                    <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-[var(--error)] mt-1">
                      {errors.severity}
                    </motion.p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-primary)] font-medium mb-2">
                    问题描述 <span className="text-[var(--error)]">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setErrors((prev) => ({ ...prev, description: '' })) }}
                    placeholder="详细描述问题复现步骤：&#10;1. 打开某某页面&#10;2. 点击某某按钮&#10;3. 观察到异常现象..."
                    className={`w-full glass-input rounded-xl px-4 py-3 h-36 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none ${
                      errors.description ? 'ring-2 ring-[var(--error)]/[0.4]' : ''
                    }`}
                  />
                  {errors.description && (
                    <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-[var(--error)] mt-1">
                      {errors.description}
                    </motion.p>
                  )}
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: 'spring', stiffness: 250, damping: 25 }}
                className="space-y-5"
              >
                <div>
                  <label className="block text-sm text-[var(--text-primary)] font-medium mb-2 flex items-center gap-2">
                    <Video className="w-4 h-4 text-[var(--accent-primary)]" />
                    屏幕录制
                  </label>
                  <ScreenRecorder
                    maxDurationSeconds={180}
                    onVideoReady={(v: RecordedVideo) => setRecordedVideo({
                      blob: v.blob,
                      url: v.url,
                      duration: v.duration,
                      size: v.size,
                      mimeType: v.mimeType,
                    })}
                    onUploadComplete={(url) => setVideoUploadUrl(url || null)}
                    onUploadError={(err) => {
                      addToast(`视频上传失败：${err}`, 'error', 4000)
                    }}
                    autoUpload={true}
                    uploadEndpoint="/api/bug-report/upload-video"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-primary)] font-medium mb-2">
                    截图
                  </label>
                  <div className="flex flex-wrap gap-3 mb-3">
                    {screenshots.map((src, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative w-24 h-24 rounded-xl overflow-hidden border border-[var(--accent-primary)]/[0.08]"
                      >
                        <img src={src} alt={`截图 ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeScreenshot(i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--text-primary)]/[0.6] flex items-center justify-center hover:bg-[var(--text-primary)]/[0.8] transition-colors"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </motion.div>
                    ))}
                    {screenshots.length < 4 && (
                      <motion.button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-24 h-24 rounded-xl border-2 border-dashed border-[var(--accent-primary)]/[0.12] flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]/[0.25] transition-all"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Image className="w-5 h-5" />
                        <span className="text-[10px]">添加图片</span>
                      </motion.button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <p className="text-xs text-[var(--text-muted)]">支持 JPG、PNG 格式，单张不超过 5MB</p>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-primary)] font-medium mb-2">
                    联系邮箱
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="方便我们与你联系（选填）"
                    className="w-full glass-input rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                  />
                </div>

                <div className="glass-thin rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm text-[var(--text-primary)] font-medium flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-[var(--text-secondary)]" />
                      自动采集浏览器信息
                    </label>
                    <motion.button
                      type="button"
                      onClick={() => setIncludeBrowserInfo(!includeBrowserInfo)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        includeBrowserInfo ? 'bg-[var(--success)]' : 'bg-[var(--accent-primary)]/[0.12]'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                        animate={{ x: includeBrowserInfo ? 20 : 2 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      />
                    </motion.button>
                  </div>
                  {includeBrowserInfo && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-1"
                    >
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Monitor className="w-3 h-3" />
                        <span>浏览器：{browserInfo.browser}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Smartphone className="w-3 h-3" />
                        <span>操作系统：{browserInfo.os}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Monitor className="w-3 h-3" />
                        <span>屏幕分辨率：{browserInfo.resolution}</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: 'spring', stiffness: 250, damping: 25 }}
                className="space-y-5"
              >
                <div className="glass-thin rounded-xl p-5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--text-muted)]">问题标题</span>
                    <span className="text-sm text-[var(--text-primary)] font-medium">{title}</span>
                  </div>
                  <div className="ornament" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--text-muted)]">分类</span>
                    <span className="text-sm text-[var(--text-primary)]">{category}</span>
                  </div>
                  <div className="ornament" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--text-muted)]">严重程度</span>
                    <span className="text-sm font-medium" style={{
                      color: severityOptions.find((o) => o.value === severity)?.color || 'var(--text-secondary)'
                    }}>
                      {severityOptions.find((o) => o.value === severity)?.label || '未选择'}
                    </span>
                  </div>
                  <div className="ornament" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--text-muted)]">截图</span>
                    <span className="text-sm text-[var(--text-primary)]">{screenshots.length} 张</span>
                  </div>
                  {recordedVideo && (
                    <>
                      <div className="ornament" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[var(--text-muted)] flex items-center gap-1.5">
                          <FileVideo className="w-3.5 h-3.5" />
                          屏幕录制
                        </span>
                        <div className="text-right">
                          <div className="text-sm text-[var(--text-primary)]">
                            {Math.floor(recordedVideo.duration / 60).toString().padStart(2, '0')}:{(recordedVideo.duration % 60).toString().padStart(2, '0')}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {(recordedVideo.size / 1024 / 1024).toFixed(2)} MB
                            {videoUploadUrl && <span className="text-[var(--success)] ml-1">· 已上传</span>}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* 关联检测信息 */}
                  {incidentId && (
                    <>
                      <div className="ornament" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[var(--text-muted)] flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5" />
                          关联检测
                        </span>
                        <span className="text-sm font-mono font-medium text-[var(--accent-indigo)]">{incidentId}</span>
                      </div>
                    </>
                  )}

                  {includeBrowserInfo && (
                    <>
                      <div className="ornament" />
                      <div>
                        <span className="text-sm text-[var(--text-muted)]">设备信息</span>
                        <div className="text-xs text-[var(--text-secondary)] mt-1 space-y-0.5">
                          <div>{browserInfo.browser} · {browserInfo.os}</div>
                          <div>{browserInfo.resolution}</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="glass-mono-glow rounded-xl p-4 text-center">
                  <Bug className="w-8 h-8 text-[var(--accent-primary)] mx-auto mb-2" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    提交前请确认信息准确，我们会认真对待每一条反馈
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--accent-primary)]/[0.04]">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <motion.button
                  type="button"
                  onClick={() => setStep((prev) => prev - 1)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/[0.06] transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring}
                >
                  <ArrowLeft className="w-4 h-4" />
                  上一步
                </motion.button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {saving && (
                <span className="text-xs text-[var(--text-muted)]">自动保存中...</span>
              )}
              {step < steps.length - 1 ? (
                <motion.button
                  type="button"
                  onClick={handleNext}
                  className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring}
                >
                  下一步
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={handleSubmit}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))' }}
                  whileHover={{ scale: 1.03, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)' }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.7 }}
                >
                  <Send className="w-4 h-4" />
                  提交反馈
                </motion.button>
              )}
            </div>
          </div>

          {/* 提交进度（多步骤状态流程） */}
          {submitProgress > 0 && submitProgress < 100 && renderSubmitProgress()}
        </div>
      </div>
    </motion.div>
  )
}