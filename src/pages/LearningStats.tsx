import { motion } from 'framer-motion'
import {
  BarChart3, PieChart, Download, FileText,
  Calendar, Clock, BookOpen, Brain, Mic,
  Headphones, TrendingUp, Flame, Star, Award, DownloadCloud,
} from 'lucide-react'

const overviewStats = [
  { icon: Clock, value: '247h 36m', label: '总学习时长', color: 'amber' },
  { icon: BookOpen, value: '1,284', label: '已学单词', color: 'moss' },
  { icon: Award, value: '36', label: '完成课程', color: 'dusk' },
  { icon: Flame, value: '47', label: '连续学习天数', color: 'rust' },
  { icon: Star, value: '12,450', label: '总经验', color: 'amber' },
  { icon: TrendingUp, value: '18h 20m', label: '本周学习时长', color: 'moss' },
]

const weeklyData = [
  { day: '周一', minutes: 45 },
  { day: '周二', minutes: 62 },
  { day: '周三', minutes: 38 },
  { day: '周四', minutes: 75 },
  { day: '周五', minutes: 50 },
  { day: '周六', minutes: 90 },
  { day: '周日', minutes: 68 },
]

const languageData = [
  { lang: '英语', percentage: 55, color: 'var(--accent-primary)' },
  { lang: '日语', percentage: 30, color: 'var(--accent-navy)' },
  { lang: '韩语', percentage: 15, color: 'var(--success)' },
]

const skillData = [
  { label: '词汇', icon: BookOpen, value: 82, color: 'amber' },
  { label: '语法', icon: Brain, value: 68, color: 'moss' },
  { label: '听力', icon: Headphones, value: 74, color: 'dusk' },
  { label: '口语', icon: Mic, value: 59, color: 'rust' },
  { label: '阅读', icon: BarChart3, value: 88, color: 'amber' },
  { label: '写作', icon: FileText, value: 63, color: 'moss' },
]

const heatmapData: { minutes: number; day: string }[] = [
  { day: '04-14', minutes: 35 }, { day: '04-15', minutes: 50 }, { day: '04-16', minutes: 0 }, { day: '04-17', minutes: 20 }, { day: '04-18', minutes: 65 }, { day: '04-19', minutes: 90 }, { day: '04-20', minutes: 45 },
  { day: '04-21', minutes: 60 }, { day: '04-22', minutes: 0 }, { day: '04-23', minutes: 40 }, { day: '04-24', minutes: 75 }, { day: '04-25', minutes: 30 }, { day: '04-26', minutes: 55 }, { day: '04-27', minutes: 80 },
  { day: '04-28', minutes: 25 }, { day: '04-29', minutes: 70 }, { day: '04-30', minutes: 45 }, { day: '05-01', minutes: 0 }, { day: '05-02', minutes: 60 }, { day: '05-03', minutes: 35 }, { day: '05-04', minutes: 50 },
  { day: '05-05', minutes: 85 }, { day: '05-06', minutes: 40 }, { day: '05-07', minutes: 65 }, { day: '05-08', minutes: 30 }, { day: '05-09', minutes: 55 }, { day: '05-10', minutes: 70 }, { day: '05-11', minutes: 95 },
]

const dayLabels = ['一', '', '', '', '', '', '']

const iconBgMap: Record<string, string> = {
  amber: 'bg-[var(--accent-primary)]/[0.08] text-[var(--accent-primary)]',
  moss: 'bg-[var(--success)]/[0.08] text-[var(--success)]',
  dusk: 'bg-[var(--accent-navy)]/[0.08] text-[var(--accent-navy)]',
  rust: 'bg-[var(--error)]/[0.08] text-[var(--error)]',
}

const gradientMap: Record<string, string> = {
  amber: 'gradient-text',
  moss: 'gradient-moss',
  dusk: 'gradient-dusk',
  rust: 'gradient-rust',
}

const progressColorMap: Record<string, string> = {
  amber: 'from-[var(--accent-primary)] to-[var(--accent-primary)]',
  moss: 'from-[var(--success)] to-[var(--success)]',
  dusk: 'from-[var(--accent-navy)] to-[var(--accent-navy)]',
  rust: 'from-[var(--error)] to-[var(--error)]',
}

