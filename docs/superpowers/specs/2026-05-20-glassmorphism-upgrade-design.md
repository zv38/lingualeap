# Glassmorphism 全面升级设计文档

## 概述
对 LinguaLeap 进行全面视觉重构，核心设计语言为**玻璃拟态（Glassmorphism）**，同时修复现有Bug、优化性能、提升UX体验。

## 五大升级方向

### 1. 磨砂玻璃拟态背景系统
- **替换** Three.js LineWaves/AmbientBackground → 纯CSS玻璃层
- 三层结构：纯色基底 → 微网格纹理 → 磨砂玻璃覆盖层
- 动态光晕：CSS radial-gradient + 慢速keyframes动画
- 零JavaScript开销，GPU加速

### 2. Bug修复清单
| Bug | 修复方案 |
|-----|---------|
| 旧暖色硬编码(~150处) | 全部替换为CSS变量或新语义类 |
| CustomCursor闪烁 | RAF + transform 优化 |
| Toast定位异常 | 修复层叠上下文 |
| 通知角标计数 | 细化store订阅 |
| PillNav激活态 | 改用--accent-primary |
| AIChatButton流式闪烁 | 修复增量更新 |
| PageProgress未重置 | 路由变化时重置 |
| 暗色模式缺失覆盖 | 补全.dark选择器 |
| LineWaves/Three.js GPU占用 | 彻底移除，替换CSS方案 |

### 3. 性能优化
- 移除Three.js → 消除GPU瓶颈
- Store订阅细化 → 减少60%无关重渲染
- 图片懒加载 (IntersectionObserver)
- CustomCursor RAF优化 → 消除布局抖动
- 预加载关键路由

### 4. UX体验升级
- 统一framer-motion页面过渡
- 骨架屏替代空白loading
- Toast滑入/滑出 + 撤销操作
- 微交互：按钮弹性、卡片悬浮、列表入场
- 响应式优化 + 无障碍增强
- ErrorBoundary包裹每个路由

### 5. 玻璃拟态UI设计语言
- **玻璃卡片**: backdrop-blur(20px) + rgba(255,255,255,0.5) + 0.5px边框
- **玻璃导航栏**: backdrop-blur(24px) + 底部微边框
- **玻璃模态**: backdrop-blur(28px) + 背景遮罩blur
- **玻璃按钮**: 透明玻璃态 → 悬停纯黑填充
- **色彩**: 5阶灰度 (#111111→#9C9C9C) + 纯黑强调
- **动效**: 300ms标准 / 500ms入场 / 150ms微交互
- **曲线**: cubic-bezier(0.22, 1, 0.36, 1)

## 实施计划

### 并行工作流
1. **Agent A** — CSS基础层 + 背景系统 + 全局样式
2. **Agent B** — 所有页面/组件的颜色替换 + 玻璃类迁移
3. **Agent C** — 性能优化 + Bug修复 + UX提升

### 涉及文件
- `src/index.css` — 完全重写为玻璃拟态系统
- `src/components/LineWaves.tsx` — 移除
- `src/components/AmbientBackground.tsx` — 重写
- `src/pages/Home.tsx` + 14个页面文件 — 颜色/类名替换
- `src/components/Navbar.tsx` — 玻璃导航
- `src/components/CustomCursor.tsx` — 性能优化
- `src/components/Toast.tsx` — 修复
- `src/components/EmptyState.tsx` — 视觉升级
- `src/components/PageProgress.tsx` — 修复
- `src/App.tsx` — ErrorBoundary + 骨架屏