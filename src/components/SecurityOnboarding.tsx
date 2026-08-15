import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, X } from 'lucide-react'

// ===== 配色：暖灰 Morandi + 单一强调色 靛紫 =====
const C = {
  bg: 'var(--bg-primary, #f5f0eb)',
  card: 'var(--bg-card, #fcfaf8)',
  border: 'var(--border-primary, rgba(0,0,0,0.06))',
  text: 'var(--text-primary, #1a1a2e)',
  text2: 'var(--text-secondary, #6b6580)',
  muted: 'var(--text-muted, #9a95a8)',
  accent: '#6366f1',
  accentLight: 'rgba(99,102,241,0.10)',
  accentMid: 'rgba(99,102,241,0.18)',
  accentGlow: 'rgba(99,102,241,0.20)',
  success: '#34d399',
  successLight: 'rgba(52,211,153,0.12)',
  warning: '#f59e0b',
  warningLight: 'rgba(245,158,11,0.12)',
  danger: '#ef4444',
  dangerLight: 'rgba(239,68,68,0.12)',
}

// SVG 文字居中辅助：text 的 y 是基线位置，需要 rectY + rectHeight/2 + fontSize/3
const cty = (rectY: number, rectH: number, fs: number) => rectY + rectH / 2 + fs / 3

interface Step {
  id: string
  title: string
  headline: string
  description: string
  bullets: string[]
  badge: string
  tech: string[]
}

const steps: Step[] = [
  {
    id: 'welcome',
    title: '安全承诺',
    headline: '你的数据，由你掌控',
    description: '在 LinguaLeap，安全不是附加功能，而是产品底座。从第一次点击开始，你的学习数据、语音记录和账户信息都在多层防护之下。',
    bullets: ['全站强制 HTTPS', '最小化数据收集', '透明的隐私控制'],
    badge: '保护中',
    tech: ['TLS 1.3', 'HSTS'],
  },
  {
    id: 'encrypt',
    title: '传输加密',
    headline: '每一次传输都被加密隧道保护',
    description: '你的设备与服务器之间建立 TLS 加密通道。即使数据包被截获，也无法被解读。',
    bullets: ['TLS 1.2+ 强制握手', '证书校验', 'Secure / SameSite Cookie'],
    badge: '已加密',
    tech: ['AES-256', 'TLS'],
  },
  {
    id: 'auth',
    title: '身份认证',
    headline: '密码不会明文离开你的设备',
    description: '登录时，密码经加盐哈希后发送；后端验证成功后签发短期 JWT，不会把权限交给前端本地存储决定。',
    bullets: ['bcrypt/Argon2 哈希', '短期 JWT + 刷新令牌', '双因素认证支持'],
    badge: '已认证',
    tech: ['JWT', '2FA'],
  },
  {
    id: 'access',
    title: '权限控制',
    headline: '不是所有人都能访问敏感功能',
    description: '普通用户与管理员走不同的权限路径。管理员还必须通过 IP 白名单与角色后端复核，防止前端伪造权限。',
    bullets: ['后端角色强制校验', '管理员 IP 白名单', '敏感操作 MFA 复核'],
    badge: '已授权',
    tech: ['RBAC', 'IP ACL'],
  },
  {
    id: 'detect',
    title: '威胁感知',
    headline: '系统实时收集多维度安全信号',
    description: '每一次请求都会被分析：来源 IP、访问频率、请求内容、行为模式。异常信号会立刻进入 AI 安全分析师。',
    bullets: ['IP 信誉与代理检测', '请求频率与内容分析', '行为模式基线对比'],
    badge: '感知中',
    tech: ['WAF', 'SIEM'],
  },
  {
    id: 'isolate',
    title: '智能隔离',
    headline: '异常行为自动分级并隔离',
    description: 'AI 安全分析师根据风险评分自动分级：低危限速、中危挑战、高危隔离。所有关键决策等待人工复核。',
    bullets: ['风险评分自动分级', '动态隔离可疑会话', '人工复核闭环'],
    badge: '已隔离',
    tech: ['AI', 'SOAR'],
  },
  {
    id: 'privacy',
    title: '数据隐私',
    headline: '你的学习数据只属于你',
    description: '我们只收集学习所必需的数据，静态存储加密，支持随时查看、导出或删除账户数据。不会出售给第三方。',
    bullets: ['数据最小化原则', '加密存储', '一键导出与删除'],
    badge: '可控',
    tech: ['GDPR', 'AES'],
  },
  {
    id: 'audit',
    title: '持续审计',
    headline: '7×24 小时监测与自动响应',
    description: '审计日志记录关键操作，异常行为触发自动响应。安全策略会持续更新，以应对新的攻击手段。',
    bullets: ['完整审计日志', '异常自动告警', '策略持续更新'],
    badge: '监控中',
    tech: ['Audit', 'ML'],
  },
  {
    id: 'ready',
    title: '准备就绪',
    headline: '安全系统已全面启动',
    description: '所有防护层已就位。你可以在「安全中心」随时查看当前状态，开始你的语言学习之旅。',
    bullets: ['多层防护在线', '实时威胁监测', '持续安全升级'],
    badge: '已就绪',
    tech: ['OK'],
  },
]

const STORAGE_KEY = 'security-onboarding-shown'
const INTRO_KEY = 'lingualeap_intro_seen'

export function hasSeenSecurityOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return true
  }
}

export function markSecurityOnboardingShown(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {}
}

export function resetOnboardingState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(INTRO_KEY)
  } catch {}
}

