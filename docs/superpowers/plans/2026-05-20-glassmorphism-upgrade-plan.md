# Glassmorphism 全面升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面应用玻璃拟态设计语言，修复所有Bug，优化性能，升级UX体验

**Architecture:** 3个并行工作流：CSS基础层重构 → 组件/页面适配 → 性能优化+Bug修复。所有工作流在Vite HMR下实时验证。

**Tech Stack:** React 18, TypeScript, Vite 5, Tailwind CSS 3, Framer Motion, Zustand

---

### Task A: CSS基础层 + 玻璃拟态背景系统

**Files:**
- Modify: `src/index.css`
- Delete: `src/components/LineWaves.tsx`
- Modify: `src/components/AmbientBackground.tsx`
- Modify: `src/App.tsx`

- [ ] **Step A1: 重写 index.css 为玻璃拟态系统**

将 index.css 重写为包含以下内容的完整玻璃拟态CSS系统：
1. `@tailwind base/components/utilities` 指令保持不变
2. `:root` CSS变量 — 新增玻璃拟态变量：
   ```css
   --glass-bg: rgba(255, 255, 255, 0.5);
   --glass-bg-strong: rgba(255, 255, 255, 0.7);
   --glass-bg-light: rgba(255, 255, 255, 0.3);
   --glass-border: rgba(0, 0, 0, 0.06);
   --glass-blur: 20px;
   --glass-shadow: 0 2px 20px rgba(0,0,0,0.04);
   --glass-shadow-hover: 0 8px 40px rgba(0,0,0,0.08);
   --grid-color: rgba(0, 0, 0, 0.03);
   --grid-size: 40px;
   ```
3. 更新现有色彩变量匹配黑/白主题
4. 新增玻璃类：
   ```css
   .glass-card { background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur)); ... }
   .glass-card-strong { background: var(--glass-bg-strong); ... }
   .glass-nav { ... }
   .glass-modal-overlay { ... }
   ```
5. 新增背景层叠系统（伪元素实现）：
   ```css
   #root::before { 网格纹理 }
   #root::after { 光晕动画 }
   ```
6. 保留所有之前添加的legacy兼容类（btn-amber, liquid-glass等）

- [ ] **Step A2: 重写 AmbientBackground.tsx**

替换为纯CSS玻璃层，无Three.js依赖：
```tsx
// AmbientBackground.tsx - 纯CSS玻璃光晕背景
const AmbientBackground = () => (
  <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
    <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-[0.03]"
      style={{ background: 'radial-gradient(circle, #000 0%, transparent 70%)', animation: 'ambient-drift 20s ease-in-out infinite' }} />
    <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.02]"
      style={{ background: 'radial-gradient(circle, #000 0%, transparent 70%)', animation: 'ambient-drift 25s ease-in-out infinite reverse' }} />
    <style>{`
      @keyframes ambient-drift {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(30px, -20px) scale(1.1); }
        66% { transform: translate(-20px, 30px) scale(0.95); }
      }
    `}</style>
  </div>
)
```

- [ ] **Step A3: 删除 LineWaves.tsx 并移除所有引用**

删除文件并从 Home.tsx 和所有导入中移除引用。

- [ ] **Step A4: 在 App.tsx 中整合 AmbientBackground**

确保 AmbientBackground 在全局布局中渲染，z-index 为 0。

---

### Task B: 全局颜色替换 + 玻璃类迁移

**Files:**
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Auth.tsx`
- Modify: `src/pages/BugReport.tsx`
- Modify: `src/pages/DailyChallenge.tsx`
- Modify: `src/pages/GrammarLearn.tsx`
- Modify: `src/pages/Leaderboard.tsx`
- Modify: `src/pages/Profile.tsx`
- Modify: `src/pages/StudyHistory.tsx`
- Modify: `src/pages/LearningStats.tsx`
- Modify: `src/pages/StudyPlanner.tsx`
- Modify: `src/pages/SRSReview.tsx`
- Modify: `src/pages/Notifications.tsx`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/components/PillNav.tsx`
- Modify: `src/components/Toast.tsx`
- Modify: `src/components/EmptyState.tsx`
- Modify: `src/components/AIChatButton.tsx`

