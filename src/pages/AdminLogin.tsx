import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Lock, KeyRound, RefreshCw, AlertCircle, CheckCircle2, Smartphone, Mail, Fingerprint, Usb } from 'lucide-react'
import { API_BASE, post } from '../utils/api'
import { setCachedToken } from '../utils/authCache'
import { useStore } from '../store/useStore'
import SmartCaptcha from '../components/SmartCaptcha'
import { isWebAuthnSupported, loginAdminWithWebAuthn } from '../utils/webauthn'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
const TURNSTILE_CONFIGURED = TURNSTILE_SITE_KEY && !TURNSTILE_SITE_KEY.startsWith('__REPLACE_')

interface LoginStep {
  type: 'totp' | 'captcha' | 'emailCode'
  label: string
  desc: string
  required: boolean
}

interface Step1Response {
  sessionId: string
  riskScore: number
  riskLevel: 'trusted' | 'medium' | 'high_risk' | 'blocked'
  riskFactors: { factor: string; score: number; desc: string }[]
  steps: LoginStep[]
  deviceName: string
  message: string
  webauthnAvailable?: boolean
  webauthnCredentialCount?: number
  mtlsEnabled?: boolean
  mtlsRequired?: boolean
}

// 简易设备指纹：不追求唯一性，只用于识别同一浏览器环境
async function getDeviceFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth + '',
    navigator.hardwareConcurrency + '',
    new Date().getTimezoneOffset() + '',
    !!navigator.webdriver,
  ]
  const text = components.join('||')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getRiskHint(level: Step1Response['riskLevel'], score: number) {
  switch (level) {
    case 'trusted':
      return { title: '识别到常用环境', color: 'text-[var(--accent-primary)]', bg: 'bg-[var(--bg-secondary)]', border: 'border-[var(--border-primary)]', icon: CheckCircle2 }
    case 'medium':
      return { title: `检测到中等风险（${score} 分）`, color: 'text-[var(--text-primary)]', bg: 'bg-black/5', border: 'border-black/20', icon: AlertCircle }
    case 'high_risk':
      return { title: `检测到高风险（${score} 分）`, color: 'text-[var(--text-primary)]', bg: 'bg-[var(--bg-secondary)]', border: 'border-[var(--border-primary)]', icon: AlertCircle }
    default:
      return { title: '安全校验中', color: 'text-[var(--text-primary)]', bg: 'bg-[var(--bg-secondary)]', border: 'border-[var(--border-primary)]', icon: Shield }
  }
}

