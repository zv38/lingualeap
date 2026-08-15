import { motion } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import { Play, Pause, RotateCcw, Volume2, CheckCircle, XCircle, Headphones } from 'lucide-react'
import Confetti from '../components/Confetti'
import Tooltip from '../components/Tooltip'

const mockAudioData = [
  {
    id: 1,
    title: '日常对话',
    audioUrl: '',
    transcript: 'Hello, how are you doing today? I hope you are having a wonderful day.',
    question: 'What is the speaker asking about?',
    options: [
      'The weather',
      'How someone is feeling',
      'The time',
      'A location',
    ],
    correctAnswer: 1,
    explanation: 'The speaker says "how are you doing today" which is asking about someone\'s well-being or feelings.',
  },
  {
    id: 2,
    title: '购物场景',
    audioUrl: '',
    transcript: 'I would like to buy a new pair of shoes. Do you have these in size 42?',
    question: 'What does the speaker want to purchase?',
    options: [
      'A shirt',
      'A hat',
      'Shoes',
      'A bag',
    ],
    correctAnswer: 2,
    explanation: 'The speaker explicitly says "I would like to buy a new pair of shoes."',
  },
  {
    id: 3,
    title: '问路指引',
    audioUrl: '',
    transcript: 'Turn left at the traffic lights, then walk straight for about 200 meters.',
    question: 'Which direction should you turn first?',
    options: [
      'Right',
      'Left',
      'Straight',
      'Back',
    ],
    correctAnswer: 1,
    explanation: 'The speaker says "Turn left at the traffic lights" as the first direction.',
  },
]

export default function ListeningLearn() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [showTranscript, setShowTranscript] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [score, setScore] = useState(0)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set())
  const [showConfetti, setShowConfetti] = useState(false)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentQuestion = mockAudioData[currentIndex]

  useEffect(() => {
    if (isPlaying) {
      progressInterval.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false)
            return 0
          }
          return prev + 0.5
        })
      }, 100)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
  }, [isPlaying])

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = (x / rect.width) * 100
    setProgress(percentage)
  }

  const handleAnswerSelect = (index: number) => {
    if (showResult) return
    setSelectedAnswer(index)
    setShowResult(true)
    if (!answeredQuestions.has(currentIndex)) {
      setAnsweredQuestions((prev) => new Set([...prev, currentIndex]))
      if (index === currentQuestion.correctAnswer) {
        setScore((prev) => prev + 1)
      }
    }
    ;(window as any).toast(index === currentQuestion.correctAnswer ? '回答正确！' : '回答错误', index === currentQuestion.correctAnswer ? 'success' : 'error')
  }

  const handleNext = () => {
    if (currentIndex < mockAudioData.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setProgress(0)
      setIsPlaying(false)
      setShowTranscript(false)
    } else if (score === mockAudioData.length && !showConfetti) {
      setShowConfetti(true)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setProgress(0)
      setIsPlaying(false)
      setShowTranscript(false)
    }
  }

  const handleReset = () => {
    setProgress(0)
    setIsPlaying(false)
  }

  const getOptionStyle = (index: number) => {
    if (!showResult) {
      if (selectedAnswer === index) return 'liquid-glass-mono'
      return 'liquid-glass hover:bg-[var(--accent-primary)]/5'
    }
    if (index === currentQuestion.correctAnswer) {
      return 'border-moss-400/30 bg-moss-400/5'
    }
    if (selectedAnswer === index && index !== currentQuestion.correctAnswer) {
      return 'border-rust-400/30 bg-rust-400/5'
    }
    return 'liquid-glass opacity-50'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen bg-[var(--bg-primary)] px-6 py-12"
    >
      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Headphones className="w-8 h-8 text-[var(--accent-primary)]" />
            <h1 className="font-serif text-4xl gradient-text">听力训练</h1>
          </div>
          <div className="liquid-glass rounded-2xl px-6 py-3">
            <span className="text-[var(--text-secondary)] text-sm font-mono">得分 </span>
            <span className="font-serif text-2xl text-[var(--text-primary)]">{score}</span>
            <span className="text-[var(--text-muted)] text-sm font-mono"> / {mockAudioData.length}</span>
          </div>
        </div>

        <div className="liquid-glass rounded-[2rem] p-8 mb-6">
          <div className="flex items-center justify-center mb-8">
            <Tooltip content={isPlaying ? '暂停音频' : '播放音频'}>
            <button
              onClick={togglePlay}
              className="btn-amber rounded-full w-20 h-20 flex items-center justify-center"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white" />
              ) : (
                <Play className="w-8 h-8 text-white ml-1" />
              )}
            </button>
          </Tooltip>
          </div>

          <div
            className="h-2 bg-[var(--accent-primary)]/10 rounded-full overflow-hidden cursor-pointer mb-4"
            onClick={handleProgressClick}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-[var(--text-secondary)]" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-24 h-1 bg-[var(--accent-primary)]/10 rounded-full appearance-none cursor-pointer accent-[var(--accent-primary)]"
              />
            </div>
            <Tooltip content="重新播放">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-sm font-mono">重置</span>
            </button>
          </Tooltip>
          </div>

          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="btn-ghost rounded-xl px-4 py-2 text-sm"
          >
            {showTranscript ? '隐藏原文' : '显示原文'}
          </button>

          {showTranscript && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 liquid-glass rounded-xl"
            >
              <p className="text-[var(--text-primary)] font-serif text-lg leading-relaxed">{currentQuestion.transcript}</p>
            </motion.div>
          )}
        </div>

        <div className="liquid-glass rounded-[2rem] p-8">
          <div className="mb-2">
            <span className="text-[var(--text-secondary)] text-xs font-mono uppercase tracking-wider">问题 {currentIndex + 1} / {mockAudioData.length}</span>
          </div>
          <h2 className="font-serif text-xl text-[var(--text-primary)] mb-6">{currentQuestion.question}</h2>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(index)}
                className={`${getOptionStyle(index)} rounded-xl p-4 text-left transition-all duration-300 border`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-[var(--text-secondary)]">{String.fromCharCode(65 + index)}.</span>
                  <span className="text-[var(--text-primary)]">{option}</span>
                  {showResult && index === currentQuestion.correctAnswer && (
                    <CheckCircle className="w-5 h-5 text-[var(--success)] ml-auto" />
                  )}
                  {showResult && selectedAnswer === index && index !== currentQuestion.correctAnswer && (
                    <XCircle className="w-5 h-5 text-[var(--warning)] ml-auto" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="liquid-glass rounded-xl p-4 mb-6"
            >
              <p className="text-[var(--text-secondary)] text-sm font-mono mb-1">解析</p>
              <p className="text-[var(--text-primary)]">{currentQuestion.explanation}</p>
            </motion.div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="btn-ghost rounded-xl px-6 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              上一?            </button>
            <button
              onClick={handleNext}
              className="btn-amber rounded-xl px-6 py-3"
            >
              {currentIndex === mockAudioData.length - 1 ? '完成' : '下一'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
