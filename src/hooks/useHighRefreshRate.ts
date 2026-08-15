// 高刷新率优化 Hook
// - requestHighRefreshFrame: 跟显示器刷新率 1:1 的 rAF（120Hz 屏 120fps）
// - useHighRefreshRate: 检测真实刷新率

import { useEffect, useState } from 'react'

/**
 * 检测显示器真实刷新率（1 秒内统计帧数）
 */
export function detectRefreshRate(): Promise<number> {
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

export function useRefreshRate(): { rate: number; isHigh: boolean; isUltra: boolean } {
  const [rate, setRate] = useState(60)
  useEffect(() => {
    detectRefreshRate().then((r) => setRate(r))
  }, [])
  return {
    rate,
    isHigh: rate >= 90,
    isUltra: rate >= 120,
  }
}

/**
 * 高刷新率优化的 requestAnimationFrame
 * 自动绑定窗口可见性（不可见时停止）
 * 1.0x 帧率跟随显示器（无跳帧）
 */
export function createHighRefreshLoop(
  callback: (time: number, dt: number) => void,
): { start: () => void; stop: () => void } {
  let raf = 0
  let lastTime = 0
  let running = false
  let visible = !document.hidden

  const onVis = () => {
    visible = !document.hidden
    if (visible && running) {
      lastTime = 0
      raf = requestAnimationFrame(loop)
    } else {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  const loop = (time: number) => {
    if (!running || !visible) return
    const dt = lastTime ? Math.min((time - lastTime) / 16.67, 4) : 1
    lastTime = time
    callback(time, dt)
    raf = requestAnimationFrame(loop)
  }

  document.addEventListener('visibilitychange', onVis)

  return {
    start: () => {
      if (running) return
      running = true
      visible = !document.hidden
      if (visible) {
        lastTime = 0
        raf = requestAnimationFrame(loop)
      }
    },
    stop: () => {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    },
    _cleanup: () => document.removeEventListener('visibilitychange', onVis),
  } as any
}

/**
 * 简单 FPS 限制器
 * 当目标 fps 超过 60 时不限制；否则按目标 fps 步进
 */
export function fpsLimiter(targetFps: number) {
  const interval = 1000 / targetFps
  let lastEmit = 0
  return (time: number) => {
    if (time - lastEmit >= interval) {
      lastEmit = time
      return true
    }
    return false
  }
}
