import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserPlus,
  UserCheck,
  Search,
  MessageCircle,
  BookOpen,
  Trophy,
  Flame,
  Check,
  X,
  Plus,
  Bell,
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import Tooltip from '../components/Tooltip'

interface FriendActivity {
  id: number
  user: {
    name: string
    avatar: string
    level: number
  }
  action: string
  detail: string
  time: string
  type: 'course' | 'lesson' | 'milestone' | 'streak'
}

interface UserSuggestion {
  id: number
  name: string
  avatar: string
  level: number
  language: string
  mutualFriends: number
  isFriend: boolean
}

interface FriendRequest {
  id: number
  name: string
  avatar: string
  level: number
  mutualFriends: number
  time: string
}

interface Friend {
  id: number
  name: string
  avatar: string
  level: number
  online: boolean
  language: string
}

const activities: FriendActivity[] = [
  {
    id: 1,
    user: { name: 'Luna Chen', avatar: 'LC', level: 42 },
    action: '完成了课程',
    detail: '日语 N5 基础语法',
    time: '3 分钟',
    type: 'course',
  },
  {
    id: 2,
    user: { name: 'Marcus Wei', avatar: 'MW', level: 38 },
    action: '完成了课',
    detail: '韩语发音 Lv.2',
    time: '12 分钟',
    type: 'lesson',
  },
  {
    id: 3,
    user: { name: 'Sophia Lin', avatar: 'SL', level: 55 },
    action: '达成了里程碑',
    detail: '法语学习 30 天连',
    time: '28 分钟',
    type: 'milestone',
  },
  {
    id: 4,
    user: { name: 'Ethan Wang', avatar: 'EW', level: 29 },
    action: '开启了课程',
    detail: '西班牙语 A1 入门',
    time: '1 小时',
    type: 'course',
  },
  {
    id: 5,
    user: { name: 'Aria Zhang', avatar: 'AZ', level: 47 },
    action: '达成了里程碑',
    detail: '德语 A2 词汇第2000',
    time: '2 小时',
    type: 'milestone',
  },
  {
    id: 6,
    user: { name: 'Noah Li', avatar: 'NL', level: 33 },
    action: '保持了连续学',
    detail: '意大利语 · 连续 7 ',
    time: '3 小时',
    type: 'streak',
  },
  {
    id: 7,
    user: { name: 'Yuna Kim', avatar: 'YK', level: 51 },
    action: '完成了课',
    detail: '中文 HSK4 阅读理解',
    time: '4 小时',
    type: 'lesson',
  },
  {
    id: 8,
    user: { name: 'Oliver Zhou', avatar: 'OZ', level: 26 },
    action: '开启了课程',
    detail: '泰语基础对话',
    time: '5 小时',
    type: 'course',
  },
]

const suggestions: UserSuggestion[] = [
  { id: 1, name: 'Yuki Tanaka', avatar: 'YT', level: 61, language: '日语', mutualFriends: 12, isFriend: false },
  { id: 2, name: 'Camille Dubois', avatar: 'CD', level: 48, language: '法语', mutualFriends: 8, isFriend: false },
  { id: 3, name: 'Hugo Silva', avatar: 'HS', level: 35, language: '葡萄牙语', mutualFriends: 5, isFriend: true },
  { id: 4, name: 'Elena Rossi', avatar: 'ER', level: 44, language: '意大利语', mutualFriends: 15, isFriend: false },
  { id: 5, name: 'Minjun Park', avatar: 'MP', level: 39, language: '韩语', mutualFriends: 7, isFriend: false },
  { id: 6, name: 'Sofia Garcia', avatar: 'SG', level: 52, language: '西班牙语', mutualFriends: 10, isFriend: true },
  { id: 7, name: 'Felix Müller', avatar: 'FM', level: 33, language: '德语', mutualFriends: 3, isFriend: false },
  { id: 8, name: 'Ananya Patel', avatar: 'AP', level: 57, language: '印地', mutualFriends: 9, isFriend: false },
]

const pendingRequests: FriendRequest[] = [
  { id: 1, name: 'Wei Chen', avatar: 'WC', level: 31, mutualFriends: 4, time: '2 小时' },
  { id: 2, name: 'Marie Laurent', avatar: 'ML', level: 45, mutualFriends: 11, time: '5 小时' },
  { id: 3, name: 'Takeshi Yamamoto', avatar: 'TY', level: 28, mutualFriends: 2, time: '1 天前' },
]

