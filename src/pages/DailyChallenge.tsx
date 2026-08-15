import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Clock, Zap, Star, RotateCcw, CheckCircle, XCircle } from 'lucide-react'
import Confetti from '../components/Confetti'
import Tooltip from '../components/Tooltip'
import { generateDailyChallenge } from '../data/mockData'
import type { GrammarExercise, ListeningExercise } from '../data/mockData'

interface QuestionState {
  selectedOption: number | null
  submitted: boolean
  isCorrect: boolean
}

const TOTAL_TIME = 300

export default function DailyChallenge() {
  const [challenge] = useState(() => generateDailyChallenge())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [questions, setQuestions] = useState<QuestionState[]>(
    challenge.questions.map(() => ({ selectedOption: null, submitted: false, isCorrect: false }))
  )
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME)
  const [showResults, setShowResults] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [direction, setDirection] = useState(1)

  const currentQuestion = challenge.questions[currentIndex] as GrammarExercise | ListeningExercise
  const currentState = questions[currentIndex]
  const score = questions.filter(q => q.isCorrect).length

  useEffect(() => {
    if (showResults) return
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setShowResults(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [showResults])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleSelect = (index: number) => {
    if (currentState.submitted) return
    setQuestions(prev => prev.map((q, i) => i === currentIndex ? { ...q, selectedOption: index } : q))
  }

  const handleSubmit = () => {
    if (currentState.selectedOption === null) return
    const isCorrect = currentState.selectedOption === currentQuestion.correctAnswer
    setQuestions(prev => prev.map((q, i) => i === currentIndex ? { ...q, submitted: true, isCorrect } : q))
    if (isCorrect) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 2000)
    }
  }

  const handleNext = () => {
    if (currentIndex < challenge.questions.length - 1) {
      setDirection(1)
      setCurrentIndex(currentIndex + 1)
    } else {
      setShowResults(true)
      ;(window as any).toast('挑战已提交', 'success')
      const finalScore = questions.filter(q => q.isCorrect).length + (currentState.isCorrect ? 0 : 0)
      if (finalScore === 5) {
        setShowConfetti(true)
      }
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setDirection(-1)
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setQuestions(challenge.questions.map(() => ({ selectedOption: null, submitted: false, isCorrect: false })))
    setTimeLeft(TOTAL_TIME)
    setShowResults(false)
    setShowConfetti(false)
  }

  const getRankBadge = (score: number) => {
    if (score === 5) return { label: '完美大师', color: 'gradient-text' }
    if (score >= 4) return { label: '优秀学员', color: 'gradient-moss' }
    if (score >= 3) return { label: '合格者', color: 'text-[var(--text-secondary)]' }
    return { label: '继续努力', color: 'gradient-rust' }
  }

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
          <h1 className="font-serif text-4xl gradient-text mb-2">
            每日挑战
          </h1>
          <p className="text-[var(--text-secondary)] font-sans mb-6">
            完成5道题，测试今日学习成?          </p>

          <div className="surface-glass rounded-[2rem] p-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center">
                  <Trophy size={32} className="text-white" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl text-[var(--text-primary)]">今日挑战</h2>
                  <p className="text-[var(--text-secondary)] text-sm font-sans">{new Date().toLocaleDateString('zh-CN')}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Clock size={20} className="text-[var(--accent-primary)]" />
                  <span className={`font-mono text-lg ${timeLeft < 60 ? 'text-rust-400' : 'text-[var(--text-primary)]'}`}>
                    {formatTime(timeLeft)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Star size={20} className="text-[var(--accent-primary)]" />
                  <span className="font-serif text-xl text-[var(--text-primary)]">
                    {score}/5
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {showResults ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
              className="surface-glass rounded-[2rem] p-12 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
              >
                <Trophy size={64} className="text-[var(--accent-primary)] mx-auto mb-6" />
              </motion.div>

              <p className="font-serif text-6xl gradient-text mb-4">
                {score}/5
              </p>

              <p className={`font-serif text-2xl mb-2 ${getRankBadge(score).color}`}>
                {getRankBadge(score).label}
              </p>

              <div className="flex items-center justify-center gap-2 mb-8">
                <Zap size={20} className="text-[var(--accent-primary)]" />
                <span className="font-mono text-lg text-[var(--text-primary)]">+{score * 20} XP</span>
              </div>

              <div className="flex items-center justify-center gap-4">
                <motion.button
                  onClick={handleRestart}
                  className="btn-primary rounded-full px-8 py-3"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw size={18} />
                    再来一?                  </span>
                </motion.button>
                <motion.button
                  className="btn-ghost rounded-full px-8 py-3"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  返回首页
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="question"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <div className="surface-glass rounded-[2rem] p-8">
                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    题目 {currentIndex + 1} / {challenge.questions.length}
                  </span>
                  {currentState.submitted && (
                    <span className={`font-mono text-xs uppercase tracking-wider ${currentState.isCorrect ? 'text-moss-400' : 'text-rust-400'}`}>
                      {currentState.isCorrect ? '正确' : '错误'}
                    </span>
                  )}
                </div>

                <h2 className="font-serif text-xl text-[var(--text-primary)] mb-8">
                  {currentQuestion.question}
                </h2>

                <div className="grid gap-3 mb-8">
                  {currentQuestion.options.map((option, index) => {
                    let optionClass = 'surface-glass rounded-xl p-5 text-left font-sans text-[var(--text-primary)] transition-all duration-300 hover:bg-[var(--accent-primary)]/[0.04]'

                    if (currentState.submitted) {
                      if (index === currentQuestion.correctAnswer) {
                        optionClass = 'rounded-xl p-5 text-left font-sans text-[var(--text-primary)] border border-moss-400/30 bg-moss-400/5'
                      } else if (index === currentState.selectedOption && index !== currentQuestion.correctAnswer) {
                        optionClass = 'rounded-xl p-5 text-left font-sans text-[var(--text-primary)] border border-rust-400/30 bg-rust-400/5'
                      } else {
                        optionClass = 'surface-glass rounded-xl p-5 text-left font-sans text-[var(--text-primary)] opacity-50'
                      }
                    } else if (currentState.selectedOption === index) {
                      optionClass = 'liquid-glass-selected rounded-xl p-5 text-left font-sans text-[var(--text-primary)]'
                    }

                    return (
                      <motion.button
                        key={index}
                        onClick={() => handleSelect(index)}
                        className={optionClass}
                        whileHover={!currentState.submitted ? { scale: 1.01 } : {}}
                        whileTap={!currentState.submitted ? { scale: 0.99 } : {}}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-[var(--text-muted)] w-6">{String.fromCharCode(65 + index)}</span>
                            <span>{option}</span>
                            {currentState.submitted && index === currentQuestion.correctAnswer && (
                              <CheckCircle size={20} className="text-[var(--accent-primary)] ml-auto" />
                            )}
                            {currentState.submitted && index === currentState.selectedOption && index !== currentQuestion.correctAnswer && (
                              <XCircle size={20} className="text-[var(--text-muted)] ml-auto" />
                            )}
                          </div>
                          {!currentState.submitted && currentState.selectedOption === index && (
                            <span className="w-6 h-6 rounded-full bg-[var(--accent-primary)] flex items-center justify-center flex-shrink-0 ml-3">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </motion.button>
                    )
                  })}
                </div>

                {!currentState.submitted ? (
                  <Tooltip content="提交挑战答案">
                    <motion.button
                      onClick={handleSubmit}
                      disabled={currentState.selectedOption === null}
                      className="btn-primary rounded-full px-8 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      提交答案
                    </motion.button>
                  </Tooltip>
                ) : (
                  <motion.button
                    onClick={handleNext}
                    className="btn-primary rounded-full px-8 py-3"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {currentIndex < challenge.questions.length - 1 ? '下一题' : '查看结果'}
                  </motion.button>
                )}
              </div>

              <div className="flex items-center justify-between mt-8">
                <motion.button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="btn-ghost rounded-full px-6 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  上一?                </motion.button>

                <div className="flex gap-2">
                  {challenge.questions.map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                        i === currentIndex
                          ? 'bg-[var(--accent-primary)]'
                          : questions[i].submitted
                          ? questions[i].isCorrect
                            ? 'bg-moss-400'
                            : 'bg-rust-400'
                          : 'bg-[var(--accent-primary)]/[0.16]'
                      }`}
                    />
                  ))}
                </div>

                <motion.button
                  onClick={handleNext}
                  disabled={currentIndex === challenge.questions.length - 1 && !currentState.submitted}
                  className="btn-ghost rounded-full px-6 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  下一题                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />
    </motion.div>
  )
}
