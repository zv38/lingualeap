import { Link } from 'react-router-dom'
import { AlertTriangle, Lock, Ban, Info } from 'lucide-react'
import { useStore } from '../store/useStore'

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; title: string; message: string; color: string; appeal: boolean }> = {
  watch: {
    icon: <Info className="w-5 h-5" />,
    title: '账号观察中',
    message: '系统检测到部分异常行为，部分功能可能受限。如认为误判可提交复核。',
    color: 'var(--warning)',
    appeal: true,
  },
  restricted: {
    icon: <AlertTriangle className="w-5 h-5" />,
    title: '账号已受限',
    message: '当前无法使用发布、支付或修改安全设置等功能。如有异议请提交申诉。',
    color: 'var(--error)',
    appeal: true,
  },
  frozen: {
    icon: <Lock className="w-5 h-5" />,
    title: '账号已冻结',
    message: '账号处于冻结状态，请提交申诉等待管理员复核。',
    color: 'var(--error)',
    appeal: true,
  },
  banned: {
    icon: <Ban className="w-5 h-5" />,
    title: '账号已被封禁',
    message: '账号因严重违规被永久封禁，如有异议可提交终局复核。',
    color: 'var(--error)',
    appeal: true,
  },
}

export default function AccountStatusBanner() {
  const user = useStore(state => state.user)
  const status = user?.accountStatus as string

  if (!status || status === 'normal') return null

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.watch

  return (
    <div
      className="w-full px-4 py-3 border-b"
      style={{
        backgroundColor: `${config.color}15`,
        borderColor: `${config.color}30`,
        color: config.color,
      }}
    >
      <div className="max-w-6xl mx-auto flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{config.title}</div>
          <div className="text-xs opacity-90 mt-0.5">{config.message}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/security-policy"
            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors hover:opacity-80"
            style={{ borderColor: config.color, color: config.color }}
          >
            查看政策
          </Link>
          {config.appeal && (
            <Link
              to="/appeal"
              className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors hover:opacity-80"
              style={{ borderColor: config.color, color: config.color }}
            >
              去申诉
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
