import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield, CheckCircle, XCircle, ArrowDown, FileText,
  Lock, Eye, Database, Mail, Scale, Gavel, AlertTriangle, Check,
} from 'lucide-react'
import { useStore } from '../store/useStore'

const sections = [
  {
    icon: FileText,
    title: '协议说明',
    content: '本隐私协议书是您与 LinguaLeap 语言学习平台之间关于使用本平台服务所订立的协议。在注册、登录或使用本平台服务前，请您务必仔细阅读并充分理解本协议的全部内容。',
  },
  {
    icon: Database,
    title: '信息收集',
    content: '您同意本平台收集以下必要信息：注册信息（用户名、电子邮箱、密码哈希值）、学习行为数据（学习进度、课程完成情况、测试成绩、学习时长）、设备信息（浏览器类型、操作系统版本、IP 地址）。\n本平台不会收集您的敏感个人信息，包括但不限于身份证号、银行卡号、生物识别信息等。',
  },
  {
    icon: Lock,
    title: '信息使用与保护',
    content: '收集的信息仅用于：提供个性化学习服务、优化课程内容、发送服务通知、改进用户体验。\n本平台采用行业领先的安全措施：密码使用 bcrypt 算法加密存储、数据传输使用 HTTPS 加密、本地存储使用 AES-256-GCM 加密。\n本平台不会将您的个人信息出售、出租或共享给任何第三方，除非获得您的明确同意或法律法规要求。',
  },
  {
    icon: Eye,
    title: '用户权利',
    content: '您有权随时查看、导出或删除您的个人数据。\n您有权撤回对本协议的同意，撤回后本平台将停止收集您的信息，但已收集的信息仍可依法保留。\n您有权要求本平台更正不准确的个人信息。\n您有权注销账户，注销后本平台将在 30 天内删除您的所有数据。',
  },
  {
    icon: Mail,
    title: '数据存储与跨境传输',
    content: '您的数据存储在本平台位于中国境内的安全服务器上。\n如因业务需要涉及跨境数据传输，本平台将严格遵守《个人信息保护法》和《数据安全法》的相关规定，进行安全评估并取得您的单独同意。',
  },
  {
    icon: Scale,
    title: '法律责任',
    content: '本平台对因不可抗力、系统维护、网络故障等原因导致的服务中断不承担责任。\n您应对使用本平台服务的行为负责，不得利用本平台从事违法违规活动。\n如您违反本协议，本平台有权限制或终止您的服务使用权限。',
  },
  {
    icon: Gavel,
    title: '协议变更',
    content: '本平台有权根据法律法规变化和业务发展需要修改本协议。\n修改后的协议将在本平台公示，如您继续使用服务，视为接受修改后的协议。\n重大变更将通过站内通知或电子邮件方式告知您。',
  },
  {
    icon: Mail,
    title: '联系方式',
    content: '如您对本协议有任何疑问、意见或投诉，请通过以下方式联系我们：\n电子邮箱：privacy@lingualeap.com\n服务时间：工作日 9:00-18:00\n我们将在收到请求后 48 小时内回复。',
  },
]

