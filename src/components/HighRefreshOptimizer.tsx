// 全局 120Hz 优化器
// - 检测真实刷新率
// - 给 document 添加 data-refresh-rate 属性供 CSS 条件选择
// - 长任务监控（自动降级触发）

import { useEffect } from 'react'

function detectRealRefreshRate(): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now()
    let frames = 0
    const tick = () => {
      frames++
      if (performance.now() - start < 1000) {
        requestAnimationFrame(tick)
      } else {
        resolve(Math.round((frames * 1000) / (performance.now() - start)))
      }
    }
    requestAnimationFrame(tick)
  })
}

export default function HighRefreshOptimizer() {
  useEffect(() => {
    // 1. 标记实际刷新率
    detectRealRefreshRate().then((rate) => {
      document.documentElement.dataset.refreshRate = String(rate)
      document.documentElement.dataset.highRefresh = rate >= 100 ? 'true' : 'false'

      // 给开发者一个观察 API
      // @ts-ignore
      window.__REFRESH_RATE__ = rate
      // @ts-ignore
      window.__IS_HIGH_REFRESH__ = rate >= 100
    })

    // 2. 长任务监控：超 50ms 的任务视为 jank 源
    let jankCount = 0
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              jankCount++
              // 100ms+ 连续 3 次：触发自动降级
              if (jankCount > 3) {
                document.documentElement.dataset.perfDegraded = 'true'
                jankCount = 0
              }
            }
          }
        })
        longTaskObserver.observe({ entryTypes: ['longtask'] })
        return () => longTaskObserver.disconnect()
      } catch {
        // 不支持则跳过
      }
    }
  }, [])

  return null
}
