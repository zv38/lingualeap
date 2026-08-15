import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gracefulReload } from './gracefulReload'

describe('gracefulReload', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('挂载覆盖层并最终触发 location.reload', () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    gracefulReload({ reason: 'test' })
    expect(document.querySelector('[data-graceful-reload]')).not.toBeNull()
    vi.advanceTimersByTime(2600)
    expect(reload).toHaveBeenCalled()
  })

  it('幂等：连续调用只刷新一次', async () => {
    // 重新加载模块，重置模块级 active 锁，保证测试隔离
    vi.resetModules()
    const mod = await import('./gracefulReload')
    vi.useFakeTimers()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    mod.gracefulReload()
    mod.gracefulReload()
    vi.advanceTimersByTime(2600)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})