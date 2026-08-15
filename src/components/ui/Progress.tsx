import React from 'react'
import { cn } from '../../utils/cn'

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  size?: 'sm' | 'md'
  color?: 'default' | 'indigo' | 'success'
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, size = 'md', color = 'default', ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100))
    const sizeClasses = {
      sm: 'h-1.5',
      md: 'h-2',
    }
    const colorClasses = {
      default: 'bg-[var(--accent-primary)]',
      indigo: 'bg-[var(--accent-indigo)]',
      success: 'bg-[var(--success)]',
    }
    return (
      <div
        ref={ref}
        className={cn('w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]', sizeClasses[size], className)}
        {...props}
      >
        <div
          className={cn('relative h-full rounded-full transition-all duration-500 ease-out overflow-hidden', colorClasses[color])}
          style={{ width: `${percentage}%` }}
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent motion-safe:animate-progress-shimmer"
            aria-hidden="true"
          />
        </div>
      </div>
    )
  }
)
Progress.displayName = 'Progress'

export { Progress }
