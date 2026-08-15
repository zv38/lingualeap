import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
}

const positionStyles: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

const arrowContainerStyles: Record<string, string> = {
  top: 'top-full left-1/2 -translate-x-1/2',
  bottom: 'bottom-full left-1/2 -translate-x-1/2',
  left: 'left-full top-1/2 -translate-y-1/2',
  right: 'right-full top-1/2 -translate-y-1/2',
}

const arrowRotate: Record<string, string> = {
  top: 'rotate-45 border-r border-b',
  bottom: 'rotate-45 border-l border-t',
  left: 'rotate-45 border-r border-t',
  right: 'rotate-45 border-l border-b',
}

const initialAnim: Record<string, { opacity: number; y?: number; x?: number }> = {
  top: { opacity: 0, y: -4 },
  bottom: { opacity: 0, y: 4 },
  left: { opacity: 0, x: -4 },
  right: { opacity: 0, x: 4 },
}

const animateAnim: Record<string, { opacity: number; y?: number; x?: number }> = {
  top: { opacity: 1, y: 0 },
  bottom: { opacity: 1, y: 0 },
  left: { opacity: 1, x: 0 },
  right: { opacity: 1, x: 0 },
}

export default function Tooltip({
  content,
  children,
  position = 'top',
  delay = 400,
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay)
  }, [delay])

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }, [])

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={initialAnim[position]}
            animate={animateAnim[position]}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`absolute z-[9999] bg-[var(--bg-card)]/95 backdrop-blur-xl border border-[var(--accent-primary)]/15 rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] font-sans max-w-[200px] text-center pointer-events-none whitespace-pre-wrap ${positionStyles[position]}`}
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {content}
            <div className={`absolute ${arrowContainerStyles[position]}`}>
              <div
                className={`w-[8px] h-[8px] bg-[var(--bg-card)]/95 backdrop-blur-xl border-[var(--accent-primary)]/15 ${arrowRotate[position]}`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}