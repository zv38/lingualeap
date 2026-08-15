import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Crown, Sparkles, Zap, Check, Clock, ShieldCheck,
  CreditCard, Smartphone, Gift, AlertCircle,
  ChevronRight, ArrowLeft, Lock, Unlock,
  Bot, Trophy, Swords, BookOpen, BarChart3, Download,
  Volume2, MessageCircle, Award, Star
} from 'lucide-react'
import InlineLoading from '../components/ui/InlineLoading'
import { useStore } from '../store/useStore'
import { getCachedToken } from '../utils/authCache'
import { playUpgradeSound } from '../utils/sound'
import ConfettiCelebration from '../components/ConfettiCelebration'

const PLANS = {
  basic: {
    key: 'basic' as const,
    name: '基础会员',
    shortName: '基础',
    color: 'from-[var(--accent-secondary)] to-[var(--accent-hover)]',
    lightColor: 'bg-black/5 text-[var(--text-secondary)]',
    accent: 'text-[var(--accent-secondary)]',
    border: 'border-black/10',
    icon: Sparkles,
    prices: {
      monthly: { amount: 1800, label: '月卡', originalAmount: 2800, tag: undefined },
      yearly: { amount: 16800, label: '年卡', originalAmount: 21600, tag: '最受欢迎' },
      lifetime: { amount: 29800, label: '永久', originalAmount: 59800, tag: '限时特价' },
    },
  },
  pro: {
    key: 'pro' as const,
    name: '高级会员',
    shortName: '高级',
    color: 'from-[var(--accent-primary)] via-[var(--accent-secondary)] to-[var(--accent-hover)]',
    lightColor: 'bg-black/10 text-[var(--text-secondary)]',
    accent: 'text-[var(--accent-primary)]',
    border: 'border-black/10',
    icon: Crown,
    prices: {
      monthly: { amount: 3800, label: '月卡', originalAmount: 5800, tag: undefined },
      yearly: { amount: 36800, label: '年卡', originalAmount: 45600, tag: '超值推荐' },
      lifetime: { amount: 59800, label: '永久', originalAmount: 119800, tag: '终身特权' },
    },
  },
};

const BADGES = {
  free: {
    name: '学习者',
    icon: Star,
    color: 'from-[var(--bg-elevated)] to-[var(--text-muted)]',
    ring: 'ring-black/10',
    desc: '免费用户',
  },
  basic: {
    name: '进阶学者',
    icon: Sparkles,
    color: 'from-[var(--text-muted)] to-[var(--accent-secondary)]',
    ring: 'ring-black/10',
    desc: '基础会员',
  },
  pro: {
    name: '语言大师',
    icon: Crown,
    color: 'from-[var(--accent-secondary)] via-[var(--accent-hover)] to-[var(--accent-secondary)]',
    ring: 'ring-black/10',
    desc: '高级会员',
  },
};

const PRIVILEGES = [
  { key: 'courses', name: '高级课程', icon: BookOpen, free: '限制访问', basic: '开放 60%', pro: '全部解锁' },
  { key: 'aiChatDaily', name: 'AI 客服', icon: Bot, free: '10 次/日', basic: '50 次/日', pro: '无限次' },
  { key: 'dailyChallenge', name: '每日挑战', icon: Trophy, free: '1 次/日', basic: '3 次/日', pro: '无限次' },
  { key: 'battleDaily', name: '对战模式', icon: Swords, free: '3 次/日', basic: '10 次/日', pro: '无限次' },
  { key: 'learningReport', name: '学习报告', icon: BarChart3, free: '基础报告', basic: '周报', pro: '深度分析' },
  { key: 'offlineDownload', name: '离线下载', icon: Download, free: '不支持', basic: '5 个课程', pro: '无限制' },
  { key: 'advancedSpeech', name: '语音评测', icon: Volume2, free: '基础模式', basic: '高级模式', pro: '高级模式' },
  { key: 'communityBadge', name: '社区标识', icon: MessageCircle, free: '普通', basic: '银色徽章', pro: '金色徽章' },
];

function formatAmount(amount: number) {
  return `¥${(amount / 100).toFixed(0)}`;
}

