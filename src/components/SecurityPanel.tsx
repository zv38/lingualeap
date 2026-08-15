import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, Info, ChevronRight, RefreshCw, CheckCircle, ExternalLink, Clock, Fingerprint, Mail, Globe, Monitor, Bug } from 'lucide-react'
import { securityApi } from '../utils/api'

// ============================================================================
// 类型定义
// ============================================================================

interface SecurityFactor {
  id: string
  name: string
  weight: number
  count?: number
}

interface RiskEvent {
  id: string
  type: string
  timestamp: string
  details: Record<string, unknown>
  read: boolean
}

interface SecuritySuggestion {
  id: string
  text: string
  impact: string
  action: string
  actionLink: string
}

interface BanEntry {
  type: string
  bannedAt: string
  bannedBy: string
  reason: string
  expiresAt: string | null
  evidence?: Record<string, unknown> | null
}

interface SecurityOverview {
  status: string
  score: number
  level: string
  factors: SecurityFactor[]
  events: RiskEvent[]
  banInfo: BanEntry | null
  banHistory: BanEntry[]
  appealStatus: string | null
  suggestions: SecuritySuggestion[]
  meritPoints: number
  autoBanCount: number
  createdAt: string
  unreadEvents: number
}

// ============================================================================
// 状态映射
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; description: string; action?: string }> = {
  safe: {
    label: '安全',
    color: 'var(--success)',
    icon: ShieldCheck,
    description: '账户状态正常，无安全风险。',
  },
  aware: {
    label: '知晓',
    color: 'var(--warning)',
    icon: AlertTriangle,
    description: '存在轻微风险因素，建议查看改善建议。',
    action: '尽快改善可避免状态升级',
  },
  watch: {
    label: '观察',
    color: '#f59e0b',
    icon: ShieldAlert,
    description: '账户存在风险迹象，敏感操作需额外验证。',
    action: '请尽快改善安全设置，否则将被限制',
  },
  restricted: {
    label: '受限',
    color: '#ef4444',
    icon: ShieldX,
    description: '账户已被限制部分功能，请尽快处理风险因素。',
    action: '部分功能受限，请完成安全设置恢复',
  },
  frozen: {
    label: '冻结',
    color: '#dc2626',
    icon: ShieldX,
    description: '账户已被冻结，请提交申诉进行复核。',
    action: '请立即提交申诉以恢复账户',
  },
  banned: {
    label: '封禁',
    color: '#991b1b',
    icon: ShieldX,
    description: '账户已被永久封禁。',
    action: '如有异议请在 7 天内提交申诉',
  },
}

const FACTOR_ICONS: Record<string, React.ElementType> = {
  IP_PROXY_SEGMENT: Globe,
  IP_MULTI_PROXY: Globe,
  IP_VIA_HEADER: Globe,
  IP_CF_MISMATCH: Globe,
  IP_ANON_HEADER: Globe,
  UA_MISSING: Monitor,
  UA_AUTOMATION: Monitor,
  EMAIL_DISPOSABLE: Mail,
  EMAIL_SUSPICIOUS_DOMAIN: Mail,
  ASSOC_BANNED_ENTITY: Fingerprint,
  ASSOC_IP_HIGH: Globe,
  ASSOC_IP_MEDIUM: Globe,
  ASSOC_DEVICE_HIGH: Fingerprint,
  ASSOC_DEVICE_MEDIUM: Fingerprint,
  ASSOC_DOMAIN_HIGH: Mail,
  ASSOC_DOMAIN_MEDIUM: Mail,
  BEH_NO_ACCEPT_LANG: Monitor,
  BEH_REFERER_ORIGIN_MISMATCH: Bug,
  BEH_NO_SEC_FETCH: Monitor,
  BEH_NON_BROWSER_UA: Monitor,
  BEH_GET_WITH_BODY: Bug,
  IP_BAD_REPUTATION: Globe,
}

// ============================================================================
// 组件
// ============================================================================

