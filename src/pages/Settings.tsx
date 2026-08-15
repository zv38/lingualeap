import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Moon, Sun, Monitor, Bell, Globe, Clock, Target, RefreshCw, Cloud, Info, RotateCcw } from 'lucide-react'
import { useStore } from '../store/useStore'
import InfoTip from '../components/InfoTip'

const LANGUAGE_LABELS = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
]

const THEME_OPTIONS = [
  { code: 'dark', label: '深色', icon: Moon },
  { code: 'light', label: '浅色', icon: Sun },
  { code: 'system', label: '跟随系统', icon: Monitor },
]

const Settings = () => {
  const {
    user, theme: storeTheme, setTheme: setStoreTheme, uiLanguage, setUiLanguage, addToast,
    refreshUserData, cloudConfig, appVersion: storeAppVersion
  } = useStore()
  const [theme, setTheme] = useState(storeTheme || 'system')
  const [language, setLanguage] = useState(uiLanguage)
  const [dailyGoal, setDailyGoal] = useState(user?.dailyGoal || 30)
  const [reminderTime, setReminderTime] = useState(user?.reminderTime || '09:00')
  const [notifications, setNotifications] = useState({
    streak: true,
    challenge: true,
    follower: false,
  })
  const [appVersion, setAppVersion] = useState(storeAppVersion)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  useEffect(() => {
    fetch('/version.json', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data?.version) setAppVersion(data.version)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setTheme(storeTheme || 'system')
  }, [storeTheme])

  useEffect(() => {
    setLanguage(uiLanguage)
  }, [uiLanguage])

  const handleThemeChange = (code: 'dark' | 'light' | 'system') => {
    setTheme(code)
    setStoreTheme(code)
  }

  const handleLanguageChange = (code: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'de') => {
    setLanguage(code)
    setUiLanguage(code)
  }

  const handleRefreshData = async () => {
    setRefreshing(true)
    try {
      await refreshUserData()
      setLastRefreshed(new Date().toLocaleString('zh-CN'))
      addToast('数据已刷新', 'success', 3000)
    } catch {
      addToast('数据刷新失败，请检查网络', 'error', 3000)
    } finally {
      setRefreshing(false)
    }
  }

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
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
          className="mb-10"
        >
          <h1 className="font-serif text-4xl gradient-text mb-3">学习设置</h1>
          <p className="font-serif italic text-[var(--text-secondary)] text-lg">个性化你的学习体验</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          className="liquid-glass rounded-[2rem] p-8 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Sun size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">主题<InfoTip content="选择界面主题" /></h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {THEME_OPTIONS.map((t) => {
              const Icon = t.icon
              return (
                <button
                    key={t.code}
                    onClick={() => handleThemeChange(t.code as 'dark' | 'light' | 'system')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 ${
                    theme === t.code
                      ? 'btn-amber'
                      : 'liquid-glass text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              )
            })}
          </div>
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
          className="liquid-glass rounded-[2rem] p-8 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Globe size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">语言<InfoTip content="选择界面语言" /></h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {LANGUAGE_LABELS.map((lang) => (
              <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code as 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'de')}
                  className={`px-5 py-2.5 rounded-full transition-all duration-300 ${
                  language === lang.code
                    ? 'btn-amber'
                    : 'liquid-glass text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="text-sm font-medium">{lang.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
          className="liquid-glass rounded-[2rem] p-8 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Target size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">每日目标</h2>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <span className="font-serif text-2xl text-[var(--accent-primary)]">{dailyGoal}</span>
            <span className="text-[var(--text-secondary)] text-sm">分钟 / </span>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            step={5}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value))}
            className="w-full h-2 bg-[var(--accent-primary)]/10 rounded-full appearance-none cursor-pointer accent-[var(--accent-primary)]"
          />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-[var(--text-muted)] font-mono">10</span>
            <span className="text-xs text-[var(--text-muted)] font-mono">120</span>
          </div>
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
          className="liquid-glass rounded-[2rem] p-8 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Clock size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">提醒时间</h2>
          </div>
          <input
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            className="liquid-glass rounded-xl px-4 py-3 text-[var(--text-primary)] bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/30 font-mono text-lg"
          />
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
          className="liquid-glass rounded-[2rem] p-8 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Bell size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">通知<InfoTip content="切换后立即生效" /></h2>
          </div>
          <div className="space-y-4">
            {[
              { key: 'streak', label: '连续学习提醒' },
              { key: 'challenge', label: '每日挑战通知' },
              { key: 'follower', label: '新关注者通知' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)] text-sm">{item.label}</span>
                <button
                  onClick={() => setNotifications((prev) => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                  className={`w-12 h-6 rounded-full transition-all duration-300 relative ${
                    notifications[item.key as keyof typeof notifications]
                      ? 'bg-[var(--accent-primary)]'
                      : 'bg-black/10'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-[var(--text-primary)] absolute top-0.5 transition-all duration-300 ${
                      notifications[item.key as keyof typeof notifications]
                        ? 'left-6'
                        : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="ornament mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
          className="liquid-glass rounded-[2rem] p-8 mb-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <Cloud size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-serif text-xl text-[var(--text-primary)]">版本与数据</h2>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between py-3 border-b border-[var(--border-secondary)]">
              <span className="text-[var(--text-secondary)] text-sm">当前客户端版本</span>
              <span className="font-mono text-sm px-3 py-1 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                v{appVersion}
              </span>
            </div>
            {cloudConfig?.announcement ? (
              <div className="flex items-start gap-2 py-2 text-sm text-[var(--text-secondary)]">
                <Info size={16} className="mt-0.5 flex-shrink-0 text-[var(--accent-primary)]" />
                <span>{String(cloudConfig.announcement)}</span>
              </div>
            ) : null}
            {lastRefreshed ? (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <RotateCcw size={12} />
                <span>上次同步：{lastRefreshed}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRefreshData}
              disabled={refreshing}
              className="btn-ghost rounded-full px-6 py-3 text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? '同步中...' : '刷新数据'}
            </button>
            <button className="btn-ghost rounded-full px-6 py-3 text-sm text-[var(--warning)]">
              清除学习数据
            </button>
            <button className="btn-ghost rounded-full px-6 py-3 text-sm">
              导出数据
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <button onClick={() => addToast('设置已保存', 'success', 3000)} className="btn-amber rounded-full px-8 py-4 w-full">
            保存设置
          </button>
        </motion.div>
      </div>
    </motion.div>
  )
}

export default Settings

