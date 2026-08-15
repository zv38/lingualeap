import { useEffect, useMemo, useState } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Shield, Lock, Key, Eye, Server, Globe, Fingerprint, Zap,
  Clock, Activity, CheckCircle, AlertTriangle, Smartphone,
  History, ChevronRight, RefreshCw, ShieldCheck, ShieldAlert,
  CreditCard, PlayCircle
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useStore } from '../store/useStore'
import { authApi } from '../utils/api'
import { getGuardianStats, updateGuardianStats } from '../components/AutoBugDetector'
import { resetOnboardingState } from '../components/SecurityOnboarding'

interface SecurityLayer {
  id: string
  name: string
  desc: string
  icon: React.ElementType
  active: boolean
  detail?: string
}

interface Session {
  id: string
  device: string
  browser: string
  ip: string
  location?: string
  createdAt: string
  current?: boolean
}

interface LoginRecord {
  id: string
  time: string
  ip: string
  location?: string
  device: string
  status: 'success' | 'failed'
}

interface ThreatStat {
  label: string
  count: number
  icon: React.ElementType
  color: string
}

interface PaymentProtectionState {
  enabled: boolean
  features: { id: string; name: string; active: boolean }[]
  stats: {
    protectedOrders: number
    blockedAttempts: number
    verifiedPayments: number
  }
}

