import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, ShieldCheck, ShieldAlert,
  Smartphone, Monitor, Globe, Clock,
  CheckCircle, XCircle, Key,
  Eye, EyeOff, History, AlertTriangle,
  Fingerprint, ChevronRight,
} from 'lucide-react'
import InlineLoading from '../components/ui/InlineLoading'
import { authApi } from '../utils/api'
import EmptyState from '../components/EmptyState'
import Tooltip from '../components/Tooltip'
import { useStore } from '../store/useStore'
import { getCachedToken } from '../utils/authCache'
import {
  isWebAuthnSupported,
  registerWebAuthnCredential,
  getWebAuthnStatus,
  removeWebAuthnCredential,
} from '../utils/webauthn'

interface ActiveSession {
  id: string
  device: string
  browser: string
  ip: string
  lastActive: string
  isCurrent: boolean
}

interface LoginRecord {
  id: string
  dateTime: string
  device: string
  browser: string
  os: string
  ip: string
  success: boolean
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
}

function CircularProgress({ score }: { score: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const progress = circumference - (score / 100) * circumference

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" className="transform -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="black/0.06" strokeWidth="6" />
        <circle
          cx="70" cy="70" r={radius}
          fill="none" stroke="url(#scoreGradient)" strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent-primary)" />
            <stop offset="100%" stopColor="var(--accent-secondary)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-serif text-4xl gradient-text">{score}</span>
        <span className="text-[var(--text-muted)] text-xs mt-0.5 font-sans">安全评分</span>
      </div>
    </div>
  )
}

function getAuthToken() {
  return getCachedToken() || ''
}

