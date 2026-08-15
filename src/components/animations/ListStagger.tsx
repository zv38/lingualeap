import { motion } from 'framer-motion'
import { useAnimatedInView } from '../../hooks/useAnimatedInView'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface ListStaggerProps {
  children: React.ReactNode[]
  className?: string
  itemClassName?: string
  staggerDelay?: number
  direction?: 'up' | 'down' | 'left' | 'right'
}

export default function ListStagger({
  children,
  className = '',
  itemClassName = '',
  staggerDelay = 0.06,
  direction = 'up',
}: ListStaggerProps) {
  const reduced = useReducedMotion()
  const { ref, isInView } = useAnimatedInView({ threshold: 0.05 })

  const yOffset = direction === 'up' ? 16 : direction === 'down' ? -16 : 0
  const xOffset = direction === 'left' ? 16 : direction === 'right' ? -16 : 0

  const variants = {
    hidden: { opacity: reduced ? 1 : 0, y: reduced ? 0 : yOffset, x: reduced ? 0 : xOffset },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      x: 0,
      transition: {
        delay: reduced ? 0 : i * staggerDelay,
        duration: reduced ? 0.1 : 0.35,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    }),
  }

  return (
    <div ref={ref} className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          custom={i}
          variants={variants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className={itemClassName}
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}