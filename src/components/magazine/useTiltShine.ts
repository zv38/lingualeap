import { useState, useCallback, useRef } from 'react'

interface TiltShineState {
  rotateX: number
  rotateY: number
  scale: number
  shineX: number
  shineY: number
  isHovered: boolean
}

export function useTiltShine(maxTilt = 3) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<TiltShineState>({
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    shineX: 50,
    shineY: 50,
    isHovered: false,
  })

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const rotateX = (0.5 - y) * maxTilt
    const rotateY = (x - 0.5) * maxTilt
    setState({
      rotateX,
      rotateY,
      scale: 1.015,
      shineX: x * 100,
      shineY: y * 100,
      isHovered: true,
    })
  }, [maxTilt])

  const onMouseLeave = useCallback(() => {
    setState({
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      shineX: 50,
      shineY: 50,
      isHovered: false,
    })
  }, [])

  const style = {
    transform: `perspective(1200px) rotateX(${state.rotateX}deg) rotateY(${state.rotateY}deg) scale3d(${state.scale}, ${state.scale}, ${state.scale})`,
    transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
  }

  const shineStyle = {
    background: `radial-gradient(circle at ${state.shineX}% ${state.shineY}%, rgba(255,255,255,0.12), transparent 45%)`,
    opacity: state.isHovered ? 1 : 0,
  }

  return { ref, style, shineStyle, onMouseMove, onMouseLeave, isHovered: state.isHovered }
}
