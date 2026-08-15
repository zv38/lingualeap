import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-primary)]',
        primary: 'bg-[var(--accent-primary)] text-[var(--text-on-accent)]',
        indigo: 'bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)]',
        success: 'bg-[var(--success-bg)] text-[var(--success)]',
        warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
        error: 'bg-[var(--error-bg)] text-[var(--error)]',
        outline: 'border border-[var(--border-primary)] text-[var(--text-secondary)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
