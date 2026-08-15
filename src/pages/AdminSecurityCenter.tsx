import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Shield, ShieldAlert, ShieldCheck, Smartphone, Monitor,
  History, AlertTriangle, Fingerprint, Lock, RefreshCw,
  LogOut, ChevronLeft, Trash2, CheckCircle, XCircle,
  Clock, MapPin, Server, Gavel
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useStore } from '../store/useStore'
import { request, post, get } from '../utils/api'
import EmptyState from '../components/EmptyState'

interface TrustedDevice {
  fpHash: string
  name: string
  ip: string
  createdAt: number
  lastSeenAt: number
}

interface LoginRecord {
  id: string
  timestamp: number
  ip: string
  deviceName: string
  fpHash: string
  riskScore: number
  riskLevel: string
  success: boolean
  reason?: string
}

interface RiskEvent {
  id: string
  timestamp: number
  type: string
  level: string
  ip: string
  deviceName: string
  message: string
}

interface RiskStatus {
  score: number
  level: string
  trusted: boolean
  factors: Array<{ factor: string; score: number; desc: string }>
}

interface FreshMfaStatus {
  valid: boolean
  remainingMs?: number
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN')
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

function getRiskColor(level: string) {
  switch (level) {
    case 'trusted': return 'var(--success)'
    case 'medium': return 'var(--warning)'
    case 'high_risk': return 'var(--error)'
    case 'blocked': return 'var(--danger)'
    default: return 'var(--text-muted)'
  }
}

function getRiskLabel(level: string) {
  switch (level) {
    case 'trusted': return '可信'
    case 'medium': return '中等风险'
    case 'high_risk': return '高风险'
    case 'blocked': return '已阻断'
    default: return '未知'
  }
}

export default function AdminSecurityCenter() {
  const navigate = useNavigate()
  const { user, logout, addToast } = useStore()

  const [loading, setLoading] = useState(true)
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null)
  const [devices, setDevices] = useState<TrustedDevice[]>([])
  const [history, setHistory] = useState<LoginRecord[]>([])
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [freshStatus, setFreshStatus] = useState<FreshMfaStatus | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const fingerprint = await generateFingerprint()
      const [riskRes, devicesRes, historyRes, eventsRes, freshRes] = await Promise.all([
        request(`/admin/trust/status?fingerprint=${encodeURIComponent(fingerprint)}`),
        get('/admin/trust/devices'),
        get('/admin/login-history?limit=50'),
        get('/admin/risk-events?limit=50'),
        get('/admin/fresh-status'),
      ])