export default function PrivacyAgreementPage() {
  const navigate = useNavigate()
  const { privacyAgreed, setPrivacyAgreed } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [userRejected, setUserRejected] = useState(false)

  useEffect(() => {
    if (privacyAgreed) {
      navigate('/', { replace: true })
    }
  }, [privacyAgreed, navigate])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const pct = Math.min(1, scrollTop / Math.max(1, scrollHeight - clientHeight))
    setProgress(pct)
    if (pct >= 0.98) setHasScrolledToBottom(true)
  }

  const canAgree = consentChecked

  const handleAgree = () => {
    if (!canAgree) return
    setUserRejected(false)
    setPrivacyAgreed(true)
    navigate('/', { replace: true })
  }

  const handleReject = () => {
    setPrivacyAgreed(false)
    setUserRejected(true)
  }

  return (
    <motion.div
      className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-3xl max-h-[92vh] flex flex-col glass-panel rounded-[var(--radius-xl)] border border-[var(--glass-border)] shadow-[var(--shadow-lg)] overflow-hidden"
      >
        {/* 顶部进度条 */}
        <div className="h-1 w-full bg-[var(--border-secondary)]">
          <motion.div
            className="h-full bg-[var(--accent-indigo)]"
            style={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>

        {/* 可滚动内容 */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 sm:p-10"
        >
          <header className="flex items-start sm:items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-indigo)]/10 border border-[var(--accent-indigo)]/15 flex items-center justify-center flex-shrink-0">
              <Shield size={28} className="text-[var(--accent-indigo)]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
                隐私协议书
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                LinguaLeap 语言学习平台 · 最后更新：2026 年 5 月
              </p>
            </div>
          </header>

          <div className="mb-8 rounded-xl bg-[var(--accent-indigo)]/5 border border-[var(--accent-indigo)]/15 p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-[var(--accent-indigo)] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              在开始使用 LinguaLeap 服务前，请您仔细阅读并充分理解本隐私协议书的全部内容。
              点击「同意并继续」即表示您已阅读、理解并同意接受本协议的约束。
            </p>
          </div>

          <div className="space-y-4">
            {sections.map((section, i) => {
              const Icon = section.icon
              return (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.35 }}
                  className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]/50 p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={18} className="text-[var(--accent-indigo)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                        {i + 1}. {section.title}
                      </h3>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                        {section.content}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          <div className="h-4" />
        </div>

        {/* 底部操作栏 */}
        <div className="border-t border-[var(--border-primary)] p-5 sm:p-6 bg-[var(--bg-card)]">
          {!hasScrolledToBottom && (
            <p className="text-xs text-[var(--text-muted)] text-center mb-3 flex items-center justify-center gap-1.5">
              <ArrowDown size={12} className="animate-bounce" />
              建议滚动阅读全部条款
            </p>
          )}

          <label className="flex items-start gap-3 p-3 mb-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]/50 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-5 h-5 rounded-md border-2 border-[var(--border-input)] bg-[var(--bg-card)] peer-checked:bg-[var(--accent-indigo)] peer-checked:border-[var(--accent-indigo)] transition-colors flex items-center justify-center">
                <Check size={12} className="text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-sm text-[var(--text-secondary)] leading-relaxed select-none">
              我已阅读并同意《隐私协议书》，了解平台将如何收集、使用和保护我的个人信息。
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <motion.button
              onClick={handleAgree}
              whileHover={canAgree ? { scale: 1.01 } : {}}
              whileTap={canAgree ? { scale: 0.98 } : {}}
              disabled={!canAgree}
              className={`flex-1 rounded-[var(--radius-lg)] px-6 py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                canAgree
                  ? 'bg-[var(--accent-indigo)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.20)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.26)] hover:bg-[var(--accent-indigo-hover)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
              }`}
            >
              <CheckCircle size={18} />
              <span>同意并继续</span>
            </motion.button>

            <motion.button
              onClick={handleReject}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 rounded-[var(--radius-lg)] px-6 py-3.5 text-sm font-semibold flex items-center justify-center gap-2 border border-[var(--border-primary)] text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all"
            >
              <XCircle size={18} />
              <span>拒绝</span>
            </motion.button>
          </div>

          {userRejected && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-xl bg-[var(--warning)]/5 border border-[var(--warning)]/15 text-center"
            >
              <p className="text-sm text-[var(--warning)] font-medium mb-1">
                您已拒绝隐私协议书
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                拒绝后您将无法使用课程学习、社区交流、学习进度追踪等核心功能。
              </p>
              <button
                onClick={handleAgree}
                className="mt-2 text-sm text-[var(--accent-indigo)] hover:underline"
              >
                重新考虑，同意协议
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
