import { useEffect, useRef, useCallback } from 'react'

export function useGSAPTimeline(_deps: any[] = []) {
  const timelineRef = useRef<any>(null)

  const getTimeline = useCallback(() => {
    if (!timelineRef.current && typeof window !== 'undefined') {
      const gsap = (window as any).gsap
      if (gsap) {
        timelineRef.current = gsap.timeline({ paused: true })
      }
    }
    return timelineRef.current
  }, [])

  useEffect(() => {
    return () => {
      if (timelineRef.current) {
        try {
          timelineRef.current.kill()
        } catch {}
        timelineRef.current = null
      }
    }
  }, [])

  return { getTimeline, timeline: timelineRef.current }
}