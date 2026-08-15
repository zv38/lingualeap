import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { User, Settings, BookOpen, Trophy, Users, Clock, Star, Crown, Sparkles } from 'lucide-react'
import { useStore } from '../store/useStore'
import Tooltip from '../components/Tooltip'
import UserAvatar from '../components/UserAvatar'

const Profile = () => {
  const { user, progress, membershipInfo } = useStore()
  const membershipLevel = membershipInfo?.membership || user?.membership || 'free'
  const [isEditing, setIsEditing] = useState(false)
  const [username, setUsername] = useState(user?.username || '')
  const [bio, setBio] = useState('热爱语言学习，正在探索日语和英语的世界')

  const stats = [
    { icon: Star, label: 'XP', value: user?.xp || 0 },
    { icon: Trophy, label: '', value: user?.streakDays || 0 },
    { icon: BookOpen, label: '单词', value: progress.totalWordsLearned },
    { icon: Users, label: '关注', value: user?.followers?.length || 0 },
  ]

  const studyHistory = [
    { type: 'word', title: '学习新单词', date: '今天', duration: '15 分钟' },
    { type: 'grammar', title: '完成语法练习', date: '昨天', duration: '20 分钟' },
    { type: 'listening', title: '听力训练', date: '昨天', duration: '10 分钟' },
    { type: 'speaking', title: '口语练习', date: '2 天前', duration: '8 分钟' },
  ]

  const xpProgress = ((user?.xp || 0) / (user?.totalXP || 1)) * 100

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
          className="surface-glass rounded-[2rem] p-10 mb-8"
        >
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="relative">
              <UserAvatar username={user?.username} size={96} src={user?.avatar} className="ring-2 ring-[var(--accent-primary)]/[0.25]" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row items-center gap-3 mb-2">
                <h1 className="font-serif text-3xl text-[var(--text-primary)]">{user?.username}</h1>
                <div className="flex items-center gap-2">
                  <span className="surface-glass px-4 py-1 rounded-full text-xs font-mono text-[var(--accent-primary)]">
                    Lv.{user?.level === 'beginner' ? 1 : user?.level === 'elementary' ? 2 : user?.level === 'intermediate' ? 3 : 4}
                  </span>
                  {membershipLevel !== 'free' && (
                    <Tooltip content={membershipLevel === 'pro' ? '高级会员' : '基础会员'}>
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                        membershipLevel === 'pro'
                          ? 'bg-gradient-to-r from-black/10 to-black/10 text-[var(--text-primary)] border border-black/20'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-primary)]'
                      }`}>
                        {membershipLevel === 'pro' ? <Crown className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                        {membershipLevel === 'pro' ? '高级会员' : '基础会员'}
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-4 max-w-md">{bio}</p>
              <Tooltip content="编辑个人资料">
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-ghost rounded-full px-6 py-2 text-sm flex items-center gap-2 mx-auto md:mx-0"
                >
                  <Settings size={14} />
                  <span>编辑资料</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
                className="surface-glass card-liquid rounded-2xl p-6 text-center"
              >
                <Icon size={24} className="text-[var(--accent-primary)] mx-auto mb-2" />
                <div className="font-serif text-2xl text-[var(--text-primary)]">{stat.value}</div>
                <div className="text-xs text-[var(--text-muted)] font-mono">{stat.label}</div>
              </motion.div>
            )
          })}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--text-muted)] font-mono">XP 进度</span>
            <span className="text-sm text-[var(--accent-primary)] font-mono">{user?.xp} / {user?.totalXP}</span>
          </div>
          <div className="h-3 bg-[var(--accent-primary)]/[0.08] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${xpProgress}%` }}
              transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
              className="h-full gradient-text rounded-full"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
          className="surface-glass rounded-[2rem] p-8"
        >
          <h2 className="font-serif text-2xl gradient-text mb-6">最近活</h2>
          <div className="space-y-4">
            {studyHistory.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
                className="flex items-center gap-4 surface-glass rounded-xl p-4"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--accent-primary)]/[0.08] flex items-center justify-center flex-shrink-0">
                  <Clock size={18} className="text-[var(--accent-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--text-primary)] text-sm font-medium">{item.title}</p>
                  <p className="text-[var(--text-muted)] text-xs">{item.date}</p>
                </div>
                <span className="text-[var(--text-secondary)] text-xs font-mono whitespace-nowrap">{item.duration}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
              className="surface-glass rounded-[2rem] p-8 w-full max-w-md"
            >
              <h2 className="font-serif text-2xl gradient-text mb-6">编辑资料</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-muted)] font-mono mb-2 block">用户</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full surface-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/[0.25]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] font-mono mb-2 block">简</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    className="w-full surface-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/[0.25] resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] font-mono mb-2 block">头像</label>
                  <Tooltip content="更换头像">
  <div className="w-20 h-20 rounded-full surface-glass flex items-center justify-center cursor-pointer hover:border-[var(--accent-primary)]/[0.25] transition-colors">
    <User size={28} className="text-[var(--text-muted)]" />
  </div>
</Tooltip>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <Tooltip content="保存更改">
                  <button
                    onClick={() => { setIsEditing(false); (window as any).toast('个人资料已更新', 'success') }}
                    className="btn-primary rounded-full px-6 py-3 flex-1"
                  >
                    保存
                  </button>
                </Tooltip>
                <Tooltip content="取消编辑">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="btn-ghost rounded-full px-6 py-3 flex-1"
                  >
                    取消
                  </button>
                </Tooltip>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default Profile

