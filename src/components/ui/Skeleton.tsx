import React from 'react'
import { cn } from '../../utils/cn'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  circle?: boolean
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, circle, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
          'motion-safe:animate-pulse bg-[var(--bg-elevated)]',
          circle ? 'rounded-full' : 'rounded-[var(--radius-md)]',
          className
        )}
      {...props}
    />
  )
)
Skeleton.displayName = 'Skeleton'

export { Skeleton }
