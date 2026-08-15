import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useStore, type BugReport } from '../store/useStore'
import {
  Bug, Search, X, Clock, CheckCircle, AlertTriangle, MessageSquare,
  ChevronDown, ChevronUp, Reply, LogOut, Activity,
  Shield, Zap, RefreshCw, BarChart3, Lock,
  Server, TrendingUp, Swords, ShieldCheck, Gavel, UserPlus,
  type LucideIcon
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import Tooltip from '../components/Tooltip'
import StatCard from '../components/StatCard'
import AIDecisionStream from '../components/AIDecisionStream'
import ThreatList from '../components/ThreatList'
import PrivacyEventLog from '../components/PrivacyEventLog'
import { IsolationControl } from '../components/IsolationControl'
import { request } from '../utils/api'
import { useSpringNumber } from '../hooks/useSpringNumber'

const spring = { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 }

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: LucideIcon }> = {
  pending: { label: '待处理', color: 'var(--accent-primary)', bg: 'rgba(0, 0, 0, 0.08)', icon: Clock },
  processing: { label: '处理中', color: 'var(--accent-secondary)', bg: 'rgba(0, 0, 0, 0.08)', icon: AlertTriangle },
  analyzing: { label: '分析中', color: 'var(--accent-primary)', bg: 'rgba(0, 0, 0, 0.08)', icon: Search },
  analyzed: { label: '已分析', color: 'var(--success)', bg: 'rgba(0, 0, 0, 0.08)', icon: CheckCircle },
  resolved: { label: '已解决', color: 'var(--success)', bg: 'rgba(0, 0, 0, 0.08)', icon: CheckCircle },
  closed: { label: '已关闭', color: 'var(--text-muted)', bg: 'rgba(0, 0, 0, 0.06)', icon: X },
}

const severityConfig: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'var(--success)' },
  medium: { label: '中', color: 'var(--accent-primary)' },
  high: { label: '高', color: 'var(--warning)' },
}

const statuses = ['pending', 'processing', 'resolved', 'closed'] as const

interface SecurityDashboardData {
  kpi: {
    totalDecisions: number
    blocked: number
    challenged: number
    avgLatency: string
    activeThreats: number
    privacyScans: number
  }
  actionDistribution: Record<string, number>
  layerContributions: {
    rule: number
    statistical: number
    semantic: number
    behavior: number
  }
  recentDecisions: Array<{
    id: string
    action: 'ALLOW' | 'CHALLENGE' | 'BLOCK' | 'DEGRADE' | 'OBSERVE'
    confidence: number
    reasoning: string
    context: { ip: string; endpoint: string }
    latency: number
    timestamp: string
  }>
  threats: Array<{
    key: string
    score: number
    requestCount: number
    firstSeen?: number
    signals?: { type: string; risk: string; value?: string }[]
  }>
  privacy: {
    totalScans: number
    totalFilters: number
    typeCounts: Record<string, number>
    retention: { totalMessages: number; totalUsers: number }
  }
}