const containerEase: [number, number, number, number] = [0.22, 1, 0.36, 1]

// ===== 音效系统 =====
class SoundEffects {
  private ctx: AudioContext | null = null
  private getContext() {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  playStep() {
    const ctx = this.getContext()
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.08)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.08)
      osc.stop(ctx.currentTime + i * 0.08 + 0.5)
    })
  }

  playComplete() {
    const ctx = this.getContext()
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.8)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.8)
    })
  }

  playClick() {
    const ctx = this.getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.05, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  }
}

// ===== 每个步骤的专属系统架构可视化 =====

/** 1. 欢迎页：安全洋葱模型 - 多层防护架构图 */
function WelcomeVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <radialGradient id="welcome-glow-core" cx="50%" cy="45%" r="45%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.12)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.04)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="welcome-core-pulse" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#6366f1" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <filter id="welcome-glow-filter">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="welcome-arc-outer" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.22)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.08)" />
        </linearGradient>
        <linearGradient id="welcome-arc-mid" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(99,102,241,0.12)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.28)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.12)" />
        </linearGradient>
        <linearGradient id="welcome-arc-inner" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(99,102,241,0.18)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.38)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.18)" />
        </linearGradient>
      </defs>
      <rect width="360" height="260" fill="url(#welcome-glow-core)" rx="20" />

      {/* 网格背景装饰 */}
      <g opacity="0.03">
        {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[40, 80, 120, 160, 200, 240].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 多层半圆拱形 - 从外到内 */}
      {[
        { r: 110, label: '网络层 · WAF · DDoS', delay: 0, gradient: 'url(#welcome-arc-outer)', sw: 20 },
        { r: 85, label: '认证层 · JWT · 2FA', delay: 0.15, gradient: 'url(#welcome-arc-mid)', sw: 16 },
        { r: 60, label: '权限层 · RBAC · ACL', delay: 0.3, gradient: 'url(#welcome-arc-inner)', sw: 12 },
        { r: 35, label: '数据层 · 加密 · 审计', delay: 0.45, gradient: 'url(#welcome-arc-inner)', sw: 8 },
      ].map((layer, i) => (
        <motion.g key={i}>
          {/* 拱形发光阴影 */}
          <motion.path
            d={`M ${180 - layer.r - 2} 132 A ${layer.r + 2} ${layer.r + 2} 0 0 1 ${180 + layer.r + 2} 132`}
            fill="none"
            stroke="rgba(99,102,241,0.06)"
            strokeWidth={layer.sw + 4}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: layer.delay, ease: containerEase }}
          />
          {/* 拱形主体 */}
          <motion.path
            d={`M ${180 - layer.r} 130 A ${layer.r} ${layer.r} 0 0 1 ${180 + layer.r} 130`}
            fill="none"
            stroke={layer.gradient}
            strokeWidth={layer.sw}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: layer.delay, ease: containerEase }}
          />
          {/* 标签 - 精确居中于拱形内侧 */}
          <motion.text
            x={180}
            y={130 + (i === 0 ? 26 : i === 1 ? 22 : i === 2 ? 18 : 14)}
            textAnchor="middle"
            fill="rgba(99,102,241,0.65)"
            fontSize="7"
            fontWeight="600"
            letterSpacing="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 + layer.delay, duration: 0.5 }}
          >
            {layer.label}
          </motion.text>
        </motion.g>
      ))}

      {/* 中心 - 数据核心 */}
      <motion.g
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6, ease: containerEase }}
      >
        <circle cx="180" cy="130" r="24" fill="url(#welcome-core-pulse)" />
        <circle cx="180" cy="130" r="18" fill="rgba(99,102,241,0.12)" stroke="#6366f1" strokeWidth="1.5" filter="url(#welcome-glow-filter)" />
        <circle cx="180" cy="130" r="10" fill="#6366f1" opacity="0.3" />
        <text x="180" y={cty(124, 12, 9)} textAnchor="middle" fill="#6366f1" fontSize="9" fontWeight="700" letterSpacing="1">
          数据
        </text>
      </motion.g>

      {/* 底部标签 */}
      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        多层防护纵深防御
      </motion.text>
    </svg>
  )
}

