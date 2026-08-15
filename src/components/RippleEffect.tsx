import { useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Ripple {
  id: number
  x: number
  y: number
  size: number
}

interface RippleEffectProps {
  children: React.ReactNode
  color?: string
  duration?: number
  className?: string
  disabled?: boolean
  onClick?: (e: React.MouseEvent) => void
}

export default function RippleEffect({
  children,
  color = 'var(--accent-indigo)',
  duration = 0.6,
  className = '',
  disabled = false,
  onClick,
}: RippleEffectProps) {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const idRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const size = Math.max(rect.width, rect.height) * 2

      const id = idRef.current++
      setRipples(prev => [...prev, { id, x, y, size }])

      onClick?.(e)
    },
    [disabled, onClick]
  )

  const removeRipple = useCallback((id: number) => {
    setRipples(prev => prev.filter(r => r.id !== id))
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onClick={handleClick}
    >
      {children}
      <AnimatePresence>
        {ripples.map(ripple => (
          <motion.span
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.35 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: 'easeOut' }}
            onAnimationComplete={() => removeRipple(ripple.id)}
            className="absolute pointer-events-none rounded-full"
            style={{
              left: ripple.x - ripple.size / 2,
              top: ripple.y - ripple.size / 2,
              width: ripple.size,
              height: ripple.size,
              background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}