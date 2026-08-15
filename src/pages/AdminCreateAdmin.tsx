import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ShieldPlus, KeyRound, Image, Clock, Mail, Lock, User,
  ChevronLeft, RefreshCw, CheckCircle2, AlertTriangle, Loader2
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { request, post } from '../utils/api'

export default function AdminCreateAdmin() {
  const navigate = useNavigate()
  const { user, addToast } = useStore()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [createSecret, setCreateSecret] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadCaptcha = async () => {
    try {
      const res = await request('/admin/captcha')
      if (res.success && res.data?.success) {
        setCaptchaId(res.data.captchaId)
        setCaptchaSvg(res.data.svg)
        setCaptchaCode('')
      } else {
        addToast('验证码加载失败', 'error', 3000)
      }
    } catch {
      addToast('验证码加载失败', 'error', 3000)
    }
  }

  const handleSubmit = async () => {
    if (!username || !email || !password || !createSecret || !captchaId || !captchaCode || !totpCode) {
      addToast('请填写所有必填项（含口令、图形验证码、TOTP 动态码）', 'error', 3500)
      return
    }
    setSubmitting(true)
    try {
      const res = await post('/admin/create-admin', {
        username,
        email,
        password,
        createSecret,
        captchaId,
        captchaCode,
        totpCode,
      })
      if (res.success && res.data?.success) {
        addToast('管理员账号创建成功', 'success', 3000)
        setUsername('')
        setEmail('')
        setPassword('')
        setCreateSecret('')
        setTotpCode('')
        loadCaptcha()
      } else {
        addToast(res.message || '创建失败，请检查输入', 'error', 3500)
        loadCaptcha()
      }
    } catch {
      addToast('创建失败，请重试', 'error', 3000)
      loadCaptcha()
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass = 'w-full px-4 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.8 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <motion.button
              type="button"
              onClick={() => navigate('/admin')}
              className="mb-4 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
              whileHover={{ x: -3 }}
            >
              <ChevronLeft className="w-4 h-4" />
              返回安全运营中心
            </motion.button>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
              className="font-serif text-4xl gradient-text mb-2"
            >
              创建管理员账号
            </motion.h1>
            <p className="text-[var(--text-secondary)]">
              军工级多重校验：创建口令 + 图形验证码 + TOTP 动态码 + 管理员二次验证
            </p>
          </div>
          <div className="p-3 rounded-2xl glass-panel text-[var(--accent-primary)]">
            <ShieldPlus className="w-8 h-8" />
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] p-8 space-y-6">
          {/* 四道校验说明 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: KeyRound, label: '创建口令', desc: '运维持有' },
              { icon: Image, label: '图形验证码', desc: '防自动化' },
              { icon: Clock, label: 'TOTP 动态码', desc: '操作者本人' },
              { icon: Lock, label: '二次验证', desc: '管理员确认' },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]/60 p-3 text-center"
                >
                  <Icon className="w-5 h-5 mx-auto mb-1.5 text-[var(--accent-primary)]" />
                  <p className="text-xs font-medium text-[var(--text-primary)]">{item.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{item.desc}</p>
                </motion.div>
              )
            })}
          </div>

          {/* 操作者信息 */}
          <div className="flex items-center gap-3 rounded-xl bg-[var(--accent-primary)]/5 px-4 py-3">
            <User className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm text-[var(--text-secondary)]">
              当前操作者：<span className="font-medium text-[var(--text-primary)]">{user?.username || '未知'}</span>
            </span>
          </div>

          {/* 创建口令 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-2">
              <KeyRound className="w-4 h-4 text-[var(--accent-primary)]" />
              创建口令（运维口令）
            </label>
            <input
              type="password"
              value={createSecret}
              onChange={(e) => setCreateSecret(e.target.value)}
              placeholder="输入系统配置的 ADMIN_CREATE_SECRET 口令"
              className={fieldClass}
            />
          </div>

          {/* 图形验证码 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-2">
              <Image className="w-4 h-4 text-[var(--accent-primary)]" />
              图形验证码
            </label>
            <div className="flex items-center gap-3">
              <div
                className="h-[52px] w-[160px] rounded-xl overflow-hidden border border-[var(--border-color)] bg-white"
                dangerouslySetInnerHTML={{ __html: captchaSvg }}
              />
              <div className="flex-1 flex gap-2">
                <input
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  placeholder="输入验证码"
                  className={fieldClass}
                />
                <motion.button
                  type="button"
                  onClick={loadCaptcha}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-3 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                  title="刷新验证码"
                >
                  <RefreshCw className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
            {!captchaSvg && (
              <button
                type="button"
                onClick={loadCaptcha}
                className="mt-2 text-xs text-[var(--accent-primary)] hover:underline"
              >
                点击加载验证码
              </button>
            )}
          </div>

          {/* TOTP 动态码 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-2">
              <Clock className="w-4 h-4 text-[var(--accent-primary)]" />
              TOTP 动态验证码（操作管理员本人）
            </label>
            <input
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="输入 6 位 TOTP 动态码"
              maxLength={6}
              className={fieldClass}
            />
          </div>

          {/* 账号信息 */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-2">
                <User className="w-4 h-4 text-[var(--accent-primary)]" />
                管理员名称
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="如：安全运维"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-2">
                <Mail className="w-4 h-4 text-[var(--accent-primary)]" />
                邮箱
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-2">
              <Lock className="w-4 h-4 text-[var(--accent-primary)]" />
              登录密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              className={fieldClass}
            />
          </div>

          {/* 安全提示 */}
          <div className="flex items-start gap-2.5 rounded-xl bg-[var(--warning)]/8 border border-[var(--warning)]/20 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-[var(--warning)] mt-0.5 shrink-0" />
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              创建管理员属于最高权限操作，系统将记录完整的审计日志（操作者、时间、来源 IP）。
              请确保操作者本人已开启 TOTP，并妥善保管创建口令。
            </p>
          </div>

          {/* 提交 */}
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            whileHover={submitting ? {} : { scale: 1.01 }}
            whileTap={submitting ? {} : { scale: 0.99 }}
            className="w-full py-3.5 rounded-xl text-white font-medium transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: submitting ? 'var(--text-muted)' : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在创建...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                创建管理员账号
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}