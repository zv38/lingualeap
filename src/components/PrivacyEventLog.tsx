import { motion } from 'framer-motion'
import { Eye, Filter, ShieldAlert, UserCheck, Trash2 } from 'lucide-react'

interface PrivacyEvent {
  id: string
  action: string
  userId: string
  timestamp: string
  details?: { count?: number; types?: string[]; blocked?: boolean }
}

interface PrivacyEventLogProps {
  events: PrivacyEvent[]
  stats?: { totalScans: number; totalFilters: number; typeCounts: Record<string, number> }
}

const actionIcons: Record<string, React.ElementType> = {
  pii_detected: Eye,
  output_filter_triggered: Filter,
  consent_granted: UserCheck,
  consent_revoked: UserCheck,
  chat_history_deleted: Trash2,
  default: ShieldAlert,
}

export default function PrivacyEventLog({ events, stats }: PrivacyEventLogProps) {
  return (
    <div className="rounded-2xl p-4 h-full flex flex-col glass-card"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-[var(--accent-primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">隐私审计事件</h3>
        </div>
        {stats && (
          <div className="flex gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.08)', color: 'var(--text-primary)' }}>
              脱敏 {stats.totalScans}
            </span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.08)', color: 'var(--text-secondary)' }}>
              过滤 {stats.totalFilters}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {events.slice(0, 50).map((e, i) => {
          const Icon = actionIcons[e.action] || actionIcons.default
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-xl p-3 flex items-start gap-3"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-primary)' }}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{e.action.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{new Date(e.timestamp).toLocaleTimeString('zh-CN')}</span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  用户 {e.userId} · {e.details?.types?.join(', ') || `${e.details?.count || 0} 项`}
                </p>
              </div>
            </motion.div>
          )
        })}
        {events.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">暂无隐私事件</div>
        )}
      </div>
    </div>
  )
}
