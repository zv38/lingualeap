import { motion, useReducedMotion } from 'framer-motion'
import { Brain } from 'lucide-react'

interface BrandLoaderProps {
  message?: string
  inline?: boolean
}

export default function BrandLoader({ message = '加载中...', inline = false }: BrandLoaderProps) {
  const reducedMotion = useReducedMotion()

  const content = (
    <div className="relative flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center">
        {!reducedMotion && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full bg-[var(--accent-primary)]/10 blur-xl"
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full border border-[var(--accent-primary)]/20"
              style={{ width: 72, height: 72 }}
              animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
        <motion.div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/20"
          animate={reducedMotion ? {} : { scale: [1, 1.04, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Brain size={32} strokeWidth={1.5} />
        </motion.div>
      </div>
      <motion.p
        className="text-sm font-medium tracking-wide text-[var(--text-secondary)]"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {message}
      </motion.p>
    </div>
  )

  if (inline) return content

  return (
    <div className="fixed inset-0 z-[10003] flex flex-col items-center justify-center bg-[var(--bg-primary)]/90 backdrop-blur-sm">
      {content}
    </div>
  )
}
