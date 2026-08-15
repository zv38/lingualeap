import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Target, Zap, Trophy, RotateCcw } from 'lucide-react'

import Confetti from '../components/Confetti'

interface Question {
  word: string
  options: string[]
  correct: number
}

const questions: Question[] = [
  { word: 'Serendipity', options: ['意外发现珍奇事物的能力', '悲伤的情绪', '严肃的举动', '连续的事件'], correct: 0 },
  { word: 'Ephemeral', options: ['永恒', '短暂', '重要', '复杂'], correct: 1 },
  { word: 'Ubiquitous', options: ['稀少的', '昂贵', '无处不在', '古老的'], correct: 2 },
  { word: 'Pragmatic', options: ['浪漫', '务实', '悲观', '乐观'], correct: 1 },
  { word: 'Eloquent', options: ['笨拙', '沉默', '雄辩', '疲倦的'], correct: 2 },
  { word: 'Meticulous', options: ['粗心', '一丝不苟的', '快速的', '简单的'], correct: 1 },
  { word: 'Resilient', options: ['脆弱', '有弹性的', '固执', '懒惰'], correct: 1 },
  { word: 'Nostalgia', options: ['怀旧', '', '恐惧', '兴奋'], correct: 0 },
  { word: 'Ambiguous', options: ['清晰', '模棱两可', '重要', '紧急的'], correct: 1 },
  { word: 'Benevolent', options: ['恶意', '仁慈', '冷漠', '紧张'], correct: 1 },
  { word: 'Candid', options: ['狡猾', '坦诚', '害羞', '傲慢'], correct: 1 },
  { word: 'Diligent', options: ['懒惰', '勤勉', '粗心', '缓慢'], correct: 1 },
  { word: 'Enigma', options: ['', '答案', '礼物', '旅程'], correct: 0 },
  { word: 'Frugal', options: ['奢侈', '节俭', '慷慨', '浪费'], correct: 1 },
  { word: 'Grandiose', options: ['朴素', '宏伟', '微小', '平凡'], correct: 1 },
  { word: 'Harmonious', options: ['冲突', '和谐', '混乱', '单调'], correct: 1 },
  { word: 'Inevitable', options: ['可避免的', '必然', '偶然', '意外'], correct: 1 },
  { word: 'Jubilant', options: ['沮丧', '欢欣', '平静', '愤怒的'], correct: 1 },
  { word: 'Keen', options: ['迟钝', '敏锐', '懒惰', '软弱'], correct: 1 },
  { word: 'Lucid', options: ['模糊', '清晰', '黑暗', '混乱'], correct: 1 },
]

