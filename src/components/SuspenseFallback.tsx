import { motion } from 'framer-motion'
import BrandLoader from './BrandLoader'

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <motion.div
      className={`rounded-2xl bg-[var(--border-primary)]/40 ${className}`}
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

function SkeletonLine({ width = '100%' }: { width?: string }) {
  return (
    <motion.div
      className="h-3 rounded-full bg-[var(--border-primary)]/40"
      style={{ width }}
      animate={{ opacity: [0.25, 0.55, 0.25] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
    />
  )
}

function HomeSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-12">
      <div className="space-y-4">
        <SkeletonLine width="40%" />
        <SkeletonLine width="60%" />
        <SkeletonLine width="30%" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-48" />
        ))}
      </div>
      <div className="space-y-3">
        <SkeletonLine width="25%" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-32 flex-1" />
          ))}
        </div>
      </div>
    </div>
  )
}

function AuthSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto px-6 space-y-6">
      <div className="flex justify-center mb-8">
        <SkeletonBlock className="w-48 h-8 rounded-xl" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-20 rounded-2xl" />
      ))}
      <SkeletonBlock className="h-14 rounded-2xl mt-2" />
    </div>
  )
}

function CoursesSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-10">
      <div className="space-y-3">
        <SkeletonLine width="30%" />
        <SkeletonLine width="50%" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-64" />
        ))}
      </div>
    </div>
  )
}

function MembershipSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-10">
      <SkeletonBlock className="w-full h-64 rounded-[2rem]" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-40" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-96" />
        ))}
      </div>
    </div>
  )
}

function NotificationsSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-24 space-y-8">
      <SkeletonLine width="30%" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-24" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24" />
      ))}
    </div>
  )
}

function SecurityCenterSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-8">
      <SkeletonLine width="40%" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-48" />
        ))}
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12 space-y-8">
      <div className="flex items-center gap-6">
        <SkeletonBlock className="w-24 h-24 rounded-full" />
        <div className="flex-1 space-y-3">
          <SkeletonLine width="40%" />
          <SkeletonLine width="60%" />
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-32" />
      ))}
    </div>
  )
}

function WordLearnSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <SkeletonLine width="30%" />
        <SkeletonBlock className="w-32 h-10" />
      </div>
      <SkeletonBlock className="w-full h-96 rounded-[2rem]" />
      <div className="flex gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-14 flex-1" />
        ))}
      </div>
    </div>
  )
}

function DailyChallengeSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div className="text-center space-y-3">
        <SkeletonLine width="40%" />
        <SkeletonLine width="60%" />
      </div>
      <SkeletonBlock className="w-full h-80 rounded-[2rem]" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16" />
        ))}
      </div>
    </div>
  )
}

function BattleSkeleton() {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <SkeletonLine width="25%" />
        <SkeletonBlock className="w-28 h-10" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-48" />
        ))}
      </div>
      <SkeletonBlock className="w-full h-64" />
    </div>
  )
}

function ProgressSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-32" />
        ))}
      </div>
      <SkeletonBlock className="w-full h-80" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-64" />
        ))}
      </div>
    </div>
  )
}

function CommunitySkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-8">
      <div className="flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-24" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-40" />
      ))}
    </div>
  )
}

function AchievementsSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-10">
      <div className="flex items-center gap-6">
        <SkeletonBlock className="w-28 h-28 rounded-full" />
        <div className="flex-1 space-y-3">
          <SkeletonLine width="35%" />
          <SkeletonLine width="50%" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-32" />
        ))}
      </div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12 space-y-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24" />
      ))}
    </div>
  )
}

function LeaderboardSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto px-6 py-12 space-y-6">
      <SkeletonLine width="40%" />
      <SkeletonBlock className="w-full h-16" />
      {Array.from({ length: 10 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-14" />
      ))}
    </div>
  )
}

function AIAssistantSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12 space-y-6">
      <SkeletonBlock className="w-full h-[60vh]" />
      <div className="flex gap-4">
        <SkeletonBlock className="h-12 flex-1" />
        <SkeletonBlock className="h-12 w-24" />
      </div>
    </div>
  )
}

const routeSkeletons: Record<string, React.ReactNode> = {
  '/': <HomeSkeleton />,
  '/auth': <AuthSkeleton />,
  '/courses': <CoursesSkeleton />,
  '/membership': <MembershipSkeleton />,
  '/notifications': <NotificationsSkeleton />,
  '/security-center': <SecurityCenterSkeleton />,
  '/profile': <ProfileSkeleton />,
  '/settings': <SettingsSkeleton />,
  '/word-learn': <WordLearnSkeleton />,
  '/daily-challenge': <DailyChallengeSkeleton />,
  '/daily': <DailyChallengeSkeleton />,
  '/battle': <BattleSkeleton />,
  '/progress': <ProgressSkeleton />,
  '/community': <CommunitySkeleton />,
  '/achievements': <AchievementsSkeleton />,
  '/leaderboard': <LeaderboardSkeleton />,
  '/learning-stats': <ProgressSkeleton />,
  '/ai-assistant': <AIAssistantSkeleton />,
  '/ai-agent': <AIAssistantSkeleton />,
}

const SuspenseFallback = ({ height = '100vh', pathname }: { height?: string; pathname?: string }) => {
  const skeleton = pathname ? routeSkeletons[pathname] : null

  if (skeleton) {
    return (
      <div style={{ height, minHeight: height }} className="flex items-start justify-center pt-12 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full"
        >
          {skeleton}
        </motion.div>
      </div>
    )
  }

  return (
    <div
      style={{ height, minHeight: height }}
      className="flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrandLoader message="正在加载" inline />
      </motion.div>
    </div>
  )
}

export default SuspenseFallback