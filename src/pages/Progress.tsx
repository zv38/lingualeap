import { useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Trophy, BookOpen, Clock, TrendingUp, Calendar } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { useStore } from '../store/useStore'
import InfoTip from '../components/InfoTip'
import Tooltip from '../components/Tooltip'
import EmptyState from '../components/EmptyState'
import { staggerContainer, staggerItem, cardHover, buttonTap, pageEnter, ringProgress } from '../utils/animations'
import ScrollReveal from '../components/animations/ScrollReveal'
import TextReveal from '../components/animations/TextReveal'
import ListStagger from '../components/animations/ListStagger'
import { useSpringNumber } from '../hooks/useSpringNumber'

function StatValue({ value, inView }: { value: number; inView: boolean }) {
  const { display } = useSpringNumber(inView ? value : 0, { stiffness: 80, damping: 20 })
  return <motion.span style={{ display: 'inline-block' }}>{display}</motion.span>
}

const Progress = () => {
  const { progress, courses } = useStore()
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year' | 'all'>('month')

  const weeklyData = progress.weeklyData

  const statsRef = useRef(null)
  const statsInView = useInView(statsRef, { once: true, margin: '-100px' })

  const stats = [
    { icon: BookOpen, value: progress.totalWordsLearned, label: '单词掌握', color: 'gold', tip: '你已掌握的单词总数' },
    { icon: Trophy, value: progress.totalLessonsCompleted, label: '完成课程', color: 'moss', tip: '已完成的课程数量' },
    { icon: Clock, value: Math.floor(progress.totalStudyTime / 60), label: '学习时长(h)', color: 'dusk', tip: '累计学习总时长' },
    { icon: TrendingUp, value: progress.streak, label: '连续天数', color: 'rust', tip: '连续登录学习的天数' },
  ]

  const iconBgMap: Record<string, string> = {
    gold: 'glass-icon text-[var(--accent-primary)]',
    moss: 'glass-icon text-[var(--success)]',
    dusk: 'glass-icon text-[var(--accent-navy)]',
    rust: 'glass-icon text-[var(--warning)]',
  }

  const gradientMap: Record<string, string> = {
    gold: 'gradient-text',
    moss: 'gradient-moss',
    dusk: 'gradient-dusk',
    rust: 'gradient-rust',
  }

  const inProgressCourses = courses.filter((c) => c.progress > 0 && c.progress < 100)

  const goals = [
    { label: '每日目标', current: 35, target: 60, color: 'var(--accent-primary)' },
    { label: '周目标', current: 180, target: 300, color: 'var(--success)' },
    { label: '月目标', current: 650, target: 1200, color: 'var(--accent-navy)' },
  ]

  return (
    <motion.div
      className="relative min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
      variants={pageEnter}
      initial="initial"
      animate="animate"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div className="mb-10">
          <ScrollReveal>
            <TextReveal text="学习进度" as="h1" className="font-serif text-5xl gradient-text" />
          </ScrollReveal>
          <p className="italic text-[var(--text-secondary)] mt-2">追踪你的语言成长</p>
          <div className="ornament mt-4" />
        </motion.div>

        <>
        <motion.div
          ref={statsRef}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                variants={staggerItem}
                {...cardHover}
                className="glass-card rounded-[2rem] p-8"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${iconBgMap[stat.color]}`}>
                  <Icon size={26} />
                </div>
                <p className={`font-serif text-4xl ${gradientMap[stat.color]}`}>
                  <StatValue value={stat.value} inView={statsInView} />
                </p>
                <div className="font-mono text-xs text-[var(--text-muted)] tracking-[0.2em] uppercase mt-1 flex items-center gap-1.5">
                  {stat.label}
                  <InfoTip content={stat.tip} />
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        <div className="flex gap-2 mb-6">
          {[
            { value: 'week', label: '本周' },
            { value: 'month', label: '本月' },
            { value: 'year', label: '年度' },
            { value: 'all', label: '全部' },
          ].map((range) => (
            <Tooltip key={range.value} content={`查看${range.label}数据`}>
              <motion.button
                onClick={() => setTimeRange(range.value as any)}
                {...buttonTap}
                className={`px-5 py-2 rounded-full text-sm font-sans transition-all ${timeRange === range.value
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-black/[0.04] text-[var(--text-secondary)] hover:bg-black/[0.06]'
                }`}
              >
                {range.label}
              </motion.button>
            </Tooltip>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <ScrollReveal>
            <motion.div
              className="glass-panel rounded-[2rem] p-8"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 flex items-center space-x-2 font-serif">
                <Calendar className="text-[var(--accent-primary)]" size={24} />
                <span>学习趋势</span>
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData}>
                    <defs>
                      <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                    <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(0,0,0,0.04)',
                        borderRadius: '12px',
                      }}
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke="var(--accent-primary)"
                      strokeWidth={2}
                      fill="url(#colorXp)"
                      animationBegin={300}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </ScrollReveal>

          <ScrollReveal>
            <motion.div
              className="glass-panel rounded-[2rem] p-8"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 font-serif">目标完成度</h3>
              <motion.div
                className="flex items-center justify-center gap-8"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                {goals.map((goal) => {
                  const percentage = Math.min((goal.current / goal.target) * 100, 100)
                  const circumference = 2 * Math.PI * 40

                  return (
                    <motion.div key={goal.label} variants={staggerItem} className="text-center">
                      <svg width="100" height="100" className="transform -rotate-90">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />
                        <motion.circle
                          cx="50" cy="50" r="40" fill="none"
                          stroke={goal.color} strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={circumference}
                          variants={ringProgress(percentage, circumference)}
                          initial="hidden"
                          whileInView="visible"
                          viewport={{ once: true }}
                        />
                      </svg>
                      <p className="text-lg font-bold text-[var(--text-primary)] mt-2">{goal.current}/{goal.target}</p>
                      <p className="text-xs text-[var(--text-muted)]">{goal.label}</p>
                    </motion.div>
                  )
                })}
              </motion.div>
            </motion.div>
          </ScrollReveal>
        </div>

        <motion.div
          className="glass-panel rounded-[2rem] p-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 font-serif">进行中的课程</h3>
          {inProgressCourses.length > 0 ? (
            <ListStagger className="space-y-4">
              {inProgressCourses.map((course) => (
                <motion.div
                  key={course.id}
                  {...cardHover}
                  className="glass-thin flex items-center space-x-4 p-3 rounded-xl hover:border-[var(--accent-primary)]/20"
                >
                  <img
                    src={course.coverImage}
                    alt={course.title}
                    className="w-12 h-12 rounded-xl object-cover border border-[var(--accent-primary)]/[0.06]"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[var(--text-primary)] font-medium truncate">{course.title}</h4>
                    <div className="flex items-center space-x-2 mt-2">
                      <div className="flex-1 h-1.5 glass-progress rounded-full overflow-hidden">
                        <motion.div
                          className="h-full glass-progress-fill rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: course.progress + '%' }}
                          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                        />
                      </div>
                      <span className="text-xs text-[var(--accent-primary)] font-medium">{course.progress}%</span>
                      <InfoTip content="课程完成进度" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </ListStagger>
          ) : (
            <EmptyState icon={<BookOpen size={48} />} title="还没有进行中的课程" description="开始学习一门新课程吧" />
          )}
        </motion.div>

        <motion.div
          className="glass-panel rounded-[2rem] p-8 mt-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 font-serif">全部课程进度</h3>
          <ListStagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <motion.div
                key={course.id}
                {...cardHover}
                className="glass-thin rounded-xl p-4 hover:border-[var(--accent-primary)]/20"
              >
                <div className="flex items-center space-x-3 mb-3">
                  <img
                    src={course.coverImage}
                    alt={course.title}
                    className="w-12 h-12 rounded-xl object-cover border border-[var(--accent-primary)]/[0.06]"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[var(--text-primary)] font-medium text-sm truncate">{course.title}</h4>
                    <p className="text-[var(--text-secondary)] text-xs">
                      {course.language === 'english' ? '英语' : course.language === 'japanese' ? '日语' : '韩语'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 h-1.5 glass-progress rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        course.progress === 100
                          ? 'bg-gradient-to-r from-[var(--success)] to-[var(--accent-secondary)]'
                          : 'glass-progress-fill'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: course.progress + '%' }}
                      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${
                    course.progress === 100 ? 'text-[var(--success)]' : 'text-[var(--accent-primary)]'
                  }`}>
                    {course.progress}%
                  </span>
                  <InfoTip content="课程完成进度" />
                </div>
              </motion.div>
            ))}
          </ListStagger>
        </motion.div>
      </>
      </div>
    </motion.div>
  )
}

export default Progress