export default function SecuritySettings() {
  const { addToast } = useStore()
  const navigate = useNavigate()
  const [securityScore] = useState(72)

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [twoFactorStep, setTwoFactorStep] = useState<'off' | 'setup' | 'verify' | 'done'>('off')
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorUri, setTwoFactorUri] = useState('')
  const [twoFactorLoading, setTwoFactorLoading] = useState(false)
  const [twoFactorError, setTwoFactorError] = useState('')

  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' })
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false })

  const [biometricSupported, setBiometricSupported] = useState(false)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [biometricError, setBiometricError] = useState('')
  const [biometricCredentials, setBiometricCredentials] = useState<{ id: string; deviceName: string; createdAt: string }[]>([])

  const [user, setUser] = useState<{ id: string; email: string; role: string; adminTotpEnabled?: boolean } | null>(null)
  const [userLoading, setUserLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
    fetchLoginHistory()
    fetchBiometricStatus()
    fetchUser()
    setBiometricSupported(isWebAuthnSupported())
  }, [])

  async function fetchUser() {
    try {
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      })
      const data = await res.json()
      if (data.success && data.data) {
        setUser(data.data)
        await fetch2FAStatus(data.data.role === 'admin')
      }
    } catch {
      setUser(null)
      await fetch2FAStatus(false)
    } finally {
      setUserLoading(false)
    }
  }

  async function fetchSessions() {
    setSessionsLoading(true)
    setSessionsError('')
    const res = await authApi.getSessions()
    if (res.success && res.data?.data) {
      setSessions(res.data.data)
    } else if (!res.success) {
      setSessionsError(res.message || '获取设备列表失败')
      addToast(res.message || '获取设备列表失败', 'error', 4000)
    }
    setSessionsLoading(false)
  }

  async function fetchLoginHistory() {
    setHistoryLoading(true)
    setHistoryError('')
    const res = await authApi.getLoginHistory()
    if (res.success && res.data?.data) {
      setLoginHistory(res.data.data)
    } else if (!res.success) {
      setHistoryError(res.message || '获取登录历史失败')
      addToast(res.message || '获取登录历史失败', 'error', 4000)
    }
    setHistoryLoading(false)
  }

  const isAdmin = user?.role === 'admin'

  async function fetch2FAStatus(admin: boolean) {
    const endpoint = admin ? '/api/admin/2fa/status' : '/api/auth/2fa/status'
    const token = getAuthToken()
    try {
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        setTwoFactorEnabled(data.enabled)
        if (admin) {
          setUser(prev => prev ? { ...prev, adminTotpEnabled: data.enabled } : null)
        }
      }
    } catch {
      setTwoFactorEnabled(false)
    }
  }

  const handleRevokeSession = async (id: string) => {
    setRevokingId(id)
    const res = await authApi.revokeSession(id)
    if (res.success) {
      setSessions((prev) => prev.filter((s) => s.id !== id))
    }
    setRevokingId(null)
  }

  async function admin2FARequest(endpoint: string, body?: object) {
    const token = getAuthToken()
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return res.json()
  }

  const handleToggle2FA = async () => {
    if (!twoFactorEnabled) {
      setTwoFactorLoading(true)
      setTwoFactorError('')
      const res = isAdmin
        ? await admin2FARequest('/api/admin/2fa/setup')
        : await authApi.setup2FA()
      if (res.success && res.data) {
        setTwoFactorSecret(res.data.secret)
        setTwoFactorUri(res.data.otpauth)
        setShow2FASetup(true)
        setTwoFactorStep('setup')
      } else {
        setTwoFactorError(res.message || '获取2FA密钥失败')
      }
      setTwoFactorLoading(false)
    } else if (!isAdmin) {
      await authApi.disable2FA()
      setTwoFactorEnabled(false)
      setTwoFactorStep('off')
      setShow2FASetup(false)
      setVerificationCode('')
      setTwoFactorSecret('')
      setTwoFactorUri('')
    }
  }

  const handleSetupConfirm = () => {
    if (twoFactorStep === 'setup') {
      setTwoFactorStep('verify')
    }
  }

  const handleVerify2FA = async () => {
    if (verificationCode.length < 6) return
    setTwoFactorLoading(true)
    setTwoFactorError('')
    const res = isAdmin
      ? await admin2FARequest('/api/admin/2fa/verify', { code: verificationCode })
      : await authApi.verify2FA(verificationCode)
    if (res.success) {
      setTwoFactorEnabled(true)
      setTwoFactorStep('done')
      setVerificationCode('')
      setUser(prev => prev ? { ...prev, adminTotpEnabled: true } : null)
      addToast(isAdmin ? '管理员二次验证已开启' : '双因素认证已开启', 'success', 4000)
    } else {
      setTwoFactorError(res.message || '验证码无效')
    }
    setTwoFactorLoading(false)
  }

  const handleSavePassword = () => {
    if (passwordForm.new !== passwordForm.confirm) {
      addToast('两次输入的新密码不一致', 'error', 4000)
      return
    }
    if (passwordForm.new.length < 8) {
      addToast('新密码至少需要 8 位', 'error', 4000)
      return
    }
    // TODO: 后端尚未实现 /api/user/change-password
    setPasswordForm({ current: '', new: '', confirm: '' })
    addToast('密码修改功能即将上线', 'info', 4000)
  }

  async function fetchBiometricStatus() {
    const status = await getWebAuthnStatus()
    if (status) {
      setBiometricEnabled(status.enabled)
      setBiometricCredentials(status.credentials)
    }
  }

  const handleToggleBiometric = async () => {
    setBiometricError('')
    if (!biometricEnabled) {
      setBiometricLoading(true)
      const result = await registerWebAuthnCredential()
      if (result.success) {
        setBiometricEnabled(true)
        await fetchBiometricStatus()
        addToast('生物识别登录已开启', 'success', 4000)
      } else {
        setBiometricError(result.message || '开启失败')
      }
      setBiometricLoading(false)
    } else {
      setBiometricLoading(true)
      const credentialId = biometricCredentials[0]?.id
      if (credentialId) {
        const result = await removeWebAuthnCredential(credentialId)
        if (result.success) {
          setBiometricEnabled(false)
          setBiometricCredentials(prev => prev.filter(c => c.id !== credentialId))
          addToast('生物识别登录已关闭', 'info', 4000)
        } else {
          setBiometricError(result.message || '关闭失败')
        }
      }
      setBiometricLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {!userLoading && user?.role === 'admin' && !user?.adminTotpEnabled && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-primary)]"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <strong className="font-sans">安全警告：</strong>
                管理员账号必须开启二次验证（2FA）。请先在下方完成 2FA 绑定，否则下次将无法登录管理后台。
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
          className="mb-10"
        >
          <h1 className="font-serif text-4xl gradient-text mb-3">账号安全</h1>
          <p className="font-serif italic text-[var(--text-secondary)] text-lg">管理你的账号安全设置</p>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
          <motion.div variants={itemVariants} className="liquid-glass rounded-[2rem] p-8 card-liquid">
            <div className="flex items-center gap-3 mb-8">
              <Shield size={20} className="text-[var(--accent-primary)]" />
              <h2 className="font-serif text-xl text-[var(--text-primary)]">账号安全</h2>
            </div>
            <div className="flex flex-col items-center">
              <CircularProgress score={securityScore} />
              <div className="flex items-center gap-2 mt-6">
                <ShieldCheck size={16} className="text-[var(--accent-primary)]" />
                <span className="text-[var(--text-secondary)] text-sm font-sans">密码强度: 良好</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {twoFactorEnabled ? (
                  <>
                    <ShieldCheck size={16} className="text-[var(--success)]" />
                    <span className="text-[var(--success)] text-sm font-sans">双因素认证 已启用</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert size={16} className="text-[var(--warning)]" />
                    <span className="text-[var(--warning)] text-sm font-sans">双因素认证 未启用</span>
                  </>
                )}
              </div>
              <p className="text-[var(--text-muted)] text-xs mt-4 font-sans text-center leading-relaxed max-w-xs">
                建议启用双因素认证并定期更换密码以提升账号安全性
              </p>
              <button
                onClick={() => navigate('/security-center')}
                className="mt-5 flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
              >
                查看安全中心
                <ChevronRight size={14} />
              </button>
            </div>
          </motion.div>

          <div className="ornament" />

          <motion.div variants={itemVariants} className="liquid-glass rounded-[2rem] p-8 card-liquid">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Smartphone size={20} className="text-[var(--accent-primary)]" />
                <h2 className="font-serif text-xl text-[var(--text-primary)]">双因素认证</h2>
              </div>
              <button
                onClick={handleToggle2FA}
                disabled={twoFactorLoading || (isAdmin && twoFactorEnabled)}
                className={`w-12 h-6 rounded-full transition-all duration-300 relative ${
                  twoFactorEnabled ? 'bg-[var(--success)]' : 'bg-black/10'
                } ${twoFactorLoading || (isAdmin && twoFactorEnabled) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-[var(--text-primary)] absolute top-0.5 transition-all duration-300 ${
                    twoFactorEnabled ? 'left-6' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            {isAdmin && twoFactorEnabled && (
              <p className="text-[var(--text-muted)] text-xs font-sans mt-2">
                管理员账号强制开启二次验证，无法关闭。
              </p>
            )}

            {twoFactorLoading && twoFactorStep === 'off' && (
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm font-sans py-2">
                <InlineLoading size="sm" color="current" />
                <span>加载中...</span>
              </div>
            )}

            <AnimatePresence>
              {show2FASetup && twoFactorStep !== 'done' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                  className="overflow-hidden"
                >
                  {twoFactorStep === 'setup' && twoFactorUri && (
                    <div className="space-y-5">
                      <p className="text-[var(--text-secondary)] text-sm font-sans leading-relaxed">
                        使用身份验证器应用（如 Google Authenticator、Authy）扫描下方二维码，然后输入验证码完成绑定。
                      </p>
                      <div className="flex justify-center">
                        <div className="w-48 h-48 rounded-2xl bg-white flex items-center justify-center p-3 shadow-sm">
                          <QRCodeSVG value={twoFactorUri} size={160} />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-[var(--text-muted)] text-xs font-sans mb-1">或手动输入密钥</p>
                        <Tooltip content="复制备份码">
                          <code className="text-[var(--accent-primary)] text-sm font-mono bg-[var(--accent-primary)]/[0.06] px-3 py-1.5 rounded-lg select-all cursor-pointer">
                            {twoFactorSecret}
                          </code>
                        </Tooltip>
                      </div>
                      <button
                        onClick={handleSetupConfirm}
                        className="btn-amber rounded-full px-6 py-3 w-full text-sm font-medium"
                      >
                        我已扫描二维码
                      </button>
                    </div>
                  )}

                  {twoFactorStep === 'verify' && (
                    <div className="space-y-5">
                      <p className="text-[var(--text-secondary)] text-sm font-sans leading-relaxed">
                        请输入身份验证器应用中显示的 6 位验证码以完成绑定
                      </p>
                      {twoFactorError && (
                        <p className="text-[var(--warning)] text-xs font-sans text-center">{twoFactorError}</p>
                      )}
                      <div className="flex justify-center">
                        <input
                          type="text"
                          maxLength={6}
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="000000"
                          className="w-40 text-center text-2xl tracking-[0.5em] font-mono bg-transparent border-b-2 border-[var(--accent-primary)]/30 text-[var(--text-primary)] py-3 focus:outline-none focus:border-[var(--accent-primary)] transition-colors placeholder:text-[var(--text-muted)]/40"
                        />
                      </div>
                      <button
                        onClick={handleVerify2FA}
                        disabled={verificationCode.length < 6 || twoFactorLoading}
                        className={`rounded-full px-6 py-3 w-full text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                          verificationCode.length >= 6 && !twoFactorLoading
                            ? 'btn-amber'
                            : 'bg-black/[0.03] text-[var(--text-muted)] cursor-not-allowed'
                        }`}
                      >
                        {twoFactorLoading && <InlineLoading size="sm" color="current" />}
                        {twoFactorLoading ? '验证中...' : '确认绑定'}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {twoFactorStep === 'done' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                  className="flex items-center gap-3 py-4"
                >
                  <CheckCircle size={20} className="text-[var(--success)]" />
                  <span className="text-[var(--success)] text-sm font-sans">双因素认证已成功启用</span>
                </motion.div>
              )}
            </AnimatePresence>

            {twoFactorEnabled && twoFactorStep !== 'setup' && twoFactorStep !== 'verify' && (
              <p className="text-[var(--text-muted)] text-xs font-sans mt-2">
                你的账号已受双因素认证保护。关闭开关可禁用。
              </p>
            )}
          </motion.div>

          <div className="ornament" />

          <motion.div variants={itemVariants} className="liquid-glass rounded-[2rem] p-8 card-liquid">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Fingerprint size={20} className="text-[var(--accent-primary)]" />
                <h2 className="font-serif text-xl text-[var(--text-primary)]">生物识别登录</h2>
              </div>
              <button
                onClick={handleToggleBiometric}
                disabled={biometricLoading || !biometricSupported}
                className={`w-12 h-6 rounded-full transition-all duration-300 relative ${
                  biometricEnabled ? 'bg-[var(--success)]' : 'bg-black/10'
                } ${biometricLoading || !biometricSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-[var(--text-primary)] absolute top-0.5 transition-all duration-300 ${
                    biometricEnabled ? 'left-6' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {biometricLoading && (
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm font-sans py-2">
                <InlineLoading size="sm" color="current" />
                <span>{biometricEnabled ? '关闭中...' : '开启中...'}</span>
              </div>
            )}

            {biometricError && (
              <p className="text-[var(--warning)] text-xs font-sans mb-3">{biometricError}</p>
            )}

            {!biometricSupported && (
              <p className="text-[var(--text-muted)] text-xs font-sans">
                当前设备或浏览器不支持 WebAuthn 生物识别验证。
              </p>
            )}

            {biometricSupported && !biometricEnabled && !biometricLoading && (
              <p className="text-[var(--text-muted)] text-xs font-sans">
                开启后，可使用本设备的指纹、面容或 Windows Hello 快速登录。
              </p>
            )}

            {biometricEnabled && biometricCredentials.length > 0 && (
              <div className="mt-3 space-y-2">
                {biometricCredentials.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl bg-black/[0.02]">
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/[0.08] flex items-center justify-center flex-shrink-0">
                      <Fingerprint size={16} className="text-[var(--accent-primary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-sans font-medium text-[var(--text-primary)]">{c.deviceName}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{new Date(c.createdAt).toLocaleString('zh-CN')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <div className="ornament" />

          <motion.div variants={itemVariants} className="liquid-glass rounded-[2rem] p-8 card-liquid">
            <div className="flex items-center gap-3 mb-6">
              <Monitor size={20} className="text-[var(--accent-primary)]" />
              <h2 className="font-serif text-xl text-[var(--text-primary)]">登录设备管理</h2>
            </div>
            {sessionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-muted)] text-sm font-sans">
                <InlineLoading size="sm" color="current" />
                <span>加载设备列表...</span>
              </div>
            ) : sessionsError ? (
              <div className="text-center py-8">
                <p className="text-[var(--warning)] text-sm font-sans mb-3">{sessionsError}</p>
                <button onClick={fetchSessions} className="text-[var(--accent-primary)] text-xs font-sans underline hover:no-underline">
                  点击重试
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <motion.div
                    key={session.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, height: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                    className="group flex items-center justify-between p-4 rounded-2xl bg-black/[0.02] hover:bg-[var(--accent-primary)]/[0.04] transition-all duration-300"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/[0.08] flex items-center justify-center flex-shrink-0">
                        <Smartphone size={18} className="text-[var(--accent-primary)]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--text-primary)] text-sm font-medium font-sans">{session.device}</span>
                          {session.isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[10px] font-sans font-medium border border-[var(--accent-primary)]/20">
                              当前设备
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[var(--text-muted)] text-xs font-sans">{session.browser}</span>
                          <span className="text-[var(--text-muted)]/40 text-xs">·</span>
                          <span className="text-[var(--text-muted)] text-xs font-mono">{session.ip}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock size={10} className="text-[var(--text-muted)]" />
                          <span className="text-[var(--text-muted)] text-xs font-sans">{session.lastActive}</span>
                        </div>
                      </div>
                    </div>
                    {!session.isCurrent && (
                      <Tooltip content="撤销此设备">
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          disabled={revokingId === session.id}
                          className={`px-4 py-2 rounded-xl text-xs font-sans font-medium transition-all duration-300 ${
                            revokingId === session.id
                              ? 'text-[var(--text-muted)] bg-black/[0.03]'
                              : 'text-[var(--warning)] border border-[var(--warning)]/20 hover:bg-[var(--warning)]/10 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {revokingId === session.id ? '撤销中...' : '撤销'}
                        </button>
                      </Tooltip>
                    )}
                  </motion.div>
                ))}
                {sessions.length === 0 && (
                  <EmptyState icon={<Monitor size={32} />} title="暂无活跃会话" description="登录后会自动记录设备信息" />
                )}
              </div>
            )}
          </motion.div>

          <div className="ornament" />

          <motion.div variants={itemVariants} className="liquid-glass rounded-[2rem] p-8 card-liquid">
            <div className="flex items-center gap-3 mb-6">
              <History size={20} className="text-[var(--accent-primary)]" />
              <h2 className="font-serif text-xl text-[var(--text-primary)]">登录历史</h2>
            </div>
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-muted)] text-sm font-sans">
                <InlineLoading size="sm" color="current" />
                <span>加载登录历史...</span>
              </div>
            ) : historyError ? (
              <div className="text-center py-8">
                <p className="text-[var(--warning)] text-sm font-sans mb-3">{historyError}</p>
                <button onClick={fetchLoginHistory} className="text-[var(--accent-primary)] text-xs font-sans underline hover:no-underline">
                  点击重试
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
                {loginHistory.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-start gap-3 p-3 rounded-2xl bg-black/[0.02] hover:bg-[var(--accent-primary)]/[0.03] transition-all duration-300"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      record.success ? 'bg-[var(--success)]/10' : 'bg-[var(--warning)]/10'
                    }`}>
                      {record.success ? (
                        <CheckCircle size={16} className="text-[var(--success)]" />
                      ) : (
                        <XCircle size={16} className="text-[var(--warning)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-sans font-medium ${
                          record.success ? 'text-[var(--text-primary)]' : 'text-[var(--warning)]'
                        }`}>
                          {record.device}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans ${
                          record.success
                            ? 'bg-[var(--success)]/10 text-[var(--success)]'
                            : 'bg-[var(--warning)]/10 text-[var(--warning)]'
                        }`}>
                          {record.success ? '成功' : '失败'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[var(--text-muted)] text-xs font-mono">{record.dateTime}</span>
                        <span className="text-[var(--text-muted)]/40 text-xs">·</span>
                        <Globe size={10} className="text-[var(--text-muted)]" />
                        <span className="text-[var(--text-muted)] text-xs font-sans">{record.ip}</span>
                        <span className="text-[var(--text-muted)]/40 text-xs">·</span>
                        <span className="text-[var(--text-muted)] text-xs font-sans">{record.browser} · {record.os}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {loginHistory.length === 0 && (
                  <EmptyState icon={<History size={32} />} title="暂无登录记录" description="登录后会自动记录" />
                )}
              </div>
            )}
          </motion.div>

          <div className="ornament" />

          <motion.div variants={itemVariants} className="liquid-glass rounded-[2rem] p-8 card-liquid">
            <div className="flex items-center gap-3 mb-6">
              <Key size={20} className="text-[var(--accent-primary)]" />
              <h2 className="font-serif text-xl text-[var(--text-primary)]">密码修改</h2>
            </div>
            <div className="space-y-5">
              {(['current', 'new', 'confirm'] as const).map((field) => (
                <div key={field}>
                  <label className="block text-[var(--text-secondary)] text-sm font-sans mb-2">
                    {field === 'current' ? '当前密码' : field === 'new' ? '新密码' : '确认新密码'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword[field] ? 'text' : 'password'}
                      value={passwordForm[field]}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, [field]: e.target.value }))}
                      placeholder={
                        field === 'current' ? '输入当前密码'
                        : field === 'new' ? '输入新密码' : '再次输入新密码'
                      }
                      className="w-full liquid-glass rounded-xl px-4 py-3 pr-10 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 font-sans text-sm placeholder:text-[var(--text-muted)]/40"
                    />
                    <button
                      onClick={() => setShowPassword((prev) => ({ ...prev, [field]: !prev[field] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                      {showPassword[field] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={handleSavePassword}
                disabled={!passwordForm.current || !passwordForm.new || !passwordForm.confirm}
                className={`rounded-full px-8 py-3 w-full text-sm font-medium transition-all duration-300 ${
                  passwordForm.current && passwordForm.new && passwordForm.confirm
                    ? 'btn-amber'
                    : 'bg-black/[0.03] text-[var(--text-muted)] cursor-not-allowed'
                }`}
              >
                保存密码
              </button>
            </div>
          </motion.div>

          <div className="ornament" />

          <motion.div variants={itemVariants} className="liquid-glass rounded-[2rem] p-8 card-liquid border border-[var(--warning)]/20">
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle size={20} className="text-[var(--warning)]" />
              <h2 className="font-serif text-xl text-[var(--warning)]">危险区域</h2>
            </div>
            <button className="px-6 py-3 rounded-full text-sm font-medium text-[var(--warning)] border border-[var(--warning)]/30 hover:bg-[var(--warning)]/10 transition-all duration-300">
              注销所有设备
            </button>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}