interface PrivacyEvent {
  id: string
  action: string
  userId: string
  timestamp: string
  details?: { count?: number; types?: string[]; blocked?: boolean }
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user, bugReports, updateBugReport, logout, addToast } = useStore()
  const [activeTab, setActiveTab] = useState<'security' | 'feedback'>('security')

  // Feedback tab state
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  // Security tab state
  const [securityData, setSecurityData] = useState<SecurityDashboardData | null>(null)
  const [privacyEvents, setPrivacyEvents] = useState<PrivacyEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const filtered = useMemo(() => {
    return bugReports.filter((r) => {
      const matchSearch = !search ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase()) ||
        r.category.includes(search) ||
        r.reporter.includes(search)
      const matchStatus = filterStatus === 'all' || r.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [bugReports, search, filterStatus])

  const feedbackStats = useMemo(() => ({
    total: bugReports.length,
    pending: bugReports.filter((r) => r.status === 'pending').length,
    processing: bugReports.filter((r) => r.status === 'processing').length,
    resolved: bugReports.filter((r) => r.status === 'resolved').length,
  }), [bugReports])

  const { display: totalDecisionsDisplay } = useSpringNumber(securityData?.kpi.totalDecisions || 0)
  const { display: blockedDisplay } = useSpringNumber(securityData?.kpi.blocked || 0)
  const { display: challengedDisplay } = useSpringNumber(securityData?.kpi.challenged || 0)
  const { display: threatsDisplay } = useSpringNumber(securityData?.kpi.activeThreats || 0)

  const fetchSecurityData = useCallback(async () => {
    setLoading(true)
    try {
      const [dashboardRes, eventsRes] = await Promise.all([
        request('/admin/security/dashboard'),
        request('/ai/privacy/events?limit=50'),
      ])

      if (dashboardRes.success && dashboardRes.data?.success) {
        setSecurityData(dashboardRes.data.data as SecurityDashboardData)
      } else if (dashboardRes.success && dashboardRes.data) {
        setSecurityData(dashboardRes.data as SecurityDashboardData)
      }

      if (eventsRes.success && eventsRes.data?.success) {
        setPrivacyEvents(eventsRes.data.data as PrivacyEvent[])
      } else if (eventsRes.success && Array.isArray(eventsRes.data)) {
        setPrivacyEvents(eventsRes.data as PrivacyEvent[])
      }
      setLastUpdated(new Date())
    } catch (err) {
      addToast('安全数据加载失败', 'error', 3000)
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (activeTab === 'security') {
      fetchSecurityData()
      const timer = setInterval(fetchSecurityData, 15000)
      return () => clearInterval(timer)
    }
  }, [activeTab, fetchSecurityData])

  const changeStatus = (id: string, status: BugReport['status']) => {
    const updates: Partial<BugReport> = { status }
    if (status === 'resolved') {
      updates.resolvedAt = new Date().toLocaleString('zh-CN')
    }
    updateBugReport(id, updates)
  }

  const handleReply = (id: string) => {
    if (!replyText.trim()) return
    updateBugReport(id, {
      adminResponse: replyText.trim(),
      status: 'resolved',
      resolvedAt: new Date().toLocaleString('zh-CN'),
    })
    setReplyText('')
    setReplyingTo(null)
  }

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  const layerLabels = [
    { key: 'rule', label: '规则层', color: '#000000' },
    { key: 'statistical', label: '统计层', color: '#52525b' },
    { key: 'semantic', label: '语义层', color: '#a1a1aa' },
    { key: 'behavior', label: '行为层', color: '#d4d4d8' },
  ] as const

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.8 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
              className="font-serif text-4xl gradient-text mb-2"
            >
              安全运营中心
            </motion.h1>
            <p className="text-[var(--text-secondary)]">
              欢迎回来，{user?.username} · AI 防御、隐私审计与反馈管理统一视图
            </p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              onClick={() => navigate('/admin/security')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <ShieldCheck className="w-4 h-4" />
              管理员安全中心
            </motion.button>
            <motion.button
              type="button"
              onClick={() => navigate('/admin/appeals')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Gavel className="w-4 h-4" />
              申诉审核
            </motion.button>
            <motion.button
              type="button"
              onClick={() => navigate('/admin/services')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Server className="w-4 h-4" />
              服务监控
            </motion.button>
            <motion.button
              type="button"
              onClick={() => navigate('/admin/create-admin')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <UserPlus className="w-4 h-4" />
              创建管理员
            </motion.button>
            <motion.button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--warning)] hover:bg-[var(--warning)]/8 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <LogOut className="w-4 h-4" />
              退出管理
            </motion.button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { id: 'security', label: '安全运营中心', icon: Shield },
            { id: 'feedback', label: '反馈管理', icon: Bug },
          ].map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <motion.button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'text-white'
                    : 'text-[var(--text-secondary)] bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10'
                }`}
                style={active ? { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' } : {}}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={spring}
              >
                <Icon size={16} />
                {tab.label}
              </motion.button>
            )
          })}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'security' ? (
            <motion.div
              key="security"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard
                  label="总决策"
                  value={totalDecisionsDisplay}
                  icon={Activity}
                  color="var(--accent-primary)"
                  delay={0}
                  trend="AI 实时决策"
                />
                <StatCard
                  label="拦截请求"
                  value={blockedDisplay}
                  icon={Swords}
                  color="var(--danger)"
                  delay={0.05}
                  trend="已阻断"
                />
                <StatCard
                  label="挑战验证"
                  value={challengedDisplay}
                  icon={AlertTriangle}
                  color="var(--warning)"
                  delay={0.1}
                  trend="需二次确认"
                />
                <StatCard
                  label="平均延迟"
                  value={securityData?.kpi.avgLatency || '0ms'}
                  icon={Zap}
                  color="var(--accent-cool)"
                  delay={0.15}
                  trend="决策耗时"
                />
                <StatCard
                  label="活跃威胁"
                  value={threatsDisplay}
                  icon={Shield}
                  color="var(--error)"
                  delay={0.2}
                  trend="行为异常"
                />
                <StatCard
                  label="隐私扫描"
                  value={securityData?.kpi.privacyScans || 0}
                  icon={Lock}
                  color="var(--success)"
                  delay={0.25}
                  trend="PII 脱敏/过滤"
                />
              </div>

              {/* Action Distribution + Layer Contributions */}
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={18} className="text-[var(--accent-primary)]" />
                      <h3 className="font-serif text-lg text-[var(--text-primary)]">决策分布</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {loading && <RefreshCw size={14} className="animate-spin text-[var(--text-muted)]" />}
                      <span className="text-xs text-[var(--text-muted)]">
                        {lastUpdated ? `更新于 ${lastUpdated.toLocaleTimeString('zh-CN')}` : '加载中...'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {['ALLOW', 'CHALLENGE', 'BLOCK', 'DEGRADE', 'OBSERVE'].map((action, i) => {
                      const count = securityData?.actionDistribution?.[action] || 0
                      const total = Math.max(securityData?.kpi.totalDecisions || 1, 1)
                      const pct = total > 0 ? (count / total) * 100 : 0
                      const colors: Record<string, string> = {
                        ALLOW: 'var(--success)',
                        CHALLENGE: 'var(--warning)',
                        BLOCK: 'var(--danger)',
                        DEGRADE: 'var(--accent-primary)',
                        OBSERVE: 'var(--text-muted)',
                      }
                      return (
                        <motion.div
                          key={action}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="rounded-2xl p-4 text-center"
                          style={{ background: 'rgba(255,255,255,0.5)' }}
                        >
                          <div className="text-2xl font-bold" style={{ color: colors[action] }}>{count}</div>
                          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">{action}</div>
                          <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, delay: 0.2 + i * 0.05 }}
                              className="h-full rounded-full"
                              style={{ background: colors[action] }}
                            />
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>

                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={18} className="text-[var(--accent-primary)]" />
                    <h3 className="font-serif text-lg text-[var(--text-primary)]">检测层贡献</h3>
                  </div>
                  <div className="space-y-4">
                    {layerLabels.map((layer, i) => {
                      const value = securityData?.layerContributions?.[layer.key] || 0
                      const max = Math.max(
                        1,
                        ...layerLabels.map(l => securityData?.layerContributions?.[l.key] || 0)
                      )
                      const pct = max > 0 ? (value / max) * 100 : 0
                      return (
                        <div key={layer.key}>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-[var(--text-secondary)]">{layer.label}</span>
                            <span className="font-mono text-[var(--text-muted)]">{value}</span>
                          </div>
                          <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, delay: 0.3 + i * 0.08 }}
                              className="h-full rounded-full"
                              style={{ background: layer.color }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Auto Isolation Control */}
              <IsolationControl />

              {/* Decision Stream + Threats */}
              <div className="grid lg:grid-cols-2 gap-6 h-[420px]">
                <AIDecisionStream decisions={securityData?.recentDecisions || []} maxItems={20} />
                <ThreatList threats={securityData?.threats || []} />
              </div>

              {/* Privacy Events */}
              <div className="h-[360px]">
                <PrivacyEventLog
                  events={privacyEvents}
                  stats={securityData?.privacy ? {
                    totalScans: securityData.privacy.totalScans,
                    totalFilters: securityData.privacy.totalFilters,
                    typeCounts: securityData.privacy.typeCounts,
                  } : undefined}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Feedback Stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: '全部反馈', value: feedbackStats.total, color: 'var(--text-primary)' },
                  { label: '待处理', value: feedbackStats.pending, color: 'var(--accent-primary)' },
                  { label: '处理中', value: feedbackStats.processing, color: 'var(--accent-navy)' },
                  { label: '已解决', value: feedbackStats.resolved, color: 'var(--success)' },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass-card rounded-xl p-4 text-center"
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
                      placeholder="搜索标题、ID、分类、提交者..."
                      className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    {['all', 'pending', 'processing', 'resolved', 'closed'].map((s) => (
                      <Tooltip key={s} content={s === 'all' ? '全部反馈' : `${statusConfig[s as keyof typeof statusConfig].label}反馈`}>
                        <motion.button
                          type="button"
                          onClick={() => setFilterStatus(s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
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
                  {filtered.length === 0 ? (
                    <EmptyState
                      icon={<Bug size={48} />}
                      title={bugReports.length === 0 ? '暂无反馈' : '没有匹配的反馈'}
                      description={bugReports.length === 0 ? '一切正常，暂无Bug反馈' : '尝试调整筛选条件'}
                    />
                  ) : (
                    <motion.div
                      key="list"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      {filtered.map((item, index) => {
                        const StatusIcon = statusConfig[item.status].icon
                        const isExpanded = expandedId === item.id
                        const isReplying = replyingTo === item.id

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
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="w-full p-4 flex items-start gap-4 text-left"
                              whileHover={{ background: 'rgba(0, 0, 0, 0.03)' }}
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
                                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                                    color: severityConfig[item.severity].color,
                                    background: `color-mix(in srgb, ${severityConfig[item.severity].color} 8%, transparent)`,
                                  }}>
                                    {severityConfig[item.severity].label}优先级
                                  </span>
                                  <span className="text-[10px] text-[var(--text-muted)]">{item.category}</span>
                                </div>
                                <h3 className="text-sm font-medium text-[var(--text-primary)]">{item.title}</h3>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-[var(--text-secondary)]">{item.reporter}</span>
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

                                    {item.email && (
                                      <div className="text-xs text-[var(--text-muted)]">
                                        联系邮箱：{item.email}
                                      </div>
                                    )}

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
                                          <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{item.browserInfo.browser}</span>
                                          <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{item.browserInfo.os}</span>
                                          <span>{item.browserInfo.resolution}</span>
                                        </div>
                                      </div>
                                    )}

                                    {item.adminResponse && (
                                      <div className="glass-mono-glow rounded-xl p-4">
                                        <h4 className="text-xs font-medium text-[var(--accent-primary)] mb-2 flex items-center gap-1.5">
                                          <MessageSquare className="w-3 h-3" />
                                          回复内容
                                        </h4>
                                        <p className="text-sm text-[var(--text-secondary)]">{item.adminResponse}</p>
                                        {item.resolvedAt && (
                                          <p className="text-[10px] text-[var(--text-muted)] mt-2">{item.resolvedAt}</p>
                                        )}
                                      </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2 pt-2">
                                      <span className="text-xs text-[var(--text-muted)] mr-1">状态：</span>
                                      {statuses.map((s) => (
                                        <Tooltip key={s} content={`标记为${statusConfig[s].label}`}>
                                          <motion.button
                                            type="button"
                                            onClick={() => changeStatus(item.id, s)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                              item.status === s
                                                ? 'text-white'
                                                : 'text-[var(--text-secondary)] bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10'
                                            }`}
                                            style={item.status === s ? {
                                              background: `linear-gradient(135deg, ${statusConfig[s].color}, color-mix(in srgb, ${statusConfig[s].color} 80%, transparent))`
                                            } : {}}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.97 }}
                                            transition={spring}
                                          >
                                            {statusConfig[s].label}
                                          </motion.button>
                                        </Tooltip>
                                      ))}

                                      {item.status !== 'resolved' && item.status !== 'closed' && (
                                        <Tooltip content={isReplying ? '取消回复' : '回复反馈'}>
                                          <motion.button
                                            type="button"
                                            onClick={() => setReplyingTo(isReplying ? null : item.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent-primary)] bg-[var(--accent-primary)]/8 hover:bg-[var(--accent-primary)]/15 transition-all ml-auto"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.97 }}
                                          >
                                            <Reply className="w-3 h-3" />
                                            {isReplying ? '取消回复' : '回复'}
                                          </motion.button>
                                        </Tooltip>
                                      )}
                                    </div>

                                    {isReplying && (
                                      <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex gap-2"
                                      >
                                        <textarea
                                          value={replyText}
                                          onChange={(e) => setReplyText(e.target.value)}
                                          placeholder="输入回复内容..."
                                          className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none h-20"
                                        />
                                        <div className="flex flex-col gap-2">
                                          <Tooltip content="发送回复">
                                            <motion.button
                                              type="button"
                                              onClick={() => handleReply(item.id)}
                                              disabled={!replyText.trim()}
                                              className="px-4 py-2 rounded-xl text-xs font-medium text-white"
                                              style={{
                                                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary))',
                                                opacity: replyText.trim() ? 1 : 0.5,
                                              }}
                                              whileHover={replyText.trim() ? { scale: 1.02 } : {}}
                                              whileTap={replyText.trim() ? { scale: 0.97 } : {}}
                                            >
                                              发送
                                            </motion.button>
                                          </Tooltip>
                                        </div>
                                      </motion.div>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

