# 加载·刷新·性能系统 设计文档

- 日期：2026-08-13
- 方案：B（分层渐进 + 薄协调层）
- 状态：已确认，进入实施

## 1. 背景与目标

用户反馈「每次刷新页面很久很慢」。根因已定位并初步修复：混淆插件在 `transform` 阶段改写 `React.lazy` 动态导入，导致 50 个页面被合并进单个 3MB 入口 chunk，每次刷新都要重新下载/解析/执行整包。修复后已恢复代码分割、入口降至约 1.9MB（gzip 610KB）。

本系统在此基础上，把「加载、刷新、更新、性能」统一为一套可复用、可独立回滚的体系，重点解决：

1. 刷新/更新时的白屏与突兀感
2. 版本更新突然强制刷新
3. 配置/骨架/过渡不统一
4. 首屏 bundle 仍偏大

## 2. 设计原则

- **薄协调层**：不改写现有模块，只做编排
- **分层交付**：三层各自独立、可回滚
- **复用现状**：已有 `SuspenseFallback`、`AnimatePresence`、`VersionUpdatePrompt`、`performanceMonitor`、`SmartLink` 等，全部保留并增强
- **玻璃拟态一致**：所有新增 UI 对齐「高级通透玻璃」风格

## 3. 架构总览

```
lifecycle（薄协调层单例）
  ├── §2 刷新/更新层：gracefulReload / OptionalUpdate / StartupOverlay
  ├── §1 统一加载层：骨架屏注册表 + 首帧防闪烁
  └── §3 性能优化层：构建期拆包 + 缓存/预加载增强
        └── 上报到 performanceMonitor（现有）
```

## 4. §2 刷新与更新体验层（先做）

### 4.1 gracefulReload() 优雅刷新工具
新增 `src/utils/gracefulReload.ts`：

- 唯一入口：`gracefulReload(options?: { reason?: string; delay?: number })`
- 行为：挂载一个品牌玻璃覆盖层「正在安全刷新…」→ 等待当前宏任务/微任务落定（`requestIdleCallback` 兜底 `setTimeout`）→ 兜底 2s 强制刷新
- 幂等：同一时刻只允许一次刷新，用模块级锁防并发
- 替换所有硬 `window.location.reload()`

### 4.2 可选更新（增强 VersionUpdatePrompt）
- 保留现有「检测（SSE + 轮询）→ 弹窗 → 稍后/立即刷新」的可选更新语义（非强制更新本就可选）
- `handleRefresh` 改用 `gracefulReload`
- 新增「稍后」冷却：点击后写入 `localStorage`（如 `lingualeap-update-dismiss`，含版本号 + 时间戳），同版本 30 分钟内不再弹，避免反复打扰
- 文案优化为「新版本已就绪，是否立即更新？」并在「立即更新」前保持可选

### 4.3 启动过渡覆盖层（防 F5 白屏）
新增 `src/components/startup/StartupOverlay.tsx`：

- 在 `index.html` 首屏内联一段极简玻璃启动层（纯 CSS，无 JS 依赖），确保 F5 后立即有视觉反馈而非白屏
- 应用挂载后淡出移除，与 `IntroSplash` 衔接（不重复）

### 4.4 chunk 加载失败优雅恢复
- `App.tsx` 中 `unhandledrejection` 的硬 reload 改为 `gracefulReload({ reason: 'chunk-load' })`

## 5. §1 统一加载体验层

### 5.1 骨架屏注册表
新增 `src/components/skeletons/registry.ts`：

- 按 `pathname` 映射到骨架屏组件（复用现有 `SuspenseFallback` 的玻璃风格）
- 统一过渡时长与缓动，消除「骨架 → 内容」跳动

### 5.2 首帧防闪烁
- 骨架屏淡出与页面 `AnimatePresence` 淡入使用同一缓动 `pageEase`，对齐时序

## 6. §3 性能深度优化层

### 6.1 Home 懒加载
- `App.tsx` 中 `Home` 从急切导入改为 `React.lazy`，配首帧骨架
- 首屏只保留 `Auth`（登录）急切加载，其余全部懒加载

### 6.2 缓存与预加载增强
- 静态资源 SW 交 `stale-while-revalidate`（`vite-plugin-pwa` 配置）
- 关键字体/图片预加载打磨（`resourceHints`）

## 7. 薄协调层 lifecycle

新增 `src/perf/lifecycle.ts`：

- 单例。统一注册加载态、发起优雅刷新、监听网络/更新事件
- 把路由耗时、刷新原因、更新选择上报给现有 `performanceMonitor`
- 不重写任何模块

## 8. 交付顺序

1. §2（刷新/更新）— 收益最直接
2. §1（加载统一）
3. §3（性能优化）

每层独立可回滚。

## 9. 成功标准

- F5 刷新不再长期白屏，有即时视觉反馈
- 版本更新始终可选，用户可选择「稍后」且不被打扰
- chunk 加载失败时优雅过渡而非闪断
- 骨架屏风格统一、无跳动
- 首屏 bundle 进一步下降