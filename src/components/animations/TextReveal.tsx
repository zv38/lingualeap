import { motion } from 'framer-motion'
import { useAnimatedInView } from '../../hooks/useAnimatedInView'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface TextRevealProps {
  text: string
  className?: string
  delay?: number
  once?: boolean
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span'
}

export default function TextReveal({
  text,
  className = '',
  delay = 0,
  once = true,
  as: Tag = 'p',
}: TextRevealProps) {
  const reduced = useReducedMotion()
  const { ref, isInView } = useAnimatedInView({ once, threshold: 0.2 })

  if (reduced) {
    return <Tag ref={ref} className={className}>{text}</Tag>
  }

  return (
    <Tag ref={ref} className={className}>
      <motion.span
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{
          duration: 0.5,
          delay,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="inline-block"
      >
        {text}
      </motion.span>
    </Tag>
  )
}
