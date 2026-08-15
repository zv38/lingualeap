import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, BookOpen, TrendingUp, Target, Clock, Zap, ChevronRight, Brain, BarChart3, Lightbulb, RefreshCw, Bot, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { post } from '../utils/api'
import AnimatedNumber from '../components/AnimatedNumber'
import InfoTip from '../components/InfoTip'
import Tooltip from '../components/Tooltip'
import { staggerContainer, staggerItem, cardHover, buttonTap, pageEnter } from '../utils/animations'

interface AgentSuggestion {
  type: 'course' | 'tip' | 'challenge' | 'review'
  title: string
  description: string
  action?: string
  priority: number
}

const AIAgent = () => {
  const { progress, courses } = useStore()
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [agentMessage, setAgentMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  // 流式回复：AI 回答逐字显示，避免等待完整响应
  const [streamingReply, setStreamingReply] = useState('')
  const [streamingError, setStreamingError] = useState('')
  const streamAbortRef = useRef<AbortController | null>(null)

  const totalMinutes = progress.weeklyData.reduce((sum, d) => sum + d.minutes, 0)
  const avgMinutes = Math.round(totalMinutes / 7)
  const completionRate = courses.length > 0
    ? Math.round(courses.filter(c => c.progress === 100).length / courses.length * 100)
    : 0
  const inProgress = courses.filter(c => c.progress > 0 && c.progress < 100).length

  useEffect(() => {
    generateSuggestions()
  }, [])

  const generateSuggestions = async () => {
    setLoading(true)
    const prompt = `你是一个 AI 学习助手。基于以下用户数据，给出 4 条个性化学习建议（每条 20 字以内，简洁实用）：
- 本周学习总时长：${totalMinutes} 分钟
- 日均学习：${avgMinutes} 分钟
- 已掌握单词：${progress.totalWordsLearned} 个
- 完成课程：${progress.totalLessonsCompleted} 门
- 连续学习：${progress.streak} 天
- 课程完成率：${completionRate}%
- 进行中课程：${inProgress} 门

请按格式返回：
COURSE|建议标题|建议描述
TIP|建议标题|建议描述
CHALLENGE|建议标题|建议描述
REVIEW|建议标题|建议描述`

    try {
      const res = await post('/ai/chat', {
        messages: [
          { role: 'system', content: '你是一个专业的 AI 学习规划师。根据用户学习数据生成个性化建议。严格按格式返回，每条建议用 | 分隔。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 600,
      })

      if (res.success && res.data?.choices?.[0]?.message?.content) {
        const text = res.data.choices[0].message.content
        const lines = text.split('\n').filter((l: string) => l.includes('|'))
        const parsed: AgentSuggestion[] = lines.map((line: string) => {
          const parts = line.split('|')
          const typeMap: Record<string, AgentSuggestion['type']> = {
            COURSE: 'course', TIP: 'tip', CHALLENGE: 'challenge', REVIEW: 'review'
          }
          return {
            type: typeMap[parts[0]] || 'tip',
            title: parts[1]?.trim() || '学习建议',
            description: parts[2]?.trim() || '继续坚持学习',
            priority: 1,
          }
        })
        setSuggestions(parsed.length > 0 ? parsed : getFallbackSuggestions())
      } else {
        setSuggestions(getFallbackSuggestions())
      }
    } catch {
      ;(window as any).toast('AI生成失败，请重试', 'error')
      setSuggestions(getFallbackSuggestions())
    } finally {
      setLoading(false)
    }
  }

  const getFallbackSuggestions = (): AgentSuggestion[] => [
    { type: 'course', title: '继续当前课程', description: `你还有 ${inProgress} 门课程在进行中`, priority: 1 },
    { type: 'tip', title: '保持学习节奏', description: `日均 ${avgMinutes} 分钟，建议增加到 30 分钟`, priority: 2 },
    { type: 'challenge', title: '每日挑战', description: '完成今日单词挑战，巩固记忆', priority: 3 },
    { type: 'review', title: '复习薄弱点', description: '回顾已学课程，加深理解', priority: 4 },
  ]

  const handleAskAgent = async () => {
    if (!agentMessage.trim()) return
    setGenerating(true)
    setStreamingReply('')
    setStreamingError('')

    // 优先使用流式接口，让回答逐字呈现，大幅降低等待感知
    const abort = new AbortController()
    streamAbortRef.current = abort
    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: '你是一个 AI 学习规划师。根据用户的学习数据，回答用户关于学习计划、方法、建议的问题。回答简洁实用（100字以内）。' },
            { role: 'user', content: `我的学习数据：已学${progress.totalWordsLearned}个单词，完成${progress.totalLessonsCompleted}门课，连续学习${progress.streak}天。问题：${agentMessage}` }
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
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
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.content) {
              fullContent += parsed.content
              setStreamingReply(fullContent)
            }
          } catch {}
        }
      }

      setGenerating(false)
      setAgentMessage('')
      // 流式结束后，把完整回复沉淀为建议卡片，保持原交互
      if (fullContent.trim()) {
        setSuggestions(prev => [{
          type: 'tip',
          title: 'AI 回复',
          description: fullContent.trim(),
          priority: 0,
        }, ...prev])
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        return // 用户主动中止，不提示错误
      }
      setGenerating(false)
      setStreamingError(error instanceof Error ? error.message : 'AI生成失败')
      ;(window as any).toast('AI生成失败，请重试', 'error')
    } finally {
      streamAbortRef.current = null
    }
  }

  const typeConfig = {
    course: { icon: BookOpen, color: 'text-[var(--accent-primary)]', bg: 'bg-[var(--bg-elevated)]', label: '课程推荐' },
    tip: { icon: Lightbulb, color: 'text-[var(--success)]', bg: 'bg-[var(--success)]/10', label: '学习技巧' },
    challenge: { icon: Zap, color: 'text-[var(--warning)]', bg: 'bg-[var(--warning)]/10', label: '每日挑战' },
    review: { icon: RefreshCw, color: 'text-[var(--accent-navy)]', bg: 'bg-[var(--accent-navy)]/10', label: '复习建议' },
  }

  return (
    <motion.div
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)] relative overflow-hidden"
      variants={pageEnter}
      initial="initial"
      animate="animate"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--success)] flex items-center justify-center">
              <Brain size={24} className="text-white" />
            </div>
            <h1 className="font-serif text-5xl gradient-text">AI 学习助手</h1>
          </div>
          <p className="text-[var(--text-secondary)] mt-2">基于你的学习数据，提供个性化学习建议<InfoTip content="使用智谱AI GLM-4.7-Flash 模型，200K上下文" /></p>
          <div className="ornament mt-4" />
        </motion.div>

        <motion.div className="grid grid-cols-4 gap-4 mb-8" variants={staggerContainer} initial="hidden" animate="visible">
          {[
            { icon: Clock, value: totalMinutes, suffix: '分钟', label: '本周学习', color: 'var(--accent-primary)' },
            { icon: TrendingUp, value: avgMinutes, suffix: '分钟/天', label: '日均学习', color: 'var(--success)' },
            { icon: Target, value: completionRate, suffix: '%', label: '完成率', color: 'var(--accent-navy)' },
            { icon: Zap, value: progress.streak, suffix: '天', label: '连续学习', color: 'var(--warning)' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={staggerItem}
              {...cardHover}
              className="liquid-glass rounded-2xl p-5 text-center"
            >
              <stat.icon size={20} className="mx-auto mb-2" style={{ color: stat.color }} />
              <p className="text-2xl font-bold text-[var(--text-primary)] font-mono">
                <AnimatedNumber value={stat.value} suffix={stat.suffix} />
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="liquid-glass rounded-[2rem] p-6 mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={18} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-lg text-[var(--text-primary)]">向 AI 助手提问</h2>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={agentMessage}
              onChange={e => setAgentMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAskAgent() }}
              placeholder="例如：如何提高我的学习效率？"
              className="flex-1 bg-white/60 backdrop-blur-sm border border-[var(--accent-primary)]/10 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-primary)]/30 transition-all"
              disabled={generating}
            />
            <Tooltip content={generating ? '停止生成' : '发送消息'}>
            <button
              onClick={() => {
                if (generating) {
                  streamAbortRef.current?.abort()
                  setGenerating(false)
                  return
                }
                handleAskAgent()
              }}
              disabled={!agentMessage.trim() && !generating}
              className="px-5 py-3 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--success)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg transition-all flex items-center gap-2"
              {...buttonTap}
            >
              {generating ? (
                <X size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              <span className="text-sm font-medium">{generating ? '停止' : '提问'}</span>
            </button>
          </Tooltip>

          {/* 流式回答：逐字显示，降低等待焦虑 */}
          {(generating || streamingReply) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="liquid-glass rounded-[2rem] p-5 mt-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--success)] flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">AI 助手</span>
                {generating && (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                    正在思考…
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                {streamingReply}
                {generating && <span className="inline-block w-0.5 h-4 bg-[var(--accent-primary)] align-middle blink-caret" />}
              </p>
              {streamingError && (
                <p className="text-xs text-rust-400 mt-2">生成失败：{streamingError}，请重试</p>
              )}
            </motion.div>
          )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between mb-6"
        >
          <h2 className="font-serif text-2xl gradient-text flex items-center gap-2">
            <Brain size={24} />
            个性化建议
          </h2>
          <Tooltip content="重新生成">
          <button
            onClick={generateSuggestions}
            disabled={loading}
            className="text-sm text-[var(--accent-primary)] hover:text-[var(--accent-primary)] flex items-center gap-1 transition-colors"
            {...buttonTap}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>刷新建议</span>
          </button>
        </Tooltip>
        </motion.div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid md:grid-cols-2 gap-4"
            >
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="liquid-glass rounded-[2rem] p-6">
                  <div className="h-5 w-24 bg-black/[0.04] rounded animate-pulse mb-3" />
                  <div className="h-4 w-3/4 bg-black/[0.03] rounded animate-pulse mb-2" />
                  <div className="h-3 w-1/2 bg-black/[0.02] rounded animate-pulse" />
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="suggestions"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="grid md:grid-cols-2 gap-4"
            >
              {suggestions.map((suggestion, i) => {
                const config = typeConfig[suggestion.type]
                const Icon = config.icon
                return (
                  <motion.div
                    key={i}
                    variants={staggerItem}
                    {...cardHover}
                    className="liquid-glass rounded-[2rem] p-6 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={20} className={config.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${config.bg} ${config.color}`}>
                            {config.label}
                          </span>
                        </div>
                        <h3 className="font-serif text-lg text-[var(--text-primary)] mb-1">{suggestion.title}</h3>
                        <p className="text-sm text-[var(--text-secondary)]">{suggestion.description}</p>
                      </div>
                      <ChevronRight size={18} className="text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] group-hover:translate-x-1 transition-all flex-shrink-0 mt-2" />
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mt-8 liquid-glass rounded-[2rem] p-8"
        >
          <h2 className="font-serif text-xl text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <BarChart3 size={20} className="text-[var(--accent-primary)]" />
            学习洞察
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <motion.div variants={staggerItem} className="p-5 rounded-xl bg-white/40 backdrop-blur-sm">
              <p className="text-xs text-[var(--text-muted)] font-mono mb-2">学习效率</p>
              <p className="text-3xl font-bold text-[var(--success)]">
                {avgMinutes >= 30 ? '优秀' : avgMinutes >= 15 ? '良好' : '需加强'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {avgMinutes >= 30 ? '保持当前节奏' : '建议每天学习 30 分钟'}
              </p>
            </motion.div>
            <motion.div variants={staggerItem} className="p-5 rounded-xl bg-white/40 backdrop-blur-sm">
              <p className="text-xs text-[var(--text-muted)] font-mono mb-2">课程进度</p>
              <p className="text-3xl font-bold text-[var(--accent-primary)]">{inProgress}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">进行中的课程</p>
            </motion.div>
            <motion.div variants={staggerItem} className="p-5 rounded-xl bg-white/40 backdrop-blur-sm">
              <p className="text-xs text-[var(--text-muted)] font-mono mb-2">学习稳定性</p>
              <p className="text-3xl font-bold text-[var(--accent-navy)]">{progress.streak}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">连续学习天数</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

export default AIAgent
