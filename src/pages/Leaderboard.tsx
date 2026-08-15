import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Trophy,
  Medal,
  TrendingUp,
  Users,
  Star,
  Crown,
  Flame,
  Filter,
  Award,
} from 'lucide-react'
import Tooltip from '../components/Tooltip'

interface User {
  id: string
  username: string
  avatar: string
  xp: number
  level: number
  streakDays: number
  language: string
  rank: number
}

const mockUsers: User[] = [
  { id: '1', username: 'LunaStar', avatar: '', xp: 28450, level: 42, streakDays: 67, language: '英语', rank: 1 },
  { id: '2', username: 'SamuraiKen', avatar: '', xp: 26120, level: 39, streakDays: 54, language: '日语', rank: 2 },
  { id: '3', username: 'SeoulMate', avatar: '', xp: 24380, level: 37, streakDays: 48, language: '韩语', rank: 3 },
  { id: '4', username: 'PolyglotPro', avatar: '', xp: 22150, level: 35, streakDays: 42, language: '英语', rank: 4 },
  { id: '5', username: 'NihongoNeko', avatar: '', xp: 20890, level: 33, streakDays: 39, language: '日语', rank: 5 },
  { id: '6', username: 'HangulHero', avatar: '', xp: 19230, level: 31, streakDays: 35, language: '韩语', rank: 6 },
  { id: '7', username: 'EnglishEagle', avatar: '', xp: 17860, level: 29, streakDays: 31, language: '英语', rank: 7 },
  { id: '8', username: 'KanjiKing', avatar: '', xp: 16540, level: 27, streakDays: 28, language: '日语', rank: 8 },
  { id: '9', username: 'DaehakDream', avatar: '', xp: 14980, level: 25, streakDays: 24, language: '韩语', rank: 9 },
  { id: '10', username: 'WordWizard', avatar: '', xp: 13420, level: 23, streakDays: 21, language: '英语', rank: 10 },
  { id: '11', username: 'SakuraSpeak', avatar: '', xp: 11890, level: 21, streakDays: 18, language: '日语', rank: 11 },
  { id: '12', username: 'BusanBeat', avatar: '', xp: 10240, level: 19, streakDays: 15, language: '韩语', rank: 12 },
  { id: '13', username: 'GrammarGuru', avatar: '', xp: 8750, level: 17, streakDays: 12, language: '英语', rank: 13 },
  { id: '14', username: 'TokyoTensei', avatar: '', xp: 7120, level: 15, streakDays: 9, language: '日语', rank: 14 },
  { id: '15', username: 'KoreaKaiser', avatar: '', xp: 5480, level: 13, streakDays: 6, language: '韩语', rank: 15 },
]

const currentUser: User = {
  id: 'current',
  username: '',
  avatar: '',
  xp: 12560,
  level: 22,
  streakDays: 17,
  language: '英语',
  rank: 11,
}

const timeTabs = ['今日', '本周', '本月', '全部']
const languageFilters = ['全部', '英语', '日语', '韩语']

const medalColors = ['#09090b', '#52525b', '#a1a1aa']

const maxXP = Math.max(...mockUsers.map((u) => u.xp))

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
}

function getInitial(name: string) {
  return name.charAt(0).toUpperCase()
}

