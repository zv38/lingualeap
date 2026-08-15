import { motion } from 'framer-motion'
import { useState, useCallback } from 'react'
import {
  Bell, Clock, Mail, Moon, Sun, Settings, CheckCircle,
  Smartphone, BookOpen, Trophy, Zap, User, MessageCircle, AlertTriangle, Save
} from 'lucide-react'

interface NotificationType {
  key: string
  label: string
  icon: React.ElementType
  description: string
}

const notificationTypes: NotificationType[] = [
  { key: 'study_reminder', label: '学习提醒', icon: BookOpen, description: '每日学习任务和复习提醒' },
  { key: 'streak_alert', label: '连续学习提醒', icon: Zap, description: '连续学习记录即将中断时提醒' },
  { key: 'achievement_unlock', label: '成就解锁', icon: Trophy, description: '获得新成就时通知' },
  { key: 'daily_challenge', label: '每日挑战', icon: Sun, description: '每日挑战更新和结果通知' },
  { key: 'new_follower', label: '新关注', icon: User, description: '有用户关注你时通知' },
  { key: 'system', label: '系统通知', icon: Settings, description: '平台维护和版本更新通知' },
  { key: 'friend_request', label: '好友请求', icon: MessageCircle, description: '收到好友申请时通知' },
  { key: 'message', label: '消息通知', icon: Bell, description: '收到私信时通知' },
]

const frequencyOptions = [
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '工作日' },
  { value: 'weekends', label: '仅周末' },
]

const defaultEase = [0.22, 1, 0.36, 1] as const

const staggerContainer = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: defaultEase },
  },
}

