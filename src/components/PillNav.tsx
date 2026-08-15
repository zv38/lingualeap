import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import {
  LogOut, Sun, Moon, Shield,
  Home, BookOpen, Brain, TrendingUp, Users, Trophy,
  Zap, Swords, Bug, Bell, Bot, Volume2,
  BarChart3, Calendar, Book, Globe, Award, Sparkles, Target, ChevronDown, MoreHorizontal, ClipboardList
} from 'lucide-react'
import { useStore } from '../store/useStore'
import BrandLogo from './BrandLogo'
import UserAvatar from './UserAvatar'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Tooltip } from './ui/Tooltip'
import './PillNav.css'

const navItems = [
  { path: '/', icon: Home, label: '首页' },
  { path: '/courses', icon: BookOpen, label: '课程' },
  { path: '/learn/word', icon: Brain, label: '学习' },
  { path: '/daily', icon: Zap, label: '挑战' },
  { path: '/battle', icon: Swords, label: '对战' },
  { path: '/progress', icon: TrendingUp, label: '进度' },
]

const navOverflowItems = [
  { path: '/community', icon: Users, label: '社区' },
  { path: '/achievements', icon: Trophy, label: '成就' },
]

const allNavItems = [...navItems, ...navOverflowItems]

const dropdownSections = [
  {
    title: '学习工具',
    items: [
      { path: '/notifications', icon: Bell, label: '通知中心' },
      { path: '/ai-assistant', icon: Bot, label: 'AI助手' },
      { path: '/ai-agent', icon: Sparkles, label: 'AI规划' },
      { path: '/srs-review', icon: Brain, label: '间隔复习' },
      { path: '/voice-practice', icon: Volume2, label: '语音练习' },
    ]
  },
  {
    title: '数据与社交',
    items: [
      { path: '/leaderboard', icon: Award, label: '排行榜' },
      { path: '/planner', icon: Calendar, label: '学习计划' },
      { path: '/reading-writing', icon: Book, label: '阅读写作' },
      { path: '/social', icon: Globe, label: '好友社交' },
      { path: '/learning-stats', icon: BarChart3, label: '学习统计' },
      { path: '/surveys', icon: ClipboardList, label: '调查问卷' },
    ]
  },
  {
    title: '设置与反馈',
    items: [
      { path: '/security', icon: Shield, label: '安全设置' },
      { path: '/privacy-settings', icon: Target, label: '隐私设置' },
      { path: '/notification-settings', icon: Sparkles, label: '通知设置' },
      { path: '/bug-report', icon: Bug, label: 'Bug反馈' },
      { path: '/bug-history', icon: Bell, label: '反馈记录' },
      { path: '/admin', icon: Shield, label: '管理后台', adminOnly: true },
      { path: '/admin/surveys', icon: ClipboardList, label: '问卷管理', adminOnly: true },
    ]
  }
]

