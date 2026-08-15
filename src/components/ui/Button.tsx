import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { playClickSound, playErrorSound } from '../../utils/sound'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium text-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:opacity-90 hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]',
        secondary: 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-primary)] hover:bg-[var(--bg-elevated)]',
        outline: 'bg-transparent text-[var(--text-primary)] border border-[var(--border-primary)] hover:bg-[var(--bg-secondary)]',
        ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]',
        indigo: 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-secondary)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]',
        danger: 'bg-[var(--error)] text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  loadingText?: string
}

function DotPulse({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce" />
    </span>
  )
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, loadingText, children, disabled, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return
      // 柔和音效反馈：danger 用轻柔警示音，其余用圆润点击音
      if (variant === 'danger') {
        playErrorSound()
      } else {
        playClickSound()
      }
      onClick?.(e)
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        onClick={handleClick}
        {...props}
      >
        {loading && (
          <>
            <DotPulse />
            {loadingText ? <span>{loadingText}</span> : null}
          </>
        )}
        {!loading && children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
