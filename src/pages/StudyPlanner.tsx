import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Plus, Clock, BookOpen, Brain, Headphones, Mic, Trash2, Edit2 } from 'lucide-react'
import Tooltip from '../components/Tooltip'

interface StudyGoal {
  id: string
  title: string
  type: 'vocabulary' | 'grammar' | 'listening' | 'speaking'
  duration: number
  completed: boolean
  date: string
}

const typeConfig = {
  vocabulary: { icon: BookOpen, color: 'var(--accent-primary)', label: '词汇' },
  grammar: { icon: Brain, color: 'var(--success)', label: '语法' },
  listening: { icon: Headphones, color: 'var(--accent-navy)', label: '听力' },
  speaking: { icon: Mic, color: 'var(--error)', label: '口语' },
}

const mockGoals: StudyGoal[] = [
  { id: '1', title: '学30个新单词', type: 'vocabulary', duration: 30, completed: true, date: '2026-05-10' },
  { id: '2', title: '过去时态练习', type: 'grammar', duration: 20, completed: false, date: '2026-05-10' },
  { id: '3', title: 'TED演讲听力', type: 'listening', duration: 25, completed: true, date: '2026-05-10' },
  { id: '4', title: '日常会话练习', type: 'speaking', duration: 15, completed: false, date: '2026-05-11' },
  { id: '5', title: '商务词汇巩固', type: 'vocabulary', duration: 20, completed: false, date: '2026-05-11' },
]

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

