import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, BookOpen, Users, GraduationCap, SlidersHorizontal, X } from 'lucide-react'
import InlineLoading from '../components/ui/InlineLoading'
import { useStore } from '../store/useStore'
import EmptyState from '../components/EmptyState'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import StaggerContainer, { StaggerItem } from '../components/motion/StaggerContainer'
import AnimatedNumber from '../components/AnimatedNumber'
import CourseCard from '../components/CourseCard'

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

const levelMap: Record<string, string> = {
  beginner: '入门',
  elementary: '初级',
  intermediate: '中级',
  advanced: '高级',
}

const sortOptions: { value: 'popular' | 'duration' | 'name'; label: string }[] = [
  { value: 'popular', label: '最受欢迎' },
  { value: 'duration', label: '课时最多' },
  { value: 'name', label: '名称排序' },
]

export default function Courses() {
  const { courses, currentLanguage, currentLevel, setLanguage, setLevel } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'popular' | 'duration' | 'name'>('popular')
  const [showFilters, setShowFilters] = useState(false)
  const [visibleCount, setVisibleCount] = useState(6)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('course_favorites') || '[]') }
    catch { return [] }
  })

  const toggleFavorite = (courseId: string) => {
    setFavorites(prev => {
      const next = prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
      localStorage.setItem('course_favorites', JSON.stringify(next))
      const isFavorited = !prev.includes(courseId)
      ;(window as any).toast(isFavorited ? '已收藏' : '已取消收藏', 'success')
      return next
    })
  }

  const languages = [
    { code: 'english', name: '英语', flag: '🇺🇸' },
    { code: 'japanese', name: '日语', flag: '🇯🇵' },
    { code: 'korean', name: '韩语', flag: '🇰🇷' },
  ]

  const levels = [
    { code: 'beginner', name: '入门' },
    { code: 'elementary', name: '初级' },
    { code: 'intermediate', name: '中级' },
    { code: 'advanced', name: '高级' },
  ]

  const filteredCourses = useMemo(() => {
    let result = courses.filter(
      (course) => course.language === currentLanguage && course.level === currentLevel
    )

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.instructor.toLowerCase().includes(q)
      )
    }

    if (selectedCategory !== 'all') {
      result = result.filter((c) => c.category === selectedCategory)
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'popular': return (b.studentsCount || 0) - (a.studentsCount || 0)
        case 'duration': return (b.totalDuration || 0) - (a.totalDuration || 0)
        case 'name': return a.title.localeCompare(b.title, 'zh-CN')
        default: return 0
      }
    })

    return result
  }, [courses, currentLanguage, currentLevel, searchQuery, selectedCategory, sortBy])

  const visibleCourses = useMemo(() => filteredCourses.slice(0, visibleCount), [filteredCourses, visibleCount])

  const totalStudents = useMemo(
    () => courses.reduce((sum, c) => sum + (c.studentsCount || 0), 0),
    [courses]
  )

  const totalLessons = useMemo(
    () => courses.reduce((sum, c) => sum + c.lessons.length, 0),
    [courses]
  )



  const categories = useMemo(() => {
    const cats = new Set(courses.filter(c => c.language === currentLanguage).map(c => c.category))
    return ['all', ...Array.from(cats)]
  }, [courses, currentLanguage])

  useEffect(() => {
    setVisibleCount(6)
  }, [currentLanguage, currentLevel, searchQuery, selectedCategory, sortBy])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 3, filteredCourses.length))
        }
      },
      { threshold: 0.1 }
    )
    if (loadMoreRef.current) observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [filteredCourses.length])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen pt-24 pb-16 bg-[var(--bg-primary)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-2"
          >
            课程中心
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            className="text-[var(--text-secondary)]"
          >
            选择适合你的语言之旅
          </motion.p>
        </div>

        {/* Stats */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8" stagger={0.05} delay={0.1}>
          <StaggerItem>
            <Card className="p-5 text-center">
              <BookOpen size={22} className="mx-auto mb-3 text-[var(--accent-indigo)]" />
              <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                <AnimatedNumber value={courses.length} />
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">总课程数</p>
            </Card>
          </StaggerItem>
          <StaggerItem>
            <Card className="p-5 text-center">
              <Users size={22} className="mx-auto mb-3 text-[var(--success)]" />
              <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                <AnimatedNumber value={totalStudents} />
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">在学人数</p>
            </Card>
          </StaggerItem>
          <StaggerItem>
            <Card className="p-5 text-center">
              <GraduationCap size={22} className="mx-auto mb-3 text-[var(--accent-primary)]" />
              <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                <AnimatedNumber value={totalLessons} />
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">总课时数</p>
            </Card>
          </StaggerItem>
        </StaggerContainer>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="mb-6"
        >
          <Card className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <Filter size={18} className="text-[var(--accent-indigo)]" />
                <h2 className="text-base font-semibold">筛选课程</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                aria-label={showFilters ? '收起筛选' : '展开筛选'}
              >
                <SlidersHorizontal size={18} />
              </Button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">语言</p>
                <div className="flex flex-wrap gap-2">
                  {languages.map((lang) => (
                    <Button
                      key={lang.code}
                      variant={currentLanguage === lang.code ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setLanguage(lang.code as any)}
                    >
                      <span className="mr-1.5">{lang.flag}</span>
                      {lang.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">级别</p>
                <div className="flex flex-wrap gap-2">
                  {levels.map((level) => (
                    <Button
                      key={level.code}
                      variant={currentLevel === level.code ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setLevel(level.code as any)}
                    >
                      {level.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="mb-6 overflow-hidden"
            >
              <Card className="p-5 space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">搜索课程</p>
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="搜索课程名称、描述、标签或讲师..."
                      className="pl-10 pr-10"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                        aria-label="清除搜索"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:flex-wrap gap-6">
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">课程分类</p>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <Button
                          key={cat}
                          variant={selectedCategory === cat ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setSelectedCategory(cat)}
                        >
                          {cat === 'all' ? '全部' : `${CATEGORY_ICONS[cat] || ''} ${CATEGORY_LABELS[cat] || cat}`}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">排序方式</p>
                    <div className="flex flex-wrap gap-2">
                      {sortOptions.map((opt) => (
                        <Button
                          key={opt.value}
                          variant={sortBy === opt.value ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setSortBy(opt.value)}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Course grid */}
        {visibleCourses.length > 0 ? (
          <>
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" stagger={0.05} delay={0.1}>
              {visibleCourses.map((course) => (
                <StaggerItem key={course.id}>
                  <CourseCard
                    course={course}
                    levelLabel={levelMap[course.level] || course.level}
                    isFavorite={favorites.includes(course.id)}
                    onToggleFavorite={() => toggleFavorite(course.id)}
                  />
                </StaggerItem>
              ))}
            </StaggerContainer>

            {visibleCount < filteredCourses.length && (
              <div ref={loadMoreRef} className="flex justify-center py-10">
                <InlineLoading size="lg" color="primary" />
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<BookOpen size={48} />}
            title={searchQuery || selectedCategory !== 'all' ? '未找到匹配课程' : '暂无课程'}
            description={searchQuery || selectedCategory !== 'all' ? '尝试调整搜索条件或筛选条件' : '该语言和级别的课程正在开发中，敬请期待！'}
          />
        )}
      </div>
    </motion.div>
  )
}