export default function SecurityPanel() {
  const [overview, setOverview] = useState<SecurityOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>('status')
  const [eventsExpanded, setEventsExpanded] = useState(false)

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await securityApi.getOverview()
      if (res.success && res.data) {
        setOverview(res.data)
      }
    } catch (err: any) {
      setError(err?.message || '加载安全信息失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  const status = overview?.status || 'safe'
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.safe
  const StatusIcon = config.icon

  if (loading) {
    return (
      <div className="security-panel">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
        <style>{styles}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div className="security-panel">
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle className="w-8 h-8" style={{ color: 'var(--error)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{error}</p>
          <button
            onClick={fetchOverview}
            className="px-4 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--accent-primary)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
        <style>{styles}</style>
      </div>
    )
  }

  return (
    <div className="security-panel">
      {/* ===== 状态摘要 ===== */}
      <motion.div
        className="security-status-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="status-icon-wrapper">
          <StatusIcon className="status-icon" style={{ color: config.color }} />
          <div className="status-ring" style={{ borderColor: config.color }} />
        </div>
        <div className="status-info">
          <h3 className="status-label">{config.label}</h3>
          <p className="status-description">{config.description}</p>
        </div>
        <div className="status-score">
          <div className="score-ring">
            <svg viewBox="0 0 36 36" className="score-ring-svg">
              <path
                className="score-ring-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="3"
              />
              <path
                className="score-ring-fill"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke={config.color}
                strokeWidth="3"
                strokeDasharray={`${overview?.score || 0}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="score-value" style={{ color: config.color }}>
              {overview?.score || 0}
            </span>
          </div>
          <span className="score-label">安全分</span>
        </div>
      </motion.div>

      {/* ===== 风险因素 ===== */}
      {overview && overview.factors.length > 0 && (
        <motion.div
          className="security-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            className="section-header"
            onClick={() => setExpandedSection(expandedSection === 'factors' ? null : 'factors')}
          >
            <div className="section-header-left">
              <AlertTriangle className="section-icon" style={{ color: 'var(--warning)' }} />
              <span>影响评分的因素</span>
            </div>
            <ChevronRight
              className={`section-chevron ${expandedSection === 'factors' ? 'rotated' : ''}`}
            />
          </button>
          <AnimatePresence>
            {expandedSection === 'factors' && (
              <motion.div
                className="section-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="factors-list">
                  {overview.factors.map((factor, i) => {
                    const FactorIcon = FACTOR_ICONS[factor.id] || Info
                    return (
                      <motion.div
                        key={factor.id}
                        className="factor-item"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <FactorIcon className="factor-icon" style={{ color: 'var(--text-muted)' }} />
                        <div className="factor-info">
                          <span className="factor-name">{factor.name}</span>
                          {factor.count !== undefined && (
                            <span className="factor-count">×{factor.count}</span>
                          )}
                        </div>
                        <span className="factor-weight" style={{ color: factor.weight >= 20 ? '#ef4444' : '#f59e0b' }}>
                          +{factor.weight}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ===== 改善建议 ===== */}
      {overview && overview.suggestions.length > 0 && (
        <motion.div
          className="security-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            className="section-header"
            onClick={() => setExpandedSection(expandedSection === 'suggestions' ? null : 'suggestions')}
          >
            <div className="section-header-left">
              <CheckCircle className="section-icon" style={{ color: 'var(--accent-primary)' }} />
              <span>改善建议</span>
            </div>
            <ChevronRight
              className={`section-chevron ${expandedSection === 'suggestions' ? 'rotated' : ''}`}
            />
          </button>
          <AnimatePresence>
            {expandedSection === 'suggestions' && (
              <motion.div
                className="section-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="suggestions-list">
                  {overview.suggestions.map((suggestion, i) => (
                    <motion.div
                      key={suggestion.id}
                      className="suggestion-item"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div className="suggestion-content">
                        <p className="suggestion-text">{suggestion.text}</p>
                        <span className="suggestion-impact">预计{suggestion.impact}</span>
                      </div>
                      <a href={suggestion.actionLink} className="suggestion-action">
                        {suggestion.action}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ===== 风险事件 ===== */}
      {overview && overview.events.length > 0 && (
        <motion.div
          className="security-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            className="section-header"
            onClick={() => setEventsExpanded(!eventsExpanded)}
          >
            <div className="section-header-left">
              <Clock className="section-icon" style={{ color: 'var(--text-muted)' }} />
              <span>最近安全事件</span>
            </div>
            <ChevronRight className={`section-chevron ${eventsExpanded ? 'rotated' : ''}`} />
          </button>
          <AnimatePresence>
            {eventsExpanded && (
              <motion.div
                className="section-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="events-list">
                  {overview.events.map((event, i) => (
                    <motion.div
                      key={event.id}
                      className={`event-item ${event.read ? 'read' : 'unread'}`}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="event-dot" style={{
                        background: event.read ? 'var(--text-muted)' : 'var(--accent-primary)',
                      }} />
                      <div className="event-info">
                        <span className="event-type">{getEventTypeLabel(event.type)}</span>
                        <span className="event-time">{formatTime(event.timestamp)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ===== 封禁信息 ===== */}
      {overview?.banInfo && (
        <motion.div
          className={`security-section ban-section ${overview.banInfo.type === 'warning' ? 'ban-warning-section' : ''}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="ban-header">
            {overview.banInfo.type === 'warning' ? (
              <AlertTriangle className="ban-icon" style={{ color: '#f59e0b' }} />
            ) : (
              <ShieldX className="ban-icon" style={{ color: '#ef4444' }} />
            )}
            <div>
              <h4 style={{ color: overview.banInfo.type === 'warning' ? '#f59e0b' : '#ef4444' }}>
                {overview.banInfo.type === 'warning' ? '⚠️ 封禁预通知' :
                 overview.banInfo.type === 'permanent' ? '永久封禁' : '临时封禁'}
              </h4>
              <p className="ban-reason">原因：{overview.banInfo.reason}</p>
              {overview.banInfo.expiresAt && (
                <p className="ban-expiry">
                  {overview.banInfo.type === 'warning'
                    ? '请在以下时间前改善安全行为，否则账户将被自动冻结：'
                    : '解封时间：'}
                  {formatTime(overview.banInfo.expiresAt)}
                </p>
              )}
            </div>
          </div>
          {overview.banInfo.type === 'warning' && (
            <div className="ban-warning-action">
              <p className="ban-warning-hint">立即改善安全行为可避免账户被冻结</p>
              <a href="/settings/security" className="appeal-link" style={{ color: '#f59e0b' }}>
                前往安全设置 →
              </a>
            </div>
          )}
          {!overview.appealStatus && overview.banInfo.type !== 'warning' && (
            <a href="/appeal" className="appeal-link">
              提交申诉 →
            </a>
          )}
        </motion.div>
      )}

      {/* ===== 封禁历史 ===== */}
      {overview && overview.banHistory && overview.banHistory.length > 0 && (
        <motion.div
          className="security-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
        >
          <button
            className="section-header"
            onClick={() => setExpandedSection(expandedSection === 'banHistory' ? null : 'banHistory')}
          >
            <div className="section-header-left">
              <Clock className="section-icon" style={{ color: 'var(--text-muted)' }} />
              <span>封禁记录（{overview.banHistory.length} 次）</span>
            </div>
            <ChevronRight
              className={`section-chevron ${expandedSection === 'banHistory' ? 'rotated' : ''}`}
            />
          </button>
          <AnimatePresence>
            {expandedSection === 'banHistory' && (
              <motion.div
                className="section-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="ban-history-list">
                  {overview.banHistory.map((ban, i) => (
                    <motion.div
                      key={i}
                      className="ban-history-item"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div className="ban-history-dot" style={{
                        background: ban.type === 'permanent' ? '#991b1b' : ban.type === 'warning' ? '#f59e0b' : '#ef4444',
                      }} />
                      <div className="ban-history-info">
                        <span className="ban-history-type">
                          {ban.type === 'warning' ? '封禁预通知' :
                           ban.type === 'permanent' ? '永久封禁' :
                           ban.type === 'temp_1d' ? '临时封禁(1天)' :
                           ban.type === 'temp_3d' ? '临时封禁(3天)' :
                           ban.type === 'temp_7d' ? '临时封禁(7天)' :
                           ban.type === 'temp_30d' ? '临时封禁(30天)' : ban.type}
                        </span>
                        <span className="ban-history-reason">{ban.reason}</span>
                        <span className="ban-history-time">{formatTime(ban.bannedAt)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ===== 底部信息 ===== */}
      {overview && (
        <div className="security-footer">
          {overview.meritPoints > 0 && (
            <span className="merit-badge">
              <CheckCircle className="w-3 h-3" />
              良好行为积分：{overview.meritPoints}
            </span>
          )}
          <button
            onClick={fetchOverview}
            className="refresh-btn"
            title="刷新安全状态"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      <style>{styles}</style>
    </div>
  )
}

// ============================================================================
// 辅助函数
// ============================================================================

function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    registration_risk: '注册风险检测',
    account_banned: '账号封禁',
    status_changed: '状态变更',
    login_risk: '登录风险检测',
  }
  return labels[type] || type
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = Date.now()
    const diff = now - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 7) return `${days} 天前`
    return date.toLocaleDateString('zh-CN')
  } catch {
    return timestamp
  }
}

// ============================================================================
// 样式
// ============================================================================

const styles = `
.security-panel {
  width: 100%;
  max-width: 480px;
}

/* ===== 状态卡片 ===== */
.security-status-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}

.status-icon-wrapper {
  position: relative;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon {
  width: 28px;
  height: 28px;
  z-index: 1;
}

.status-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid;
  opacity: 0.3;
  animation: statusPulse 3s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.1); opacity: 0.15; }
}

.status-info {
  flex: 1;
  min-width: 0;
}

.status-label {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.status-description {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

/* ===== 分数环 ===== */
.status-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.score-ring {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.score-ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.score-ring-bg {
  stroke: rgba(255, 255, 255, 0.05);
}

.score-ring-fill {
  transition: stroke-dasharray 0.5s ease;
}

.score-value {
  font-size: 0.85rem;
  font-weight: 700;
  z-index: 1;
}

.score-label {
  font-size: 0.65rem;
  color: var(--text-muted);
}

/* ===== 区块 ===== */
.security-section {
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 500;
  transition: background 0.2s;
}

.section-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.section-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.section-chevron {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  transition: transform 0.3s ease;
}

.section-chevron.rotated {
  transform: rotate(90deg);
}

.section-content {
  overflow: hidden;
}

/* ===== 因素列表 ===== */
.factors-list {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.factor-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.factor-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.factor-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.factor-name {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.factor-count {
  font-size: 0.7rem;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 4px;
}

.factor-weight {
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

/* ===== 建议列表 ===== */
.suggestions-list {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.suggestion-content {
  flex: 1;
  min-width: 0;
}

.suggestion-text {
  font-size: 0.8rem;
  color: var(--text-primary);
  margin: 0 0 2px 0;
}

.suggestion-impact {
  font-size: 0.7rem;
  color: var(--accent-primary);
}

.suggestion-action {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--accent-primary);
  text-decoration: none;
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.1);
  transition: background 0.2s;
}

.suggestion-action:hover {
  background: rgba(99, 102, 241, 0.2);
}

/* ===== 事件列表 ===== */
.events-list {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
}

.event-item.unread {
  background: rgba(99, 102, 241, 0.05);
}

.event-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.event-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.event-type {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.event-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ===== 封禁区块 ===== */
.ban-section {
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.05);
}

.ban-warning-section {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.06);
}

.ban-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
}

.ban-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.ban-header h4 {
  margin: 0 0 4px 0;
  font-size: 0.9rem;
  color: #ef4444;
}

.ban-reason, .ban-expiry {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.ban-warning-action {
  padding: 0 16px 12px;
}

.ban-warning-hint {
  margin: 0 0 8px 0;
  font-size: 0.8rem;
  color: #f59e0b;
  text-align: center;
}

.appeal-link {
  display: block;
  padding: 10px 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--accent-primary);
  text-decoration: none;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.2s;
}

.appeal-link:hover {
  background: rgba(99, 102, 241, 0.05);
}

/* ===== 封禁历史 ===== */
.ban-history-list {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ban-history-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.ban-history-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.ban-history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ban-history-type {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-primary);
}

.ban-history-reason {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.ban-history-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  opacity: 0.7;
}

/* ===== 底部 ===== */
.security-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  margin-top: 4px;
}

.merit-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: var(--success);
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}
`