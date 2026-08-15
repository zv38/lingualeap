# LinguaLeap 极致动画系统设计方案

## 概述
为 LinguaLeap 语言学习平台添加全方位极致动画效果，覆盖所有页面和交互场景。
风格方向：**优雅流动 + 自然沉浸** — 柔光毛玻璃、有机曲线、缓入缓出节奏、自然物理。

## 技术栈
- **Framer Motion v12**: 交互反馈（悬停/点击/拖拽），spring 物理引擎，AnimatePresence 页面过渡
- **GSAP v3 + ScrollTrigger**: 滚动驱动动画（视差、时间线揭示）
- **Three.js + @react-three/fiber/drei**: 3D 沉浸背景、粒子系统
- **Tailwind CSS**: 配合动画的样式系统

## 四层架构

### Layer 0 — 动画工具 Hooks（`src/hooks/`）

| Hook | 功能 | 技术 |
|------|------|------|
| `useAnimatedInView` | IntersectionObserver 封装，支持 threshold/once/margin | Framer Motion 的 useInView |
| `useSpringNumber` | 弹性数字动画，支持 prefix/suffix/decimals | Framer Motion useSpring + useTransform |
| `useParallax` | 滚动驱动的视差偏移 | GSAP ScrollTrigger 或 Framer Motion useScroll |
| `useMouseGlow` | 鼠标位置追踪，用于光晕跟随效果 | mousemove 事件 + MotionValue |
| `useGSAPTimeline` | GSAP 时间线封装，自动组件卸载清理 | GSAP gsap.timeline() |
| `useReducedMotion` | 尊重用户 prefers-reduced-motion 设置 | window.matchMedia |

### Layer 1 — 可复用动画组件（`src/components/animations/`）

| 组件 | 功能 | 使用的 Hook/库 |
|------|------|---------------|
| `PageTransition` | 路由进入/退出动画（滑动/淡入/模糊） | Framer Motion AnimatePresence |
| `ScrollReveal` | 滚动触发的子元素渐入（支持交错/方向） | useAnimatedInView |
| `ParticleBackground` | Canvas/Three.js 粒子背景 | Three.js 或 Canvas 2D |
| `FluidGradient` | 流动渐变背景 | CSS @keyframes + Framer Motion |
| `GlassCard` | 毛玻璃卡片 + 悬停视差 + 光效跟随 | useMouseGlow + Framer Motion |
| `RippleButton` | 点击涟漪扩散效果 | Framer Motion AnimatePresence |
| `MagneticButton` | 磁吸跟随鼠标的按钮 | useMousePosition + Framer Motion |
| `TextReveal` | 文字逐字/逐行动态揭示 | Framer Motion + GSAP SplitText 替代 |
| `FloatElement` | 浮动/漂浮动画 | Framer Motion 循环动画 |
| `ListStagger` | 列表项交错渐入 | Framer Motion staggerChildren |
| `SplashCursor` | 鼠标划过水面波纹效果 | Canvas 2D + 物理模拟 |
| `AnimatedBackground` | 环境背景动画（几何体浮动） | Three.js @react-three/fiber |
| `Confetti` (升级) | 五彩纸屑 + 更多粒子类型 | Canvas 2D 粒子系统 |

### Layer 2 — 页面级动画

| 区域 | 动画效果 |
|------|---------|
| **首页 (Home)** | Hero 区域视差、特性卡片交错揭示、统计数字跳动 |
| **登录/注册 (Auth)** | 表单切换卡片翻转、验证码输入晃动反馈、背景动态 |
| **课程 (Courses)** | 课程卡片悬停视差、进度条弹性动画、筛选过渡 |
| **进度 (Progress)** | 图表入场动画、成就解锁 Confetti 特效 |
| **排行榜 (Leaderboard)** | 排名入场交错、奖牌旋转、分数跳动 |
| **学习页面** | 卡片翻转、正确/错误反馈动画、进度弹簧 |
| **所有路由** | PageTransition 统一页面过渡 |

### Layer 3 — 全局环境效果

- AmbientBackground: Three.js 3D 浮动几何体（低调，不干扰内容）
- FluidGradient: 页面背景的柔和渐变流动
- 鼠标跟随光晕微效

## 性能与无障碍
- `useReducedMotion` 尊重系统设置，关闭所有动效
- 所有动画组件支持 `animate={false}` 全局禁用
- Three.js 背景在移动端降级为静态
- 使用 `will-change` 提示和 GPU 加速
- 动画组件按需加载（React.lazy）