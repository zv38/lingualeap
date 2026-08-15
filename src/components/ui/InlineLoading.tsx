import { cn } from '../../utils/cn'

interface InlineLoadingProps {
  size?: 'sm' | 'md' | 'lg'
  color?: 'muted' | 'current' | 'primary' | 'white'
  className?: string
  label?: string
}

const sizeMap = {
  sm: 'h-1 w-1 gap-0.5',
  md: 'h-1.5 w-1.5 gap-1',
  lg: 'h-2 w-2 gap-1.5',
}

const colorMap = {
  muted: 'bg-[var(--text-muted)]',
  current: 'bg-current',
  primary: 'bg-[var(--accent-primary)]',
  white: 'bg-white',
}

export default function InlineLoading({ size = 'md', color = 'current', className, label }: InlineLoadingProps) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span className={cn('inline-flex', sizeMap[size])}>
        <span className={cn('rounded-full motion-safe:animate-bounce', colorMap[color])} style={{ animationDelay: '-0.3s' }} />
        <span className={cn('rounded-full motion-safe:animate-bounce', colorMap[color])} style={{ animationDelay: '-0.15s' }} />
        <span className={cn('rounded-full motion-safe:animate-bounce', colorMap[color])} />
      </span>
      {label && <span className="ml-2 text-xs text-[var(--text-muted)]">{label}</span>}
    </span>
  )
}