function Countdown() {
  const [timeLeft, setTimeLeft] = useState(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(0, end.getTime() - now.getTime());
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      setTimeLeft(Math.max(0, end.getTime() - now.getTime()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = Math.floor(timeLeft / 3600000);
  const minutes = Math.floor((timeLeft % 3600000) / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      <span className="bg-black/10 px-1.5 py-0.5 rounded">{String(hours).padStart(2, '0')}</span>
      <span>:</span>
      <span className="bg-black/10 px-1.5 py-0.5 rounded">{String(minutes).padStart(2, '0')}</span>
      <span>:</span>
      <span className="bg-black/10 px-1.5 py-0.5 rounded">{String(seconds).padStart(2, '0')}</span>
    </div>
  );
}

export default function Membership() {
  const navigate = useNavigate();
  const { user, membershipInfo, addToast, fetchMembership } = useStore();
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro'>('pro');
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly' | 'lifetime'>('yearly');
  const [paymentMethod, setPaymentMethod] = useState<'alipay' | 'wechat'>('alipay');
  const [loading, setLoading] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<{ orderId: string; amount: number; signature?: string; protectionEnabled?: boolean } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [protectionNotified, setProtectionNotified] = useState(false);

  const currentLevel = membershipInfo?.membership || user?.membership || 'free';
  const currentBadge = BADGES[currentLevel];
  const CurrentBadgeIcon = currentBadge.icon;

  useEffect(() => {
    fetchMembership();
  }, [fetchMembership]);

  useEffect(() => {
    if (checkoutOpen && currentOrder?.protectionEnabled && !protectionNotified) {
      addToast('支付保护已开启', 'success', 2500);
      setProtectionNotified(true);
    }
    if (!checkoutOpen) {
      setProtectionNotified(false);
    }
  }, [checkoutOpen, currentOrder, protectionNotified, addToast]);

  const selectedPrice = PLANS[selectedPlan].prices[selectedPeriod];

  async function createOrder() {
    setLoading(true);
    try {
      const res = await fetch('/api/membership/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getCachedToken() || ''}`,
        },
        body: JSON.stringify({
          plan: selectedPlan,
          period: selectedPeriod,
          paymentMethod,
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        setCurrentOrder({
          orderId: result.data.orderId,
          amount: result.data.amount,
          signature: result.data.signature,
          protectionEnabled: result.data.protectionEnabled,
        });
        setCheckoutOpen(true);
      } else {
        addToast(result.message || '创建订单失败', 'error', 3000);
      }
    } catch {
      addToast('网络错误，请稍后重试', 'error', 3000);
    } finally {
      setLoading(false);
    }
  }

  function generateNonce() {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function confirmSandboxPay() {
    if (!currentOrder) return;
    setLoading(true);
    try {
      const res = await fetch('/api/membership/sandbox-pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getCachedToken() || ''}`,
        },
        body: JSON.stringify({
          orderId: currentOrder.orderId,
          signature: currentOrder.signature,
          nonce: generateNonce(),
          timestamp: Date.now(),
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        await fetchMembership();
        setCheckoutOpen(false);
        setConfetti(true);
        setShowSuccess(true);
        playUpgradeSound();
        setTimeout(() => {
          setConfetti(false);
          setShowSuccess(false);
        }, 4500);
      } else {
        addToast(result.message || '支付失败', 'error', 3000);
      }
    } catch {
      addToast('支付处理失败', 'error', 3000);
    } finally {
      setLoading(false);
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <motion.div
      className="min-h-screen pb-32 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <ConfettiCelebration active={confetti} />

      {/* 返回 */}
      <div className="pt-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-black/5 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">会员中心</h1>
          <p className="text-sm text-[var(--text-muted)]">你的专属学习身份</p>
        </div>
      </div>

      {/* 英雄区：当前等级 + 徽章 */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mt-6 relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--accent-primary)] via-[var(--accent-secondary)] to-[var(--accent-hover)] text-white p-8 sm:p-10 shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />

        <div className="relative flex flex-col md:flex-row items-center gap-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${currentBadge.color} p-1 shadow-2xl ring-4 ring-white/20`}>
              <div className="w-full h-full rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <CurrentBadgeIcon className="w-14 h-14 text-white" />
              </div>
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white text-[var(--accent-primary)] text-xs font-bold px-3 py-1 rounded-full shadow-lg">
              {currentBadge.name}
            </div>
          </motion.div>

          <div className="flex-1 text-center md:text-left">
            <p className="text-white/80 text-sm font-medium tracking-wider uppercase mb-1">当前身份</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-2">
              {currentLevel === 'pro' ? '高级会员' : currentLevel === 'basic' ? '基础会员' : '免费学习者'}
            </h2>
            <p className="text-white/80 max-w-md mb-4">
              {currentLevel === 'pro'
                ? '你已解锁全部高级权益，享受最完整的学习体验。'
                : currentLevel === 'basic'
                ? '你已迈出进阶一步，继续升级解锁更多专属特权。'
                : '开启会员之旅，解锁更多课程、无限 AI 客服与专属标识。'}
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              {membershipInfo?.expiresAt ? (
                <span className="inline-flex items-center gap-1.5 bg-white/15 px-4 py-2 rounded-full text-sm">
                  <Clock className="w-4 h-4" />
                  有效期至 {new Date(membershipInfo.expiresAt).toLocaleDateString('zh-CN')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-white/15 px-4 py-2 rounded-full text-sm">
                  <Award className="w-4 h-4" />
                  {currentLevel === 'free' ? '尚未开通会员' : '永久会员'}
                </span>
              )}
              {currentLevel !== 'free' && (
                <span className="inline-flex items-center gap-1.5 bg-white/15 px-4 py-2 rounded-full text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  已解锁 {PRIVILEGES.filter(p => p[currentLevel] !== p.free).length} 项专属权益
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 徽章墙 */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mt-8"
      >
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-[var(--accent-primary)]" />
          会员徽章
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {(Object.keys(BADGES) as Array<'free' | 'basic' | 'pro'>).map((level, idx) => {
            const badge = BADGES[level];
            const Icon = badge.icon;
            const isCurrent = currentLevel === level;
            const isUnlocked = ['free', 'basic', 'pro'].indexOf(currentLevel) >= ['free', 'basic', 'pro'].indexOf(level);
            return (
              <motion.div
                key={level}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * idx }}
                className={`relative rounded-2xl p-5 text-center border transition-all ${
                  isCurrent
                    ? 'glass-panel border-white/70 shadow-md'
                    : isUnlocked
                    ? 'glass-panel border-[var(--glass-border)]'
                    : 'bg-black/[0.02] border-black/5 opacity-60'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    当前
                  </div>
                )}
                <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-br ${badge.color} p-0.5 mb-3 ${isUnlocked ? '' : 'grayscale'}`}>
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                    <Icon className={`w-7 h-7 ${isUnlocked ? 'text-[var(--accent-primary)]' : 'text-[var(--text-placeholder)]'}`} />
                  </div>
                </div>
                <p className="font-bold text-sm">{badge.name}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{badge.desc}</p>
                {!isUnlocked && (
                  <div className="mt-2 flex items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
                    <Lock className="w-3 h-3" /> 未解锁
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* 权益卡片 */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mt-10"
      >
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--accent-primary)]" />
          专属权益
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRIVILEGES.map((p, idx) => {
            const Icon = p.icon;
            const currentValue = p[currentLevel];
            const isLimited = currentLevel === 'free';
            return (
              <motion.div
                key={p.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * idx }}
                className="rounded-2xl glass-panel p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2.5 rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                    <Icon className="w-5 h-5" />
                  </div>
                  {isLimited ? (
                    <Lock className="w-4 h-4 text-[var(--text-muted)]" />
                  ) : (
                    <Unlock className="w-4 h-4 text-[var(--accent-primary)]" />
                  )}
                </div>
                <p className="font-medium text-sm text-[var(--text-muted)]">{p.name}</p>
                <p className={`text-lg font-bold mt-1 ${isLimited ? 'text-[var(--text-primary)]' : 'text-[var(--accent-primary)]'}`}>
                  {currentValue}
                </p>
                <div className="mt-3 h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: currentLevel === 'pro' ? '100%' : currentLevel === 'basic' ? '60%' : '25%' }}
                    transition={{ duration: 0.8, delay: 0.2 + idx * 0.05 }}
                    className={`h-full rounded-full ${currentLevel === 'pro' ? 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)]' : currentLevel === 'basic' ? 'bg-[var(--text-muted)]' : 'bg-[var(--text-placeholder)]'}`}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* 升级历程 */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mt-10 rounded-2xl glass-panel p-6"
      >
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[var(--accent-primary)]" />
          成长历程
        </h3>
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="absolute top-6 left-4 right-4 h-1 bg-black/5 rounded-full hidden sm:block" />
          {[
            { level: 'free', title: '开始学习', desc: '免费体验核心课程' },
            { level: 'basic', title: '进阶解锁', desc: '更多课程与次数' },
            { level: 'pro', title: '大师之路', desc: '尊享全部特权' },
          ].map((step, idx) => {
            const active = ['free', 'basic', 'pro'].indexOf(currentLevel) >= idx;
            const isCurrent = currentLevel === step.level;
            return (
              <div key={step.level} className="relative z-10 flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2 w-full sm:w-auto">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                  isCurrent
                    ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/30'
                    : active
                    ? 'bg-white border-[var(--accent-primary)] text-[var(--accent-primary)]'
                    : 'bg-white border-black/10 text-[var(--text-muted)]'
                }`}>
                  {isCurrent ? <Check className="w-5 h-5" /> : active ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <div>
                  <p className={`font-bold text-sm ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{step.title}</p>
                  <p className="text-xs text-[var(--text-muted)]">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* 价格区 */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mt-10"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--accent-primary)]" />
            选择套餐
          </h3>
          <div className="flex items-center gap-2 text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-primary)] px-3 py-1.5 rounded-full">
            <Gift className="w-3.5 h-3.5" />
            限时优惠
            <Countdown />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {(Object.keys(PLANS) as Array<'basic' | 'pro'>).map((planKey) => {
            const plan = PLANS[planKey];
            const Icon = plan.icon;
            const isSelected = selectedPlan === planKey;
            const isCurrent = currentLevel === planKey;
            return (
              <motion.div
                key={planKey}
                onClick={() => setSelectedPlan(planKey)}
                className={`relative rounded-2xl border-2 p-6 cursor-pointer transition-all ${
                  isSelected
                    ? `${plan.border} bg-gradient-to-br from-white to-[var(--bg-secondary)]/50 shadow-lg`
                    : 'border-black/5 bg-white hover:border-black/10'
                }`}
                whileHover={{ y: -2 }}
              >
                {planKey === 'pro' && (
                  <div className="absolute -top-3 right-6 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                    推荐选择
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-6 bg-[var(--accent-secondary)] text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                    当前套餐
                  </div>
                )}

                <div className="flex items-center gap-3 mb-5">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${plan.color} text-white`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xl">{plan.name}</h4>
                    <p className="text-xs text-[var(--text-muted)]">{planKey === 'pro' ? '解锁全部高级权益' : '解锁核心进阶权益'}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-5">
                  {(Object.keys(plan.prices) as Array<'monthly' | 'yearly' | 'lifetime'>).map((period) => {
                    const price = plan.prices[period];
                    const isPeriodSelected = isSelected && selectedPeriod === period;
                    return (
                      <button
                        key={period}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlan(planKey);
                          setSelectedPeriod(period);
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isPeriodSelected
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                            : 'border-black/5 hover:border-black/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isPeriodSelected ? 'border-[var(--accent-primary)]' : 'border-black/20'}`}>
                            {isPeriodSelected && <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium">{price.label}</p>
                            {price.tag && <p className="text-[10px] text-[var(--text-primary)] font-medium">{price.tag}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{formatAmount(price.amount)}</p>
                          <p className="text-xs text-[var(--text-muted)] line-through">{formatAmount(price.originalAmount)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="text-xs text-[var(--text-muted)] space-y-1">
                  {planKey === 'pro' ? (
                    <>
                      <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> 全部课程无限制访问</p>
                      <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> 无限 AI 客服与对战</p>
                      <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> 金色社区徽章标识</p>
                    </>
                  ) : (
                    <>
                      <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> 60% 高级课程开放</p>
                      <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> 更多 AI 客服次数</p>
                      <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> 银色社区徽章标识</p>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* 支付方式 */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mt-6 rounded-2xl glass-panel p-6"
      >
        <h3 className="text-sm font-bold mb-4 text-[var(--text-muted)]">支付方式</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setPaymentMethod('alipay')}
            className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border transition-all ${paymentMethod === 'alipay' ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5' : 'border-black/5 hover:border-black/10'}`}
          >
            <Smartphone className="w-5 h-5 text-[var(--text-primary)]" />
            <span className="font-medium text-sm">支付宝</span>
          </button>
          <button
            onClick={() => setPaymentMethod('wechat')}
            className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border transition-all ${paymentMethod === 'wechat' ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5' : 'border-black/5 hover:border-black/10'}`}
          >
            <Smartphone className="w-5 h-5 text-[var(--text-primary)]" />
            <span className="font-medium text-sm">微信支付</span>
          </button>
        </div>
      </motion.div>

      {/* 底部支付栏 */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-black/5 p-4 z-[100]"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 pr-20 pl-20 sm:pr-4 sm:pl-4">
          <div>
            <p className="text-sm text-[var(--text-muted)]">已选 {PLANS[selectedPlan].name} · {PLANS[selectedPlan].prices[selectedPeriod].label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[var(--text-primary)]">{formatAmount(selectedPrice.amount)}</span>
              <span className="text-sm text-[var(--text-muted)] line-through">{formatAmount(selectedPrice.originalAmount)}</span>
              <span className="text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-primary)] px-2 py-0.5 rounded-full">
                省 {formatAmount(selectedPrice.originalAmount - selectedPrice.amount)}
              </span>
            </div>
          </div>
          <button
            onClick={createOrder}
            disabled={loading}
            className="flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
          >
            {loading ? <InlineLoading size="sm" color="white" /> : <Sparkles className="w-5 h-5" />}
            {loading ? '处理中...' : '立即升级'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* 沙箱收银台 */}
      <AnimatePresence>
        {checkoutOpen && currentOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10010] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white">
                  <CreditCard className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold">确认订单</h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">沙箱环境，点击下方按钮模拟支付成功</p>
                {currentOrder?.protectionEnabled && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-medium border border-[var(--border-primary)]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    支付保护已开启
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-black/[0.03] p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">商品</span>
                  <span className="font-medium">{PLANS[selectedPlan].name} · {PLANS[selectedPlan].prices[selectedPeriod].label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">支付方式</span>
                  <span className="font-medium">{paymentMethod === 'alipay' ? '支付宝' : '微信支付'}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-black/5">
                  <span className="text-[var(--text-muted)]">实付金额</span>
                  <span className="text-xl font-bold text-[var(--text-primary)]">{formatAmount(currentOrder.amount)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setCheckoutOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-black/10 font-medium hover:bg-black/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmSandboxPay}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white font-bold shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? <InlineLoading size="sm" color="white" /> : null}
                  {loading ? '支付中...' : '确认支付'}
                </button>
              </div>

              <p className="text-xs text-[var(--text-muted)] text-center mt-4 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                沙箱环境不会真实扣款
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 购买成功全屏庆祝 */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10020] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 20 }}
              className="glass-panel rounded-[2rem] p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="w-24 h-24 mx-auto mb-5 rounded-full bg-gradient-to-br from-[var(--accent-primary)] via-[var(--accent-secondary)] to-[var(--accent-primary)] p-1 shadow-xl"
              >
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                  <Crown className="w-12 h-12 text-[var(--accent-primary)]" />
                </div>
              </motion.div>
              <h3 className="text-2xl font-bold mb-2">升级成功！</h3>
              <p className="text-[var(--text-muted)] mb-6">
                恭喜你成为 <span className="font-bold text-[var(--accent-primary)]">{PLANS[selectedPlan].name}</span>，专属权益已全部解锁。
              </p>
              <button
                onClick={() => setShowSuccess(false)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white font-bold shadow-lg"
              >
                开启专属体验
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
