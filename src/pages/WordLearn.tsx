import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, CheckCircle, Volume2, Headphones, RotateCcw, ChevronLeft, ChevronRight, XCircle, Clock, ArrowRight } from 'lucide-react'
import { useStore } from '../store/useStore'
import Confetti from '../components/Confetti'
import Tooltip from '../components/Tooltip'
import EmptyState from '../components/EmptyState'
import { buttonTap, cardHover, pageEnter, staggerContainer, staggerItem } from '../utils/animations'

const learnTypes = [
  { type: 'word', name: '单词记忆', icon: BookOpen },
  { type: 'grammar', name: '语法练习', icon: CheckCircle },
  { type: 'speaking', name: '口语跟读', icon: Volume2 },
  { type: 'listening', name: '听力训练', icon: Headphones },
]

const WordLearn = () => {
  const { words, currentLanguage, currentLevel, courses, updateCourseProgress, addToast, addXP } = useStore()
  const { type } = useParams<{ type: string }>()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set())
  const [showConfetti, setShowConfetti] = useState(false)
  const [direction, setDirection] = useState(1)
  const [mode, setMode] = useState<'sequential' | 'random' | 'difficulty'>('sequential')
  const [elapsed, setElapsed] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  const currentWord = words[currentIndex]
  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0
  const activeType = type || 'word'

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev()
      else if (e.key === 'ArrowRight') handleNext()
      else if (e.key === ' ') { e.preventDefault(); setIsFlipped(prev => !prev) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, isFlipped, words.length])

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setDirection(1)
      setCurrentIndex(currentIndex + 1)
      setIsFlipped(false)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setDirection(-1)
      setCurrentIndex(currentIndex - 1)
      setIsFlipped(false)
    }
  }

  useEffect(() => {
    if (!isComplete) return
    const matchedCourse = courses.find(c => c.language === currentLanguage && c.level === currentLevel)
    if (matchedCourse && matchedCourse.progress < 100) {
      updateCourseProgress(matchedCourse.id, 100)
      addToast(`恭喜完成「${matchedCourse.title}」`, 'success', 4000)
      addXP(50)
    }
  }, [isComplete, courses, currentLanguage, currentLevel, updateCourseProgress, addToast, addXP])

  const handleKnow = () => {
    const newKnown = new Set(knownWords)
    newKnown.add(currentWord.id)
    setKnownWords(newKnown)
    if (currentIndex === words.length - 1) {
      setShowConfetti(true)
      setIsComplete(true)
      setTimeout(() => setShowConfetti(false), 3000)
    }
    handleNext()
  }

  const handleDontKnow = () => {
    handleNext()
  }

  const handleReset = () => {
    setCurrentIndex(0)
    setIsFlipped(false)
    setKnownWords(new Set())
    setElapsed(0)
    setIsComplete(false)
  }

  if (words.length === 0) {
    return (
      <motion.div
        variants={pageEnter}
        initial="initial"
        animate="animate"
        className="min-h-screen pt-20 pb-12 flex items-center justify-center bg-[var(--bg-primary)]"
      >
        <EmptyState icon={<BookOpen size={48} />} title="暂无学习内容" description="该语言和级别暂时没有单词学习内容" />
      </motion.div>
    )
  }

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
      filter: 'blur(8px)',
    }),
    center: {
      x: 0,
      opacity: 1,
      filter: 'blur(0px)',
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
      filter: 'blur(8px)',
    }),
  }

  if (isComplete) {
    return (
      <motion.div
        variants={pageEnter}
        initial="initial"
        animate="animate"
        className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)] flex items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="liquid-glass rounded-[2rem] p-10 text-center max-w-lg mx-auto"
        >
          <div className="w-20 h-20 rounded-2xl bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={40} className="text-[var(--success)]" />
          </div>
          <h2 className="font-serif text-2xl gradient-text mb-4">学习完成！</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{knownWords.size}</p>
              <p className="text-xs text-[var(--text-muted)]">已掌握</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{formatTime(elapsed)}</p>
              <p className="text-xs text-[var(--text-muted)]">用时</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{Math.round((knownWords.size / words.length) * 100)}%</p>
              <p className="text-xs text-[var(--text-muted)]">掌握率</p>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <motion.button onClick={handleReset} className="btn-ghost rounded-full px-8 py-3 text-sm font-medium inline-flex items-center gap-2" {...buttonTap}>
              <RotateCcw size={16} />
              重新学习
            </motion.button>
            <Link to="/courses" className="btn-amber rounded-full px-8 py-3 text-sm font-medium inline-flex items-center gap-2">
              继续学习 <ArrowRight size={16} />
            </Link>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={pageEnter}
      initial="initial"
      animate="animate"
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)] relative"
    >
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-serif text-4xl gradient-text">
              学习空间
            </h1>
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono">
              <Clock size={12} />
              {formatTime(elapsed)}
            </span>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap gap-2 mb-6"
          >
            {learnTypes.map((item) => {
              const Icon = item.icon
              const isActive = activeType === item.type
              return (
                <motion.div
                  key={item.type}
                  variants={staggerItem}
                  {...buttonTap}
                >
                  <Link
                    to={`/learn/${item.type}`}
                    className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl transition-all duration-300 ${
                      isActive ? 'glass-highlight' : 'glass-thin'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-white' : 'text-[var(--accent-primary)]'} />
                    <span className={`font-semibold ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                      {item.name}
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex gap-2 mb-6"
          >
            {[
              { value: 'sequential', label: '顺序学习' },
              { value: 'random', label: '随机模式' },
              { value: 'difficulty', label: '按难度' },
            ].map((m) => (
              <Tooltip key={m.value} content={`${m.label}模式`}>
                <motion.button
                  variants={staggerItem}
                  {...buttonTap}
                  onClick={() => setMode(m.value as any)}
                  className={`px-4 py-2 rounded-full text-xs font-sans transition-all ${
                    mode === m.value ? 'bg-[var(--accent-primary)] text-white' : 'bg-black/[0.04] text-[var(--text-secondary)]'
                  }`}
                >
                  {m.label}
                </motion.button>
              </Tooltip>
            ))}
          </motion.div>

          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[var(--text-secondary)] font-sans">学习进度</span>
              <span className="text-[var(--accent-primary)] font-semibold font-sans">{currentIndex + 1} / {words.length}</span>
            </div>
            <div className="h-2 glass-progress rounded-full overflow-hidden">
              <motion.div
                className="h-full glass-progress-fill rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] as const }}
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <Tooltip content="上一个单词">
            <motion.button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-16 liquid-glass rounded-full p-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-300 z-10"
              {...buttonTap}
            >
              <ChevronLeft size={24} className="text-[var(--text-primary)]" />
            </motion.button>
          </Tooltip>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
              className={`flip-card cursor-pointer mx-12 md:mx-0 ${isFlipped ? 'flipped' : ''}`}
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div className="flip-card-inner relative h-80 md:h-96">
                <div className="flip-card-front absolute inset-0 glass-card rounded-[2rem] flex flex-col items-center justify-center p-8">
                  <span className="font-mono text-xs text-[var(--accent-primary)]/50 mb-2 tracking-wider uppercase">
                    {currentWord.pronunciation}
                  </span>
                  <h2 className="font-serif text-5xl md:text-6xl gradient-text mb-4">
                    {currentWord.term}
                  </h2>
                  <p className="text-[var(--text-muted)] text-sm text-center font-sans">点击翻转或按 Space 键</p>
                  <Tooltip content="点击播放发音" position="top">
                    <motion.button
                      onClick={(e) => { e.stopPropagation() }}
                      className="mt-6 liquid-glass-mono rounded-full p-4 text-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors duration-300"
                      {...buttonTap}
                    >
                      <Volume2 size={24} />
                    </motion.button>
                  </Tooltip>
                </div>

                <div className="flip-card-back absolute inset-0 glass-card rounded-[2rem] flex flex-col items-center justify-center p-8">
                  <h3 className="font-serif text-2xl text-[var(--text-primary)] mb-4">
                    {currentWord.definition}
                  </h3>
                  <div className="liquid-glass rounded-xl p-5 mb-4 w-full max-w-md">
                    <p className="text-[var(--text-secondary)] text-center italic font-sans">"{currentWord.example}"</p>
                  </div>
                  <p className="text-[var(--text-muted)] text-sm font-sans">点击卡片返回</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <Tooltip content="下一个单词">
            <motion.button
              onClick={handleNext}
              disabled={currentIndex === words.length - 1}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-16 liquid-glass rounded-full p-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-300 z-10"
              {...buttonTap}
            >
              <ChevronRight size={24} className="text-[var(--text-primary)]" />
            </motion.button>
          </Tooltip>
        </motion.div>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <Tooltip content="还不认识，需要复习" position="bottom">
            <motion.button
              onClick={handleDontKnow}
              className="flex items-center space-x-2 px-8 py-4 rounded-full liquid-glass border-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning)]/10 transition-all duration-300"
              {...buttonTap}
            >
              <XCircle size={24} />
              <span className="font-semibold font-sans">还需复习</span>
            </motion.button>
          </Tooltip>

          <Tooltip content="我认识这个单词" position="bottom">
            <motion.button
              onClick={handleKnow}
              className="flex items-center space-x-2 px-8 py-4 rounded-full btn-amber"
              {...buttonTap}
            >
              <CheckCircle size={24} />
              <span className="font-semibold font-sans">已掌握</span>
            </motion.button>
          </Tooltip>
        </motion.div>

        <motion.div
          className="mt-10 glass-panel rounded-[2rem] p-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-serif text-lg gradient-text">今日学习统计</h3>
            <motion.button
              onClick={handleReset}
              className="text-sm text-[var(--accent-primary)] hover:text-[var(--text-primary)] flex items-center space-x-1 transition-colors duration-300"
              {...buttonTap}
            >
              <RotateCcw size={16} />
              <span className="font-sans">重新开始</span>
            </motion.button>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <motion.div
              className="liquid-glass rounded-xl p-4"
              {...cardHover}
            >
              <p className="font-serif text-4xl gradient-text">{knownWords.size}</p>
              <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-2">已掌握</p>
            </motion.div>
            <motion.div
              className="liquid-glass rounded-xl p-4"
              {...cardHover}
            >
              <p className="font-serif text-4xl gradient-text">{currentIndex + 1 - knownWords.size}</p>
              <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-2">学习中</p>
            </motion.div>
            <motion.div
              className="liquid-glass rounded-xl p-4"
              {...cardHover}
            >
              <p className="font-serif text-4xl gradient-text">{words.length - currentIndex - 1}</p>
              <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-2">未开始</p>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />
    </motion.div>
  )
}

export default WordLearn
