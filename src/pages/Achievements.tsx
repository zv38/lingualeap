import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Star, BookOpen, Lightbulb, MessageCircle, Globe } from 'lucide-react'
import { useStore } from '../store/useStore'
import Confetti from '../components/Confetti'
import Tooltip from '../components/Tooltip'
import ScrollReveal from '../components/animations/ScrollReveal'
import TextReveal from '../components/animations/TextReveal'
import ListStagger from '../components/animations/ListStagger'


const Achievements = () => {
  const { achievements } = useStore()
  const [confettiId, setConfettiId] = useState<string | null>(null)
  const [pageConfetti, setPageConfetti] = useState(false)

  useEffect(() => {
    setPageConfetti(true)
    const timer = setTimeout(() => setPageConfetti(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  const iconMap: Record<string, any> = {
    star: Star,
    flame: Trophy,
    'book-open': BookOpen,
    lightbulb: Lightbulb,
    'message-circle': MessageCircle,
    globe: Globe,
  }

  const unlockedCount = achievements.filter((a) => a.unlocked).length
  const totalCount = achievements.length

  const handleCardClick = (id: string, unlocked: boolean) => {
    if (unlocked) {
      setConfettiId(id)
      setTimeout(() => setConfettiId(null), 2000)
    }
  }

  return (
    <motion.div
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Confetti trigger={pageConfetti} />

        <motion.div className="mb-10">
          <ScrollReveal>
            <TextReveal text="成就系统" as="h1" className="font-serif text-5xl gradient-text" />
          </ScrollReveal>
          <div className="ornament mt-4" />
        </motion.div>

        <motion.div
          className="glass-mono-glow rounded-[2rem] p-12 mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center mx-auto mb-5">
            <Trophy size={36} className="text-white" />
          </div>
          <h2 className="font-serif text-6xl text-[var(--text-primary)] mb-2">
            {unlockedCount}
          </h2>
          <p className="font-mono text-xs text-[var(--text-muted)] tracking-[0.3em] uppercase mb-6">成就解锁</p>
          <div className="max-w-md mx-auto">
            <div className="h-2 glass-progress rounded-full overflow-hidden">
              <div
                className="h-full glass-progress-fill rounded-full transition-all duration-700 ease-out"
                style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--accent-primary)]/70 mt-2 font-mono">
              完成进度 {Math.round((unlockedCount / totalCount) * 100)}%
            </p>
          </div>
        </motion.div>

        <ListStagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {achievements.map((achievement) => {
            const Icon = iconMap[achievement.icon] || Trophy
            const isConfettiActive = confettiId === achievement.id
            return (
              <Tooltip key={achievement.id} content={achievement.description}>
                <motion.div
                  onClick={() => handleCardClick(achievement.id, achievement.unlocked)}
                  className={`relative rounded-[2rem] p-8 transition-all duration-300 cursor-pointer ${
                    achievement.unlocked
                      ? 'liquid-glass-mono card-liquid hover:shadow-[0_0_30px_rgba(0,0,0,0.08)]'
                      : 'liquid-glass opacity-40'
                  }`}
                >
                  {isConfettiActive && <Confetti trigger={isConfettiActive} />}
                  {achievement.unlocked ? (
                    <ScrollReveal>
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]">
                          <Icon className="text-white" size={26} />
                        </div>
                        <div className="text-[var(--accent-primary)]">
                          <Star size={18} fill="currentColor" />
                        </div>
                      </div>
                      <h3 className="font-serif text-lg mb-2 text-[var(--text-primary)]">
                        {achievement.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                        {achievement.description}
                      </p>
                      {achievement.unlockedAt && (
                        <p className="text-xs text-[var(--accent-primary)]/70 mt-3 font-mono">
                          解锁于{achievement.unlockedAt}
                        </p>
                      )}
                    </ScrollReveal>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)]">
                          <Icon className="text-[var(--text-muted)]" size={26} />
                        </div>
                      </div>
                      <h3 className="font-serif text-lg mb-2 text-[var(--text-muted)]">
                        {achievement.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                        {achievement.description}
                      </p>
                    </>
                  )}
                </motion.div>
              </Tooltip>
            )
          })}
        </ListStagger>

        <motion.div
          className="mt-12 liquid-glass rounded-[2rem] p-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-5 flex items-center space-x-2 font-serif">
            <Lightbulb className="text-[var(--accent-primary)]" size={20} />
            <span>即将推出</span>
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: '语言大师', desc: '掌握3种语言的全部课' },
              { title: '坚持达人', desc: '连续学习30' },
              { title: '词汇', desc: '掌握1000个单' },
            ].map((item, index) => (
              <div key={index} className="bg-[var(--bg-elevated)] rounded-xl p-5 border border-dashed border-[var(--accent-primary)]/[0.08]">
                <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center mb-3">
                  <Trophy size={20} className="text-[var(--text-muted)]" />
                </div>
                <h4 className="text-[var(--text-muted)] font-medium mb-1">{item.title}</h4>
                <p className="text-xs text-[var(--text-muted)]/60">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

export default Achievements
