import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  BookOpen, Pen, FileText, Search, ChevronDown, ChevronUp,
  CheckCircle, BarChart3, Star, MessageSquare, ArrowRight,
  Sparkles
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import Tooltip from '../components/Tooltip'

type TabType = 'reading' | 'writing'
type Difficulty = 'easy' | 'medium' | 'hard'
type Language = 'english' | 'japanese' | 'korean'

interface Question {
  id: string
  question: string
  options: string[]
  correct: number
}

interface Article {
  id: string
  title: string
  content: string
  difficulty: Difficulty
  wordCount: number
  language: Language
  questions: Question[]
  completed: boolean
}

interface WritingPrompt {
  id: string
  title: string
  description: string
  difficulty: Difficulty
  language: Language
  wordLimit: number
}

interface WritingFeedback {
  grammar: number
  vocabulary: number
  structure: number
  suggestions: string[]
}

const articles: Article[] = [
  {
    id: 'art1',
    title: 'The Future of Renewable Energy',
    content: `Renewable energy has become one of the most critical topics of the 21st century. As the world grapples with climate change and the depletion of fossil fuels, the shift towards sustainable energy sources has accelerated dramatically. Solar, wind, and hydroelectric power are now leading the charge in this global transformation.

The solar energy sector has seen remarkable advancements in recent years. Photovoltaic cells have become increasingly efficient, with some modern panels converting over 22% of sunlight into electricity. The cost of solar installations has dropped by nearly 90% over the past decade, making them accessible to millions of households worldwide. Countries like China, the United States, and Germany have invested heavily in solar infrastructure, creating vast solar farms that power entire cities.

Wind energy has also experienced unprecedented growth. Offshore wind farms, in particular, have proven to be highly effective, capturing stronger and more consistent winds at sea. The United Kingdom and Denmark have become leaders in this field, with offshore wind now supplying a significant portion of their national electricity needs. Modern wind turbines are engineering marvels, with blades spanning over 100 meters and towers reaching heights that rival skyscrapers.

Despite these advances, challenges remain. Energy storage continues to be a major hurdle, as the sun does not always shine and the wind does not always blow. Battery technology has improved substantially, but large-scale storage solutions are still expensive. Additionally, the transition to renewable energy requires significant changes to existing power grids and infrastructure. However, with continued investment and innovation, a fully renewable future is within reach.`,
    difficulty: 'medium',
    wordCount: 248,
    language: 'english',
    questions: [
      {
        id: 'art1-q1',
        question: 'What is the main challenge facing renewable energy according to the article?',
        options: [
          'Solar panels are too expensive',
          'Energy storage and grid infrastructure',
          'Lack of wind in most countries',
          'Government opposition',
        ],
        correct: 1,
      },
      {
        id: 'art1-q2',
        question: 'How much has the cost of solar installations decreased over the past decade?',
        options: [
          'About 50%',
          'Nearly 90%',
          'Approximately 75%',
          'Around 60%',
        ],
        correct: 1,
      },
      {
        id: 'art1-q3',
        question: 'Which countries are mentioned as leaders in offshore wind energy?',
        options: [
          'China and Japan',
          'Germany and France',
          'The United Kingdom and Denmark',
          'The United States and Canada',
        ],
        correct: 2,
      },
      {
        id: 'art1-q4',
        question: 'What is the efficiency rate mentioned for modern solar panels?',
        options: [
          'Over 30%',
          'Over 22%',
          'Over 15%',
          'Over 40%',
        ],
        correct: 1,
      },
    ],
    completed: false,
  },
  {
    id: 'art2',
    title: '日本の四季と文化',
    content: `日本には四季があり、それぞれの季節に独特の文化や行事があります。春は桜の季節で、多くの人々が花見に出かけます。桜の木の下で家族や友達と集まり、食べ物を楽しみながら美しい花を鑑賞します。これは日本で最も人気のある春の行事の一つで?
夏には花火大会が全国各地で開催されます。浴衣を着た人々が川辺や海岸に集まり、夜空を彩る花火を楽しみます。また、夏祭りでは屋台が並び、焼きそばやたこ焼きなどの屋台料理を楽しむことができます。盆踊りも夏の重要な伝統行事です?
秋は紅葉の季節で、京都や日光などの観光地は多くの訪問者で賑わいます。赤や黄色に色づいた山々は息をのむほど美しく、多くの人々が写真を撮りに訪れます。秋にはまた、収穫を祝う祭りも多く行われます?
冬には雪祭りや温泉が人気です。北海道の雪祭りでは、巨大な雪像が作られ、多くの観光客を魅了します。また、寒い冬には温泉に入るのが日本の伝統的な楽しみ方です。地域によっては、雪見温泉と呼ばれる雪を見ながら入る温泉も人気があります。`,
    difficulty: 'easy',
    wordCount: 312,
    language: 'japanese',
    questions: [
      {
        id: 'art2-q1',
        question: '春の日本で最も人気のある行事は何ですか？',
        options: [
          '花火大会',
          '花見',
          '紅葉狩り',
          '雪祭',
        ],
        correct: 1,
      },
      {
        id: 'art2-q2',
        question: '夏に人気のある日本の伝統行事はどれですか',
        options: [
          '花見と紅葉狩',
          '花火大会と盆踊り',
          '雪祭りと温泉',
          '収穫',
        ],
        correct: 1,
      },
      {
        id: 'art2-q3',
        question: '秋に紅葉で有名な観光地として挙げられているのはどこですか',
        options: [
          '北海道と東京',
          '大阪と名古屋',
          '京都と日',
          '福岡と沖',
        ],
        correct: 2,
      },
    ],
    completed: false,
  },
  {
    id: 'art3',
    title: '한국?전통 문화',
    content: `한국은 오랜 역사와 함께 풍부?전통 문화?자랑합니? 한복은 한국?전통 의상으로, 아름다운 색상?우아?디자인이 특징입니? 명절이나 특별?날에?많은 사람들이 한복?입고 가족과 함께 시간?보냅니다. 설날?추석은 한국?가??명절? 가족들?모여 차례?지내고 전통 음식?먹습니다.

한국 음식은 ?세계적으?인기가 많습니다. 김? 불고? 비빔? 떡볶??다양?요리가 있습니다. 김치는 한국인의 식탁에서 빼놓??없는 반찬으로, 발효 식품으로?건강에도 좋습니다. 또한 한국?길거?음식?유명하여, 떡볶이나 순대, 어묵 등을 길에?쉽게 즐길 ?있습니다.

전통 가옥인 한옥은 자연?조화?이루?건축 양식으로 유명합니? 한옥은 나무와 ?같은 자연 재료?사용하여 지어지? 온돌 난방 시스템은 겨울에도 따뜻하게 지??있게 해줍니다. 최근에는 현대적인 건물 속에서도 한옥?아름다움?살린 공간들이 늘어나고 있습니다.

한국?전통 음악?춤도 중요?문화 유산입니? 판소? 사물놀? 탈춤 ?다양?전통 공연 예술?있으? 유네스코 세계 무형 문화 유산으로 등재?것들?많습니다. 이러?전통 문화?현대적인 요소와 결합하여 새로?형태?계속 발전하고 있습니다.`,
    difficulty: 'medium',
    wordCount: 298,
    language: 'korean',
    questions: [
      {
        id: 'art3-q1',
        question: '한국?가??명절은 무엇인가?',
        options: [
          '크리스마스와 할로',
          '설날?추석',
          '어린이날?부처님오신',
          '대통령 선거',
        ],
        correct: 1,
      },
      {
        id: 'art3-q2',
        question: '한옥?특징으로 올바?것은 무엇인가?',
        options: [
          '콘크리트?지어진 현대?건물',
          '자연 재료?사용하고 온돌 난방 시스템을 갖춤',
          '높은 층수?아파',
          '유리로만 만들어진 건물',
        ],
        correct: 1,
      },
      {
        id: 'art3-q3',
        question: '유네스코 세계 무형 문화 유산으로 등재?한국?전통 공연 예술은 무엇인가?',
        options: [
          'K-pop?댄스',
          '판소리와 사물놀',
          '영화와 드라',
          '축구와 야구',
        ],
        correct: 1,
      },
    ],
    completed: false,
  },
  {
    id: 'art4',
    title: 'The Art of Communication',
    content: `Effective communication is widely regarded as one of the most essential skills in both personal and professional life. It goes far beyond the simple exchange of words, encompassing nonverbal cues, active listening, emotional intelligence, and the ability to adapt one's message to different audiences. In an increasingly interconnected world, mastering this art has become more important than ever.

One of the fundamental aspects of effective communication is active listening. Many people hear but do not truly listen. Active listening involves giving your full attention to the speaker, acknowledging their message, and responding thoughtfully. It requires setting aside your own preconceptions and judgments to genuinely understand the other person's perspective. Research has shown that active listening can significantly reduce misunderstandings and build stronger relationships.

Nonverbal communication plays an equally crucial role. Studies suggest that body language, facial expressions, and tone of voice account for over 70% of the message we convey. A simple gesture, a maintained eye contact, or the subtle shift in posture can speak volumes. Cultural differences also play a significant role in nonverbal communication. For example, while direct eye contact is considered confident in Western cultures, it may be perceived as disrespectful in some Asian cultures.

In the digital age, communication has taken on new dimensions. Email, instant messaging, and video calls have become standard tools, each with its own set of conventions and pitfalls. The lack of nonverbal cues in written communication can lead to misinterpretation, making clarity and tone even more critical. Emojis and punctuation have taken on new significance as substitutes for facial expressions and vocal inflections. As technology continues to evolve, so too must our approach to communication, requiring us to be more deliberate and mindful in our interactions.`,
    difficulty: 'hard',
    wordCount: 275,
    language: 'english',
    questions: [
      {
        id: 'art4-q1',
        question: 'What percentage of our conveyed message is attributed to nonverbal communication?',
        options: [
          'Over 50%',
          'Over 60%',
          'Over 70%',
          'Over 80%',
        ],
        correct: 2,
      },
      {
        id: 'art4-q2',
        question: 'According to the article, what is active listening?',
        options: [
          'Hearing what the speaker says',
          'Giving full attention and responding thoughtfully',
          'Taking notes while someone speaks',
          'Speaking more than listening',
        ],
        correct: 1,
      },
      {
        id: 'art4-q3',
        question: 'Why has digital communication become more challenging?',
        options: [
          'It is too fast',
          'Lack of nonverbal cues can cause misinterpretation',
          'People do not use emojis enough',
          'Email is outdated',
        ],
        correct: 1,
      },
      {
        id: 'art4-q4',
        question: 'How does the article describe the role of cultural differences in communication?',
        options: [
          'They are unimportant',
          'They only matter in written communication',
          'They play a significant role, especially in nonverbal cues',
          'They only affect business communication',
        ],
        correct: 2,
      },
    ],
    completed: false,
  },
]

