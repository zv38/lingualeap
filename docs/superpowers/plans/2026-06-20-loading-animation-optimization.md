# Loading Animation & Visual Rhythm Optimization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rotating-ring LoadingSpinner with a brand-focused loader, unify skeleton screens, add page-level loading states to Home and Courses, and tighten overall animation rhythm.

**Architecture:** Introduce a single `BrandLoader` component for full-screen/inline loading, consolidate skeleton components under `ui/Skeleton` with theme-aware styles, and add per-page skeleton layouts. All new animations reuse the existing global easing/timing tokens and respect `prefers-reduced-motion`.

**Tech Stack:** React, TypeScript, Tailwind CSS, Framer Motion, Lucide React

---

### Task 1: Create BrandLoader component

**Files:**
- Create: `src/components/BrandLoader.tsx`
- Modify: `src/components/LoadingSpinner.tsx` (delete or keep as re-export)
- Test: `npx tsc --noEmit`

- [ ] **Step 1: Delete old rotating LoadingSpinner**

Delete `src/components/LoadingSpinner.tsx`.

- [ ] **Step 2: Create BrandLoader component**

Create `src/components/BrandLoader.tsx`:

```tsx
import { motion, useReducedMotion } from 'framer-motion'
import { Brain } from 'lucide-react'

interface BrandLoaderProps {
  message?: string
  inline?: boolean
}

export default function BrandLoader({ message = '加载中...', inline = false }: BrandLoaderProps) {
  const reducedMotion = useReducedMotion()

  const content = (
    <div className="relative flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center">
        {!reducedMotion && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full bg-[var(--accent-primary)]/10 blur-xl"
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full border border-[var(--accent-primary)]/20"
              style={{ width: 72, height: 72 }}
              animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
        <motion.div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/20"
          animate={reducedMotion ? {} : { scale: [1, 1.04, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Brain size={32} strokeWidth={1.5} />
        </motion.div>
      </div>
      <motion.p
        className="text-sm font-medium tracking-wide text-[var(--text-secondary)]"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {message}
      </motion.p>
    </div>
  )

  if (inline) return content

  return (
    <div className="fixed inset-0 z-[10003] flex flex-col items-center justify-center bg-[var(--bg-primary)]/90 backdrop-blur-sm">
      {content}
    </div>
  )
}
```

- [ ] **Step 3: Update imports**

Find files importing `LoadingSpinner` and switch to `BrandLoader`:

```bash
npx grep -r "LoadingSpinner" src --include="*.tsx" --include="*.ts"
```

Replace each import and usage.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 2: Unify Skeleton components

**Files:**
- Modify: `src/components/ui/Skeleton.tsx`
- Delete: `src/components/Skeleton.tsx`
- Modify: all files importing `src/components/Skeleton`
- Test: `npx tsc --noEmit`

- [ ] **Step 1: Enhance ui/Skeleton.tsx**

Replace `src/components/ui/Skeleton.tsx` with:

```tsx
import React from 'react'
import { cn } from '../../utils/cn'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  circle?: boolean
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, circle, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'motion-safe:animate-pulse bg-[var(--bg-elevated)]',
        circle ? 'rounded-full' : 'rounded-[var(--radius-md)]',
        className
      )}
      {...props}
    />
  )
)
Skeleton.displayName = 'Skeleton'

export { Skeleton }
```

- [ ] **Step 2: Delete old Skeleton.tsx**

Delete `src/components/Skeleton.tsx`.

- [ ] **Step 3: Migrate imports**

Search and update:

```bash
npx grep -r "from '../Skeleton'\|from './Skeleton'\|from 'components/Skeleton'" src --include="*.tsx" --include="*.ts"
```

Change imports to `from '@/components/ui/Skeleton'` or relative `../ui/Skeleton`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 3: Add Home page skeleton layout

**Files:**
- Modify: `src/pages/Home.tsx`
- Test: manual UI check + `npx tsc --noEmit`

- [ ] **Step 1: Identify loading state in Home.tsx**

Find where data is fetched (e.g., `useEffect` + `useState`). Introduce `const [isLoading, setIsLoading] = useState(true)` if absent.

- [ ] **Step 2: Create HomeSkeleton component inline or in same file**

Add above the page component:

```tsx
function HomeSkeleton() {
  return (
    <div className="space-y-10 px-4 py-8 md:px-8">
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4 max-w-md" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Render skeleton while loading**

Wrap the main content:

```tsx
if (isLoading) return <HomeSkeleton />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 4: Add Courses page skeleton layout

**Files:**
- Modify: `src/pages/Courses.tsx`
- Test: manual UI check + `npx tsc --noEmit`

- [ ] **Step 1: Identify loading state in Courses.tsx**

Find data fetching state. If none, add `const [isLoading, setIsLoading] = useState(true)`.

- [ ] **Step 2: Create CoursesSkeleton component**

Add above the page component:

```tsx
function CoursesSkeleton() {
  return (
    <div className="space-y-8 px-4 py-8 md:px-8">
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Render skeleton while loading**

```tsx
if (isLoading) return <CoursesSkeleton />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 5: Refine Auth button loading state

**Files:**
- Modify: `src/pages/Auth.tsx`
- Test: `npx tsc --noEmit`

- [ ] **Step 1: Replace button spinner with dot-pulse**

Find the submit Button in `Auth.tsx`. Keep `loading={loading || success}` but verify Button component supports a custom loading indicator or text-only loading.

If Button supports `loadingText`, use:

```tsx
<Button
  loading={loading || success}
  loadingText={isLogin ? '登录中...' : '注册中...'}
>
  {!loading && !success && <ArrowRight size={16} />}
  {isLogin ? '登录' : '创建账户'}
</Button>
```

If Button only shows spinner, leave as-is and document as a later Button refactor.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 6: Audit animation rhythm in index.css

**Files:**
- Modify: `src/index.css`
- Test: visual review

- [ ] **Step 1: Ensure all breathing animations use consistent duration**

Search for `@keyframes` definitions. Standardize on:
- Breathing scale: 3s
- Shimmer: 1.6s
- Pulse: 2s

- [ ] **Step 2: Add prefers-reduced-motion fallback**

Ensure any custom keyframe animations respect:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-breathe,
  .animate-breathe-ring,
  .animate-shimmer {
    animation: none !important;
  }
}
```

- [ ] **Step 3: Verify no excessive blur/low-opacity**

Check glass card classes have sufficient opacity (`bg-opacity-80+`) to maintain readability.

---

### Task 7: Final validation

- [ ] **Step 1: Run lint and type check**

```bash
npx tsc --noEmit
npx eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0
```

Expected: Both pass.

- [ ] **Step 2: Manual UI smoke test**

1. Open http://localhost:3000/
2. Navigate to Home, Courses, Auth
3. Confirm no rotating ring loader appears; BrandLoader shows when needed
4. Confirm skeleton screens render during data fetch
5. Confirm animations still respect system reduced-motion setting

---

## Phase 2 (separate plan after phase 1 approval)

WebAuthn biometric login:
- Account settings page: register platform authenticator
- Login page: conditional "Face/Fingerprint login" button
- Backend endpoints to store/verify WebAuthn credentials

