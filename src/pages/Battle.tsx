import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, Users, Clock, Trophy, Zap, CheckCircle, XCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import Confetti from '../components/Confetti'
import UserAvatar from '../components/UserAvatar'
import Tooltip from '../components/Tooltip'
import { mockGrammarExercises } from '../data/mockData'

type BattlePhase = 'lobby' | 'waiting' | 'battle' | 'results'
type BattleTab = 'create' | 'join'

interface Player {
  id: string
  name: string
  avatar?: string
  score: number
}

const languages = [
  { value: 'english', label: '英语' },
  { value: 'japanese', label: '日语' },
  { value: 'korean', label: '韩语' }
]

const difficulties = [
  { value: 'easy', label: '简' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' }
]

const questionCounts = [3, 5, 10]

function generateRoomCode() {
  return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
}

export default function Battle() {
  const { user } = useStore()
  const [activeTab, setActiveTab] = useState<BattleTab>('create')
  const [phase, setPhase] = useState<BattlePhase>('lobby')
  const [roomCode, setRoomCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('english')
  const [selectedDifficulty, setSelectedDifficulty] = useState('medium')
  const [selectedCount, setSelectedCount] = useState(5)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [timer, setTimer] = useState(15)
  const [player1, setPlayer1] = useState<Player>({
    id: 'p1',
    name: user?.username || '玩家1',
    avatar: user?.avatar,
    score: 0
  })
  const [player2, setPlayer2] = useState<Player>({
    id: 'p2',
    name: '对手',
    score: 0
  })
  const [showConfetti, setShowConfetti] = useState(false)
  const [winner, setWinner] = useState<Player | null>(null)

  const questions = mockGrammarExercises.slice(0, selectedCount)
  const currentQuestion = questions[currentQuestionIndex]

  useEffect(() => {
    if (phase !== 'battle') return
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          handleTimeUp()
          return 15
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, currentQuestionIndex])

  useEffect(() => {
    if (phase === 'waiting') {
      const timeout = setTimeout(() => {
        setPlayer2(prev => ({ ...prev, name: '挑战者' + Math.floor(Math.random() * 100) }))
        setPhase('battle')
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [phase])

  const handleCreateRoom = () => {
    const code = generateRoomCode()
    setRoomCode(code)
    setPhase('waiting')
    ;(window as any).toast('对战已开始，加油！', 'info')
  }

  const handleJoinRoom = () => {
    if (inputCode.length !== 6) return
    setRoomCode(inputCode)
    setPhase('waiting')
  }

  const handleTimeUp = () => {
    if (!submitted) {
      setSubmitted(true)
    }
  }

  const handleSelectOption = (index: number) => {
    if (submitted) return
    setSelectedOption(index)
  }

  const handleSubmit = () => {
    if (selectedOption === null) return
    setSubmitted(true)
    const isCorrect = selectedOption === currentQuestion.correctAnswer
    if (isCorrect) {
      const bonus = timer > 10 ? 15 : timer > 5 ? 10 : 5
      setPlayer1(prev => ({ ...prev, score: prev.score + bonus }))
    }
    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1)
        setSelectedOption(null)
        setSubmitted(false)
        setTimer(15)
      } else {
        finishBattle()
      }
    }, 2000)
  }

  const finishBattle = () => {
    const p1Score = player1.score + (selectedOption === currentQuestion?.correctAnswer ? (timer > 10 ? 15 : timer > 5 ? 10 : 5) : 0)
    const finalP1 = { ...player1, score: p1Score }
    const finalP2 = { ...player2, score: player2.score + Math.floor(Math.random() * 30) + 10 }
    setPlayer1(finalP1)
    setPlayer2(finalP2)
    if (finalP1.score > finalP2.score) {
      setWinner(finalP1)
      setShowConfetti(true)
    } else if (finalP2.score > finalP1.score) {
      setWinner(finalP2)
    }
    setPhase('results')
  }

  const handleRestart = () => {
    setPhase('lobby')
    setCurrentQuestionIndex(0)
    setSelectedOption(null)
    setSubmitted(false)
    setTimer(15)
    setPlayer1(prev => ({ ...prev, score: 0 }))
    setPlayer2(prev => ({ ...prev, score: 0 }))
    setWinner(null)
    setShowConfetti(false)
  }

  const getScoreBarWidth = (score: number) => {
    const maxScore = questions.length * 15
    return Math.min((score / maxScore) * 100, 100)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h1 className="font-serif text-4xl gradient-text mb-6">
            学习对战
          </h1>
        </motion.div>

        <AnimatePresence mode="wait">
          {phase === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <div className="flex gap-2 mb-8">
                <motion.button
                  onClick={() => setActiveTab('create')}
                  className={`px-6 py-3 rounded-full font-sans transition-all duration-300 ${
                    activeTab === 'create' ? 'btn-amber' : 'liquid-glass text-[var(--text-secondary)]'
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="flex items-center gap-2">
                    <Swords size={18} />
                    创建房间
                  </span>
                </motion.button>
                <motion.button
                  onClick={() => setActiveTab('join')}
                  className={`px-6 py-3 rounded-full font-sans transition-all duration-300 ${
                    activeTab === 'join' ? 'btn-amber' : 'liquid-glass text-[var(--text-secondary)]'
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="flex items-center gap-2">
                    <Users size={18} />
                    加入房间
                  </span>
                </motion.button>
              </div>

              {activeTab === 'create' ? (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                  className="liquid-glass rounded-[2rem] p-8 max-w-2xl"
                >
                  <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-6">创建对战房间</h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm text-[var(--text-secondary)] font-sans mb-2">选择语言</label>
                      <div className="flex gap-3">
                        {languages.map(lang => (
                          <motion.button
                            key={lang.value}
                            onClick={() => setSelectedLanguage(lang.value)}
                            className={`px-5 py-2.5 rounded-xl font-sans transition-all duration-300 ${
                              selectedLanguage === lang.value ? 'liquid-glass-mono text-[var(--accent-primary)]' : 'liquid-glass text-[var(--text-secondary)]'
                            }`}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {lang.label}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-[var(--text-secondary)] font-sans mb-2">难度设置</label>
                      <div className="flex gap-3">
                        {difficulties.map(diff => (
                          <motion.button
                            key={diff.value}
                            onClick={() => setSelectedDifficulty(diff.value)}
                            className={`px-5 py-2.5 rounded-xl font-sans transition-all duration-300 ${
                              selectedDifficulty === diff.value ? 'liquid-glass-mono text-[var(--accent-primary)]' : 'liquid-glass text-[var(--text-secondary)]'
                            }`}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {diff.label}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-[var(--text-secondary)] font-sans mb-2">题目数量</label>
                      <div className="flex gap-3">
                        {questionCounts.map(count => (
                          <motion.button
                            key={count}
                            onClick={() => setSelectedCount(count)}
                            className={`px-5 py-2.5 rounded-xl font-sans transition-all duration-300 ${
                              selectedCount === count ? 'liquid-glass-mono text-[var(--accent-primary)]' : 'liquid-glass text-[var(--text-secondary)]'
                            }`}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {count}?                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <Tooltip content="开始对战">
                    <motion.button
                      onClick={handleCreateRoom}
                      className="btn-amber rounded-full px-8 py-3 mt-4"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="flex items-center gap-2">
                        <Swords size={18} />
                        创建对战
                      </span>
                    </motion.button>
                  </Tooltip>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                  className="liquid-glass rounded-[2rem] p-8 max-w-2xl"
                >
                  <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-6">加入对战房间</h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm text-[var(--text-secondary)] font-sans mb-2">房间代码</label>
                      <input
                        type="text"
                        value={inputCode}
                        onChange={e => setInputCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        placeholder="输入6位房间代"
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--accent-primary)]/[0.06] rounded-xl px-5 py-4 text-[var(--text-primary)] font-mono text-lg placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]/30 transition-colors duration-300"
                      />
                    </div>

                    <motion.button
                      onClick={handleJoinRoom}
                      disabled={inputCode.length !== 6}
                      className="btn-amber rounded-full px-8 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="flex items-center gap-2">
                        <Users size={18} />
                        加入对战
                      </span>
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {phase === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
              className="liquid-glass-mono rounded-[2rem] p-12 text-center max-w-2xl mx-auto"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Users size={48} className="text-[var(--accent-primary)] mx-auto mb-6" />
              </motion.div>

              <h2 className="font-serif text-3xl text-[var(--text-primary)] mb-4">等待对手...</h2>
              <p className="text-[var(--text-secondary)] font-sans mb-8">分享房间代码给好友，一起对战学</p>

              <div className="liquid-glass p-4 rounded-xl inline-block">
                <p className="font-mono text-2xl text-[var(--accent-primary)] tracking-wider">{roomCode}</p>
              </div>

              <div className="mt-8 flex justify-center">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'battle' && currentQuestion && (
            <motion.div
              key="battle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <motion.div
                  className="liquid-glass rounded-[2rem] p-6"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <UserAvatar username={player1.name} size={48} src={player1.avatar} />
                    <div>
                      <p className="font-sans text-[var(--text-primary)] font-semibold">{player1.name}</p>
                      <p className="font-mono text-xs text-[var(--text-muted)]"></p>
                    </div>
                  </div>
                  <div className="h-2 bg-[var(--accent-primary)]/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-full"
                      animate={{ width: `${getScoreBarWidth(player1.score)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="font-mono text-lg text-[var(--accent-primary)] mt-2">{player1.score} </p>
                </motion.div>

                <motion.div
                  className="flex items-center justify-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <div className="text-center">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={20} className="text-[var(--accent-primary)]" />
                      <span className={`font-mono text-2xl ${timer < 5 ? 'text-rust-400' : 'text-[var(--text-primary)]'}`}>
                        {timer}s
                      </span>
                    </div>
                    <p className="font-mono text-xs text-[var(--text-muted)]">
                      {currentQuestionIndex + 1} / {questions.length}
                    </p>
                  </div>
                </motion.div>

                <Tooltip content={`${player2.name}的实力`}>
                <motion.div
                  className="liquid-glass rounded-[2rem] p-6"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <UserAvatar username={player2.name} size={48} src={player2.avatar} />
                    <div>
                      <p className="font-sans text-[var(--text-primary)] font-semibold">{player2.name}</p>
                      <p className="font-mono text-xs text-[var(--text-muted)]">对手</p>
                    </div>
                  </div>
                  <div className="h-2 bg-[var(--accent-primary)]/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[var(--accent-navy)] to-[var(--accent-navy)] rounded-full"
                      animate={{ width: `${getScoreBarWidth(player2.score)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="font-mono text-lg text-dusk-400 mt-2">{player2.score} </p>
                </motion.div>
              </Tooltip>
              </div>

              <motion.div
                className="liquid-glass rounded-[2rem] p-8 max-w-3xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <h2 className="font-serif text-xl text-[var(--text-primary)] mb-8">
                  {currentQuestion.question}
                </h2>

                <div className="grid gap-3 mb-8">
                  {currentQuestion.options.map((option, index) => {
                    let optionClass = 'liquid-glass rounded-xl p-5 text-left font-sans text-[var(--text-primary)] transition-all duration-300 hover:bg-[var(--accent-primary)]/5'

                    if (submitted) {
                      if (index === currentQuestion.correctAnswer) {
                        optionClass = 'rounded-xl p-5 text-left font-sans text-[var(--text-primary)] border border-moss-400/30 bg-moss-400/5'
                      } else if (index === selectedOption && index !== currentQuestion.correctAnswer) {
                        optionClass = 'rounded-xl p-5 text-left font-sans text-[var(--text-primary)] border border-rust-400/30 bg-rust-400/5'
                      } else {
                        optionClass = 'liquid-glass rounded-xl p-5 text-left font-sans text-[var(--text-primary)] opacity-50'
                      }
                    } else if (selectedOption === index) {
                      optionClass = 'liquid-glass-selected rounded-xl p-5 text-left font-sans text-[var(--text-primary)]'
                    }

                    return (
                      <motion.button
                        key={index}
                        onClick={() => handleSelectOption(index)}
                        className={optionClass}
                        whileHover={!submitted ? { scale: 1.01 } : {}}
                        whileTap={!submitted ? { scale: 0.99 } : {}}
                        disabled={submitted}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-[var(--text-muted)] w-6">{String.fromCharCode(65 + index)}</span>
                            <span>{option}</span>
                            {submitted && index === currentQuestion.correctAnswer && (
                              <CheckCircle size={20} className="text-[var(--accent-primary)] ml-auto" />
                            )}
                            {submitted && index === selectedOption && index !== currentQuestion.correctAnswer && (
                              <XCircle size={20} className="text-[var(--text-muted)] ml-auto" />
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
                    )
                  })}
                </div>

                {!submitted ? (
                  <motion.button
                    onClick={handleSubmit}
                    disabled={selectedOption === null}
                    className="btn-amber rounded-full px-8 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="flex items-center gap-2">
                      <Zap size={18} />
                      提交答案
                    </span>
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center"
                  >
                    <p className={`font-serif text-lg ${selectedOption === currentQuestion.correctAnswer ? 'text-moss-400' : 'text-rust-400'}`}>
                      {selectedOption === currentQuestion.correctAnswer ? '回答正确！速度加分' : '回答错误'}
                    </p>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}

          {phase === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
              className="liquid-glass-mono rounded-[2rem] p-12 text-center max-w-2xl mx-auto"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
              >
                <Trophy size={64} className="text-[var(--accent-primary)] mx-auto mb-6" />
              </motion.div>

              <h2 className="font-serif text-3xl text-[var(--text-primary)] mb-8">对战结束</h2>

              <div className="grid grid-cols-2 gap-6 mb-8">
                <motion.div
                  className={`liquid-glass rounded-[2rem] p-6 ${winner?.id === player1.id ? 'border border-[var(--accent-primary)]/30' : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <UserAvatar username={player1.name} size={64} src={player1.avatar} className="mx-auto mb-4" />
                  <p className="font-sans text-[var(--text-primary)] font-semibold mb-2">{player1.name}</p>
                  <p className="font-serif text-4xl gradient-text">{player1.score}</p>
                  {winner?.id === player1.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.5, type: 'spring' }}
                      className="mt-2"
                    >
                      <span className="inline-block px-3 py-1 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-xs font-mono">胜利</span>
                    </motion.div>
                  )}
                </motion.div>

                <motion.div
                  className={`liquid-glass rounded-[2rem] p-6 ${winner?.id === player2.id ? 'border border-[var(--accent-primary)]/30' : ''}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <UserAvatar username={player2.name} size={64} src={player2.avatar} className="mx-auto mb-4" />
                  <p className="font-sans text-[var(--text-primary)] font-semibold mb-2">{player2.name}</p>
                  <p className="font-serif text-4xl gradient-text">{player2.score}</p>
                  {winner?.id === player2.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.5, type: 'spring' }}
                      className="mt-2"
                    >
                      <span className="inline-block px-3 py-1 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-xs font-mono">胜利</span>
                    </motion.div>
                  )}
                </motion.div>
              </div>

              <motion.button
                onClick={handleRestart}
                className="btn-amber rounded-full px-8 py-3"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <span className="flex items-center gap-2">
                  <Swords size={18} />
                  再来一局
                </span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />
    </motion.div>
  )
}

