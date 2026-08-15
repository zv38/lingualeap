import { useStore } from '../store/useStore'
import {
  MagazineRoot,
  MagazineHero,
  MagazineQuote,
  MagazineStats,
  MagazineSectionHeader,
  MagazineCourseCard,
  MagazineHabitCard,
  MagazinePath,
  MagazineTestimonials,
  MagazineCTA,
  MagazineFooter,
} from '../components/magazine'

const testimonials = [
  {
    quote: '每天通勤的 15 分钟变成了我的固定仪式，三个月后我能无字幕看商务会议了。',
    name: '李明',
    role: '产品经理 · 上海',
    avatar: 'M',
  },
  {
    quote: '发音纠正功能让我终于敢开口说日语，而不是只停留在课本上。',
    name: 'Sarah',
    role: '设计师 · 北京',
    avatar: 'S',
  },
  {
    quote: '它不是让我背单词，而是让我真正用这门语言思考。',
    name: '王芳',
    role: '自由职业 · 杭州',
    avatar: 'W',
  },
]

export default function Home() {
  const { courses } = useStore()

  const totalStudents = courses.reduce((sum, c) => sum + (c.studentsCount || 0), 0)
  const totalLessons = courses.reduce((sum, c) => sum + c.lessons.length, 0)

  const featuredCourse = courses[0]
    ? {
        title: featuredCourseTitle(courses[0]),
        description: `${courses[0].lessons.length} 节场景化课程，${courses[0].description || '覆盖真实学习场景。'}`,
        progress: courses[0].progress || 68,
        lesson: Math.max(1, Math.round(((courses[0].progress || 68) / 100) * courses[0].lessons.length)),
        duration: '8 分钟',
      }
    : undefined

  return (
    <MagazineRoot>
      <MagazineHero featuredCourse={featuredCourse} />

      <MagazineQuote
        quote="语言不是知识，而是习惯。我们帮你把练习变成每天自然而然的事。"
        attribution="LinguaLeap 编辑团队"
      />

      <MagazineStats
        stats={[
          { value: Math.max(courses.length, 12), suffix: '', label: '门语言课程' },
          { value: Math.round(Math.max(totalStudents, 50000) / 1000), suffix: 'K+', label: '活跃学习者' },
          { value: Math.round((totalLessons / Math.max(courses.length, 1)) * 10), suffix: '%', label: '课程完课率' },
          { value: 15, suffix: 'min', label: '日均推荐时长' },
        ]}
      />

      <section className="magazine-section" id="courses">
        <div className="magazine-container magazine-grid">
          <MagazineSectionHeader
            title="精选课程"
            subtitle="从中断的地方继续，或探索新的语言世界。"
            linkTo="/courses"
            linkText="查看全部"
          />

          <MagazineCourseCard
            to="/courses"
            size="lg"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              </svg>
            }
            tag="本周推荐 · 英语"
            title="商务英语进阶"
            description="从会议开场到邮件收尾，覆盖真实职场场景。系统会根据你的行业背景推荐相关表达。"
            lessons="24 课时"
            progress={68}
            meta="68% 完成"
          />

          <MagazineCourseCard
            to="/courses"
            size="md"
            stagger={1}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 2c1 2 3 3 4 5s-1 4-2 6c2 1 4 2 3 5-2 1-4-1-5-2-1 2-3 3-4 2-1-2 0-3 1-5-2-1-4-2-4-4 2-1 5-1 7 1 1-2 2-3 4-3 1 2 0 4-2 5 2 1 3 0 5-1 0 2-2 4-3 5" />
              </svg>
            }
            tag="日语"
            title="N3 语法精讲"
            description="从句型到真题，系统突破 N3 核心语法。"
            lessons="18 课时"
            progress={35}
            meta="35%"
          />

          <MagazineCourseCard
            to="/courses"
            size="sm"
            stagger={2}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h2a2 2 0 0 1 0 4h-2" />
                <path d="M3 5h15v9a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V5z" />
              </svg>
            }
            tag="法语"
            title="法语发音入门"
            description="掌握法语独特音标与连读规则。"
            progress={12}
          />

          <MagazineHabitCard />

          <MagazineCourseCard
            to="/courses"
            size="lg"
            accent
            style={{ gridColumn: '7 / 13' }}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3" />
                <path d="M7 15h10" />
                <path d="M9 15v4m6-4v4" />
              </svg>
            }
            tag="韩语"
            title="韩语日常会话"
            description="从问候到点餐，30 节课带你轻松应对真实日常场景。"
            lessons="30 课时"
            progress={0}
            meta="新课"
          />
        </div>
      </section>

      <MagazinePath />

      <MagazineTestimonials
        title="学员故事"
        subtitle="来自不同城市、不同职业的真实反馈。"
        testimonials={testimonials}
      />

      <MagazineCTA />

      <MagazineFooter />
    </MagazineRoot>
  )
}

function featuredCourseTitle(course: { title: string }) {
  return course.title.includes('英语') || course.title.includes('商务')
    ? course.title
    : '商务英语进阶'
}
