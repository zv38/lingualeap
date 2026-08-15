import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Mail, Lock, ArrowLeft, ArrowRight, RefreshCw, CheckCircle, Shield } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'

type Step = 'email' | 'verify' | 'reset' | 'done'

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('请填写邮箱地址')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.success) {
        setStep('verify')
      } else {
        setError(data.message || '该邮箱未注册')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!code) {
      setError('请填写验证码')
      return
    }

    setStep('reset')
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password || password.length < 6) {
      setError('密码至少需要6位')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code, password }),
      })
      const data = await res.json()
      if (data.success) {
        setStep('done')
      } else {
        setError(data.message || '重置失败，请重新尝试')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const stepTitle = {
    email: '重置密码',
    verify: '验证邮箱',
    reset: '设置新密码',
    done: '重置成功',
  }[step]

  const stepDescription = {
    email: '输入注册邮箱，我们将发送重置验证码',
    verify: '请输入邮箱中收到的验证码',
    reset: '设置你的新密码',
    done: '你的密码已成功重置',
  }[step]

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-12"
      style={{
        background: `
          radial-gradient(ellipse at 120% 0%, rgba(0, 0, 0, 0.04) 0%, transparent 55%),
          radial-gradient(ellipse at -10% 100%, rgba(0, 0, 0, 0.05) 0%, transparent 50%),
          linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)
        `,
      }}
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-[var(--accent-indigo)]/10 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="p-8 md:p-10">
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-8"
          >
            <ArrowLeft size={16} />
            返回登录
          </Link>

          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-[var(--radius-md)] bg-[var(--accent-indigo)]/10 flex items-center justify-center mx-auto mb-4">
              <Shield size={26} className="text-[var(--accent-indigo)]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-2">{stepTitle}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{stepDescription}</p>
          </div>

          {step === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="注册邮箱地址"
                  className="pl-10"
                />
              </div>

              {error && <p className="text-xs text-[var(--error)]">{error}</p>}

              <Button type="submit" className="w-full" size="lg" loading={loading} disabled={loading}>
                {!loading && <ArrowRight size={16} />}
                发送验证码
              </Button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <p className="text-xs text-[var(--accent-indigo)] text-center bg-[var(--accent-indigo)]/5 rounded-[var(--radius-md)] px-4 py-3">
                验证码已发送至 {email}
              </p>

              <Input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="输入验证码"
                maxLength={6}
                className="text-center tracking-[0.5em] font-mono"
              />

              {error && <p className="text-xs text-[var(--error)]">{error}</p>}

              <Button type="submit" className="w-full" size="lg" disabled={!code}>
                验证
                <ArrowRight size={16} />
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleSendCode}
                disabled={loading}
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : '重新发送验证码'}
              </Button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="新密码（至少6位）"
                  className="pl-10"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="确认新密码"
                  className="pl-10"
                />
              </div>

              {error && <p className="text-xs text-[var(--error)]">{error}</p>}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={loading}
                disabled={loading || !password || !confirmPassword}
              >
                {!loading && <ArrowRight size={16} />}
                重置密码
              </Button>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center space-y-6">
              <div className="w-14 h-14 rounded-[var(--radius-md)] bg-[var(--success-bg)] flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-[var(--success)]" />
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                你的密码已成功重置，现在可以使用新密码登录了。
              </p>
              <Link to="/auth">
                <Button className="w-full" size="lg">
                  前往登录
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