/** 2. 传输加密：TLS 握手 + 加密通道 */
function EncryptVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <linearGradient id="encrypt-tunnel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(99,102,241,0.02)" />
          <stop offset="30%" stopColor="rgba(99,102,241,0.18)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.22)" />
          <stop offset="70%" stopColor="rgba(99,102,241,0.18)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.02)" />
        </linearGradient>
        <linearGradient id="encrypt-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <linearGradient id="encrypt-tunnel-glow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="40%" stopColor="rgba(99,102,241,0)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.12)" />
          <stop offset="60%" stopColor="rgba(99,102,241,0)" />
        </linearGradient>
        <filter id="encrypt-glow-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#encrypt-bg)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 两端设备 */}
      <motion.g
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: containerEase }}
      >
        <rect x="25" y="80" width="50" height="60" rx="10" fill="rgba(99,102,241,0.1)" stroke="#6366f1" strokeWidth="1.2" />
        <rect x="32" y="88" width="36" height="4" rx="2" fill="#6366f1" opacity="0.3" />
        <rect x="32" y="98" width="36" height="4" rx="2" fill="#6366f1" opacity="0.3" />
        <rect x="32" y="108" width="24" height="4" rx="2" fill="#6366f1" opacity="0.3" />
        <text x="50" y={cty(146, 0, 8)} textAnchor="middle" fill={C.text2} fontSize="8" fontWeight="600">你的设备</text>
      </motion.g>

      <motion.g
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: containerEase }}
      >
        <rect x="285" y="80" width="50" height="60" rx="10" fill="rgba(52,211,153,0.1)" stroke="#34d399" strokeWidth="1.2" />
        <rect x="292" y="88" width="36" height="4" rx="2" fill="#34d399" opacity="0.3" />
        <rect x="292" y="98" width="36" height="4" rx="2" fill="#34d399" opacity="0.3" />
        <rect x="292" y="108" width="24" height="4" rx="2" fill="#34d399" opacity="0.3" />
        <text x="310" y={cty(146, 0, 8)} textAnchor="middle" fill={C.text2} fontSize="8" fontWeight="600">服务器</text>
      </motion.g>

      {/* 加密通道发光层 */}
      <motion.rect
        x="80" y="83" width="200" height="54" rx="27"
        fill="url(#encrypt-tunnel-glow)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {/* 加密通道 */}
      <motion.rect
        x="80" y="85" width="200" height="50" rx="25"
        fill="url(#encrypt-tunnel)"
        stroke="#6366f1"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        initial={{ opacity: 0, scaleX: 0.8 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.8, ease: containerEase }}
      />

      {/* 加密通道内的数据包 */}
      {[
        { x: 110, label: 'SYN', color: '#6366f1', delay: 0 },
        { x: 160, label: 'TLS 1.3', color: '#6366f1', delay: 0.2 },
        { x: 210, label: '数据', color: '#34d399', delay: 0.4 },
      ].map((pkt, i) => (
        <motion.g key={i}>
          <motion.rect
            x={pkt.x} y={100} width={48} height={20} rx="6"
            fill={pkt.color}
            opacity="0.85"
            initial={{ x: pkt.x - 30, opacity: 0 }}
            animate={{ x: pkt.x, opacity: 0.85 }}
            transition={{ delay: 0.3 + pkt.delay, duration: 0.6, ease: containerEase }}
          />
          <motion.text
            x={pkt.x + 24} y={cty(100, 20, 7)}
            textAnchor="middle"
            fill="white"
            fontSize="7"
            fontWeight="700"
            letterSpacing="1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 + pkt.delay, duration: 0.4 }}
          >
            {pkt.label}
          </motion.text>
          {/* 数据包底部的加密锁标识 */}
          {i === 2 && (
            <motion.g
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
            >
              <rect x={pkt.x + 14} y={124} width="20" height="14" rx="3" fill="transparent" stroke="#34d399" strokeWidth="1" />
              <path d={`M${pkt.x + 19} 128 V126 A3 3 0 0 1 ${pkt.x + 29} 126 V128`} fill="none" stroke="#34d399" strokeWidth="1" />
              <circle cx={pkt.x + 24} cy="130" r="2" fill="#34d399" />
            </motion.g>
          )}
        </motion.g>
      ))}

      {/* 底部标签 */}
      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        TLS 1.3 · AES-256-GCM · 端到端加密
      </motion.text>
    </svg>
  )
}

/** 3. 身份认证：登录流程可视化 */
function AuthVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <linearGradient id="auth-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <linearGradient id="auth-hash-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.14)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.08)" />
        </linearGradient>
        <linearGradient id="auth-jwt-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(52,211,153,0.08)" />
          <stop offset="50%" stopColor="rgba(52,211,153,0.16)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.08)" />
        </linearGradient>
        <filter id="auth-glow-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#auth-bg)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 从左到右的认证流程 */}
      {/* 左侧：用户输入 */}
      <motion.g
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: containerEase }}
      >
        <rect x="25" y="75" width="55" height="70" rx="10" fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="1" />
        <rect x="33" y="83" width="39" height="8" rx="4" fill="#6366f1" opacity="0.2" />
        <text x="52" y={cty(83, 8, 6)} textAnchor="middle" fill="#6366f1" fontSize="6" fontWeight="600">密码</text>
        <circle cx="52" cy="118" r="8" fill="#6366f1" opacity="0.15" />
        <text x="52" y={cty(112, 12, 7)} textAnchor="middle" fill="#6366f1" fontSize="7" fontWeight="700">👤</text>
        <text x="52" y={cty(151, 0, 8)} textAnchor="middle" fill={C.text2} fontSize="8" fontWeight="600">用户输入</text>
      </motion.g>

      {/* 箭头 1 */}
      <motion.path
        d="M80 110 L95 110"
        stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.5"
        markerEnd="url(#arrow-accent)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      />

      {/* 中间：哈希处理 */}
      <motion.g
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5, ease: containerEase }}
      >
        <rect x="98" y="70" width="65" height="80" rx="12" fill="url(#auth-hash-grad)" stroke="#6366f1" strokeWidth="1.2" />
        <text x="130" y="92" textAnchor="middle" fill="#6366f1" fontSize="6" fontWeight="700" letterSpacing="1">bcrypt</text>
        <text x="130" y="104" textAnchor="middle" fill="#6366f1" fontSize="6" fontWeight="700" letterSpacing="1">Argon2</text>
        {/* 哈希输出 */}
        <rect x="107" y="112" width="47" height="16" rx="4" fill="#6366f1" opacity="0.15" />
        <text x="130" y={cty(112, 16, 6)} textAnchor="middle" fill="#6366f1" fontSize="6" fontWeight="700" letterSpacing="0.5" fontFamily="monospace">$2a$10$...</text>
        <text x="130" y={cty(156, 0, 8)} textAnchor="middle" fill={C.text2} fontSize="8" fontWeight="600">加盐哈希</text>
      </motion.g>

      {/* 箭头 2 */}
      <motion.path
        d="M163 110 L178 110"
        stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      />

      {/* 右侧：JWT 签发 */}
      <motion.g
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.5, ease: containerEase }}
      >
        <rect x="180" y="70" width="70" height="80" rx="12" fill="url(#auth-jwt-grad)" stroke="#34d399" strokeWidth="1.2" />
        {/* JWT 令牌图示 */}
        <rect x="190" y="82" width="50" height="22" rx="6" fill="rgba(52,211,153,0.2)" stroke="#34d399" strokeWidth="0.8" />
        <text x="215" y={cty(82, 22, 6)} textAnchor="middle" fill="#34d399" fontSize="6" fontWeight="700" letterSpacing="0.5">JWT</text>
        <rect x="190" y="110" width="50" height="22" rx="6" fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="0.8" />
        <text x="215" y={cty(110, 22, 6)} textAnchor="middle" fill="#6366f1" fontSize="6" fontWeight="700" letterSpacing="0.5">Refresh</text>
        <text x="215" y={cty(156, 0, 8)} textAnchor="middle" fill={C.text2} fontSize="8" fontWeight="600">令牌签发</text>
      </motion.g>

      {/* 底部状态指示 */}
      <motion.g
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        <rect x="120" y="185" width="120" height="24" rx="12" fill="rgba(52,211,153,0.1)" stroke="#34d399" strokeWidth="0.8" filter="url(#auth-glow-filter)" />
        <text x="180" y={cty(185, 24, 9)} textAnchor="middle" fill="#34d399" fontSize="9" fontWeight="700" letterSpacing="1">✓ 认证通过</text>
      </motion.g>

      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        bcrypt(密码) → JWT · 短期令牌
      </motion.text>
    </svg>
  )
}

