import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useMagazineReveal } from './useMagazineReveal'

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (value: T) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') ref(value)
      else if (ref) (ref as React.MutableRefObject<T>).current = value
    })
  }
}

function useCardGlow<T extends HTMLElement>() {
  const ref = { current: null as T | null }
  const onMouseMove = (e: React.MouseEvent<T>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    ref.current.style.setProperty('--glow-x', `${x}%`)
    ref.current.style.setProperty('--glow-y', `${y}%`)
  }
  const onMouseLeave = () => {
    if (!ref.current) return
    ref.current.style.setProperty('--glow-x', '50%')
    ref.current.style.setProperty('--glow-y', '50%')
  }
  return { ref, onMouseMove, onMouseLeave }
}

interface FeaturedCourse {
  title: string
  description: string
  progress: number
  lesson: number
  duration: string
}

interface MagazineHeroProps {
  featuredCourse?: FeaturedCourse
}

const titleLines = ['开启', '你的语言世界之旅']
const containerEase: [number, number, number, number] = [0.16, 1, 0.3, 1]

export default function MagazineHero({ featuredCourse }: MagazineHeroProps) {
  const { ref: featuredRef, visible: featuredVisible } = useMagazineReveal<HTMLDivElement>()
  const { ref: mainGlowRef, onMouseMove: onMainMove, onMouseLeave: onMainLeave } = useCardGlow<HTMLDivElement>()
  const { ref: featGlowRef, onMouseMove: onFeatMove, onMouseLeave: onFeatLeave } = useCardGlow<HTMLDivElement>()
  const course = featuredCourse || {
    title: '商务英语进阶',
    description: '24 节场景化课程，覆盖会议、邮件、谈判。已有 12,400 人完成。',
    progress: 68,
    lesson: 14,
    duration: '8 分钟',
  }

  return (
    <section className="magazine-hero">
      <div className="magazine-container magazine-grid">
        <motion.div
          ref={mergeRefs(mainGlowRef)}
          onMouseMove={onMainMove}
          onMouseLeave={onMainLeave}
          className="magazine-hero-main"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: containerEase }}
        >
          <div className="magazine-glow" aria-hidden="true" />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div>
              <motion.div
                className="magazine-hero-kicker"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1, ease: containerEase }}
              >
                沉浸式语言学习
              </motion.div>

              <h1>
                {titleLines.map((line, lineIndex) => (
                  <span key={lineIndex} className="line">
                    {line.split('').map((char, i) => (
                      <motion.span
                        key={i}
                        style={{ display: 'inline-block' }}
                        initial={{ opacity: 0, y: '110%' }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.8,
                          delay: 0.3 + (lineIndex * line.length + i) * 0.04,
                          ease: containerEase,
                        }}
                      >
                        {char === ' ' ? '\u00A0' : char}
                      </motion.span>
                    ))}
                  </span>
                ))}
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8, ease: containerEase }}
              >
                把语言学习拆成每天十五分钟的小事。记忆曲线、发音节奏、弱项反复——全部交给系统安排，你只需要打开应用开始。
              </motion.p>
            </div>

            <motion.div
              className="magazine-hero-actions"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1, ease: containerEase }}
            >
              <Link to="/auth" className="magazine-btn magazine-btn-primary">
                免费注册
              </Link>
              <Link to="/courses" className="magazine-btn magazine-btn-secondary">
                浏览全部课程
              </Link>
            </motion.div>
          </div>
        </motion.div>

        <div
          ref={mergeRefs(featuredRef, featGlowRef)}
          onMouseMove={onFeatMove}
          onMouseLeave={onFeatLeave}
          className={`magazine-hero-featured magazine-reveal ${featuredVisible ? 'visible' : ''}`}
        >
          <div className="magazine-glow" aria-hidden="true" />
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div>
              <div className="magazine-featured-label">Continue Learning</div>
              <h2>{course.title}</h2>
              <p>{course.description}</p>
            </div>
            <div>
              <div className="magazine-progress-label">
                <span>当前进度</span>
                <span>{course.progress}%</span>
              </div>
              <div className={`magazine-progress-bar ${featuredVisible ? 'animate' : ''}`}>
                <span style={{ width: featuredVisible ? `${course.progress}%` : 0 }} />
              </div>
              <div className="magazine-featured-meta">
                <span>第 {course.lesson} 课</span>
                <span>预计 {course.duration}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
