# UX 全面优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 LinguaLeap 平台 5 个核心页面（Home、Auth、Courses、WordLearn、Progress）进行视觉、交互、功能三维度的全面 UX 优化

**Architecture:** 先创建全局通用组件（Skeleton、EmptyState、AnimatedNumber 等），再按页面逐个优化。每个页面独立完成视觉重构 + 动画增强 + 交互完善 + 功能补全。

**Tech Stack:** React 18 + TypeScript + Framer Motion + Tailwind CSS + Recharts

---

### Task 1: 创建全局通用组件

**Files:**
- Create: `src/components/Skeleton.tsx`
- Create: `src/components/EmptyState.tsx`
- Create: `src/components/AnimatedNumber.tsx`
- Create: `src/components/ImageWithFallback.tsx`

- [ ] **Step 1: 创建 Skeleton 骨架屏组件**

```tsx
import { motion } from 'framer-motion'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
  width?: string | number
  height?: string | number
  count?: number
}

export default function Skeleton({ className = '', variant = 'text', width, height, count = 1 }: SkeletonProps) {
  const baseClass = 'bg-black/[0.04] rounded-lg animate-pulse'
  const variants = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
    card: 'h-52 w-full rounded-2xl',
  }

  const items = Array.from({ length: count })
  return (
    <>
      {items.map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
          className={`${baseClass} ${variants[variant]} ${className}`}
          style={{ width, height }}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 2: 创建 EmptyState 空状态组件**

```tsx
import { motion } from 'framer-motion'
import { BookOpen } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
      className="liquid-glass rounded-[2rem] text-center py-24 px-8"
    >
      <div className="mb-6 text-[#8A5A10]/40">
        {icon || <BookOpen size={48} className="mx-auto" />}
      </div>
      <h3 className="font-serif text-2xl text-[#1a1816] mb-3">{title}</h3>
      {description && (
        <p className="text-[#6B6560] text-lg max-w-md mx-auto font-sans mb-6">{description}</p>
      )}
      {action && (
        <button onClick={action.onClick} className="btn-amber rounded-full px-8 py-3 text-sm font-medium">
          {action.label}
        </button>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 3: 创建 AnimatedNumber 数字滚动组件**

```tsx
import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

interface AnimatedNumberProps {
  value: number
  duration?: number
  suffix?: string
  prefix?: string
  className?: string
}

export default function AnimatedNumber({ value, duration = 1.5, suffix = '', prefix = '', className = '' }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let startTime: number | null = null
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.floor(eased * value))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [isInView, value, duration])

  return (
    <motion.span ref={ref} className={className}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </motion.span>
  )
}
```

- [ ] **Step 4: 创建 ImageWithFallback 图片组件**

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'

interface ImageWithFallbackProps {
  src: string
  alt: string
  className?: string
}

export default function ImageWithFallback({ src, alt, className = '' }: ImageWithFallbackProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && !error && (
        <div className="absolute inset-0 bg-black/[0.03] animate-pulse" />
      )}
      {error ? (
        <div className="absolute inset-0 bg-black/[0.03] flex items-center justify-center text-[#999490] text-sm">
          加载失败
        </div>
      ) : (
        <motion.img
          src={src}
          alt={alt}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 1.05 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  )
}
```

---

### Task 2: 优化首页 (Home.tsx)

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: 重构 Hero 区域 — 粒子背景 + 打字机标题 + 滚动指示器**

```tsx
// Hero 区域替换为：
<section className="relative min-h-screen flex items-center justify-center overflow-hidden">
  {/* Canvas 粒子背景 */}
  <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
  
  {/* 内容 */}
  <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
    <motion.h1
      initial={{ opacity: 0, y: 40, filter: 'blur(12px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
      className="text-7xl md:text-8xl font-serif font-bold gradient-amber mb-8 tracking-tight"
    >
      LinguaLeap
    </motion.h1>
    
    <TypewriterText
      text="开启你的语言学习之旅，探索世界的每一个角落"
      className="text-xl md:text-2xl text-[#6B6560] font-sans mb-12"
      speed={50}
    />
    
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 1.2 }}
      className="flex items-center justify-center gap-4"
    >
      <Link to="/courses" className="btn-amber rounded-full px-10 py-4 text-base font-medium flex items-center gap-2 group">
        开始学习
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </Link>
      <Link to="/courses" className="btn-ghost rounded-full px-10 py-4 text-base font-medium">
        浏览课程
      </Link>
    </motion.div>
  </div>

  {/* 滚动指示器 */}
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 2 }}
    className="absolute bottom-12 left-1/2 -translate-x-1/2"
  >
    <motion.div
      animate={{ y: [0, 8, 0] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      className="flex flex-col items-center gap-2 text-[#999490] text-xs"
    >
      <span>向下滚动</span>
      <ChevronDown size={16} />
    </motion.div>
  </motion.div>
</section>
```

- [ ] **Step 2: 实现 Canvas 粒子系统**

```tsx
// 在 Home 组件内添加粒子效果
const canvasRef = useRef<HTMLCanvasElement>(null)

useEffect(() => {
  const canvas = canvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let animationId: number
  let mouseX = 0, mouseY = 0

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  const particles = Array.from({ length: 60 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    size: Math.random() * 3 + 1,
    opacity: Math.random() * 0.3 + 0.1,
  }))

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    particles.forEach(p => {
      p.x += p.vx + (mouseX - canvas.width / 2) * 0.0002
      p.y += p.vy + (mouseY - canvas.height / 2) * 0.0002
      if (p.x < 0) p.x = canvas.width
      if (p.x > canvas.width) p.x = 0
      if (p.y < 0) p.y = canvas.height
      if (p.y > canvas.height) p.y = 0
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(138, 90, 16, ${p.opacity})`
      ctx.fill()
    })
    animationId = requestAnimationFrame(animate)
  }
  animate()

  const handleMouse = (e: MouseEvent) => {
    mouseX = e.clientX
    mouseY = e.clientY
  }
  window.addEventListener('mousemove', handleMouse)

  return () => {
    cancelAnimationFrame(animationId)
    window.removeEventListener('resize', resize)
    window.removeEventListener('mousemove', handleMouse)
  }
}, [])
```

- [ ] **Step 3: 重构能力模块 — 非对称网格 + 3D 倾斜卡片**

```tsx
// 能力模块数据
const features = [
  { title: '词汇学习', description: '科学记忆法，高效掌握新词汇', icon: BookOpen, size: 'large', color: '#8A5A10' },
  { title: '语法训练', description: '系统学习语法规则', icon: FileText, size: 'small', color: '#5A8050' },
  { title: '听力练习', description: '多语种听力材料', icon: Headphones, size: 'small', color: '#6060A0' },
  { title: '口语练习', description: 'AI 语音评分', icon: Mic, size: 'small', color: '#A06050' },
  { title: '阅读写作', description: '提升读写能力', icon: PenTool, size: 'large', color: '#8A5A10' },
  { title: '每日挑战', description: '每日一练，持续进步', icon: Zap, size: 'small', color: '#5A8050' },
]

// 非对称网格布局
<div className="grid grid-cols-3 gap-4 max-w-5xl mx-auto">
  {features.map((feature, i) => (
    <motion.div
      key={feature.title}
      custom={i}
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className={`${feature.size === 'large' ? 'col-span-2 row-span-2' : ''} relative group perspective-[1000px]`}
    >
      <TiltCard>
        <div className="liquid-glass rounded-[2rem] p-8 h-full">
          <feature.icon size={32} className="text-[#8A5A10] mb-4" />
          <h3 className="font-serif text-xl mb-2">{feature.title}</h3>
          <p className="text-[#6B6560] text-sm">{feature.description}</p>
        </div>
      </TiltCard>
    </motion.div>
  ))}
</div>
```

- [ ] **Step 4: 实现课程横向轮播（Apple Music 风格）**

```tsx
// 横向滚动容器
<div className="relative">
  <motion.div
    ref={scrollRef}
    className="flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4"
    drag="x"
    dragConstraints={{ left: -maxScroll, right: 0 }}
    dragElastic={0.2}
  >
    {courses.map((course) => (
      <motion.div
        key={course.id}
        className="snap-start flex-shrink-0 w-[320px]"
        whileHover={{ y: -8 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <Link to={`/learn/${course.type || 'word'}`} className="liquid-glass rounded-[2rem] overflow-hidden block group">
          <ImageWithFallback src={course.coverImage} alt={course.title} className="h-44" />
          <div className="p-5">
            <h3 className="font-serif text-lg mb-2">{course.title}</h3>
            <p className="text-sm text-[#6B6560] line-clamp-2">{course.description}</p>
          </div>
        </Link>
      </motion.div>
    ))}
  </motion.div>
  
  {/* 左右箭头 */}
  <button onClick={scrollLeft} className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full liquid-glass flex items-center justify-center">
    <ChevronLeft size={18} />
  </button>
  <button onClick={scrollRight} className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full liquid-glass flex items-center justify-center">
    <ChevronRight size={18} />
  </button>
</div>
```

- [ ] **Step 5: 添加统计卡片 + 数字滚动动画**

```tsx
<div className="grid grid-cols-3 gap-6 max-w-3xl mx-auto">
  {[
    { label: '学习天数', value: 42, icon: Calendar },
    { label: '掌握词汇', value: 1280, icon: BookOpen },
    { label: '连续签到', value: 7, icon: Zap },
  ].map((stat) => (
    <motion.div
      key={stat.label}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="liquid-glass rounded-2xl p-6 text-center"
    >
      <stat.icon size={24} className="mx-auto mb-3 text-[#8A5A10]" />
      <p className="text-3xl font-bold text-[#1a1816] font-mono">
        <AnimatedNumber value={stat.value} />
      </p>
      <p className="text-sm text-[#999490] mt-1">{stat.label}</p>
    </motion.div>
  ))}
</div>
```

- [ ] **Step 6: 增强 CTA 区域 — 毛玻璃 + 动态光晕**

```tsx
<section className="relative overflow-hidden rounded-[2rem]">
  <div className="absolute inset-0 bg-gradient-to-br from-[#8A5A10]/5 to-[#5A8050]/5" />
  <motion.div
    className="absolute -top-20 -right-20 w-60 h-60 rounded-full"
    style={{ background: 'radial-gradient(circle, rgba(138,90,16,0.08) 0%, transparent 70%)' }}
    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
  />
  <div className="relative z-10 liquid-glass rounded-[2rem] p-16 text-center">
    <h2 className="font-serif text-4xl gradient-amber mb-4">开始你的语言之旅</h2>
    <p className="text-[#6B6560] mb-8 max-w-lg mx-auto">加入数千名学习者，一起探索语言的魅力</p>
    <Link to="/courses" className="btn-amber rounded-full px-12 py-4 text-base font-medium inline-flex items-center gap-2">
      立即开始 <ArrowRight size={18} />
    </Link>
  </div>
</section>
```

---

### Task 3: 优化登录注册 (Auth.tsx)

**Files:**
- Modify: `src/pages/Auth.tsx`

- [ ] **Step 1: 添加左侧动态装饰几何图形**

```tsx
// 在左侧品牌区添加浮动几何形状
<div className="hidden lg:flex flex-1 flex-col items-center justify-center pr-16 relative">
  {/* 浮动几何形状 */}
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <motion.div
      className="absolute w-32 h-32 rounded-full border-2 border-[#8A5A10]/10"
      animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0], rotate: [0, 180, 360, 0] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      style={{ top: '15%', left: '10%' }}
    />
    <motion.div
      className="absolute w-24 h-24 border-2 border-[#5A8050]/10"
      style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', top: '60%', right: '15%' }}
      animate={{ x: [0, -20, 30, 0], y: [0, 30, -20, 0], rotate: [0, -180, -360, 0] }}
      transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
    />
    <motion.div
      className="absolute w-20 h-20 border-2 border-[#6060A0]/10"
      style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', top: '30%', right: '25%' }}
      animate={{ x: [0, 25, -15, 0], y: [0, -15, 25, 0], rotate: [0, 120, 240, 360] }}
      transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
    />
  </div>
  
  {/* 品牌内容 */}
  <motion.div className="relative z-10 text-center">
    <h1 className="text-7xl font-serif font-bold gradient-amber mb-6 tracking-tight">LinguaLeap</h1>
    <div className="ornament w-32 mx-auto mb-6" />
    <p className="text-[#6B6560] text-lg font-sans leading-relaxed max-w-sm mx-auto">
      开启你的语言学习之旅，探索世界的每一个角落
    </p>
  </motion.div>
</div>
```

- [ ] **Step 2: 实现表单 3D 翻转切换动画**

```tsx
// 替换 formVariants 为 3D 翻转效果
const formVariants = {
  enter: { opacity: 0, rotateY: -15, x: 30, filter: 'blur(6px)' },
  center: { opacity: 1, rotateY: 0, x: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, rotateY: 15, x: -30, filter: 'blur(6px)', transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
}

// 表单容器添加 perspective
<div style={{ perspective: '1200px' }}>
  <AnimatePresence mode="wait">
    {/* 表单内容 */}
  </AnimatePresence>
</div>
```

- [ ] **Step 3: 实现 4 独立验证码输入框**

```tsx
// 替换单个验证码输入框为 4 个独立框
const captchaRefs = useRef<(HTMLInputElement | null)[]>([])

function handleCaptchaChange(index: number, value: string) {
  const newVal = captchaInput.split('')
  newVal[index] = value.slice(-1)
  const joined = newVal.join('')
  setCaptchaInput(joined)
  if (value && index < 3) {
    captchaRefs.current[index + 1]?.focus()
  }
}

function handleCaptchaKeyDown(index: number, e: React.KeyboardEvent) {
  if (e.key === 'Backspace' && !captchaInput[index] && index > 0) {
    captchaRefs.current[index - 1]?.focus()
  }
}

// 渲染 4 个独立输入框
<div className="flex gap-3">
  {[0, 1, 2, 3].map((i) => (
    <input
      key={i}
      ref={el => captchaRefs.current[i] = el}
      type="text"
      maxLength={1}
      value={captchaInput[i] || ''}
      onChange={e => handleCaptchaChange(i, e.target.value)}
      onKeyDown={e => handleCaptchaKeyDown(i, e)}
      className="w-14 h-14 liquid-glass rounded-xl text-center text-xl font-mono outline-none focus-glow transition-all duration-300"
      autoComplete="off"
    />
  ))}
  <div className="rounded-lg liquid-glass-amber cursor-pointer flex-shrink-0 w-[130px] h-[56px] flex items-center justify-center overflow-hidden"
    onClick={fetchCaptcha}
    dangerouslySetInnerHTML={{ __html: captchaSvg }}
  />
  <button onClick={fetchCaptcha} className="p-3 liquid-glass rounded-xl text-[#999490] hover:text-[#8A5A10] transition-all">
    <RefreshCw size={18} />
  </button>
</div>
```

- [ ] **Step 4: 实现登录成功粒子散开效果**

```tsx
// 成功覆盖层增加粒子散开
{success && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 rounded-[2rem] bg-[#FAF8F5]/95 backdrop-blur-sm flex items-center justify-center z-20"
  >
    {/* 粒子散开 */}
    {Array.from({ length: 20 }).map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-2 h-2 rounded-full"
        style={{ backgroundColor: ['#8A5A10', '#5A8050', '#6060A0', '#A06050'][i % 4] }}
        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
        animate={{
          x: (Math.random() - 0.5) * 400,
          y: (Math.random() - 0.5) * 400,
          scale: [0, 1.5, 0],
          opacity: [1, 0.8, 0],
        }}
        transition={{ duration: 1.2, delay: i * 0.03, ease: 'easeOut' }}
      />
    ))}
    
    {/* 对勾 */}
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
      className="text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-[#22c55e]/10 flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={40} className="text-[#22c55e]" />
      </div>
      <p className="text-[#1a1816] font-serif text-lg">
        {activeTab === 'login' ? '登录成功' : '注册成功'}
      </p>
      <p className="text-[#999490] text-sm font-sans mt-1">正在跳转...</p>
    </motion.div>
  </motion.div>
)}
```

---

### Task 4: 优化课程中心 (Courses.tsx)

**Files:**
- Modify: `src/pages/Courses.tsx`

- [ ] **Step 1: 添加统计卡片 + 数字滚动**

```tsx
// 替换现有统计区域
<div className="grid grid-cols-3 gap-4 mb-8">
  {[
    { label: '总课程数', value: courses.length, icon: BookOpen, color: '#8A5A10' },
    { label: '在学人数', value: totalStudents, icon: Users, color: '#5A8050' },
    { label: '总课时数', value: totalLessons, icon: GraduationCap, color: '#8A5A10' },
  ].map((stat) => (
    <motion.div
      key={stat.label}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="liquid-glass rounded-2xl p-5 text-center"
    >
      <stat.icon size={22} className="mx-auto mb-2" style={{ color: stat.color }} />
      <p className="text-2xl font-bold text-[#1a1816] font-mono">
        <AnimatedNumber value={stat.value} />
      </p>
      <p className="text-xs text-[#999490] font-sans mt-0.5">{stat.label}</p>
    </motion.div>
  ))}
</div>
```

- [ ] **Step 2: 实现图片模糊占位 → 清晰渐入**

```tsx
// 在课程卡片中使用 ImageWithFallback
<ImageWithFallback
  src={course.coverImage}
  alt={course.title}
  className="h-52"
/>
```

- [ ] **Step 3: 实现卡片悬停 3D 倾斜效果**

```tsx
// 使用 TiltCard 包裹课程卡片
<TiltCard>
  <Link to={`/learn/${course.type || 'word'}`} className="liquid-glass rounded-[2rem] overflow-hidden block group">
    {/* 卡片内容 */}
  </Link>
</TiltCard>
```

- [ ] **Step 4: 实现无限滚动加载**

```tsx
const [visibleCount, setVisibleCount] = useState(6)
const loadMoreRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => Math.min(prev + 3, filteredCourses.length))
      }
    },
    { threshold: 0.1 }
  )
  if (loadMoreRef.current) observer.observe(loadMoreRef.current)
  return () => observer.disconnect()
}, [filteredCourses.length])

// 在课程网格底部
{visibleCount < filteredCourses.length && (
  <div ref={loadMoreRef} className="flex justify-center py-8">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <Loader size={24} className="text-[#8A5A10]" />
    </motion.div>
  </div>
)}
```

- [ ] **Step 5: 添加收藏功能**

```tsx
// 收藏状态
const [favorites, setFavorites] = useState<string[]>(() => {
  try { return JSON.parse(localStorage.getItem('course_favorites') || '[]') }
  catch { return [] }
})

const toggleFavorite = (courseId: string) => {
  setFavorites(prev => {
    const next = prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    localStorage.setItem('course_favorites', JSON.stringify(next))
    return next
  })
}

// 卡片右上角收藏按钮
<button
  onClick={e => { e.preventDefault(); toggleFavorite(course.id) }}
  className="absolute top-4 right-4 p-2 rounded-full bg-white/80 backdrop-blur-sm hover:scale-110 transition-transform"
>
  <Heart
    size={16}
    className={favorites.includes(course.id) ? 'fill-[#A06050] text-[#A06050]' : 'text-[#999490]'}
  />
</button>
```

---

### Task 5: 优化单词学习 (WordLearn.tsx)

**Files:**
- Modify: `src/pages/WordLearn.tsx`

- [ ] **Step 1: 添加键盘快捷键支持**

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrev()
    else if (e.key === 'ArrowRight') handleNext()
    else if (e.key === ' ') { e.preventDefault(); handleFlip() }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [currentIndex, isFlipped])
```

- [ ] **Step 2: 添加学习模式选择器**

```tsx
const [mode, setMode] = useState<'sequential' | 'random' | 'difficulty'>('sequential')

// 模式选择
<div className="flex gap-2 mb-6">
  {[
    { value: 'sequential', label: '顺序学习' },
    { value: 'random', label: '随机模式' },
    { value: 'difficulty', label: '按难度' },
  ].map((m) => (
    <button
      key={m.value}
      onClick={() => setMode(m.value as any)}
      className={`px-4 py-2 rounded-full text-xs font-sans transition-all ${
        mode === m.value ? 'bg-[#8A5A10] text-white' : 'bg-black/[0.04] text-[#6B6560]'
      }`}
    >
      {m.label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: 添加学习计时器**

```tsx
const [elapsed, setElapsed] = useState(0)
const timerRef = useRef<ReturnType<typeof setInterval>>()

useEffect(() => {
  timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
  return () => clearInterval(timerRef.current)
}, [])

const formatTime = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

// 在统计面板显示
<span className="flex items-center gap-1 text-xs text-[#999490] font-mono">
  <Clock size={12} />
  {formatTime(elapsed)}
</span>
```

- [ ] **Step 4: 添加学习完成总结页**

```tsx
// 学习完成后显示总结
{isComplete && (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className="liquid-glass rounded-[2rem] p-10 text-center max-w-lg mx-auto"
  >
    <div className="w-20 h-20 rounded-2xl bg-[#22c55e]/10 flex items-center justify-center mx-auto mb-4">
      <CheckCircle size={40} className="text-[#22c55e]" />
    </div>
    <h2 className="font-serif text-2xl gradient-amber mb-4">学习完成！</h2>
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div>
        <p className="text-2xl font-bold text-[#1a1816]">{learnedCount}</p>
        <p className="text-xs text-[#999490]">已掌握</p>
      </div>
      <div>
        <p className="text-2xl font-bold text-[#1a1816]">{formatTime(elapsed)}</p>
        <p className="text-xs text-[#999490]">用时</p>
      </div>
      <div>
        <p className="text-2xl font-bold text-[#1a1816]">{Math.round((learnedCount / totalCount) * 100)}%</p>
        <p className="text-xs text-[#999490]">正确率</p>
      </div>
    </div>
    <Link to="/courses" className="btn-amber rounded-full px-8 py-3 text-sm font-medium inline-flex items-center gap-2">
      继续学习 <ArrowRight size={16} />
    </Link>
  </motion.div>
)}
```

---

### Task 6: 优化进度页面 (Progress.tsx)

**Files:**
- Modify: `src/pages/Progress.tsx`

- [ ] **Step 1: 添加时间范围选择器**

```tsx
const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year' | 'all'>('month')

<div className="flex gap-2 mb-6">
  {[
    { value: 'week', label: '本周' },
    { value: 'month', label: '本月' },
    { value: 'year', label: '年度' },
    { value: 'all', label: '全部' },
  ].map((range) => (
    <motion.button
      key={range.value}
      onClick={() => setTimeRange(range.value as any)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`px-5 py-2 rounded-full text-sm font-sans transition-all ${
        timeRange === range.value
          ? 'bg-[#8A5A10] text-white'
          : 'bg-black/[0.04] text-[#6B6560] hover:bg-black/[0.06]'
      }`}
    >
      {range.label}
    </motion.button>
  ))}
</div>
```

- [ ] **Step 2: 实现图表入场动画（面积从底部生长）**

```tsx
<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={chartData}>
    <defs>
      <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="#8A5A10" stopOpacity={0.3} />
        <stop offset="95%" stopColor="#8A5A10" stopOpacity={0} />
      </linearGradient>
    </defs>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
    <XAxis dataKey="date" stroke="#999490" fontSize={12} />
    <YAxis stroke="#999490" fontSize={12} />
    <Tooltip
      contentStyle={{
        background: 'rgba(250, 248, 245, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0,0,0,0.04)',
        borderRadius: '12px',
      }}
    />
    <Area
      type="monotone"
      dataKey="xp"
      stroke="#8A5A10"
      strokeWidth={2}
      fill="url(#colorXp)"
      animationBegin={300}
      animationDuration={1000}
      animationEasing="ease-out"
    />
  </AreaChart>
</ResponsiveContainer>
```

- [ ] **Step 3: 添加目标完成度环形图**

```tsx
// 使用 SVG 环形进度
<div className="flex items-center justify-center gap-8">
  {[
    { label: '每日目标', current: 35, target: 60, color: '#8A5A10' },
    { label: '周目标', current: 180, target: 300, color: '#5A8050' },
    { label: '月目标', current: 650, target: 1200, color: '#6060A0' },
  ].map((goal) => {
    const percentage = Math.min((goal.current / goal.target) * 100, 100)
    const circumference = 2 * Math.PI * 40
    const offset = circumference - (percentage / 100) * circumference
    
    return (
      <div key={goal.label} className="text-center">
        <svg width="100" height="100" className="transform -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />
          <motion.circle
            cx="50" cy="50" r="40" fill="none"
            stroke={goal.color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            whileInView={{ strokeDashoffset: offset }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] as const }}
          />
        </svg>
        <p className="text-lg font-bold text-[#1a1816] mt-2">{goal.current}/{goal.target}</p>
        <p className="text-xs text-[#999490]">{goal.label}</p>
      </div>
    )
  })}
</div>
```

---

### Task 7: 优化 TiltCard 组件

**Files:**
- Modify: `src/components/TiltCard.tsx`

- [ ] **Step 1: 增强 3D 倾斜效果**

```tsx
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface TiltCardProps {
  children: React.ReactNode
  className?: string
  tiltDegree?: number
}

export default function TiltCard({ children, className = '', tiltDegree = 8 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState({ rotateX: 0, rotateY: 0, scale: 1 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setStyle({
      rotateX: -y * tiltDegree,
      rotateY: x * tiltDegree,
      scale: 1.02,
    })
  }

  const handleMouseLeave = () => {
    setStyle({ rotateX: 0, rotateY: 0, scale: 1 })
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${style.rotateX}deg) rotateY(${style.rotateY}deg) scale(${style.scale})`,
        transition: 'transform 0.1s ease-out',
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
```