const writingPrompts: WritingPrompt[] = [
  {
    id: 'wp1',
    title: 'Describe Your Favorite Place',
    description: 'Write about a place that holds special meaning for you. Describe what it looks like, sounds like, and how it makes you feel. Explain why this place is important to you and what memories you associate with it.',
    difficulty: 'easy',
    language: 'english',
    wordLimit: 300,
  },
  {
    id: 'wp2',
    title: '将来の夢について',
    description: 'あなたの将来の夢や目標について書いてください。なぜその夢を持っているのか、どのようにしてその目標を達成しようとしているのか、そしてその夢があなたにとってどんな意味があるのかを説明してください',
    difficulty: 'medium',
    language: 'japanese',
    wordLimit: 400,
  },
  {
    id: 'wp3',
    title: '한국 여행 계획',
    description: '한국?여행한다?어디?가?싶은지, 무엇?보고 싶은지?대??보세? 가?싶은 장소, 먹고 싶은 음식, 경험하고 싶은 문화 활동 등을 포함하여 자세?설명?주세?',
    difficulty: 'medium',
    language: 'korean',
    wordLimit: 350,
  },
  {
    id: 'wp4',
    title: 'The Impact of Social Media',
    description: 'Discuss the positive and negative impacts of social media on modern society. Consider its effects on personal relationships, mental health, information sharing, and social movements. Provide specific examples to support your arguments.',
    difficulty: 'hard',
    language: 'english',
    wordLimit: 500,
  },
]

