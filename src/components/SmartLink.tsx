import { Link, useNavigate } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { useRef, useCallback } from 'react'

// Network Information API 类型补丁（部分浏览器已支持，TypeScript lib 未包含）
interface NetworkInformationPatch {
  saveData?: boolean
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g'
}

// 智能链接：基于用户行为、网络状态、视口位置的多策略预加载系统
// 目标：实现接近瞬开的页面切换，同时避免浪费用户带宽与设备算力

const prefetchedChunks = new Set<string>()
const prefetchedData = new Set<string>()
const pendingPrefetch = new Set<string>()

// 预加载预算：同时最多 2 个 chunk + 2 个数据请求，避免拥塞
const MAX_CONCURRENT_CHUNK = 2
const MAX_CONCURRENT_DATA = 2
let activeChunkLoads = 0
let activeDataLoads = 0

function canLoadMoreChunk() {
  return activeChunkLoads < MAX_CONCURRENT_CHUNK
}
function canLoadMoreData() {
  return activeDataLoads < MAX_CONCURRENT_DATA
}

const routeMap: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/Home'),
  '/courses': () => import('../pages/Courses'),
  '/membership': () => import('../pages/Membership'),
  '/notifications': () => import('../pages/Notifications'),
  '/security-center': () => import('../pages/SecurityCenter'),
  '/profile': () => import('../pages/Profile'),
  '/settings': () => import('../pages/Settings'),
  '/learning-stats': () => import('../pages/LearningStats'),
  '/leaderboard': () => import('../pages/Leaderboard'),
  '/planner': () => import('../pages/StudyPlanner'),
  '/community': () => import('../pages/Community'),
  '/achievements': () => import('../pages/Achievements'),
  '/daily-challenge': () => import('../pages/DailyChallenge'),
  '/daily': () => import('../pages/DailyChallenge'),
  '/battle': () => import('../pages/Battle'),
  '/word-learn': () => import('../pages/WordLearn'),
  '/learn/word': () => import('../pages/WordLearn'),
  '/learn/listening': () => import('../pages/ListeningLearn'),
  '/learn/speaking': () => import('../pages/SpeakingLearn'),
  '/learn/grammar': () => import('../pages/GrammarLearn'),
  '/ai-assistant': () => import('../pages/AIAssistant'),
  '/ai-agent': () => import('../pages/AIAgent'),
  '/srs-review': () => import('../pages/SRSReview'),
  '/voice-practice': () => import('../pages/VoicePractice'),
  '/reading-writing': () => import('../pages/ReadingWriting'),
  '/social': () => import('../pages/Social'),
  '/progress': () => import('../pages/Progress'),
  '/bug-report': () => import('../pages/BugReport'),
  '/bug-history': () => import('../pages/BugReportHistory'),
  '/notifications-settings': () => import('../pages/NotificationSettings'),
  '/privacy-settings': () => import('../pages/PrivacySettings'),
  '/security': () => import('../pages/SecuritySettings'),
  '/admin': () => import('../pages/AdminDashboard'),
  '/admin/service-monitor': () => import('../pages/AdminServiceMonitor'),
  '/admin/surveys': () => import('../pages/AdminSurveys'),
}

const dataPrefetchMap: Record<string, string> = {
  '/membership': '/api/membership',
  '/notifications': '/api/notifications',
  '/profile': '/api/profile',
  '/learning-stats': '/api/learning/stats',
  '/leaderboard': '/api/leaderboard',
  '/courses': '/api/courses',
  '/community': '/api/community/posts',
  '/achievements': '/api/achievements',
  '/daily': '/api/daily-challenge',
  '/daily-challenge': '/api/daily-challenge',
}

// 网络状态感知：慢网/省流量模式下减少预加载
function getNetworkState(): 'fast' | 'slow' | 'save-data' {
  const nav = navigator as Navigator & { connection?: NetworkInformationPatch }
  if ('connection' in nav) {
    const c = nav.connection
    if (c?.saveData) return 'save-data'
    const effectiveType = c?.effectiveType
    if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'slow'
    if (effectiveType === '3g') return 'slow'
  }
  if (navigator.onLine === false) return 'slow'
  return 'fast'
}

function shouldPrefetch(): boolean {
  const state = getNetworkState()
  if (state === 'save-data') return false
  if (state === 'slow') {
    // 慢网只预加载最高频页面，且必须有用户明确意图（hover/focus）
    return false
  }
  return true
}

function scheduleIdle(task: () => void, timeout = 800) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout })
  } else {
    setTimeout(task, 100)
  }
}

function prefetchRoute(path: string, eager = false) {
  if (prefetchedChunks.has(path) || pendingPrefetch.has(path)) return
  const loader = routeMap[path]
  if (!loader) return

  pendingPrefetch.add(path)

  const run = () => {
    if (!canLoadMoreChunk()) {
      scheduleIdle(run, 500)
      return
    }
    activeChunkLoads++
    prefetchedChunks.add(path)
    loader()
      .catch(() => {})
      .finally(() => {
        pendingPrefetch.delete(path)
        activeChunkLoads = Math.max(0, activeChunkLoads - 1)
      })
  }

  if (eager) {
    run()
  } else {
    scheduleIdle(run, shouldPrefetch() ? 500 : 2000)
  }
}

