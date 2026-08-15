import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Shield, CheckCircle, Clock, ChevronLeft, FileText,
  AlertTriangle, Lock, UserCheck, RefreshCw, ScrollText
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { authApi } from '../utils/api'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

interface PolicySection {
  heading: string
  content: string
}

interface Policy {
  version: string
  effectiveAt: string
  title: string
  sections: PolicySection[]
}

interface Acceptance {
  version: string
  acceptedAt: string
}

export default function SecurityPolicyPage() {
  const navigate = useNavigate()
  const { isAuthenticated, addToast } = useStore()

  const [policy, setPolicy] = useState<Policy | null>(null)
  const [acceptance, setAcceptance] = useState<Acceptance | null>(null)
  const [needsAccept, setNeedsAccept] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchPolicy() {
      setLoading(true)
      try {
        const result = await authApi.getCurrentPolicy()
        if (!cancelled && result.success && result.data) {
          setPolicy(result.data as Policy)
        }
        if (isAuthenticated) {
          const meResult = await authApi.me()
          if (!cancelled && meResult.success && meResult.data) {
            const policyInfo = meResult.data.policy as { current: Policy; needsAcceptance: boolean; acceptance?: Acceptance } | undefined
            if (policyInfo) {
              setNeedsAccept(policyInfo.needsAcceptance)
              setAcceptance(policyInfo.acceptance || null)
            }
          }
        }
      } catch {
        if (!cancelled) addToast('政策加载失败', 'error', 3000)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPolicy()
    return () => { cancelled = true }
  }, [isAuthenticated, addToast])

  async function handleAccept() {
    if (!isAuthenticated) {
      navigate('/auth', { state: { from: { pathname: '/security-policy' } } })
      return
    }
    setAccepting(true)
    try {
      const result = await authApi.acceptPolicy()
      if (result.success) {
        addToast('已接受最新安全政策', 'success', 3000)
        setNeedsAccept(false)
        if (policy) {
          setAcceptance({ version: policy.version, acceptedAt: new Date().toISOString() })
        }
      } else {
        addToast(result.message || '接受失败', 'error', 3000)
      }
    } catch {
      addToast('接受失败，请稍后重试', 'error', 3000)
    } finally {
      setAccepting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-3xl mx-auto">
        <motion.button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all mb-4"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <ChevronLeft className="w-4 h-4" />
          返回
        </motion.button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                {policy?.title || '安全与风控政策'}
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                版本 {policy?.version || '-'} · 生效于 {policy ? new Date(policy.effectiveAt).toLocaleString('zh-CN') : '-'}
              </p>
            </div>
          </div>

          {needsAccept && (
            <Card className="p-4 mb-6 border-l-4 border-[var(--warning)] bg-[var(--warning)]/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[var(--warning)] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-[var(--text-primary)] text-sm">政策已更新，请阅读并确认</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    我们的安全与风控政策已更新。继续使用服务前，请阅读最新政策并点击“我已阅读并同意”。
                  </div>
                </div>
                <Button
                  size="sm"
                  loading={accepting}
                  onClick={handleAccept}
                >
                  我已阅读并同意
                </Button>
              </div>
            </Card>
          )}

          {!needsAccept && isAuthenticated && acceptance && (
            <Card className="p-4 mb-6 border-l-4 border-[var(--success)] bg-[var(--success)]/5">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                <div>
                  <div className="font-semibold text-[var(--text-primary)] text-sm">您已接受当前版本政策</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    接受时间：{new Date(acceptance.acceptedAt).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {loading ? (
          <div className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</div>
        ) : policy ? (
          <div className="space-y-4">
            {policy.sections.map((section, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.35 }}
              >
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    {index === 0 && <Lock className="w-4 h-4 text-[var(--accent-primary)]" />}
                    {index === 1 && <UserCheck className="w-4 h-4 text-[var(--accent-primary)]" />}
                    {index === 2 && <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />}
                    {index === 3 && <RefreshCw className="w-4 h-4 text-[var(--accent-primary)]" />}
                    {index === 4 && <FileText className="w-4 h-4 text-[var(--accent-primary)]" />}
                    {index >= 5 && <ScrollText className="w-4 h-4 text-[var(--text-muted)]" />}
                    <h2 className="font-semibold text-[var(--text-primary)]">{section.heading}</h2>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                    {section.content}
                  </p>
                </Card>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: policy.sections.length * 0.06, duration: 0.35 }}
              className="pt-4"
            >
              {needsAccept ? (
                <Button
                  size="lg"
                  className="w-full"
                  loading={accepting}
                  onClick={handleAccept}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  我已阅读并同意上述政策
                </Button>
              ) : (
                <div className="text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4" />
                  政策如有更新，我们会通过登录提示或公告告知您
                </div>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="text-center py-20 text-[var(--text-muted)] text-sm">政策加载失败，请刷新重试</div>
        )}
      </div>
    </motion.div>
  )
}
