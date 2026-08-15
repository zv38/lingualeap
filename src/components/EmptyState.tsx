import { motion } from 'framer-motion'
import { BookOpen } from 'lucide-react'
import { Button } from './ui/Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  suggestion?: string
  image?: string
  action?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
}

const containerVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24 }
  }
}

export default function EmptyState({
  icon,
  title,
  description,
  suggestion,
  image,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-[var(--border-primary)] bg-[var(--bg-secondary)]/40 py-20 px-6 text-center"
    >
      {image && (
        <motion.img
          src={image}
          alt=""
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mx-auto mb-6 rounded-[var(--radius-lg)] max-h-[120px] object-cover"
        />
      )}

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)]"
      >
        {icon || <BookOpen className="h-7 w-7" strokeWidth={1.75} />}
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35 }}
        className="text-lg font-semibold text-[var(--text-primary)] mb-2"
      >
        {title}
      </motion.h3>

      {description && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.35 }}
          className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto mb-1"
        >
          {description}
        </motion.p>
      )}

      {suggestion && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.35 }}
          className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mb-6"
        >
          {suggestion}
        </motion.p>
      )}

      {(action || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, duration: 0.35 }}
          className="flex items-center justify-center gap-3 mt-4"
        >
          {action && (
            <Button onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
