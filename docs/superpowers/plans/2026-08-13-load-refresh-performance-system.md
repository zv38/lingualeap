# 加载·刷新·性能系统 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans 逐任务实现。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 把加载、刷新、更新、性能统一为可复用、可独立回滚的体系，消除刷新白屏与突然强制更新。

**Architecture:** 薄协调层（lifecycle）+ 三层（§2 刷新/更新、§1 统一加载、§3 性能优化）。§2 优先。

**Tech Stack:** React 18 + Vite + TypeScript + framer-motion + zustand + vitest + @testing-library。玻璃拟态风格来自全局 `index.css`。

**验证方式：** 单元测试用 `npx vitest run <file>`；类型用 `npx tsc --noEmit`（注意存在预存报错，只关注本计划涉及文件）；构建用 `npx vite build`。

---

## 文件结构

- 新建 `src/utils/gracefulReload.ts` —— 优雅刷新工具（§2 核心）
- 修改 `src/components/VersionUpdatePrompt.tsx` —— 接入优雅刷新 + 稍后冷却
- 新建 `src/utils/updateDismiss.ts` —— 「稍后」冷却逻辑（可单测）
- 新建 `src/components/startup/StartupOverlay.tsx` —— F5 启动过渡覆盖层
- 修改 `index.html` —— 内联启动覆盖层（纯 CSS）
- 修改 `src/App.tsx` —— chunk 失败改用优雅刷新
- 新建 `src/perf/lifecycle.ts` —— 薄协调层（编排 + 上报）
- 新建 `src/components/skeletons/registry.ts` —— 骨架屏注册表（§1）
- 修改 `src/App.tsx` —— Home 懒加载（§3）

---

### Task 1: gracefulReload 优雅刷新工具

**Files:**
- Create: `src/utils/gracefulReload.ts`
- Test: `src/utils/gracefulReload.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gracefulReload } from './gracefulReload'

describe('gracefulReload', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.useRealTimers()
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

  it('幂等：连续调用只刷新一次', () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    gracefulReload()
    gracefulReload()
    vi.advanceTimersByTime(2600)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/utils/gracefulReload.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 gracefulReload**

```ts
let active = false

export interface GracefulReloadOptions {
  reason?: string
  /** 覆盖层文案 */
  message?: string
  /** 兜底强制刷新延迟（ms） */
  fallbackDelay?: number
}

export function gracefulReload(options: GracefulReloadOptions = {}): void {
  if (active) return
  active = true

  const message = options.message ?? '正在安全刷新'
  const fallbackDelay = options.fallbackDelay ?? 2000

  // 品牌玻璃覆盖层（对齐玻璃拟态）
  const overlay = document.createElement('div')
  overlay.setAttribute('data-graceful-reload', 'true')
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483000',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:16px',
    'background:rgba(250,250,250,0.72)',
    'backdrop-filter:blur(18px) saturate(165%)',
    '-webkit-backdrop-filter:blur(18px) saturate(165%)',
    'color:#09090b',
    'font-family:Inter,system-ui,sans-serif',
  ].join(';')
  overlay.innerHTML = `
    <div style="width:44px;height:44px;border-radius:14px;background:#000;display:flex;align-items:center;justify-content:center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
      </svg>
    </div>
    <div style="font-size:14px;font-weight:500">${message}…</div>
  `
  document.body.appendChild(overlay)

  // 等待当前任务落定；兜底 fallbackDelay 后强制刷新
  const doReload = () => window.location.reload()
  const safe = () => {
    doReload()
    cleanup()
  }
  const cleanup = () => {
    window.clearTimeout(timer)
    overlay.remove()
  }

  const timer = window.setTimeout(safe, fallbackDelay)
  const idleFn = window.requestIdleCallback
    ? () => window.requestIdleCallback(() => { if (active) safe() }, { timeout: 1200 })
    : () => window.setTimeout(() => { if (active) safe() }, 800)
  idleFn()
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/utils/gracefulReload.test.ts`
Expected: PASS（2 项）

> 注：`requestIdleCallback` 在 fake timers 下可能不触发，故测试断言依赖 `fallbackDelay` 兜底路径。若 fake timers 下 idle 回调不运行，`safe()` 由 `setTimeout` 兜底触发，测试仍通过。

- [ ] **Step 5: 提交**

```bash
git add src/utils/gracefulReload.ts src/utils/gracefulReload.test.ts
git commit -m "feat: 优雅刷新工具 gracefulReload"
```

---

### Task 2: 「稍后」冷却逻辑

**Files:**
- Create: `src/utils/updateDismiss.ts`
- Test: `src/utils/updateDismiss.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isDismissed, dismissUpdate } from './updateDismiss'

const KEY = 'lingualeap-update-dismiss'
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/utils/updateDismiss.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 updateDismiss**