export default function PillNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, theme, setTheme } = useStore()

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const circleRefs = useRef<(HTMLSpanElement | null)[]>([])
  const tlRefs = useRef<gsap.core.Timeline[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLAnchorElement>(null)
  const navItemsRef = useRef<HTMLDivElement>(null)
  const liRefs = useRef<(HTMLLIElement | null)[]>([])
  const userSectionRef = useRef<HTMLDivElement>(null)
  const authButtonsRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement | HTMLLIElement>(null)

  useEffect(() => {
    let ctx: gsap.Context | null = null

    ctx = gsap.context(() => {
      const masterTl = gsap.timeline({
        defaults: { ease: 'expo.out' }
      })

      if (containerRef.current) {
        masterTl.fromTo(
          containerRef.current,
          { y: -24, opacity: 0, scale: 0.96 },
          { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out' },
          0
        )
      }

      if (logoRef.current) {
        masterTl.fromTo(
          logoRef.current,
          { scale: 0, rotation: -180, opacity: 0 },
          { scale: 1, rotation: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.4)' },
          0.1
        )
      }

      if (navItemsRef.current) {
        masterTl.fromTo(
          navItemsRef.current,
          { width: 0, overflow: 'hidden' },
          { width: 'auto', overflow: 'visible', duration: 0.5, ease: 'power3.inOut' },
          0.2
        )
      }

      liRefs.current.forEach((li, i) => {
        if (li) {
          masterTl.fromTo(
            li,
            { y: 16, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.38 },
            0.22 + i * 0.055
          )
        }
      })

      const rightSection = user ? userSectionRef.current : authButtonsRef.current
      if (rightSection) {
        masterTl.fromTo(
          rightSection,
          { x: 12, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' },
          0.35 + (navItems.length * 0.055)
        )
      }

      masterTl.call(() => setLoaded(true))
    })

    return () => { ctx?.revert() }
  }, [])

  useEffect(() => {
    const layout = () => {
      circleRefs.current.forEach((circle, i) => {
        if (!circle?.parentElement) return
        const pill = circle.parentElement
        if (!pill) return

        const rect = pill.getBoundingClientRect()
        const w = rect.width
        const h = rect.height
        const R = ((w * w) / 4 + h * h) / (2 * h)
        const D = Math.ceil(2 * R) + 2
        const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1
        const originY = D - delta

        circle.style.width = `${D}px`
        circle.style.height = `${D}px`
        circle.style.bottom = `-${delta}px`

        gsap.set(circle, {
          xPercent: -50,
          scale: 0,
          transformOrigin: `50% ${originY}px`
        })

        const label = pill.querySelector('.pill-label')
        const white = pill.querySelector('.pill-label-hover')

        if (label) gsap.set(label, { y: 0 })
        if (white) gsap.set(white, { y: h + 12, opacity: 0 })

        tlRefs.current[i]?.kill()
        const tl = gsap.timeline({ paused: true })
        tl.to(circle, { scale: 1.15, xPercent: -50, duration: 1.8, ease: 'power3.easeOut', overwrite: 'auto' }, 0)
        if (label) tl.to(label, { y: -(h + 8), duration: 1.8, ease: 'power3.easeOut', overwrite: 'auto' }, 0)
        if (white) {
          gsap.set(white, { y: Math.ceil(h + 100), opacity: 0 })
          tl.to(white, { y: 0, opacity: 1, duration: 1.8, ease: 'power3.easeOut', overwrite: 'auto' }, 0)
        }

        tlRefs.current[i] = tl
      })
    }

    layout()
    const onResize = () => layout()
    window.addEventListener('resize', onResize)
    if (document.fonts?.ready) document.fonts.ready.then(layout).catch(() => {})

    const menu = mobileMenuRef.current
    if (menu) gsap.set(menu, { visibility: 'hidden', opacity: 0, scaleY: 1 })

    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleMobileMenu = () => {
    const newState = !isMobileMenuOpen
    setIsMobileMenuOpen(newState)

    const hamburger = hamburgerRef.current
    const menu = mobileMenuRef.current

    if (hamburger) {
      const lines = hamburger.querySelectorAll('.hamburger-line')
      if (newState) {
        gsap.to(lines[0], { rotation: 45, y: 3, duration: 0.28, ease: 'power2.out' })
        gsap.to(lines[1], { rotation: -45, y: -3, duration: 0.28, ease: 'power2.out' })
      } else {
        gsap.to(lines[0], { rotation: 0, y: 0, duration: 0.28, ease: 'power2.out' })
        gsap.to(lines[1], { rotation: 0, y: 0, duration: 0.28, ease: 'power2.out' })
      }
    }

    if (menu) {
      if (newState) {
        gsap.set(menu, { visibility: 'visible' })
        gsap.fromTo(menu, { opacity: 0, y: 8, scaleY: 1 }, {
          opacity: 1, y: 0, scaleY: 1, duration: 0.3, ease: 'power3.out',
          transformOrigin: 'top center'
        })
      } else {
        gsap.to(menu, {
          opacity: 0, y: 8, scaleY: 1, duration: 0.22, ease: 'power2.in',
          transformOrigin: 'top center',
          onComplete: () => gsap.set(menu, { visibility: 'hidden' })
        })
      }
    }
  }

  const handleLogout = () => {
    setShowLogoutDialog(true)
    setDropdownOpen(false)
  }

  const confirmLogout = () => {
    logout()
    setShowLogoutDialog(false)
    navigate('/auth')
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  const isActive = (path: string) =>
    location.pathname === path || (path === '/learn/word' && location.pathname.startsWith('/learn'))

  const cssVars = {
    '--base': 'var(--bg-primary)',
    '--pill-bg': 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))',
    '--hover-text': '#ffffff',
    '--pill-text': 'var(--text-secondary)',
  }

  return (
    <div className="pill-nav-container" ref={containerRef}>
      <nav className="pill-nav" aria-label="Primary" style={cssVars as React.CSSProperties}>
        <Link
          to="/"
          className="pill-logo"
          aria-label="LinguaLeap 首页"
          ref={logoRef}
        >
          <BrandLogo size={28} animated={false} />
        </Link>

        <div className="pill-nav-items desktop-only" ref={navItemsRef}>
          <ul className="pill-list" role="menubar">
            {navItems.map((item, i) => {
              const active = isActive(item.path)
              return (
                <li
                  key={item.path}
                  role="none"
                  ref={el => { liRefs.current[i] = el }}
                  className={loaded ? 'loaded' : ''}
                >
                  <Link
                    role="menuitem"
                    to={item.path}
                    className={`pill${active ? ' is-active' : ''}`}
                    aria-label={item.label}
                  >
                    <item.icon size={15} strokeWidth={1.75} />
                    <span className="label-stack">
                      <span className="pill-label">{item.label}</span>
                    </span>
                  </Link>
                </li>
              )
            })}

            {navOverflowItems.length > 0 && (
              <li
                role="none"
                ref={el => { liRefs.current[navItems.length] = el; (moreRef as React.MutableRefObject<HTMLDivElement | HTMLLIElement | null>).current = el }}
                className={`pill-more-li ${loaded ? 'loaded' : ''}`}
              >
                <button
                  role="menuitem"
                  className={`pill pill-more-btn ${moreOpen ? ' is-active' : ''}`}
                  onClick={() => setMoreOpen(!moreOpen)}
                  aria-label="更多导航"
                >
                  <MoreHorizontal size={15} strokeWidth={1.75} />
                  <span className="pill-label">更多</span>
                  <ChevronDown size={12} strokeWidth={1.75} className={`pill-more-chevron ${moreOpen ? 'open' : ''}`} />
                </button>

                {moreOpen && (
                  <div className="pill-more-dropdown">
                    {navOverflowItems.map(item => {
                      const Icon = item.icon
                      const active = isActive(item.path)
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`dropdown-item ${active ? 'admin-item' : ''}`}
                          onClick={() => setMoreOpen(false)}
                        >
                          <Icon size={15} strokeWidth={1.75} />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                    <div className="dropdown-divider" />
                    {dropdownSections.flatMap(section => section.items).map(item => {
                      const Icon = item.icon
                      if (item.adminOnly && user?.role !== 'admin') return null
                      const active = isActive(item.path)
                      return (
                        <Link
                          key={`more-${item.path}`}
                          to={item.path}
                          className={`dropdown-item ${active ? 'admin-item' : ''} ${item.adminOnly ? 'admin-item' : ''}`}
                          onClick={() => setMoreOpen(false)}
                        >
                          <Icon size={15} strokeWidth={1.75} />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </li>
            )}
          </ul>
        </div>

        {user ? (
          <div className={`pill-user-section desktop-only ${loaded ? 'loaded' : ''}`} ref={userSectionRef}>
            <Tooltip content="用户菜单" side="bottom">
              <button
                className="pill-user-avatar-btn"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-label="用户菜单"
              >
                <UserAvatar username={user.username} size={30} src={user.avatar} />
              </button>
            </Tooltip>

            <div className={`pill-user-dropdown ${dropdownOpen ? 'open' : ''}`}>
              <div className="dropdown-header">
                <UserAvatar username={user.username} size={40} src={user.avatar} />
                <div className="dropdown-header-info">
                  <div className="dropdown-header-name">{user.username}</div>
                  <div className="dropdown-header-role">
                    {user.role === 'admin' ? '系统管理员' : '学习用户'}
                  </div>
                </div>
              </div>

              {dropdownSections.map((section, si) => (
                <div key={si}>
                  <div className="dropdown-section-title">{section.title}</div>
                  {section.items.map(item => {
                    const Icon = item.icon
                    if (item.adminOnly && user.role !== 'admin') return null
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`dropdown-item ${item.adminOnly ? 'admin-item' : ''}`}
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Icon size={16} strokeWidth={1.75} />
                        <span>{item.label}</span>
                        {item.adminOnly && <Shield size={12} style={{ marginLeft: 'auto', opacity: 0.4 }} />}
                      </Link>
                    )
                  })}
                  {si < dropdownSections.length - 1 && <div className="dropdown-divider" />}
                </div>
              ))}

              <div className="dropdown-footer-actions">
                <button className="dropdown-theme-toggle" onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
                  <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
                </button>
                <button className="dropdown-logout" onClick={handleLogout}>
                  <LogOut size={16} strokeWidth={1.75} />
                  <span>退出登录</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`pill-auth-buttons desktop-only ${loaded ? 'loaded' : ''}`} ref={authButtonsRef}>
            <Link
              to="/auth"
              className="pill"
              style={{ padding: '0 14px', fontSize: '13px', fontWeight: 500 }}
            >
              登录
            </Link>
            <Link
              to="/auth?tab=register"
              className="pill is-active"
              style={{ padding: '0 14px', fontSize: '13px', fontWeight: 600 }}
            >
              注册
            </Link>
          </div>
        )}

        <Tooltip content={isMobileMenuOpen ? '关闭菜单' : '打开菜单'} side="bottom" className="mobile-only">
          <button
            className="mobile-menu-button mobile-only"
            onClick={toggleMobileMenu}
            aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
            ref={hamburgerRef}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </Tooltip>
      </nav>

      <div className="mobile-menu-popover mobile-only" ref={mobileMenuRef}>
        <ul className="mobile-menu-list">
          {allNavItems.map(item => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`mobile-menu-link${isActive(item.path) ? ' is-active' : ''}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
          {dropdownSections.flatMap(section => section.items).map(item => {
            if (item.adminOnly && user?.role !== 'admin') return null
            return (
              <li key={`m-${item.path}`}>
                <Link
                  to={item.path}
                  className={`mobile-menu-link${isActive(item.path) ? ' is-active' : ''}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}

          {user && (
            <>
              <li>
                <button
                  className="mobile-menu-link"
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
                  onClick={() => { toggleTheme(); setIsMobileMenuOpen(false) }}
                >
                  {theme === 'dark' ? '浅色模式' : '深色模式'}
                </button>
              </li>
              <li>
                <button
                  className="mobile-menu-link"
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)' }}
                  onClick={() => { handleLogout(); setIsMobileMenuOpen(false) }}
                >
                  退出登录
                </button>
              </li>
            </>
          )}
        </ul>
      </div>

      <ConfirmDialog
        open={showLogoutDialog}
        title="退出登录"
        description="退出后将清除当前会话，未保存的学习进度可能会丢失。是否确认退出？"
        confirmText="确认退出"
        cancelText="取消"
        variant="warning"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutDialog(false)}
      />
    </div>
  )
}
