import { motion, type MotionValue } from 'framer-motion'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number | MotionValue<string>
  icon: LucideIcon
  color?: string
  delay?: number
  trend?: string
}

export default function StatCard({ label, value, icon: Icon, color = 'var(--accent-primary)', delay = 0, trend }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay }}
      className="relative overflow-hidden rounded-2xl p-4"
      style={{
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)] mb-1">{label}</p>
          <motion.div className="text-2xl font-bold text-[var(--text-primary)]">{value}</motion.div>
          {trend && <p className="text-[10px] mt-1" style={{ color }}>{trend}</p>}
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18`, color }}
        >
          <Icon size={18} />
        </div>
      </div>
      <div
        className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-20 pointer-events-none"
        style={{ background: color }}
      />
    </motion.div>
  )
}
