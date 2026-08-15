import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Shield, CheckCircle, XCircle, Github, Fingerprint, AlertCircle, Sparkles } from 'lucide-react'
import InlineLoading from '../components/ui/InlineLoading'
import Confetti from '../components/Confetti'
import ImageCaptcha, { ImageCaptchaRef, ImageCaptchaValue } from '../components/ImageCaptcha'
import { useStore } from '../store/useStore'
import { authApi } from '../utils/api'
import { setCachedToken } from '../utils/authCache'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Tooltip } from '../components/ui/Tooltip'
import { isWebAuthnSupported, loginWithWebAuthn } from '../utils/webauthn'
import { startHumanSignalCollection, requestHumanChallenge, getHumanSignals } from '../utils/humanVerification'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const COMMON_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'qq.com', '163.com', '126.com', 'foxmail.com', 'icloud.com', 'protonmail.com']

function getPasswordStrength(password: string) {
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 2) return { level: 1, label: '弱', color: 'var(--error)', width: '33%' }
  if (score <= 4) return { level: 2, label: '中', color: 'var(--accent-primary)', width: '66%' }
  return { level: 3, label: '强', color: 'var(--success)', width: '100%' }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const PASSWORD_RULES = [
  { key: 'minLength', label: '至少6个字符', test: (p: string) => p.length >= 6 },
  { key: 'hasUpper', label: '包含大写字母', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'hasNumber', label: '包含数字', test: (p: string) => /[0-9]/.test(p) },
  { key: 'hasSpecial', label: '包含特殊字符', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  })
} as const

interface InputWithIconProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ReactNode
  rightElement?: React.ReactNode
  inputRef?: React.Ref<HTMLInputElement>
}

function InputWithIcon({ icon, rightElement, inputRef, className = '', ...props }: InputWithIconProps) {
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
        {icon}
      </div>
      <Input ref={inputRef} className={`pl-10 ${rightElement ? 'pr-10' : ''} ${className}`} {...props} />
      {rightElement && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {rightElement}
        </div>
      )}
    </div>
  )
}

