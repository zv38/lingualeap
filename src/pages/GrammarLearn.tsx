import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, Lightbulb, ArrowRight, RotateCcw, BookOpen } from 'lucide-react'
import { useStore } from '../store/useStore'
import Confetti from '../components/Confetti'
import Tooltip from '../components/Tooltip'
import EmptyState from '../components/EmptyState'

const categoryLabels: Record<string, string> = {
  tense: '时态',
  particle: '助词',
  conjugation: '变形',
  syntax: '句法'
}

const difficultyConfig = {
  easy: { label: '简', color: 'text-moss-400' },
  medium: { label: '中等', color: 'text-[var(--accent-primary)]' },
  hard: { label: '困难', color: 'text-rust-400' }
}

export default function GrammarLearn() {
  const { grammarExercises } = useStore()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)
  const [direction, setDirection] = useState(1)

  const currentQuestion = grammarExercises[currentIndex]
  const progress = grammarExercises.length > 0 ? ((currentIndex + 1) / grammarExercises.length) * 100 : 0

  const handleSelect = (index: number) => {
    if (submitted) return
    setSelectedOption(index)
  }

  const handleSubmit = () => {
    if (selectedOption === null) return
    setSubmitted(true)
    if (selectedOption === currentQuestion.correctAnswer) {
      setScore(score + 1)
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3000)
    }
  }

  const handleNext = () => {
    if (currentIndex < grammarExercises.length - 1) {
      setDirection(1)
      setCurrentIndex(currentIndex + 1)
      setSelectedOption(null)
      setSubmitted(false)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setDirection(-1)
      setCurrentIndex(currentIndex - 1)
      setSelectedOption(null)
      setSubmitted(false)
    }
  }

  const handleReset = () => {
    setCurrentIndex(0)
    setSelectedOption(null)
    setSubmitted(false)
    setScore(0)
  }

  if (grammarExercises.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
        className="min-h-screen pt-20 pb-12 flex items-center justify-center bg-[var(--bg-primary)]"
      >
        <EmptyState icon={<BookOpen size={48} />} title="暂无语法练习" description="该语言和级别暂时没有语法练习内容" />
      </motion.div>
    )
  }

  const isCorrect = selectedOption === currentQuestion.correctAnswer

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
      filter: 'blur(8px)'
    }),
    center: {
      x: 0,
      opacity: 1,
      filter: 'blur(0px)'
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
      filter: 'blur(8px)'
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-serif text-4xl gradient-text">
              语法练习
            </h1>
            <div className="font-serif text-2xl text-[var(--text-primary)]">
              <span className="gradient-text">{score}</span>
              <span className="text-[var(--text-muted)]"> / {grammarExercises.length}</span>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[var(--text-secondary)] font-sans">练习进度</span>
              <span className="text-[var(--accent-primary)] font-semibold font-sans">{currentIndex + 1} / {grammarExercises.length}</span>
            </div>
            <div className="h-2 bg-[var(--accent-primary)]/[0.08] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[var(--accent-primary)] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] as const }}
              />
            </div>
          </div>
        </motion.div>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
          >
            <div className="surface-glass rounded-[2rem] p-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="surface-glass px-3 py-1 rounded-full text-xs text-[var(--accent-primary)] font-mono uppercase tracking-wider">
                  {categoryLabels[currentQuestion.category] || currentQuestion.category}
                </span>
                <span className={`text-xs font-mono uppercase tracking-wider ${difficultyConfig[currentQuestion.difficulty].color}`}>
                  {difficultyConfig[currentQuestion.difficulty].label}
                </span>
              </div>

              <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-8">
                {currentQuestion.question}
              </h2>

              <div className="grid gap-3 mb-8">
                {currentQuestion.options.map((option, index) => {
                  let optionClass = 'surface-glass rounded-xl p-5 text-left font-sans text-[var(--text-primary)] transition-all duration-300 hover:bg-[var(--accent-primary)]/[0.04]'
                  
                  if (submitted) {
                    if (index === currentQuestion.correctAnswer) {
                      optionClass = 'rounded-xl p-5 text-left font-sans text-[var(--text-primary)] border border-moss-400/30 bg-moss-400/5'
                    } else if (index === selectedOption && index !== currentQuestion.correctAnswer) {
                      optionClass = 'rounded-xl p-5 text-left font-sans text-[var(--text-primary)] border border-rust-400/30 bg-rust-400/5'
                    } else {
                      optionClass = 'surface-glass rounded-xl p-5 text-left font-sans text-[var(--text-primary)] opacity-50'
                    }
                  } else if (selectedOption === index) {
                    optionClass = 'liquid-glass-selected rounded-xl p-5 text-left font-sans text-[var(--text-primary)]'
                  }

                  return (
                    <Tooltip key={index} content={option}>
                      <motion.button
                        onClick={() => handleSelect(index)}
                        className={optionClass}
                        whileHover={!submitted ? { scale: 1.01 } : {}}
                        whileTap={!submitted ? { scale: 0.99 } : {}}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-[var(--text-muted)] w-6">{String.fromCharCode(65 + index)}</span>
                            <span>{option}</span>
                            {submitted && index === currentQuestion.correctAnswer && (
                              <CheckCircle size={20} className="text-moss-400 ml-auto" />
                            )}
                            {submitted && index === selectedOption && index !== currentQuestion.correctAnswer && (
                              <XCircle size={20} className="text-rust-400 ml-auto" />
                            )}
                          </div>
                          {!submitted && selectedOption === index && (
                            <span className="w-6 h-6 rounded-full bg-[var(--accent-primary)] flex items-center justify-center flex-shrink-0 ml-3">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </motion.button>
                    </Tooltip>
                  )
                })}
              </div>

              {!submitted ? (
                <Tooltip content="检查答案">
                  <motion.button
                    onClick={handleSubmit}
                    disabled={selectedOption === null}
                    className="btn-primary rounded-full px-8 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="flex items-center gap-2">
                      提交答案
                      <ArrowRight size={18} />
                    </span>
                  </motion.button>
                </Tooltip>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
                  className="liquid-glass-moss rounded-xl p-6"
                >
                  <div className="flex items-start gap-3">
                    <Lightbulb size={20} className="text-moss-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-[var(--text-primary)] mb-1">
                        {isCorrect ? '回答正确' : '回答错误'}
                      </p>
                      <p className="text-[var(--text-secondary)] text-sm">
                        {currentQuestion.explanation}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.div
          className="flex items-center justify-between mt-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <motion.button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="btn-ghost rounded-full px-6 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="flex items-center gap-2">
              <ArrowRight size={18} className="rotate-180" />
              上一?            </span>
          </motion.button>

          <motion.button
            onClick={handleReset}
            className="text-sm text-[var(--accent-primary)] hover:text-[var(--text-primary)] flex items-center gap-2 transition-colors duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RotateCcw size={16} />
            <span className="font-sans">重新开</span>
          </motion.button>

          <motion.button
            onClick={handleNext}
            disabled={currentIndex === grammarExercises.length - 1}
            className="btn-ghost rounded-full px-6 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="flex items-center gap-2">
              下一?              <ArrowRight size={18} />
            </span>
          </motion.button>
        </motion.div>
      </div>

      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />
    </motion.div>
  )
}
