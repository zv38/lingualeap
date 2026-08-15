import { motion } from 'framer-motion'
import { useAnimatedInView } from '../../hooks/useAnimatedInView'
import { useReducedMotion } from '../../hooks/useReducedMotion'

type Direction = 'up' | 'down' | 'left' | 'right' | 'none'

interface ScrollRevealProps {
  children: React.ReactNode
  direction?: Direction
  delay?: number
  className?: string
  once?: boolean
}

const directionOffset: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 16 },
  down: { y: -16 },
  left: { x: 16 },
  right: { x: -16 },
  none: {},
}

export default function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  className = '',
  once = true,
}: ScrollRevealProps) {
  const reduced = useReducedMotion()
  const { ref, isInView } = useAnimatedInView({ once, threshold: 0.1 })

  const offset = reduced ? {} : directionOffset[direction]
  const duration = reduced ? 0.1 : 0.5

  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={{ opacity: 0, ...offset }}
        animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, ...offset }}
        transition={{
          duration,
          delay: reduced ? 0 : delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
