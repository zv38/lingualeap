import { useEffect, useRef, useCallback, useState } from 'react'
import { getNetworkState } from '../components/SmartLink'

// 智能刷新：页面重新可见或网络恢复时，后台静默刷新数据
// 对慢网/省电模式自动降级，避免打扰用户

interface UseSmartRefreshOptions {
  onRefresh: () => Promise<void> | void
  intervalMs?: number
  // 是否在页面重新可见时触发
  refreshOnVisible?: boolean
  // 是否在网络恢复时触发
  refreshOnOnline?: boolean
  // 最小刷新间隔，避免频繁刷新
  minIntervalMs?: number
}

export function useSmartRefresh({
  onRefresh,
  intervalMs = 60 * 1000,
  refreshOnVisible = true,
  refreshOnOnline = true,
  minIntervalMs = 10 * 1000,
}: UseSmartRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const lastRefreshRef = useRef(0)
  const intervalRef = useRef<number | null>(null)

  const canRefresh = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false
    const state = getNetworkState()
    if (state === 'save-data') return false
    const now = Date.now()
    if (now - lastRefreshRef.current < minIntervalMs) return false
    return true
  }, [minIntervalMs])

  const doRefresh = useCallback(async () => {
    if (!canRefresh() || isRefreshing) return
    setIsRefreshing(true)
    lastRefreshRef.current = Date.now()
    try {
      await onRefresh()
      setLastRefreshedAt(Date.now())
    } catch {
      // 静默失败，不打扰用户
    } finally {
      setIsRefreshing(false)
    }
  }, [canRefresh, isRefreshing, onRefresh])

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      doRefresh()
    }, intervalMs)

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && refreshOnVisible) {
        doRefresh()
      }
    }
    const onOnline = () => {
      if (refreshOnOnline) {
        doRefresh()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [doRefresh, intervalMs, refreshOnVisible, refreshOnOnline])

  return { refresh: doRefresh, isRefreshing, lastRefreshedAt }
}
