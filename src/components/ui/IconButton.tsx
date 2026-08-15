import React from 'react'
import { cn } from '../../utils/cn'
import { Tooltip } from './Tooltip'
import type { LucideIcon } from 'lucide-react'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  tooltip?: string
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'soft' | 'glass' | 'solid'
  active?: boolean
  badge?: number
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
}

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-[18px] h-[18px]',
  lg: 'w-5 h-5',
}

const variantClasses = {
  ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]',
  soft: 'bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)]/15',
  glass: 'bg-[var(--bg-card)]/80 border border-[var(--border-primary)]/60 text-[var(--text-secondary)] backdrop-blur-md hover:text-[var(--accent-indigo)] hover:border-[var(--accent-indigo)]/20 hover:bg-[var(--bg-card)]',
  solid: 'bg-[var(--accent-indigo)] text-white hover:bg-[var(--accent-indigo-hover)] shadow-md',
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon: Icon,
      label,
      tooltip,
      tooltipSide = 'top',
      size = 'md',
      variant = 'ghost',
      active = false,
      badge,
      className,
      ...props
    },
    ref
  ) => {
    const button = (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          'relative inline-flex items-center justify-center rounded-xl transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-indigo)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
          'active:scale-[0.96]',
          sizeClasses[size],
          variantClasses[variant],
          active && 'text-[var(--accent-indigo)] bg-[var(--accent-indigo)]/10',
          className
        )}
        {...props}
      >
        <Icon className={cn(iconSizes[size])} strokeWidth={1.75} />
        {typeof badge === 'number' && badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--error)] px-1 text-[10px] font-semibold text-white ring-2 ring-[var(--bg-primary)]">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )

    return (
      <Tooltip content={tooltip || label} side={tooltipSide}>
        {button}
      </Tooltip>
    )
  }
)
IconButton.displayName = 'IconButton'
