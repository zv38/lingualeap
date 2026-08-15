import { useEffect, useRef, useState } from 'react'

export function useMagazineReveal<T extends HTMLElement>(threshold = 0.15, rootMargin = '0px 0px -60px 0px') {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return { ref, visible }
}

export function useCountUp(target: number, duration = 1300, start = 0, enabled = true) {
  const [value, setValue] = useState(start)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const startTime = performance.now()

    const update = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 4)
      setValue(Math.round(start + (target - start) * ease))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(update)
      }
    }

    rafRef.current = requestAnimationFrame(update)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, start, enabled])

  return value
}
