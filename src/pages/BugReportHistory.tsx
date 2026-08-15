import { motion, AnimatePresence } from 'framer-motion'
import { useState, useMemo } from 'react'
import {
  Search, X, Clock, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, ThumbsUp, ThumbsDown,
  MessageSquare, ArrowLeft, Monitor, Smartphone, Bot
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore, BugReport } from '../store/useStore'
import EmptyState from '../components/EmptyState'
import Tooltip from '../components/Tooltip'

const spring = { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 }

interface HistoryItem extends BugReport {
  feedback?: 'helpful' | 'not_helpful'
}

const mockSeed: HistoryItem[] = [
  {
    id: 'BR-001',
    title: '部分听力练习音频文件加载失败',
    category: '功能异常',
    severity: 'high',
    description: '点击播放按钮后没有任何反应。浏览器控制台显示404错误。影响范围：日语中级课程的听力模块。',
    status: 'processing',
    submittedAt: '2026-05-10 14:32',
    reporter: '系统示例',
    browserInfo: { browser: 'Chrome', os: 'Windows', resolution: '1920x1080' },
  },
  {
    id: 'BR-002',
    title: '深色模式下辅助文字对比度不足',
    category: '界面显示',
    severity: 'medium',
    description: '在设置页面的某些选项中，深色模式下辅助文字与背景对比度不足，难以阅读。',
    status: 'resolved',
    submittedAt: '2026-05-08 09:15',
    reporter: '系统示例',
    adminResponse: '已调整颜色变量，提升了可读性',
    resolvedAt: '2026-05-09 16:00',
    feedback: 'helpful',
  },
  {
    id: 'BR-003',
    title: '学习进度统计图表数据不准确',
    category: '数据错误',
    severity: 'low',
    description: '本周学习时长统计与实际情况有偏差，显示的时间少于实际学习时间。',
    status: 'resolved',
    submittedAt: '2026-05-06 18:20',
    reporter: '系统示例',
    adminResponse: '已修复统计逻辑，重新计算了历史数据',
    resolvedAt: '2026-05-07 11:30',
  },
  {
    id: 'BR-004',
    title: '社区页面图片加载缓慢',
    category: '性能问题',
    severity: 'medium',
    description: '在社区页面浏览时，图片加载需要5-8秒，影响浏览体验。',
    status: 'pending',
    submittedAt: '2026-05-05 22:10',
    reporter: '系统示例',
  },
  {
    id: 'BR-005',
    title: '每日挑战题目重复',
    category: '功能异常',
    severity: 'low',
    description: '连续三天的每日挑战中出现了相同的题目，建议增加题目库的随机性。',
    status: 'closed',
    submittedAt: '2026-05-03 07:45',
    reporter: '系统示例',
    adminResponse: '已扩充题目库，增加随机算法',
    resolvedAt: '2026-05-04 10:20',
    feedback: 'not_helpful',
  },
]

const statusConfig = {
  open: { label: '待处理', color: 'var(--accent-primary)', bg: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)', icon: Clock },
  pending: { label: '待处理', color: 'var(--accent-primary)', bg: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)', icon: Clock },
  processing: { label: '处理中', color: 'var(--accent-navy)', bg: 'color-mix(in srgb, var(--accent-navy) 8%, transparent)', icon: AlertTriangle },
  analyzing: { label: '分析中', color: 'var(--accent-navy)', bg: 'color-mix(in srgb, var(--accent-navy) 8%, transparent)', icon: AlertTriangle },
  analyzed: { label: '已分析', color: 'var(--accent-navy)', bg: 'color-mix(in srgb, var(--accent-navy) 12%, transparent)', icon: Bot },
  resolved: { label: '已解决', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 8%, transparent)', icon: CheckCircle },
  closed: { label: '已关闭', color: 'var(--text-muted)', bg: 'color-mix(in srgb, var(--text-muted) 8%, transparent)', icon: X },
}

const severityConfig: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'var(--success)' },
  medium: { label: '中', color: 'var(--accent-primary)' },
  high: { label: '高', color: 'var(--accent-secondary)' },
}

