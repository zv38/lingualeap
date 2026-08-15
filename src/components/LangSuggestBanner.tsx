import { AnimatePresence, motion } from 'framer-motion'
import { useLangDetect } from '../hooks/useLangDetect'
import { X } from 'lucide-react'

export default function LangSuggestBanner() {
  const { suggestedDisplay, source, showBanner, accept, dismiss } = useLangDetect()

  const sourceHint: Record<string, string> = {
    geo: '根据您的所在地区',
    header: '根据您的浏览器设置',
    combined: '根据您的地区和浏览器设置',
    default: '',
  }

  return (
    <AnimatePresence>
      {showBanner && suggestedDisplay && (
        <motion.div
          role="alert"
          aria-live="polite"
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -64, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 max-w-[420px] w-[calc(100vw-32px)] px-4 py-3 rounded-xl glass-card shadow-[var(--shadow-lg)] text-sm"
        >
          <span className="flex-1 text-[var(--text-secondary)]">
            {source && sourceHint[source]
              ? `${sourceHint[source]}，为您推荐`
              : '为您推荐'}
            &nbsp;
            <strong className="text-[var(--text-primary)]">{suggestedDisplay}</strong>
          </span>

          <button
            onClick={accept}
            className="px-3.5 py-1.5 rounded-lg border-none bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-xs font-medium cursor-pointer whitespace-nowrap hover:opacity-90 transition-opacity"
          >
            切换
          </button>

          <button
            onClick={dismiss}
            aria-label="关闭语言推荐"
            className="p-1 border-none bg-transparent cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
