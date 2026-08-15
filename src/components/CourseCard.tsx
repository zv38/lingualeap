import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Clock, Users, Heart, Sparkles } from 'lucide-react'
import { Card } from './ui/Card'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Progress } from './ui/Progress'
import ImageWithFallback from './ImageWithFallback'
import { playCourseSelectSound, triggerHaptic } from '../utils/sound'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useStore } from '../store/useStore'
import type { Course } from '../data/mockData'

interface CourseCardProps {
  course: Course
  isFavorite: boolean
  onToggleFavorite: () => void
  levelLabel: string
  categoryIcon?: string
  categoryLabel?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  pronunciation: '发音',
  vocabulary: '词汇',
  grammar: '语法',
  listening: '听力',
  speaking: '口语',
  reading: '阅读',
  writing: '写作',
  culture: '文化',
  exam: '考试',
}

const CATEGORY_ICONS: Record<string, string> = {
  pronunciation: '🎤',
  vocabulary: '📚',
  grammar: '📝',
  listening: '🎧',
  speaking: '💬',
  reading: '📖',
  writing: '✍️',
  culture: '🌍',
  exam: '🎯',
}

export default function CourseCard({
  course,
  isFavorite,
  onToggleFavorite,
  levelLabel,
  categoryIcon = CATEGORY_ICONS[course.category] || '',
  categoryLabel = CATEGORY_LABELS[course.category] || course.category,
}: CourseCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const navigate = useNavigate()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = useReducedMotion()
  const { setLanguage, setLevel } = useStore()

  const clearAutoNavigate = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const goToCourse = useCallback(() => {
    clearAutoNavigate()
    setLanguage(course.language)
    setLevel(course.level)
    navigate(`/learn/${course.type || 'word'}`)
  }, [clearAutoNavigate, navigate, course.type, course.language, course.level, setLanguage, setLevel])

  const handleSelect = useCallback((e: React.MouseEvent) => {
    // 收藏按钮点击不触发翻转
    if ((e.target as HTMLElement).closest('[data-favorite-btn]')) return

    // 已翻转状态下点击开始学习
    if (isFlipped) {
      goToCourse()
      return
    }

    playCourseSelectSound()
    triggerHaptic([20, 30, 20])
    setIsFlipped(true)

    // 翻转后短暂停留，给用户确认感，然后自动进入学习
    timerRef.current = setTimeout(() => {
      navigate(`/learn/${course.type || 'word'}`)
    }, 2600)
  }, [isFlipped, goToCourse, navigate, course.type])

  useEffect(() => {
    return clearAutoNavigate
  }, [clearAutoNavigate])

  return (
    <Card
      className="h-full flex flex-col overflow-hidden group cursor-pointer"
      hover
      onClick={handleSelect}
      style={{ perspective: '1000px' } as React.CSSProperties}
    >
      <motion.div
        className="relative grid w-full h-full"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={reducedMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 180, damping: 22, mass: 0.8 }
        }
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* 正面 */}
        <div
          className="col-start-1 row-start-1 flex flex-col"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="relative h-48 overflow-hidden">
            <ImageWithFallback
              src={course.coverImage}
              alt={course.title}
              className="h-full w-full transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              <Badge variant="primary" className="text-[10px]">
                {levelLabel}
              </Badge>
              {course.category && (
                <Badge variant="default" className="text-[10px] bg-black/40 text-white border-none backdrop-blur-sm">
                  {categoryIcon} {categoryLabel}
                </Badge>
              )}
            </div>
            {course.studentsCount ? (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-black/40 text-white backdrop-blur-sm">
                <Users size={10} />
                {course.studentsCount.toLocaleString()}
              </div>
            ) : null}
            <button
              data-favorite-btn
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite()
              }}
              className="absolute bottom-3 right-3 p-2 rounded-full bg-white/90 text-[var(--text-secondary)] hover:text-[var(--warning)] hover:bg-white transition-colors shadow-sm"
              aria-label={isFavorite ? '取消收藏' : '收藏课程'}
            >
              <Heart
                size={16}
                className={isFavorite ? 'fill-[var(--warning)] text-[var(--warning)]' : ''}
              />
            </button>
          </div>

          <div className="flex flex-col flex-1 p-5">
            <div className="flex items-center gap-2 mb-2 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <BookOpen size={12} />
                {course.lessons.length} 课
              </span>
              {course.totalDuration ? (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {course.totalDuration}分
                </span>
              ) : null}
            </div>

            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2 line-clamp-2 group-hover:text-[var(--accent-indigo)] transition-colors">
              {course.title}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-4">
              {course.description}
            </p>

            {course.tags && course.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {course.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-2 py-0.5">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}

            {course.progress > 0 && (
              <div className="mt-auto mb-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
                  <span>学习进度</span>
                  <span>{course.progress}%</span>
                </div>
                <Progress value={course.progress} size="sm" color="indigo" />
              </div>
            )}

            <div className="mt-auto pt-4 border-t border-[var(--border-secondary)] flex items-center justify-between">
              {course.instructor ? (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[10px] font-semibold text-[var(--text-secondary)]">
                    {course.instructor.charAt(0)}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">{course.instructor}</span>
                </div>
              ) : (
                <span />
              )}
              <span className="text-sm font-semibold text-[var(--accent-indigo)] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                开始学习 <ArrowRight size={14} />
              </span>
            </div>
          </div>
        </div>

        {/* 背面 */}
        <div
          className="col-start-1 row-start-1 flex flex-col bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)] p-6"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-[var(--accent-indigo)]/10 flex items-center justify-center">
              <Sparkles size={28} className="text-[var(--accent-indigo)]" />
            </div>
          </div>

          <h3 className="text-lg font-bold text-center text-[var(--text-primary)] mb-2">
            {course.title}
          </h3>
          <p className="text-sm text-center text-[var(--text-secondary)] mb-6 line-clamp-3">
            {course.description}
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">课程数</span>
              <span className="font-medium text-[var(--text-primary)]">{course.lessons.length} 课</span>
            </div>
            {course.totalDuration ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">总时长</span>
                <span className="font-medium text-[var(--text-primary)]">{course.totalDuration} 分钟</span>
              </div>
            ) : null}
            {course.studentsCount ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">在学人数</span>
                <span className="font-medium text-[var(--text-primary)]">{course.studentsCount.toLocaleString()}</span>
              </div>
            ) : null}
          </div>

          {course.progress > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
                <span>学习进度</span>
                <span>{course.progress}%</span>
              </div>
              <Progress value={course.progress} size="sm" color="indigo" />
            </div>
          )}

          <div className="mt-auto space-y-3">
            <Button
              className="w-full"
              onClick={(e) => {
                e.stopPropagation()
                goToCourse()
              }}
            >
              开始学习 <ArrowRight size={16} className="ml-1" />
            </Button>
            <p className="text-center text-[11px] text-[var(--text-muted)]">
              2 秒后自动进入课程
            </p>
          </div>
        </div>
      </motion.div>
    </Card>
  )
}
