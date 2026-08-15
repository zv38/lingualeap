import { motion } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Volume2, RotateCcw, CheckCircle, Trophy } from 'lucide-react'

import Confetti from '../components/Confetti'
import Tooltip from '../components/Tooltip'

const mockExercises = [
  {
    id: 1,
    targetText: 'Hello, nice to meet you.',
    translation: '你好，很高兴认识你',
    language: 'EN',
  },
  {
    id: 2,
    targetText: 'The weather is beautiful today.',
    translation: '今天天气很好',
    language: 'EN',
  },
  {
    id: 3,
    targetText: 'I would like a cup of coffee, please.',
    translation: '请给我一杯咖啡',
    language: 'EN',
  },
  {
    id: 4,
    targetText: 'Where is the nearest subway station?',
    translation: '最近的地铁站在哪里',
    language: 'EN',
  },
]

export default function SpeakingLearn() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recognizedText, setRecognizedText] = useState('')
  const [accuracy, setAccuracy] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [pulseActive, setPulseActive] = useState(false)
  const recognitionRef = useRef<any>(null)
  const currentExercise = mockExercises[currentIndex]

  useEffect(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        setRecognizedText(transcript)
        calculateAccuracy(transcript, currentExercise.targetText)
        setIsRecording(false)
        setPulseActive(false)
      }

      recognitionRef.current.onerror = () => {
        setIsRecording(false)
        setPulseActive(false)
      }

      recognitionRef.current.onend = () => {
        setIsRecording(false)
        setPulseActive(false)
      }
    }
  }, [currentExercise])

  const calculateAccuracy = (recognized: string, target: string) => {
    const recognizedWords = recognized.toLowerCase().trim().split(/\s+/)
    const targetWords = target.toLowerCase().trim().split(/\s+/)
    let matched = 0
    targetWords.forEach((word) => {
      if (recognizedWords.includes(word)) matched++
    })
    const score = Math.round((matched / targetWords.length) * 100)
    setAccuracy(score)
    setShowResult(true)
    ;(window as any).toast('录音已提交', 'success')
    if (score >= 90) {
      setShowConfetti(true)
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      setPulseActive(false)
    } else {
      setRecognizedText('')
      setShowResult(false)
      setAccuracy(0)
      setIsRecording(true)
      setPulseActive(true)
      recognitionRef.current?.start()
    }
  }

  const handleNext = () => {
    if (currentIndex < mockExercises.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      resetExercise()
    }
  }

  const handleRetry = () => {
    resetExercise()
  }

  const resetExercise = () => {
    setRecognizedText('')
    setAccuracy(0)
    setShowResult(false)
    setIsRecording(false)
    setPulseActive(false)
    setShowConfetti(false)
  }

  const playTargetAudio = () => {
    const utterance = new SpeechSynthesisUtterance(currentExercise.targetText)
    utterance.lang = 'en-US'
    utterance.rate = 0.8
    window.speechSynthesis.speak(utterance)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen bg-[var(--bg-primary)] px-6 py-12"
    >
      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-3 mb-12">
          <Mic className="w-8 h-8 text-[var(--accent-primary)]" />
          <h1 className="font-serif text-4xl gradient-text">口语跟读</h1>
        </div>

        <div className="liquid-glass rounded-[2rem] p-10 text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="liquid-glass-mono px-3 py-1 rounded-full text-xs text-[var(--accent-primary)] font-mono">
              {currentExercise.language}
            </span>
            <span className="text-[var(--text-muted)] text-sm font-mono">
              {currentIndex + 1} / {mockExercises.length}
            </span>
          </div>

          <h2 className="font-serif text-3xl text-[var(--text-primary)] mb-4">{currentExercise.targetText}</h2>
          <p className="text-[var(--text-secondary)] text-lg mb-8">{currentExercise.translation}</p>

          <button
            onClick={playTargetAudio}
            className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors mb-8"
          >
            <Volume2 className="w-5 h-5" />
            <span className="text-sm font-mono">播放原音</span>
          </button>

          <div className="relative flex items-center justify-center mb-8">
            {pulseActive && (
              <>
                <motion.div
                  className="absolute w-24 h-24 rounded-full border-2 border-[var(--accent-primary)]/30"
                  animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute w-24 h-24 rounded-full border-2 border-[var(--accent-primary)]/20"
                  animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
                />
              </>
            )}
            <Tooltip content={isRecording ? '停止录音' : '开始录音'}>
            <button
              onClick={toggleRecording}
              className={`btn-amber rounded-full w-24 h-24 flex items-center justify-center relative z-10 ${
                pulseActive ? 'animate-pulse' : ''
              }`}
            >
              {isRecording ? (
                <MicOff className="w-10 h-10 text-white" />
              ) : (
                <Mic className="w-10 h-10 text-white" />
              )}
            </button>
          </Tooltip>
          </div>

          <p className="text-[var(--text-muted)] text-sm font-mono">
            {isRecording ? '正在录音...' : '点击按钮开始录'}
          </p>
        </div>

        {showResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass rounded-[2rem] p-8 mb-8"
          >
            <div className="text-center mb-6">
              <p className="text-[var(--text-secondary)] text-sm font-mono mb-2">识别结果</p>
              <p className="font-serif text-xl text-[var(--text-primary)]">{recognizedText || '未能识别到语'}</p>
            </div>

            <div className="text-center mb-6">
              <p className="text-[var(--text-secondary)] text-sm font-mono mb-2">准确</p>
              <p className="font-serif text-5xl gradient-text">{accuracy}%</p>
            </div>

            <div className="text-center mb-6">
              {accuracy >= 90 ? (
                <div className="flex items-center justify-center gap-2 text-[var(--success)]">
                  <Trophy className="w-5 h-5" />
                  <span className="font-serif text-lg">发音准确</span>
                </div>
              ) : accuracy >= 60 ? (
                <div className="flex items-center justify-center gap-2 text-[var(--accent-primary)]">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-serif text-lg">还不错，继续练习</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-[var(--warning)]">
                  <RotateCcw className="w-5 h-5" />
                  <span className="font-serif text-lg">再试一</span>
                </div>
              )}
            </div>

            <div className="liquid-glass rounded-xl p-4">
              <p className="text-[var(--text-secondary)] text-sm font-mono mb-3">对比</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[var(--text-muted)] text-xs font-mono mb-1">目标</p>
                  <p className="text-[var(--text-primary)] font-serif">{currentExercise.targetText}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)] text-xs font-mono mb-1">识别</p>
                  <p className={`font-serif ${accuracy >= 90 ? 'text-[var(--success)]' : accuracy >= 60 ? 'text-[var(--accent-primary)]' : 'text-[var(--warning)]'}`}>
                    {recognizedText || '---'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="flex items-center justify-center gap-4">
          <Tooltip content="重新朗读">
            <button
              onClick={handleRetry}
              className="btn-ghost rounded-xl px-6 py-3 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              重试
            </button>
          </Tooltip>
          <Tooltip content="下一题">
            <button
              onClick={handleNext}
              disabled={currentIndex === mockExercises.length - 1}
              className="btn-amber rounded-xl px-6 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              下一题
            </button>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  )
}

