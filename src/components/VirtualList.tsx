import { useRef, useState, useEffect, useMemo, useCallback } from 'react'

interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  containerHeight: number | string
  overscan?: number
  className?: string
  itemClassName?: string
  emptyContent?: React.ReactNode
}

export default function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  containerHeight,
  overscan = 4,
  className = '',
  itemClassName = '',
  emptyContent,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerClientHeight, setContainerClientHeight] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    setContainerClientHeight(containerRef.current.clientHeight)
    const ro = new ResizeObserver(entries => {
      setContainerClientHeight(entries[0].contentRect.height)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const totalHeight = items.length * itemHeight
  const visibleCount = Math.ceil((containerClientHeight || 0) / itemHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2)

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex)
  }, [items, startIndex, endIndex])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    setScrollTop(containerRef.current.scrollTop)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  if (items.length === 0 && emptyContent) {
    return <div className={className}>{emptyContent}</div>
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight, contain: 'strict' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const index = startIndex + i
          return (
            <div
              key={index}
              className={itemClassName}
              style={{
                position: 'absolute',
                top: index * itemHeight,
                height: itemHeight,
                left: 0,
                right: 0,
                contain: 'layout paint',
              }}
            >
              {renderItem(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
