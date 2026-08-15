import React, { useEffect, useState, Suspense, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store/useStore'
import Navbar from './components/Navbar'
import Toast from './components/Toast'
import OnboardingTutorial from './components/OnboardingTutorial'
import AutoBugDetector from './components/AutoBugDetector'
import PrivacyAgreement from './components/PrivacyAgreement'
import FeedbackButton from './components/FeedbackButton'
import AIChatButton from './components/AIChatButton'
import ErrorBoundary from './components/ErrorBoundary'
import SuspenseFallback from './components/SuspenseFallback'
import NetworkStatus from './components/NetworkStatus'
import CookieConsentBanner from './components/PrivacyBanner'
import { IsolationBanner } from './components/IsolationBanner'
import LangSuggestBanner from './components/LangSuggestBanner'
import AccountStatusBanner from './components/AccountStatusBanner'
import AdminReauthModal from './components/AdminReauthModal'
import { useAdminReauth } from './hooks/useAdminReauth'
import IntroSplash, { shouldShowIntro } from './components/IntroSplash'
import SecurityOnboarding, { hasSeenSecurityOnboarding, resetOnboardingState } from './components/SecurityOnboarding'
import BreathingBackground from './components/BreathingBackground'
import GlobalProcessingOverlay from './components/GlobalProcessingOverlay'
import VersionUpdatePrompt from './components/VersionUpdatePrompt'
import { useReducedMotion, reducedMotionVariants } from './utils/useReducedMotion'
import { initPerformanceMonitor, recordRouteChange } from './utils/performanceMonitor'
import { initResourceHints } from './utils/resourceHints'
import { initSmartPrefetch } from './components/SmartLink'
import { gracefulReload } from './utils/gracefulReload'
import { ROUTES, ROUTES_WILDCARD } from './utils/routePaths'

// 关键首屏页面直接导入，避免懒加载导致首页空白或首次加载抖动
import Auth from './pages/Auth'
import Courses from './pages/Courses'

const Home = React.lazy(() => import('./pages/Home'))
const WordLearn = React.lazy(() => import('./pages/WordLearn'))
const Progress = React.lazy(() => import('./pages/Progress'))
const Community = React.lazy(() => import('./pages/Community'))
const Achievements = React.lazy(() => import('./pages/Achievements'))
const DailyChallenge = React.lazy(() => import('./pages/DailyChallenge'))
const Battle = React.lazy(() => import('./pages/Battle'))
const Profile = React.lazy(() => import('./pages/Profile'))
const Settings = React.lazy(() => import('./pages/Settings'))
const StudyGroups = React.lazy(() => import('./pages/StudyGroups'))
const Messages = React.lazy(() => import('./pages/Messages'))
const VocabTest = React.lazy(() => import('./pages/VocabTest'))
const BugReport = React.lazy(() => import('./pages/BugReport'))
const BugReportHistory = React.lazy(() => import('./pages/BugReportHistory'))
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = React.lazy(() => import('./pages/TermsOfService'))
const Notifications = React.lazy(() => import('./pages/Notifications'))
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'))
const AdminServiceMonitor = React.lazy(() => import('./pages/AdminServiceMonitor'))
const AdminSecurityCenter = React.lazy(() => import('./pages/AdminSecurityCenter'))
const AdminSecurityDefense = React.lazy(() => import('./pages/AdminSecurityDefense'))
const AdminCreateAdmin = React.lazy(() => import('./pages/AdminCreateAdmin'))
const AdminLogin = React.lazy(() => import('./pages/AdminLogin'))
const AIAssistant = React.lazy(() => import('./pages/AIAssistant'))
const SRSReview = React.lazy(() => import('./pages/SRSReview'))
const VoicePractice = React.lazy(() => import('./pages/VoicePractice'))
const Leaderboard = React.lazy(() => import('./pages/Leaderboard'))
const StudyPlanner = React.lazy(() => import('./pages/StudyPlanner'))
const ReadingWriting = React.lazy(() => import('./pages/ReadingWriting'))
const Social = React.lazy(() => import('./pages/Social'))
const LearningStats = React.lazy(() => import('./pages/LearningStats'))
const SecuritySettings = React.lazy(() => import('./pages/SecuritySettings'))
const PrivacySettings = React.lazy(() => import('./pages/PrivacySettings'))
const NotificationSettings = React.lazy(() => import('./pages/NotificationSettings'))
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'))
const AIAgent = React.lazy(() => import('./pages/AIAgent'))
const PrivacyAgreementPage = React.lazy(() => import('./pages/PrivacyAgreementPage'))
const Surveys = React.lazy(() => import('./pages/Surveys'))
const AdminSurveys = React.lazy(() => import('./pages/AdminSurveys'))
const SecurityCenter = React.lazy(() => import('./pages/SecurityCenter'))
const Membership = React.lazy(() => import('./pages/Membership'))
const Appeal = React.lazy(() => import('./pages/Appeal'))
const SecurityPolicyPage = React.lazy(() => import('./pages/SecurityPolicyPage'))
const AdminAppealPanel = React.lazy(() => import('./pages/AdminAppealPanel'))

// 平滑页面切换：使用更长的持续时间和更柔和的缓动，避免 spring 的急促感
// 仅使用 opacity + Y 位移，保证性能；Y 轴移动稍大以增强“进入感”
const pageEase: [number, number, number, number] = [0.22, 1, 0.36, 1]
const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: pageEase },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.22, ease: 'easeOut' as const },
  },
}