const friendsList: Friend[] = [
  { id: 1, name: 'Hugo Silva', avatar: 'HS', level: 35, online: true, language: '葡萄牙语' },
  { id: 2, name: 'Sofia Garcia', avatar: 'SG', level: 52, online: true, language: '西班牙语' },
  { id: 3, name: 'Luna Chen', avatar: 'LC', level: 42, online: false, language: '日语' },
  { id: 4, name: 'Marcus Wei', avatar: 'MW', level: 38, online: true, language: '韩语' },
  { id: 5, name: 'Aria Zhang', avatar: 'AZ', level: 47, online: false, language: '德语' },
  { id: 6, name: 'Noah Li', avatar: 'NL', level: 33, online: true, language: '意大利语' },
]

const tabItems = [
  { key: 'feed', label: '好友动', icon: Flame },
  { key: 'discover', label: '发现好友', icon: UserPlus },
  { key: 'requests', label: '好友请求', icon: Bell },
]

const activityIcons: Record<string, React.ElementType> = {
  course: BookOpen,
  lesson: BookOpen,
  milestone: Trophy,
  streak: Flame,
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24 },
  },
}

function Social() {
  const [activeTab, setActiveTab] = useState('feed')
  const [searchQuery, setSearchQuery] = useState('')
  const [friendStatus, setFriendStatus] = useState<Record<number, boolean>>(
    Object.fromEntries(suggestions.filter((s) => s.isFriend).map((s) => [s.id, true])),
  )
  const [requests, setRequests] = useState(pendingRequests)

  const filteredSuggestions = suggestions.filter(
    (s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleFollow = (id: number) => {
    setFriendStatus((prev) => ({ ...prev, [id]: true }))
    ;(window as any).toast('好友请求已发送', 'success')
  }

  const handleAccept = (id: number) => {
    setRequests((prev) => prev.filter((r) => r.id !== id))
    ;(window as any).toast('已接受好友请求', 'success')
  }

  const handleReject = (id: number) => {
    setRequests((prev) => prev.filter((r) => r.id !== id))
    ;(window as any).toast('已拒绝好友请求', 'info')
  }

  return (
    <div className="flex h-full gap-6 p-6">
      <div className="flex-1 space-y-6 min-w-0">
        <motion.h1
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold gradient-text"
        >
          社交中心
        </motion.h1>

        <div className="flex items-center gap-1.5 p-1.5 rounded-[2rem] bg-[var(--bg-card)]/80 border border-black/[0.03]">
          {tabItems.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <Tooltip key={tab.key} content={`查看${tab.label}`}>
                <button
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="social-tab-bg"
                      className="absolute inset-0 rounded-full bg-gradient-to-r from-white/90 to-[var(--bg-secondary)]/90"
                      transition={{ type: 'spring' as const, stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className="relative z-10 w-4 h-4" />
                  <span className="relative z-10">{tab.label}</span>
                  {tab.key === 'requests' && requests.length > 0 && (
                    <span className="relative z-10 flex items-center justify-center w-5 h-5 text-[11px] font-bold text-[var(--text-primary)] bg-white rounded-full">
                      {requests.length}
                    </span>
                  )}
                </button>
              </Tooltip>
            )
          })}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'feed' && (
            <motion.div
              key="feed"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {activities.map((a) => {
                const ActionIcon = activityIcons[a.type]
                return (
                  <motion.div
                    key={a.id}
                    variants={itemVariants}
                    className="flex items-center gap-4 p-4 rounded-[2rem] bg-[var(--bg-elevated)]/60 border border-black/[0.03] card-liquid hover:border-black/10 transition-all duration-300"
                  >
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-black/10 to-black/20 border border-black/10 flex items-center justify-center text-sm font-bold text-[var(--accent-secondary)]/80">
                      {a.user.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)] text-sm">
                          {a.user.name}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] bg-black/[0.03] px-2 py-0.5 rounded-full">
                          Lv.{a.user.level}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                        {a.action}{' '}
                        <span className="text-[var(--text-primary)]/80">{a.detail}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] flex-shrink-0">
                      <ActionIcon className="w-3.5 h-3.5 text-[var(--accent-secondary)]/60" />
                      <span>{a.time}</span>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}

          {activeTab === 'discover' && (
            <motion.div
              key="discover"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="搜索用户..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-[2rem] bg-[var(--bg-elevated)]/60 border border-black/[0.03] text-[var(--text-primary)] text-sm placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-primary)]/30 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredSuggestions.map((s) => {
                    const isFriend = friendStatus[s.id]
                    return (
                      <motion.div
                        key={s.id}
                        variants={itemVariants}
                        className="flex items-center gap-4 p-4 rounded-[2rem] bg-[var(--bg-elevated)]/60 border border-black/[0.03] card-liquid hover:border-black/10 transition-all duration-300"
                      >
                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-black/10 to-black/20 border border-black/10 flex items-center justify-center text-base font-bold text-[var(--accent-secondary)]/80">
                          {s.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)] text-sm">
                              {s.name}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)] bg-black/[0.03] px-2 py-0.5 rounded-full">
                              Lv.{s.level}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {s.language} · {s.mutualFriends} 个共同好?
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (!isFriend) handleFollow(s.id)
                          }}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 ${
                            isFriend
                              ? 'bg-black/10 text-[var(--text-secondary)] border border-black/10 cursor-default'
                              : 'bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-secondary)] border border-transparent'
                          }`}
                        >
                          {isFriend ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5" /> 已关?
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" /> 关注
                            </>
                          )}
                        </button>
                      </motion.div>
                    )
                  })}
                </div>

              {filteredSuggestions.length === 0 && (
                <p className="text-center text-[var(--text-muted)] py-8 text-sm">
                  没有找到匹配的用?
                </p>
              )}
            </motion.div>
          )}

          {activeTab === 'requests' && (
            <motion.div
              key="requests"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {requests.length === 0 ? (
                <EmptyState icon={<UserPlus size={48} />} title="暂无好友请求" description="当有好友请求时会显示在这里" />
              ) : (
                requests.map((r) => (
                  <motion.div
                    key={r.id}
                    variants={itemVariants}
                    className="flex items-center gap-4 p-4 rounded-[2rem] bg-[var(--bg-elevated)]/60 border border-black/[0.03] card-liquid hover:border-black/10 transition-all duration-300"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-black/10 to-black/20 border border-black/10 flex items-center justify-center text-base font-bold text-[var(--accent-secondary)]/80">
                      {r.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)] text-sm">
                          {r.name}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] bg-black/[0.03] px-2 py-0.5 rounded-full">
                          Lv.{r.level}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {r.mutualFriends} 个共同好?· {r.time}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Tooltip content="接受好友请求">
                        <button
                          onClick={() => handleAccept(r.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-xs font-medium hover:bg-[var(--accent-secondary)] transition-all"
                        >
                          <Check className="w-3.5 h-3.5" /> 接受
                        </button>
                      </Tooltip>
                      <Tooltip content="拒绝好友请求">
                        <button
                          onClick={() => handleReject(r.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-black/[0.03] text-[var(--text-muted)] text-xs font-medium hover:bg-black/5 hover:text-[var(--text-primary)] transition-all border border-black/[0.03]"
                        >
                          <X className="w-3.5 h-3.5" /> 拒绝
                        </button>
                      </Tooltip>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-72 flex-shrink-0">
        <div className="sticky top-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              好友列表
            </h2>
            <span className="text-[11px] text-[var(--text-muted)] bg-black/[0.03] px-2.5 py-0.5 rounded-full">
              {friendsList.length} ?
            </span>
          </div>

          <div className="space-y-2">
            {friendsList.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="flex items-center gap-3 p-3 rounded-[2rem] bg-[var(--bg-elevated)]/60 border border-black/[0.03] card-liquid hover:border-black/10 transition-all duration-300 cursor-pointer"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-black/10 to-black/20 border border-black/10 flex items-center justify-center text-xs font-bold text-[var(--accent-secondary)]/80">
                    {f.avatar}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-primary)] ${
                      f.online ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-secondary)]'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {f.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] bg-black/[0.03] px-1.5 py-0.5 rounded-full flex-shrink-0">
                      Lv.{f.level}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {f.language} · {f.online ? '在线' : '离线'}
                  </p>
                </div>
                <MessageCircle className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors flex-shrink-0" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Social
