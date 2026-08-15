import { gracefulReload } from '../utils/gracefulReload'
import { recordRouteChange } from '../utils/performanceMonitor'

type Listener = () => void

class Lifecycle {
  private static inst: Lifecycle
  private listeners = new Set<Listener>()

  static get(): Lifecycle {
    if (!Lifecycle.inst) Lifecycle.inst = new Lifecycle()
    return Lifecycle.inst
  }

  on(name: 'refresh' | 'update-dismiss' | 'update-apply', fn: Listener): () => void {
    void name
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(..._args: unknown[]) {
    this.listeners.forEach(fn => fn())
  }

  /** 上报一次路由切换耗时 */
  reportRoute(from: string, to: string, start: number, end: number): void {
    recordRouteChange(from, to, start, end)
  }

  /** 应用版本更新（优雅刷新） */
  applyUpdate(reason = 'user-update'): void {
    this.emit('update-apply')
    gracefulReload({ reason })
  }
}

export const lifecycle = Lifecycle.get()