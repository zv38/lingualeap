import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { cn } from '../../utils/cn'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

const variantStyles = {
  danger: { icon: AlertTriangle, iconBg: 'bg-[var(--error)]/10', iconColor: 'text-[var(--error)]' },
  warning: { icon: AlertTriangle, iconBg: 'bg-[var(--warning)]/10', iconColor: 'text-[var(--warning)]' },
  info: { icon: AlertTriangle, iconBg: 'bg-[var(--accent-indigo)]/10', iconColor: 'text-[var(--accent-indigo)]' },
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'warning',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const Icon = variantStyles[variant].icon

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
          />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className={cn(
                'w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)]',
                'bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-[var(--shadow-xl)]'
              )}
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      variantStyles[variant].iconBg
                    )}
                  >
                    <Icon className={cn('h-5 w-5', variantStyles[variant].iconColor)} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/50 px-6 py-4">
                <Button variant="secondary" onClick={onCancel}>
                  {cancelText}
                </Button>
                <Button
                  variant={variant === 'danger' ? 'danger' : 'indigo'}
                  onClick={onConfirm}
                >
                  {confirmText}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
