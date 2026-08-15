import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Sparkles, Brain, BookOpen, Lightbulb, Target, ArrowRight, CheckCircle, XCircle, RefreshCw, NotebookPen, Trash2, PartyPopper } from 'lucide-react'
import { useWrongQuestions } from '../store/useWrongQuestions'
import { useStore } from '../store/useStore'
import { playSuccessSound, playErrorSound, playUpgradeSound } from '../utils/sound'

const recommendedCourses = [
  {
    title: '日语基础语法强化',
    description: '基于你的学习进度，系统推荐重点攻克助词和动词变形，掌握N5核心语法',
    match: 96,
    icon: Brain,
    color: 'from-[var(--accent-primary)] to-[var(--accent-secondary)]',
  },
  {
    title: '日常会话实战训练',
    description: '你的听力理解能力突出，推荐加强口语输出训练，提升实际交流能力',
    match: 88,
    icon: BookOpen,
    color: 'from-[var(--success)] to-[var(--success)]',
  },
  {
    title: 'N4词汇冲刺计划',
    description: '根据记忆曲线分析，本周是复习已学词汇的最佳时机，巩固率可达90%',
    match: 82,
    icon: Target,
    color: 'from-[var(--warning)] to-[var(--warning)]',
  },
  {
    title: '阅读理解进阶',
    description: '你的阅读速度提升显著，推荐尝试中长篇阅读理解，挑战更高难度',
    match: 75,
    icon: Sparkles,
    color: 'from-[var(--accent-navy)] to-[var(--accent-navy)]',
  },
]

const practiceQuestions = [
  {
    question: '「昨日、友達と映画を___。」填入最恰当的动词形式？',
    options: ['見ま', '見た', '見ている', '見よ'],
    correctAnswer: 1,
    explanation: '「昨日」表示过去的时间点，应使用过去形「見た」（た形）',
  },
  {
    question: '次の文で「は」の使い方として正しいのはどれですか',
    options: [
      '私は学生です',
      '本はを読む',
      '公園はに行く',
      '猫はが好',
    ],
    correctAnswer: 0,
    explanation: '「は」是提示主题的助词，「私は学生です」是标准的主题提示用法',
  },
  {
    question: '「もし暇___、一緒に買い物に行きませんか？」填入正确的助词',
    options: ['', '', 'なら', ''],
    correctAnswer: 2,
    explanation: '「なら」表示假设条件，用于承接对方的话题或提出假设',
  },
  {
    question: '「このケーキはとても___。」填入最恰当的形容词形式',
    options: ['美味しいです', '美味しくです', '美味しいます', '美味しくあります'],
    correctAnswer: 0,
    explanation: 'い形容词的敬体形直接加「です」，「美味しいです」是正确的敬体形式',
  },
  {
    question: '「先生は教室___入りました。」填入正确的助词',
    options: ['を', 'に', 'で', 'へ'],
    correctAnswer: 1,
    explanation: '「入る」表示移动的方向，使用助词「に」表示动作的归着点',
  },
  {
    question: '次のうち「ている」の用法として正しくないのはどれですか？',
    options: [
      '本を読んでいる。（动作正在进行',
      '結婚している。（状态持续）',
      '走っているいる。（重复强调',
      '知っている。（状态保持）',
    ],
    correctAnswer: 2,
    explanation: '「ている」没有重复强调的用法，「走っているいる」是错误的表达',
  },
]

const learningTips = [
  {
    title: '间隔重复',
    description: '新学的单词在1天天天第4天后复习，记忆留存率可提升至90%以上',
    icon: Brain,
  },
  {
    title: '影子跟读技巧',
    description: '播放日语音频时延迟0.5秒跟读，模仿语调与停顿，每天15分钟效果显著',
    icon: Lightbulb,
  },
  {
    title: '错题本策',
    description: '每道错题记录错误原因（助变形/词汇），每周回顾一次，针对性突破薄弱点',
    icon: Target,
  },
  {
    title: '沉浸式输入',
    description: '每天30分钟日语内容（新闻/播客/动漫），不必完全理解，培养语感最重要',
    icon: BookOpen,
  },
]

const greetingMessages = [
  '欢迎回来！今天想学点什么？',
  '又见面了！我已经为你准备好了学习计划',
  '学习时间到！来看看今天的推荐内容',
  '你好呀！一起开启今日的学习之旅',
]

