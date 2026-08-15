import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import {
  MessageSquareWarning, MessageSquare, Camera, Shield, X, Sparkles,
  AlertTriangle, CheckCircle, Monitor, Smartphone,
  Globe, Clock, Download, Paperclip
} from 'lucide-react'
import InlineLoading from './ui/InlineLoading'
import { Tooltip } from './ui/Tooltip'

interface DetectedError {
  id: string
  message: string
  type: string
  timestamp: number
  stack?: string
  metadata?: Record<string, unknown>
}

const springPremium = { type: 'spring' as const, stiffness: 350, damping: 25, mass: 0.8 }
const springBouncy = { type: 'spring' as const, stiffness: 400, damping: 12, mass: 0.5 }

const tabs = [
  { id: 0, label: '反馈', icon: MessageSquare },
  { id: 1, label: '检测', icon: AlertTriangle },
  { id: 2, label: '录制', icon: Camera },
  { id: 3, label: '状态', icon: Shield },
]

const typeLabel: Record<string, string> = {
  error: '运行时错误',
  unhandledrejection: '异步异常',
  api: 'API错误',
  network: '网络错误',
  business: '业务异常',
  console: '控制台异常',
}

const typeColor: Record<string, string> = {
  error: 'var(--warning)',
  unhandledrejection: 'var(--warning)',
  api: 'var(--accent-primary)',
  network: 'var(--warning)',
  business: 'var(--accent-primary)',
  console: 'var(--accent-navy)',
}