function AnimatedPage({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const page = (
    <Suspense fallback={<SuspenseFallback height="calc(100vh - 5rem)" pathname={window.location.pathname} />}>
      {children}
    </Suspense>
  )
  if (reduced) {
    return <motion.div variants={reducedMotionVariants} initial="initial" animate="animate" exit="exit">{page}</motion.div>
  }
  // contain: layout paint style — 让浏览器知道子树互不干扰，复用合成层
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ contain: 'layout paint', willChange: 'opacity, transform' }}
    >
      {page}
    </motion.div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useStore()
  return isAuthenticated ? children : <Navigate to="/auth" replace />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, token } = useStore()
  const [verified, setVerified] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setVerified(false)
      return
    }
    // 向后端验证管理员身份，防止前端 sessionStorage/localStorage 伪造 role
    fetch('/api/admin/isolation', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setVerified(res.ok))
      .catch(() => setVerified(false))
  }, [isAuthenticated, token])

  if (!isAuthenticated) return <Navigate to="/auth" replace />
  if (verified === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[var(--text-muted)]">
        正在验证管理员权限...
      </div>
    )
  }
  if (!verified || user?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function PrivacyRoute({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const privacyAgreed = useStore(s => s.privacyAgreed)

  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setHydrated(true)
    } else {
      const unsub = useStore.persist.onFinishHydration(() => setHydrated(true))
      const fallback = setTimeout(() => setHydrated(true), 400)
      return () => { unsub(); clearTimeout(fallback) }
    }
  }, [])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)] flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-muted)] animate-pulse">正在准备您的体验...</p>
        </motion.div>
      </div>
    )
  }

  if (!privacyAgreed) return <Navigate to="/privacy-agreement" replace />
  return <>{children}</>
}

