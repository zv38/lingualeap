import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isDismissed, dismissUpdate } from './updateDismiss'

describe('updateDismiss', () => {
  const now = Date.now()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('未点击稍后时不视为已忽略', () => {
    expect(isDismissed('1.0.0')).toBe(false)
  })

  it('点击稍后后同版本 30 分钟内不再提示', () => {
    dismissUpdate('1.0.0')
    expect(isDismissed('1.0.0')).toBe(true)
    vi.setSystemTime(now + 29 * 60 * 1000)
    expect(isDismissed('1.0.0')).toBe(true)
  })

  it('超过 30 分钟后允许再次提示', () => {
    dismissUpdate('1.0.0')
    vi.setSystemTime(now + 31 * 60 * 1000)
    expect(isDismissed('1.0.0')).toBe(false)
  })

  it('不同版本互不影响', () => {
    dismissUpdate('1.0.0')
    expect(isDismissed('1.1.0')).toBe(false)
  })
})