// 路由切换事件总线
// 路由切换时短暂暂停高 GPU 消耗的动画，避免叠加导致掉帧

type Listener = (navigating: boolean) => void

class RouteTransitionBus {
  private listeners = new Set<Listener>()
  private navigating = false
  private resetTimer: number | null = null
  // 默认 200ms：覆盖最常见的页面 mount 完成时间
  private readonly COOLDOWN_MS = 220

  isNavigating(): boolean {
    return this.navigating
  }

  begin() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }
    if (!this.navigating) {
      this.navigating = true
      document.documentElement.dataset.navigating = 'true'
      this.emit()
    }
    // 兜底：最大 cooldown 后强制结束（防止某些边缘情况）
    this.resetTimer = window.setTimeout(() => this.end(), this.COOLDOWN_MS)
  }

  end() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }
    if (this.navigating) {
      this.navigating = false
      delete document.documentElement.dataset.navigating
      this.emit()
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.navigating)
      } catch {}
    }
  }
}

export const routeTransitionBus = new RouteTransitionBus()
