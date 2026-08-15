import { useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useRef, useCallback } from 'react'

export function useMouseGlow() {
  const ref = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  // 缓存 bounding rect，仅在 resize/scroll 时刷新
  const rectRef = useRef<DOMRect | null>(null)
  // 节流：rAF 合并 mousemove 事件
  const pendingRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)

  const springX = useSpring(mouseX, { stiffness: 150, damping: 15 })
  const springY = useSpring(mouseY, { stiffness: 150, damping: 15 })

  const refreshRect = useCallback(() => {
    if (ref.current) rectRef.current = ref.current.getBoundingClientRect()
  }, [])

  const flush = useCallback(() => {
    rafRef.current = 0
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    const rect = rectRef.current
    if (!rect) return
    mouseX.set(p.x - rect.left)
    mouseY.set(p.y - rect.top)
  }, [mouseX, mouseY])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    pendingRef.current = { x: e.clientX, y: e.clientY }
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flush)
    }
  }, [flush])

  const handleMouseLeave = useCallback(() => {
    mouseX.set(-9999)
    mouseY.set(-9999)
  }, [mouseX, mouseY])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    refreshRect()
    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('mouseleave', handleMouseLeave)
    // 仅在窗口尺寸变化时刷新 rect（mousemove 期间假设元素不移动）
    window.addEventListener('resize', refreshRect, { passive: true })
    window.addEventListener('scroll', refreshRect, { passive: true })
    return () => {
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('resize', refreshRect)
      window.removeEventListener('scroll', refreshRect)
    }
  }, [handleMouseMove, handleMouseLeave, refreshRect])

  return { ref, x: springX, y: springY, rawX: mouseX, rawY: mouseY }
}
