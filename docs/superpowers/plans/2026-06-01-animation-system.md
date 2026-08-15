# Animation System Implementation Plan

> **For agentic workers:** Execute tasks sequentially by phase. Each phase depends on previous.

**Goal:** Implement a comprehensive 4-layer animation system across all pages

**Architecture:** Layer 0 (hooks) → Layer 1 (components) → Layer 2 (pages) → Layer 3 (ambient)

**Tech Stack:** Framer Motion v12, GSAP v3, Three.js, React 18

---

### Phase 1: Layer 0 — Animation Hooks

**Files:**
- Create: `src/hooks/useAnimatedInView.ts`
- Create: `src/hooks/useSpringNumber.ts`
- Create: `src/hooks/useParallax.ts`
- Create: `src/hooks/useMouseGlow.ts`
- Create: `src/hooks/useGSAPTimeline.ts`
- Create: `src/hooks/useReducedMotion.ts`

**Details:** 6 foundational hooks powering all animation layers.

- [ ] **Create `src/hooks/useAnimatedInView.ts`** — IntersectionObserver + Framer Motion useInView wrapper with once/margin/threshold options
- [ ] **Create `src/hooks/useSpringNumber.ts`** — Animated number with spring physics, prefix/suffix/decimals support
- [ ] **Create `src/hooks/useParallax.ts`** — Scroll-driven parallax offset using Framer Motion useScroll + useTransform
- [ ] **Create `src/hooks/useMouseGlow.ts`** — Mouse position tracking for glow/light effects
- [ ] **Create `src/hooks/useGSAPTimeline.ts`** — GSAP timeline wrapper with auto-cleanup
- [ ] **Create `src/hooks/useReducedMotion.ts`** — prefers-reduced-motion media query hook

### Phase 2: Layer 1 — Animation Components

**Files:**
- Create: `src/components/animations/PageTransition.tsx`
- Create: `src/components/animations/ScrollReveal.tsx`
- Create: `src/components/animations/GlassCard.tsx`
- Create: `src/components/animations/RippleButton.tsx`
- Create: `src/components/animations/MagneticButton.tsx`
- Create: `src/components/animations/TextReveal.tsx`
- Create: `src/components/animations/FloatElement.tsx`
- Create: `src/components/animations/ListStagger.tsx`
- Create: `src/components/animations/FluidGradient.tsx`
- Create: `src/components/animations/ParticleBackground.tsx`
- Modify: `src/components/Confetti.tsx` — enhanced particle system

**Details:** Reusable animation components across all pages.

### Phase 3: Page Transitions

**Files:**
- Modify: `src/App.tsx`

**Details:** Wire up PageTransition in React Router with AnimatePresence.

### Phase 4: Page-level Animations

**Files:**
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Auth.tsx`
- Modify: `src/pages/Courses.tsx`
- Modify: `src/pages/Progress.tsx`
- Modify: `src/pages/Leaderboard.tsx`
- Modify: `src/pages/Achievements.tsx`
- Modify: `src/pages/WordLearn.tsx`
- Modify: `src/pages/GrammarLearn.tsx`

**Details:** Apply ScrollReveal, stagger lists, number animations, confetti effects to each page.

### Phase 5: Ambient Effects

**Files:**
- Create: `src/components/animations/AmbientCanvas.tsx`
- Modify: `src/App.tsx`

**Details:** Three.js floating geometry + fluid gradient background.

### Phase 6: Polish & Accessibility

**Files:**
- Modify: `src/components/animations/*.tsx`

**Details:** Ensure useReducedMotion respected everywhere, add will-change hints, lazy load heavy components.