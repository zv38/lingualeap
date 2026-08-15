import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Shield, Download, Trash2, Bell, Lock, CheckCircle, AlertTriangle, RefreshCw, Brain, History } from 'lucide-react'
import { useStore } from '../store/useStore'
import { authApi } from '../utils/api'
import InfoTip from '../components/InfoTip'

const PrivacySettings = () => {
  const navigate = useNavigate()
  const { user, privacyAgreed, setPrivacyAgreed, aiDataConsent, setAiDataConsent, addToast } = useStore()
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteDone, setDeleteDone] = useState(false)
  const [cookieConsent, setCookieConsent] = useState(() => localStorage.getItem('cookie_consent') !== 'false')
  const [notifPrefs, setNotifPrefs] = useState({
    studyReminder: true,
    communityActivity: false,
    promotional: false,
  })
  const [aiConsentLoading, setAiConsentLoading] = useState(false)
  const [historyCount, setHistoryCount] = useState<number | null>(null)
  const [historyDeleting, setHistoryDeleting] = useState(false)

  const handleExportData = async () => {
    setExporting(true)
    await new Promise(r => setTimeout(r, 1500))
    const data = {
      exportDate: new Date().toISOString(),
      user: user ? { id: user.id, username: user.username, email: user.email } : null,
      privacyAgreed,
      preferences: {
        cookieConsent,
        notifications: notifPrefs,
      },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lingualeap-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
    setExportDone(true)
    setTimeout(() => setExportDone(false), 3000)
  }

  const handleDeleteData = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    setDeleting(true)
    setTimeout(() => {
      localStorage.clear()
      sessionStorage.clear()
      setDeleting(false)
      setDeleteDone(true)
      setDeleteConfirm(false)
      setTimeout(() => {
        navigate('/')
      }, 2000)
    }, 2000)
  }

  const handleRevokePrivacy = () => {
    setPrivacyAgreed(false)
  }

  useEffect(() => {
    if (!user) return
    authApi.getChatHistory().then((res) => {
      if (res.success && Array.isArray(res.data?.data)) {
        setHistoryCount(res.data.data.length)
      }
    })
  }, [user])

  const handleAiConsentToggle = async () => {
    if (aiConsentLoading) return
    setAiConsentLoading(true)
    const next = !aiDataConsent
    const ok = await setAiDataConsent(next)
    if (ok) {
      addToast(next ? '已授权 AI 使用学习数据进行个性化推荐' : '已撤销 AI 数据授权', 'success', 3000)
    } else {
      addToast('授权状态更新失败，请稍后重试', 'error', 3000)
    }
    setAiConsentLoading(false)
  }

  const handleDeleteChatHistory = async () => {
    setHistoryDeleting(true)
    const res = await authApi.deleteChatHistory()
    if (res.success) {
      setHistoryCount(0)
      addToast('AI 对话历史已删除', 'success', 3000)
    } else {
      addToast('删除失败，请稍后重试', 'error', 3000)
    }
    setHistoryDeleting(false)
  }

  const settingsSections = [
    {
      title: '隐私协议状态',
      icon: Shield,
      items: [
        {
          label: '隐私协议',
          desc: privacyAgreed ? '已同意' : '未同意',
          status: privacyAgreed ? 'active' : 'inactive',
          action: privacyAgreed ? (
            <button onClick={handleRevokePrivacy} className="text-xs px-4 py-2 rounded-full border border-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning)]/10 transition-all">
              撤销同意
            </button>
          ) : (
            <button onClick={() => setPrivacyAgreed(true)} className="text-xs px-4 py-2 rounded-full btn-amber">
              同意协议
            </button>
          ),
        },
        {
          label: 'Cookie 同意',
          desc: cookieConsent ? '已接受' : '已拒绝',
          status: cookieConsent ? 'active' : 'inactive',
          action: (
            <button
              onClick={() => { setCookieConsent(!cookieConsent); localStorage.setItem('cookie_consent', String(!cookieConsent)) }}
              className={`text-xs px-4 py-2 rounded-full transition-all ${cookieConsent ? 'border border-[var(--accent-primary)]/20 text-[var(--accent-primary)]' : 'btn-amber'}`}
            >
              {cookieConsent ? '撤销' : '接受'}
            </button>
          ),
        },
      ],
    },
    {
      title: '数据管理',
      icon: Lock,
      items: [
        {
          label: '导出个人数据',
          desc: '下载包含你的学习记录和设置的 JSON 文件',
          action: (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-full btn-amber disabled:opacity-40"
              >
                {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                <span>{exporting ? '导出中...' : '导出数据'}</span>
              </button>
              {exportDone && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-[var(--success)] text-xs flex items-center gap-1">
                  <CheckCircle size={14} /> 导出成功
                </motion.span>
              )}
            </div>
          ),
        },
        {
          label: '删除账户数据',
          desc: deleteConfirm ? '确定要删除所有数据吗？此操作不可撤销！' : '清除所有本地数据和设置',
          action: (
            <div className="flex items-center gap-2">
              {deleteConfirm ? (
                <>
                  <button
                    onClick={handleDeleteData}
                    disabled={deleting}
                    className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-full bg-[var(--warning)] text-white hover:bg-[var(--warning)] disabled:opacity-40"
                  >
                    {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    <span>{deleting ? '删除中...' : '确认删除'}</span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="text-xs px-4 py-2 rounded-full liquid-glass text-[var(--text-secondary)]"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDeleteData}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-full border border-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning)]/10 transition-all"
                >
                  <Trash2 size={14} />
                  <span>删除数据</span>
                </button>
              )}
              {deleteDone && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-[var(--warning)] text-xs flex items-center gap-1">
                  <AlertTriangle size={14} /> 即将跳转
                </motion.span>
              )}
            </div>
          ),
        },
      ],
    },
    {
      title: 'AI 数据与隐私',
      icon: Brain,
      items: [
        {
          label: 'AI 个性化推荐授权',
          desc: aiDataConsent
            ? '允许 AI 使用你的学习记录和偏好进行个性化推荐，保留 30 天'
            : '关闭后 AI 不会将数据用于个性化，对话记录仅保留 1 天',
          status: aiDataConsent ? 'active' : 'inactive',
          action: (
            <button
              onClick={handleAiConsentToggle}
              disabled={aiConsentLoading}
              className={`relative w-11 h-6 rounded-full transition-all disabled:opacity-50 ${aiDataConsent ? 'bg-[var(--accent-primary)]' : 'bg-black/[0.08]'}`}
            >
              {aiConsentLoading && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw size={12} className="animate-spin text-white/70" />
                </span>
              )}
              <motion.div
                animate={{ x: aiDataConsent ? 22 : 2 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              />
            </button>
          ),
        },
        {
          label: 'AI 对话历史',
          desc: historyCount === null
            ? '加载中...'
            : `当前存储 ${historyCount} 条对话记录`,
          action: (
            <button
              onClick={handleDeleteChatHistory}
              disabled={historyDeleting || !historyCount}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-full border border-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning)]/10 transition-all disabled:opacity-40"
            >
              {historyDeleting ? <RefreshCw size={14} className="animate-spin" /> : <History size={14} />}
              <span>{historyDeleting ? '删除中...' : '删除历史'}</span>
            </button>
          ),
        },
        {
          label: 'PII 自动脱敏',
          desc: 'AI 输入中的手机号、身份证、邮箱等敏感信息会被自动标记并脱敏',
          status: 'active',
          action: (
            <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--success)]/10 text-[var(--success)]">
              已启用
            </span>
          ),
        },
      ],
    },
    {
      title: '通知偏好',
      icon: Bell,
      items: [
        {
          label: '学习提醒',
          desc: '每日学习任务提醒',
          action: (
            <button
              onClick={() => setNotifPrefs(prev => ({ ...prev, studyReminder: !prev.studyReminder }))}
              className={`relative w-11 h-6 rounded-full transition-all ${notifPrefs.studyReminder ? 'bg-[var(--accent-primary)]' : 'bg-black/[0.08]'}`}
            >
              <motion.div
                animate={{ x: notifPrefs.studyReminder ? 22 : 2 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              />
            </button>
          ),
        },
        {
          label: '社区动态',
          desc: '帖子回复和互动通知',
          action: (
            <button
              onClick={() => setNotifPrefs(prev => ({ ...prev, communityActivity: !prev.communityActivity }))}
              className={`relative w-11 h-6 rounded-full transition-all ${notifPrefs.communityActivity ? 'bg-[var(--accent-primary)]' : 'bg-black/[0.08]'}`}
            >
              <motion.div
                animate={{ x: notifPrefs.communityActivity ? 22 : 2 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              />
            </button>
          ),
        },
        {
          label: '推广信息',
          desc: '课程更新和促销活动',
          action: (
            <button
              onClick={() => setNotifPrefs(prev => ({ ...prev, promotional: !prev.promotional }))}
              className={`relative w-11 h-6 rounded-full transition-all ${notifPrefs.promotional ? 'bg-[var(--accent-primary)]' : 'bg-black/[0.08]'}`}
            >
              <motion.div
                animate={{ x: notifPrefs.promotional ? 22 : 2 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              />
            </button>
          ),
        },
      ],
    },
  ]

  return (
    <motion.div
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div className="mb-10">
          <h1 className="font-serif text-5xl gradient-text">隐私与安全设置</h1>
          <p className="text-[var(--text-secondary)] mt-2">管理你的隐私偏好和数据安全<InfoTip content="保护你的个人数据是我们的首要任务" /></p>
          <div className="ornament mt-4" />
        </motion.div>

        <div className="space-y-8">
          {settingsSections.map((section, sectionIndex) => {
            const SectionIcon = section.icon
            return (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: sectionIndex * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
                className="liquid-glass rounded-[2rem] p-8"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center">
                    <SectionIcon size={20} className="text-[var(--accent-primary)]" />
                  </div>
                  <h2 className="font-serif text-xl text-[var(--text-primary)]">{section.title}</h2>
                </div>
                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-4 rounded-xl bg-white/40 backdrop-blur-sm border border-[var(--accent-primary)]/[0.04]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
                          {'status' in item && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                              item.status === 'active' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                            }`}>
                              {item.status === 'active' ? '已启用' : '未启用'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{item.desc}</p>
                      </div>
                      {item.action}
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
          className="mt-8 liquid-glass rounded-[2rem] p-8 border border-[var(--accent-primary)]/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-[var(--success)]" />
            </div>
            <h2 className="font-serif text-xl text-[var(--text-primary)]">安全状态</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/40 backdrop-blur-sm">
              <p className="text-2xl font-bold text-[var(--success)]">HTTPS</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">传输加密</p>
            </div>
            <div className="p-4 rounded-xl bg-white/40 backdrop-blur-sm">
              <p className="text-2xl font-bold text-[var(--success)]">AES-256</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">本地存储加密</p>
            </div>
            <div className="p-4 rounded-xl bg-white/40 backdrop-blur-sm">
              <p className="text-2xl font-bold text-[var(--success)]">bcrypt</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">密码哈希</p>
            </div>
            <div className="p-4 rounded-xl bg-white/40 backdrop-blur-sm">
              <p className={`text-2xl font-bold ${privacyAgreed ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
                {privacyAgreed ? '已同意' : '未同意'}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">隐私协议</p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

export default PrivacySettings
