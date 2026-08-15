import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, RotateCcw, Clock, ChevronLeft, ChevronRight, Menu, Volume2, VolumeX, Info } from 'lucide-react'
import { useStore } from '../store/useStore'
import { generateSRSReview, generateWords } from '../data/mockData'
import type { SRSWord } from '../data/mockData'
import Tooltip from '../components/Tooltip'
import Confetti from '../components/Confetti'

const boxColors = [
  { bg: 'bg-[var(--accent-primary)]/[0.08]', text: 'text-[var(--accent-primary)]', dot: 'bg-[var(--accent-primary)]', label: '新单' },
  { bg: 'bg-[var(--accent-primary)]/[0.1]', text: 'text-[var(--accent-primary)]', dot: 'bg-[var(--accent-primary)]', label: '学习' },
  { bg: 'bg-[var(--accent-primary)]/[0.12]', text: 'text-[var(--accent-primary)]', dot: 'bg-[var(--accent-primary)]', label: '巩固' },
  { bg: 'bg-[var(--accent-primary)]/[0.14]', text: 'text-[var(--accent-primary)]', dot: 'bg-[var(--accent-primary)]', label: '熟练' },
  { bg: 'bg-[var(--success)]/[0.08]', text: 'text-[var(--success)]', dot: 'bg-[var(--success)]', label: '掌握' },
]

const spring = { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 }

