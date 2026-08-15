import { motion } from 'framer-motion'
import React from 'react'
import { useReducedMotion } from '../../utils/useReducedMotion'

export interface StaggerContainerProps {
  children: React.ReactNode
  className?: string
  stagger?: number
  delay?: number
}

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
}

export default function StaggerContainer({
  children,
  className,
  stagger = 0.06,
  delay = 0.1,
}: StaggerContainerProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      transition={{ staggerChildren: stagger, delayChildren: delay }}
      className={className}
    >
      {React.Children.map(children, (child) => (
        <motion.div variants={staggerItemVariants}>{child}</motion.div>
      ))}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