      if (riskRes.success) setRiskStatus(riskRes.data as RiskStatus)
      if (devicesRes.success) setDevices((devicesRes.data as TrustedDevice[]) || [])
      if (historyRes.success) setHistory((historyRes.data as LoginRecord[]) || [])
      if (eventsRes.success) setEvents((eventsRes.data as RiskEvent[]) || [])
      if (freshRes.success) setFreshStatus(freshRes.data as FreshMfaStatus)
    } catch (err) {
      addToast('安全中心数据加载失败', 'error', 3000)
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function generateFingerprint() {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      navigator.hardwareConcurrency,
    ]
    const text = components.join('||')
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function handleVerifyFreshMfa() {
    if (totpCode.length !== 6) return
    setVerifying(true)
    try {
      const res = await post('/admin/verify-fresh', { totpCode })
      if (res.success) {
        addToast('二次验证通过，5 分钟内可执行敏感操作', 'success', 3000)
        setTotpCode('')
        await fetchAll()
      } else {
        addToast(res.message || '二次验证失败', 'error', 3000)
      }
    } finally {
      setVerifying(false)
    }
  }

  async function handleRevokeDevice(fpHash: string) {
    setRevoking(fpHash)
    try {
      const res = await post('/admin/trust/devices/revoke', { fpHash })
      if (res.success) {
        addToast('已撤销该设备信任', 'success', 3000)
        setDevices(prev => prev.filter(d => d.fpHash !== fpHash))
      } else {
        addToast(res.message || '撤销失败', 'error', 3000)
      }
    } finally {
      setRevoking(null)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  const riskScore = riskStatus?.score ?? 0
  const riskLevel = riskStatus?.level ?? 'low'
  const trustedCount = devices.length
  const eventCount = events.length

  const deviceIcon = (name: string) => {
    if (name.includes('移动端') || name.includes('Android') || name.includes('iOS')) return Smartphone
    return Monitor
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.8 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <motion.button
                type="button"
                onClick={() => navigate('/admin')}
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.button>
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                className="font-serif text-3xl gradient-text"
              >
                管理员安全中心
              </motion.h1>
            </div>
            <p className="text-[var(--text-secondary)] ml-11">
              欢迎回来，{user?.username} · 管理可信设备、登录历史与风险事件
            </p>
          </div>
          <div className="flex items-center gap-3 ml-11 md:ml-0">
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
              onClick={fetchAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
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

        {/* Risk Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-5 flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: `${getRiskColor(riskLevel)}15`, color: getRiskColor(riskLevel) }}
            >
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{riskScore}</div>
              <div className="text-xs text-[var(--text-secondary)]">当前风险评分</div>
            </div>
          </Card>

          <Card className="p-5 flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: `${getRiskColor(riskLevel)}15`, color: getRiskColor(riskLevel) }}
            >
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: getRiskColor(riskLevel) }}>
                {getRiskLabel(riskLevel)}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">当前环境评级</div>
            </div>
          </Card>

          <Card className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--success)]/10 text-[var(--success)]">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{trustedCount}</div>
              <div className="text-xs text-[var(--text-secondary)]">可信设备</div>
            </div>
          </Card>

          <Card className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--error)]/10 text-[var(--error)]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{eventCount}</div>
              <div className="text-xs text-[var(--text-secondary)]">风险事件</div>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Fresh MFA */}
          <Card className="p-6 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-[var(--accent-primary)]" />
              <h3 className="font-serif text-lg text-[var(--text-primary)]">敏感操作二次验证</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              执行隔离控制、2FA 绑定、问卷数据查看等敏感操作前，需先完成二次验证。
            </p>
            {freshStatus?.valid ? (
              <div className="rounded-2xl bg-[var(--success)]/8 p-4 mb-4">
                <div className="flex items-center gap-2 text-[var(--success)] mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-sm font-medium">已通过二次验证</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  剩余有效时间：{Math.ceil((freshStatus.remainingMs || 0) / 60000)} 分钟
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="输入 6 位 TOTP 验证码"
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none text-center tracking-[0.5em] font-mono"
                />
                <Button
                  onClick={handleVerifyFreshMfa}
                  disabled={totpCode.length !== 6 || verifying}
                  className="w-full"
                >
                  {verifying ? '验证中...' : '完成验证'}
                </Button>
              </div>
            )}
          </Card>

          {/* Risk Factors */}
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Fingerprint className="w-5 h-5 text-[var(--accent-primary)]" />
              <h3 className="font-serif text-lg text-[var(--text-primary)]">当前环境风险因子</h3>
            </div>
            {riskStatus?.factors && riskStatus.factors.length > 0 ? (
              <div className="space-y-3">
                {riskStatus.factors.map((f, i) => (
                  <motion.div
                    key={f.factor + i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{
                          background: f.score >= 0 ? 'var(--error)/10' : 'var(--success)/10',
                          color: f.score >= 0 ? 'var(--error)' : 'var(--success)',
                        }}
                      >
                        {f.score > 0 ? `+${f.score}` : f.score}
                      </span>
                      <span className="text-sm text-[var(--text-primary)]">{f.desc}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase">{f.factor}</span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<ShieldCheck size={40} />} title="暂无风险因子" description="当前环境未检测到明显风险信号" />
            )}
          </Card>
        </div>

        {/* Devices */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-serif text-lg text-[var(--text-primary)] flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-[var(--accent-primary)]" />
              可信设备
            </h3>
            <span className="text-xs text-[var(--text-muted)]">最多保留 10 台设备</span>
          </div>

          {devices.length === 0 ? (
            <EmptyState icon={<Monitor size={40} />} title="暂无可信设备" description="完成一次安全登录后，当前设备将自动加入信任列表" />
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {devices.map((device) => {
                  const Icon = deviceIcon(device.name)
                  return (
                    <motion.div
                      key={device.fpHash}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center justify-between p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] hover:shadow-[var(--shadow-sm)] transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center text-[var(--accent-primary)]">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[var(--text-primary)]">{device.name}</div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-secondary)]">
                            <span className="flex items-center gap-1" title="IP 已脱敏，完整信息需二次验证后查看">
                              <MapPin className="w-3 h-3" />{device.ip}
                            </span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(device.lastSeenAt)}</span>
                            <span className="flex items-center gap-1"><History className="w-3 h-3" />首次使用 {formatTime(device.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        onClick={() => handleRevokeDevice(device.fpHash)}
                        disabled={revoking === device.fpHash}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--error)] bg-[var(--error)]/8 hover:bg-[var(--error)]/15 transition-all disabled:opacity-50"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Trash2 className="w-3 h-3" />
                        {revoking === device.fpHash ? '撤销中...' : '撤销信任'}
                      </motion.button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Login History */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <History className="w-5 h-5 text-[var(--accent-primary)]" />
              <h3 className="font-serif text-lg text-[var(--text-primary)]">登录历史</h3>
            </div>
            {history.length === 0 ? (
              <EmptyState icon={<History size={40} />} title="暂无登录记录" description="完成管理员登录后将显示最近 100 条记录" />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {history.map((record) => (
                  <div
                    key={record.id}
                    className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {record.success ? (
                          <CheckCircle className="w-4 h-4 text-[var(--success)]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[var(--error)]" />
                        )}
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {record.success ? '登录成功' : '登录失败'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">{formatTime(record.timestamp)}</span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mb-1">{record.deviceName}</div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1" title="IP 已脱敏，完整信息需二次验证后查看">
                        <Server className="w-3 h-3" />{record.ip}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full" style={{ background: `${getRiskColor(record.riskLevel)}15`, color: getRiskColor(record.riskLevel) }}>
                        {getRiskLabel(record.riskLevel)}
                      </span>
                      {!record.success && record.reason && (
                        <span className="text-[var(--error)]">{record.reason}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Risk Events */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
              <h3 className="font-serif text-lg text-[var(--text-primary)]">风险事件</h3>
            </div>
            {events.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={40} />} title="暂无风险事件" description="未发现高风险登录或登录失败记录" />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {events.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {event.type === 'failed_login' ? (
                          <XCircle className="w-4 h-4 text-[var(--error)]" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-[var(--warning)]" />
                        )}
                        <span className="text-sm font-medium text-[var(--text-primary)]">{event.message}</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">{formatTime(event.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1" title="IP 已脱敏，完整信息需二次验证后查看">
                        <Server className="w-3 h-3" />{event.ip}
                      </span>
                      <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{event.deviceName}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </motion.div>
  )
}

