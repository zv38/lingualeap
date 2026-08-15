import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { request } from '../utils/api'
import {
  Shield, Activity, AlertTriangle, CheckCircle, X,
  RefreshCw, ShieldOff, ShieldAlert, Lock, Eye,
  FileText, Cpu, HardDrive, ArrowLeft, Bug,
  Ban, Radio, Terminal, Search,
} from 'lucide-react'

const spring = { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 }

interface DashboardData {
  timestamp: string
  tcpWaf: {
    blockedCount: number
    blockedIPs: Array<{
      ip: string
      reason: string
      blockedAt: string
      blockUntil: string
      remainingSeconds: number
      duration: number
    }>
    activeConnections: number
    totalTrackedIPs: number
    totalRequestsInWindow: number
  }
  runtimeGuard: {
    status: string
    lastCheckAt: string | null
    checksPassed: number
    checksFailed: number
    violationCount: number
    seriousViolation: boolean
    antiDebug: any
    memoryGuard: any
    processSandbox: any
    runtimeIntegrity: any
    recentViolations: Array<{
      type: string
      detail: string
      at: string
      serious: boolean
    }>
  }
  auditLog: {
    total: number
    recentEvents: Array<{
      id: string
      userId: string
      action: string
      ip: string
      details: string
      success: boolean
      timestamp: string
    }>
  }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 1000) return '刚刚'
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  return `${Math.floor(diff / 3600000)}小时前`
}

function getActionColor(action: string) {
  if (action.includes('block') || action.includes('Block') || action.includes('reject') || action.includes('violation')) return 'var(--danger)'
  if (action.includes('warn') || action.includes('Warn') || action.includes('warning')) return 'var(--warning)'
  if (action.includes('success') || action.includes('allow') || action.includes('pass')) return 'var(--success)'
  return 'var(--accent-primary)'
}

function getActionIcon(action: string) {
  if (action.includes('block') || action.includes('blocked') || action.includes('Block')) return ShieldOff
  if (action.includes('warn') || action.includes('warning')) return AlertTriangle
  if (action.includes('violation') || action.includes('fail')) return ShieldAlert
  if (action.includes('success') || action.includes('pass') || action.includes('allow')) return CheckCircle
  return Activity
}

