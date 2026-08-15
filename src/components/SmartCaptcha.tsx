import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, CheckCircle2, Loader2, AlertCircle, Volume2, VolumeX } from 'lucide-react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onloadTurnstileCallback?: () => void
  }
}

export type SmartCaptchaSize = 'normal' | 'invisible' | 'compact'

interface SmartCaptchaProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
  size?: SmartCaptchaSize
  /** 是否启用成功提示音（默认关闭，需用户主动开启） */
  soundEnabled?: boolean
  /** 外部控制重置 */
  resetKey?: number | string
  className?: string
}

const SCRIPT_ID = 'turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback'

function playSoftSuccess() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22)
    osc.start()
    osc.stop(ctx.currentTime + 0.24)
  } catch {
    // 音频播放失败静默处理，不影响主流程
  }
}

export default function SmartCaptcha({
  siteKey,
  onVerify,
  onExpire,
  onError,
  size = 'normal',
  soundEnabled = false,
  resetKey,
  className = '',
}: SmartCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>('idle')
  const [soundOn, setSoundOn] = useState(soundEnabled)

  const reset = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
    setStatus('idle')
  }, [])

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !siteKey) return
    if (widgetIdRef.current) return

    const id = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: 'light',
      size,
      callback: (token: string) => {
        setStatus('verified')
        if (soundOn) playSoftSuccess()
        onVerify(token)
      },
      'expired-callback': () => {
        setStatus('idle')
        onExpire?.()
      },
      'error-callback': () => {
        setStatus('error')
        onError?.()
      },
      'before-interactive-callback': () => {
        setStatus('verifying')
      },
    })
    widgetIdRef.current = id
  }, [siteKey, size, onVerify, onExpire, onError, soundOn])

  useEffect(() => {
    if (!siteKey) return

    if (window.turnstile) {
      renderWidget()
    } else {
      const existing = document.getElementById(SCRIPT_ID)
      if (!existing) {
        const script = document.createElement('script')
        script.id = SCRIPT_ID
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        document.body.appendChild(script)
      }
      window.onloadTurnstileCallback = () => renderWidget()
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [renderWidget, siteKey])

  useEffect(() => {
    if (resetKey !== undefined) reset()
  }, [resetKey, reset])

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-[var(--bg-card)] p-4 transition-shadow hover:shadow-sm ${className}`}
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            animate={status === 'verified' ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 0.4 }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--success)]/10"
          >
            {status === 'verified' ? (
              <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
            ) : (
              <Shield size={14} style={{ color: 'var(--accent-primary)' }} />
            )}
          </motion.div>
          <span className="text-xs font-semibold text-[var(--text-secondary)]">
            {status === 'verified' ? '安全验证已通过' : '安全验证'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSoundOn((v) => !v)}
          className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
          title={soundOn ? '关闭提示音' : '开启提示音'}
        >
          {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
      </div>

      <div className="relative min-h-[66px]">
        <div ref={containerRef} className="flex min-h-[65px] items-center justify-center rounded-xl" />

        <AnimatePresence>
          {status === 'verifying' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-[var(--bg-card)]/80 backdrop-blur-sm"
            >
              <Loader2 size={18} className="animate-spin text-[var(--accent-primary)]" />
              <span className="ml-2 text-xs text-[var(--text-secondary)]">正在确认…</span>
            </motion.div>
          )}

          {status === 'verified' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-secondary)]/90 text-[var(--accent-primary)] border border-[var(--border-primary)]"
            >
              <CheckCircle2 size={16} />
              <span className="text-xs font-medium">已通过人机验证</span>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-secondary)]/90 text-[var(--text-primary)] border border-[var(--border-primary)]"
            >
              <AlertCircle size={16} />
              <span className="text-xs font-medium">验证失败，请重试</span>
              <button
                type="button"
                onClick={reset}
                className="ml-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold shadow-sm"
              >
                重试
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
        {status === 'verified'
          ? '你的人机验证已通过，可以继续下一步。'
          : '我们需要先确认你是真人，这一过程不会收集你的隐私信息。'}
      </p>
    </div>
  )
}
