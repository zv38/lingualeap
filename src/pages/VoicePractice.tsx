import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Mic, Volume2, Headphones,
  BarChart3, Play, Square, CheckCircle, AlertCircle, Star, Clock
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import Tooltip from '../components/Tooltip'

type Language = 'all' | 'english' | 'japanese' | 'korean'

interface Sentence {
  id: string
  text: string
  translation: string
  pronunciation: string
  language: Exclude<Language, 'all'>
  difficulty: 'easy' | 'medium' | 'hard'
}

interface HistoryItem {
  id: string
  sentenceId: string
  text: string
  score: number
  language: Exclude<Language, 'all'>
  timestamp: number
}

const mockSentences: Sentence[] = [
  {
    id: 'vp1',
    text: 'The early bird catches the worm.',
    translation: '早起的鸟儿有虫吃',
    pronunciation: '/ði ˈɜːli bɜːd ˈkætʃɪz ðə wɜːm/',
    language: 'english',
    difficulty: 'easy',
  },
  {
    id: 'vp2',
    text: 'Could you tell me where the nearest bank is?',
    translation: '你能告诉我最近的银行在哪里吗',
    pronunciation: '/kʊd juː tel miː weər ðə ˈnɪərɪst bæŋk ɪz/',
    language: 'english',
    difficulty: 'medium',
  },
  {
    id: 'vp3',
    text: 'It\'s not whether you get knocked down, it\'s whether you get up.',
    translation: '重要的不是你被打倒，而是你能否站起来',
    pronunciation: '/ɪts nɒt ˈwɪðər juː ɡet nɒkt daʊn ɪts ˈwɪðər juː ɡet ʌp/',
    language: 'english',
    difficulty: 'hard',
  },
  {
    id: 'vp4',
    text: '趣味は読書と映画鑑賞です',
    translation: '我的爱好是读书和看电影',
    pronunciation: 'shumi wa dokusho to eiga kanshou desu',
    language: 'japanese',
    difficulty: 'easy',
  },
  {
    id: 'vp5',
    text: 'この料理はとても美味しいですね',
    translation: '这道菜非常好吃呢',
    pronunciation: 'kono ryouri wa totemo oishii desu ne',
    language: 'japanese',
    difficulty: 'medium',
  },
  {
    id: 'vp6',
    text: 'お会計をお願いします',
    translation: '请结账',
    pronunciation: 'o-kaikei o onegai shimasu',
    language: 'japanese',
    difficulty: 'easy',
  },
  {
    id: 'vp7',
    text: '오늘 날씨가 정말 좋네요',
    translation: '今天天气真好呢',
    pronunciation: 'oneul nalssiga jeongmal johneyo',
    language: 'korean',
    difficulty: 'easy',
  },
  {
    id: 'vp8',
    text: '이거 얼마예요?',
    translation: '这个多少钱？',
    pronunciation: 'igeo eolmayeyo',
    language: 'korean',
    difficulty: 'easy',
  },
]

const languageLabels: Record<Language, string> = {
  all: '全部',
  english: '英语',
  japanese: '日语',
  korean: '韩语',
}

function getScoreColor(score: number): string {
  if (score < 50) return 'var(--warning)'
  if (score <= 80) return 'var(--accent-primary)'
  return 'var(--success)'
}

function getScoreLabel(score: number): string {
  if (score < 50) return '继续加油'
  if (score <= 80) return '还不'
  return '非常棒！'
}

function getScoreIcon(score: number) {
  if (score < 50) return AlertCircle
  if (score <= 80) return CheckCircle
  return Star
}

const difficultyLabel: Record<string, string> = {
  easy: '简',
  medium: '中等',
  hard: '困难',
}

const difficultyBadgeColor: Record<string, string> = {
  easy: 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10',
  medium: 'text-[var(--accent-primary)] border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10',
  hard: 'text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10',
}

function simulateScore(): number {
  return Math.floor(Math.random() * 41) + 60
}

