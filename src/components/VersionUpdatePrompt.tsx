import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X, Sparkles, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { setOnUpdate, startVersionCheck, stopVersionCheck } from '../utils/versionCheck'
import { useVersionPush } from '../hooks/useVersionPush'
import { gracefulReload } from '../utils/gracefulReload'
import { dismissUpdate, isDismissed } from '../utils/updateDismiss'

interface ChangelogItem {
  version: string
  date: string
  title: string
  details: string[]
}

interface VersionInfo {
  local: string
  remote: string
  forceUpdate: boolean
  changelog?: ChangelogItem[]
}

export default function VersionUpdatePrompt() {
  const [show, setShow] = useState(false)
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [expanded, setExpanded] = useState(false)

  // 查找当前版本对应的更新日志
  function getChangelogForVersion(version: string, changelog: ChangelogItem[]): ChangelogItem | null {
    return changelog?.find(c => c.version === version) || null
  }

  // 使用 SSE 实时推送（优先级高于轮询）
  useVersionPush((versionInfo: any) => {
    fetch('/version.json', { cache: 'no-store' })
      .then(r => r.json())
      .then(local => {
        const localVer = local.version || '1.0.0'
        const localBuildTime = local.buildTime || ''
        const remoteVer = versionInfo.version || ''
        const remoteBuildTime = versionInfo.buildTime || ''

        // 版本不同 → 新版本发布
        // 或 buildTime 不同 → 服务器重启（热更新推送）
        if (localVer !== remoteVer || localBuildTime !== remoteBuildTime) {
          // 用户此前选择「稍后」且在冷却期内，则不重复打扰
          if (!versionInfo.forceUpdate && isDismissed(remoteVer)) {
            return
          }
          setInfo({
            local: localVer,
            remote: remoteVer,
            forceUpdate: versionInfo.forceUpdate,
            changelog: versionInfo.changelog || local.changelog || [],
          })
          setShow(true)
        }
      })
      .catch(() => {
        const remoteVer = versionInfo.version || ''
        if (!versionInfo.forceUpdate && isDismissed(remoteVer)) {
          return
        }
        setInfo({
          local: '?',
          remote: versionInfo.version,
          forceUpdate: versionInfo.forceUpdate,
          changelog: versionInfo.changelog || [],
        })
        setShow(true)
      })
  })

  // 轮询兜底
  useEffect(() => {
    setOnUpdate((updateInfo: any) => {
      const v = String(updateInfo?.version || '')
      if (!updateInfo?.forceUpdate && v && isDismissed(v)) return
      setInfo(updateInfo)
      setShow(true)
    })
    startVersionCheck(10 * 60 * 1000)
    return () => stopVersionCheck()
  }, [])

  function handleRefresh() {
    gracefulReload({ reason: 'user-update' })
  }

  const currentChangelog = info?.changelog ? getChangelogForVersion(info.remote, info.changelog) : null

  return (
    <AnimatePresence>
      {show && info && (
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          className="fixed top-0 left-0 right-0 z-[10030] flex items-start justify-center p-4 pointer-events-none"
        >
          <div className={`pointer-events-auto w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden ${
            info.forceUpdate
              ? 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white border-white/10'
              : 'bg-white/95 backdrop-blur-md border-black/5 text-[var(--text-primary)]'
          }`}>
            <div className="p-5 flex items-start gap-4">
              <div className={`p-2.5 rounded-xl ${info.forceUpdate ? 'bg-white/20' : 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'}`}>
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-lg ${info.forceUpdate ? 'text-white' : ''}`}>
                  发现新版本 {info.remote}
                </h3>
                <p className={`text-sm mt-1 ${info.forceUpdate ? 'text-white/90' : 'text-[var(--text-muted)]'}`}>
                  当前版本 {info.local}，{info.forceUpdate ? '为了正常使用，请立即更新。' : '新版本已就绪，是否立即更新？'}
                </p>

                {/* 更新详情 — 可展开 */}
                {currentChangelog && currentChangelog.details.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                        info.forceUpdate ? 'text-white/80 hover:text-white' : 'text-[var(--accent-primary)] hover:text-[var(--accent-secondary)]'
                      }`}
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {expanded ? '收起更新详情' : '查看更新详情'}
                    </button>
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className={`mt-2 space-y-1.5 ${
                            info.forceUpdate ? 'text-white/85' : 'text-[var(--text-secondary)]'
                          }`}>
                            {currentChangelog.details.map((detail, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                                  info.forceUpdate ? 'text-white/70' : 'text-green-500'
                                }`} />
                                <span>{detail}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
            <div className={`px-5 pb-5 flex items-center justify-end gap-3`}>
              {!info.forceUpdate && (
                <button
                  onClick={() => {
                    if (info) dismissUpdate(info.remote)
                    setShow(false)
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    info.forceUpdate ? 'text-white hover:bg-white/10' : 'text-[var(--text-muted)] hover:bg-black/5'
                  }`}
                >
                  <X className="w-4 h-4" />
                  稍后
                </button>
              )}
              <button
                onClick={handleRefresh}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold shadow-md transition-transform hover:scale-105 ${
                  info.forceUpdate
                    ? 'bg-white text-[var(--accent-primary)]'
                    : 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                立即更新
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}