function App() {
  const location = useLocation()
  const { theme, initAuth, fetchCloudConfig } = useStore()
  const { open: adminReauthOpen, context: adminReauthContext, handleVerified, handleClose } = useAdminReauth()
  const shouldResetOnboarding = new URLSearchParams(window.location.search).get('reset-onboarding') === '1'
  const [showIntro, setShowIntro] = useState(() => {
    if (shouldResetOnboarding) {
      resetOnboardingState()
      return true
    }
    return shouldShowIntro()
  })
  const [showSecurityOnboarding, setShowSecurityOnboarding] = useState(false)
  const routeStartRef = useRef<number>(performance.now())
  const prevPathRef = useRef<string>(location.pathname)

  useEffect(() => {
    // 优先从 localStorage 直接读取持久化的 theme，避免 Zustand persist 异步恢复导致的闪烁
    let effectiveTheme: string
    try {
      const raw = localStorage.getItem('lingualeap-storage')
      if (raw) {
        const parsed = JSON.parse(raw)
        const persistedTheme = parsed?.state?.theme
        if (persistedTheme) {
          effectiveTheme = persistedTheme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : persistedTheme
        } else {
          effectiveTheme = theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : (theme || 'light')
        }
      } else {
        effectiveTheme = theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : (theme || 'light')
      }
    } catch {
      effectiveTheme = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : (theme || 'light')
    }
    document.documentElement.setAttribute('data-theme', effectiveTheme)

    if (theme === 'system') {
      const listener = (e: MediaQueryListEvent) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', listener)
      return () => mq.removeEventListener('change', listener)
    }
  }, [theme])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('lingualeap-storage')
      if (raw) {
        const parsed = JSON.parse(raw)
        const state = parsed?.state
        if (!state || (typeof state === 'string')) {
          localStorage.removeItem('lingualeap-storage')
        }
      }
    } catch {
      localStorage.removeItem('lingualeap-storage')
    }
    initAuth()
    fetchCloudConfig().catch(() => {})
    initPerformanceMonitor()
    initResourceHints()
    initSmartPrefetch()

    // 全局捕获懒加载 chunk 失败，自动刷新以恢复
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message || e.reason || '')
      if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('error loading dynamically imported module')) {
        console.warn('[ChunkLoad] 检测到路由块加载失败，准备优雅刷新', e.reason)
        gracefulReload({ reason: 'chunk-load', message: '页面资源已更新，正在重新加载' })
      }
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [initAuth])

  useEffect(() => {
    // 路由切换耗时监控：从路径变化到下一次渲染后
    routeStartRef.current = performance.now()
    const handle = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const end = performance.now()
        recordRouteChange(prevPathRef.current, location.pathname, routeStartRef.current, end)
        prevPathRef.current = location.pathname
      })
    })
    return () => cancelAnimationFrame(handle)
  }, [location.pathname])

  if (showIntro) {
    return (
      <IntroSplash
        onFinished={() => {
          setShowIntro(false)
          if (!hasSeenSecurityOnboarding()) {
            setShowSecurityOnboarding(true)
          }
        }}
      />
    )
  }

  if (showSecurityOnboarding) {
    return <SecurityOnboarding onFinished={() => setShowSecurityOnboarding(false)} />
  }

  return (
    <div className="min-h-screen relative bg-[var(--bg-primary)]">
      <BreathingBackground />
      <IsolationBanner />
      <LangSuggestBanner />
      {location.pathname !== '/' && <Navbar />}
      <NetworkStatus />
      <main className={location.pathname === '/' ? '' : 'pt-16'}>
        <AccountStatusBanner />
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
          <Route path={ROUTES.appeal} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Appeal /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.securityPolicy} element={<ErrorBoundary><AnimatedPage><SecurityPolicyPage /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.adminAppeals} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><AdminRoute><AdminAppealPanel /></AdminRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.privacyAgreement} element={<ErrorBoundary><AnimatedPage><PrivacyAgreementPage /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.auth} element={<ErrorBoundary><AnimatedPage><Auth /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.adminLogin} element={<ErrorBoundary><AnimatedPage><AdminLogin /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.bugReport} element={<ErrorBoundary><AnimatedPage><BugReport /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.privacy} element={<ErrorBoundary><AnimatedPage><PrivacyPolicy /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.terms} element={<ErrorBoundary><AnimatedPage><TermsOfService /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.forgotPassword} element={<ErrorBoundary><AnimatedPage><ForgotPassword /></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.home} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><Home /></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.courses} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><Courses /></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.learn} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><WordLearn /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.progress} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Progress /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.community} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Community /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.achievements} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Achievements /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.daily} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><DailyChallenge /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.battle} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Battle /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.profile} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Profile /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.settings} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Settings /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.groups} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><StudyGroups /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.messages} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Messages /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.vocabTest} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><VocabTest /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.bugHistory} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><BugReportHistory /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.notifications} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Notifications /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.admin} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><AdminRoute><AdminDashboard /></AdminRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.adminServices} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><AdminRoute><AdminServiceMonitor /></AdminRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.adminCreateAdmin} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><AdminRoute><AdminCreateAdmin /></AdminRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.adminSecurity} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><AdminRoute><AdminSecurityCenter /></AdminRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.adminSecurityDefense} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><AdminRoute><AdminSecurityDefense /></AdminRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.aiAssistant} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><AIAssistant /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.srsReview} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><SRSReview /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.voicePractice} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><VoicePractice /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.leaderboard} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Leaderboard /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.planner} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><StudyPlanner /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.readingWriting} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><ReadingWriting /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.social} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Social /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.learningStats} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><LearningStats /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.security} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><SecuritySettings /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.privacySettings} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><PrivacySettings /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.notificationSettings} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><NotificationSettings /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.aiAgent} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><AIAgent /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.surveys} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Surveys /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.adminSurveys} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><AdminRoute><AdminSurveys /></AdminRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.securityCenter} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><SecurityCenter /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES.membership} element={<ErrorBoundary><AnimatedPage><PrivacyRoute><ProtectedRoute><Membership /></ProtectedRoute></PrivacyRoute></AnimatedPage></ErrorBoundary>} />
          <Route path={ROUTES_WILDCARD} element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>
      <Toast />
      <PrivacyAgreement />
      <FeedbackButton />
      <AIChatButton />
      <CookieConsentBanner />
      <OnboardingTutorial />
      <AutoBugDetector />
      <VersionUpdatePrompt />
      <GlobalProcessingOverlay />
      <AdminReauthModal
        open={adminReauthOpen}
        title="敏感操作确认"
        description={adminReauthContext.message || '为保障账号安全，执行此操作前请再次验证管理员身份。'}
        onClose={handleClose}
        onVerified={handleVerified}
      />
    </div>
  )
}

export default App