export default function VoicePractice() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [languageFilter, setLanguageFilter] = useState<Language>('all')
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(48).fill(0))
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const waveformIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filteredSentences = mockSentences.filter(
    (s) => languageFilter === 'all' || s.language === languageFilter
  )

  const currentSentence = filteredSentences[currentIndex] || filteredSentences[0]

  useEffect(() => {
    synthRef.current = window.speechSynthesis
    return () => {
      synthRef.current?.cancel()
      if (waveformIntervalRef.current) clearInterval(waveformIntervalRef.current)
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setScore(null)
    setShowResult(false)
    setIsRecording(false)
    setIsPlaying(false)
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current)
      waveformIntervalRef.current = null
    }
    setWaveformBars(Array(48).fill(0))
  }, [currentIndex, languageFilter])

  const playAudio = useCallback(() => {
    if (!synthRef.current || !currentSentence) return
    synthRef.current.cancel()
    const utterance = new SpeechSynthesisUtterance(currentSentence.text)
    const langMap: Record<string, string> = {
      english: 'en-US',
      japanese: 'ja-JP',
      korean: 'ko-KR',
    }
    utterance.lang = langMap[currentSentence.language] || 'en-US'
    utterance.rate = 0.8
    utterance.onstart = () => setIsPlaying(true)
    utterance.onend = () => setIsPlaying(false)
    synthRef.current.speak(utterance)
  }, [currentSentence])

  const stopAudio = useCallback(() => {
    synthRef.current?.cancel()
    setIsPlaying(false)
  }, [])

  const startRecording = useCallback(() => {
    setIsRecording(true)
    setScore(null)
    setShowResult(false)

    const animateWaveform = () => {
      setWaveformBars(
        Array.from({ length: 48 }, () => Math.floor(Math.random() * 80) + 10)
      )
    }
    animateWaveform()
    waveformIntervalRef.current = setInterval(animateWaveform, 120)

    recordingTimerRef.current = setTimeout(() => {
      stopRecording()
    }, 3000)
  }, [])

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current)
      waveformIntervalRef.current = null
    }
    setWaveformBars(Array(48).fill(0))

    const finalScore = simulateScore()
    setScore(finalScore)
    setShowResult(true)

    if (currentSentence) {
      const newItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        sentenceId: currentSentence.id,
        text: currentSentence.text,
        score: finalScore,
        language: currentSentence.language,
        timestamp: Date.now(),
      }
      setHistory((prev) => [newItem, ...prev].slice(0, 20))
    }
  }, [currentSentence])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  const goToNext = useCallback(() => {
    if (currentIndex < filteredSentences.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }, [currentIndex, filteredSentences.length])

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }, [currentIndex])

  const handleFilterChange = useCallback((lang: Language) => {
    setLanguageFilter(lang)
    setCurrentIndex(0)
  }, [])

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const ScoreIcon = score !== null ? getScoreIcon(score) : Star

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen bg-[var(--bg-primary)] px-6 py-12"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-3 mb-12">
          <Headphones className="w-8 h-8 text-[var(--accent-primary)]" />
          <h1 className="font-serif text-4xl gradient-text">语音练习</h1>
        </div>

        <div className="flex items-center justify-center gap-3 mb-10 flex-wrap">
          {(Object.keys(languageLabels) as Language[]).map((lang) => (
            <button
              key={lang}
              onClick={() => handleFilterChange(lang)}
              className={`px-5 py-2 rounded-full font-mono text-sm transition-all duration-500 ${
                languageFilter === lang
                  ? 'btn-amber'
                  : 'text-[var(--text-secondary)] border border-[var(--accent-primary)]/20 hover:border-[var(--accent-primary)]/40'
              }`}
            >
              {languageLabels[lang]}
            </button>
          ))}
        </div>

        {filteredSentences.length === 0 ? (
          <EmptyState icon={<Mic size={48} />} title="该语言暂无练习句子" description="请选择其他语言" />
        ) : (
          <>
            <div className="liquid-glass rounded-[2rem] p-10 mb-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="liquid-glass-mono px-3 py-1 rounded-full text-xs text-[var(--accent-primary)] font-mono">
                    {languageLabels[currentSentence.language]}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-mono border ${difficultyBadgeColor[currentSentence.difficulty]}`}>
                    {difficultyLabel[currentSentence.difficulty]}
                  </span>
                </div>
                <span className="text-[var(--text-muted)] text-sm font-mono">
                  {currentIndex + 1} / {filteredSentences.length}
                </span>
              </div>

              <h2 className="font-serif text-3xl text-[var(--text-primary)] mb-4 leading-relaxed">
                {currentSentence.text}
              </h2>
              <p className="text-[var(--text-secondary)] text-lg mb-2">{currentSentence.translation}</p>
              <p className="text-[var(--text-muted)] text-sm font-mono mb-8">
                {currentSentence.pronunciation}
              </p>

              <div className="flex items-center justify-center gap-4 mb-8">
                {isPlaying ? (
                  <Tooltip content="停止播放">
                    <button
                      onClick={stopAudio}
                      className="btn-ghost rounded-xl px-6 py-3 flex items-center gap-2"
                    >
                      <Square className="w-4 h-4" />
                      <span className="text-sm font-mono">停止</span>
                    </button>
                  </Tooltip>
                ) : (
                  <Tooltip content="播放原声">
                    <button
                      onClick={playAudio}
                      className="btn-ghost rounded-xl px-6 py-3 flex items-center gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span className="text-sm font-mono">播放示范</span>
                    </button>
                  </Tooltip>
                )}
              </div>

              <div className="relative flex items-center justify-center mb-6">
                {isRecording && (
                  <>
                    <motion.div
                      className="absolute w-28 h-28 rounded-full border-2 border-[var(--accent-primary)]/30"
                      animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute w-28 h-28 rounded-full border-2 border-[var(--accent-primary)]/20"
                      animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
                    />
                    <motion.div
                      className="absolute w-28 h-28 rounded-full border-2 border-[var(--accent-primary)]/10"
                      animate={{ scale: [1, 3], opacity: [0.3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
                    />
                  </>
                )}
                <Tooltip content={isRecording ? '停止录音' : '开始录音'}>
                <button
                  onClick={toggleRecording}
                  className={`rounded-full w-24 h-24 flex items-center justify-center relative z-10 transition-all duration-500 ${
                    isRecording
                      ? 'bg-[var(--warning)] shadow-[0_0_60px_rgba(0,0,0,0.4)]'
                      : 'btn-amber'
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-8 h-8 text-[var(--text-primary)]" />
                  ) : (
                    <Mic className="w-8 h-8 text-white" />
                  )}
                </button>
              </Tooltip>
              </div>

              <p className="text-center text-[var(--text-muted)] text-sm font-mono">
                {isRecording ? '录音中... 点击停止' : '点击按钮开始录音'}
              </p>
            </div>

            <AnimatePresence>
              {isRecording && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                  className="liquid-glass rounded-[2rem] p-8 mb-6 overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span className="text-[var(--text-secondary)] text-sm font-mono">波形</span>
                  </div>
                  <div className="flex items-end justify-center gap-[3px] h-24">
                    {waveformBars.map((h, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: h }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className="w-1.5 rounded-full"
                        style={{
                          background: `linear-gradient(180deg, var(--accent-primary), var(--accent-primary))`,
                          opacity: 0.4 + (h / 100) * 0.6,
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showResult && score !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.96 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                  className="liquid-glass rounded-[2rem] p-8 mb-6"
                >
                  <div className="text-center mb-6">
                    <p className="text-[var(--text-secondary)] text-sm font-mono mb-2">发音评分</p>
                    <div className="relative inline-block">
                      <p
                        className="font-serif text-6xl font-bold"
                        style={{ color: getScoreColor(score) }}
                      >
                        {score}
                      </p>
                      <span
                        className="text-lg font-mono"
                        style={{ color: getScoreColor(score) }}
                      >
                        /100
                      </span>
                    </div>
                  </div>

                  <div className="w-full liquid-glass rounded-xl h-3 mb-6 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const, delay: 0.2 }}
                      className="h-full rounded-xl"
                      style={{ background: getScoreColor(score) }}
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-2">
                    <ScoreIcon
                      className="w-5 h-5"
                      style={{ color: getScoreColor(score) }}
                    />
                    <span
                      className="font-serif text-xl"
                      style={{ color: getScoreColor(score) }}
                    >
                      {getScoreLabel(score)}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-6 mt-6 text-sm font-mono text-[var(--text-muted)]">
                    <span>{currentSentence.text.length} 字符</span>
                    <span>·</span>
                    <span>{languageLabels[currentSentence.language]}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-center gap-4 mb-12">
              <button
                onClick={goToPrev}
                disabled={currentIndex === 0}
                className="btn-ghost rounded-xl px-6 py-3 flex items-center gap-2 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 rotate-180" />
                上一句
              </button>
              <button
                onClick={goToNext}
                disabled={currentIndex === filteredSentences.length - 1}
                className="btn-amber rounded-xl px-6 py-3 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                下一句
                <Play className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        <div className="liquid-glass rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-5 h-5 text-[var(--accent-primary)]" />
            <h2 className="font-serif text-2xl gradient-text">练习记录</h2>
          </div>

          {history.length === 0 ? (
            <EmptyState icon={<Clock size={32} />} title="还没有练习记录" description="开始练习吧" />
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="liquid-glass-mono rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-[var(--text-primary)] font-serif text-sm truncate">{item.text}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[var(--text-muted)] text-xs font-mono">
                        {languageLabels[item.language]}
                      </span>
                      <span className="text-[var(--text-muted)] text-xs font-mono">
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getScoreColor(item.score) }}
                    />
                    <span
                      className="font-mono text-sm font-bold"
                      style={{ color: getScoreColor(item.score) }}
                    >
                      {item.score}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