export default function AdminLogin() {
  const navigate = useNavigate()

  const [step, setStep] = useState<'password' | 'challenge'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [step1Data, setStep1Data] = useState<Step1Response | null>(null)

  const [totpCode, setTotpCode] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [emailCode, setEmailCode] = useState('')

  const [turnstileToken, setTurnstileToken] = useState('')
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getDeviceFingerprint().then(setFingerprint)
  }, [])

  const fetchAdminCaptcha = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/captcha`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setCaptchaSvg(data.svg)
        setCaptchaId(data.captchaId)
      }
    } catch {
      setError('验证码加载失败')
    }
  }, [])

  const resetTurnstile = useCallback(() => {
    setTurnstileToken('')
    setCaptchaResetKey((k) => k + 1)
  }, [])

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('请填写邮箱和密码')
      return
    }
    if (!TURNSTILE_CONFIGURED) {
      setError('人机验证未配置，请联系运维配置 Cloudflare Turnstile 真实密钥')
      return
    }
    if (!turnstileToken) {
      setError('请完成人机验证')
      return
    }

    setLoading(true)
    try {
      const data = await post('/admin/login-step1', { email, password, turnstileToken, fingerprint })
      if (data.success && data.data) {
        setStep1Data(data.data)
        setSessionId(data.data.sessionId)
        setStep('challenge')
        // 预加载验证码（如果后续需要）
        if (data.data.steps.some((s: LoginStep) => s.type === 'captcha')) {
          fetchAdminCaptcha()
        }
      } else {
        setError(data.message || '身份验证失败')
        resetTurnstile()
      }
    } catch {
      setError('网络异常，请检查连接')
      resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  const handleWebAuthnLogin = async () => {
    if (!step1Data || !sessionId) return
    if (!isWebAuthnSupported()) {
      setError('当前浏览器不支持安全密钥 / FIDO2 登录')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await loginAdminWithWebAuthn(sessionId)
      if (result.success && result.data && (result.data as any).token) {
        const data = result.data as any
        setCachedToken(data.token)
        useStore.setState({
          user: data.user,
          isAuthenticated: true,
          token: data.token,
        })
        navigate('/admin', { replace: true })
      } else {
        setError(result.message || '安全密钥验证失败')
      }
    } catch {
      setError('安全密钥验证异常')
    } finally {
      setLoading(false)
    }
  }

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!step1Data) return

    // 校验必填项
    for (const s of step1Data.steps) {
      if (s.type === 'totp' && !totpCode) {
        setError('请输入 TOTP 动态口令')
        return
      }
      if (s.type === 'captcha' && (!captchaId || !captchaCode)) {
        setError('请完成图形验证码')
        return
      }
      if (s.type === 'emailCode' && !emailCode) {
        setError('请输入邮箱确认码')
        return
      }
    }

    setLoading(true)
    try {
      const data = await post('/admin/login-step2', {
        sessionId,
        totpCode,
        adminCaptchaId: captchaId,
        adminCaptchaCode: captchaCode,
        emailCode,
      })
      if (data.success && data.data?.token) {
        setCachedToken(data.data.token)
        useStore.setState({
          user: data.data.user,
          isAuthenticated: true,
          token: data.data.token,
        })
        navigate('/admin', { replace: true })
      } else {
        setError(data.message || '安全确认失败')
        if (data.data?.step === 'captcha') fetchAdminCaptcha()
      }
    } catch {
      setError('网络异常，请检查连接')
      fetchAdminCaptcha()
    } finally {
      setLoading(false)
    }
  }

  const riskHint = step1Data ? getRiskHint(step1Data.riskLevel, step1Data.riskScore) : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md rounded-[28px] border glass-modal p-8 shadow-[0_16px_48px_rgba(0,0,0,0.08)]"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--success)]/10">
            <Shield size={28} style={{ color: 'var(--success)' }} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">管理员登录</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">专用入口 · 自适应安全校验</p>
        </div>

        {error && (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] px-4 py-3 text-sm text-[var(--text-primary)]">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'password' ? (
            <motion.form
              key="password"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleStep1}
              className="space-y-5"
            >
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">管理员邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border bg-[var(--bg-primary)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10"
                  style={{ borderColor: 'var(--border-primary)' }}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">密码</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border bg-[var(--bg-primary)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10"
                    style={{ borderColor: 'var(--border-primary)' }}
                    placeholder="输入管理员密码"
                    autoComplete="current-password"
                  />
                  <Lock size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                </div>
              </div>

              {TURNSTILE_CONFIGURED ? (
                <SmartCaptcha
                  siteKey={TURNSTILE_SITE_KEY}
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                  resetKey={captchaResetKey}
                />
              ) : (
                <div className="rounded-xl border border-black/20 bg-black/5 px-4 py-3 text-sm text-[var(--text-primary)]">
                  <AlertCircle size={16} className="mb-1 inline-block" />
                  <span>未配置 Cloudflare Turnstile 真实站点密钥，管理员登录已禁用。</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--text-primary)] text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
              >
                {loading ? '验证中...' : '下一步：安全确认'}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="challenge"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleStep2}
              className="space-y-5"
            >
              {riskHint && (
                <div className={`rounded-xl border ${riskHint.border} ${riskHint.bg} p-4`}>
                  <div className="flex items-start gap-3">
                    <riskHint.icon size={18} className={`mt-0.5 shrink-0 ${riskHint.color}`} />
                    <div>
                      <div className={`text-sm font-semibold ${riskHint.color}`}>{riskHint.title}</div>
                      {step1Data?.riskFactors && step1Data.riskFactors.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-[var(--text-secondary)]">
                          {step1Data.riskFactors.map((f, idx) => (
                            <li key={idx} className="flex items-center gap-1.5">
                              <span className={`h-1 w-1 rounded-full ${f.score > 0 ? 'bg-black/50' : 'bg-[var(--accent-primary)]'}`} />
                              {f.desc}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-[var(--text-secondary)]">
                身份已验证，请完成以下 {step1Data?.steps.length} 项安全确认以进入管理后台。
              </p>

              {step1Data?.steps.map((s) => (
                <div key={s.type} className="rounded-xl border bg-[var(--bg-primary)] p-4" style={{ borderColor: 'var(--border-primary)' }}>
                  <div className="mb-2 flex items-center gap-2">
                    {s.type === 'totp' && <KeyRound size={16} className="text-[var(--accent-primary)]" />}
                    {s.type === 'captcha' && <RefreshCw size={16} className="text-[var(--accent-primary)]" />}
                    {s.type === 'emailCode' && <Mail size={16} className="text-[var(--accent-primary)]" />}
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{s.label}</span>
                  </div>
                  <p className="mb-3 text-xs text-[var(--text-secondary)]">{s.desc}</p>

                  {s.type === 'totp' && (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full rounded-xl border bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10"
                      style={{ borderColor: 'var(--border-primary)' }}
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                    />
                  )}

                  {s.type === 'captcha' && (
                    <div className="flex items-center gap-3">
                      {captchaSvg ? (
                        // 安全规范：SVG 验证码通过 data URI 在 img 标签中渲染，避免 dangerouslySetInnerHTML 执行 SVG 内脚本
                        <img
                          src={`data:image/svg+xml;base64,${btoa(captchaSvg)}`}
                          alt="图形验证码"
                          className="h-[52px] cursor-pointer overflow-hidden rounded-xl border"
                          style={{ borderColor: 'var(--border-primary)' }}
                          onClick={fetchAdminCaptcha}
                        />
                      ) : (
                        <div className="flex h-[52px] w-[160px] items-center justify-center rounded-xl border bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-primary)' }}>
                          <RefreshCw size={16} className="animate-spin text-[var(--text-muted)]" />
                        </div>
                      )}
                      <input
                        type="text"
                        value={captchaCode}
                        onChange={(e) => setCaptchaCode(e.target.value)}
                        className="flex-1 rounded-xl border bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10"
                        style={{ borderColor: 'var(--border-primary)' }}
                        placeholder="输入验证码"
                        maxLength={6}
                      />
                    </div>
                  )}

                  {s.type === 'emailCode' && (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full rounded-xl border bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10"
                      style={{ borderColor: 'var(--border-primary)' }}
                      placeholder="000000"
                      maxLength={6}
                    />
                  )}
                </div>
              ))}

              {step1Data?.webauthnAvailable && isWebAuthnSupported() && (
                <button
                  type="button"
                  onClick={handleWebAuthnLogin}
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-semibold text-[var(--text-primary)] transition-all hover:bg-[var(--bg-elevated)] hover:border-[var(--accent-primary)]/20 disabled:opacity-60"
                >
                  <Usb size={18} />
                  {loading ? '验证中...' : '使用安全密钥 / FIDO2 登录'}
                </button>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('password')}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl border text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  返回
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--text-primary)] text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? '确认中...' : '进入管理后台'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Fingerprint size={12} />
            设备指纹已采集
          </span>
          <span className="flex items-center gap-1">
            <Smartphone size={12} />
            多因素保护
          </span>
        </div>
      </motion.div>
    </div>
  )
}