/** 4. 权限控制：RBAC 权限网关 */
function AccessVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <linearGradient id="access-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <linearGradient id="access-gate-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.04)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.1)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.04)" />
        </linearGradient>
        <filter id="access-glow-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#access-bg)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 左侧：请求进入 */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <rect x="20" y="90" width="50" height="50" rx="8" fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="1" />
        <text x="45" y={cty(90, 50, 8)} textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="700">请求</text>
        <text x="45" y={cty(90, 50, 7)} textAnchor="middle" fill={C.text2} fontSize="7">进入</text>
      </motion.g>

      {/* 箭头 */}
      <motion.path
        d="M70 115 L90 115"
        stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.4"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      />

      {/* 权限网关 */}
      <motion.g
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: containerEase }}
      >
        <rect x="90" y="60" width="100" height="110" rx="16" fill="url(#access-gate-grad)" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="140" y="82" textAnchor="middle" fill="#6366f1" fontSize="10" fontWeight="800" letterSpacing="2">RBAC</text>
        <text x="140" y="96" textAnchor="middle" fill="#6366f1" fontSize="7" fontWeight="600" letterSpacing="1">权限网关</text>

        {/* 规则列表 */}
        {[
          { label: '角色校验', y: 108, color: '#6366f1' },
          { label: 'IP 白名单', y: 122, color: '#6366f1' },
          { label: 'MFA 复核', y: 136, color: '#f59e0b' },
          { label: '操作审计', y: 150, color: '#34d399' },
        ].map((rule, i) => (
          <motion.g
            key={i}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
          >
            <rect x={100} y={rule.y} width={80} height={12} rx="4" fill={rule.color} opacity="0.12" />
            <text x={140} y={cty(rule.y, 12, 7)} textAnchor="middle" fill={rule.color} fontSize="7" fontWeight="600">{rule.label}</text>
          </motion.g>
        ))}
      </motion.g>

      {/* 分流：两条路径 */}
      <motion.path
        d="M190 95 L210 95 L230 80 L260 80"
        stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.6"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      />
      <motion.path
        d="M190 135 L210 135 L230 150 L260 150"
        stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.6"
        fill="none"
        strokeDasharray="4 3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      />

      {/* 右侧：结果 */}
      <motion.g
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.5, ease: containerEase }}
      >
        {/* 通过 */}
        <rect x="260" y="65" width="55" height="45" rx="10" fill="rgba(52,211,153,0.1)" stroke="#34d399" strokeWidth="1" filter="url(#access-glow-filter)" />
        <text x="287" y={cty(65, 45, 8)} textAnchor="middle" fill="#34d399" fontSize="8" fontWeight="700">✓ 允许</text>
        <text x="287" y={cty(65, 45, 7)} textAnchor="middle" fill={C.text2} fontSize="7">管理员</text>
        {/* 拒绝 */}
        <rect x="260" y="135" width="55" height="45" rx="10" fill="rgba(239,68,68,0.08)" stroke="#ef4444" strokeWidth="1" />
        <text x="287" y={cty(135, 45, 8)} textAnchor="middle" fill="#ef4444" fontSize="8" fontWeight="700">✕ 拒绝</text>
        <text x="287" y={cty(135, 45, 7)} textAnchor="middle" fill={C.text2} fontSize="7">未授权</text>
      </motion.g>

      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        角色校验 · 白名单 · MFA · 审计
      </motion.text>
    </svg>
  )
}