function getToday() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export default function StudyPlanner() {
  const [goals, setGoals] = useState(mockGoals)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newGoal, setNewGoal] = useState({ title: '', type: 'vocabulary' as StudyGoal['type'], duration: 15, date: getToday() })
  const [currentDate, setCurrentDate] = useState(getToday())
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)

  const filteredGoals = goals.filter(g => g.date === currentDate)
  const completedCount = filteredGoals.filter(g => g.completed).length
  const totalMinutes = filteredGoals.reduce((sum, g) => sum + g.duration, 0)

  const today = new Date(currentDate)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + i)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })

  function addGoal() {
    if (!newGoal.title.trim()) return
    const goal: StudyGoal = {
      id: Date.now().toString(),
      title: newGoal.title,
      type: newGoal.type,
      duration: newGoal.duration,
      completed: false,
      date: newGoal.date,
    }
    setGoals(prev => [...prev, goal])
    setNewGoal({ title: '', type: 'vocabulary', duration: 15, date: getToday() })
    setShowAddModal(false)
  }

  function toggleGoal(id: string) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, completed: !g.completed } : g))
  }

  function deleteGoal(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id))
    setSelectedGoal(null)
  }

  function getDayStats(date: string) {
    const dayGoals = goals.filter(g => g.date === date)
    return {
      count: dayGoals.length,
      completed: dayGoals.filter(g => g.completed).length,
      minutes: dayGoals.reduce((sum, g) => sum + g.duration, 0),
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-4xl gradient-text mb-2">学习计</h1>
            <p className="text-[var(--text-secondary)]">规划每日学习目</p>
          </div>
          <Tooltip content="添加学习目标">
            <motion.button
              onClick={() => setShowAddModal(true)}
              className="btn-primary rounded-full px-6 py-3 flex items-center gap-2"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={18} />
              <span className="hidden sm:inline">新目标</span>
            </motion.button>
          </Tooltip>
        </motion.div>

        <motion.div
          className="surface-glass rounded-[2rem] p-6 mb-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, i) => (
              <div key={day} className="text-center">
                <div className="font-mono text-xs text-[var(--text-muted)] mb-2">{day}</div>
                <Tooltip content={`${weekDates[i]} (${getDayStats(weekDates[i]).count}个目标)`}>
                  <button
                    onClick={() => setCurrentDate(weekDates[i])}
                    className={`w-full py-2 rounded-xl text-sm font-mono transition-all duration-300 ${
                      weekDates[i] === currentDate
                        ? 'text-white'
                        : weekDates[i] === getToday()
                        ? 'text-[var(--accent-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    style={weekDates[i] === currentDate ? { background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))' } : {}}
                  >
                    {new Date(weekDates[i]).getDate()}
                  </button>
                </Tooltip>
                <div className="flex justify-center gap-0.5 mt-1">
                  {getDayStats(weekDates[i]).count > 0 && (
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      getDayStats(weekDates[i]).completed === getDayStats(weekDates[i]).count
                        ? 'bg-[var(--success)]'
                        : 'bg-[var(--accent-primary)]/[0.4]'
                    }`} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl gradient-text">
                {currentDate === getToday() ? '今天' : currentDate}
              </h2>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-[var(--text-muted)]">
                  {completedCount}/{filteredGoals.length} 完成
                </span>
                <span className="font-mono text-sm text-[var(--accent-primary)]">
                  {totalMinutes}分钟
                </span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {filteredGoals.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="surface-glass rounded-[2rem] p-12 text-center"
                >
                  <Calendar size={48} className="text-[var(--text-muted)] mx-auto mb-4" />
                  <p className="font-serif text-xl text-[var(--text-primary)] mb-2">今日暂无目标</p>
                  <p className="text-sm text-[var(--text-secondary)] mb-6">添加学习目标，开启高效学习</p>
                  <Tooltip content="添加新目标">
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="btn-primary rounded-full px-6 py-3"
                    >
                      添加目标
                    </button>
                  </Tooltip>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {filteredGoals.map((goal) => {
                    const config = typeConfig[goal.type]
                    const Icon = config.icon

                    return (
                      <motion.div
                        key={goal.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`surface-glass rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all duration-300 ${
                          goal.completed ? 'opacity-60' : ''
                        }`}
                        onClick={() => setSelectedGoal(selectedGoal === goal.id ? null : goal.id)}
                      >
                        <motion.button
                          onClick={(e) => { e.stopPropagation(); toggleGoal(goal.id) }}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                            goal.completed
                              ? 'bg-[var(--success)] border-[var(--success)]'
                              : 'border-[var(--accent-primary)]/[0.4] hover:border-[var(--accent-primary)]'
                          }`}
                          whileTap={{ scale: 0.85 }}
                        >
                          {goal.completed && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </motion.button>

                        <div className="flex-1 min-w-0">
                          <p className={`font-serif text-base truncate mb-1 ${
                            goal.completed ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
                          }`}>
                            {goal.title}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                            style={{ background: `${config.color}12` }}
                          >
                            <Icon size={12} style={{ color: config.color }} />
                            <span className="font-mono text-xs" style={{ color: config.color }}>{config.label}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                            <Clock size={12} />
                            <span className="font-mono text-xs">{goal.duration}m</span>
                          </div>
                        </div>

                        {selectedGoal === goal.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-1"
                          >
                            <Tooltip content="编辑">
                              <button
                                onClick={(e) => { e.stopPropagation(); /* edit */ }}
                                className="p-1.5 rounded-lg hover:bg-[var(--accent-primary)]/[0.08] text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all"
                              >
                                <Edit2 size={14} />
                              </button>
                            </Tooltip>
                            <Tooltip content="删除">
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteGoal(goal.id) }}
                                className="p-1.5 rounded-lg hover:bg-[var(--error)]/[0.08] text-[var(--text-muted)] hover:text-[var(--error)] transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </Tooltip>
                          </motion.div>
                        )}
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-4">
            <motion.div
              className="surface-glass rounded-[2rem] p-6"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <h3 className="font-serif text-lg gradient-text mb-4">今日总</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-secondary)]">目标数量</span>
                  <span className="font-mono text-[var(--text-primary)]">{filteredGoals.length}</span>
                </div>
                <div className="ornament" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-secondary)]">已完成</span>
                  <span className="font-mono text-[var(--success)]">{completedCount}</span>
                </div>
                <div className="ornament" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-secondary)]">总时长</span>
                  <span className="font-mono text-[var(--accent-primary)]">{totalMinutes}分钟</span>
                </div>
                <div className="ornament" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-secondary)]">完成率</span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {filteredGoals.length > 0 ? Math.round((completedCount / filteredGoals.length) * 100) : 0}%
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2 bg-[var(--accent-primary)]/[0.08] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[var(--accent-primary)] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${filteredGoals.length > 0 ? (completedCount / filteredGoals.length) * 100 : 0}%` }}
                  transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
                />
              </div>
            </motion.div>

            <motion.div
              className="surface-glass rounded-[2rem] p-6"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <h3 className="font-serif text-lg gradient-text mb-4">类型分布</h3>
              <div className="space-y-3">
                {(Object.entries(typeConfig) as [StudyGoal['type'], typeof typeConfig[keyof typeof typeConfig]][]).map(([type, config]) => {
                  const Icon = config.icon
                  const count = filteredGoals.filter(g => g.type === type).length
                  const completed = filteredGoals.filter(g => g.type === type && g.completed).length
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <Icon size={16} style={{ color: config.color }} />
                      <span className="flex-1 text-sm text-[var(--text-secondary)]">{config.label}</span>
                      <span className="font-mono text-xs text-[var(--text-muted)]">{completed}/{count}</span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
              className="surface-glass rounded-[2rem] p-8 w-full max-w-md"
            >
              <h2 className="font-serif text-2xl gradient-text mb-6">添加学习目标</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] font-mono mb-2">目标描</label>
                  <input
                    type="text"
                    value={newGoal.title}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="例如：学30个新单词"
                    className="w-full surface-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/[0.25]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] font-mono mb-2">类</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(typeConfig) as [StudyGoal['type'], typeof typeConfig[keyof typeof typeConfig]][]).map(([type, config]) => {
                      const Icon = config.icon
                      return (
                        <button
                          key={type}
                          onClick={() => setNewGoal(prev => ({ ...prev, type }))}
                          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-all ${
                            newGoal.type === type
                              ? 'text-white'
                              : 'surface-glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                          style={newGoal.type === type ? { background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))' } : {}}
                        >
                          <Icon size={16} />
                          {config.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] font-mono mb-2">时(分钟)</label>
                    <input
                      type="number"
                      value={newGoal.duration}
                      onChange={(e) => setNewGoal(prev => ({ ...prev, duration: Math.max(5, parseInt(e.target.value) || 5) }))}
                      min={5}
                      className="w-full surface-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/[0.25]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] font-mono mb-2">日</label>
                    <input
                      type="date"
                      value={newGoal.date}
                      onChange={(e) => setNewGoal(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full surface-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/[0.25]"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <Tooltip content="保存新目标">
                  <button
                    onClick={addGoal}
                    className="btn-primary rounded-full px-6 py-3 flex-1"
                  >
                    添加
                  </button>
                </Tooltip>
                <Tooltip content="取消">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="btn-ghost rounded-full px-6 py-3 flex-1"
                  >
                    取消
                  </button>
                </Tooltip>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