export default function SRSReview() {
  const [words, setWords] = useState<SRSWord[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [direction, setDirection] = useState(1)
  const [showConfetti, setShowConfetti] = useState(false)
  const [scoredCards, setScoredCards] = useState(0)
  const [reviewComplete, setReviewComplete] = useState(false)
  const [showAllBoxes, setShowAllBoxes] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [streak, setStreak] = useState(0)
  const [startTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const { addXP, addNotification, addToast } = useStore()

  useEffect(() => {
    const localWords = generateSRSReview()
    const generated = generateWords(20)
    setWords(localWords.length > 0 ? localWords : generated.map((w, i) => ({
      ...w,
      box: (i % 5) as SRSWord['box'],
      nextReview: new Date(Date.now() + i * 86400000).toISOString(),
      reviewCount: Math.floor(i / 3),
      ease: 2.5,
      interval: 1,
    })))
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [startTime])

  const currentWord = words[currentIndex]
  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0

  const currentBoxConfig = boxColors[currentWord?.box || 0]

  const handleSwipe = useCallback((delta: number) => {
    if (delta > 50) {
      if (currentIndex > 0) {
        setDirection(-1)
        setCurrentIndex(prev => prev - 1)
        setIsFlipped(false)
      }
    } else if (delta < -50) {
      if (currentIndex < words.length - 1) {
        setDirection(1)
        setCurrentIndex(prev => prev + 1)
        setIsFlipped(false)
      }
    }
  }, [currentIndex, words.length])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    const delta = touchStartX.current - touchEndX.current
    handleSwipe(delta)
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      setDirection(-1)
      setCurrentIndex(prev => prev - 1)
      setIsFlipped(false)
    } else if (e.key === 'ArrowRight' && currentIndex < words.length - 1) {
      setDirection(1)
      setCurrentIndex(prev => prev + 1)
      setIsFlipped(false)
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setIsFlipped(prev => !prev)
    } else if (e.key === '1') {
      handleScore(1)
    } else if (e.key === '2') {
      handleScore(2)
    } else if (e.key === '3') {
      handleScore(3)
    } else if (e.key === '4') {
      handleScore(4)
    }
  }, [currentIndex, words.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const speak = (text: string, lang: string = 'en-US') => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      utterance.rate = 0.9
      utterance.pitch = 1
      setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleScore = (score: 1 | 2 | 3 | 4) => {
    if (!currentWord) return

    const updatedWords = [...words]
    const word = updatedWords[currentIndex]

    if (score >= 3) {
      word.box = Math.min(word.box + 1, 4) as SRSWord['box']
      word.interval = word.box === 0 ? 1 : word.box === 1 ? 3 : word.box === 2 ? 7 : word.box === 3 ? 14 : 30
      word.ease = Math.min(word.ease + 0.15, 3.0)
      setStreak(prev => prev + 1)
      if (streak + 1 >= 5) {
        addToast('连续答对 5 题！太棒了！', 'success', 3000)
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 2000)
      }
    } else {
      word.box = Math.max(word.box - 1, 0) as SRSWord['box']
      word.interval = 1
      word.ease = Math.max(word.ease - 0.2, 1.3)
      setStreak(0)
    }

    word.reviewCount += 1
    word.nextReview = new Date(Date.now() + word.interval * 86400000).toISOString()
    setWords(updatedWords)
    setScoredCards(prev => prev + 1)

    if (score >= 3) {
      addXP(10)
    }

    setIsFlipped(false)

    setTimeout(() => {
      if (currentIndex < words.length - 1) {
        setDirection(1)
        setCurrentIndex(prev => prev + 1)
      } else {
        setReviewComplete(true)
        const timeSpent = Math.floor((Date.now() - startTime) / 1000)
        const mins = Math.floor(timeSpent / 60)
        const secs = timeSpent % 60
        addNotification({
          type: 'system',
          title: '复习完成',
          message: `本次复习完成 ${words.length} 张卡片，用时 ${mins}分${secs}秒`,
          time: '刚刚',
          read: false,
        })
        addToast('复习完成！继续保持！', 'success', 4000)
      }
    }, 300)
  }

  const restartReview = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5).map(w => ({ ...w, box: 0 as SRSWord['box'], reviewCount: 0 }))
    setWords(shuffled)
    setCurrentIndex(0)
    setIsFlipped(false)
    setScoredCards(0)
    setReviewComplete(false)
    setStreak(0)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (reviewComplete) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen pt-20 pb-12 flex items-center justify-center bg-[var(--bg-primary)]"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 22, mass: 0.8 }}
          className="max-w-md w-full surface-glass rounded-[2rem] p-12 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25, delay: 0.2 }}
          >
            <Brain className="w-20 h-20 text-[var(--accent-primary)] mx-auto mb-6" />
          </motion.div>
          <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-2">复习完成！</h2>
          <p className="text-[var(--text-secondary)] mb-3">本次复习梳理了 {scoredCards} 张卡片</p>
          <p className="text-xs text-[var(--text-muted)] mb-8 flex items-center justify-center gap-2">
            <Clock size={12} />
            用时 {formatTime(elapsedTime)}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={restartReview}
              className="btn-primary rounded-full px-6 py-3 flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              再来一轮
            </button>
            <button className="btn-ghost rounded-full px-6 py-3">
              返回首页
            </button>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  if (!currentWord) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-2xl mx-auto px-4">
        <motion.div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-4xl gradient-text">间隔复</h1>
              <Tooltip content="基于遗忘曲线优化复习节奏">
                <Info size={16} className="text-[var(--text-muted)] cursor-help" />
              </Tooltip>
            </div>
            <Tooltip content="切换视图">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="btn-ghost rounded-full p-2">
                <Menu size={20} className="text-[var(--text-secondary)]" />
              </button>
            </Tooltip>
          </div>

          <div className="flex items-center justify-between text-sm mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-secondary)]">
                第 <span className="text-[var(--accent-primary)] font-semibold font-mono">{currentIndex + 1}</span> / {words.length} 张
              </span>
              <span className="text-[var(--text-muted)]">
                <Clock size={14} className="inline mr-1" />
                {formatTime(elapsedTime)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {streak >= 3 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-xs px-2 py-1 rounded-full bg-[var(--success)]/[0.1] text-[var(--success)] font-mono"
                >
                  🔥 {streak}
                </motion.span>
              )}
              <span className={currentBoxConfig.text}>{currentBoxConfig.label}</span>
            </div>
          </div>

          <div className="h-2 bg-[var(--accent-primary)]/[0.08] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[var(--accent-primary)] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            />
          </div>
        </motion.div>

        <div
          className="relative"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={{
                enter: (dir: number) => ({
                  x: dir > 0 ? 100 : -100,
                  opacity: 0,
                  rotateY: dir > 0 ? 15 : -15,
                }),
                center: {
                  x: 0,
                  opacity: 1,
                  rotateY: 0,
                },
                exit: (dir: number) => ({
                  x: dir > 0 ? -100 : 100,
                  opacity: 0,
                  rotateY: dir > 0 ? -15 : 15,
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 280, damping: 26, mass: 0.8 }}
              className="perspective-1000"
            >
              <div
                className="relative cursor-pointer"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <AnimatePresence mode="wait">
                  {!isFlipped ? (
                    <motion.div
                      key="front"
                      initial={{ opacity: 0, rotateY: 90 }}
                      animate={{ opacity: 1, rotateY: 0 }}
                      exit={{ opacity: 0, rotateY: -90 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
                      className="surface-glass rounded-[2rem] p-12 text-center"
                      style={{ minHeight: '360px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
                    >
                      <div className={`${currentBoxConfig.bg} px-4 py-1.5 rounded-full text-xs ${currentBoxConfig.text} font-mono mb-6`}>
                        {currentBoxConfig.label}
                      </div>

                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="font-serif text-4xl text-[var(--text-primary)]">
                          {currentWord.term}
                        </h2>
                        <motion.button
                          onClick={(e) => { e.stopPropagation(); speak(currentWord.term, currentWord.language || 'en-US') }}
                          className={`p-2 rounded-full transition-all ${
                            isSpeaking ? 'bg-[var(--accent-primary)]/[0.12] text-[var(--accent-primary)]' : 'hover:bg-[var(--accent-primary)]/[0.08] text-[var(--text-secondary)]'
                          }`}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          {isSpeaking ? <Volume2 size={20} /> : <VolumeX size={20} />}
                        </motion.button>
                      </div>

                      <p className="text-lg text-[var(--text-secondary)] font-mono mb-2">
                        {currentWord.pronunciation || '/.../'}
                      </p>

                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-sm text-[var(--text-muted)]"
                      >
                        点击翻转查看释义
                      </motion.p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="back"
                      initial={{ opacity: 0, rotateY: 90 }}
                      animate={{ opacity: 1, rotateY: 0 }}
                      exit={{ opacity: 0, rotateY: -90 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
                      className="surface-glass rounded-[2rem] p-12"
                      style={{ minHeight: '360px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                    >
                      <div className="text-center mb-8">
                        <p className="text-sm text-[var(--text-muted)] mb-2 font-mono">{currentWord.term}</p>
                        <h3 className="font-serif text-3xl text-[var(--text-primary)] mb-3">
                          {currentWord.definition}
                        </h3>
                        <p className="text-[var(--text-secondary)] leading-relaxed">
                          {currentWord.example}
                        </p>
                      </div>

                      <div className="space-y-3 mt-4">
                        <p className="text-xs text-[var(--text-muted)] text-center mb-3 font-mono">你的记忆程度是？</p>
                        <div className="grid grid-cols-4 gap-3">
                          {[
                            { score: 1 as const, label: '忘记', sub: '完全没印象', color: 'bg-black/5 text-[var(--text-muted)] hover:bg-black/10' },
                            { score: 2 as const, label: '模糊', sub: '不确定', color: 'bg-black/10 text-[var(--text-secondary)] hover:bg-black/20' },
                            { score: 3 as const, label: '正确', sub: '有点印象', color: 'bg-black/15 text-[var(--text-primary)] hover:bg-black/25' },
                            { score: 4 as const, label: '轻松', sub: '完全掌握', color: 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-secondary)]' },
                          ].map((item) => (
                            <motion.button
                              key={item.score}
                              onClick={(e) => { e.stopPropagation(); handleScore(item.score) }}
                              className={`py-3 px-2 rounded-xl text-center transition-all ${item.color}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              transition={spring}
                            >
                              <div className="font-semibold text-sm">{item.label}</div>
                              <div className="text-[10px] opacity-70 mt-0.5">{item.sub}</div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between mt-6">
          <Tooltip content="上一张 (←)">
            <motion.button
              onClick={() => { if (currentIndex > 0) { setDirection(-1); setCurrentIndex(prev => prev - 1); setIsFlipped(false) } }}
              disabled={currentIndex === 0}
              className="btn-ghost rounded-full px-5 py-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              <ChevronLeft size={20} />
            </motion.button>
          </Tooltip>

          <Tooltip content="翻转卡片 (空格)">
            <motion.button
              onClick={() => setIsFlipped(!isFlipped)}
              className="btn-primary rounded-full px-6 py-2.5 flex items-center gap-2"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              <RotateCcw size={16} />
              {isFlipped ? '返回' : '翻转'}
            </motion.button>
          </Tooltip>

          <Tooltip content="下一张 (→)">
            <motion.button
              onClick={() => { if (currentIndex < words.length - 1) { setDirection(1); setCurrentIndex(prev => prev + 1); setIsFlipped(false) } }}
              disabled={currentIndex === words.length - 1}
              className="btn-ghost rounded-full px-5 py-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              <ChevronRight size={20} />
            </motion.button>
          </Tooltip>
        </div>

        <div className="flex items-center justify-center mt-4 gap-2">
          {words.slice(0, 10).map((_, i) => (
            <motion.div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? 'w-4 bg-[var(--accent-primary)]'
                  : i < currentIndex
                  ? 'w-1.5 bg-[var(--accent-primary)]/[0.4]'
                  : 'w-1.5 bg-[var(--accent-primary)]/[0.12]'
              }`}
              animate={i === currentIndex ? { scale: [1, 1.2, 1] } : {}}
              transition={{ repeat: i === currentIndex ? Infinity : 0, duration: 2 }}
            />
          ))}
        </div>

        {showAllBoxes && (
          <div className="mt-8 space-y-2">
            <p className="text-xs text-[var(--text-muted)] font-mono mb-3">卡片分</p>
            <div className="grid grid-cols-5 gap-2">
              {boxColors.map((box, i) => {
                const count = words.filter(w => w.box === i).length
                return (
                  <div key={i} className={`${box.bg} rounded-xl p-3 text-center`}>
                    <div className={`${box.dot} w-2 h-2 rounded-full mx-auto mb-1`} />
                    <p className={`text-xs font-mono ${box.text}`}>{box.label}</p>
                    <p className={`font-mono text-sm ${box.text}`}>{count}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-4 justify-center">
          <button
            onClick={() => setShowAllBoxes(!showAllBoxes)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
          >
            {showAllBoxes ? '隐藏分布' : '查看分布'}
          </button>
          <button
            onClick={restartReview}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
          >
            重新开始
          </button>
        </div>
      </div>

      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />
    </motion.div>
  )
}

