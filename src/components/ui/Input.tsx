import React from 'react'
import { cn } from '../../utils/cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'flex h-11 w-full rounded-[var(--radius-md)] border bg-[var(--bg-secondary)] px-3.5 py-2 text-sm text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)]',
            'transition-colors duration-200',
            'focus:border-[var(--accent-indigo)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-indigo)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]' : 'border-[var(--border-input)] hover:border-[var(--border-primary)]',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-[var(--error)]">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
