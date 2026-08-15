import React from 'react'
import { cn } from '../../utils/cn'

type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: React.ReactNode
  side?: TooltipSide
  delay?: number
  children: React.ReactElement
  className?: string
  disabled?: boolean
}

const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

const arrowClasses: Record<TooltipSide, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 -mt-1 border-b border-r',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1 border-t border-l',
  left: 'left-full top-1/2 -translate-y-1/2 -ml-1 border-t border-r',
  right: 'right-full top-1/2 -translate-y-1/2 -mr-1 border-b border-l',
}

export function Tooltip({
  content,
  side = 'top',
  delay = 150,
  children,
  className,
  disabled = false,
}: TooltipProps) {
  if (disabled || !content) {
    return children
  }

  return (
    <div
      className={cn('group relative inline-flex', className)}
      style={{ '--tooltip-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[9999] whitespace-nowrap',
          'rounded-[var(--radius-md)] border border-[var(--border-primary)]',
          'bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)]',
          'shadow-[var(--shadow-md)] backdrop-blur-md',
          'opacity-0 translate-y-1 scale-[0.96]',
          'transition-all duration-150 ease-out',
          'group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100',
          'group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100',
          sideClasses[side]
        )}
        style={{ transitionDelay: 'var(--tooltip-delay)' }}
      >
        {content}
        <span
          className={cn(
            'absolute h-1.5 w-1.5 rotate-45 bg-[var(--bg-elevated)]',
            arrowClasses[side]
          )}
        />
      </div>
    </div>
  )
}
