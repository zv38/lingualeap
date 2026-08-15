import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Users, Plus, Search, MessageCircle, LogIn } from 'lucide-react'
import { mockStudyGroups } from '../data/mockData'
import Tooltip from '../components/Tooltip'
import EmptyState from '../components/EmptyState'

const StudyGroups = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [joinedGroups, setJoinedGroups] = useState<string[]>([])
  const [newGroup, setNewGroup] = useState({ name: '', description: '', language: 'english' })

  const filteredGroups = mockStudyGroups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const languageMap: Record<string, string> = {
    english: '英语',
    japanese: '日语',
    korean: '韩语',
  }

  const handleJoin = (groupId: string) => {
    const isJoining = !joinedGroups.includes(groupId)
    setJoinedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    )
    ;(window as any).toast(isJoining ? '已加入小组' : '已退出小组', isJoining ? 'success' : 'info')
  }

  const handleCreate = () => {
    setIsCreating(false)
    setNewGroup({ name: '', description: '', language: 'english' })
    ;(window as any).toast('小组创建成功', 'success')
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
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10"
        >
          <div>
            <h1 className="font-serif text-4xl gradient-text mb-3">学习小组</h1>
            <p className="font-serif italic text-[var(--text-secondary)] text-lg">找到志同道合的学习伙</p>
          </div>
          <Tooltip content="创建新小组">
          <button
            onClick={() => setIsCreating(true)}
            className="btn-amber rounded-full px-6 py-3 flex items-center gap-2"
          >
            <Plus size={18} />
            <span>创建小组</span>
          </button>
        </Tooltip>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          className="mb-10"
        >
          <div className="liquid-glass rounded-full px-6 py-3 flex items-center gap-3 max-w-md">
            <Search size={18} className="text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="搜索小组..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none text-sm"
            />
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 + index * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
              className="liquid-glass card-liquid rounded-[2rem] p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-serif text-xl text-[var(--text-primary)]">{group.name}</h3>
                <span className="liquid-glass-mono px-3 py-1 rounded-full text-xs text-[var(--accent-primary)]">
                  {languageMap[group.language]}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">{group.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {group.members.slice(0, 3).map((_, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 ring-2 ring-[var(--bg-primary)] flex items-center justify-center"
                      >
                        <Users size={12} className="text-[var(--accent-primary)]" />
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-[var(--text-muted)] font-mono">{group.members.length} </span>
                </div>
                <Tooltip content={joinedGroups.includes(group.id) ? '退出小组' : '加入小组'}>
                <button
                  onClick={() => handleJoin(group.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all ${
                    joinedGroups.includes(group.id)
                      ? 'btn-ghost'
                      : 'btn-amber'
                  }`}
                >
                  {joinedGroups.includes(group.id) ? (
                    <>
                      <MessageCircle size={14} />
                      <span>已加</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={14} />
                      <span>加入</span>
                    </>
                  )}
                </button>
              </Tooltip>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredGroups.length === 0 && (
          <EmptyState icon={<Users size={48} />} title="未找到小组" description="尝试其他关键词，或创建一个新小组" />
        )}
      </div>

      <AnimatePresence>
        {isCreating && (
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
              className="liquid-glass rounded-[2rem] p-8 w-full max-w-md"
            >
              <h2 className="font-serif text-2xl gradient-text mb-6">创建小组</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-muted)] font-mono mb-2 block">小组名称</label>
                  <input
                    type="text"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    placeholder="输入小组名称"
                    className="w-full liquid-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 placeholder-[var(--text-secondary)]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] font-mono mb-2 block">描述</label>
                  <textarea
                    value={newGroup.description}
                    onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                    placeholder="描述一下你们的小组..."
                    rows={3}
                    className="w-full liquid-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 resize-none placeholder-[var(--text-secondary)]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] font-mono mb-2 block">语言</label>
                  <select
                    value={newGroup.language}
                    onChange={(e) => setNewGroup({ ...newGroup, language: e.target.value })}
                    className="w-full liquid-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 appearance-none cursor-pointer"
                  >
                    <option value="english" className="bg-[var(--bg-primary)]">英语</option>
                    <option value="japanese" className="bg-[var(--bg-primary)]">日语</option>
                    <option value="korean" className="bg-[var(--bg-primary)]">韩语</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  onClick={handleCreate}
                  className="btn-amber rounded-full px-6 py-3 flex-1"
                >
                  创建
                </button>
                <button
                  onClick={() => setIsCreating(false)}
                  className="btn-ghost rounded-full px-6 py-3 flex-1"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default StudyGroups

