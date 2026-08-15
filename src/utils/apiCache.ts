// 智能 API 缓存：SWR（Stale-While-Revalidate）策略
// 先返回缓存，后台刷新，减少用户等待时间

import { recordApiCall } from './performanceMonitor'

interface CacheEntry<T> {
  data: T
  ts: number
  stale: boolean
}

const cache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

const DEFAULT_STALE_MS = 30 * 1000 // 30 秒内视为新鲜
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000 // 5 分钟后强制重新获取

export interface ApiCacheOptions {
  staleMs?: number
  maxAgeMs?: number
  forceRefresh?: boolean
  dedupe?: boolean
}

export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: ApiCacheOptions = {}
): Promise<T> {
  const { staleMs = DEFAULT_STALE_MS, maxAgeMs = DEFAULT_MAX_AGE_MS, forceRefresh = false, dedupe = true } = options
  const now = Date.now()
  const cached = cache.get(key)

  if (!forceRefresh && cached && now - cached.ts < maxAgeMs) {
    if (now - cached.ts < staleMs) {
      recordApiCall(key, 0, true, 200)
      return cached.data as T
    }
    // 缓存过期但在 maxAge 内：先返回旧数据，后台刷新
    if (!cached.stale) {
      cached.stale = true
      refreshInBackground(key, fetcher)
    }
    recordApiCall(key, 0, true, 200)
    return cached.data as T
  }

  return fetchFresh(key, fetcher, dedupe)
}

async function fetchFresh<T>(key: string, fetcher: () => Promise<T>, dedupe: boolean): Promise<T> {
  if (dedupe) {
    const existing = inFlight.get(key)
    if (existing) return existing as Promise<T>
  }

  const start = typeof performance !== 'undefined' ? performance.now() : 0
  const promise = fetcher().then(data => {
    const duration = typeof performance !== 'undefined' ? performance.now() - start : 0
    cache.set(key, { data, ts: Date.now(), stale: false })
    inFlight.delete(key)
    recordApiCall(key, duration, false, 200)
    return data
  }).catch(err => {
    const duration = typeof performance !== 'undefined' ? performance.now() - start : 0
    inFlight.delete(key)
    recordApiCall(key, duration, false, err?.status || 0)
    throw err
  })

  if (dedupe) inFlight.set(key, promise)
  return promise
}

function refreshInBackground<T>(key: string, fetcher: () => Promise<T>) {
  requestIdleCallback
    ? requestIdleCallback(() => fetchFresh(key, fetcher, true).catch(() => {}), { timeout: 1000 })
    : setTimeout(() => fetchFresh(key, fetcher, true).catch(() => {}), 100)
}

export function invalidateCache(key?: string) {
  if (key) {
    cache.delete(key)
  } else {
    cache.clear()
  }
}

export function getCachedData<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined
}

export function hasFreshCache(key: string, staleMs = DEFAULT_STALE_MS): boolean {
  const cached = cache.get(key)
  return !!cached && Date.now() - cached.ts < staleMs
}