/** 5. 威胁感知：安全仪表盘风格 */
function DetectVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <linearGradient id="detect-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(245,158,11,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <linearGradient id="detect-bar-ip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.4)" />
        </linearGradient>
        <linearGradient id="detect-bar-freq" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.4)" />
        </linearGradient>
        <linearGradient id="detect-bar-behavior" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="rgba(245,158,11,0.4)" />
        </linearGradient>
        <linearGradient id="detect-bar-content" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.4)" />
        </linearGradient>
        <linearGradient id="detect-ai-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.04)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.1)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.04)" />
        </linearGradient>
        <filter id="detect-glow-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#detect-bg)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 左半：信号监控面板 */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* 信号分类 */}
        {[
          { label: 'IP 信誉', value: 92, color: '#34d399', grad: 'url(#detect-bar-ip)', y: 55 },
          { label: '请求频率', value: 78, color: '#6366f1', grad: 'url(#detect-bar-freq)', y: 85 },
          { label: '行为模式', value: 45, color: '#f59e0b', grad: 'url(#detect-bar-behavior)', y: 115 },
          { label: '内容分析', value: 88, color: '#34d399', grad: 'url(#detect-bar-content)', y: 145 },
        ].map((sig, i) => (
          <motion.g
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
          >
            <text x="35" y={sig.y + 4} fill={C.text2} fontSize="7" fontWeight="600">{sig.label}</text>
            {/* 进度条背景 */}
            <rect x="95" y={sig.y - 4} width="100" height="10" rx="5" fill="rgba(0,0,0,0.04)" />
            {/* 进度条填充 - 使用渐变 */}
            <motion.rect
              x="95" y={sig.y - 4} width={sig.value} height="10" rx="5"
              fill={sig.grad}
              initial={{ width: 0 }}
              animate={{ width: sig.value }}
              transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: containerEase }}
            />
            {/* 进度条发光 */}

            <text x="200" y={sig.y + 4} fill={sig.color} fontSize="7" fontWeight="700">{sig.value}%</text>
          </motion.g>
        ))}
      </motion.g>

      {/* 右半：AI 分析引擎 */}
      <motion.g
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.5, ease: containerEase }}
      >
        <rect x="220" y="55" width="115" height="110" rx="14" fill="url(#detect-ai-box)" stroke="#6366f1" strokeWidth="1" strokeDasharray="3 3" />
        <text x="277" y="75" textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="700" letterSpacing="1">AI 安全分析师</text>
        {/* 处理节点 */}
        {[
          { label: '评分', color: '#6366f1', y: 88 },
          { label: '分类', color: '#f59e0b', y: 105 },
          { label: '决策', color: '#34d399', y: 122 },
        ].map((node, i) => (
          <motion.g
            key={i}
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
          >
            <rect x={235} y={node.y} width={85} height={14} rx="7" fill={node.color} opacity="0.12" />
            <text x={277} y={cty(node.y, 14, 7)} textAnchor="middle" fill={node.color} fontSize="7" fontWeight="700">{node.label}</text>
          </motion.g>
        ))}
      </motion.g>

      {/* 底部：实时数据流 */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <rect x="30" y="175" width="300" height="24" rx="12" fill="rgba(99,102,241,0.05)" stroke="#6366f1" strokeWidth="0.8" />
        <text x="180" y={cty(175, 24, 8)} textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="600" letterSpacing="1">
          ● 实时分析中 · 已处理 1,284 次请求
        </text>
      </motion.g>

      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        WAF · AI 分析 · 实时评分
      </motion.text>
    </svg>
  )
}

/** 6. 智能隔离：风险分级隔离 */
function IsolateVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <linearGradient id="isolate-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(239,68,68,0.06)" />
          <stop offset="50%" stopColor="rgba(245,158,11,0.04)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.06)" />
        </linearGradient>
        <linearGradient id="isolate-low" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(245,158,11,0.12)" />
          <stop offset="100%" stopColor="rgba(245,158,11,0.06)" />
        </linearGradient>
        <linearGradient id="isolate-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(239,68,68,0.12)" />
          <stop offset="100%" stopColor="rgba(239,68,68,0.06)" />
        </linearGradient>
        <linearGradient id="isolate-high" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.12)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.06)" />
        </linearGradient>
        <filter id="isolate-glow-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#isolate-bg)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 三列分级隔离 */}
      {[
        {
          x: 20, w: 95, label: '低危', desc: '限速+挑战',
          color: '#f59e0b', bg: 'url(#isolate-low)',
          stroke: 'rgba(245,158,11,0.3)',
          delay: 0,
          items: ['限速 5 req/min', 'PoW 挑战', '行为记录'],
        },
        {
          x: 132, w: 95, label: '中危', desc: '隔离+复核',
          color: '#ef4444', bg: 'url(#isolate-mid)',
          stroke: 'rgba(239,68,68,0.3)',
          delay: 0.15,
          items: ['会话隔离', '人工复核', '风险标记'],
        },
        {
          x: 244, w: 95, label: '高危', desc: '封禁+取证',
          color: '#6366f1', bg: 'url(#isolate-high)',
          stroke: 'rgba(99,102,241,0.3)',
          delay: 0.3,
          items: ['账户冻结', 'IP 封禁', '取证留存'],
        },
      ].map((zone, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: zone.delay, duration: 0.5, ease: containerEase }}
        >
          <rect x={zone.x} y="55" width={zone.w} height="120" rx="12" fill={zone.bg} stroke={zone.stroke} strokeWidth="1" />
          {/* 级别标签 */}
          <rect x={zone.x + 12} y="65" width={zone.w - 24} height="22" rx="8" fill={zone.color} opacity="0.15" />
          <text x={zone.x + zone.w / 2} y={cty(65, 22, 9)} textAnchor="middle" fill={zone.color} fontSize="9" fontWeight="800" letterSpacing="1">{zone.label}</text>
          <text x={zone.x + zone.w / 2} y="93" textAnchor="middle" fill={C.text2} fontSize="7">{zone.desc}</text>
          {/* 措施列表 */}
          {zone.items.map((item, j) => (
            <motion.g
              key={j}
              initial={{ opacity: 0, x: -3 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + zone.delay + j * 0.08, duration: 0.3 }}
            >
              <circle cx={zone.x + 18} cy={108 + j * 18} r="3" fill={zone.color} opacity="0.5" />
              <text x={zone.x + 26} y={112 + j * 18} fill={C.text2} fontSize="7" fontWeight="500">{item}</text>
            </motion.g>
          ))}
        </motion.g>
      ))}

      {/* 顶部标题：AI 分级箭头 */}
      <motion.text
        x="180" y="40"
        textAnchor="middle"
        fill="#6366f1"
        fontSize="8"
        fontWeight="700"
        letterSpacing="1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        ↓ AI 风险评分自动分级 ↓
      </motion.text>

      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        自动分级 · 动态隔离 · 人工复核闭环
      </motion.text>
    </svg>
  )
}

