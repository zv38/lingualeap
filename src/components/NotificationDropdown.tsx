import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Bell, Clock, BookOpen, Trophy, Zap, User, Settings, Info, ClipboardList, ShieldAlert, Smartphone, Lock, FileDown } from 'lucide-react'
import { useStore, Notification } from '../store/useStore'

const API_BASE = '/api'

const typeIconMap: Record<string, React.ElementType> = {
  study_reminder: BookOpen,
  streak_alert: Zap,
  achievement_unlocked: Trophy,
  daily_challenge: Zap,
  new_follower: User,
  system: Settings,
  survey: ClipboardList,
  security_alert: ShieldAlert,
  login_new_device: Smartphone,
  password_changed: Lock,
  data_export: FileDown,
  sensitive_operation: ShieldAlert,
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState<Notification[]>([])
  const navigate = useNavigate()
  const localNotifs = useStore(s => s.notifications)

  useEffect(() => {
    fetch(`${API_BASE}/notifications`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setRemote(data.data.map((n: any) => ({
            id: n.id,
            type: n.type || 'system',
            title: n.title,
            message: n.message || '',
            time: formatTime(n.time),
            read: n.read || false,
            link: n.link || undefined,
          })))
        }
      })
      .catch(() => {})
  }, [open])

  const all = useMemo(() => {
    const seen = new Set<string>()
    return [...remote, ...localNotifs].filter(n => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
  }, [remote, localNotifs])

  const unreadCount = useMemo(() => all.filter(n => !n.read).length, [all])
  const recent = all.slice(0, 5)

  function formatTime(iso: string) {
    try {
      const diff = Date.now() - new Date(iso).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return '刚刚'
      if (mins < 60) return `${mins}分钟前`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}小时前`
      const days = Math.floor(hours / 24)
      if (days < 7) return `${days}天前`
      return new Date(iso).toLocaleDateString('zh-CN')
    } catch {
      return iso
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-elevated)] transition-all"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[var(--warning)] text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
            className="absolute right-0 top-12 w-80 glass-dropdown rounded-[1.5rem] p-2 z-50 shadow-lg"
            onMouseLeave={() => setOpen(false)}
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-black/[0.03]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">通知</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono text-[var(--text-muted)]">{unreadCount} 条未读</span>
              )}
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {recent.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell size={24} className="mx-auto text-[var(--text-muted)]/40 mb-2" />
                  <p className="text-xs text-[var(--text-muted)]">暂无新通知</p>
                </div>
              ) : (
                recent.map(n => {
                  const Icon = typeIconMap[n.type] || Info
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        setOpen(false)
                        fetch(`${API_BASE}/notifications/${n.id}/read`, {
                          method: 'PATCH',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                        }).catch(() => {})
                        setRemote(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item))
                        if (n.link) navigate(n.link)
                        else navigate('/notifications')
                      }}
                      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all hover:bg-[var(--bg-elevated)] ${
                        !n.read ? 'bg-[var(--accent-primary)]/[0.02]' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        !n.read ? 'bg-[var(--accent-primary)]/[0.1]' : 'bg-black/[0.03]'
                      }`}>
                        <Icon size={14} className={!n.read ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium truncate ${
                            !n.read ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                          }`}>{n.title}</span>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] flex-shrink-0" />}
                        </div>
                        {n.message && (
                          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{n.message}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Clock size={10} className="text-[var(--text-muted)]/60" />
                          <span className="text-[10px] text-[var(--text-muted)]/60">{n.time}</span>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            <div className="border-t border-black/[0.03] pt-1">
              <button
                onClick={() => { setOpen(false); navigate('/notifications') }}
                className="w-full px-4 py-2.5 rounded-xl text-xs text-[var(--accent-primary)] hover:bg-[var(--bg-elevated)] transition-all text-center font-medium"
              >
                查看全部通知
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}