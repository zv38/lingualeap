import React, { useEffect, useRef, useState, useMemo } from 'react'
import './GradualBlur.css'

const DEFAULT_CONFIG = {
  position: 'bottom',
  strength: 2,
  height: '6rem',
  divCount: 5,
  exponential: false,
  zIndex: 1000,
  animated: false as boolean | 'scroll',
  duration: '0.3s',
  easing: 'ease-out',
  opacity: 1,
  curve: 'linear',
  responsive: false,
  target: 'parent',
  className: '',
  style: {} as React.CSSProperties
}

const PRESETS = {
  top: { position: 'top' as const, height: '6rem' },
  bottom: { position: 'bottom' as const, height: '6rem' },
  left: { position: 'left' as const, height: '6rem' },
  right: { position: 'right' as const, height: '6rem' },
  subtle: { height: '4rem', strength: 1, opacity: 0.8, divCount: 3 },
  intense: { height: '10rem', strength: 4, divCount: 8, exponential: true },
  smooth: { height: '8rem', curve: 'bezier' as const, divCount: 10 },
  sharp: { height: '5rem', curve: 'linear' as const, divCount: 4 },
  header: { position: 'top' as const, height: '8rem', curve: 'ease-out' as const },
  footer: { position: 'bottom' as const, height: '8rem', curve: 'ease-out' as const },
  sidebar: { position: 'left' as const, height: '6rem', strength: 2.5 },
  'page-header': { position: 'top' as const, height: '10rem', target: 'page' as const, strength: 3 },
  'page-footer': { position: 'bottom' as const, height: '10rem', target: 'page' as const, strength: 3 }
}

const CURVE_FUNCTIONS: Record<string, (p: number) => number> = {
  linear: p => p,
  bezier: p => p * p * (3 - 2 * p),
  'ease-in': p => p * p,
  'ease-out': p => 1 - Math.pow(1 - p, 2),
  'ease-in-out': p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
}

const mergeConfigs = (...configs: Record<string, unknown>[]) =>
  configs.reduce((acc, c) => ({ ...acc, ...c }), {})

const getGradientDirection = (position: string) =>
  ({ top: 'to top', bottom: 'to bottom', left: 'to left', right: 'to right' }[position] || 'to bottom')



interface GradualBlurProps {
  preset?: keyof typeof PRESETS
  position?: 'top' | 'bottom' | 'left' | 'right'
  strength?: number
  height?: string
  divCount?: number
  exponential?: boolean
  zIndex?: number
  animated?: boolean | 'scroll'
  duration?: string
  easing?: string
  opacity?: number
  curve?: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out'
  responsive?: boolean
  target?: 'parent' | 'page'
  hoverIntensity?: number
  onAnimationComplete?: () => void
  className?: string
  style?: React.CSSProperties
  [key: string]: unknown
}