function formatXP(xp: number) {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1)}k`
  return xp.toString()
}

function Leaderboard() {
  const [activeTime, setActiveTime] = useState('本周')
  const [activeLanguage, setActiveLanguage] = useState('全部')

  const filteredUsers = useMemo(() => {
    if (activeLanguage === '全部') return mockUsers
    return mockUsers.filter((u) => u.language === activeLanguage)
  }, [activeLanguage])

  const currentInFilter = useMemo(() => {
    if (activeLanguage === '全部') return true
    return currentUser.language === activeLanguage
  }, [activeLanguage])

  const avatarColors = [
    'from-[var(--accent-secondary)] to-[var(--accent-primary)]',
    'from-[var(--success)] to-[var(--success)]',
    'from-[var(--accent-navy)] to-[var(--accent-navy)]',
    'from-[var(--error)] to-[var(--error)]',
    'from-[var(--accent-primary)] to-[var(--accent-primary)]',
  ]

  return (
    <motion.div
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="flex items-center gap-4 mb-2">
            <Trophy className="text-[var(--accent-primary)]" size={32} />
            <h1 className="font-serif text-5xl gradient-text">排行</h1>
          </div>
          <p className="text-[var(--text-secondary)] mt-2">与全球学习者一较高</p>
          <div className="ornament mt-4" />
        </motion.div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2">
            {timeTabs.map((tab) => (
              <Tooltip key={tab} content={`${tab}排行榜`}>
                <button
                  onClick={() => setActiveTime(tab)}
                  className={`px-5 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    activeTime === tab
                      ? 'btn-primary'
                      : 'surface-glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab}
                </button>
              </Tooltip>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-[var(--text-muted)]" />
            {languageFilters.map((lang) => (
              <Tooltip key={lang} content={`${lang}排行榜`}>
                <button
                  onClick={() => setActiveLanguage(lang)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    activeLanguage === lang
                      ? 'btn-primary'
                      : 'surface-glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {lang}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        <motion.div
          className="surface-glass rounded-[2rem] p-6 mb-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center text-white font-bold text-lg ring-2 ring-[var(--accent-primary)]/[0.25]">
              {getInitial(currentUser.username)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-serif text-lg text-[var(--text-primary)]">{currentUser.username}</span>
                <span className="surface-glass px-2 py-0.5 rounded-full text-xs text-[var(--accent-primary)] font-mono">
                  Lv.{currentUser.level}
                </span>
                <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono">
                  <Flame size={12} className="text-[var(--accent-primary)]" />
                  {currentUser.streakDays}?                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">
                  排名 <span className="text-[var(--accent-primary)] font-bold font-mono">#{currentUser.rank}</span>
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  XP <span className="text-[var(--text-primary)] font-mono">{formatXP(currentUser.xp)}</span>
                </span>
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)]/[0.08] border border-[var(--accent-primary)]/[0.08]">
                <TrendingUp size={16} className="text-[var(--accent-primary)]" />
                <span className="text-xs text-[var(--accent-primary)] font-mono">还需 {mockUsers[currentUser.rank - 2].xp - currentUser.xp} XP 提升排名</span>
              </div>
            </div>
          </div>
          <div className="mt-4 h-2 bg-[var(--accent-primary)]/[0.08] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[var(--accent-primary)] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(currentUser.xp / mockUsers[0].xp) * 100}%` }}
              transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            />
          </div>
        </motion.div>

        <motion.div
          className="surface-glass rounded-[2rem] overflow-hidden"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="hidden sm:grid grid-cols-12 gap-4 px-8 py-4 border-b border-[var(--accent-primary)]/[0.03]">
            <div className="col-span-1 font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">排名</div>
            <div className="col-span-5 font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">用户</div>
            <div className="col-span-2 font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider text-right">等级</div>
            <div className="col-span-2 font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider text-right">经验</div>
            <div className="col-span-2 font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider text-right">连续天数</div>
          </div>

          {filteredUsers.map((user, index) => {
            const isTop3 = user.rank <= 3
            const isCurrentUser = user.id === currentUser.id

            return (
              <motion.div
                key={user.id}
                variants={itemVariants}
                className={`grid grid-cols-12 gap-4 items-center px-6 sm:px-8 py-5 transition-all duration-300 ${
                  isCurrentUser
                    ? 'border-2 border-[var(--accent-primary)]/[0.3] bg-[var(--accent-primary)]/[0.02]'
                    : 'border-b border-[var(--accent-primary)]/[0.015] hover:bg-[var(--accent-primary)]/[0.015]'
                }`}
              >
                <div className="col-span-2 sm:col-span-1 flex items-center justify-start">
                  {isTop3 ? (
                    <Tooltip content={`第${user.rank}名`}>
                      <div className="relative">
                        <Medal size={28} color={medalColors[user.rank - 1]} fill={medalColors[user.rank - 1]} />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white font-mono">
                          {user.rank}
                        </span>
                      </div>
                    </Tooltip>
                  ) : (
                    <Tooltip content={`第${user.rank}名`}>
                      <span className="font-mono text-sm text-[var(--text-muted)] ml-1.5">#{user.rank}</span>
                    </Tooltip>
                  )}
                </div>

                <div className="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                      avatarColors[index % avatarColors.length]
                    } flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ring-1 ring-[var(--accent-primary)]/[0.08]`}
                  >
                    {getInitial(user.username)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-[var(--text-primary)] truncate">{user.username}</span>
                      {isTop3 && (
                        <Crown size={14} color={medalColors[user.rank - 1]} fill={medalColors[user.rank - 1]} />
                      )}
                    </div>
                    <span className="text-xs text-[var(--text-muted)] font-mono">{user.language}</span>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-2 text-right">
                  <span className="surface-glass px-2.5 py-1 rounded-full text-xs text-[var(--accent-primary)] font-mono">
                    Lv.{user.level}
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-2 text-right">
                  <span className="font-mono text-sm text-[var(--text-primary)]">{formatXP(user.xp)}</span>
                </div>

                <div className="col-span-2 sm:col-span-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Flame size={14} className="text-[var(--accent-primary)]" />
                    <span className="font-mono text-sm text-[var(--text-secondary)]">{user.streakDays}</span>
                  </div>
                </div>

                <div className="col-span-12 sm:col-span-12 mt-3 sm:mt-2">
                  <div className="h-1.5 bg-[var(--accent-primary)]/[0.08] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          isTop3
                            ? `linear-gradient(90deg, ${medalColors[user.rank - 1]}88, ${medalColors[user.rank - 1]})`
                            : 'linear-gradient(90deg, rgba(0,0,0,0.3), rgba(0,0,0,0.6))',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(user.xp / maxXP) * 100}%` }}
                      transition={{ duration: 1, delay: 0.3 + index * 0.05, ease: [0.22, 1, 0.36, 1] as const }}
                    />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {currentInFilter && (
          <motion.div
            className="mt-8 surface-glass rounded-[2rem] p-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award size={24} className="text-[var(--accent-primary)]" />
                <div>
                  <p className="font-serif text-[var(--text-primary)]">我的排名</p>
                  <p className="text-xs text-[var(--text-muted)] font-mono">
                    在{activeLanguage === '全部' ? '全语言' : activeLanguage} 中排名 #{currentUser.rank}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)] font-mono">当前等级</p>
                  <p className="font-mono text-[var(--accent-primary)] font-bold">Lv.{currentUser.level}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)] font-mono">总经验</p>
                  <p className="font-mono text-[var(--text-primary)] font-bold">{formatXP(currentUser.xp)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)] font-mono">连续学习</p>
                  <p className="font-mono text-[var(--accent-primary)] font-bold">{currentUser.streakDays}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          className="mt-8 grid sm:grid-cols-3 gap-4"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="surface-glass rounded-[2rem] p-6 text-center">
            <Users size={24} className="text-[var(--accent-primary)] mx-auto mb-3" />
            <p className="font-serif text-2xl text-[var(--text-primary)]">{mockUsers.length}</p>
            <p className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-wider mt-1">总参赛人</p>
          </div>
          <div className="surface-glass rounded-[2rem] p-6 text-center">
            <Star size={24} className="text-[var(--accent-primary)] mx-auto mb-3" />
            <p className="font-serif text-2xl text-[var(--text-primary)]">{formatXP(maxXP)}</p>
            <p className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-wider mt-1">最高经验</p>
          </div>
          <div className="surface-glass rounded-[2rem] p-6 text-center">
            <TrendingUp size={24} className="text-[var(--accent-primary)] mx-auto mb-3" />
            <p className="font-serif text-2xl text-[var(--text-primary)]">
              {Math.round(mockUsers.reduce((sum, u) => sum + u.streakDays, 0) / mockUsers.length)}
            </p>
            <p className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-wider mt-1">平均连续天数</p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

export default Leaderboard