function getHeatmapColor(minutes: number): string {
  if (minutes === 0) return 'bg-[var(--bg-primary)]'
  if (minutes <= 20) return 'bg-[var(--accent-primary)]/[0.12]'
  if (minutes <= 40) return 'bg-[var(--accent-primary)]/[0.25]'
  if (minutes <= 60) return 'bg-[var(--accent-primary)]/[0.4]'
  if (minutes <= 80) return 'bg-[var(--accent-primary)]/[0.55]'
  return 'bg-[var(--accent-primary)]/[0.75]'
}

function simulateDownload(format: string) {
  const link = document.createElement('a')
  const blob = new Blob([`# 学习记录导出 (${format})\n# 生成时间: ${new Date().toLocaleString()}\n\n总学习时长 247h 36m\n已学单词: 1,284\n完成课程: 36\n连续学习天数: 47\n总经验? 12,450`], { type: 'text/plain' })
  link.href = URL.createObjectURL(blob)
  link.download = `learning-stats.${format === 'CSV' ? 'csv' : 'pdf'}`
  link.click()
  URL.revokeObjectURL(link.href)
}

export default function LearningStats() {
  const maxMinutes = Math.max(...weeklyData.map(d => d.minutes))

  return (
    <motion.div
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div className="mb-10">
          <h1 className="font-serif text-5xl gradient-text">学习统计</h1>
          <p className="italic text-[var(--text-secondary)] mt-2">全面的学习数据与报告</p>
          <div className="ornament mt-4" />
        </motion.div>

<>
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8"
          initial="initial"
          animate="animate"
          variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
        >
          {overviewStats.map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                variants={{
                  initial: { opacity: 0, y: 24 },
                  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
                }}
                className="surface-glass card-liquid rounded-[2rem] p-6"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${iconBgMap[stat.color]}`}>
                  <Icon size={22} />
                </div>
                <p className={`font-serif text-3xl ${gradientMap[stat.color]}`}>{stat.value}</p>
                <p className="font-mono text-xs text-[var(--text-muted)] tracking-[0.2em] uppercase mt-1">{stat.label}</p>
              </motion.div>
            )
          })}
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <motion.div
            className="surface-glass rounded-[2rem] p-8"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          >
            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 flex items-center space-x-2 font-serif">
              <BarChart3 className="text-[var(--accent-primary)]" size={24} />
              <span>本周活动</span>
            </h3>
            <div className="flex items-end justify-between gap-2 h-48">
              {weeklyData.map((item) => (
                <div key={item.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <motion.div
                    className="w-full rounded-t-lg"
                    style={{
                      height: `${(item.minutes / maxMinutes) * 100}%`,
                      minHeight: 8,
                      background: 'linear-gradient(180deg, var(--accent-primary) 0%, var(--accent-primary) 100%)',
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: `${(item.minutes / maxMinutes) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
                  />
                  <div className="flex flex-col items-center">
                    <span className="font-mono text-xs text-[var(--accent-primary)]">{item.minutes}m</span>
                    <span className="font-mono text-xs text-[var(--text-muted)] mt-1">{item.day}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="surface-glass rounded-[2rem] p-8"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
          >
            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 flex items-center space-x-2 font-serif">
              <PieChart className="text-[var(--accent-primary)]" size={24} />
              <span>语言分布</span>
            </h3>
            <div className="flex items-center gap-8">
              <div
                className="w-36 h-36 rounded-full flex-shrink-0"
                style={{
                  background: `conic-gradient(
                    ${languageData[0].color} 0deg ${languageData[0].percentage * 3.6}deg,
                    ${languageData[1].color} ${languageData[0].percentage * 3.6}deg ${(languageData[0].percentage + languageData[1].percentage) * 3.6}deg,
                    ${languageData[2].color} ${(languageData[0].percentage + languageData[1].percentage) * 3.6}deg 360deg
                  )`,
                }}
              />
              <div className="flex flex-col gap-3">
                {languageData.map((item) => (
                  <div key={item.lang} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
                    <div>
                      <span className="text-[var(--text-primary)] text-sm">{item.lang}</span>
                      <span className="font-mono text-xs text-[var(--text-secondary)] ml-2">{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="surface-glass rounded-[2rem] p-8 mb-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 flex items-center space-x-2 font-serif">
            <Brain className="text-[var(--accent-primary)]" size={24} />
            <span>技能分</span>
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            {skillData.map((skill) => {
              const Icon = skill.icon
              return (
                <div key={skill.label} className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBgMap[skill.color]}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[var(--text-primary)] text-sm font-medium">{skill.label}</span>
                      <span className={`font-mono text-sm ${gradientMap[skill.color]}`}>{skill.value}%</span>
                    </div>
                    <div className="h-2 bg-white rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full bg-gradient-to-r ${progressColorMap[skill.color]}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${skill.value}%` }}
                        transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        <motion.div
          className="surface-glass rounded-[2rem] p-8 mb-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 flex items-center space-x-2 font-serif">
            <Calendar className="text-[var(--accent-primary)]" size={24} />
            <span>月度学习热力</span>
          </h3>
          <div className="overflow-x-auto">
            <div className="inline-flex flex-col gap-2 min-w-max">
              <div className="flex items-center gap-2 pl-12">
                {dayLabels.map((label) => (
                  <div key={label} className="w-9 text-center font-mono text-xs text-[var(--text-muted)]">{label}</div>
                ))}
              </div>
              {[0, 1, 2, 3].map((week) => (
                <div key={week} className="flex items-center gap-2">
                  <span className="w-10 text-right font-mono text-xs text-[var(--text-muted)]">第{week + 1}</span>
                  {heatmapData.slice(week * 7, week * 7 + 7).map((item) => (
                    <motion.div
                      key={item.day}
                      className={`w-9 h-9 rounded-lg ${getHeatmapColor(item.minutes)} flex items-center justify-center cursor-pointer transition-transform hover:scale-110`}
                      title={`${item.day} - ${item.minutes}分钟`}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.4 + week * 0.05 }}
                    >
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                        {item.minutes > 0 ? Math.round(item.minutes / 10) : ''}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-6 justify-end">
            <span className="font-mono text-xs text-[var(--text-muted)]"></span>
            <div className="w-5 h-5 rounded bg-[var(--bg-primary)]" />
            <div className="w-5 h-5 rounded bg-[var(--accent-primary)]/[0.12]" />
            <div className="w-5 h-5 rounded bg-[var(--accent-primary)]/[0.25]" />
            <div className="w-5 h-5 rounded bg-[var(--accent-primary)]/[0.4]" />
            <div className="w-5 h-5 rounded bg-[var(--accent-primary)]/[0.55]" />
            <div className="w-5 h-5 rounded bg-[var(--accent-primary)]/[0.75]" />
            <span className="font-mono text-xs text-[var(--text-muted)]"></span>
          </div>
        </motion.div>

        <motion.div
          className="surface-glass rounded-[2rem] p-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-6 flex items-center space-x-2 font-serif">
            <DownloadCloud className="text-[var(--accent-primary)]" size={24} />
            <span>数据导出</span>
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-6">将你的学习数据导出为常用格式，方便备份与分析</p>
          <div className="flex flex-wrap gap-4">
            <motion.button
              onClick={() => simulateDownload('CSV')}
              className="surface-glass card-liquid rounded-[2rem] px-8 py-4 flex items-center gap-3 text-[var(--text-primary)] font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Download size={20} className="text-[var(--accent-primary)]" />
              <span>导出学习记录 (CSV)</span>
            </motion.button>
            <motion.button
              onClick={() => simulateDownload('PDF')}
              className="surface-glass card-liquid rounded-[2rem] px-8 py-4 flex items-center gap-3 text-[var(--text-primary)] font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FileText size={20} className="text-[var(--text-secondary)]" />
              <span>导出学习报告 (PDF)</span>
            </motion.button>
          </div>
        </motion.div>
        </>
      </div>
    </motion.div>
  )
}