export default function AIAssistant() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [showWrongBook, setShowWrongBook] = useState(false)
  const [greeting] = useState(() => greetingMessages[Math.floor(Math.random() * greetingMessages.length)])

  const wrongBook = useWrongQuestions()
  const addToast = useStore((s) => s.addToast)
  const currentQuestion = practiceQuestions[currentQuestionIndex]
  const isCorrect = selectedOption === currentQuestion.correctAnswer
  const isLastQuestion = currentQuestionIndex === practiceQuestions.length - 1

  const handleSelectOption = (index: number) => {
    if (submitted) return
    setSelectedOption(index)
  }

  const handleSubmit = () => {
    if (selectedOption === null) return
    setSubmitted(true)
    if (isCorrect) {
      setScore(score + 1)
      playSuccessSound()
    } else {
      // 错题闭环：答错自动归纳进错题本，并给出即时反馈
      const wrongText = currentQuestion.options[selectedOption as number]
      wrongBook.addWrongQuestion({
        question: currentQuestion.question,
        userAnswer: wrongText,
        correctAnswer: currentQuestion.options[currentQuestion.correctAnswer],
        explanation: currentQuestion.explanation,
        source: '智能练习',
      })
      playErrorSound()
      addToast('已自动加入错题本，稍后系统会帮你复习', 'info', 2600)
    }
  }

  const handleNext = () => {
    if (isLastQuestion) {
      setShowResult(true)
      playUpgradeSound()
      return
    }
    setCurrentQuestionIndex(currentQuestionIndex + 1)
    setSelectedOption(null)
    setSubmitted(false)
  }

  const handleReset = () => {
    setCurrentQuestionIndex(0)
    setSelectedOption(null)
    setSubmitted(false)
    setScore(0)
    setShowResult(false)
  }

  const getOptionStyle = (index: number) => {
    if (!submitted) {
      if (selectedOption === index) return 'liquid-glass-selected'
      return 'liquid-glass hover:bg-[var(--accent-primary)]/5'
    }
    if (index === currentQuestion.correctAnswer) {
      return 'border border-moss-400/30 bg-moss-400/5'
    }
    if (selectedOption === index && index !== currentQuestion.correctAnswer) {
      return 'border border-rust-400/30 bg-rust-400/5'
    }
    return 'liquid-glass opacity-50'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
          className="liquid-glass-mono rounded-[2rem] p-8 md:p-10 mb-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[var(--accent-primary)]/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
            <div className="w-20 h-20 rounded-[2rem] liquid-glass flex items-center justify-center flex-shrink-0">
              <Bot size={40} className="text-[var(--accent-primary)]" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h1 className="font-serif text-3xl md:text-4xl gradient-text mb-2">
                AI 学习助手
              </h1>
              <p className="text-[var(--text-secondary)] text-lg font-sans">
                {greeting}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="liquid-glass rounded-full px-4 py-2 flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--accent-primary)]" />
                <span className="font-mono text-xs text-[var(--accent-primary)] tracking-wider">AI 驱动</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Smart Recommendations */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={22} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-2xl gradient-text">智能学习推荐</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {recommendedCourses.map((course, index) => {
              const Icon = course.icon
              return (
                <motion.div
                  key={course.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.25 + index * 0.08, ease: [0.22, 1, 0.36, 1] as const }}
                  className="liquid-glass card-liquid rounded-[2rem] p-6 group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center">
                      <Icon size={24} className="text-[var(--accent-primary)]" />
                    </div>
                    <div className="liquid-glass rounded-full px-3 py-1">
                      <span className="font-mono text-xs text-[var(--accent-primary)]">{course.match}% 匹配</span>
                    </div>
                  </div>
                  <h3 className="font-serif text-lg text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent-primary)] transition-colors duration-300">
                    {course.title}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-sans">
                    {course.description}
                  </p>
                  <div className="mt-4 pt-4 border-t border-[var(--accent-primary)]/[0.04]">
                    <div className="flex items-center gap-2 text-[var(--accent-primary)] text-sm font-sans">
                      <span>查看详情</span>
                      <ArrowRight size={14} />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Practice Questions */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <Brain size={22} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-2xl gradient-text">智能练习</h2>
            <button
              onClick={() => setShowWrongBook((v) => !v)}
              className="ml-auto liquid-glass rounded-full px-4 py-2 flex items-center gap-2 hover:bg-[var(--accent-primary)]/5 transition-all"
            >
              <NotebookPen size={16} className="text-[var(--accent-primary)]" />
              <span className="text-sm font-sans text-[var(--text-secondary)]">错题本</span>
              {wrongBook.items.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white text-[11px] flex items-center justify-center font-mono">
                  {wrongBook.items.length}
                </span>
              )}
            </button>
          </div>

          {showResult ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
              className="liquid-glass rounded-[2rem] p-10 text-center"
            >
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Bot size={44} className="text-white" />
                <motion.div
                  className="absolute -top-2 -right-2"
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: [0, 1.2, 1], rotate: [-30, 8, 0] }}
                  transition={{ duration: 0.8, delay: 0.4, ease: [0.34, 1.56, 0.64, 1] as const }}
                >
                  <PartyPopper size={28} className="text-[var(--warning)]" />
                </motion.div>
              </div>
              <h3 className="font-serif text-3xl gradient-text mb-2">练习完成</h3>
              <p className="text-[var(--text-secondary)] text-lg mb-1 font-sans">
                {score === practiceQuestions.length
                  ? '满分通关，太棒了！'
                  : score >= practiceQuestions.length * 0.7
                    ? '完成得很不错，继续保持！'
                    : score >= practiceQuestions.length * 0.4
                      ? '有进步，错题已帮你记下，复习后会更稳'
                      : '别灰心，错题已收集，针对性复习会很快提升'}
              </p>
              <p className="text-sm text-[var(--text-muted)] mb-2 font-sans">
                {wrongBook.items.length > 0
                  ? `本次练习已收录 ${wrongBook.items.length} 道错题到错题本`
                  : '全部答对，无错题需要复习'}
              </p>
              <p className="font-serif text-6xl gradient-text mb-6">
                {score} / {practiceQuestions.length}
              </p>
              <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden max-w-md mx-auto mb-8">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(score / practiceQuestions.length) * 100}%` }}
                  transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
                  className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-full"
                />
              </div>
              <motion.button
                onClick={handleReset}
                className="btn-amber rounded-full px-8 py-3 inline-flex items-center gap-2"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <RefreshCw size={18} />
                <span>重新练习</span>
              </motion.button>
            </motion.div>
          ) : (
            <div className="liquid-glass rounded-[2rem] p-8 md:p-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="liquid-glass-mono px-3 py-1 rounded-full text-xs text-[var(--accent-primary)] font-mono uppercase tracking-wider">
                    {currentQuestionIndex + 1}
                  </span>
                  <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    / {practiceQuestions.length}
                  </span>
                </div>
                <div className="font-serif text-lg text-[var(--text-primary)]">
                  <span className="gradient-text">{score}</span>
                  <span className="text-[var(--text-muted)]"> / {practiceQuestions.length}</span>
                </div>
              </div>

              <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden mb-8">
                <motion.div
                  className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentQuestionIndex + 1) / practiceQuestions.length) * 100}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
                />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQuestionIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
                >
                  <h3 className="font-serif text-xl md:text-2xl text-[var(--text-primary)] mb-8">
                    {currentQuestion.question}
                  </h3>

                  <div className="grid gap-3 mb-8">
                    {currentQuestion.options.map((option, index) => (
                      <motion.button
                        key={index}
                        onClick={() => handleSelectOption(index)}
                        className={`rounded-xl p-5 text-left font-sans text-[var(--text-primary)] transition-all duration-300 ${getOptionStyle(index)}`}
                        whileHover={!submitted ? { scale: 1.01 } : {}}
                        whileTap={!submitted ? { scale: 0.99 } : {}}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-[var(--text-muted)] w-6">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="flex-1">{option}</span>
                          {submitted && index === currentQuestion.correctAnswer && (
                            <CheckCircle size={20} className="text-moss-400 flex-shrink-0" />
                          )}
                          {submitted && index === selectedOption && index !== currentQuestion.correctAnswer && (
                            <XCircle size={20} className="text-rust-400 flex-shrink-0" />
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>

                  {submitted && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                      className={`rounded-xl p-5 mb-6 ${
                        isCorrect ? 'liquid-glass-moss' : 'border border-rust-400/30 bg-rust-400/5'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {isCorrect ? (
                          <CheckCircle size={20} className="text-moss-400 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle size={20} className="text-rust-400 mt-0.5 flex-shrink-0" />
                        )}
                        <div>
                          <p className={`font-semibold mb-1 ${isCorrect ? 'text-moss-400' : 'text-rust-400'}`}>
                            {isCorrect ? '回答正确' : '回答错误'}
                          </p>
                          <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                            {currentQuestion.explanation}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex items-center justify-between">
                    {!submitted ? (
                      <motion.button
                        onClick={handleSubmit}
                        disabled={selectedOption === null}
                        className="btn-amber rounded-full px-8 py-3 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-2"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <span>提交答案</span>
                        <ArrowRight size={18} />
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={handleNext}
                        className="btn-amber rounded-full px-8 py-3 inline-flex items-center gap-2"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <span>{isLastQuestion ? '查看结果' : '下一'}</span>
                        <ArrowRight size={18} />
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* 错题本：AI 讲解与错题闭环 */}
        <AnimatePresence>
          {showWrongBook && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
              className="overflow-hidden mb-8"
            >
              <div className="liquid-glass rounded-[2rem] p-8">
                <div className="flex items-center gap-3 mb-6">
                  <NotebookPen size={22} className="text-[var(--accent-primary)]" />
                  <h2 className="font-serif text-2xl gradient-text">我的错题本</h2>
                  <span className="ml-auto text-xs font-mono text-[var(--text-muted)]">
                    {wrongBook.items.length} 道待复习
                  </span>
                </div>

                {wrongBook.items.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto mb-4">
                      <NotebookPen size={28} className="text-[var(--text-muted)]" />
                    </div>
                    <p className="text-[var(--text-secondary)]">暂无错题，答错的题目会自动收录到这里</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {wrongBook.items.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-2xl p-5 border transition-all ${
                          item.reviewed
                            ? 'border-moss-400/20 bg-moss-400/5'
                            : 'border-rust-400/20 bg-rust-400/5'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-[var(--text-muted)]">
                            {item.source} · {new Date(item.missedAt).toLocaleDateString('zh-CN')}
                          </span>
                          <button
                            onClick={() => wrongBook.removeWrongQuestion(item.id)}
                            className="text-[var(--text-muted)] hover:text-rust-400 transition-colors"
                            aria-label="移除错题"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <p className="font-serif text-[var(--text-primary)] mb-3 leading-relaxed">
                          {item.question}
                        </p>
                        <div className="space-y-2 text-sm mb-4">
                          <div className="flex items-start gap-2">
                            <span className="text-rust-400 flex-shrink-0">你的答案</span>
                            <span className="text-[var(--text-secondary)] line-through">{item.userAnswer}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-moss-400 flex-shrink-0">正确答案</span>
                            <span className="text-[var(--text-primary)]">{item.correctAnswer}</span>
                          </div>
                          <p className="text-[var(--text-muted)] text-xs leading-relaxed pt-1 border-t border-[var(--accent-primary)]/[0.04]">
                            {item.explanation}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            wrongBook.markReviewed(item.id)
                            playSuccessSound()
                            addToast('已掌握，继续加油！', 'success', 2200)
                          }}
                          className="w-full rounded-xl py-2.5 text-sm font-medium transition-all bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                        >
                          {item.reviewed ? '已掌握 · 再次复习' : '标记为已掌握'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {wrongBook.items.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-[var(--accent-primary)]/[0.04] flex items-center justify-between">
                    <p className="text-xs text-[var(--text-muted)]">错题会自动间隔提醒，帮你针对性突破薄弱点</p>
                    <button
                      onClick={() => wrongBook.clearAll()}
                      className="text-xs text-[var(--text-muted)] hover:text-rust-400 transition-colors"
                    >
                      清空错题本
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Learning Tips */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="flex items-center gap-3 mb-6">
            <Lightbulb size={22} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-2xl gradient-text">学习建议</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {learningTips.map((tip, index) => {
              const Icon = tip.icon
              return (
                <motion.div
                  key={tip.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.45 + index * 0.08, ease: [0.22, 1, 0.36, 1] as const }}
                  className="liquid-glass rounded-[2rem] p-6 flex items-start gap-4 group hover:bg-[var(--accent-primary)]/[0.02] transition-all duration-500"
                >
                  <div className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--accent-primary)]/20 transition-colors duration-300">
                    <Icon size={22} className="text-[var(--accent-primary)]" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg text-[var(--text-primary)] mb-1.5">{tip.title}</h3>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-sans">{tip.description}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
