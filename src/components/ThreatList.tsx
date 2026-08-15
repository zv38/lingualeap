import { motion } from 'framer-motion'
import { AlertTriangle, Shield, Globe } from 'lucide-react'

interface Threat {
  key: string
  score: number
  requestCount: number
  firstSeen?: number
  signals?: { type: string; risk: string; value?: string }[]
}

interface ThreatListProps {
  threats: Threat[]
}

export default function ThreatList({ threats }: ThreatListProps) {
  return (
    <div className="rounded-2xl p-4 h-full flex flex-col"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-[var(--danger)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">活跃威胁</h3>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.10)', color: 'var(--text-primary)' }}>
          {threats.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {threats.slice(0, 20).map((t, i) => (
          <motion.div
            key={t.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.08)', color: 'var(--text-primary)' }}>
              <Globe size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-primary)] truncate">{t.key}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: t.score >= 0.75 ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.08)', color: 'var(--text-primary)' }}>
                  {(t.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {t.requestCount} 请求 · {t.signals?.map(s => s.type).join(', ') || '行为异常'}
              </p>
            </div>
          </motion.div>
        ))}
        {threats.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--text-muted)] flex flex-col items-center gap-2">
            <Shield size={20} className="text-[var(--success)]" />
            当前无活跃威胁
          </div>
        )}
      </div>
    </div>
  )
}