/** 7. 数据隐私：加密保险库 */
function PrivacyVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <radialGradient id="vault-glow" cx="50%" cy="40%" r="45%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.1)" />
          <stop offset="60%" stopColor="rgba(99,102,241,0.04)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="vault-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.2)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0)" />
        </radialGradient>
        <linearGradient id="vault-outer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.06)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.02)" />
        </linearGradient>
        <linearGradient id="vault-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.1)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.04)" />
        </linearGradient>
        <filter id="vault-glow-filter">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#vault-glow)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 保险库主体 */}
      <motion.g
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: containerEase }}
      >
        {/* 外层 */}
        <rect x="70" y="50" width="220" height="140" rx="20" fill="url(#vault-outer)" stroke="#6366f1" strokeWidth="1.5" />
        {/* 内层 */}
        <rect x="90" y="65" width="180" height="110" rx="14" fill="url(#vault-inner)" stroke="#6366f1" strokeWidth="0.8" strokeDasharray="4 3" />
        {/* 锁芯发光 */}
        <circle cx="180" cy="120" r="28" fill="url(#vault-core-glow)" />
        <circle cx="180" cy="120" r="22" fill="rgba(99,102,241,0.12)" stroke="#6366f1" strokeWidth="1.5" filter="url(#vault-glow-filter)" />
        <circle cx="180" cy="120" r="10" fill="rgba(99,102,241,0.15)" />
        <circle cx="180" cy="120" r="4" fill="#6366f1" />
        <rect x="178" y="120" width="4" height="8" rx="2" fill="#6366f1" />
      </motion.g>

      {/* 数据条目 */}
      {[
        { label: '学习记录', x: 105, y: 80, delay: 0.2 },
        { label: '语音数据', x: 105, y: 100, delay: 0.3 },
        { label: '个人信息', x: 105, y: 120, delay: 0.4 },
        { label: '账户安全', x: 105, y: 140, delay: 0.5 },
      ].map((item, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: item.delay, duration: 0.4 }}
        >
          <rect x={item.x} y={item.y} width="65" height="14" rx="4" fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="0.5" />
          <text x={item.x + 5} y={cty(item.y, 14, 7)} fill={C.text2} fontSize="7" fontWeight="500">{item.label}</text>
          {/* 小锁图标 */}
          <rect x={item.x + 58} y={item.y + 3} width="6" height="8" rx="1.5" fill="transparent" stroke="#34d399" strokeWidth="0.8" />
        </motion.g>
      ))}

      {/* 右侧操作按钮 */}
      <motion.g
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <rect x="230" y="78" width="50" height="18" rx="6" fill="rgba(52,211,153,0.1)" stroke="#34d399" strokeWidth="0.8" />
        <text x="255" y={cty(78, 18, 7)} textAnchor="middle" fill="#34d399" fontSize="7" fontWeight="700">导出</text>
        <rect x="230" y="102" width="50" height="18" rx="6" fill="rgba(239,68,68,0.08)" stroke="#ef4444" strokeWidth="0.8" />
        <text x="255" y={cty(102, 18, 7)} textAnchor="middle" fill="#ef4444" fontSize="7" fontWeight="700">删除</text>
        <rect x="230" y="126" width="50" height="18" rx="6" fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="0.8" />
        <text x="255" y={cty(126, 18, 7)} textAnchor="middle" fill="#6366f1" fontSize="7" fontWeight="700">查看</text>
      </motion.g>

      {/* 底部加密标识 */}
      <motion.rect
        x="130" y="175" width="100" height="18" rx="9"
        fill="rgba(52,211,153,0.08)"
        stroke="#34d399" strokeWidth="0.8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.4 }}
      />
      <motion.text
        x="180" y={cty(175, 18, 7)} textAnchor="middle" fill="#34d399" fontSize="7" fontWeight="700" letterSpacing="1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.4 }}
      >
        AES-256 加密存储
      </motion.text>

      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        最小化收集 · 加密存储 · 用户可控
      </motion.text>
    </svg>
  )
}