export default function Auth() {
  const store = useStore()
  const { user } = store
  const navigate = useNavigate()
  const location = useLocation()

  const hasAnimatedFields = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => { hasAnimatedFields.current = true }, 500)
    return () => clearTimeout(t)
  }, [])

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [imageCaptcha, setImageCaptcha] = useState<ImageCaptchaValue | null>(null)
  const imageCaptchaRef = useRef<ImageCaptchaRef>(null)
  const [humanToken, setHumanToken] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const turnstileWidgetRef = useRef<string | null>(null) // 用 ref 避免闭包陈旧问题
  const turnstileInitRef = useRef(false) // 标记初始化过程进行中，防止重复调用
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [shake, setShake] = useState(false)
  const [showPassword, setShowPassword] = useState({ login: false, reg: false, confirm: false })
  const [showDomainSuggest, setShowDomainSuggest] = useState(false)
  const [activeDomainIndex, setActiveDomainIndex] = useState(-1)
  const [regStep, setRegStep] = useState(1)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [biometricSupported, setBiometricSupported] = useState(false)

  // 行为信号采集（仅注册时使用）
  const formStartTime = useRef<number>(Date.now())
  const [mouseMoveCount, setMouseMoveCount] = useState(0)
  const [keyPressCount, setKeyPressCount] = useState(0)
  const [copyPasteCount, setCopyPasteCount] = useState(0)
  const [hasMouseMovement, setHasMouseMovement] = useState(false)
  const [hasKeyboardEvent, setHasKeyboardEvent] = useState(false)
  const [devtoolsOpen, setDevToolsOpen] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setBiometricSupported(isWebAuthnSupported())
  }, [])

  // 注册表单行为采集
  useEffect(() => {
    if (activeTab !== 'register') return
    formStartTime.current = Date.now()
    setMouseMoveCount(0)
    setKeyPressCount(0)
    setCopyPasteCount(0)
    setHasMouseMovement(false)
    setHasKeyboardEvent(false)
    setDevToolsOpen(false)

    const onMouseMove = () => {
      setMouseMoveCount(c => c + 1)
      setHasMouseMovement(true)
    }
    const onKeyPress = () => {
      setKeyPressCount(c => c + 1)
      setHasKeyboardEvent(true)
    }
    const onCopyPaste = () => setCopyPasteCount(c => c + 1)
    const onPaste = () => setCopyPasteCount(c => c + 1)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('keypress', onKeyPress)
    window.addEventListener('copy', onCopyPaste)
    window.addEventListener('paste', onPaste)

    // 简易开发者工具检测
    const checkDevTools = () => {
      const threshold = 160
      const widthDiff = window.outerWidth - window.innerWidth
      const heightDiff = window.outerHeight - window.innerHeight
      setDevToolsOpen(widthDiff > threshold || heightDiff > threshold)
    }
    const devtoolsInterval = setInterval(checkDevTools, 2000)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keypress', onKeyPress)
      window.removeEventListener('copy', onCopyPaste)
      window.removeEventListener('paste', onPaste)
      clearInterval(devtoolsInterval)
    }
  }, [activeTab])

  function getBehaviorSignals() {
    return {
      timeOnForm: Date.now() - formStartTime.current,
      mouseMoveCount,
      keyPressCount,
      copyPasteCount,
      noMouseMovements: !hasMouseMovement,
      noKeyboardEvents: !hasKeyboardEvent,
      devtoolsOpen,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }

  async function refreshHumanChallenge() {
    const token = await requestHumanChallenge()
    if (token) setHumanToken(token)
  }

  function resetTurnstile() {
    if (turnstileWidgetRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetRef.current)
      } catch {}
    }
    setTurnstileToken('')
  }

  function loadTurnstileScript(): Promise<void> {
    return new Promise((resolve) => {
      if (document.querySelector('script[data-turnstile]')) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.turnstile = 'true'
      script.onload = () => resolve()
      script.onerror = () => resolve()
      document.body.appendChild(script)
    })
  }

  async function initTurnstile() {
    // 防止并发重复调用
    if (turnstileInitRef.current) return
    turnstileInitRef.current = true
    try {
      const configRes = await fetch('/api/config', { credentials: 'include' })
      const configData = await configRes.json()
      const siteKey = configData?.data?.turnstileSiteKey || ''
      setTurnstileSiteKey(siteKey)
      await loadTurnstileScript()
      if (!window.turnstile) { turnstileInitRef.current = false; return }
      const container = document.getElementById('turnstile-container')
      if (!container) { turnstileInitRef.current = false; return }
      // 先清理旧 widget（如果存在）
      if (turnstileWidgetRef.current) {
        try {
          window.turnstile.remove(turnstileWidgetRef.current)
        } catch {}
        turnstileWidgetRef.current = null
      }
      // 检查容器是否已被其他 widget 占用（Turnstile 内部状态残留）
      if (container.childElementCount > 0) {
        container.innerHTML = ''
      }
      const widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        'error-callback': () => setTurnstileToken(''),
        'expired-callback': () => setTurnstileToken(''),
      })
      turnstileWidgetRef.current = widgetId
    } catch {
      // 无法获取 Turnstile Site Key，跳过 Turnstile 验证
      setTurnstileSiteKey('')
    }
    turnstileInitRef.current = false
  }

  useEffect(() => {
    startHumanSignalCollection()
    refreshHumanChallenge()
    authApi.getCsrfToken().catch(() => {})
    const timer = setTimeout(() => initTurnstile(), 100)
    setTimeout(() => emailRef.current?.focus(), 400)
    return () => {
      clearTimeout(timer)
      // 清理 Turnstile widget
      if (turnstileWidgetRef.current && window.turnstile) {
        try { window.turnstile.remove(turnstileWidgetRef.current) } catch {}
        turnstileWidgetRef.current = null
      }
      turnstileInitRef.current = false
    }
  }, [location.pathname])

  // 切换登录/注册标签时容器会重新挂载，需要重新渲染 Turnstile
  useEffect(() => {
    if (!turnstileSiteKey) return
    // 先标记未初始化，让 initTurnstile 重新执行
    turnstileInitRef.current = false
    if (turnstileWidgetRef.current && window.turnstile) {
      try { window.turnstile.remove(turnstileWidgetRef.current) } catch {}
      turnstileWidgetRef.current = null
    }
    const timer = setTimeout(() => initTurnstile(), 150)
    return () => clearTimeout(timer)
  }, [activeTab, turnstileSiteKey])

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  useEffect(() => {
    if (rememberMe && loginEmail) {
      localStorage.setItem('lingualeap_remember_email', 'true')
      localStorage.setItem('lingualeap_saved_email', loginEmail)
    } else if (!rememberMe) {
      localStorage.removeItem('lingualeap_remember_email')
      localStorage.removeItem('lingualeap_saved_email')
    }
  }, [rememberMe, loginEmail])

  useEffect(() => {
    if (!regUsername || regUsername.length < 2) {
      setUsernameAvailable(null)
      return
    }
    const timer = setTimeout(async () => {
      setUsernameChecking(true)
      try {
        const res = await fetch(`/api/check-username?username=${encodeURIComponent(regUsername)}`)
        const data = await res.json()
        setUsernameAvailable(data.available)
      } catch {
        setUsernameAvailable(null)
      } finally {
        setUsernameChecking(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [regUsername])

  useEffect(() => {
    if (regPassword || regConfirmPassword) {
      if (regPassword && regPassword.length >= 6 && regConfirmPassword) {
        setRegStep(3)
      } else if (regPassword && regPassword.length >= 6) {
        setRegStep(2)
      } else if (regPassword) {
        setRegStep(1)
      }
    } else {
      setRegStep(1)
    }
  }, [regPassword, regConfirmPassword])

  function selectDomain(domain: string, isLogin: boolean) {
    const currentEmail = isLogin ? loginEmail : regEmail
    const atIndex = currentEmail.indexOf('@')
    const prefix = atIndex >= 0 ? currentEmail.slice(0, atIndex) : currentEmail
    const full = `${prefix}@${domain}`
    if (isLogin) {
      setLoginEmail(full)
    } else {
      setRegEmail(full)
    }
    setShowDomainSuggest(false)
    setActiveDomainIndex(-1)
  }

  function handleEmailChange(value: string, isLogin: boolean) {
    if (isLogin) {
      setLoginEmail(value)
    } else {
      setRegEmail(value)
    }
    const atIndex = value.indexOf('@')
    if (atIndex >= 0) {
      const afterAt = value.slice(atIndex + 1)
      const filtered = COMMON_DOMAINS.filter(d => d.startsWith(afterAt))
      setShowDomainSuggest(filtered.length > 0 && afterAt.length > 0)
    } else {
      setShowDomainSuggest(false)
    }
    setActiveDomainIndex(-1)
  }

  function handleEmailKeyDown(e: React.KeyboardEvent, isLogin: boolean) {
    const currentEmail = isLogin ? loginEmail : regEmail
    const atIndex = currentEmail.indexOf('@')
    if (atIndex === -1) return
    const afterAt = currentEmail.slice(atIndex + 1)
    const filtered = COMMON_DOMAINS.filter(d => d.startsWith(afterAt))
    if (!showDomainSuggest || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveDomainIndex(prev => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveDomainIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && activeDomainIndex >= 0) {
      e.preventDefault()
      selectDomain(filtered[activeDomainIndex], isLogin)
    } else if (e.key === 'Escape') {
      setShowDomainSuggest(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!loginEmail || !loginPassword) { setError('请填写邮箱和密码'); triggerShake(); return }
    if (!imageCaptcha || !imageCaptcha.code.trim()) { setError('请完成图形验证'); triggerShake(); imageCaptchaRef.current?.focus(); return }
    if (!humanToken) { setError('人机验证未就绪，请刷新页面'); triggerShake(); return }
    if (!turnstileToken) { setError('请完成人机验证（Turnstile）'); triggerShake(); return }
    if (loginEmail && !isValidEmail(loginEmail)) { setError('邮箱格式不正确，请检查 @ 符号'); triggerShake(); return }

    setLoading(true)
    try {
      const result = await store.login(loginEmail, loginPassword, imageCaptcha, humanToken, getHumanSignals(), turnstileToken)
      if (result.success) {
        setSuccess(true)
        setTimeout(() => {
          const isAdmin = useStore.getState().user?.role === 'admin'
          navigate(isAdmin ? '/admin' : (location.state as any)?.from?.pathname || '/', { replace: true })
        }, 600)
      } else {
        const msg = result.error || '登录失败，请稍后重试'
        setError(msg)
        store.addToast(msg, 'error', 5000)
        triggerShake()
        imageCaptchaRef.current?.refresh()
        refreshHumanChallenge()
        resetTurnstile()
      }
    } catch (err: any) {
      const msg = err?.message || '网络异常，请检查连接后重试'
      setError(msg)
      store.addToast(msg, 'error', 5000)
      triggerShake()
      imageCaptchaRef.current?.refresh()
      refreshHumanChallenge()
      resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!regUsername || regUsername.length < 2) { setError('用户名至少 2 个字符'); triggerShake(); return }
    if (!regEmail || !isValidEmail(regEmail)) { setError('请输入有效的邮箱地址'); triggerShake(); return }
    if (!regPassword || regPassword.length < 8) { setError('密码至少 8 位，且包含大写字母、数字和特殊字符'); triggerShake(); return }
    if (regPassword !== regConfirmPassword) { setError('两次输入的密码不一致'); triggerShake(); return }
    if (!imageCaptcha || !imageCaptcha.code.trim()) { setError('请完成图形验证'); triggerShake(); imageCaptchaRef.current?.focus(); return }
    if (!humanToken) { setError('人机验证未就绪，请刷新页面'); triggerShake(); return }
    if (!turnstileToken) { setError('请完成人机验证（Turnstile）'); triggerShake(); return }

    setLoading(true)
    try {
      const result = await store.register(regUsername, regEmail, regPassword, imageCaptcha, humanToken, getHumanSignals(), getBehaviorSignals(), turnstileToken)
      if (result.success) {
        setSuccess(true)
        setTimeout(() => navigate('/', { replace: true }), 600)
      } else {
        const msg = result.error || '注册失败，请稍后重试'
        setError(msg)
        store.addToast(msg, 'error', 5000)
        triggerShake()
        imageCaptchaRef.current?.refresh()
        refreshHumanChallenge()
        resetTurnstile()
      }
    } catch (err: any) {
      const msg = err?.message || '注册失败，请检查网络后重试'
      setError(msg)
      store.addToast(msg, 'error', 5000)
      triggerShake()
      imageCaptchaRef.current?.refresh()
      refreshHumanChallenge()
      resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  async function handleBiometricLogin() {
    setError('')
    if (!loginEmail || !isValidEmail(loginEmail)) {
      setError('请先输入邮箱')
      triggerShake()
      return
    }
    setLoading(true)
    try {
      const result = await loginWithWebAuthn(loginEmail, turnstileToken)
      if (result.success && result.data) {
        const data = result.data as { token: string; user: { id: string; email: string; username: string; avatar?: string; role?: string } }
        setCachedToken(data.token)
        useStore.setState({ user: data.user as any, isAuthenticated: true, token: data.token })
        setSuccess(true)
        setTimeout(() => {
          const isAdmin = data.user?.role === 'admin'
          navigate(isAdmin ? '/admin' : (location.state as any)?.from?.pathname || '/', { replace: true })
        }, 600)
      } else {
        setError(result.message || '生物识别登录失败')
        triggerShake()
        resetTurnstile()
      }
    } catch (err: any) {
      setError(err?.message || '登录异常')
      triggerShake()
      resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  function renderDomainSuggest(isLogin: boolean) {
    const currentEmail = isLogin ? loginEmail : regEmail
    const atIndex = currentEmail.indexOf('@')
    if (atIndex === -1) return null
    const prefix = currentEmail.slice(0, atIndex)
    const afterAt = currentEmail.slice(atIndex + 1)
    const filtered = COMMON_DOMAINS.filter(d => d.startsWith(afterAt))
    if (!showDomainSuggest || filtered.length === 0) return null
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-full left-0 right-0 mt-1.5 z-30"
      >
        <Card className="overflow-hidden py-1">
          {filtered.map((domain, i) => (
            <button
              key={domain}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectDomain(domain, isLogin) }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                i === activeDomainIndex
                  ? 'bg-[var(--accent-primary)]/5 text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              <Mail size={14} className="flex-shrink-0 text-[var(--text-muted)]" />
              <span className="font-medium">{prefix}</span>
              <span className="text-[var(--text-muted)]">@{domain}</span>
            </button>
          ))}
        </Card>
      </motion.div>
    )
  }

  function renderPasswordRules() {
    if (!regPassword) return null
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className="mt-2 space-y-1"
      >
        {PASSWORD_RULES.map(rule => {
          const passed = rule.test(regPassword)
          return (
            <div key={rule.key} className="flex items-center gap-2 text-xs">
              {passed ? (
                <CheckCircle size={12} className="text-[var(--success)] flex-shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-[var(--text-muted)]/30 flex-shrink-0" />
              )}
              <span className={passed ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}>{rule.label}</span>
            </div>
          )
        })}
      </motion.div>
    )
  }

  const strength = getPasswordStrength(regPassword)

  function renderAuthForm(isLogin: boolean, skipEntrance = false) {
    const fieldInitial = skipEntrance ? 'visible' : 'hidden'
    return (
      <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
        <AnimatePresence>
          {error && (
            <motion.div
              key="form-error"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] font-medium shadow-sm"
              role="alert"
            >
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {!isLogin && (
          <motion.div custom={0} variants={fieldVariants} initial={fieldInitial} animate="visible">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">用户名</label>
              <InputWithIcon
                icon={<User size={16} />}
                type="text"
                value={regUsername}
                onChange={e => setRegUsername(e.target.value)}
                placeholder="输入用户名"
                autoComplete="username"
                rightElement={regUsername.length >= 2 ? (
                  usernameChecking ? (
                    <InlineLoading size="sm" color="muted" />
                  ) : usernameAvailable === true ? (
                    <CheckCircle size={14} className="text-[var(--success)]" />
                  ) : usernameAvailable === false ? (
                    <XCircle size={14} className="text-[var(--error)]" />
                  ) : null
                ) : undefined}
              />
              {regUsername.length >= 2 && usernameAvailable === false && (
                <p className="text-[10px] text-[var(--error)]">该用户名已被使用</p>
              )}
              {regUsername.length > 0 && regUsername.length < 2 && (
                <p className="text-[10px] text-[var(--error)]">用户名至少需要 2 个字符</p>
              )}
              {!regUsername && (
                <p className="text-[10px] text-[var(--text-muted)]">2-20 位字符，支持中英文、数字和下划线</p>
              )}
            </div>
          </motion.div>
        )}

        <motion.div custom={1} variants={fieldVariants} initial={fieldInitial} animate="visible" className="relative">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">邮箱</label>
            <InputWithIcon
              icon={<Mail size={16} />}
              inputRef={isLogin ? emailRef : undefined}
              type="email"
              value={isLogin ? loginEmail : regEmail}
              onChange={e => handleEmailChange(e.target.value, isLogin)}
              onFocus={() => {
                const val = isLogin ? loginEmail : regEmail
                const atIndex = val.indexOf('@')
                if (atIndex >= 0) {
                  const afterAt = val.slice(atIndex + 1)
                  const filtered = COMMON_DOMAINS.filter(d => d.startsWith(afterAt))
                  setShowDomainSuggest(filtered.length > 0 && afterAt.length > 0)
                }
              }}
              onBlur={() => setTimeout(() => setShowDomainSuggest(false), 200)}
              onKeyDown={e => handleEmailKeyDown(e, isLogin)}
              placeholder="your@email.com"
              autoComplete="email"
            />
            <p className="text-[10px] text-[var(--text-muted)]">用于登录和找回密码，请填写真实有效的邮箱地址</p>
          </div>
          {renderDomainSuggest(isLogin)}
        </motion.div>

        <motion.div custom={2} variants={fieldVariants} initial={fieldInitial} animate="visible">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">密码</label>
            <InputWithIcon
              icon={<Lock size={16} />}
              type={isLogin ? (showPassword.login ? 'text' : 'password') : (showPassword.reg ? 'text' : 'password')}
              value={isLogin ? loginPassword : regPassword}
              onChange={e => isLogin ? setLoginPassword(e.target.value) : setRegPassword(e.target.value)}
              placeholder={isLogin ? '输入密码' : '设置密码'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              rightElement={(
                <Tooltip content={isLogin ? (showPassword.login ? '隐藏密码' : '显示密码') : (showPassword.reg ? '隐藏密码' : '显示密码')} side="top">
                  <button
                    type="button"
                    onClick={() => isLogin
                      ? setShowPassword(prev => ({ ...prev, login: !prev.login }))
                      : setShowPassword(prev => ({ ...prev, reg: !prev.reg }))
                    }
                    className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                    aria-label={isLogin ? (showPassword.login ? '隐藏密码' : '显示密码') : (showPassword.reg ? '隐藏密码' : '显示密码')}
                  >
                    {(isLogin ? showPassword.login : showPassword.reg) ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </Tooltip>
              )}
            />
            {!isLogin && regPassword && (
              <div className="mt-2">
                <div className="h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: strength.width }}
                    style={{ backgroundColor: strength.color }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-[10px] mt-1" style={{ color: strength.color }}>密码强度：{strength.label}</p>
              </div>
            )}
            {!isLogin && renderPasswordRules()}
            {isLogin && !loginPassword && (
              <p className="text-[10px] text-[var(--text-muted)]">请输入注册时设置的密码</p>
            )}
          </div>
        </motion.div>

        {!isLogin && (
          <motion.div custom={3} variants={fieldVariants} initial={fieldInitial} animate="visible">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">确认密码</label>
              <InputWithIcon
                icon={<Lock size={16} />}
                type={showPassword.confirm ? 'text' : 'password'}
                value={regConfirmPassword}
                onChange={e => setRegConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                autoComplete="new-password"
                rightElement={(
                  <Tooltip content={showPassword.confirm ? '隐藏密码' : '显示密码'} side="top">
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => ({ ...prev, confirm: !prev.confirm }))}
                      className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                      aria-label={showPassword.confirm ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </Tooltip>
                )}
              />
              {regConfirmPassword && regPassword !== regConfirmPassword && (
                <p className="text-[10px] text-[var(--error)]">两次输入的密码不一致，请重新确认</p>
              )}
              {regConfirmPassword && regPassword === regConfirmPassword && (
                <p className="text-[10px] text-[var(--success)]">密码一致</p>
              )}
              {!regConfirmPassword && (
                <p className="text-[10px] text-[var(--text-muted)]">请再次输入上方设置的密码</p>
              )}
            </div>
          </motion.div>
        )}

        <motion.div custom={isLogin ? 3 : 4} variants={fieldVariants} initial={fieldInitial} animate="visible">
          <ImageCaptcha
            ref={imageCaptchaRef}
            type="numeric"
            onChange={setImageCaptcha}
            disabled={loading}
          />
        </motion.div>

        <motion.div custom={isLogin ? 4 : 5} variants={fieldVariants} initial={fieldInitial} animate="visible" className="flex justify-center min-h-[65px]">
          <div id="turnstile-container" />
        </motion.div>

        {isLogin && (
          <motion.div
            custom={5}
            variants={fieldVariants}
            initial={fieldInitial}
            animate="visible"
            className="flex items-center justify-between px-0.5"
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-input)] accent-[var(--accent-primary)]"
              />
              <span className="text-xs text-[var(--text-muted)]">记住我</span>
            </label>
            <Link
              to="/forgot-password"
              className="text-xs text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)] transition-colors"
            >
              忘记密码？
            </Link>
          </motion.div>
        )}

        <motion.div custom={isLogin ? 6 : 6} variants={fieldVariants} initial={fieldInitial} animate="visible">
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            size="lg"
            loading={loading || success}
            loadingText={isLogin ? '登录中...' : '注册中...'}
            disabled={loading || success}
          >
            <ArrowRight size={16} />
            {isLogin ? '登录' : '创建账户'}
          </Button>
        </motion.div>

        {isLogin && biometricSupported && (
          <motion.div
            custom={7}
            variants={fieldVariants}
            initial={fieldInitial}
            animate="visible"
            className="relative"
          >
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-secondary)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--bg-card)] px-2 text-[var(--text-muted)]">或</span>
            </div>
          </motion.div>
        )}

        {isLogin && biometricSupported && (
          <motion.div custom={8} variants={fieldVariants} initial={fieldInitial} animate="visible">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              size="lg"
              loading={loading || success}
              loadingText="验证中..."
              disabled={loading || success}
              onClick={handleBiometricLogin}
            >
              <Fingerprint size={16} />
              人脸 / 指纹登录
            </Button>
          </motion.div>
        )}

      </form>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-12"
      style={{
        background: `
          radial-gradient(ellipse at 120% 0%, rgba(0, 0, 0, 0.04) 0%, transparent 55%),
          radial-gradient(ellipse at -10% 100%, rgba(0, 0, 0, 0.06) 0%, transparent 50%),
          radial-gradient(ellipse at 60% 120%, rgba(0, 0, 0, 0.03) 0%, transparent 45%),
          linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)
        `,
      }}
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--accent-primary)]/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-[var(--text-secondary)]/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-6xl mx-auto flex items-center justify-center relative z-10">
        {/* Left side branding */}
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center pr-16">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-center"
          >
            <h1 className="text-6xl font-bold text-[var(--text-primary)] tracking-tight mb-4">
              Lingua<span className="text-[var(--text-muted)]">Leap</span>
            </h1>
            <p className="text-base text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              开启你的多语种学习之旅
            </p>
            <div className="mt-10 flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--text-primary)]">50+</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">语种课程</p>
              </div>
              <div className="w-px h-10 bg-[var(--border-primary)]" />
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--text-primary)]">AI</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">智能辅导</p>
              </div>
              <div className="w-px h-10 bg-[var(--border-primary)]" />
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--text-primary)]">100%</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">免费学习</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="hidden lg:flex w-px h-64 self-center bg-gradient-to-b from-transparent via-[var(--border-primary)] to-transparent mx-6" />

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: shake ? [0, -4, 4, -4, 4, 0] : 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          <Card className="p-8 md:p-10 relative overflow-visible glass-card-strong">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-primary)]/10 flex items-center justify-center mx-auto mb-4">
                <Shield size={24} className="text-[var(--accent-primary)]" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-1">
                欢迎来到 LinguaLeap
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">登录或注册以继续学习</p>
            </div>

            {/* Tabs */}
            <div className="relative flex items-center p-1 bg-[var(--bg-secondary)] rounded-[var(--radius-md)] mb-8">
              <motion.div
                className="absolute top-1 bottom-1 rounded-[10px] bg-[var(--accent-primary)] shadow-sm"
                initial={false}
                animate={{ left: activeTab === 'login' ? '4px' : '50%', width: 'calc(50% - 4px)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
              <button
                type="button"
                onClick={() => setActiveTab('login')}
                className={`relative z-10 flex-1 py-2 px-4 rounded-[10px] text-sm font-semibold transition-colors ${
                  activeTab === 'login' ? 'text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('register')}
                className={`relative z-10 flex-1 py-2 px-4 rounded-[10px] text-sm font-semibold transition-colors ${
                  activeTab === 'register' ? 'text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                注册
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'login' ? (
                <motion.div
                  key="login-form"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {renderAuthForm(true, hasAnimatedFields.current)}
                </motion.div>
              ) : (
                <motion.div
                  key="register-form"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Registration steps */}
                  <div className="flex items-center justify-center mb-6">
                    {[
                      { num: 1, label: '基本信息' },
                      { num: 2, label: '安全密码' },
                      { num: 3, label: '完成注册' },
                    ].map((step, idx) => (
                      <div key={step.num} className="flex flex-col items-center relative w-20">
                        {idx < 2 && (
                          <div className={`absolute top-3 left-[60%] w-[80%] h-px ${regStep > step.num ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-secondary)]'}`} />
                        )}
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                            regStep > step.num
                              ? 'bg-[var(--success)] text-white'
                              : regStep === step.num
                              ? 'bg-[var(--accent-primary)] text-white'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                          }`}
                        >
                          {regStep > step.num ? <CheckCircle size={12} /> : <span>{step.num}</span>}
                        </div>
                        <span className={`text-[9px] mt-1 tracking-wider ${regStep === step.num ? 'text-[var(--accent-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {renderAuthForm(false, hasAnimatedFields.current)}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 登录/注册成功仪式 */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--bg-card)]/95 backdrop-blur-md p-8 text-center rounded-[var(--radius-lg)]"
                >
                  <Confetti trigger={success} count={60} />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                    className="w-20 h-20 rounded-full bg-[var(--success)]/10 flex items-center justify-center mb-5"
                  >
                    <Sparkles size={36} className="text-[var(--success)]" />
                  </motion.div>
                  <motion.h3
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl font-bold text-[var(--text-primary)] mb-2"
                  >
                    {user?.username ? `欢迎回来，${user.username}` : '登录成功'}
                  </motion.h3>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm text-[var(--text-secondary)]"
                  >
                    正在进入学习空间...
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Social login */}
            <div className="mt-6 pt-6 border-t border-[var(--border-secondary)]">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
              >
                <Github size={16} />
                使用 GitHub 登录
              </Button>
              <p className="text-[10px] text-[var(--text-muted)] text-center mt-4 leading-relaxed">
                继续即表示同意 <Link to="/terms" className="underline hover:text-[var(--text-secondary)] transition-colors">服务条款</Link> 和 <Link to="/privacy" className="underline hover:text-[var(--text-secondary)] transition-colors">隐私政策</Link>
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