export default function BugReportHistory() {
  const bugReports = useStore((s) => s.bugReports)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'helpful' | 'not_helpful'>>({})

  const items = useMemo(() => {
    const seedIds = new Set(mockSeed.map((m) => m.id))
    const userReports = bugReports.filter((r) => !seedIds.has(r.id))
    return [...mockSeed, ...userReports] as HistoryItem[]
  }, [bugReports])

  const filteredHistory = useMemo(() => {
    return items.filter((item) => {
      const matchSearch = !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase()) ||
        item.category.includes(search)
      const matchStatus = filterStatus === 'all' || item.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [items, search, filterStatus])

  const stats = useMemo(() => ({
    total: items.length,
    resolved: items.filter((i) => i.status === 'resolved').length,
    analyzing: items.filter((i) => i.status === 'analyzing' || i.status === 'analyzed').length,
    pending: items.filter((i) => i.status === 'pending' || i.status === 'processing').length,
  }), [items])

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const giveFeedback = (id: string, type: 'helpful' | 'not_helpful') => {
    setFeedbackGiven((prev) => ({ ...prev, [id]: type }))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.8 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          >
            <h1 className="font-serif text-4xl gradient-text mb-2">反馈记录</h1>
            <p className="text-[var(--text-secondary)]">查看所有 Bug 反馈的处理进度</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          >
            <Link
              to="/bug-report"
              className="btn-amber rounded-full px-4 py-2 text-sm flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回反馈</span>
            </Link>
          </motion.div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: '总计', value: stats.total, color: 'var(--text-primary)' },
            { label: '已解决', value: stats.resolved, color: 'var(--success)' },
            { label: '分析中', value: stats.analyzing, color: 'var(--accent-navy)' },
            { label: '待处理', value: stats.pending, color: 'var(--accent-primary)' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-stat rounded-xl p-4 text-center"
            >
              <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs text-[var(--text-muted)]">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="glass-panel rounded-[2rem] p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索标题、ID、分类..."
                className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {['all', 'pending', 'processing', 'analyzing', 'analyzed', 'resolved', 'closed'].map((s) => (
                <Tooltip key={s} content={s === 'all' ? '全部反馈' : `${statusConfig[s as keyof typeof statusConfig].label}反馈`}>
                  <motion.button
                    type="button"
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      filterStatus === s
                        ? 'text-white'
                        : 'text-[var(--text-secondary)] bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10'
                    }`}
                    style={filterStatus === s ? { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary))' } : {}}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={spring}
                  >
                    {s === 'all' ? '全部' : statusConfig[s as keyof typeof statusConfig].label}
                  </motion.button>
                </Tooltip>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {filteredHistory.length === 0 ? (
              <EmptyState
                icon={<Search size={48} />}
                title="没有找到匹配的反馈记录"
                description="尝试调整搜索条件或筛选条件"
                action={{ label: '清除筛选条件', onClick: () => { setSearch(''); setFilterStatus('all') } }}
              />
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {filteredHistory.map((item, index) => {
                  const StatusIcon = statusConfig[item.status].icon
                  const isExpanded = expandedId === item.id

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, type: 'spring', stiffness: 200, damping: 24 }}
                      className="glass-card rounded-2xl overflow-hidden"
                    >
                      <motion.button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        className="w-full p-4 flex items-start gap-4 text-left"
                        whileHover={{ background: 'color-mix(in srgb, var(--accent-primary) 3%, transparent)' }}
                        transition={spring}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: statusConfig[item.status].bg }}
                        >
                          <StatusIcon className="w-5 h-5" style={{ color: statusConfig[item.status].color }} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">{item.id}</span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                color: severityConfig[item.severity].color,
                                background: `${severityConfig[item.severity].color}15`,
                              }}
                            >
                              {severityConfig[item.severity].label}优先级
                            </span>
                          </div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">{item.title}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-[var(--text-muted)]">{item.category}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">·</span>
                            <span className="text-[10px] text-[var(--text-muted)]">{item.submittedAt}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap"
                            style={{
                              color: statusConfig[item.status].color,
                              background: statusConfig[item.status].bg,
                            }}
                          >
                            {statusConfig[item.status].label}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                          )}
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
                            <div className="px-4 pb-4 space-y-4 border-t border-[var(--accent-primary)]/5 pt-4">
                              <div>
                                <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">问题描述</h4>
                                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.description}</p>
                              </div>

                              {item.screenshots && item.screenshots.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">截图</h4>
                                  <div className="flex gap-2">
                                    {item.screenshots.map((src, i) => (
                                      <div key={i} className="w-20 h-20 rounded-lg overflow-hidden border border-[var(--accent-primary)]/10">
                                        <img src={src} alt={`截图 ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {item.browserInfo && (
                                <div>
                                  <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">设备信息</h4>
                                  <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                                    <span className="flex items-center gap-1">
                                      <Monitor className="w-3 h-3" />
                                      {item.browserInfo.browser}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Smartphone className="w-3 h-3" />
                                      {item.browserInfo.os}
                                    </span>
                                    <span>{item.browserInfo.resolution}</span>
                                  </div>
                                </div>
                              )}

                              {item.adminResponse && (
                                <div className="glass-mono-glow rounded-xl p-4">
                                  <h4 className="text-xs font-medium text-[var(--accent-primary)] mb-2 flex items-center gap-1.5">
                                    <MessageSquare className="w-3 h-3" />
                                    管理员回复
                                  </h4>
                                  <p className="text-sm text-[var(--text-secondary)]">{item.adminResponse}</p>
                                  {item.resolvedAt && (
                                    <p className="text-[10px] text-[var(--text-muted)] mt-2">{item.resolvedAt}</p>
                                  )}
                                </div>
                              )}

                              {(item as any).aiAnalysis && (
                                <div className="glass rounded-xl p-4 border border-[var(--accent-navy)]/10">
                                  <h4 className="text-xs font-medium text-[var(--accent-navy)] mb-3 flex items-center gap-1.5">
                                    <Bot className="w-3 h-3" />
                                    AI 分析报告
                                  </h4>
                                  <div className="space-y-3">
                                    <div>
                                      <span className="text-[10px] font-medium text-[var(--text-muted)]">根因分析</span>
                                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{(item as any).aiAnalysis.rootCause}</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-medium text-[var(--text-muted)]">影响范围</span>
                                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{(item as any).aiAnalysis.impact}</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-medium text-[var(--text-muted)]">建议修复方案</span>
                                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{(item as any).aiAnalysis.suggestedFix}</p>
                                    </div>
                                    {(item as any).aiAnalysis.affectedFiles && (item as any).aiAnalysis.affectedFiles.length > 0 && (
                                      <div>
                                        <span className="text-[10px] font-medium text-[var(--text-muted)]">涉及文件</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                          {(item as any).aiAnalysis.affectedFiles.map((f: string, i: number) => (
                                            <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-navy)]/5 text-[var(--accent-navy)]">
                                              {f}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between pt-1 border-t border-[var(--accent-navy)]/5">
                                      <span className="text-[10px] text-[var(--text-muted)]">
                                        分析时间: {(item as any).aiAnalysis.analyzedAt ? new Date((item as any).aiAnalysis.analyzedAt).toLocaleString('zh-CN') : ''}
                                      </span>
                                      <span className="text-[10px] px-2 py-0.5 rounded font-medium"
                                        style={{
                                          color: (item as any).aiAnalysis.priority === 'high' ? 'var(--accent-secondary)' : (item as any).aiAnalysis.priority === 'medium' ? 'var(--accent-primary)' : 'var(--success)',
                                          background: `${(item as any).aiAnalysis.priority === 'high' ? 'var(--accent-secondary)' : (item as any).aiAnalysis.priority === 'medium' ? 'var(--accent-primary)' : 'var(--success)'}10`,
                                        }}
                                      >
                                        {(item as any).aiAnalysis.priority === 'high' ? '高优先级' : (item as any).aiAnalysis.priority === 'medium' ? '中优先级' : '低优先级'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {item.status === 'resolved' && !feedbackGiven[item.id] && (
                                <div className="flex items-center gap-3 pt-2">
                                  <span className="text-xs text-[var(--text-muted)]">这个回复对你有帮助吗？</span>
                                  <motion.button
                                    type="button"
                                    onClick={() => giveFeedback(item.id, 'helpful')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--success)] bg-[var(--success)]/8 hover:bg-[var(--success)]/15 transition-colors"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                  >
                                    <ThumbsUp className="w-3 h-3" />
                                    有帮助
                                  </motion.button>
                                  <motion.button
                                    type="button"
                                    onClick={() => giveFeedback(item.id, 'not_helpful')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--warning)] bg-[var(--warning)]/8 hover:bg-[var(--warning)]/15 transition-colors"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                  >
                                    <ThumbsDown className="w-3 h-3" />
                                    没帮助
                                  </motion.button>
                                </div>
                              )}

                              {feedbackGiven[item.id] && (
                                <div className="flex items-center gap-1.5 text-xs" style={{
                                  color: feedbackGiven[item.id] === 'helpful' ? 'var(--success)' : 'var(--accent-secondary)'
                                }}>
                                  {feedbackGiven[item.id] === 'helpful' ? (
                                    <><ThumbsUp className="w-3 h-3" /> 感谢你的反馈！</>
                                  ) : (
                                    <><ThumbsDown className="w-3 h-3" /> 我们会继续改进</>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
