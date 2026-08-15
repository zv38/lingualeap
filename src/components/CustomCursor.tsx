import { useEffect, useRef } from 'react'

function isTouchDevice() {
  if (typeof window === 'undefined') return true
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore
    window.matchMedia?.('(pointer: coarse)').matches
  )
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(0)

  useEffect(() => {
    if (isTouchDevice() || prefersReducedMotion()) return

    const dot = dotRef.current
    if (!dot) return

    let dotX = 0
    let dotY = 0

    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      // 静止后再移动：启动 RAF
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    const animate = () => {
      const dx = mouseRef.current.x - dotX
      const dy = mouseRef.current.y - dotY
      // 鼠标静止时停止 RAF（差距 < 0.1 视为静止）
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
        dot.style.transform = `translate3d(${dotX - 3}px, ${dotY - 3}px, 0)`
        rafRef.current = 0
        return
      }
      dotX += dx * 0.2
      dotY += dy * 0.2
      dot.style.transform = `translate3d(${dotX - 3}px, ${dotY - 3}px, 0)`
      rafRef.current = requestAnimationFrame(animate)
    }

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (typeof window !== 'undefined' && (isTouchDevice() || prefersReducedMotion())) {
    return null
  }

  return (
    <div
      ref={dotRef}
      className="fixed w-[6px] h-[6px] bg-[var(--accent-primary)] rounded-full pointer-events-none z-[99999] will-change-transform"
      style={{ top: 0, left: 0 }}
    />
  )
}
