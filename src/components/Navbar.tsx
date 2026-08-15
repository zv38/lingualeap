import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { SmartLink } from './SmartLink'
import RippleEffect from './RippleEffect'
import { Home, BookOpen, Brain, TrendingUp, Users, Trophy, LogOut, Menu, X, Zap, Swords, User, Settings, Bug, Shield, Bell, Clock, Bot, BarChart3, Calendar, Book, Globe, Award, Sparkles, Target, Volume2, Moon, Sun, Crown } from 'lucide-react'
import { useStore } from '../store/useStore'
import BrandLogo from './BrandLogo'
import UserAvatar from './UserAvatar'
import NotificationDropdown from './NotificationDropdown'
import { Button } from './ui/Button'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Tooltip } from './ui/Tooltip'

const navItems = [
  { path: '/', icon: Home, label: '首页' },
  { path: '/courses', icon: BookOpen, label: '课程' },
  { path: '/learn/word', icon: Brain, label: '学习' },
  { path: '/daily', icon: Zap, label: '每日挑战' },
  { path: '/battle', icon: Swords, label: '对战' },
  { path: '/progress', icon: TrendingUp, label: '进度' },
  { path: '/community', icon: Users, label: '社区' },
  { path: '/achievements', icon: Trophy, label: '成就' },
]

const dropdownGroups = [
  {
    title: '学习工具',
    items: [
      { path: '/ai-assistant', icon: Bot, label: 'AI 学习助手' },
      { path: '/ai-agent', icon: Sparkles, label: 'AI 学习规划' },
      { path: '/srs-review', icon: Brain, label: '间隔复习' },
      { path: '/voice-practice', icon: Volume2, label: '语音练习' },
      { path: '/reading-writing', icon: Book, label: '阅读写作' },
    ],
  },
  {
    title: '数据与社交',
    items: [
      { path: '/social', icon: Globe, label: '好友社交' },
      { path: '/leaderboard', icon: Award, label: '排行榜' },
      { path: '/learning-stats', icon: BarChart3, label: '学习统计' },
      { path: '/planner', icon: Calendar, label: '学习计划' },
      { path: '/notifications', icon: Bell, label: '通知中心' },
    ],
  },
  {
    title: '设置与反馈',
    items: [
      { path: '/membership', icon: Crown, label: '会员中心' },
      { path: '/profile', icon: User, label: '个人资料' },
      { path: '/settings', icon: Settings, label: '通用设置' },
      { path: '/security', icon: Shield, label: '安全设置' },
      { path: '/privacy-settings', icon: Target, label: '隐私设置' },
      { path: '/notification-settings', icon: Bell, label: '通知设置' },
      { path: '/bug-report', icon: Bug, label: 'Bug 反馈' },
      { path: '/bug-history', icon: Clock, label: '反馈记录' },
    ],
  },
]

