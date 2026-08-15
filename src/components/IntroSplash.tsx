import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useReducedMotion } from '../utils/useReducedMotion'

const STORAGE_KEY = 'lingualeap_intro_seen'

interface IntroSplashProps {
  onFinished: () => void
}

export function shouldShowIntro(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) !== '1'
}

export function markIntroSeen(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, '1')
}

export default function IntroSplash({ onFinished }: IntroSplashProps) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter')

  const totalEnterDuration = reduced ? 0.25 : 1.2
  const holdDuration = reduced ? 0.1 : 0.7
  const exitDuration = reduced ? 0.15 : 0.5

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase('hold'), totalEnterDuration * 1000)
    const exitTimer = setTimeout(() => setPhase('exit'), (totalEnterDuration + holdDuration) * 1000)
    const finishTimer = setTimeout(() => {
      markIntroSeen()
      onFinished()
    }, (totalEnterDuration + holdDuration + exitDuration) * 1000)

    return () => {
      clearTimeout(holdTimer)
      clearTimeout(exitTimer)
      clearTimeout(finishTimer)
    }
  }, [onFinished, totalEnterDuration, holdDuration, exitDuration])

  const handleSkip = () => {
    if (phase === 'exit') return
    setPhase('exit')
    setTimeout(() => {
      markIntroSeen()
      onFinished()
    }, exitDuration * 1000)
  }

  return (
    <AnimatePresence>
      <motion.div
        key="intro"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-primary)]"
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === 'exit' ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: exitDuration, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 背景微光 */}
        {!reduced && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 50% 45%, rgba(0, 0, 0, 0.06) 0%, transparent 60%)',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: phase === 'exit' ? 0 : 1, scale: 1 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        <div className="relative flex flex-col items-center gap-6">
          {/* Logo + 圆环 */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            {/* 绘制圆环 */}
            {!reduced && (
              <motion.svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 96 96"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: phase === 'exit' ? 0 : 1, rotate: -90 }}
                transition={{ duration: 0.4 }}
              >
                <motion.circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="var(--accent-indigo)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.35 }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                />
              </motion.svg>
            )}

            {/* Logo 方块 */}
            <motion.div
              className="relative w-20 h-20 rounded-[22px] flex items-center justify-center bg-[var(--accent-indigo)] text-white shadow-[0_12px_40px_rgba(0,0,0,0.24)]"
              initial={{ opacity: 0, scale: reduced ? 0.9 : 0.5, rotate: reduced ? 0 : -45 }}
              animate={{
                opacity: phase === 'exit' ? 0 : 1,
                scale: phase === 'exit' ? 0.95 : 1,
                rotate: 0,
              }}
              transition={{ duration: reduced ? 0.2 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              <Zap size={36} strokeWidth={2.2} />
            </motion.div>

            {/* 呼吸环 */}
            {!reduced && (
              <motion.div
                className="pointer-events-none absolute -inset-6 rounded-full border border-[var(--accent-indigo)]/20 animate-breathe-ring"
                initial={{ opacity: 0 }}
                animate={{ opacity: phase === 'exit' ? 0 : 1 }}
                transition={{ delay: 1, duration: 0.4 }}
              />
            )}
          </div>

          {/* 品牌名 */}
          <div className="flex flex-col items-center gap-2">
            <motion.h1
              className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text-primary)]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: phase === 'exit' ? 0 : 1, y: 0 }}
              transition={{ duration: reduced ? 0.2 : 0.6, delay: reduced ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              LinguaLeap
            </motion.h1>
            <motion.p
              className="text-sm text-[var(--text-secondary)]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: phase === 'exit' ? 0 : 1, y: 0 }}
              transition={{ duration: reduced ? 0.2 : 0.5, delay: reduced ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              让语言学习更高效
            </motion.p>
          </div>
        </div>

        {/* 跳过按钮 */}
        <motion.button
          onClick={handleSkip}
          className="absolute bottom-8 right-8 px-4 py-2 rounded-[var(--radius-lg)] text-xs font-medium text-[var(--text-muted)] border border-[var(--border-primary)] bg-[var(--bg-card)]/80 backdrop-blur-sm hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'exit' ? 0 : 1 }}
          transition={{ delay: reduced ? 0 : 0.8, duration: 0.3 }}
        >
          跳过
        </motion.button>
      </motion.div>
    </AnimatePresence>
  )
}
