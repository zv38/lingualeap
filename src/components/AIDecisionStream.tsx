import { motion, AnimatePresence } from 'framer-motion'
import { Shield, CheckCircle, AlertTriangle, XCircle, Activity } from 'lucide-react'

interface Decision {
  id: string
  action: 'ALLOW' | 'CHALLENGE' | 'BLOCK' | 'DEGRADE' | 'OBSERVE'
  confidence: number
  reasoning: string
  context: { ip: string; endpoint: string }
  latency: number
  timestamp: string
}

interface AIDecisionStreamProps {
  decisions: Decision[]
  maxItems?: number
}

const actionConfig = {
  ALLOW: { icon: CheckCircle, color: 'var(--success)', label: '放行' },
  CHALLENGE: { icon: AlertTriangle, color: 'var(--warning)', label: '挑战' },
  BLOCK: { icon: XCircle, color: 'var(--danger)', label: '拦截' },
  DEGRADE: { icon: Activity, color: 'var(--accent-primary)', label: '降级' },
  OBSERVE: { icon: Shield, color: 'var(--text-muted)', label: '观察' },
}

export default function AIDecisionStream({ decisions, maxItems = 20 }: AIDecisionStreamProps) {
  const items = decisions.slice(0, maxItems)

  return (
    <div className="rounded-2xl p-4 h-full flex flex-col glass-card">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-[var(--accent-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">实时 AI 决策流</h3>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        <AnimatePresence initial={false}>
          {items.map((d) => {
            const config = actionConfig[d.action] || actionConfig.OBSERVE
            const Icon = config.icon
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                className="rounded-xl p-3"
                style={{ background: 'rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} style={{ color: config.color }} />
                  <span className="text-xs font-medium" style={{ color: config.color }}>{config.label}</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-auto">{d.latency}ms</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{d.reasoning}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)]">
                  <span>{d.context?.ip || '-'}</span>
                  <span>{d.context?.endpoint || '-'}</span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">暂无决策记录</div>
        )}
      </div>
    </div>
  )
}
