import { useSpring, useTransform, useMotionValue } from 'framer-motion'
import { useEffect } from 'react'

interface UseSpringNumberOptions {
  stiffness?: number
  damping?: number
  decimals?: number
  prefix?: string
  suffix?: string
}

export function useSpringNumber(target: number, options: UseSpringNumberOptions = {}) {
  const {
    stiffness = 80,
    damping = 20,
    decimals = 0,
    prefix = '',
    suffix = '',
  } = options

  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { stiffness, damping })
  const display = useTransform(spring, (v) => {
    const formatted = v.toFixed(decimals)
    return `${prefix}${formatted}${suffix}`
  })

  useEffect(() => {
    motionValue.set(target)
  }, [target, motionValue])

  return { display, spring }
}