export default function Navbar() {
  const location = useLocation()
  const { user, logout, theme, setTheme } = useStore()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleTheme = () => {
    const current = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
    const newTheme = current === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[var(--bg-card)]/85 backdrop-blur-xl border-b border-[var(--border-primary)] shadow-[var(--shadow-sm)]'
            : 'bg-[var(--bg-primary)]/60 backdrop-blur-md border-b border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <SmartLink to="/" className="flex items-center gap-2.5 group">
              <BrandLogo size={28} />
              <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                LinguaLeap
              </span>
            </SmartLink>

            <nav className="hidden lg:flex items-center gap-0.5">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive =
                  location.pathname === item.path ||
                  (item.path === '/learn/word' && location.pathname.startsWith('/learn'))
                return (
                  <RippleEffect key={item.path} color="var(--accent-indigo)" className="rounded-[var(--radius-md)]">
                    <SmartLink
                      to={item.path}
                      className={`relative px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                        isActive
                          ? 'text-[var(--accent-indigo)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="nav-pill"
                          className="absolute inset-0 bg-[var(--accent-indigo)]/10 rounded-[var(--radius-md)]"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        >
                          <span className="absolute inset-0 rounded-[var(--radius-md)] border border-[var(--accent-indigo)]/25 motion-safe:animate-breathe-ring" />
                        </motion.div>
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        <Icon size={16} strokeWidth={1.75} />
                        {item.label}
                      </span>
                    </SmartLink>
                  </RippleEffect>
                )
              })}
            </nav>

            <div className="hidden lg:flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-3" ref={dropdownRef}>
                  <NotificationDropdown />
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <UserAvatar username={user.username} size={28} src={user.avatar} />
                    <span className="text-sm font-medium hidden xl:inline">{user.username}</span>
                    <Menu size={16} />
                  </button>

                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute right-4 top-14 w-64 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-2 z-50 max-h-[70vh] overflow-y-auto"
                      >
                        {dropdownGroups.map((group, idx) => (
                          <div key={group.title}>
                            {idx > 0 && <div className="h-px bg-[var(--border-secondary)] my-1.5" />}
                            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              {group.title}
                            </p>
                            {group.items.map((item) => {
                              const Icon = item.icon
                              if (item.path === '/admin' && user.role !== 'admin') return null
                              return (
                                <SmartLink
                                  key={item.path}
                                  to={item.path}
                                  onClick={() => setDropdownOpen(false)}
                                  className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                                >
                                  <Icon size={16} />
                                  <span>{item.label}</span>
                                </SmartLink>
                              )
                            })}
                          </div>
                        ))}
                        <div className="h-px bg-[var(--border-secondary)] my-1.5" />
                        {user.role === 'admin' && (
                          <SmartLink
                            to="/admin"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)]/5 transition-colors"
                          >
                            <Shield size={16} />
                            <span>管理后台</span>
                          </SmartLink>
                        )}
                        <button
                          onClick={toggleTheme}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
                        >
                          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                          <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
                        </button>
                        <button
                          onClick={() => { setShowLogoutDialog(true); setDropdownOpen(false) }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--error)] hover:bg-[var(--error)]/5 transition-colors text-left"
                        >
                          <LogOut size={16} strokeWidth={1.75} />
                          <span>退出登录</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <SmartLink to="/auth">
                    <Button variant="ghost" size="sm">登录</Button>
                  </SmartLink>
                  <SmartLink to="/auth?tab=register">
                    <Button size="sm">注册</Button>
                  </SmartLink>
                </div>
              )}
            </div>

            <Tooltip content={mobileOpen ? '关闭菜单' : '打开菜单'} side="bottom" className="lg:hidden">
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] rounded-[var(--radius-md)] transition-colors"
                aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
              >
                {mobileOpen ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
              </button>
            </Tooltip>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-[var(--bg-primary)]/98 backdrop-blur-xl lg:hidden pt-20 overflow-y-auto"
          >
            <div className="flex flex-col gap-1 p-4 max-w-md mx-auto pb-8">
              {navItems.map((item, i) => {
                const Icon = item.icon
                const isActive =
                  location.pathname === item.path ||
                  (item.path === '/learn/word' && location.pathname.startsWith('/learn'))
                return (
                  <motion.div
                    key={item.path}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <SmartLink
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] text-base font-medium transition-colors ${
                        isActive
                          ? 'text-[var(--text-primary)] bg-[var(--bg-secondary)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      <Icon size={20} />
                      {item.label}
                    </SmartLink>
                  </motion.div>
                )
              })}
              <div className="h-px bg-[var(--border-secondary)] my-2" />
              {dropdownGroups.flatMap((g) => g.items).map((item, i) => {
                const Icon = item.icon
                if (item.path === '/admin' && user?.role !== 'admin') return null
                return (
                  <motion.div
                    key={item.path}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (navItems.length + i) * 0.04 }}
                  >
                    <SmartLink
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] text-base font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <Icon size={20} />
                      {item.label}
                    </SmartLink>
                  </motion.div>
                )
              })}
              {user && (
                <>
                  <div className="h-px bg-[var(--border-secondary)] my-2" />
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] text-base font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    {theme === 'dark' ? '浅色模式' : '深色模式'}
                  </button>
                  <button
                    onClick={() => { setShowLogoutDialog(true); setMobileOpen(false) }}
                    className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] text-base font-medium text-[var(--error)] hover:bg-[var(--error)]/5 transition-colors"
                  >
                    <LogOut size={20} strokeWidth={1.75} />
                    退出登录
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={showLogoutDialog}
        title="退出登录"
        description="退出后将清除当前会话，未保存的学习进度可能会丢失。是否确认退出？"
        confirmText="确认退出"
        cancelText="取消"
        variant="warning"
        onConfirm={() => { logout(); setShowLogoutDialog(false) }}
        onCancel={() => setShowLogoutDialog(false)}
      />
    </>
  )
}
