import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, BookOpen, Trophy, Target, MessageCircle, Sparkles } from 'lucide-react'

const spring = { type: 'spring' as const, stiffness: 200, damping: 26 }
const springBouncy = { type: 'spring' as const, stiffness: 300, damping: 14 }

const steps = [
  {
    title: '欢迎来到 LinguaLeap',
    description: '您的智能语言学习伙伴。通过 AI 驱动的个性化课程、实时反馈和沉浸式练习，轻松掌握新语言。',
    icon: Sparkles,
    accent: '#1A1A1A',
  },
  {
    title: '个性化学习路径',
    description: '根据您的水平和目标，AI 会为您定制专属学习计划。从词汇到语法，从阅读到口语，循序渐进。',
    icon: Target,
    accent: '#1A1A1A',
  },
  {
    title: '互动练习与挑战',
    description: '每日挑战、对战模式、学习小组 — 让学习不再孤单。与全球学习者一起进步。',
    icon: Trophy,
    accent: '#1A1A1A',
  },
  {
    title: 'AI 智能助手',
    description: '遇到问题随时呼出 AI 助手，获取即时翻译、语法解释和发音指导。7x24 小时陪伴您的学习之旅。',
    icon: MessageCircle,
    accent: '#1A1A1A',
  },
  {
    title: '开启您的学习之旅',
    description: '我们已经准备好了。设定目标，选择语言，开始您的第一课吧。每一小步，都是通往流利的里程碑。',
    icon: BookOpen,
    accent: '#1A1A1A',
  },
]

const ONBOARDING_KEY = 'lingualeap-onboarding-done'

function DotProgress({ current, total, onDotClick }: { current: number; total: number; onDotClick: (i: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.button
          key={i}
          onClick={() => onDotClick(i)}
          className="relative rounded-full"
          animate={{
            width: i === current ? 28 : 6,
            height: 6,
          }}
          transition={spring}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: '#000',
              opacity: i === current ? 1 : i < current ? 0.2 : 0.08,
            }}
          />
        </motion.button>
      ))}
    </div>
  )
}

export default function OnboardingTutorial() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY)
    if (!done) {
      const timer = setTimeout(() => setShowButton(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleComplete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setIsOpen(false)
    setShowButton(false)
  }, [])

  const handleSkip = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setIsOpen(false)
    setShowButton(false)
  }, [])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      handleComplete()
    }
  }, [currentStep, handleComplete])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) setCurrentStep(s => s - 1)
  }, [])

  const goToStep = useCallback((i: number) => {
    setCurrentStep(i)
  }, [])

  const step = steps[currentStep]
  const Icon = step.icon
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  return (
    <>
      {showButton && !isOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-24 z-[9999] w-12 h-12 rounded-full bg-[var(--accent-primary)] text-white shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
        >
          <Sparkles className="w-5 h-5" />
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24, mass: 0.9 }}
              className="w-full max-w-lg bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-black/[0.04]"
            >
              <div className="relative p-8">
                <motion.button
                  onClick={() => setIsOpen(false)}
                  className="absolute top-5 right-5 w-8 h-8 rounded-full bg-black/[0.03] flex items-center justify-center hover:bg-black/[0.06] transition-colors"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                >
                  <X className="w-3.5 h-3.5 text-black/40" />
                </motion.button>

                <div className="flex flex-col items-center text-center pt-4">
                  <motion.div
                    key={currentStep}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                    className="w-16 h-16 rounded-full bg-black/[0.03] flex items-center justify-center mb-6"
                  >
                    <Icon className="w-7 h-7 text-[var(--accent-primary)]" />
                  </motion.div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <h2 className="text-xl font-semibold text-black mb-3">{step.title}</h2>
                      <p className="text-sm leading-relaxed text-black/50 max-w-sm">{step.description}</p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                <motion.div
                  layout
                  className="flex items-center justify-between pt-8"
                  transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                >
                  <motion.button
                    onClick={handlePrev}
                    disabled={isFirstStep}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-black/[0.04] backdrop-blur-sm border border-black/[0.06]"
                    style={{
                      color: isFirstStep ? '#a1a1aa' : 'var(--text-secondary)',
                      cursor: isFirstStep ? 'not-allowed' : 'pointer',
                    }}
                    whileHover={!isFirstStep ? { scale: 1.02 } : {}}
                    whileTap={!isFirstStep ? { scale: 0.97 } : {}}
                    transition={spring}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一步
                  </motion.button>

                  <DotProgress
                    current={currentStep}
                    total={steps.length}
                    onDotClick={goToStep}
                  />

                  <div className="flex items-center gap-2">
                    {isLastStep ? (
                      <motion.button
                        onClick={handleComplete}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-black"
                        whileHover={{ scale: 1.03, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
                        whileTap={{ scale: 0.97 }}
                        transition={springBouncy}
                      >
                        完成
                      </motion.button>
                    ) : (
                      <>
                        <motion.button
                          onClick={handleNext}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-black/[0.06] backdrop-blur-sm border border-black/[0.06]"
                          style={{ color: 'var(--text-primary)' }}
                          whileHover={{ scale: 1.02, background: 'rgba(0,0,0,0.1)' }}
                          whileTap={{ scale: 0.97 }}
                          transition={spring}
                        >
                          下一步
                          <ChevronRight className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          onClick={handleSkip}
                          className="px-3 py-2.5 rounded-xl text-sm font-medium bg-black/[0.03] backdrop-blur-sm border border-black/[0.06]"
                          style={{ color: 'var(--text-muted)' }}
                          whileHover={{ scale: 1.02, color: 'var(--text-secondary)' }}
                          whileTap={{ scale: 0.97 }}
                          transition={spring}
                        >
                          跳过
                        </motion.button>
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}