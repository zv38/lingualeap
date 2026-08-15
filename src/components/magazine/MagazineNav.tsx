import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const navLinks = [
  { label: '课程', href: '#courses' },
  { label: '学习路径', href: '#path' },
  { label: '学员故事', href: '#stories' },
  { label: '开始', href: '#start' },
]

export default function MagazineNav() {
  const { isAuthenticated, user } = useStore()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault()
      const el = document.querySelector(href)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      }
      setMobileOpen(false)
    }
  }

  return (
    <>
      <nav className={`magazine-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="magazine-container magazine-nav-inner">
          <Link to="/" className="magazine-logo">
            <div className="magazine-logo-mark">L</div>
            LinguaLeap
          </Link>

          <div className="magazine-nav-links">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={(e) => handleNavClick(e, link.href)}>
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <button
                className="magazine-nav-cta hidden sm:inline-flex"
                onClick={() => navigate(user?.role === 'admin' ? '/admin' : '/courses')}
              >
                进入学习
              </button>
            ) : (
              <Link to="/auth" className="magazine-nav-cta hidden sm:inline-flex">
                免费开始学习
              </Link>
            )}

            <button
              type="button"
              className="magazine-mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="打开菜单"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed top-0 right-0 bottom-0 w-[min(320px,85vw)] z-[70] bg-[var(--mag-surface)] border-l border-[var(--mag-border)] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-10">
                <Link to="/" className="magazine-logo" onClick={() => setMobileOpen(false)}>
                  <div className="magazine-logo-mark">L</div>
                  LinguaLeap
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--mag-text-2)] hover:bg-[var(--mag-border)] transition-colors"
                  aria-label="关闭菜单"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={(e) => handleNavClick(e, link.href)}
                    className="px-4 py-3 rounded-xl text-[var(--mag-text)] font-medium hover:bg-[var(--mag-bg)] transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              <div className="absolute left-6 right-6 bottom-8">
                {isAuthenticated ? (
                  <button
                    className="magazine-nav-cta w-full justify-center"
                    onClick={() => {
                      setMobileOpen(false)
                      navigate(user?.role === 'admin' ? '/admin' : '/courses')
                    }}
                  >
                    进入学习
                  </button>
                ) : (
                  <Link
                    to="/auth"
                    className="magazine-nav-cta w-full justify-center inline-flex"
                    onClick={() => setMobileOpen(false)}
                  >
                    免费开始学习
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