const difficultyLabel: Record<Difficulty, string> = {
  easy: '简',
  medium: '中等',
  hard: '困难',
}

const difficultyBadgeColor: Record<Difficulty, string> = {
  easy: 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10',
  medium: 'text-[var(--accent-primary)] border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10',
  hard: 'text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10',
}

const languageLabel: Record<Language, string> = {
  english: '英语',
  japanese: '日语',
  korean: '韩语',
}

function simulateFeedback(): WritingFeedback {
  return {
    grammar: Math.floor(Math.random() * 21) + 70,
    vocabulary: Math.floor(Math.random() * 21) + 65,
    structure: Math.floor(Math.random() * 21) + 68,
    suggestions: [
      '尝试使用更丰富的连接词来增强段落之间的连贯性',
      '注意主谓一致，特别是在复杂句子',
      '可以适当增加一些具体例子来支持你的论点',
      '部分句子的结构可以更加简洁明',
    ],
  }
}

export default function ReadingWriting() {
  const [activeTab, setActiveTab] = useState<TabType>('reading')
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null)
  const [articleAnswers, setArticleAnswers] = useState<Record<string, number>>({})
  const [submittedArticles, setSubmittedArticles] = useState<Record<string, boolean>>({})
  const [articleList, setArticleList] = useState<Article[]>(articles)
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [writingText, setWritingText] = useState('')
  const [writingFeedback, setWritingFeedback] = useState<WritingFeedback | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const completedCount = articleList.filter((a) => a.completed).length
  const totalCount = articleList.length

  const filteredArticles = articleList.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.language.includes(searchQuery.toLowerCase())
  )

  const handleToggleArticle = (id: string) => {
    setExpandedArticle(expandedArticle === id ? null : id)
    setArticleAnswers({})
    setSubmittedArticles((prev) => ({ ...prev, [id]: false }))
  }

  const handleSelectAnswer = (questionId: string, optionIndex: number) => {
    setArticleAnswers((prev) => ({ ...prev, [questionId]: optionIndex }))
  }

  const handleSubmitArticle = (articleId: string) => {
    setSubmittedArticles((prev) => ({ ...prev, [articleId]: true }))
    const article = articleList.find((a) => a.id === articleId)
    if (!article) return
    const allCorrect = article.questions.every(
      (q) => articleAnswers[q.id] === q.correct
    )
    if (allCorrect) {
      setArticleList((prev) =>
        prev.map((a) => (a.id === articleId ? { ...a, completed: true } : a))
      )
    }
  }

  const allQuestionsAnswered = (articleId: string): boolean => {
    const article = articleList.find((a) => a.id === articleId)
    if (!article) return false
    return article.questions.every((q) => articleAnswers[q.id] !== undefined)
  }

  const handleSubmitWriting = () => {
    if (!writingText.trim()) return
    setIsSubmitting(true)
    setTimeout(() => {
      setWritingFeedback(simulateFeedback())
      setIsSubmitting(false)
    }, 1500)
  }

  const handleSelectPrompt = (id: string) => {
    setSelectedPrompt(id)
    setWritingText('')
    setWritingFeedback(null)
  }

  const wordCount = writingText.trim()
    ? writingText.trim().split(/\s+/).length
    : 0
  const charCount = writingText.length

  const currentPrompt = writingPrompts.find((p) => p.id === selectedPrompt)

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen bg-[var(--bg-primary)] px-6 py-12"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-3 mb-12">
          {activeTab === 'reading' ? (
            <BookOpen className="w-8 h-8 text-[var(--accent-primary)]" />
          ) : (
            <Pen className="w-8 h-8 text-[var(--accent-primary)]" />
          )}
          <h1 className="font-serif text-4xl gradient-text">
            {activeTab === 'reading' ? '阅读理解' : '写作练习'}
          </h1>
        </div>

        <div className="flex items-center justify-center gap-3 mb-10">
          <Tooltip content="阅读文章">
            <button
              onClick={() => setActiveTab('reading')}
              className={`px-8 py-3 rounded-full font-mono text-sm transition-all duration-500 flex items-center gap-2 ${
                activeTab === 'reading'
                  ? 'btn-amber'
                  : 'text-[var(--text-secondary)] border border-[var(--accent-primary)]/20 hover:border-[var(--accent-primary)]/40'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              阅读
            </button>
          </Tooltip>
          <Tooltip content="写作练习">
            <button
              onClick={() => setActiveTab('writing')}
              className={`px-8 py-3 rounded-full font-mono text-sm transition-all duration-500 flex items-center gap-2 ${
                activeTab === 'writing'
                  ? 'btn-amber'
                  : 'text-[var(--text-secondary)] border border-[var(--accent-primary)]/20 hover:border-[var(--accent-primary)]/40'
              }`}
            >
              <Pen className="w-4 h-4" />
              写作
            </button>
          </Tooltip>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'reading' ? (
            <motion.div
              key="reading"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <div className="liquid-glass rounded-[2rem] p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-[var(--accent-primary)]" />
                    <span className="font-serif text-xl gradient-text">阅读进度</span>
                  </div>
                  <span className="font-mono text-sm text-[var(--text-secondary)]">
                    {completedCount} / {totalCount} 已完?                  </span>
                </div>
                <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-primary)] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(completedCount / totalCount) * 100}%` }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
                  />
                </div>
              </div>

              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="搜索文章..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full liquid-glass rounded-[2rem] py-4 pl-12 pr-4 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono text-sm outline-none focus:border-[var(--accent-primary)]/30 transition-all duration-300"
                />
              </div>

              <div className="space-y-4">
                  {filteredArticles.map((article, index) => (
                    <motion.div
                      key={article.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] as const }}
                      className="liquid-glass rounded-[2rem] overflow-hidden card-liquid"
                    >
                      <Tooltip content="阅读全文">
                      <button
                        onClick={() => handleToggleArticle(article.id)}
                        className="w-full p-6 flex items-center gap-5 text-left"
                      >
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)]/20 to-[var(--accent-primary)]/10 flex items-center justify-center shrink-0">
                          <FileText className="w-7 h-7 text-[var(--accent-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif text-xl text-[var(--text-primary)] mb-2 truncate">
                            {article.title}
                            {article.completed && (
                              <CheckCircle className="w-4 h-4 text-[var(--success)] inline-block ml-2" />
                            )}
                          </h3>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono border ${difficultyBadgeColor[article.difficulty]}`}>
                              {difficultyLabel[article.difficulty]}
                            </span>
                            <span className="text-[var(--text-muted)] text-xs font-mono">
                              {article.wordCount} 词
                            </span>
                            <span className="text-[var(--text-muted)] text-xs font-mono">
                              {languageLabel[article.language]}
                            </span>
                          </div>
                        </div>
                        {expandedArticle === article.id ? (
                          <ChevronUp className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                        )}
                      </button>
                    </Tooltip>

                      <AnimatePresence>
                        {expandedArticle === article.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-2">
                              <div className="h-px bg-[var(--accent-primary)]/10 mb-6" />
                              <div className="prose prose-invert max-w-none">
                                {article.content.split('\n\n').map((paragraph, i) => (
                                  <p key={i} className="text-[var(--text-primary)]/80 leading-relaxed mb-4 font-serif text-base">
                                    {paragraph.trim()}
                                  </p>
                                ))}
                              </div>
                            </div>

                            <div className="px-6 pb-6">
                              <div className="h-px bg-[var(--accent-primary)]/10 mb-6" />
                              <div className="flex items-center gap-2 mb-6">
                                <Sparkles className="w-5 h-5 text-[var(--accent-primary)]" />
                                <h4 className="font-serif text-lg gradient-text">阅读理解</h4>
                              </div>

                              <div className="space-y-6">
                                {article.questions.map((q, qi) => (
                                  <div key={q.id}>
                                    <p className="text-[var(--text-primary)] font-serif text-base mb-3">
                                      {qi + 1}. {q.question}
                                    </p>
                                    <div className="space-y-2">
                                      {q.options.map((option, oi) => {
                                        const isSelected = articleAnswers[q.id] === oi
                                        const isSubmitted = submittedArticles[article.id]
                                        const isCorrect = oi === q.correct
                                        let optClass =
                                          'w-full text-left px-4 py-3 rounded-xl font-mono text-sm transition-all duration-300 '

                                        if (isSubmitted) {
                                          if (isCorrect) {
                                            optClass += 'bg-[var(--success)]/20 border border-[var(--success)]/30 text-[var(--success)]'
                                          } else if (isSelected) {
                                            optClass += 'bg-[var(--warning)]/20 border border-[var(--warning)]/30 text-[var(--warning)]'
                                          } else {
                                            optClass += 'text-[var(--text-muted)] border border-transparent'
                                          }
                                        } else if (isSelected) {
                                          optClass += 'liquid-glass-selected text-[var(--text-primary)]'
                                        } else {
                                          optClass += 'text-[var(--text-secondary)] border border-[var(--accent-primary)]/10 hover:border-[var(--accent-primary)]/30 hover:text-[var(--text-primary)]'
                                        }

                                        return (
                                          <button
                                            key={oi}
                                            onClick={() => handleSelectAnswer(q.id, oi)}
                                            disabled={isSubmitted}
                                            className={optClass}
                                          >
                                            <span className="text-[var(--text-muted)] mr-2">
                                              {String.fromCharCode(65 + oi)}.
                                            </span>
                                            {option}
                                            {isSubmitted && isCorrect && (
                                              <CheckCircle className="w-4 h-4 inline-block ml-2 text-[var(--success)]" />
                                            )}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {!submittedArticles[article.id] && (
                                <motion.button
                                  onClick={() => handleSubmitArticle(article.id)}
                                  disabled={!allQuestionsAnswered(article.id)}
                                  className="mt-6 btn-amber px-6 py-3 rounded-xl flex items-center gap-2 font-mono text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  提交答案
                                </motion.button>
                              )}

                              {submittedArticles[article.id] && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="mt-6 flex items-center gap-2 text-[var(--success)]"
                                >
                                  <CheckCircle className="w-5 h-5" />
                                  <span className="font-mono text-sm">
                                    {article.questions.every(
                                      (q) => articleAnswers[q.id] === q.correct
                                    )
                                      ? '全部回答正确'
                                      : '部分题目回答有误，请查看正确答案'}
                                  </span>
                                </motion.div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}

                  {filteredArticles.length === 0 && (
                    <EmptyState icon={<Search size={48} />} title="未找到匹配的文章" description="尝试调整搜索条件" />
                  )}
                </div>
            </motion.div>
          ) : (
            <motion.div
              key="writing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            >
              {!selectedPrompt ? (
                <div className="space-y-4">
                  <p className="text-[var(--text-secondary)] font-serif text-center mb-8">
                    选择一个写作题目开始练?                  </p>
                  {writingPrompts.map((prompt, index) => (
                    <motion.button
                      key={prompt.id}
                      onClick={() => handleSelectPrompt(prompt.id)}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] as const }}
                      className="w-full liquid-glass rounded-[2rem] p-6 text-left card-liquid"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)]/20 to-[var(--accent-primary)]/10 flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6 text-[var(--accent-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif text-xl text-[var(--text-primary)] mb-2">
                            {prompt.title}
                          </h3>
                          <p className="text-[var(--text-secondary)] text-sm font-serif mb-3 line-clamp-2">
                            {prompt.description}
                          </p>
                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono border ${difficultyBadgeColor[prompt.difficulty]}`}>
                              {difficultyLabel[prompt.difficulty]}
                            </span>
                            <span className="text-[var(--text-muted)] text-xs font-mono">
                              {languageLabel[prompt.language]}
                            </span>
                            <span className="text-[var(--text-muted)] text-xs font-mono">
                              ?{prompt.wordLimit} ?                            </span>
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-[var(--text-muted)] shrink-0 mt-1" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                >
                  <button
                    onClick={() => setSelectedPrompt(null)}
                    className="mb-6 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono text-sm transition-colors duration-300 flex items-center gap-2"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                    返回题目列表
                  </button>

                  <div className="liquid-glass rounded-[2rem] p-6 mb-6">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="w-5 h-5 text-[var(--accent-primary)]" />
                      <h3 className="font-serif text-xl text-[var(--text-primary)]">
                        {currentPrompt?.title}
                      </h3>
                    </div>
                    <p className="text-[var(--text-secondary)] text-sm font-serif ml-8 mb-3">
                      {currentPrompt?.description}
                    </p>
                    <div className="flex items-center gap-3 ml-8">
                      {currentPrompt && (
                        <>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono border ${difficultyBadgeColor[currentPrompt.difficulty]}`}>
                            {difficultyLabel[currentPrompt.difficulty]}
                          </span>
                          <span className="text-[var(--text-muted)] text-xs font-mono">
                            {languageLabel[currentPrompt.language]}
                          </span>
                          <span className="text-[var(--text-muted)] text-xs font-mono">
                            ?{currentPrompt.wordLimit} ?                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="liquid-glass rounded-[2rem] p-6 mb-6">
                    <textarea
                      value={writingText}
                      onChange={(e) => setWritingText(e.target.value)}
                      placeholder="在此开始写作..."
                      className="w-full h-64 bg-transparent text-[var(--text-primary)] font-serif text-base leading-relaxed outline-none resize-none placeholder:text-[var(--text-muted)]"
                    />
                    <div className="h-px bg-[var(--accent-primary)]/10 my-4" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm font-mono">
                        <span className="text-[var(--text-muted)]">
                          字数: <span className="text-[var(--text-secondary)]">{charCount}</span>
                        </span>
                        <span className="text-[var(--text-muted)]">
                          词数: <span className="text-[var(--text-secondary)]">{wordCount}</span>
                        </span>
                        {currentPrompt && (
                          <span className={`text-xs ${
                            wordCount > currentPrompt.wordLimit
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--text-muted)]'
                          }`}>
                            {wordCount > currentPrompt.wordLimit
                              ? `超出 ${wordCount - currentPrompt.wordLimit} 词`
                              : `还剩 ${currentPrompt.wordLimit - wordCount} 词`}
                          </span>
                        )}
                      </div>
                      <motion.button
                        onClick={handleSubmitWriting}
                        disabled={!writingText.trim() || isSubmitting}
                        className="btn-amber px-6 py-3 rounded-xl flex items-center gap-2 font-mono text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {isSubmitting ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              className="w-4 h-4 border-2 border-[var(--bg-primary)] border-t-transparent rounded-full"
                            />
                            批改?..
                          </>
                        ) : (
                          <>
                            <MessageSquare className="w-4 h-4" />
                            提交批改
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {writingFeedback && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                        className="liquid-glass rounded-[2rem] p-6"
                      >
                        <div className="flex items-center gap-2 mb-6">
                          <BarChart3 className="w-5 h-5 text-[var(--accent-primary)]" />
                          <h4 className="font-serif text-xl gradient-text">批改报告</h4>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-6">
                          {[
                            { label: '语法', score: writingFeedback.grammar, icon: CheckCircle },
                            { label: '词汇', score: writingFeedback.vocabulary, icon: Star },
                            { label: '结构', score: writingFeedback.structure, icon: BarChart3 },
                          ].map((item) => {
                            const Icon = item.icon
                            const color =
                              item.score < 70
                                ? 'text-[var(--warning)]'
                                : item.score < 85
                                ? 'text-[var(--accent-primary)]'
                                : 'text-[var(--success)]'
                            const bgColor =
                              item.score < 70
                                ? 'from-[var(--warning)]/20 to-[var(--warning)]/10'
                                : item.score < 85
                                ? 'from-[var(--accent-primary)]/20 to-[var(--accent-primary)]/10'
                                : 'from-[var(--success)]/20 to-[var(--success)]/10'
                            return (
                              <motion.div
                                key={item.label}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.1 }}
                                className={`liquid-glass rounded-xl p-4 text-center bg-gradient-to-br ${bgColor}`}
                              >
                                <Icon className={`w-5 h-5 mx-auto mb-2 ${color}`} />
                                <p className={`font-serif text-3xl font-bold ${color}`}>
                                  {item.score}
                                </p>
                                <p className="text-[var(--text-muted)] text-xs font-mono mt-1">
                                  {item.label}
                                </p>
                              </motion.div>
                            )
                          })}
                        </div>

                        <div className="liquid-glass rounded-xl p-5">
                          <div className="flex items-center gap-2 mb-4">
                            <MessageSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                            <span className="font-serif text-base text-[var(--text-primary)]">改进建议</span>
                          </div>
                          <ul className="space-y-2">
                            {writingFeedback.suggestions.map((suggestion, i) => (
                              <motion.li
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.3, delay: 0.2 + i * 0.1 }}
                                className="flex items-start gap-2 text-[var(--text-secondary)] text-sm font-serif"
                              >
                                <ArrowRight className="w-3.5 h-3.5 text-[var(--accent-primary)] mt-0.5 shrink-0" />
                                {suggestion}
                              </motion.li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
