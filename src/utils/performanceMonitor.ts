// 性能监控：采集 Web Vitals、路由切换耗时、API 响应耗时与缓存命中率
// 数据仅在本地聚合，不上传，保护用户隐私

interface PerfMetric {
  name: string
  value: number
  unit: 'ms' | 's' | 'ratio'
  timestamp: number
  meta?: Record<string, unknown>
}

interface RouteTiming {
  path: string
  duration: number
  loadedAt: number
}

interface ApiTiming {
  path: string
  duration: number
  cached: boolean
  status: number
  at: number
}

const metrics: PerfMetric[] = []
const routeTimings: RouteTiming[] = []
const apiTimings: ApiTiming[] = []
const MAX_HISTORY = 50

function pushMetric(metric: PerfMetric) {
  metrics.unshift(metric)
  if (metrics.length > MAX_HISTORY) metrics.pop()
}

function getNavigationTiming(): PerformanceNavigationTiming | null {
  const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  return entries[0] || null
}

export function initPerformanceMonitor() {
  if (typeof window === 'undefined') return

  if (!('PerformanceObserver' in window)) {
    // 浏览器不支持 PerformanceObserver，降级为 load 事件采集
    captureFallbackMetrics()
    return
  }

  // 分别注册各个 Web Vitals 类型的 PerformanceObserver（避免使用不支持的 'web-vitals' 复合类型）
  const vitalsTypes = [
    { type: 'largest-contentful-paint', handler: (entry: PerformanceEntry) => {
      pushMetric({ name: 'LCP', value: entry.startTime, unit: 'ms', timestamp: Date.now() })
    }},
    { type: 'layout-shift', handler: (entry: PerformanceEntry) => {
      const clsValue = (entry as PerformanceEntry & { value?: number }).value || 0
      pushMetric({ name: 'CLS', value: clsValue, unit: 'ratio', timestamp: Date.now() })
    }},
    { type: 'first-contentful-paint', handler: (entry: PerformanceEntry) => {
      pushMetric({ name: 'FCP', value: entry.startTime, unit: 'ms', timestamp: Date.now() })
    }},
    { type: 'first-input', handler: (entry: PerformanceEntry) => {
      pushMetric({ name: 'FID', value: entry.startTime, unit: 'ms', timestamp: Date.now() })
    }},
  ]

  for (const { type, handler } of vitalsTypes) {
    try {
      const obs = new PerformanceObserver(list => {
        list.getEntries().forEach(handler)
      })
      obs.observe({ type, buffered: true } as PerformanceObserverInit)
    } catch {
      // 当前浏览器不支持该类型，静默跳过
    }
  }

  // 导航时间采集
  try {
    const navObserver = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        const nav = entry as PerformanceNavigationTiming
        pushMetric({ name: 'DOMContentLoaded', value: nav.domContentLoadedEventEnd - nav.startTime, unit: 'ms', timestamp: Date.now() })
        pushMetric({ name: 'LoadComplete', value: nav.loadEventEnd - nav.startTime, unit: 'ms', timestamp: Date.now() })
      })
    })
    navObserver.observe({ type: 'navigation', buffered: true })
  } catch {}

  // 首次页面加载指标（load 事件补全）
  window.addEventListener('load', () => {
    setTimeout(() => {
      const nav = getNavigationTiming()
      if (nav) {
        pushMetric({ name: 'TTFB', value: nav.responseStart - nav.startTime, unit: 'ms', timestamp: Date.now() })
      }
    }, 0)
  })
}

/** 降级方案：在 PerformanceObserver 不可用时通过 load 事件采集基础指标 */
function captureFallbackMetrics() {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const nav = getNavigationTiming()
      if (nav) {
        pushMetric({ name: 'TTFB', value: nav.responseStart - nav.startTime, unit: 'ms', timestamp: Date.now() })
        pushMetric({ name: 'FCP', value: nav.responseEnd - nav.startTime, unit: 'ms', timestamp: Date.now() })
        pushMetric({ name: 'DOMContentLoaded', value: nav.domContentLoadedEventEnd - nav.startTime, unit: 'ms', timestamp: Date.now() })
        pushMetric({ name: 'LoadComplete', value: nav.loadEventEnd - nav.startTime, unit: 'ms', timestamp: Date.now() })
      }
    }, 0)
  })
}

export function recordRouteChange(from: string, to: string, startTime: number, endTime: number) {
  const duration = endTime - startTime
  routeTimings.unshift({ path: to, duration, loadedAt: endTime })
  if (routeTimings.length > MAX_HISTORY) routeTimings.pop()
  pushMetric({
    name: 'RouteChange',
    value: duration,
    unit: 'ms',
    timestamp: endTime,
    meta: { from, to },
  })
}

export function recordApiCall(path: string, duration: number, cached: boolean, status: number) {
  apiTimings.unshift({ path, duration, cached, status, at: Date.now() })
  if (apiTimings.length > MAX_HISTORY) apiTimings.pop()
  pushMetric({
    name: 'ApiCall',
    value: duration,
    unit: 'ms',
    timestamp: Date.now(),
    meta: { path, cached, status },
  })
}

export function getCacheHitRate(minutes = 5): number {
  const cutoff = Date.now() - minutes * 60 * 1000
  const recent = apiTimings.filter(t => t.at > cutoff)
  if (recent.length === 0) return 0
  const hits = recent.filter(t => t.cached).length
  return Math.round((hits / recent.length) * 1000) / 1000
}

export function getAverageRouteTime(minutes = 5): number {
  const cutoff = Date.now() - minutes * 60 * 1000
  const recent = routeTimings.filter(t => t.loadedAt > cutoff)
  if (recent.length === 0) return 0
  return recent.reduce((sum, t) => sum + t.duration, 0) / recent.length
}

export function getSlowestRoutes(limit = 5): RouteTiming[] {
  const map = new Map<string, RouteTiming>()
  routeTimings.forEach(t => {
    const existing = map.get(t.path)
    if (!existing || t.duration > existing.duration) {
      map.set(t.path, t)
    }
  })
  return Array.from(map.values()).sort((a, b) => b.duration - a.duration).slice(0, limit)
}

export function getMetricsSummary() {
  return {
    cacheHitRate: getCacheHitRate(),
    avgRouteTime: getAverageRouteTime(),
    slowestRoutes: getSlowestRoutes(),
    recentMetrics: metrics.slice(0, 20),
  }
}

export function exportMetrics(): string {
  return JSON.stringify(
    {
      metrics,
      routeTimings,
      apiTimings,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      collectedAt: new Date().toISOString(),
    },
    null,
    2
  )
}

export function clearMetrics() {
  metrics.length = 0
  routeTimings.length = 0
  apiTimings.length = 0
}