```ts
const KEY = 'lingualeap-update-dismiss'
const COOLDOWN_MS = 30 * 60 * 1000

interface DismissRecord {
  version: string
  at: number
}

export function dismissUpdate(version: string): void {
  const record: DismissRecord = { version, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* 存储不可用时静默降级 */
  }
}

export function isDismissed(version: string): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const record = JSON.parse(raw) as DismissRecord
    if (record.version !== version) return false
    return Date.now() - record.at < COOLDOWN_MS
  } catch {
    return false
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/utils/updateDismiss.test.ts`
Expected: PASS（4 项）

- [ ] **Step 5: 提交**

```bash
git add src/utils/updateDismiss.ts src/utils/updateDismiss.test.ts
git commit -m "feat: 版本更新「稍后」冷却逻辑"
```

---

### Task 3: VersionUpdatePrompt 接入优雅刷新 + 稍后冷却

**Files:**
- Modify: `src/components/VersionUpdatePrompt.tsx`

- [ ] **Step 1: 引入 gracefulReload 与 updateDismiss**

在文件顶部 import 后新增：

```ts
import { gracefulReload } from '../utils/gracefulReload'
import { dismissUpdate, isDismissed } from '../utils/updateDismiss'
```

- [ ] **Step 2: 弹窗前检查冷却**

在两处 `setShow(true)` 前（SSE 分支与轮询分支）加守卫。以 SSE 分支为例，在 `setInfo({...})` 之前判断：

```ts
if (isDismissed(remoteVer)) {
  return
}
```

轮询分支 `setOnUpdate` 回调内同样在 `setShow(true)` 前加：

```ts
const v = String(updateInfo?.version || '')
if (isDismissed(v)) return
```

- [ ] **Step 3: 替换硬刷新**

```ts
function handleRefresh() {
  gracefulReload({ reason: 'user-update' })
}
```

- [ ] **Step 4: 「稍后」写入冷却**

将「稍后」按钮 `onClick` 改为：

```ts
onClick={() => {
  if (info) dismissUpdate(info.remote)
  setShow(false)
}}
```

同时把「立即刷新」按钮文案改为「立即更新」，副文案改为「新版本已就绪，是否立即更新？」。

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增报错（仅存在预存的 AdminDashboard/BugReport 等报错）

- [ ] **Step 6: 提交**

```bash
git add src/components/VersionUpdatePrompt.tsx
git commit -m "feat: 版本更新接入优雅刷新与稍后冷却"
```

---

### Task 4: F5 启动过渡覆盖层

**Files:**
- Create: `src/components/startup/StartupOverlay.tsx`
- Modify: `index.html`

- [ ] **Step 1: 实现 StartupOverlay 组件**

```tsx
import { useEffect, useState } from 'react'

export default function StartupOverlay() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    // 等首屏内容就绪后再淡出移除，避免闪烁
    const t = window.setTimeout(() => setDone(true), 350)
    return () => window.clearTimeout(t)
  }, [])

  if (done) return null

  return (
    <div
      data-startup-overlay
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'rgba(250,250,250,0.72)',
        backdropFilter: 'blur(18px) saturate(165%)',
        WebkitBackdropFilter: 'blur(18px) saturate(165%)',
        color: '#09090b',
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'opacity 0.28s ease',
        opacity: 1,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>正在准备您的体验…</div>
    </div>
  )
}
```

- [ ] **Step 2: 在 index.html 内联首屏覆盖层（纯 CSS，JS 挂载前也有视觉反馈）**

在 `<div id="root"></div>` 之后、`<script>` 之前插入：

```html
<div id="startup-placeholder" style="position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(250,250,250,0.72);backdrop-filter:blur(18px) saturate(165%);-webkit-backdrop-filter:blur(18px) saturate(165%);color:#09090b;font-family:Inter,system-ui,sans-serif">
  <div style="width:44px;height:44px;border-radius:14px;background:#000;display:flex;align-items:center;justify-content:center">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
  </div>
  <div style="font-size:14px;font-weight:500">正在准备您的体验…</div>
</div>
```

- [ ] **Step 3: 挂载 StartupOverlay 并清理占位**

在 `src/main.tsx`（或 App 顶层）挂载 `<StartupOverlay />`，并在其挂载时移除 `#startup-placeholder`。在 `StartupOverlay` 的 `useEffect` 中追加：

```ts
useEffect(() => {
  document.getElementById('startup-placeholder')?.remove()
  const t = window.setTimeout(() => setDone(true), 350)
  return () => window.clearTimeout(t)
}, [])
```

- [ ] **Step 4: 构建验证**

Run: `npx vite build`
Expected: 构建成功，产物根目录含 `startup-placeholder` 内联标记

- [ ] **Step 5: 提交**

