import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Lock, KeyRound, X, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'
import { authApi } from '../utils/api'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card } from './ui/Card'

interface AdminReauthModalProps {
  open: boolean
  title?: string
  description?: string
  onClose: () => void
  onVerified: (token: string) => void
}

export default function AdminReauthModal({
  open,
  title = '敏感操作确认',
  description = '为保障账号安全，执行此操作前请再次验证管理员身份。',
  onClose,
  onVerified,
}: AdminReauthModalProps) {
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsTOTP, setNeedsTOTP] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!password.trim()) {
      setError('请输入当前登录密码')
      return
    }
    if (needsTOTP && !totpCode.trim()) {
      setError('请输入两步验证码')
      return
    }

    setLoading(true)
    try {
      const result = await authApi.adminReauth(password, totpCode.trim() || undefined)
      if (result.success && result.data?.token) {
        onVerified(result.data.token)
        setPassword('')
        setTotpCode('')
        setNeedsTOTP(false)
      } else {
        setError(result.message || '验证失败')
      }
    } catch (err: any) {
      const msg = err?.message || '验证失败，请稍后重试'
      if (msg.includes('TOTP') || msg.includes('两步验证')) {
        setNeedsTOTP(true)
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <Card className="w-full max-w-md p-6 pointer-events-auto shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--warning)]/10 text-[var(--warning)] flex items-center justify-center">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
                    <p className="text-xs text-[var(--text-muted)]">管理员二次验证</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-5">{description}</p>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-[var(--error)]/8 text-[var(--error)] text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    当前登录密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="pl-10 pr-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {(needsTOTP || error.includes('TOTP') || error.includes('两步验证')) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="overflow-hidden"
                  >
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                      两步验证码（TOTP）
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={totpCode}
                        onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6 位数字"
                        className="pl-10"
                      />
                    </div>
                  </motion.div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={onClose}
                    disabled={loading}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={loading}
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    确认身份
                  </Button>
                </div>
              </form>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