export default function FeedbackButton() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [errors, setErrors] = useState<DetectedError[]>([])
  const [expandedError, setExpandedError] = useState<string | null>(null)

  const [feedbackTitle, setFeedbackTitle] = useState('')
  const [feedbackCategory, setFeedbackCategory] = useState('功能异常')
  const [feedbackDesc, setFeedbackDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [systemInfo, setSystemInfo] = useState({
    browser: '',
    platform: '',
    language: '',
    appVersion: '1.0.0',
    loadTime: 0,
    memory: '',
  })

  const [aiAnalyzing, setAiAnalyzing] = useState<string | null>(null)
  const [aiResults, setAiResults] = useState<Record<string, string>>({})

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const error = e.detail as DetectedError
      setErrors(prev => [error, ...prev].slice(0, 50))
    }
    window.addEventListener('bug-detected', handler as EventListener)
    return () => window.removeEventListener('bug-detected', handler as EventListener)
  }, [])

  useEffect(() => {
    const nav = navigator
    const ua = nav.userAgent
    let browser = 'Unknown'
    if (ua.includes('Chrome')) browser = 'Chrome'
    else if (ua.includes('Firefox')) browser = 'Firefox'
    else if (ua.includes('Safari')) browser = 'Safari'
    else if (ua.includes('Edge')) browser = 'Edge'

    setSystemInfo({
      browser,
      platform: nav.platform,
      language: nav.language,
      appVersion: '1.0.0',
      loadTime: Math.round(performance.now()),
      memory: (performance as any).memory?.usedJSHeapSize
        ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)} MB`
        : '不可用',
    })
  }, [])

  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [recording])

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }, [])

  const handleAIAnalysis = useCallback(async (error: DetectedError) => {
    setAiAnalyzing(error.id)
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600))
    const typeHint = typeLabel[error.type] || error.type
    let diagnosis = ''
    if (error.type === 'error' || error.type === 'unhandledrejection') {
      diagnosis = `运行时错误：${error.message}。这可能是由于代码异常、异步操作失败或外部资源加载问题导致的。建议检查相关代码逻辑和网络请求。`
    } else if (error.type === 'api') {
      diagnosis = `API 调用异常：${error.message}。建议检查接口地址、请求参数和服务器状态，确认网络连接正常。`
    } else if (error.type === 'network') {
      diagnosis = `网络异常：${error.message}。建议检查网络连接稳定性，或稍后重试。`
    } else if (error.type === 'business') {
      diagnosis = `业务逻辑异常：${error.message}。建议检查数据流和状态管理，确认输入数据符合预期。`
    } else {
      diagnosis = `检测到 ${typeHint} 类型异常：${error.message}。建议查看详细堆栈信息以定位问题源头。`
    }
    const recommendations = [
      '检查最新代码变更是否引入了该问题',
      '尝试清空缓存后重新加载页面',
      '确认浏览器版本为最新版本',
    ]
    const result = `【AI 诊断】\n类型：${typeHint}\n描述：${error.message}\n\n分析结果：${diagnosis}\n\n建议措施：\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    setAiResults(prev => ({ ...prev, [error.id]: result }))
    setAiAnalyzing(null)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        setRecordedUrl(URL.createObjectURL(blob))
        setRecordingTime(0)
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      // user cancelled screen share
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }, [])

  const validateForm = useCallback(() => {
    const errs: Record<string, string> = {}
    if (!feedbackTitle.trim()) errs.title = '请输入标题'
    if (!feedbackDesc.trim()) errs.desc = '请输入描述'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }, [feedbackTitle, feedbackDesc])

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return
    setSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    setSubmitting(false)
    setFeedbackTitle('')
    setFeedbackDesc('')
    setFeedbackCategory('功能异常')
    setFormErrors({})
    setIsOpen(false)
  }, [validateForm])

  if (isHome) return null

  return (
    <>
      <Tooltip content={errors.length > 0 ? `有 ${errors.length} 个问题可反馈` : '问题反馈'} side="right" className="fixed bottom-8 left-8 z-[9999]">
        <div className="relative">
          {errors.length > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--error)] ring-2 ring-[var(--bg-primary)] z-10" />
          )}
          <motion.button
            type="button"
            onClick={() => setIsOpen(true)}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--accent-indigo)]/[0.12] border border-[var(--accent-indigo)]/25 text-[var(--accent-indigo)] shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl ring-1 ring-[var(--accent-indigo)]/10 hover:bg-[var(--accent-indigo)]/[0.18] hover:border-[var(--accent-indigo)]/35 hover:shadow-[0_12px_36px_rgba(0,0,0,0.26)] hover:-translate-y-0.5 transition-all duration-200"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            aria-label="反馈中心"
          >
            <span className="pointer-events-none hidden motion-safe:block absolute -inset-1 rounded-[24px] border border-[var(--accent-indigo)]/25 animate-breathe-ring" />
            <MessageSquareWarning className="w-5 h-5" />
          </motion.button>
        </div>
      </Tooltip>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="fixed inset-0 z-[9998]"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16, transition: { duration: 0.15 } }}
              transition={springPremium}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="w-full max-w-lg max-h-[85vh] rounded-2xl overflow-hidden flex flex-col pointer-events-auto"
                style={{
                  background: 'var(--glass-bg-strong)',
                  backdropFilter: 'blur(32px)',
                  WebkitBackdropFilter: 'blur(32px)',
                  boxShadow: '0 24px 80px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
                  border: '0.5px solid var(--glass-border)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pt-2 pb-1 sm:hidden">
                  <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-primary)' }} />
                </div>

                <div className="flex items-center justify-between px-6 pt-4 pb-3 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                      <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI 反馈中心</h2>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">智能检测 · 一键反馈</p>
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-full hover:bg-[var(--accent-primary)]/5 cursor-pointer"
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    transition={springPremium}
                  >
                    <X className="w-4 h-4 text-[var(--text-muted)]" />
                  </motion.button>
                </div>

                <LayoutGroup>
                  <div className="flex px-4 gap-1 border-b border-[var(--border-primary)] shrink-0">
                    {tabs.map((tab) => {
                      const Icon = tab.icon
                      const isActive = activeTab === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className="relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer"
                          style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{tab.label}</span>
                          {isActive && (
                            <motion.div
                              layoutId="tab-indicator"
                              className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                              style={{ background: 'var(--accent-primary)' }}
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </LayoutGroup>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {activeTab === 0 && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">标题</label>
                        <input
                          type="text"
                          value={feedbackTitle}
                          onChange={e => setFeedbackTitle(e.target.value)}
                          placeholder="简要描述问题"
                          className="w-full px-4 py-2.5 rounded-xl text-sm transition-all surface-input"
                          style={{ borderColor: formErrors.title ? 'var(--error)' : undefined }}
                        />
                        {formErrors.title && <p className="text-xs text-[var(--error)] mt-1">{formErrors.title}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">类别</label>
                        <div className="flex gap-2 flex-wrap">
                          {['功能异常', '性能问题', '界面问题', '建议反馈'].map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setFeedbackCategory(cat)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
                              style={{
                                background: feedbackCategory === cat ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                color: feedbackCategory === cat ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                              }}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">描述</label>
                        <textarea
                          value={feedbackDesc}
                          onChange={e => setFeedbackDesc(e.target.value)}
                          placeholder="详细描述您遇到的问题或建议..."
                          rows={4}
                          className="w-full px-4 py-2.5 rounded-xl text-sm transition-all surface-input resize-none"
                          style={{ borderColor: formErrors.desc ? 'var(--error)' : undefined }}
                        />
                        {formErrors.desc && <p className="text-xs text-[var(--error)] mt-1">{formErrors.desc}</p>}
                      </div>
                      {recordedUrl && (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                          <Paperclip className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                          <span className="text-xs text-[var(--text-secondary)]">已附加录制视频</span>
                          <button
                            type="button"
                            onClick={() => { setRecordedUrl(null) }}
                            className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--error)] cursor-pointer"
                          >
                            移除
                          </button>
                        </div>
                      )}
                      <motion.button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all cursor-pointer disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {submitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <InlineLoading size="sm" color="white" />
                            提交中...
                          </span>
                        ) : '提交反馈'}
                      </motion.button>
                    </div>
                  )}

                  {activeTab === 1 && (
                    <div className="space-y-2">
                      {errors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springBouncy}>
                            <CheckCircle className="w-12 h-12 text-[var(--success)] mb-3" />
                          </motion.div>
                          <p className="text-sm text-[var(--text-secondary)]">未检测到异常</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">您的环境运行良好</p>
                        </div>
                      ) : (
                        errors.map((error) => (
                          <motion.div
                            key={error.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl overflow-hidden"
                            style={{ background: 'var(--bg-secondary)' }}
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedError(expandedError === error.id ? null : error.id)}
                              className="w-full flex items-center gap-3 p-3 text-left cursor-pointer"
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${typeColor[error.type] || 'var(--warning)'}15` }}
                              >
                                <AlertTriangle className="w-4 h-4" style={{ color: typeColor[error.type] || 'var(--warning)' }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                    style={{ color: typeColor[error.type] || 'var(--warning)', background: `${typeColor[error.type] || 'var(--warning)'}12` }}
                                  >
                                    {typeLabel[error.type] || error.type}
                                  </span>
                                  <span className="text-[10px] text-[var(--text-muted)]">
                                    {new Date(error.timestamp).toLocaleTimeString('zh-CN')}
                                  </span>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] line-clamp-1">{error.message}</p>
                              </div>
                            </button>
                            {expandedError === error.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="px-3 pb-3"
                              >
                                <div className="p-2.5 rounded-lg text-xs" style={{ background: 'var(--bg-elevated)' }}>
                                  <p className="text-[var(--text-muted)] mb-1">详细信息：</p>
                                  <p className="text-[var(--text-secondary)] whitespace-pre-wrap break-all">{error.message}</p>
                                  {error.stack && (
                                    <>
                                      <p className="text-[var(--text-muted)] mt-2 mb-1">堆栈：</p>
                                      <p className="text-[var(--text-secondary)] text-[10px] whitespace-pre-wrap break-all">{error.stack}</p>
                                    </>
                                  )}
                                </div>
                                {aiResults[error.id] ? (
                                  <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-2 p-2.5 rounded-lg text-xs"
                                    style={{ background: 'var(--accent-primary)/0.06', border: '1px solid var(--accent-primary)/0.12' }}
                                  >
                                    <p className="text-[var(--accent-primary)] font-medium mb-1 flex items-center gap-1">
                                      <Sparkles className="w-3 h-3" />
                                      AI 分析结果
                                    </p>
                                    <pre className="text-[var(--text-secondary)] whitespace-pre-wrap break-all font-sans text-[11px] leading-relaxed">{aiResults[error.id]}</pre>
                                  </motion.div>
                                ) : aiAnalyzing === error.id ? (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="w-full mt-2 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
                                    style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}
                                  >
                                    <InlineLoading size="sm" color="muted" />
                                    AI 分析中...
                                  </motion.div>
                                ) : (
                                  <motion.button
                                    type="button"
                                    onClick={() => handleAIAnalysis(error)}
                                    className="w-full mt-2 py-1.5 rounded-lg text-xs font-medium text-white cursor-pointer"
                                    style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    <span className="flex items-center justify-center gap-1">
                                      <Sparkles className="w-3 h-3" />
                                      AI 分析
                                    </span>
                                  </motion.button>
                                )}
                              </motion.div>
                            )}
                          </motion.div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 2 && (
                    <div className="space-y-4">
                      {!recordedUrl ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <motion.button
                            type="button"
                            onClick={recording ? stopRecording : startRecording}
                            className="w-20 h-20 rounded-full flex items-center justify-center cursor-pointer relative"
                            style={{
                              background: recording ? 'var(--error)' : 'var(--accent-primary)',
                            }}
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.92 }}
                          >
                            {recording && (
                              <motion.span
                                className="absolute inset-0 rounded-full"
                                style={{ border: '3px solid var(--error)' }}
                                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              />
                            )}
                            <div
                              className="w-8 h-8 bg-white"
                              style={{ borderRadius: recording ? '4px' : '50%', transition: 'border-radius 0.3s ease' }}
                            />
                          </motion.button>
                          <p className="text-sm text-[var(--text-secondary)] mt-4">
                            {recording ? '正在录制...' : '点击开始屏幕录制'}
                          </p>
                          {recording && (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-2xl font-mono font-bold mt-2"
                              style={{ color: 'var(--error)' }}
                            >
                              {formatTime(recordingTime)}
                            </motion.p>
                          )}
                          <p className="text-xs text-[var(--text-muted)] mt-2">录制内容可用于附加到反馈中</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <video
                            src={recordedUrl}
                            controls
                            className="w-full rounded-xl"
                            style={{ background: '#000', maxHeight: '300px' }}
                          />
                          <div className="flex gap-2">
                            <motion.button
                              type="button"
                              onClick={() => { setRecordedUrl(null) }}
                              className="flex-1 py-2 rounded-xl text-sm font-medium cursor-pointer"
                              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              重新录制
                            </motion.button>
                            <motion.a
                              href={recordedUrl}
                              download={`recording-${Date.now()}.webm`}
                              className="flex-1 py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-1.5 no-underline cursor-pointer"
                              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Download className="w-4 h-4" />
                              下载
                            </motion.a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 3 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Monitor className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                            <span className="text-xs font-medium text-[var(--text-muted)]">浏览器</span>
                          </div>
                          <p className="text-sm text-[var(--text-primary)] truncate">{systemInfo.browser || '检测中...'}</p>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                            <span className="text-xs font-medium text-[var(--text-muted)]">平台</span>
                          </div>
                          <p className="text-sm text-[var(--text-primary)] truncate">{systemInfo.platform || '检测中...'}</p>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Globe className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                            <span className="text-xs font-medium text-[var(--text-muted)]">语言</span>
                          </div>
                          <p className="text-sm text-[var(--text-primary)]">{systemInfo.language || '检测中...'}</p>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                            <span className="text-xs font-medium text-[var(--text-muted)]">加载时间</span>
                          </div>
                          <p className="text-sm text-[var(--text-primary)]">{systemInfo.loadTime}ms</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                          <span className="text-xs font-medium text-[var(--text-muted)]">应用版本</span>
                        </div>
                        <p className="text-sm text-[var(--text-primary)]">v{systemInfo.appVersion}</p>
                      </div>
                      <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-[var(--text-muted)]">内存使用</span>
                        </div>
                        <p className="text-sm text-[var(--text-primary)]">{systemInfo.memory}</p>
                      </div>
                      <motion.button
                        type="button"
                        onClick={() => setSystemInfo(prev => ({ ...prev, loadTime: Math.round(performance.now()) }))}
                        className="w-full py-2 rounded-xl text-xs font-medium cursor-pointer"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        重新检测环境
                      </motion.button>
                    </div>
                  )}
                </div>

                <div className="px-6 py-3 border-t border-[var(--border-primary)] shrink-0">
                  <p className="text-[10px] text-[var(--text-muted)] text-center">
                    由 AI 驱动 · 数据仅用于改进产品
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}