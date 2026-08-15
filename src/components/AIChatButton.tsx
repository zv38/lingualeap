import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { MessageSquareText, Bot, X, Send, Search, Sparkles, AlertTriangle, Globe, Copy, Bug, Shield, MoreVertical } from 'lucide-react'
import InlineLoading from './ui/InlineLoading'
import { useStore } from '../store/useStore'
import { quickQuestions } from '../data/faqData'
import { Tooltip } from './ui/Tooltip'
import { sendChatMessage } from '../utils/aiService'
import { webSearch } from '../utils/webSearch'
import MarkdownRenderer from '../utils/markdownRenderer'
import { getGuardianStats } from './AutoBugDetector'
import { useProcessingStatus } from '../hooks/useProcessingStatus'
import ProcessingIndicator from './ProcessingIndicator'
import StreamingText from './StreamingText'
import RippleEffect from './RippleEffect'
import { playSuccessSound } from '../utils/sound'

const spring = { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 }

export default function AIChatButton() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showQuickQuestions, setShowQuickQuestions] = useState(true)
  const [detectedBug, setDetectedBug] = useState(false)
  const [searchEnabled, setSearchEnabled] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showGuardianPanel, setShowGuardianPanel] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [, setStreamingMsgId] = useState<string | null>(null)
  const [typewriterCompleted, setTypewriterCompleted] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const processingStatus = useProcessingStatus()
  const { status: procStatus, startProcessing, completeProcessing, failProcessing } = processingStatus

  const chatMessages = useStore(s => s.chatMessages)
  const addChatMessage = useStore(s => s.addChatMessage)
  const isAuthenticated = useStore(s => s.isAuthenticated)
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isLoading])

  useEffect(() => {
    const handleOpenAIChat = () => setIsOpen(true)
    window.addEventListener('open-ai-chat', handleOpenAIChat)
    return () => window.removeEventListener('open-ai-chat', handleOpenAIChat)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (windowRef.current && !windowRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.chat-bubble-btn')) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // 点击其他地方关闭更多菜单
  useEffect(() => {
    if (!showMoreMenu) return
    function handleClose(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.more-menu-container')) {
        setShowMoreMenu(false)
      }
    }
    // 延迟添加，避免触发菜单按钮本身的点击事件
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClose), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClose) }
  }, [showMoreMenu])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  useEffect(() => {
    if (chatMessages.length >= 3) {
      setShowQuickQuestions(false)
    }
  }, [chatMessages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return

    // 未登录用户不能使用 AI 客服，友好提示
    if (!isAuthenticated) {
      addChatMessage({ role: 'user', content: text })
      addChatMessage({
        role: 'assistant',
        content: '你好！要使用 AI 客服功能，需要先登录账号哦。请点击右上角「登录」按钮，登录后就可以和我聊天啦～',
      })
      setInput('')
      setShowQuickQuestions(false)
      return
    }

    setInput('')
    setApiError(null)

    addChatMessage({ role: 'user', content: text })
    setShowQuickQuestions(false)

    const bugDetected = text.toLowerCase().includes('bug') ||
      text.toLowerCase().includes('错误') ||
      text.toLowerCase().includes('问题') ||
      text.toLowerCase().includes('坏了') ||
      text.toLowerCase().includes('不行') ||
      text.toLowerCase().includes('异常') ||
      text.toLowerCase().includes('报错') ||
      text.toLowerCase().includes('崩溃') ||
      text.toLowerCase().includes('卡顿') ||
      text.toLowerCase().includes('加载不出来')

    if (bugDetected) {
      setDetectedBug(true)
    }

    setIsLoading(true)
    startProcessing()

    const systemMessage = {
      role: 'system' as const,
      content: '你是 LinguaLeap 语言学习平台的 AI 客服助手。你是一个友好、专业的中文客服，帮助用户解答关于语言学习、平台功能、课程内容等问题。你可以提供学习方法建议、解答平台使用疑问、帮助用户解决问题。请用中文回复，保持耐心和热情。如果你不知道答案，请诚实地告诉用户，而不是编造信息。',
    }

    const historyMessages = chatMessages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const messagesWithSystem = [systemMessage, ...historyMessages]

    if (searchEnabled) {
      try {
        const searchResult = await webSearch(text)
        if (searchResult.results.length > 0) {
          const searchContext = `以下是关于"${text}"的联网搜索结果：\n\n${searchResult.results.map((r, i) =>
            `${i + 1}. ${r.title}${r.url ? ` (${r.url})` : ''}\n   ${r.snippet}`
          ).join('\n\n')}\n\n请基于以上搜索结果回答用户的问题。如果搜索结果与问题无关，请如实告知。`

          const result = await sendChatMessage([
            ...messagesWithSystem,
            { role: 'user', content: searchContext + '\n\n用户问题：' + text },
          ])

          setIsLoading(false)
          completeProcessing()

          if (result.success && result.content) {
            playSuccessSound()
            addChatMessage({
              role: 'assistant',
              content: `🔍 已搜索网络\n\n${result.content}`,
              isSearch: true,
              searchResults: searchResult.results,
            })
          } else {
            setApiError(result.error || '搜索请求失败')
            addChatMessage({
              role: 'assistant',
              content: `🔍 已搜索网络，但AI处理时出现问题。以下是搜索结果：\n\n${searchResult.results.map((r, i) =>
                `${i + 1}. ${r.title}${r.url ? `\n   ${r.url}` : ''}\n   ${r.snippet}`
              ).join('\n\n')}`,
              isSearch: true,
            })
          }
        } else {
          const result = await sendChatMessage([
            ...messagesWithSystem,
            { role: 'user', content: text },
          ])
          setIsLoading(false)
          completeProcessing()
          if (result.success && result.content) {
            playSuccessSound()
            addChatMessage({ role: 'assistant', content: `🔍 搜索未找到相关结果，以下是AI回复：\n\n${result.content}` })
          } else {
            setApiError(result.error || '请求失败')
            const isAuthError = result.error?.includes('未登录') || result.error?.includes('令牌')
            addChatMessage({
              role: 'assistant',
              content: isAuthError
                ? '登录状态已过期，请刷新页面重新登录后再使用 AI 客服功能。'
                : '抱歉，联网搜索未找到结果，且AI服务暂时不可用。',
            })
          }
        }
      } catch (error) {
        setIsLoading(false)
        failProcessing()
        const errorMsg = error instanceof Error ? error.message : '搜索失败'
        setApiError(errorMsg)
        addChatMessage({
          role: 'assistant',
          content: `联网搜索出现问题：${errorMsg}。已切换为普通模式回复：`,
        })
        const result = await sendChatMessage([
          ...messagesWithSystem,
          { role: 'user', content: text },
        ])
        if (result.success && result.content) {
          addChatMessage({ role: 'assistant', content: result.content })
        } else {
          const isAuthError = result.error?.includes('未登录') || result.error?.includes('令牌')
          addChatMessage({
            role: 'assistant',
            content: isAuthError
              ? '登录状态已过期，请刷新页面重新登录后再使用 AI 客服功能。'
              : '抱歉，我暂时无法连接到AI服务。你可以稍后再试，或者直接使用「Bug反馈」功能提交问题。',
          })
        }
      }
    } else {
      const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setStreamingMsgId(streamId)
      const msgs = useStore.getState().chatMessages
      useStore.setState({
        chatMessages: [...msgs, {
          id: streamId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          _tempId: streamId,
        } as any],
      })

      try {
        const response = await fetch('/api/ai/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messagesWithSystem, { role: 'user', content: text }],
          }),
        })

        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          throw new Error(errText || `HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader')

        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.error) throw new Error(parsed.error)
                if (parsed.content) {
                  fullContent += parsed.content
                  const currentMessages = useStore.getState().chatMessages
                  useStore.setState({
                    chatMessages: currentMessages.map(m =>
                      (m as any)._tempId === streamId
                        ? { ...m, content: fullContent }
                        : m
                    )
                  })
                }
              } catch {}
            }
          }
        }

        setIsLoading(false)
        completeProcessing()
        playSuccessSound()
        setStreamingMsgId(null)
      } catch (error) {
        setIsLoading(false)
        failProcessing()
        setStreamingMsgId(null)
        const currentMessages = useStore.getState().chatMessages
        useStore.setState({
          chatMessages: currentMessages.filter(m => (m as any)._tempId !== streamId)
        })

        const result = await sendChatMessage([
          ...messagesWithSystem,
          { role: 'user', content: text },
        ])

        if (result.success && result.content) {
          addChatMessage({ role: 'assistant', content: result.content })
        } else {
          setApiError(result.error || '请求失败')
          // 友好提示，不暴露后端原始错误
          const isAuthError = result.error?.includes('未登录') || result.error?.includes('令牌')
          const friendlyMsg = isAuthError
            ? '登录状态已过期，请刷新页面重新登录后再使用 AI 客服功能。'
            : '抱歉，我暂时无法连接到AI服务。你可以稍后再试，或者直接使用「Bug反馈」功能提交问题。'
          addChatMessage({ role: 'assistant', content: friendlyMsg })
        }
      }
    }
  }

  const handleQuickQuestion = (question: string) => {
    setInput(question)
    setShowQuickQuestions(false)
    setTimeout(() => handleSend(), 100)
  }

  const handleBugSubmit = () => {
    const recentMessages = chatMessages.slice(-5).map(m => `[${m.role === 'user' ? '用户' : 'AI'}]: ${m.content}`).join('\n')
    setIsOpen(false)
    navigate('/bug-report', {
      state: {
        chatContext: `AI客服对话记录：\n${recentMessages}`,
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (isHome) return null

  return (
    <>
      <Tooltip content={isOpen ? '关闭客服' : 'AI 客服'} side="left" className="fixed bottom-8 right-8 z-[9999]">
        <motion.button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="chat-bubble-btn relative w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--accent-indigo)]/[0.12] border border-[var(--accent-indigo)]/25 text-[var(--accent-indigo)] shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl ring-1 ring-[var(--accent-indigo)]/10 hover:bg-[var(--accent-indigo)]/[0.18] hover:border-[var(--accent-indigo)]/35 hover:shadow-[0_12px_36px_rgba(0,0,0,0.26)] hover:-translate-y-0.5 transition-all duration-200"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          aria-label={isOpen ? '关闭客服' : '打开客服'}
        >
          <span className="pointer-events-none hidden motion-safe:block absolute -inset-1 rounded-[24px] border border-[var(--accent-indigo)]/25 animate-breathe-ring" />
          {isOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <MessageSquareText className="w-5 h-5" />
          )}
        </motion.button>
      </Tooltip>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={windowRef}
            initial={{ opacity: 0, scale: 0.96, y: 12, x: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12, x: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed bottom-20 right-8 z-[9999] w-[360px] h-[480px] flex flex-col rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-xl)] bg-[var(--bg-card)] border border-[var(--border-primary)]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)] shrink-0 bg-[var(--bg-secondary)]/50">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[var(--accent-indigo)]/10 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-[var(--accent-indigo)]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI 客服</h3>
                  <p className="text-[10px] text-[var(--text-muted)]">由智谱AI提供支持</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {/* 更多操作下拉菜单 */}
                <div className="relative more-menu-container">
                  <motion.button
                    type="button"
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className="p-1.5 rounded-lg hover:bg-[var(--accent-primary)]/[0.06] transition-colors relative"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="更多操作"
                  >
                    <MoreVertical className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {getGuardianStats().detectedCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--success)]" />
                    )}
                  </motion.button>
                  <AnimatePresence>
                    {showMoreMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-1 w-40 rounded-[var(--radius-md)] border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] overflow-hidden z-10"
                      >
                        <button
                          type="button"
                          onClick={() => { navigate('/bug-report'); setShowMoreMenu(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/[0.04] transition-colors"
                        >
                          <Bug className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          反馈 Bug
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowGuardianPanel(!showGuardianPanel); setShowMoreMenu(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/[0.04] transition-colors"
                        >
                          <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          守护状态
                        </button>
                        <button
                          type="button"
                          onClick={() => { useStore.getState().clearChatHistory?.(); setShowQuickQuestions(true); setDetectedBug(false); setApiError(null); setShowGuardianPanel(false); setShowMoreMenu(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/[0.04] transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          清空对话
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--accent-primary)]/[0.06] transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </motion.button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-none">
              {chatMessages.length === 0 && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center py-8"
                >
                  <div className="w-12 h-12 rounded-full bg-[var(--accent-indigo)]/10 flex items-center justify-center mx-auto mb-3">
                    <Bot className="w-6 h-6 text-[var(--accent-indigo)]" />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] font-medium">你好！我是 AI 客服助手</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">有什么可以帮助你的？</p>
                </motion.div>
              )}

              {chatMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={spring}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-[var(--accent-indigo)]/10 flex items-center justify-center mr-2 mt-1 shrink-0">
                      <Bot className="w-3 h-3 text-[var(--accent-indigo)]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[260px] px-3.5 py-2.5 text-sm leading-relaxed rounded-[var(--radius-md)] ${
                      msg.role === 'user'
                        ? 'bg-[var(--accent-indigo)] text-white rounded-br-sm'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-bl-sm relative group'
                    }`}
                  >
                    {msg.isSearch && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--success)] font-medium mb-1.5 bg-[var(--success)]/[0.08] px-2 py-0.5 rounded-full">
                        <Globe className="w-3 h-3" />
                        联网搜索
                      </span>
                    )}
                    {msg.role === 'assistant' ? (
                      msg.content.length > 120 && !typewriterCompleted.has(msg.id) ? (
                        <StreamingText
                          content={msg.content}
                          speed={15}
                          showCursor={false}
                          onComplete={() => {
                            setTypewriterCompleted(prev => new Set(prev).add(msg.id))
                          }}
                        />
                      ) : (
                        <MarkdownRenderer content={msg.content} />
                      )
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                    {msg.role === 'assistant' && msg.content && (
                      <button
                        onClick={() => navigator.clipboard.writeText(msg.content)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/[0.06]"
                        title="复制"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-indigo)]/10 flex items-center justify-center mr-2 mt-1 shrink-0">
                    <Bot className="w-3 h-3 text-[var(--accent-indigo)]" />
                  </div>
                  <div className="flex-1">
                    <ProcessingIndicator
                      stage={procStatus.stage}
                      message={procStatus.message}
                      progress={procStatus.progress}
                    />
                  </div>
                </motion.div>
              )}

              {apiError && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1.5 justify-center"
                >
                  <AlertTriangle className="w-3 h-3 text-[var(--error)]" />
                  <span className="text-[10px] text-[var(--error)]">API连接异常，使用本地回复</span>
                </motion.div>
              )}

              {/* 守护状态面板 — 整合到 AI 客服窗口内 */}
              {showGuardianPanel && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-[var(--radius-md)] border border-[var(--border-primary)] bg-[var(--bg-secondary)]/50 overflow-hidden"
                >
                  <div className="px-3.5 py-2.5 border-b border-[var(--border-primary)] flex items-center gap-2">
                    <Shield size={12} className="text-[var(--accent-primary)]" />
                    <span className="text-[11px] font-medium text-[var(--text-primary)]">守护状态</span>
                  </div>
                  <div className="px-3.5 py-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-muted)]">检测异常</span>
                      <span className="font-medium text-[var(--text-primary)]">{getGuardianStats().detectedCount} 项</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-muted)]">已上报</span>
                      <span className="font-medium text-[var(--success)]">{getGuardianStats().reportedCount} 项</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-muted)]">状态</span>
                      <span className="inline-flex items-center gap-1 font-medium text-[11px] text-[var(--success)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                        {getGuardianStats().status === 'running' ? '运行中' : getGuardianStats().status}
                      </span>
                    </div>
                    {getGuardianStats().lastEvent && (
                      <div className="pt-2 border-t border-[var(--border-primary)]">
                        <div className="text-[10px] text-[var(--text-muted)] mb-1">最近事件</div>
                        <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                          [{getGuardianStats().lastEvent!.type}] {getGuardianStats().lastEvent!.message}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-3.5 py-2 border-t border-[var(--border-primary)]">
                    <button
                      type="button"
                      onClick={() => navigate('/bug-history')}
                      className="w-full text-[10px] text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)] text-center transition-colors"
                    >
                      查看详细报告
                    </button>
                  </div>
                </motion.div>
              )}

              {showQuickQuestions && chatMessages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="pt-2 space-y-1.5"
                >
                  <p className="text-[10px] text-[var(--text-muted)] text-center">快速提问</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {quickQuestions.map((q, i) => (
                      <motion.button
                        key={i}
                        type="button"
                        onClick={() => handleQuickQuestion(q.question)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--text-secondary)] border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-input)] transition-all"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + i * 0.08 }}
                      >
                        {q.question}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />

              {chatMessages.length >= 2 && !isLoading && chatMessages[chatMessages.length - 1].role === 'assistant' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['继续讲解', '给个例子', '总结一下'].map(text => (
                    <button
                      key={text}
                      onClick={() => { setInput(text); setTimeout(() => handleSend(), 100) }}
                      className="px-2.5 py-1 rounded-full text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-input)] transition-all"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <AnimatePresence>
              {detectedBug && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mx-3 px-3 py-2 rounded-[var(--radius-md)] flex items-center gap-2 bg-[var(--warning-bg)] border border-[var(--warning)]/15"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
                  <span className="text-[10px] text-[var(--text-secondary)] flex-1">检测到你可能在反馈问题</span>
                  <motion.button
                    type="button"
                    onClick={handleBugSubmit}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-white shrink-0 bg-[var(--accent-indigo)] hover:bg-[var(--accent-indigo-hover)] transition-colors"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    去提交
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setDetectedBug(false)}
                    className="px-2 py-1 rounded-lg text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    忽略
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-3 border-t border-[var(--border-primary)] shrink-0 bg-[var(--bg-secondary)]/50">
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={() => setSearchEnabled(!searchEnabled)}
                  className={`p-2 rounded-lg transition-colors ${searchEnabled ? 'bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)]' : 'text-[var(--text-muted)] hover:bg-[var(--accent-primary)]/[0.04]'}`}
                  whileTap={{ scale: 0.95 }}
                  title={searchEnabled ? '联网搜索已开启' : '联网搜索已关闭'}
                >
                  <Search className="w-4 h-4" />
                </motion.button>
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={searchEnabled ? "输入问题（将联网搜索...)" : "输入问题..."}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-indigo)] focus:ring-2 focus:ring-[var(--accent-indigo)] focus:ring-offset-1 focus:ring-offset-[var(--bg-card)] pr-10"
                    disabled={isLoading}
                  />
                  {isLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <InlineLoading size="sm" color="primary" />
                    </div>
                  )}
                </div>
                <RippleEffect
                  color="rgba(255,255,255,0.3)"
                  disabled={isLoading || !input.trim()}
                  className="rounded-[var(--radius-md)]"
                >
                  <motion.button
                    type="button"
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="p-2.5 rounded-[var(--radius-md)] bg-[var(--accent-indigo)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent-indigo-hover)] transition-colors"
                    whileHover={!isLoading && input.trim() ? { scale: 1.05 } : {}}
                    whileTap={!isLoading && input.trim() ? { scale: 0.95 } : {}}
                    transition={spring}
                  >
                    <Send className="w-4 h-4" />
                  </motion.button>
                </RippleEffect>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}