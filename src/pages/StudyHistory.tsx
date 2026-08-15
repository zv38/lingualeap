import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, BookOpen, Brain, Headphones, Mic, CheckCircle, XCircle } from 'lucide-react'

interface HistoryItem {
  id: string
  type: 'word' | 'grammar' | 'listening' | 'speaking'
  name: string
  date: string
  duration: number
  score: number
  completed: boolean
}

const mockHistory: HistoryItem[] = [
  { id: '1', type: 'word', name: '日常词汇 - 食物与饮', date: '2026-05-10', duration: 15, score: 92, completed: true },
  { id: '2', type: 'grammar', name: '过去完成时练', date: '2026-05-10', duration: 20, score: 85, completed: true },
  { id: '3', type: 'listening', name: 'BBC新闻听力 - 科技', date: '2026-05-09', duration: 25, score: 78, completed: true },
  { id: '4', type: 'speaking', name: '自我介绍与兴趣爱', date: '2026-05-09', duration: 10, score: 0, completed: false },
  { id: '5', type: 'word', name: '商务词汇 - 会议用语', date: '2026-05-08', duration: 18, score: 88, completed: true },
  { id: '6', type: 'grammar', name: '虚拟语气综合练习', date: '2026-05-08', duration: 30, score: 72, completed: true },
  { id: '7', type: 'listening', name: 'TED演讲 - 人工智能', date: '2026-05-07', duration: 35, score: 65, completed: true },
  { id: '8', type: 'word', name: '学术词汇 - 研究方法', date: '2026-05-06', duration: 22, score: 95, completed: true },
  { id: '9', type: 'speaking', name: '描述图表与数', date: '2026-05-06', duration: 15, score: 0, completed: false },
  { id: '10', type: 'grammar', name: '定语从句专项', date: '2026-05-05', duration: 25, score: 90, completed: true },
]

const typeConfig = {
  word: { icon: BookOpen, color: 'var(--accent-primary)', label: '单词' },
  grammar: { icon: Brain, color: 'var(--success)', label: '语法' },
  listening: { icon: Headphones, color: 'var(--accent-navy)', label: '听力' },
  speaking: { icon: Mic, color: 'var(--error)', label: '口语' },
}

const filterTabs = [
  { key: 'all', label: '全部' },
  { key: 'word', label: '单词' },
  { key: 'grammar', label: '语法' },
  { key: 'listening', label: '听力' },
  { key: 'speaking', label: '口语' },
]

export default function StudyHistory() {
  const [activeFilter, setActiveFilter] = useState('all')

  const filteredHistory = activeFilter === 'all'
    ? mockHistory
    : mockHistory.filter(item => item.type === activeFilter)

  const totalSessions = mockHistory.length
  const totalTime = mockHistory.reduce((sum, item) => sum + item.duration, 0)
  const completedSessions = mockHistory.filter(item => item.completed)
  const averageScore = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((sum, item) => sum + item.score, 0) / completedSessions.length)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-24 pb-16 px-6"
    >
      <div className="max-w-4xl mx-auto">
        <h1 className="font-serif text-4xl gradient-text mb-2">学习记录</h1>
        <div className="ornament mb-8" />

        <div className="surface-glass rounded-[2rem] p-8 mb-8">
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="font-serif text-3xl gradient-text mb-1">{totalSessions}</div>
              <div className="text-sm text-[var(--text-secondary)]">总学习次</div>
            </div>
            <div className="text-center">
              <div className="font-serif text-3xl gradient-text mb-1">{totalTime}</div>
              <div className="text-sm text-[var(--text-secondary)]">总时分钟)</div>
            </div>
            <div className="text-center">
              <div className="font-serif text-3xl gradient-text mb-1">{averageScore}%</div>
              <div className="text-sm text-[var(--text-secondary)]">平均得分</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={activeFilter === tab.key ? 'btn-primary px-6 py-2.5 rounded-xl text-sm' : 'surface-glass px-6 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors'}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {filteredHistory.map((item, index) => {
            const config = typeConfig[item.type]
            const Icon = config.icon

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] as const }}
                className="surface-glass rounded-[2rem] p-6 card-liquid"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${config.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: config.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-serif text-lg text-[var(--text-primary)] truncate">{item.name}</h3>
                      <span
                        className={item.completed ? 'surface-glass text-[var(--text-primary)] text-xs px-3 py-1 rounded-full border border-[var(--accent-primary)]/10' : 'surface-glass text-[var(--text-muted)] text-xs px-3 py-1 rounded-full'}
                      >
                        {item.completed ? '已完成' : '未完成'}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-[var(--text-muted)]">{item.date}</div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">{item.duration}分钟</span>
                    </div>

                    {item.completed ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-[var(--accent-primary)]" />
                        <span className="text-sm text-[var(--text-primary)]">{item.score}%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <XCircle className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-sm text-[var(--text-muted)]">--</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