/** 8. 持续审计：审计日志流 */
function AuditVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <linearGradient id="audit-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <linearGradient id="audit-timeline" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(99,102,241,0.05)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.25)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.05)" />
        </linearGradient>
        <filter id="audit-glow-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#audit-bg)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#6366f1" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#6366f1" strokeWidth="0.5" />
        ))}
      </g>

      {/* 时间线轴 */}
      <motion.line
        x1="30" y1="80" x2="330" y2="80"
        stroke="url(#audit-timeline)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: containerEase }}
      />

      {/* 时间线节点 */}
      {[
        { x: 55, label: '登录', time: '09:12:05', color: '#34d399' },
        { x: 125, label: '查看课程', time: '09:15:22', color: '#6366f1' },
        { x: 195, label: '修改资料', time: '09:18:47', color: '#f59e0b' },
        { x: 265, label: '异常登录', time: '09:21:33', color: '#ef4444' },
      ].map((evt, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + i * 0.12, duration: 0.4, ease: containerEase }}
        >
          {/* 节点发光环 */}
          <circle cx={evt.x} cy="80" r="10" fill={evt.color} opacity="0.08" />
          {/* 节点圆 */}
          <circle cx={evt.x} cy="80" r="5" fill={evt.color} filter="url(#audit-glow-filter)" />
          <circle cx={evt.x} cy="80" r="8" fill={evt.color} opacity="0.2" />
          {/* 标签（上方） */}
          <text x={evt.x} y="62" textAnchor="middle" fill={evt.color} fontSize="8" fontWeight="700">{evt.label}</text>
          {/* 时间（下方） */}
          <text x={evt.x} y="98" textAnchor="middle" fill={C.muted} fontSize="6" fontWeight="500" fontFamily="monospace">{evt.time}</text>
          {/* 日志条目 */}
          <motion.rect
            x={evt.x - 22} y="108" width="44" height="16" rx="4"
            fill={evt.color} opacity="0.08"
            initial={{ width: 0 }}
            animate={{ width: 44 }}
            transition={{ delay: 0.4 + i * 0.12, duration: 0.3 }}
          />
          <text
            x={evt.x} y={cty(108, 16, 6)}
            textAnchor="middle" fill={evt.color} fontSize="6" fontWeight="600" fontFamily="monospace"
          >
            {evt.time}
          </text>
        </motion.g>
      ))}

      {/* 底部实时审计流 */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <rect x="50" y="145" width="260" height="42" rx="12" fill="rgba(99,102,241,0.04)" stroke="#6366f1" strokeWidth="0.8" strokeDasharray="3 3" />
        {/* 模拟日志行 */}
        {[
          { text: '[INFO]  用户登录成功  IP: 192.168.1.x', delay: 0 },
          { text: '[INFO]  课程加载完成  ID: lesson-284', delay: 0.1 },
          { text: '[WARN]  多次登录失败  IP: 10.0.0.x', delay: 0.2 },
        ].map((log, i) => (
          <motion.text
            key={i}
            x={60} y={157 + i * 11}
            fill={i === 2 ? '#f59e0b' : C.text2}
            fontSize="6"
            fontWeight="500"
            fontFamily="monospace"
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: [0, 1, 1], x: 0 }}
            transition={{ delay: 0.9 + log.delay, duration: 0.4, repeat: Infinity, repeatDelay: 3 }}
          >
            {log.text}
          </motion.text>
        ))}
      </motion.g>

      <motion.text
        x="180" y="228"
        textAnchor="middle"
        fill={C.text2}
        fontSize="12"
        fontWeight="600"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        完整日志 · 异常告警 · 策略持续更新
      </motion.text>
    </svg>
  )
}

/** 9. 准备就绪：系统状态面板 */
function ReadyVisual() {
  return (
    <svg viewBox="0 0 360 260" className="w-full h-full">
      <defs>
        <radialGradient id="ready-glow" cx="50%" cy="35%" r="45%">
          <stop offset="0%" stopColor="rgba(52,211,153,0.1)" />
          <stop offset="60%" stopColor="rgba(52,211,153,0.04)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="ready-check-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(52,211,153,0.2)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
        </radialGradient>
        <filter id="ready-glow-filter">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="360" height="260" fill="url(#ready-glow)" rx="20" />

      {/* 网格背景 */}
      <g opacity="0.025">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="240" stroke="#34d399" strokeWidth="0.5" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="340" y2={y} stroke="#34d399" strokeWidth="0.5" />
        ))}
      </g>

      {/* 中央大勾 */}
      <motion.g
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: containerEase }}
      >
        <circle cx="180" cy="85" r="42" fill="url(#ready-check-glow)" />
        <circle cx="180" cy="85" r="36" fill="rgba(52,211,153,0.1)" stroke="#34d399" strokeWidth="2" filter="url(#ready-glow-filter)" />
        <motion.path
          d="M164 85 L176 97 L196 73"
          fill="none" stroke="#34d399" strokeWidth="3.5"
          strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: containerEase }}
        />
      </motion.g>

      {/* 状态列表 */}
      {[
        { label: '加密传输', status: '在线', color: '#34d399', y: 135, delay: 0 },
        { label: '身份认证', status: '在线', color: '#34d399', y: 155, delay: 0.1 },
        { label: '权限控制', status: '在线', color: '#34d399', y: 175, delay: 0.2 },
        { label: '威胁检测', status: '在线', color: '#34d399', y: 195, delay: 0.3 },
        { label: '审计日志', status: '在线', color: '#34d399', y: 215, delay: 0.4 },
      ].map((svc, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 + svc.delay, duration: 0.4, ease: containerEase }}
        >
          <text x="130" y={cty(svc.y - 4, 8, 8)} textAnchor="end" fill={C.text2} fontSize="8" fontWeight="600">{svc.label}</text>
          <circle cx="140" cy={svc.y} r="4" fill={svc.color} filter="url(#ready-glow-filter)" />
          <text x="150" y={cty(svc.y - 4, 8, 8)} fill={svc.color} fontSize="8" fontWeight="700">{svc.status}</text>
        </motion.g>
      ))}

      <motion.text
        x="180" y="240"
        textAnchor="middle"
        fill="#34d399"
        fontSize="12"
        fontWeight="700"
        letterSpacing="3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        所有防护层在线
      </motion.text>
    </svg>
  )
}

