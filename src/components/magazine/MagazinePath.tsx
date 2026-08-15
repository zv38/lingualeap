import type { ReactNode } from 'react'
import { useMagazineReveal } from './useMagazineReveal'

interface Step {
  icon: ReactNode
  title: string
  description: string
}

interface MagazinePathProps {
  title?: string
  steps?: Step[]
}

const defaultSteps: Step[] = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
    title: '设定目标',
    description: '选择语言与学习场景，生成专属路径。',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    ),
    title: '每日练习',
    description: '15 分钟任务包：词汇、听力、口语轮换进行。',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <path d="M12 19v4" />
      </svg>
    ),
    title: '即时反馈',
    description: '纠正发音，标记薄弱点，动态调整难度。',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </svg>
    ),
    title: '阶段成就',
    description: '解锁证书与等级徽章，看见每一步成长。',
  },
]

export default function MagazinePath({ title = '你的学习仪式', steps = defaultSteps }: MagazinePathProps) {
  const { ref, visible } = useMagazineReveal<HTMLDivElement>()

  return (
    <section className="magazine-section" id="path">
      <div className="magazine-container magazine-grid">
        <div ref={ref} className={`magazine-path magazine-reveal ${visible ? 'visible' : ''}`}>
          <h2>{title}</h2>
          <div className="magazine-steps-wrap">
            <div className={`magazine-path-line ${visible ? 'animate' : ''}`} />
            <div className="magazine-steps">
              {steps.map((step) => (
                <div key={step.title} className="magazine-step">
                  <div className="magazine-step-icon">{step.icon}</div>
                  <h4>{step.title}</h4>
                  <p>{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
