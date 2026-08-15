import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useCallback, useRef } from 'react'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'

interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
  onUndo?: () => void
}

const toastColors = {
  success: 'var(--accent-primary)',
  error: 'var(--accent-secondary)',
  info: 'var(--accent-navy)',
  warning: 'var(--warning)',
}

const toastIcons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, now)
    osc1.frequency.setValueAtTime(1320, now + 0.08)
    osc1.connect(gain)
    osc1.start(now)
    osc1.stop(now + 0.5)
  } catch {
  }
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const clearAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
    setToasts([])
  }, [])

  useEffect(() => {
    const originalToast = (window as any).toast
    ;(window as any).toast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3000, onUndo?: () => void) => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 6)
      setToasts((prev) => [...prev.slice(-4), { id, message, type, duration, onUndo }])

      const timer = setTimeout(() => {
        removeToast(id)
      }, duration)
      timersRef.current.set(id, timer)

      playChime()

      if ('Notification' in window && Notification.permission === 'granted') {
        const titleMap: Record<string, string> = {
          success: '操作成功',
          error: '操作失败',
          info: '提示',
          warning: '警告',
        }
        try {
          new Notification(titleMap[type] || '提示', {
            body: message,
            icon: '/favicon.ico',
          })
        } catch {
        }
      }
    }
    return () => {
      ;(window as any).toast = originalToast
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [removeToast])

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = toastIcons[toast.type]
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96, filter: 'blur(2px)' }}
              transition={{ type: 'spring', stiffness: 320, damping: 24, mass: 0.8 }}
              className="rounded-2xl px-5 py-3.5 min-w-[280px] max-w-[420px] relative group pointer-events-auto"
              style={{
                background: 'var(--bg-card)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${toastColors[toast.type]}40`,
                borderLeftWidth: '4px',
                borderLeftColor: toastColors[toast.type],
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <button
                onClick={() => removeToast(toast.id)}
                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5"
              >
                <X size={12} />
              </button>
              <div className="flex items-start gap-3">
                <Icon size={18} style={{ color: toastColors[toast.type], marginTop: 1 }} />
                <span className="text-[var(--text-primary)] text-sm font-sans flex-1 leading-relaxed">{toast.message}</span>
                {toast.onUndo && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toast.onUndo?.()
                      removeToast(toast.id)
                    }}
                    className="text-xs text-[var(--warning)] hover:text-[var(--accent-primary)] font-medium whitespace-nowrap transition-colors"
                  >
                    撤销
                  </button>
                )}
              </div>
              <div className="mt-3 h-[2px] rounded-full overflow-hidden" style={{ background: `${toastColors[toast.type]}20` }}>
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: (toast.duration || 3000) / 1000, ease: 'linear' }}
                  className="h-full"
                  style={{ background: toastColors[toast.type] }}
                />
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {toasts.length > 1 && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          onClick={clearAll}
          className="rounded-2xl px-5 py-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-sans transition-colors self-end pointer-events-auto"
          style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)' }}
        >
          清除全部 ({toasts.length})
        </motion.button>
      )}
    </div>
  )
}