替换规则（所有文件统一执行）：
- `bg-[#FAF8F5]` → `bg-[#FAFAFA]`
- `text-[#8A5A10]` → `text-[var(--accent-primary)]`  
- `text-[#999490]` → `text-[var(--text-muted)]`
- `text-[#6B6560]` → `text-[var(--text-secondary)]`
- `#8A5A10` (非Tailwind) → `var(--accent-primary)`
- `border-[#8A5A10]` → `border-[var(--accent-primary)]`
- `bg-[#8A5A10]` → `bg-[var(--accent-primary)]`
- `from-[#8A5A10]` / `to-[#5A8050]` → black/white 渐变
- `btn-amber` → 保留（已用CSS变量映射）
- `liquid-glass` → 保留（已用CSS变量映射）

- [ ] **Step B1: 执行 Home.tsx 颜色替换**
- [ ] **Step B2: 执行 Navbar.tsx + PillNav.tsx 玻璃化升级**
- [ ] **Step B3: 执行 Auth.tsx 玻璃化升级**
- [ ] **Step B4: 执行其他12个页面文件颜色替换**

---

### Task C: 性能优化 + Bug修复 + UX升级

**Files:**
- Modify: `src/components/CustomCursor.tsx`
- Modify: `src/components/Toast.tsx`
- Modify: `src/components/PageProgress.tsx`
- Modify: `src/components/NotificationDropdown.tsx`
- Modify: `src/store/useStore.ts`
- Modify: `src/App.tsx`
- Create: `src/components/ErrorBoundary.tsx`
- Create: `src/components/SuspenseFallback.tsx`

- [ ] **Step C1: 优化 CustomCursor.tsx**

简化为仅单点跟随，使用 RAF + transform 提升性能：
```tsx
useEffect(() => {
  let rafId: number;
  const dot = dotRef.current;
  const onMove = (e: MouseEvent) => {
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        if (dot) {
          dot.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
        }
        rafId = 0;
      });
    }
  };
  window.addEventListener('mousemove', onMove, { passive: true });
  return () => {
    window.removeEventListener('mousemove', onMove);
    cancelAnimationFrame(rafId);
  };
}, [])
```

- [ ] **Step C2: 创建 ErrorBoundary 组件**

```tsx
// ErrorBoundary.tsx
import { Component, ReactNode } from 'react'
interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
          <h2 className="font-serif text-2xl">页面出现异常</h2>
          <p className="text-[var(--text-secondary)]">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })} className="glass-card px-6 py-2 rounded-full">
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

为 `App.tsx` 中每个 Route 包裹 ErrorBoundary。

- [ ] **Step C3: 创建 SuspenseFallback 骨架屏组件**

```tsx
// SuspenseFallback.tsx
const SuspenseFallback = ({ height = '100vh' }: { height?: string }) => (
  <div style={{ height }} className="flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] animate-spin" />
      <p className="text-[var(--text-muted)] text-sm">加载中...</p>
    </div>
  </div>
)
```
在 App.tsx 中替换所有 Suspense fallback 为 SuspenseFallback。

- [ ] **Step C4: 修复 Toast.tsx 定位和层叠**

修复 Toast 容器的 `fixed` 定位，确保 z-index 高于所有元素：
```tsx
// 容器定位修复
<div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
  {/* Toast 项 */}
</div>
```
添加滑入动画 + 自动销毁定时器 + 撤销按钮。

- [ ] **Step C5: 修复 PageProgress.tsx**

确保路由切换时进度条重置：
```tsx
useEffect(() => {
  setProgress(0)
  const start = setTimeout(() => setProgress(30), 50)
  return () => clearTimeout(start)
}, [location.pathname])
```

- [ ] **Step C6: 优化 useStore 订阅粒度**

将大store拆分为细粒度selector，减少不必要重渲染。

- [ ] **Step C7: 修复 NotificationDropdown 角标计数**

确保未读数角标正确显示/隐藏。

- [ ] **Step C8: 添加图片懒加载**

在所有 `<img>` 和 ImageWithFallback 中使用 `loading="lazy"`。

---

### Task D: 验证与收尾

- [ ] **Step D1: 运行 vite build 验证编译**
- [ ] **Step D2: 重启开发服务器验证HMR**
- [ ] **Step D3: 截图对比前后效果**
- [ ] **Step D4: 最终检查所有文件一致性**