import { motion } from 'framer-motion'
import {
  CheckCircle, XCircle, AlertTriangle, Info,
  Loader, Sparkles, Bug, Shield, Camera, MessageSquare,
  type LucideIcon
} from 'lucide-react'

type PopInIconType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'sparkles' | 'bug' | 'shield' | 'camera' | 'message'

interface PopInIconProps {
  type: PopInIconType
  size?: number
  className?: string
  delay?: number
  color?: string
}

const colorMap: Record<PopInIconType, string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--accent-primary)',
  loading: 'var(--accent-primary)',
  sparkles: 'var(--accent-primary)',
  bug: 'var(--accent-primary)',
  shield: 'var(--accent-primary)',
  camera: 'var(--accent-primary)',
  message: 'var(--accent-primary)',
}

const iconTypeMap: Record<PopInIconType, LucideIcon> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader,
  sparkles: Sparkles,
  bug: Bug,
  shield: Shield,
  camera: Camera,
  message: MessageSquare,
}

const rotateTypes = new Set<PopInIconType>(['loading', 'sparkles', 'bug', 'shield'])

const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 18,
}

export type { PopInIconType }
export { iconTypeMap }

export default function PopInIcon({ type, size = 20, className = '', delay = 0, color }: PopInIconProps) {
  const IconComponent = iconTypeMap[type]
  const iconColor = color || colorMap[type]
  const shouldRotate = rotateTypes.has(type)

  return (
    <motion.span
      className={`inline-flex items-center justify-center ${className}`}
      initial={{ scale: 0, opacity: 0, rotate: shouldRotate ? -90 : 0 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ ...springTransition, delay }}
    >
      {type === 'loading' ? (
        <motion.span
          className="inline-flex"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <IconComponent size={size} color={iconColor} />
        </motion.span>
      ) : (
        <IconComponent size={size} color={iconColor} />
      )}
    </motion.span>
  )
}