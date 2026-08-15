import { motion, AnimatePresence } from 'framer-motion'
import { Cookie, X, Check, Settings } from 'lucide-react'
import { useState, useEffect } from 'react'

type CookieConsent = 'accepted' | 'rejected' | 'pending'

export default function CookieConsentBanner() {
  const [consent, setConsent] = useState<CookieConsent>('pending')
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('cookie_consent')
    if (stored === 'accepted' || stored === 'rejected') {
      setConsent(stored)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'accepted')
    setConsent('accepted')
  }

  const handleReject = () => {
    localStorage.setItem('cookie_consent', 'rejected')
    setConsent('rejected')
  }

  const handleSettings = () => {
    setShowSettings(s => !s)
  }

  if (consent !== 'pending') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-[560px]"
        role="dialog"
        aria-label="Cookie 同意"
      >
        <div className="rounded-[var(--radius-xl)] border border-[var(--border-primary)] bg-[var(--bg-card)]/95 backdrop-blur-xl shadow-[var(--shadow-lg)] p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-indigo)]/10 border border-[var(--accent-indigo)]/15 flex items-center justify-center flex-shrink-0">
              <Cookie size={18} className="text-[var(--accent-indigo)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Cookie 隐私设置</h3>
                <button
                  onClick={() => setConsent('pending')}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all"
                  aria-label="关闭"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1 mb-3">
                我们使用必要的 Cookie 来维持登录状态和基本功能。分析型 Cookie 帮助我们改进学习体验。
                查看完整的 <a href="/privacy-policy" className="text-[var(--accent-indigo)] hover:underline" target="_blank" rel="noreferrer">隐私政策</a>。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAccept}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--accent-indigo)] text-white shadow-[0_6px_16px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-indigo-hover)] transition-all"
                >
                  <Check size={13} />
                  接受所有 Cookie
                </button>
                <button
                  onClick={handleReject}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-md)] text-xs font-semibold border border-[var(--border-primary)] text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all"
                >
                  <X size={13} />
                  仅必需
                </button>
                <button
                  onClick={handleSettings}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all"
                >
                  <Settings size={13} />
                  设置
                </button>
              </div>

              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 pt-3 border-t border-[var(--border-primary)]"
                >
                  <p className="text-xs text-[var(--text-muted)]">
                    当前设置面板为占位 UI，后续可在此管理必要 Cookie、分析 Cookie 与营销 Cookie 的开关。
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
