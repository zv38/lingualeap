import { useRef, useEffect, useState } from 'react'

interface UseAnimatedInViewOptions {
  threshold?: number
  margin?: string
  once?: boolean
}

export function useAnimatedInView(options: UseAnimatedInViewOptions = {}) {
  const { threshold = 0.1, margin = '0px', once = true } = options
  const ref = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setIsInView(false)
        }
      },
      { threshold, rootMargin: margin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, margin, once])

  return { ref, isInView }
}