export default function AdminSecurityDefense() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('overview')
  const [expandedViolation, setExpandedViolation] = useState<number | null>(null)
  const [filterLogAction, setFilterLogAction] = useState<string>('all')

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await request('/security/dashboard')
      if (res.success) {
        setData(res.data as DashboardData)
        setError(null)
      } else {
        setError('获取安全仪表盘数据失败')
      }
    } catch (err: any) {
      setError(err.message || '网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(fetchDashboard, 5000)
    return () => clearInterval(timer)
  }, [autoRefresh, fetchDashboard])

  const filteredLogs = data?.auditLog.recentEvents.filter(e =>
    filterLogAction === 'all' || e.action.includes(filterLogAction)
  ) || []

  const sections = [
    { id: 'overview', label: '总览', icon: Activity },
    { id: 'tcpwaf', label: 'TCP-WAF', icon: Shield },
    { id: 'runtime', label: '运行态防护', icon: Cpu },
    { id: 'audit', label: '审计日志', icon: FileText },
  ]

  // 违规类型统计
  const violationTypeCounts = data?.runtimeGuard.recentViolations.reduce((acc, v) => {
    acc[v.type] = (acc[v.type] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.8 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <motion.button
              type="button"
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <ArrowLeft className="w-4 h-4" />
              返回运营中心
            </motion.button>
            <div>
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                className="font-serif text-4xl gradient-text mb-2"
              >
                安全防护系统
              </motion.h1>
              <p className="text-[var(--text-secondary)]">
                实时监控安全防御系统运作状态 · 可视化防护过程
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'}`} />
              {autoRefresh ? '实时更新中' : '已暂停'}
            </div>
            <motion.button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                autoRefresh
                  ? 'text-[var(--success)] bg-[var(--success)]/10'
                  : 'text-[var(--text-secondary)] bg-[var(--accent-primary)]/5'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? '5s 自动刷新' : '手动刷新'}
            </motion.button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {sections.map((tab) => {
            const Icon = tab.icon
            const active = activeSection === tab.id
            return (
              <motion.button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
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
          {data && (
            <span className="ml-auto text-xs text-[var(--text-muted)]">
              更新于 {formatTime(data.timestamp)}
            </span>
          )}
        </div>

        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Shield className="w-12 h-12 text-[var(--accent-primary)]" />
            </motion.div>
            <p className="text-sm text-[var(--text-muted)]">加载安全防护系统数据...</p>
          </div>
        )}

        {error && !data && (
          <div className="glass-panel rounded-[2rem] p-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-[var(--warning)]" />
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">加载失败</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
            <motion.button
              type="button"
              onClick={fetchDashboard}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              重试
            </motion.button>
          </div>
        )}

        {data && (
          <AnimatePresence mode="wait">
            {/* ===== 总览 Section ===== */}
            {activeSection === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* 核心指标卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--danger)]/10 flex items-center justify-center">
                        <ShieldOff className="w-5 h-5 text-[var(--danger)]" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--text-primary)]">{data.tcpWaf.blockedCount}</div>
                        <div className="text-xs text-[var(--text-muted)]">封禁 IP</div>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-black/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(data.tcpWaf.blockedCount * 20, 100)}%` }}
                        className="h-full rounded-full bg-[var(--danger)]"
                      />
                    </div>
                  </div>

                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--warning)]/10 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--text-primary)]">{data.runtimeGuard.violationCount}</div>
                        <div className="text-xs text-[var(--text-muted)]">安全违规</div>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-black/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(data.runtimeGuard.violationCount * 10, 100)}%` }}
                        className="h-full rounded-full bg-[var(--warning)]"
                      />
                    </div>
                  </div>

                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center">
                        <Radio className="w-5 h-5 text-[var(--accent-primary)]" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--text-primary)]">{data.tcpWaf.activeConnections}</div>
                        <div className="text-xs text-[var(--text-muted)]">活跃连接</div>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-black/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(data.tcpWaf.activeConnections * 2, 100)}%` }}
                        className="h-full rounded-full bg-[var(--accent-primary)]"
                      />
                    </div>
                  </div>

                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--text-primary)]">{data.runtimeGuard.checksPassed}</div>
                        <div className="text-xs text-[var(--text-muted)]">自检通过</div>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-black/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        className="h-full rounded-full bg-[var(--success)]"
                      />
                    </div>
                  </div>
                </div>

                {/* 安全状态总览图 */}
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* TCP-WAF 安全网格 */}
                  <div className="glass-panel rounded-[2rem] p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-[var(--accent-primary)]" />
                        <h3 className="font-serif text-lg text-[var(--text-primary)]">TCP-WAF 防护状态</h3>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full ${
                        data.tcpWaf.blockedCount > 0
                          ? 'text-[var(--danger)] bg-[var(--danger)]/10'
                          : 'text-[var(--success)] bg-[var(--success)]/10'
                      }`}>
                        {data.tcpWaf.blockedCount > 0 ? '⚠ 有封禁' : '✅ 正常'}
                      </span>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-2 border-b border-[var(--accent-primary)]/5">
                        <span className="text-sm text-[var(--text-secondary)]">追踪 IP 数</span>
                        <span className="text-sm font-mono font-bold text-[var(--text-primary)]">{data.tcpWaf.totalTrackedIPs}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-[var(--accent-primary)]/5">
                        <span className="text-sm text-[var(--text-secondary)]">当前活跃连接</span>
                        <span className="text-sm font-mono font-bold text-[var(--text-primary)]">{data.tcpWaf.activeConnections}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-[var(--accent-primary)]/5">
                        <span className="text-sm text-[var(--text-secondary)]">窗口请求数</span>
                        <span className="text-sm font-mono font-bold text-[var(--text-primary)]">{data.tcpWaf.totalRequestsInWindow}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-[var(--text-secondary)]">当前封禁 IP</span>
                        <span className={`text-sm font-mono font-bold ${data.tcpWaf.blockedCount > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                          {data.tcpWaf.blockedCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* RuntimeGuard 安全网格 */}
                  <div className="glass-panel rounded-[2rem] p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-[var(--accent-primary)]" />
                        <h3 className="font-serif text-lg text-[var(--text-primary)]">运行态安全状态</h3>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full ${
                        data.runtimeGuard.seriousViolation
                          ? 'text-[var(--danger)] bg-[var(--danger)]/10'
                          : 'text-[var(--success)] bg-[var(--success)]/10'
                      }`}>
                        {data.runtimeGuard.seriousViolation ? '⚠ 严重' : '✅ 正常'}
                      </span>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-2 border-b border-[var(--accent-primary)]/5">
                        <span className="text-sm text-[var(--text-secondary)]">自检次数</span>
                        <span className="text-sm font-mono font-bold text-[var(--text-primary)]">{data.runtimeGuard.checksPassed + data.runtimeGuard.checksFailed}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-[var(--accent-primary)]/5">
                        <span className="text-sm text-[var(--text-secondary)]">通过 / 失败</span>
                        <span className="text-sm font-mono font-bold">
                          <span className="text-[var(--success)]">{data.runtimeGuard.checksPassed}</span>
                          <span className="text-[var(--text-muted)]"> / </span>
                          <span className={`${data.runtimeGuard.checksFailed > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
                            {data.runtimeGuard.checksFailed}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-[var(--accent-primary)]/5">
                        <span className="text-sm text-[var(--text-secondary)]">违规总数</span>
                        <span className={`text-sm font-mono font-bold ${data.runtimeGuard.violationCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                          {data.runtimeGuard.violationCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-[var(--text-secondary)]">上次自检</span>
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          {data.runtimeGuard.lastCheckAt ? formatTimeAgo(data.runtimeGuard.lastCheckAt) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 违规类型分布 */}
                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Bug className="w-5 h-5 text-[var(--warning)]" />
                    <h3 className="font-serif text-lg text-[var(--text-primary)]">安全违规类型分布</h3>
                  </div>
                  {Object.keys(violationTypeCounts).length === 0 ? (
                    <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                      暂无安全违规记录，系统运行正常
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(violationTypeCounts).map(([type, count], i) => {
                        const isSerious = type.includes('FAIL') || type.includes('ERROR') || type.includes('LEAKED')
                        return (
                          <motion.div
                            key={type}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="rounded-2xl p-4"
                            style={{ background: isSerious ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)' }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-2 h-2 rounded-full ${isSerious ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`} />
                              <span className="text-xs font-medium text-[var(--text-secondary)] truncate">{type}</span>
                            </div>
                            <div className="text-xl font-bold text-[var(--text-primary)]">{count}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{isSerious ? '严重' : '一般'}</div>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 最近违规 */}
                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                    <h3 className="font-serif text-lg text-[var(--text-primary)]">最近安全事件</h3>
                    <span className="text-xs text-[var(--text-muted)] ml-auto">
                      {data.runtimeGuard.recentViolations.length} 条记录
                    </span>
                  </div>
                  {data.runtimeGuard.recentViolations.length === 0 ? (
                    <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                      暂无安全事件，系统运行正常
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {data.runtimeGuard.recentViolations.slice(0, 10).map((v, i) => {
                        const ViolationIcon = getActionIcon(v.type)
                        const isExpanded = expandedViolation === i
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedViolation(isExpanded ? null : i)}
                              className="w-full text-left"
                            >
                              <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 transition-colors">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  v.serious ? 'bg-[var(--danger)]/10' : 'bg-[var(--warning)]/10'
                                }`}>
                                  <ViolationIcon className={`w-4 h-4 ${v.serious ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-medium ${v.serious ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>
                                      {v.type}
                                    </span>
                                    <span className="text-[10px] text-[var(--text-muted)]">{formatTimeAgo(v.at)}</span>
                                  </div>
                                  <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{v.detail}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  v.serious
                                    ? 'text-[var(--danger)] bg-[var(--danger)]/10'
                                    : 'text-[var(--warning)] bg-[var(--warning)]/10'
                                }`}>
                                  {v.serious ? '严重' : '一般'}
                                </span>
                              </div>
                            </button>
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="ml-11 mr-3 p-3 rounded-xl bg-black/5 mb-2">
                                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{v.detail}</div>
                                    <div className="text-[10px] text-[var(--text-muted)] mt-2 font-mono">{v.at}</div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 审计日志摘要 */}
                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-[var(--accent-primary)]" />
                      <h3 className="font-serif text-lg text-[var(--text-primary)]">最新审计日志</h3>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">共 {data.auditLog.total} 条</span>
                  </div>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {data.auditLog.recentEvents.slice(0, 15).map((log) => {
                      const LogIcon = getActionIcon(log.action)
                      return (
                        <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-black/5 transition-colors">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${getActionColor(log.action)}10` }}>
                            <LogIcon className="w-3.5 h-3.5" style={{ color: getActionColor(log.action) }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-medium text-[var(--text-primary)]">{log.action}</span>
                              <span className="text-[10px] text-[var(--text-muted)]">{formatTime(log.timestamp)}</span>
                              {log.success ? (
                                <span className="text-[10px] text-[var(--success)]">✓</span>
                              ) : (
                                <span className="text-[10px] text-[var(--danger)]">✗</span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                              {typeof log.details === 'string' ? log.details.slice(0, 120) : JSON.stringify(log.details).slice(0, 120)}
                            </p>
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] shrink-0">{log.ip}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ===== TCP-WAF Section ===== */}
            {activeSection === 'tcpwaf' && (
              <motion.div
                key="tcpwaf"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* TCP-WAF 指标 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="text-2xl font-bold text-[var(--text-primary)]">{data.tcpWaf.totalTrackedIPs}</div>
                    <div className="text-xs text-[var(--text-muted)]">追踪 IP 总数</div>
                  </div>
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="text-2xl font-bold text-[var(--text-primary)]">{data.tcpWaf.activeConnections}</div>
                    <div className="text-xs text-[var(--text-muted)]">当前活跃连接</div>
                  </div>
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="text-2xl font-bold text-[var(--text-primary)]">{data.tcpWaf.totalRequestsInWindow}</div>
                    <div className="text-xs text-[var(--text-muted)]">窗口内请求数</div>
                  </div>
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="text-2xl font-bold text-[var(--danger)]">{data.tcpWaf.blockedCount}</div>
                    <div className="text-xs text-[var(--text-muted)]">已封禁 IP</div>
                  </div>
                </div>

                {/* 封禁列表 */}
                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Ban className="w-5 h-5 text-[var(--danger)]" />
                    <h3 className="font-serif text-lg text-[var(--text-primary)]">封禁 IP 列表</h3>
                    <span className="text-xs text-[var(--text-muted)] ml-auto">
                      {data.tcpWaf.blockedCount > 0 ? `当前 ${data.tcpWaf.blockedCount} 个 IP 被封禁` : '无封禁'}
                    </span>
                  </div>
                  {data.tcpWaf.blockedIPs.length === 0 ? (
                    <div className="text-center py-12">
                      <Shield className="w-12 h-12 mx-auto mb-3 text-[var(--success)]" />
                      <p className="text-sm text-[var(--text-muted)]">没有 IP 被封禁，一切正常</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--accent-primary)]/5">
                            <th className="text-left py-3 px-2 font-medium">IP 地址</th>
                            <th className="text-left py-3 px-2 font-medium">封禁原因</th>
                            <th className="text-left py-3 px-2 font-medium">封禁时长</th>
                            <th className="text-left py-3 px-2 font-medium">剩余时间</th>
                            <th className="text-left py-3 px-2 font-medium">状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.tcpWaf.blockedIPs.map((ip, i) => (
                            <motion.tr
                              key={ip.ip}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              className="border-b border-[var(--accent-primary)]/5 hover:bg-black/5 transition-colors"
                            >
                              <td className="py-3 px-2 font-mono text-xs text-[var(--text-primary)]">{ip.ip}</td>
                              <td className="py-3 px-2 text-xs text-[var(--text-secondary)]">{ip.reason}</td>
                              <td className="py-3 px-2 text-xs text-[var(--text-muted)]">{Math.round(ip.duration / 60000)} 分钟</td>
                              <td className="py-3 px-2">
                                <span className={`text-xs font-mono ${ip.remainingSeconds > 30 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>
                                  {ip.remainingSeconds > 60
                                    ? `${Math.floor(ip.remainingSeconds / 60)} 分钟`
                                    : `${ip.remainingSeconds} 秒`}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <span className="text-[10px] px-2 py-0.5 rounded-full text-[var(--danger)] bg-[var(--danger)]/10">
                                  封禁中
                                </span>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 防护策略说明 */}
                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-5 h-5 text-[var(--accent-primary)]" />
                    <h3 className="font-serif text-lg text-[var(--text-primary)]">TCP-WAF 防护策略</h3>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(34, 197, 94, 0.06)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">本地回环地址（宽松）</span>
                      </div>
                      <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                        <li>• 最大连接数: 50/分钟</li>
                        <li>• 最大请求数: 500/分钟</li>
                        <li>• 封禁时长: 30 秒</li>
                        <li>• 适用于 127.0.0.1 / ::1 / localhost</li>
                      </ul>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--danger)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">外部地址（严格）</span>
                      </div>
                      <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                        <li>• 最大连接数: 30/分钟</li>
                        <li>• 最大请求数: 100/分钟</li>
                        <li>• 封禁时长: 15 分钟</li>
                        <li>• 适用于外部网络访问</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ===== 运行态防护 Section ===== */}
            {activeSection === 'runtime' && (
              <motion.div
                key="runtime"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* 运行态安全指标 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span className="text-xs text-[var(--text-muted)]">自检次数</span>
                    </div>
                    <div className="text-2xl font-bold text-[var(--text-primary)]">
                      {data.runtimeGuard.checksPassed + data.runtimeGuard.checksFailed}
                    </div>
                  </div>
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-[var(--success)]" />
                      <span className="text-xs text-[var(--text-muted)]">通过</span>
                    </div>
                    <div className="text-2xl font-bold text-[var(--success)]">{data.runtimeGuard.checksPassed}</div>
                  </div>
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <X className="w-4 h-4 text-[var(--danger)]" />
                      <span className="text-xs text-[var(--text-muted)]">失败</span>
                    </div>
                    <div className={`text-2xl font-bold ${data.runtimeGuard.checksFailed > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
                      {data.runtimeGuard.checksFailed}
                    </div>
                  </div>
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
                      <span className="text-xs text-[var(--text-muted)]">违规</span>
                    </div>
                    <div className={`text-2xl font-bold ${data.runtimeGuard.violationCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                      {data.runtimeGuard.violationCount}
                    </div>
                  </div>
                </div>

                {/* 子模块状态 */}
                <div className="grid lg:grid-cols-3 gap-4">
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">反调试检测</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      {data.runtimeGuard.antiDebug ? (
                        Object.entries(data.runtimeGuard.antiDebug).map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between py-1 border-b border-[var(--accent-primary)]/5 last:border-0">
                            <span className="text-[var(--text-secondary)]">{key}</span>
                            <span className={`font-mono ${val ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                              {String(val)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[var(--text-muted)]">无数据</span>
                      )}
                    </div>
                  </div>

                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Lock className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">内存防护</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      {data.runtimeGuard.memoryGuard ? (
                        Object.entries(data.runtimeGuard.memoryGuard).map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between py-1 border-b border-[var(--accent-primary)]/5 last:border-0">
                            <span className="text-[var(--text-secondary)]">{key}</span>
                            <span className="font-mono text-[var(--text-primary)]">{String(val)}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[var(--text-muted)]">无数据</span>
                      )}
                    </div>
                  </div>

                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Terminal className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">进程沙箱</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      {data.runtimeGuard.processSandbox ? (
                        Object.entries(data.runtimeGuard.processSandbox).map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between py-1 border-b border-[var(--accent-primary)]/5 last:border-0">
                            <span className="text-[var(--text-secondary)]">{key}</span>
                            <span className="font-mono text-[var(--text-primary)]">{String(val)}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[var(--text-muted)]">无数据</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 完整性检查 */}
                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <HardDrive className="w-5 h-5 text-[var(--accent-primary)]" />
                    <h3 className="font-serif text-lg text-[var(--text-primary)]">运行态完整性检查</h3>
                  </div>
                  {data.runtimeGuard.runtimeIntegrity ? (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
                        <div className={`text-2xl font-bold ${data.runtimeGuard.runtimeIntegrity.fileChangeCount > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                          {data.runtimeGuard.runtimeIntegrity.fileChangeCount}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">文件变更</div>
                      </div>
                      <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(245, 158, 11, 0.06)' }}>
                        <div className={`text-2xl font-bold ${data.runtimeGuard.runtimeIntegrity.moduleFindingCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                          {data.runtimeGuard.runtimeIntegrity.moduleFindingCount}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">可疑模块</div>
                      </div>
                      <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(245, 158, 11, 0.06)' }}>
                        <div className={`text-2xl font-bold ${data.runtimeGuard.runtimeIntegrity.memoryFindingCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                          {data.runtimeGuard.runtimeIntegrity.memoryFindingCount}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">内存敏感串</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-sm text-[var(--text-muted)]">完整性检查数据不可用</div>
                  )}
                </div>

                {/* 全部违规记录 */}
                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <Bug className="w-5 h-5 text-[var(--warning)]" />
                      <h3 className="font-serif text-lg text-[var(--text-primary)]">完整违规记录</h3>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{data.runtimeGuard.recentViolations.length} 条</span>
                  </div>
                  {data.runtimeGuard.recentViolations.length === 0 ? (
                    <div className="text-center py-12 text-sm text-[var(--text-muted)]">暂无违规记录</div>
                  ) : (
                    <div className="space-y-1 max-h-[500px] overflow-y-auto custom-scrollbar">
                      {data.runtimeGuard.recentViolations.map((v, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="flex items-start gap-3 p-3 rounded-xl hover:bg-black/5 transition-colors"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            v.serious ? 'bg-[var(--danger)]/10' : 'bg-[var(--warning)]/10'
                          }`}>
                            <ShieldAlert className={`w-4 h-4 ${v.serious ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[var(--text-primary)]">{v.type}</span>
                              <span className="text-[10px] text-[var(--text-muted)]">{formatTimeAgo(v.at)}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
                                v.serious
                                  ? 'text-[var(--danger)] bg-[var(--danger)]/10'
                                  : 'text-[var(--warning)] bg-[var(--warning)]/10'
                              }`}>
                                {v.serious ? '严重' : '一般'}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">{v.detail}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ===== 审计日志 Section ===== */}
            {activeSection === 'audit' && (
              <motion.div
                key="audit"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      value={filterLogAction === 'all' ? '' : filterLogAction}
                      onChange={(e) => setFilterLogAction(e.target.value || 'all')}
                      placeholder="搜索日志类型..."
                      className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                    />
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">共 {data.auditLog.total} 条日志</span>
                </div>

                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {filteredLogs.length === 0 ? (
                      <div className="text-center py-12 text-sm text-[var(--text-muted)]">暂无匹配的日志</div>
                    ) : (
                      filteredLogs.map((log, i) => {
                        const LogIcon = getActionIcon(log.action)
                        return (
                          <motion.div
                            key={log.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.01 }}
                            className="flex items-start gap-3 p-3 rounded-xl hover:bg-black/5 transition-colors border-b border-[var(--accent-primary)]/5 last:border-0"
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${getActionColor(log.action)}10` }}>
                              <LogIcon className="w-4 h-4" style={{ color: getActionColor(log.action) }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{log.action}</span>
                                {log.success ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full text-[var(--success)] bg-[var(--success)]/10">成功</span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full text-[var(--danger)] bg-[var(--danger)]/10">失败</span>
                                )}
                                <span className="text-[10px] text-[var(--text-muted)]">{log.ip}</span>
                                <span className="text-[10px] text-[var(--text-muted)]">{log.userId}</span>
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] mt-1">
                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                              </p>
                              <div className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">{formatTime(log.timestamp)}</div>
                            </div>
                          </motion.div>
                        )
                      })
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  )
}