function prefetchData(path: string, eager = false) {
  const apiPath = dataPrefetchMap[path]
  if (!apiPath || prefetchedData.has(apiPath)) return

  const run = () => {
    if (!canLoadMoreData()) {
      scheduleIdle(run, 600)
      return
    }
    activeDataLoads++
    prefetchedData.add(apiPath)
    fetch(apiPath, { credentials: 'include' })
      .catch(() => {})
      .finally(() => {
        activeDataLoads = Math.max(0, activeDataLoads - 1)
      })
  }

  if (eager) {
    run()
  } else {
    scheduleIdle(run, shouldPrefetch() ? 800 : 3000)
  }
}

// 用户行为学习：记录访问频次，用于排序 viewport 内自动预加载优先级
const USAGE_KEY = 'll:route-usage'
const USAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface UsageEntry {
  count: number
  lastAt: number
}

function readUsage(): Record<string, UsageEntry> {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, UsageEntry>
    const now = Date.now()
    Object.keys(parsed).forEach(k => {
      if (now - parsed[k].lastAt > USAGE_MAX_AGE_MS) delete parsed[k]
    })
    return parsed
  } catch {
    return {}
  }
}

function recordRouteUsage(path: string) {
  try {
    const usage = readUsage()
    usage[path] = {
      count: (usage[path]?.count || 0) + 1,
      lastAt: Date.now(),
    }
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
  } catch {}
}

function getRoutePriority(path: string): number {
  const usage = readUsage()[path]
  return usage ? usage.count : 0
}

// viewport 内链接自动预加载：在页面稳定后，按用户历史行为排序预加载可见链接
function autoPrefetchVisibleLinks() {
  if (!shouldPrefetch()) return
  if (typeof document === 'undefined') return

  const links = Array.from(document.querySelectorAll('a[href^="/"]'))
  const visiblePaths = links
    .map(a => {
      const rect = a.getBoundingClientRect()
      const path = a.getAttribute('href') || ''
      return { path, visible: rect.top < window.innerHeight + 200 && rect.bottom > -200 }
    })
    .filter(x => x.visible && routeMap[x.path])
    .sort((a, b) => getRoutePriority(b.path) - getRoutePriority(a.path))
    .slice(0, 4)

  visiblePaths.forEach((x, i) => {
    setTimeout(() => {
      prefetchRoute(x.path)
      prefetchData(x.path)
    }, i * 250)
  })
}

// 指针速度检测：快速划过（鼠标移动过快）时不预加载，避免误触发
function isHoverIntent(e: React.MouseEvent): boolean {
  if (!(e.nativeEvent instanceof MouseEvent)) return true
  const ev = e.nativeEvent
  const speed = Math.hypot(ev.movementX, ev.movementY)
  return speed < 25
}

let autoPrefetchTimer: number | null = null
export function initSmartPrefetch() {
  if (autoPrefetchTimer) return
  // 页面加载完成 2 秒后，视口稳定，开始自动预加载
  const start = () => {
    autoPrefetchVisibleLinks()
    autoPrefetchTimer = window.setInterval(autoPrefetchVisibleLinks, 8000)
  }
  if (document.readyState === 'complete') {
    setTimeout(start, 2000)
  } else {
    window.addEventListener('load', () => setTimeout(start, 2000))
  }
}

export function stopSmartPrefetch() {
  if (autoPrefetchTimer) {
    clearInterval(autoPrefetchTimer)
    autoPrefetchTimer = null
  }
}

interface SmartLinkProps extends LinkProps {
  prefetch?: boolean
}

export function SmartLink({ to, prefetch = true, onMouseEnter, onFocus, onClick, ...props }: SmartLinkProps) {
  const path = typeof to === 'string' ? to : to.pathname || ''
  const lastEnterRef = useRef(0)

  const doPrefetch = useCallback((eager = false) => {
    if (!prefetch || !path) return
    prefetchRoute(path, eager)
    prefetchData(path, eager)
  }, [prefetch, path])

  const handleEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (prefetch && path && isHoverIntent(e)) {
      doPrefetch(true)
    }
    lastEnterRef.current = Date.now()
    onMouseEnter?.(e)
  }

  const handleFocus = (e: React.FocusEvent<HTMLAnchorElement>) => {
    doPrefetch(true)
    onFocus?.(e)
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    recordRouteUsage(path)
    onClick?.(e)
  }

  return <Link to={to} onMouseEnter={handleEnter} onFocus={handleFocus} onClick={handleClick} {...props} />
}

export function SmartNavButton({ to, prefetch = true, children, className, onClick }: {
  to: string
  prefetch?: boolean
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const navigate = useNavigate()

  const handleMouseEnter = () => {
    if (prefetch) {
      prefetchRoute(to, true)
      prefetchData(to, true)
    }
  }

  return (
    <button
      className={className}
      onMouseEnter={handleMouseEnter}
      onClick={() => {
        recordRouteUsage(to)
        onClick?.()
        navigate(to)
      }}
    >
      {children}
    </button>
  )
}

// 程序化预加载接口：供页面逻辑在特定时机触发（如完成课程后预加载成就页）
export function preloadRoute(path: string) {
  prefetchRoute(path, true)
  prefetchData(path, true)
}

export { getNetworkState, readUsage, recordRouteUsage }
