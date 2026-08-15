import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMagazineReveal } from './useMagazineReveal'
import { useTiltShine } from './useTiltShine'
import { playCourseSelectSound } from '../../utils/sound'

export interface MagazineCourseCardProps {
  to?: string
  size: 'lg' | 'md' | 'sm'
  accent?: boolean
  icon: ReactNode
  tag: string
  title: string
  description: string
  lessons?: string
  progress?: number
  meta?: string
  children?: ReactNode
  stagger?: 1 | 2 | 3
  style?: React.CSSProperties
  enableTilt?: boolean
}

export default function MagazineCourseCard({
  to = '/courses',
  size,
  accent = false,
  icon,
  tag,
  title,
  description,
  lessons,
  progress,
  meta,
  children,
  stagger,
  style,
  enableTilt = true,
}: MagazineCourseCardProps) {
  const { ref: revealRef, visible } = useMagazineReveal<HTMLDivElement>()
  const { ref: tiltRef, style: tiltStyle, shineStyle, onMouseMove, onMouseLeave } = useTiltShine(5)

  const sizeClass = size === 'lg' ? 'magazine-course-lg' : size === 'md' ? 'magazine-course-md' : 'magazine-course-sm'
  const staggerClass = stagger ? `stagger-${stagger}` : ''
  const accentClass = accent ? 'accent' : ''

  const setRefs = (el: HTMLDivElement | null) => {
    ;(revealRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    ;(tiltRef as React.MutableRefObject<HTMLDivElement | null>).current = el
  }

  const handleMouseEnter = () => {
    try {
      playCourseSelectSound()
    } catch {}
  }

  const content = (
    <div
      ref={setRefs}
      onMouseMove={enableTilt ? onMouseMove : undefined}
      onMouseLeave={enableTilt ? onMouseLeave : undefined}
      onMouseEnter={handleMouseEnter}
      className={`magazine-card ${sizeClass} ${accentClass} magazine-reveal ${staggerClass} ${visible ? 'visible' : ''}`}
      style={{
        ...style,
        ...(enableTilt ? tiltStyle : {}),
      }}
    >
      <div
        className="magazine-card-shine"
        style={{
          ...shineStyle,
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.35s',
          zIndex: 2,
          borderRadius: 'inherit',
        }}
        aria-hidden="true"
      />
      <div className={size === 'lg' ? 'flex flex-col justify-between h-full' : ''} style={{ position: 'relative', zIndex: 1 }}>
        <div>
          <div className="magazine-course-icon">{icon}</div>
          <div className="magazine-course-tag">{tag}</div>
          <h3 className="magazine-course-title">{title}</h3>
          <p className="magazine-course-desc">{description}</p>
        </div>

        {(progress !== undefined || children) && (
          <div className={size === 'lg' ? 'mt-auto' : ''}>
            {(lessons || meta) && (
              <div className="magazine-course-meta">
                <span>{lessons}</span>
                <span>{meta}</span>
              </div>
            )}
            {progress !== undefined && (
              <div className={`magazine-bar ${visible ? 'animate' : ''}`} style={{ '--w': `${progress}%` } as React.CSSProperties}>
                <span style={{ width: visible ? `${progress}%` : 0 }} />
              </div>
            )}
            {children}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <Link to={to} className="contents">
      {content}
    </Link>
  )
}