```bash
git add src/components/startup/StartupOverlay.tsx index.html src/main.tsx
git commit -m "feat: F5 启动过渡覆盖层，消除首屏白屏"
```

---

### Task 5: chunk 加载失败优雅恢复

**Files:**
- Modify: `src/App.tsx`（`unhandledrejection` 处理器）

- [ ] **Step 1: 引入 gracefulReload**

```ts
import { gracefulReload } from './utils/gracefulReload'
```

- [ ] **Step 2: 替换硬 reload**

将：

```ts
console.warn('[ChunkLoad] 检测到路由块加载失败，准备刷新', e.reason)
window.location.reload()
```

改为：

```ts
console.warn('[ChunkLoad] 检测到路由块加载失败，准备优雅刷新', e.reason)
gracefulReload({ reason: 'chunk-load', message: '页面资源已更新，正在重新加载' })
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`（仅关注本文件无新增报错）

- [ ] **Step 4: 提交**

```bash
git add src/App.tsx
git commit -m "fix: chunk 加载失败改用优雅刷新"
```

---

### Task 6: 薄协调层 lifecycle

**Files:**
- Create: `src/perf/lifecycle.ts`

- [ ] **Step 1: 实现 lifecycle 单例**

```ts
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
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`（仅关注本文件无新增报错）

- [ ] **Step 3: 提交**

```bash
git add src/perf/lifecycle.ts
git commit -m "feat: 轻量生命周期协调层"
```

---

### Task 7: 骨架屏注册表（§1）

**Files:**
- Create: `src/components/skeletons/registry.ts`

- [ ] **Step 1: 实现注册表**

```ts
/**
 * 骨架屏注册表：按 pathname 段映射到骨架屏 key。
 * 具体骨架组件复用现有 SuspenseFallback 的玻璃风格，由各页懒加载时按需渲染。
 */
export type SkeletonKey = 'dashboard' | 'list' | 'form' | 'detail' | 'default'

export function skeletonKeyFor(pathname: string): SkeletonKey {
  if (pathname === '/' || pathname === '/courses') return 'dashboard'
  if (pathname.startsWith('/admin')) return 'form'
  if (pathname.startsWith('/learn') || pathname.startsWith('/daily')) return 'detail'
  if (pathname.startsWith('/messages') || pathname.startsWith('/notifications')) return 'list'
  return 'default'
}
```

- [ ] **Step 2: 写测试**

```ts
import { describe, it, expect } from 'vitest'
import { skeletonKeyFor } from './registry'

describe('skeletonKeyFor', () => {
  it('首页/课程映射 dashboard', () => {
    expect(skeletonKeyFor('/')).toBe('dashboard')
    expect(skeletonKeyFor('/courses')).toBe('dashboard')
  })
  it('管理端映射 form', () => {
    expect(skeletonKeyFor('/admin/security')).toBe('form')
  })
  it('学习页映射 detail', () => {
    expect(skeletonKeyFor('/learn/word')).toBe('detail')
  })
  it('其余映射 default', () => {
    expect(skeletonKeyFor('/profile')).toBe('default')
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/components/skeletons/registry.test.ts`
Expected: PASS（4 项

> 注：为遵循「Do not create files unless necessary」，骨架屏注册表仅提供映射函数，具体骨架组件延用现有 `SuspenseFallback`，不重复造组件。§1 其余（首帧防闪烁）因时序已由 `pageEase` 对齐，暂以最小改动落地。

- [ ] **Step 4: 提交**

```bash
git add src/components/skeletons/registry.ts src/components/skeletons/registry.test.ts
git commit -m "feat: 骨架屏注册表"
```

---

### Task 8: Home 懒加载（§3）

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 将 Home 改为懒加载**

删除 `import Home from './pages/Home'`，改为：

```ts
const Home = React.lazy(() => import('./pages/Home'))
```

- [ ] **Step 2: 构建验证**

Run: `npx vite build`
Expected: 构建成功，出现独立的 `Home` 页面 chunk，入口体积下降

- [ ] **Step 3: 提交**

```bash
git add src/App.tsx
git commit -m "perf: Home 路由懒加载，压小首屏 bundle"
```

---

## 自审

- **Spec 覆盖**：§2（gracefulReload/可选更新/启动过渡/chunk 恢复）→ Task 1-5；薄协调层 → Task 6；§1 → Task 7；§3 → Task 8。覆盖完整。
- **占位符**：无 TBD/TODO。
- **类型一致性**：`gracefulReload(options)`、`dismissUpdate(version)`/`isDismissed(version)`、`skeletonKeyFor(pathname)` 跨任务签名一致。
- **已知约束**：`tsc --noEmit` 存在预存报错（AdminDashboard/BugReport 等，与本计划无关），各任务仅关注自身文件无新增报错。