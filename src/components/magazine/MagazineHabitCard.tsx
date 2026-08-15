import { Link } from 'react-router-dom'
import { useMagazineReveal } from './useMagazineReveal'
import { useTiltShine } from './useTiltShine'
import { playHomePageHoverSound } from '../../utils/sound'
import { Clock } from 'lucide-react'

interface MagazineHabitCardProps {
  days?: { label: string; status: 'done' | 'current' | 'pending' }[]
}

const defaultDays = [
  { label: '一', status: 'done' as const },
  { label: '二', status: 'done' as const },
  { label: '三', status: 'done' as const },
  { label: '四', status: 'current' as const },
  { label: '五', status: 'pending' as const },
  { label: '六', status: 'pending' as const },
  { label: '日', status: 'pending' as const },
]

export default function MagazineHabitCard({ days = defaultDays }: MagazineHabitCardProps) {
  const { ref: revealRef, visible } = useMagazineReveal<HTMLDivElement>()
  const { ref: tiltRef, style: tiltStyle, shineStyle, onMouseMove, onMouseLeave } = useTiltShine(5)

  const setRefs = (el: HTMLDivElement | null) => {
    ;(revealRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    ;(tiltRef as React.MutableRefObject<HTMLDivElement | null>).current = el
  }

  return (
    <Link to="/daily" className="contents">
      <div
        ref={setRefs}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseEnter={() => { try { playHomePageHoverSound() } catch {} }}
        className={`magazine-card magazine-course-lg magazine-reveal ${visible ? 'visible' : ''}`}
        style={{ gridColumn: '1 / 7', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 300, ...tiltStyle }}
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
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <div className="magazine-course-icon">
              <Clock size={22} strokeWidth={1.6} />
            </div>
            <div className="magazine-course-tag">学习习惯</div>
            <h3 className="magazine-course-title">每日 15 分钟</h3>
            <p className="magazine-course-desc">
              不需要一整晚，也不需要死记硬背。每天一小段，系统帮你把语言变成日常习惯。
            </p>
          </div>
          <div className="magazine-habit-tracker" style={{ marginTop: 'auto', paddingTop: 24 }}>
            {days.map((day) => (
              <span key={day.label} className={`day ${day.status}`}>
                {day.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  )
}