function ToggleSwitch({
  enabled,
  onChange,
  id,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  id: string
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`w-12 h-6 rounded-full transition-all duration-300 relative flex-shrink-0 ${
        enabled ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-elevated)] border border-[var(--border-primary)]'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-[var(--text-on-accent)] absolute top-0.5 transition-all duration-300 ${
          enabled ? 'left-6' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export default function NotificationSettings() {
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default')

  const [typePrefs, setTypePrefs] = useState<Record<string, boolean>>({
    study_reminder: true,
    streak_alert: true,
    achievement_unlock: true,
    daily_challenge: true,
    new_follower: false,
    system: true,
    friend_request: true,
    message: true,
  })

  const [dailyReminderTime, setDailyReminderTime] = useState('09:00')
  const [reminderFrequency, setReminderFrequency] = useState('daily')

  const [emailNotifications, setEmailNotifications] = useState({
    weekly_report: true,
    achievement_alerts: true,
    promotional: false,
    security_alerts: true,
  })

  const [dndEnabled, setDndEnabled] = useState(false)
  const [dndStart, setDndStart] = useState('22:00')
  const [dndEnd, setDndEnd] = useState('08:00')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handlePushToggle = useCallback(async (enabled: boolean) => {
    setPushEnabled(enabled)

    if (enabled && 'Notification' in window) {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission === 'granted') {
        new Notification('推送通知已开启', {
          body: '你将收到来自 LinguaLeap 的推送通知',
          icon: '/favicon.ico',
        })
      }
    } else if (!('Notification' in window)) {
      setPushPermission('unsupported')
    } else {
      setPushPermission(Notification.permission)
    }
  }, [])

  const handleSave = useCallback(() => {
    setSaving(true)
    setSaved(false)

    setTimeout(() => {
      setSaving(false)
      setSaved(true)

      const msg = '通知偏好设置已保存'
      if (typeof (window as any).toast === 'function') {
        ;(window as any).toast(msg, 'success')
      }

      if (pushEnabled && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('设置已保存', {
          body: msg,
          icon: '/favicon.ico',
        })
      }

      setTimeout(() => setSaved(false), 2000)
    }, 1200)
  }, [pushEnabled])

  const sectionClasses = 'liquid-glass rounded-[2rem] p-8 mb-6 card-liquid'

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: defaultEase, delay: 0.1 }}
          className="mb-10"
        >
          <h1 className="font-serif text-4xl gradient-text mb-3">通知设置</h1>
          <p className="font-serif italic text-[var(--text-secondary)] text-lg">管理你的通知偏好和推送方式</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: defaultEase, delay: 0.15 }}
          className={sectionClasses}
        >
          <div className="flex items-center gap-3 mb-6">
            <Smartphone size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">推送通知</h2>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-[var(--text-primary)] text-sm font-medium mb-1">浏览器推送通知</p>
              <p className="text-[var(--text-muted)] text-xs font-sans">
                {pushPermission === 'granted'
                  ? '已授权浏览器推送'
                  : pushPermission === 'denied'
                    ? '推送权限已被拒绝，请在浏览器设置中重新开启'
                    : pushPermission === 'unsupported'
                      ? '当前浏览器不支持推送通知'
                      : '开启后你将收到浏览器推送通知'}
              </p>
            </div>
            <ToggleSwitch enabled={pushEnabled} onChange={handlePushToggle} id="push-toggle" />
          </div>
          {pushPermission === 'denied' && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20">
              <AlertTriangle size={14} className="text-[var(--error)] flex-shrink-0" />
              <span className="text-[var(--error)] text-xs font-sans">
                请在浏览器地址栏左侧的锁形图标中，将"通知"权限重新设置为允许              </span>
            </div>
          )}
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: defaultEase, delay: 0.2 }}
          className={sectionClasses}
        >
          <div className="flex items-center gap-3 mb-6">
            <Bell size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">通知类型偏好</h2>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-1"
          >
            {notificationTypes.map((nt) => {
              const Icon = nt.icon
              const enabled = typePrefs[nt.key]
              return (
                <motion.div
                  key={nt.key}
                  variants={staggerItem}
                  className="flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                      enabled ? 'bg-[var(--accent-primary)]/[0.1]' : 'bg-[var(--bg-secondary)]'
                    }`}>
                      <Icon size={16} className={enabled ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'} />
                    </div>
                    <div>
                      <span className={`text-sm font-medium transition-colors ${
                        enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                      }`}>
                        {nt.label}
                      </span>
                      <p className="text-[var(--text-muted)] text-xs font-sans mt-0.5">{nt.description}</p>
                    </div>
                  </div>
                  <ToggleSwitch
                    enabled={enabled}
                    onChange={(v) => setTypePrefs((prev) => ({ ...prev, [nt.key]: v }))}
                    id={`notif-type-${nt.key}`}
                  />
                </motion.div>
              )
            })}
          </motion.div>
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: defaultEase, delay: 0.25 }}
          className={sectionClasses}
        >
          <div className="flex items-center gap-3 mb-6">
            <Clock size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">提醒时间设置</h2>
          </div>
          <div className="space-y-5">
            <div>
              <label htmlFor="reminder-time" className="block text-[var(--text-secondary)] text-sm font-sans mb-2">
                每日学习提醒时间
              </label>
              <input
                id="reminder-time"
                type="time"
                value={dailyReminderTime}
                onChange={(e) => setDailyReminderTime(e.target.value)}
                className="liquid-glass rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 font-mono text-lg w-full"
              />
            </div>
            <div>
              <label htmlFor="reminder-frequency" className="block text-[var(--text-secondary)] text-sm font-sans mb-2">
                提醒频率
              </label>
              <div className="flex gap-2">
                {frequencyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setReminderFrequency(opt.value)}
                    className={`px-5 py-2.5 rounded-full transition-all duration-300 text-sm ${
                      reminderFrequency === opt.value
                        ? 'btn-amber'
                        : 'liquid-glass text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: defaultEase, delay: 0.3 }}
          className={sectionClasses}
        >
          <div className="flex items-center gap-3 mb-6">
            <Mail size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">邮件通知</h2>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-1"
          >
            {[
              { key: 'weekly_report', label: '每周学习报告', desc: '每周日发送学习进度总结' },
              { key: 'achievement_alerts', label: '成就提醒', desc: '获得新成就时邮件通知' },
              { key: 'promotional', label: '推广信息', desc: '课程优惠和活动推送' },
              { key: 'security_alerts', label: '安全提醒', desc: '账户安全和登录提醒' },
            ].map((item) => (
              <motion.div
                key={item.key}
                variants={staggerItem}
                className="flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <div>
                  <span className="text-[var(--text-primary)] text-sm font-medium">{item.label}</span>
                  <p className="text-[var(--text-muted)] text-xs font-sans mt-0.5">{item.desc}</p>
                </div>
                <ToggleSwitch
                  enabled={emailNotifications[item.key as keyof typeof emailNotifications]}
                  onChange={(v) =>
                    setEmailNotifications((prev) => ({ ...prev, [item.key]: v }))
                  }
                  id={`email-${item.key}`}
                />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: defaultEase, delay: 0.35 }}
          className={sectionClasses}
        >
          <div className="flex items-center gap-3 mb-6">
            <Moon size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">勿扰模式</h2>
          </div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[var(--text-primary)] text-sm font-medium mb-1">启用勿扰模式</p>
              <p className="text-[var(--text-muted)] text-xs font-sans">在指定时段内静音所有通知</p>
            </div>
            <ToggleSwitch enabled={dndEnabled} onChange={setDndEnabled} id="dnd-toggle" />
          </div>
          <div className={`grid grid-cols-2 gap-4 transition-all duration-500 overflow-hidden ${
            dndEnabled ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 pointer-events-none'
          }`}>
            <div>
              <label htmlFor="dnd-start" className="block text-[var(--text-secondary)] text-xs font-sans mb-2">
                开始时?              </label>
              <input
                id="dnd-start"
                type="time"
                value={dndStart}
                onChange={(e) => setDndStart(e.target.value)}
                className="liquid-glass rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 font-mono text-base w-full"
              />
            </div>
            <div>
              <label htmlFor="dnd-end" className="block text-[var(--text-secondary)] text-xs font-sans mb-2">
                结束时间
              </label>
              <input
                id="dnd-end"
                type="time"
                value={dndEnd}
                onChange={(e) => setDndEnd(e.target.value)}
                className="liquid-glass rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 font-mono text-base w-full"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: defaultEase, delay: 0.4 }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-amber rounded-full px-8 py-4 w-full flex items-center justify-center gap-3 text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {saving ? (
              <>
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                保存中...
              </>
            ) : saved ? (
              <>
                <CheckCircle size={20} />
                已保存              </>
            ) : (
              <>
                <Save size={20} />
                保存偏好设置
              </>
            )}
          </button>
        </motion.div>
      </div>
    </motion.div>
  )
}