function GradualBlur(props: GradualBlurProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  const config = useMemo(() => {
    const presetConfig = props.preset && PRESETS[props.preset] ? PRESETS[props.preset] : {}
    return mergeConfigs(DEFAULT_CONFIG, presetConfig, props) as typeof DEFAULT_CONFIG & GradualBlurProps
  }, [props])

  const [isVisible, setIsVisible] = useState(config.animated !== 'scroll')

  useEffect(() => {
    if (config.animated !== 'scroll' || !containerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [config.animated])

  const blurDivs = useMemo(() => {
    const divs: React.ReactElement[] = []
    const increment = 100 / config.divCount
    const currentStrength =
      isHovered && config.hoverIntensity
        ? config.strength * config.hoverIntensity
        : config.strength

    const curveFunc = CURVE_FUNCTIONS[config.curve] || CURVE_FUNCTIONS.linear

    for (let i = 1; i <= config.divCount; i++) {
      let progress = i / config.divCount
      progress = curveFunc(progress)

      let blurValue: number
      if (config.exponential) {
        blurValue = Math.pow(2, progress * 4) * 0.0625 * currentStrength
      } else {
        blurValue = 0.0625 * (progress * config.divCount + 1) * currentStrength
      }

      const p1 = Math.round((increment * i - increment) * 10) / 10
      const p2 = Math.round(increment * i * 10) / 10
      const p3 = Math.round((increment * i + increment) * 10) / 10
      const p4 = Math.round((increment * i + increment * 2) * 10) / 10

      let gradient = `transparent ${p1}%, rgba(250, 250, 250, 0.85) ${p2}%`
      if (p3 <= 100) gradient += `, rgba(250, 250, 250, 0.85) ${p3}%`
      if (p4 <= 100) gradient += `, transparent ${p4}%`

      const direction = getGradientDirection(config.position)

      const divStyle: React.CSSProperties = {
        position: 'absolute',
        inset: '0',
        maskImage: `linear-gradient(${direction}, ${gradient})`,
        WebkitMaskImage: `linear-gradient(${direction}, ${gradient})`,
        backdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
        WebkitBackdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
        opacity: config.opacity,
        transition:
          config.animated && config.animated !== 'scroll'
            ? `backdrop-filter ${config.duration} ${config.easing}`
            : undefined
      }

      divs.push(<div key={i} style={divStyle} />)
    }

    return divs
  }, [config, isHovered])

  const containerStyle: React.CSSProperties = useMemo(() => {
    const isVertical = ['top', 'bottom'].includes(config.position)
    const isHorizontal = ['left', 'right'].includes(config.position)
    const isPageTarget = config.target === 'page'

    const baseStyle: React.CSSProperties = {
      position: isPageTarget ? ('fixed' as const) : ('absolute' as const),
      pointerEvents: config.hoverIntensity ? ('auto' as const) : ('none' as const),
      opacity: isVisible ? 1 : 0,
      transition: config.animated ? `opacity ${config.duration} ${config.easing}` : undefined,
      zIndex: isPageTarget ? config.zIndex + 100 : config.zIndex,
      ...config.style
    }

    if (isVertical) {
      baseStyle.height = config.height
      baseStyle.width = '100%'
      ;(baseStyle as Record<string, unknown>)[config.position] = 0
      baseStyle.left = 0
      baseStyle.right = 0
    } else if (isHorizontal) {
      baseStyle.width = config.height
      baseStyle.height = '100%'
      ;(baseStyle as Record<string, unknown>)[config.position] = 0
      baseStyle.top = 0
      baseStyle.bottom = 0
    }

    return baseStyle
  }, [config, isVisible])

  useEffect(() => {
    if (isVisible && config.animated === 'scroll' && config.onAnimationComplete) {
      const ms = parseFloat(config.duration) * 1000
      const t = setTimeout(() => config.onAnimationComplete!(), ms)
      return () => clearTimeout(t)
    }
  }, [isVisible, config.animated, config.onAnimationComplete, config.duration])

  return (
    <div
      ref={containerRef}
      className={`gradual-blur ${config.target === 'page' ? 'gradual-blur-page' : 'gradual-blur-parent'} ${config.className || ''}`}
      style={containerStyle}
      onMouseEnter={config.hoverIntensity ? () => setIsHovered(true) : undefined}
      onMouseLeave={config.hoverIntensity ? () => setIsHovered(false) : undefined}
    >
      <div
        className="gradual-blur-inner"
        style={{ position: 'relative', width: '100%', height: '100%' }}
      >
        {blurDivs}
      </div>
    </div>
  )
}

const GradualBlurMemo = React.memo(GradualBlur) as React.MemoExoticComponent<typeof GradualBlur> & { PRESETS: typeof PRESETS; CURVE_FUNCTIONS: typeof CURVE_FUNCTIONS }
GradualBlurMemo.displayName = 'GradualBlur'
GradualBlurMemo.PRESETS = PRESETS
GradualBlurMemo.CURVE_FUNCTIONS = CURVE_FUNCTIONS
export default GradualBlurMemo