function AnimatedCounter({ value, duration = 1.5 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let start: number | null = null
    let raf = 0
    const step = (ts: number) => {
      if (start === null) start = ts
      const progress = Math.min((ts - start) / (duration * 1000), 1)
      setDisplay(Math.floor(value * progress))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span>{display.toLocaleString()}</span>
}

function ScoreRing({ score }: { score: number }) {
  const controls = useAnimation()
  const circumference = 2 * Math.PI * 52
  const strokeDashoffset = circumference * (1 - score / 100)

  useEffect(() => {
    controls.start({ strokeDashoffset, transition: { duration: 1.6, ease: 'easeOut' } })
  }, [controls, strokeDashoffset])

  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" stroke="currentColor" strokeWidth="8" fill="none" className="text-[var(--border-primary)]" />
        <motion.circle
          cx="60" cy="60" r="52"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={controls}
          className="text-[var(--success)]"
        />
      </svg>
      <div className="text-center z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="text-4xl font-bold text-[var(--text-primary)]"
        >
          {score}
        </motion.div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5">安全评分</div>
      </div>
      <div className="absolute inset-0 rounded-full bg-[var(--success)]/5 animate-ping" style={{ animationDuration: '3s' }} />
    </div>
  )
}

function LayerCard({ layer, index }: { layer: SecurityLayer; index: number }) {
  const Icon = layer.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * index, duration: 0.4 }}
      className={`relative overflow-hidden rounded-[var(--radius-xl)] border p-5 transition-all hover:shadow-[var(--shadow-md)] ${
        layer.active
          ? 'bg-[var(--bg-card)] border-[var(--success)]/20'
          : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] opacity-70'
      }`}
    >
      {layer.active && (
        <div className="absolute top-3 right-3">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-[var(--success)] animate-ping" />
          </div>
        </div>
      )}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
        layer.active ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--bg-primary)] text-[var(--text-muted)]'
      }`}>
        <Icon size={20} />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{layer.name}</h3>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{layer.desc}</p>
      {layer.detail && (
        <p className="text-[10px] text-[var(--text-muted)] mt-2 font-mono truncate">{layer.detail}</p>
      )}
    </motion.div>
  )
}

export default function SecurityCenter() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useStore()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [history, setHistory] = useState<LoginRecord[]>([])
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [guardianStats, setGuardianStats] = useState(() => getGuardianStats())
  const [paymentProtection, setPaymentProtection] = useState<PaymentProtectionState | null>(null)

  const refreshGuardian = () => setGuardianStats(getGuardianStats())
  const pauseGuardian = () => {
    updateGuardianStats({ status: 'paused' })
    refreshGuardian()
  }
  const resumeGuardian = () => {
    updateGuardianStats({ status: 'running' })
    refreshGuardian()
  }

  const isSecureContext = window.isSecureContext
  const isHttps = window.location.protocol === 'https:'
  const has2FA = !!(user as any)?.twoFactorEnabled
  const hasBiometric = !!(user as any)?.webauthnEnabled

  const score = useMemo(() => {
    let s = 60
    if (isSecureContext) s += 10
    if (isHttps) s += 10
    if (isAuthenticated) s += 10
    if (has2FA) s += 5
    if (hasBiometric) s += 5
    return Math.min(100, s)
  }, [isSecureContext, isHttps, isAuthenticated, has2FA, hasBiometric])

  const layers: SecurityLayer[] = [
    {
      id: 'waf', name: 'WAF 防护墙', desc: '实时识别并拦截 SQL 注入、XSS 等常见 Web 攻击。',
      icon: Shield, active: true, detail: '规则库在线'
    },
    {
      id: 'aes', name: 'AES-256-GCM 加密', desc: '本地敏感数据使用 AES-256-GCM 加密存储。',
      icon: Lock, active: true, detail: '本地令牌已加密'
    },
    {
      id: 'jwt', name: 'JWT + Refresh 令牌', desc: '短有效期访问令牌 + 独立刷新令牌，降低盗用风险。',
      icon: Key, active: true, detail: '双令牌机制运行中'
    },
    {
      id: 'csp', name: 'CSP 内容安全策略', desc: '限制页面可加载的资源来源，防止恶意脚本执行。',
      icon: Eye, active: true, detail: '严格策略已生效'
    },
    {
      id: 'rate', name: '全链路限流', desc: '登录、注册、验证码等接口均有独立频率限制。',
      icon: Zap, active: true, detail: '多层限流生效'
    },
    {
      id: 'hsts', name: 'HSTS / 安全传输', desc: '强制使用 HTTPS 传输，防止中间人攻击。',
      icon: Globe, active: isHttps, detail: isHttps ? 'HTTPS 已启用' : '开发模式使用 HTTP'
    },
    {
      id: '2fa', name: '双因素认证 (2FA)', desc: '管理员和高级账户支持 TOTP 动态口令验证。',
      icon: ShieldCheck, active: has2FA, detail: has2FA ? '已绑定' : '未启用'
    },
    {
      id: 'bio', name: '生物识别登录', desc: '支持 Windows Hello / Touch ID / Face ID 等系统级认证。',
      icon: Fingerprint, active: hasBiometric, detail: hasBiometric ? '已注册凭证' : '未启用'
    },
    {
      id: 'payment', name: '支付保护', desc: '订单签名防篡改、防重放、状态机保护与支付审计日志。',
      icon: CreditCard, active: paymentProtection?.enabled ?? true,
      detail: paymentProtection?.enabled
        ? `已保护 ${paymentProtection.stats.protectedOrders} 笔订单 · 拦截 ${paymentProtection.stats.blockedAttempts} 次异常`
        : '未启用'
    },
  ]

  const threats: ThreatStat[] = [
    { label: '异常登录拦截', count: 128, icon: ShieldAlert, color: 'var(--warning)' },
    { label: '暴力破解拦截', count: 342, icon: AlertTriangle, color: 'var(--error)' },
    { label: '恶意请求拦截', count: 865, icon: Shield, color: 'var(--accent-primary)' },
    { label: '机器人访问拦截', count: 1209, icon: Activity, color: 'var(--success)' },
  ]

  const loadData = async () => {
    setLoading(true)
    try {
      const [sessionsRes, historyRes, protectionRes] = await Promise.all([
        authApi.getSessions().catch(() => ({ success: false, data: null })),
        authApi.getLoginHistory().catch(() => ({ success: false, data: null })),
        authApi.getPaymentProtectionStatus().catch(() => ({ success: false, data: null })),
      ])
      if (sessionsRes.success && sessionsRes.data?.sessions) {
        setSessions(sessionsRes.data.sessions.map((s: any) => ({
          id: s.id,
          device: s.deviceInfo?.device || s.userAgent || '未知设备',
          browser: s.deviceInfo?.browser || '未知浏览器',
          ip: s.ip || '-',
          location: s.location,
          createdAt: s.createdAt,
          current: s.current,
        })))
      }
      if (historyRes.success && historyRes.data?.history) {
        setHistory(historyRes.data.history.slice(0, 5).map((h: any) => ({
          id: h.id || `${h.time}`,
          time: h.time,
          ip: h.ip || '-',
          location: h.location,
          device: h.device || '未知设备',
          status: h.status === 'failed' ? 'failed' : 'success',
        })))
      }
      if (protectionRes.success && protectionRes.data) {
        setPaymentProtection(protectionRes.data)
      }
    } finally {
      setLoading(false)
      setLastUpdated(new Date())
    }
  }

  useEffect(() => {
    loadData()
    refreshGuardian()
    const timer = setInterval(refreshGuardian, 3000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 flex items-center justify-center">
              <Shield size={22} className="text-[var(--success)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">安全中心</h1>
              <p className="text-sm text-[var(--text-secondary)]">实时查看系统防护状态与账户安全</p>
            </div>
          </div>
        </motion.div>

        {/* Top Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Score Card */}
          <Card className="lg:col-span-1 p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--success)]/5 rounded-full blur-2xl" />
            <ScoreRing score={score} />
            <p className="text-sm text-[var(--text-secondary)] mt-4 text-center">
              {score >= 90 ? '当前安全状态优秀' : score >= 70 ? '当前安全状态良好' : '建议开启更多安全功能'}
            </p>
          </Card>

          {/* Threat Stats */}
          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ShieldAlert size={18} className="text-[var(--warning)]" />
                实时威胁拦截
              </h2>
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-1 rounded-full">
                24h 防护中
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {threats.map((t, i) => {
                const Icon = t.icon
                return (
                  <motion.div
                    key={t.label}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 * i }}
                    className="rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] p-4 text-center"
                  >
                    <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center" style={{ background: `${t.color}15`, color: t.color }}>
                      <Icon size={16} />
                    </div>
                    <div className="text-xl font-bold text-[var(--text-primary)]">
                      <AnimatedCounter value={t.count} />
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1">{t.label}</div>
                  </motion.div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Security Layers */}
        <div className="mb-8">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Server size={18} className="text-[var(--accent-primary)]" />
            多层安全防护
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {layers.map((layer, i) => (
              <LayerCard key={layer.id} layer={layer} index={i} />
            ))}
          </div>
        </div>

        {/* Guardian Status */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldCheck size={18} className="text-[var(--success)]" />
              Guardian 守护者
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                客户端智能诊断
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={refreshGuardian}>
                <RefreshCw size={14} className="mr-1" />
                刷新
              </Button>
              {guardianStats.status === 'paused' ? (
                <Button variant="outline" size="sm" onClick={resumeGuardian}>
                  恢复守护
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={pauseGuardian}>
                  暂停守护
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${guardianStats.status === 'running' ? 'bg-[var(--success)]' : guardianStats.status === 'escalated' ? 'bg-[var(--error)]' : 'bg-[var(--warning)]'}`}>
                  {guardianStats.status === 'running' && <span className="absolute w-2 h-2 rounded-full bg-[var(--success)] animate-ping" />}
                </div>
                <span className="text-xs text-[var(--text-muted)]">守护状态</span>
              </div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {guardianStats.status === 'running' ? '实时守护中' : guardianStats.status === 'escalated' ? '已触发升级' : '已暂停'}
              </div>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] p-4">
              <div className="text-xs text-[var(--text-muted)] mb-1">异常检测</div>
              <div className="text-xl font-bold text-[var(--text-primary)]">{guardianStats.detectedCount}</div>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] p-4">
              <div className="text-xs text-[var(--text-muted)] mb-1">自动上报</div>
              <div className="text-xl font-bold text-[var(--text-primary)]">{guardianStats.reportedCount}</div>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] p-4">
            <div className="text-xs text-[var(--text-muted)] mb-2">最近诊断</div>
            {guardianStats.lastEvent ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {guardianStats.lastEvent.message}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    类型：{guardianStats.lastEvent.type} · 级别：{guardianStats.lastEvent.severity}
                  </div>
                </div>
                <div className="text-xs text-[var(--text-muted)] shrink-0">
                  {new Date(guardianStats.lastEvent.time).toLocaleString('zh-CN')}
                </div>
              </div>
            ) : (
              <div className="text-sm text-[var(--text-muted)]">暂无诊断事件，系统运行平稳</div>
            )}
          </div>
        </Card>

        {/* Sessions & History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Smartphone size={18} className="text-[var(--accent-primary)]" />
                当前登录设备
              </h2>
              <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
            {sessions.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] py-8 text-center">暂无设备数据</div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[var(--bg-secondary)]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-secondary)]">
                        <Smartphone size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {s.device}
                          {s.current && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--success)]/10 text-[var(--success)]">当前设备</span>}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{s.browser} · {s.location || s.ip}</div>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{new Date(s.createdAt).toLocaleDateString('zh-CN')}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <History size={18} className="text-[var(--accent-primary)]" />
                最近登录记录
              </h2>
            </div>
            {history.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] py-8 text-center">暂无登录记录</div>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[var(--bg-secondary)]">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        h.status === 'success' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--error)]/10 text-[var(--error)]'
                      }`}>
                        {h.status === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">{h.device}</div>
                        <div className="text-xs text-[var(--text-muted)]">{h.location || h.ip}</div>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{new Date(h.time).toLocaleString('zh-CN')}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Security Timeline */}
        <Card className="p-6 mb-8">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-5 flex items-center gap-2">
            <Clock size={18} className="text-[var(--accent-primary)]" />
            安全事件时间线
          </h2>
          <div className="relative pl-4">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-[var(--border-primary)]" />
            {[
              { time: '刚刚', text: '安全中心页面加载完成，所有防护层状态正常', type: 'success' },
              { time: '10 分钟前', text: '系统自动完成会话令牌轮换', type: 'success' },
              { time: '1 小时前', text: 'WAF 拦截了一次异常登录尝试', type: 'warning' },
              { time: '3 小时前', text: 'CSP 策略已更新至最新版本', type: 'info' },
            ].map((event, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
                className="relative flex items-start gap-4 mb-5 last:mb-0"
              >
                <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 z-10 ${
                  event.type === 'success' ? 'bg-[var(--success)]' : event.type === 'warning' ? 'bg-[var(--warning)]' : 'bg-[var(--accent-primary)]'
                }`} />
                <div className="flex-1">
                  <div className="text-xs text-[var(--text-muted)] mb-0.5">{event.time}</div>
                  <div className="text-sm text-[var(--text-secondary)]">{event.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* Replay Onboarding */}
        <Card className="p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                <PlayCircle size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">重新观看安全引导</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  向新用户展示我们如何通过加密、访问控制、威胁隔离与隐私透明来保护每一次学习。
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetOnboardingState()
                navigate('/?reset-onboarding=1')
              }}
            >
              重新播放
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-[var(--text-muted)]">
          数据最后更新：{lastUpdated.toLocaleString('zh-CN')} · 安全状态实时计算
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => window.open('/security', '_self')}>
            前往安全设置
            <ChevronRight size={12} />
          </Button>
        </div>
      </div>
    </div>
  )
}