const visualMap: Record<string, React.FC> = {
  welcome: WelcomeVisual,
  encrypt: EncryptVisual,
  auth: AuthVisual,
  access: AccessVisual,
  detect: DetectVisual,
  isolate: IsolateVisual,
  privacy: PrivacyVisual,
  audit: AuditVisual,
  ready: ReadyVisual,
}

function SecurityVisual({ stepId }: { stepId: string }) {
  const VisualComponent = visualMap[stepId]
  if (!VisualComponent) return null

  return (
    <div
      className="mx-auto mb-6 w-full max-w-[380px] overflow-hidden rounded-[24px] border"
      style={{
        backgroundColor: 'var(--bg-secondary, #f8f6f3)',
        borderColor: 'var(--border-primary, rgba(0,0,0,0.06))',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={stepId}
          className="aspect-[4/3] w-full"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.4, ease: containerEase }}
        >
          <VisualComponent />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default function SecurityOnboarding({ onFinished }: { onFinished: () => void }) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [sound] = useState(() => new SoundEffects())

  useEffect(() => {
    setMounted(true)
  }, [])

  const goNext = useCallback(() => {
    if (step < steps.length - 1) {
      sound.playStep()
      setDirection(1)
      setStep((s) => s + 1)
    } else {
      sound.playComplete()
      markSecurityOnboardingShown()
      onFinished()
    }
  }, [step, onFinished, sound])

  const goBack = useCallback(() => {
    if (step > 0) {
      sound.playClick()
      setDirection(-1)
      setStep((s) => s - 1)
    }
  }, [step, sound])

  const skip = useCallback(() => {
    markSecurityOnboardingShown()
    onFinished()
  }, [onFinished])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goBack()
      if (e.key === 'Escape') skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goBack, skip])

  const current = steps[step]
  const isLast = step === steps.length - 1

  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 32 : -32, scale: 0.98 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -32 : 32, scale: 0.98 }),
  }

  if (!mounted) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: containerEase }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(245,240,235,0.95)', backdropFilter: 'blur(24px)' }}
    >
      <div className="relative z-10 w-full max-w-[520px]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: containerEase }}
          className="relative overflow-hidden rounded-[28px] border bg-white/80 backdrop-blur-xl p-9 shadow-[0_20px_60px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.03)]"
          style={{ borderColor: 'rgba(0,0,0,0.06)' }}
        >
          {/* 进度条 */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className="h-[3px] rounded-full transition-all duration-500"
                  style={{
                    width: 20,
                    backgroundColor: i <= step ? C.accent : 'rgba(0,0,0,0.06)',
                  }}
                />
              ))}
            </div>
            <button
              onClick={skip}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-black/5"
              aria-label="跳过"
            >
              <X size={16} />
            </button>
          </div>

          {/* 内容区 */}
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={current.id}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: containerEase }}
            >
              <SecurityVisual stepId={current.id} />

              {/* 标签 */}
              <div
                className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: C.accent }}
              >
                {current.title}
              </div>

              {/* 标题 */}
              <h2
                className="mb-4 text-center text-[22px] font-semibold leading-tight tracking-[-0.02em]"
                style={{ color: C.text, fontFamily: "'Noto Serif SC','Noto Sans SC',serif" }}
              >
                {current.headline}
              </h2>

              {/* 描述 */}
              <p className="mb-6 text-center text-[13px] leading-[1.8]" style={{ color: C.text2 }}>
                {current.description}
              </p>

              {/* 要点列表 */}
              <ul className="mb-8 space-y-2.5">
                {current.bullets.map((bullet, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.08, duration: 0.4, ease: containerEase }}
                    className="flex items-center gap-3 text-[12px]"
                    style={{ color: C.text2 }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: C.accentLight, color: C.accent }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    {bullet}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          {/* 底部按钮 */}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={goBack}
              disabled={step === 0}
              className="flex h-11 items-center gap-1 rounded-full px-4 text-[13px] font-semibold transition-colors disabled:opacity-0"
              style={{ color: C.text2 }}
              onMouseEnter={(e) => { if (step > 0) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <ChevronLeft size={16} />
              上一步
            </button>

            <button
              onClick={goNext}
              className="flex h-11 items-center gap-2 rounded-full px-7 text-[13px] font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(99,102,241,0.25)]"
              style={{ backgroundColor: C.accent }}
            >
              {isLast ? '开始学习' : '下一步'}
              {!isLast && <ChevronRight size={16} />}
            </button>
          </div>

          <p className="mt-4 text-center text-[11px]" style={{ color: C.muted }}>
            之后可在「安全中心」随时查看防护详情
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}