export default function VocabTest() {
  const [screen, setScreen] = useState<'start' | 'test' | 'result'>('start')
  const [currentQ, setCurrentQ] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)

  const handleStart = () => {
    setScreen('test')
    setCurrentQ(0)
    setScore(0)
    setSelected(null)
  }

  const handleSelect = (index: number) => {
    if (selected !== null) return
    setSelected(index)
    if (index === questions[currentQ].correct) {
      setScore(prev => prev + 1)
    }
  }

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1)
      setSelected(null)
    } else {
      const finalScore = score + (selected === questions[currentQ].correct ? 1 : 0)
      setScreen('result')
      ;(window as any).toast('测试已提交', 'success')
      if (finalScore >= 16) {
        setShowConfetti(true)
      }
    }
  }

  const handleRestart = () => {
    setScreen('start')
    setCurrentQ(0)
    setSelected(null)
    setScore(0)
    setShowConfetti(false)
  }

  const getLevel = (s: number) => {
    if (s <= 8) return '初级'
    if (s <= 14) return '中级'
    return '高级'
  }

  const getLevelColor = (s: number) => {
    if (s <= 8) return 'gradient-rust'
    if (s <= 14) return 'gradient-text'
    return 'gradient-moss'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-24 pb-16 px-6"
    >
      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />

      <div className="max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {screen === 'start' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <h1 className="font-serif text-4xl gradient-text text-center mb-2">词汇量测试</h1>
              <p className="text-[var(--text-secondary)] text-center mb-8">通过20道题目，估算你的词汇量水</p>
              <div className="ornament mb-8" />

              <div className="liquid-glass-mono rounded-[2rem] p-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center mx-auto mb-8">
                  <Brain className="w-10 h-10 text-white" />
                </div>

                <div className="flex items-center justify-center gap-8 mb-8">
                  <div className="text-center">
                    <Target className="w-6 h-6 text-[var(--accent-primary)] mx-auto mb-2" />
                    <div className="text-sm text-[var(--text-secondary)]">20道题</div>
                  </div>
                  <div className="text-center">
                    <Zap className="w-6 h-6 text-[var(--accent-primary)] mx-auto mb-2" />
                    <div className="text-sm text-[var(--text-secondary)]">即时反馈</div>
                  </div>
                  <div className="text-center">
                    <Trophy className="w-6 h-6 text-[var(--accent-primary)] mx-auto mb-2" />
                    <div className="text-sm text-[var(--text-secondary)]">词汇评级</div>
                  </div>
                </div>

                <button onClick={handleStart} className="btn-amber px-10 py-4 rounded-2xl text-lg">
                  开始测试                </button>
              </div>
            </motion.div>
          )}

          {screen === 'test' && (
            <motion.div
              key="test"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <h1 className="font-serif text-4xl gradient-text text-center mb-2">词汇量测试</h1>
              <div className="ornament mb-8" />

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-sm text-[var(--text-muted)]">题目 {currentQ + 1}/{questions.length}</span>
                  <span className="font-mono text-sm text-[var(--text-muted)]">{Math.round((currentQ / questions.length) * 100)}%</span>
                </div>
                <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
                  />
                </div>
              </div>

              <div className="text-center mb-8">
                <p className="font-serif text-2xl text-[var(--text-secondary)] mb-4">选择正确的释义</p>
                <h2 className="font-serif text-4xl gradient-text">{questions[currentQ].word}</h2>
              </div>

              <div className="space-y-3 mb-8">
                {questions[currentQ].options.map((option, index) => {
                  const isSelected = selected === index
                  const isCorrect = index === questions[currentQ].correct
                  const showResult = selected !== null

                  let btnClass = 'liquid-glass rounded-xl p-5 text-left w-full transition-all duration-300 '
                  if (showResult) {
                    if (isCorrect) {
                      btnClass = 'liquid-glass rounded-xl p-5 text-left w-full border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5'
                    } else if (isSelected) {
                      btnClass = 'liquid-glass rounded-xl p-5 text-left w-full border-[var(--text-muted)]/30 '
                    } else {
                      btnClass = 'liquid-glass rounded-xl p-5 text-left w-full opacity-50 '
                    }
                  } else if (isSelected) {
                    btnClass = 'liquid-glass-selected rounded-xl p-5 text-left w-full '
                  }

                  return (
                    <motion.button
                      key={index}
                      onClick={() => handleSelect(index)}
                      disabled={selected !== null}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={btnClass}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-sm text-[var(--text-muted)] mr-3">{String.fromCharCode(65 + index)}.</span>
                          <span className={showResult && isCorrect ? 'text-[var(--accent-primary)] font-semibold' : showResult && isSelected && !isCorrect ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}>
                            {option}
                          </span>
                        </div>
                        {isSelected && !showResult && (
                          <span className="w-6 h-6 rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
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

              {selected !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <button onClick={handleNext} className="btn-amber px-8 py-3 rounded-xl">
                    {currentQ < questions.length - 1 ? '下一题' : '查看结果'}
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {screen === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <h1 className="font-serif text-4xl gradient-text text-center mb-2">词汇量测试</h1>
              <div className="ornament mb-8" />

              <div className="liquid-glass-mono rounded-[2rem] p-12 text-center">
                <Trophy className="w-12 h-12 text-[var(--accent-primary)] mx-auto mb-6" />

                <div className="font-serif text-6xl gradient-text mb-2">
                  {score}/{questions.length}
                </div>
                <p className="text-[var(--text-secondary)] mb-6">答对 {score} 道题</p>

                <div className="ornament mb-6" />

                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">估算词汇</span>
                    <span className="font-mono text-[var(--text-primary)]">~{score * 50} </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">词汇等级</span>
                    <span className={`font-serif text-xl ${getLevelColor(score)}`}>{getLevel(score)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">正确</span>
                    <span className="font-mono text-[var(--text-primary)]">{Math.round((score / questions.length) * 100)}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button onClick={handleRestart} className="btn-amber px-8 py-3 rounded-xl flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    再测一次                  </button>
                  <button className="btn-ghost px-8 py-3 rounded-xl">
                    返回学习
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
