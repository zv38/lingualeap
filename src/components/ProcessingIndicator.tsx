import { motion } from 'framer-motion'
import { Brain, Search, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import type { ProcessingStage } from '../hooks/useProcessingStatus'

interface ProcessingIndicatorProps {
  stage: ProcessingStage
  message: string
  progress: number
  className?: string
}

const stageConfig: Record<ProcessingStage, { icon: typeof Brain; color: string; bgColor: string }> = {
  idle: { icon: Brain, color: 'var(--text-muted)', bgColor: 'var(--bg-secondary)' },
  understanding: { icon: Search, color: 'var(--accent-indigo)', bgColor: 'var(--accent-indigo)/0.08' },
  thinking: { icon: Brain, color: 'var(--accent-primary)', bgColor: 'var(--accent-primary)/0.08' },
  generating: { icon: Sparkles, color: 'var(--warning)', bgColor: 'var(--warning)/0.08' },
  optimizing: { icon: Sparkles, color: 'var(--accent-navy)', bgColor: 'var(--accent-navy)/0.08' },
  complete: { icon: CheckCircle2, color: 'var(--success)', bgColor: 'var(--success)/0.08' },
  error: { icon: AlertCircle, color: 'var(--error)', bgColor: 'var(--error)/0.08' },
}

export default function ProcessingIndicator({ stage, message, progress, className = '' }: ProcessingIndicatorProps) {
  if (stage === 'idle') return null

  const config = stageConfig[stage]
  const Icon = config.icon
  const isActive = stage !== 'complete' && stage !== 'error'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-[var(--radius-md)] overflow-hidden ${className}`}
      style={{ background: `color-mix(in srgb, ${config.color} 6%, var(--bg-card))`, border: `1px solid color-mix(in srgb, ${config.color} 15%, var(--border-primary))` }}
    >
      <div className="px-3.5 py-2.5 flex items-center gap-2.5">
        <motion.div
          animate={isActive ? { rotate: [0, 360] } : {}}
          transition={isActive ? { repeat: Infinity, duration: 2, ease: 'linear' } : {}}
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
        >
          <Icon size={13} style={{ color: config.color }} />
        </motion.div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {message}
            </span>
            {isActive && (
              <span className="text-[10px] shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>
                {Math.round(progress)}%
              </span>
            )}
          </div>
          {isActive && (
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: `color-mix(in srgb, ${config.color} 12%, var(--bg-secondary))` }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${config.color}, color-mix(in srgb, ${config.color} 60%, white))` }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>
      </div>
      {isActive && (
        <motion.div
          className="h-[1.5px]"
          style={{ background: `linear-gradient(90deg, transparent, ${config.color}, transparent)` }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        />
      )}
    </motion.div>
  )
}