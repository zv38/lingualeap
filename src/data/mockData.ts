
export interface User {
  id: string
  username: string
  email: string
  avatar?: string
  level: string
  createdAt: string
  xp: number
  totalXP: number
  streakDays: number
  longestStreak: number
  dailyGoal: number
  reminderTime: string
  theme: 'dark' | 'light' | 'system'
  language: 'zh' | 'en' | 'ja'
  followers: string[]
  following: string[]
  role: 'user' | 'admin'
  publicProgress?: boolean
  onlineStatus?: boolean
  allowFriendSearch?: boolean
  allowMessages?: boolean
  aiDataConsent?: boolean
  membership?: 'free' | 'basic' | 'pro'
  membershipType?: 'monthly' | 'yearly' | 'lifetime' | null
  membershipExpiresAt?: string | null
  membershipBoughtAt?: string | null
  membershipInfo?: MembershipInfo
  accountStatus?: 'normal' | 'watch' | 'restricted' | 'frozen' | 'banned'
}

export interface MembershipInfo {
  membership: 'free' | 'basic' | 'pro'
  type: 'monthly' | 'yearly' | 'lifetime' | null
  expiresAt: string | null
  boughtAt: string | null
  privileges: Record<string, unknown>
}

export interface Lesson {
  id: string
  title: string
  duration: number
  completed: boolean
  description?: string
}

export interface Course {
  id: string
  language: 'english' | 'japanese' | 'korean'
  level: 'beginner' | 'elementary' | 'intermediate' | 'advanced'
  title: string
  description: string
  coverImage: string
  lessons: Lesson[]
  progress: number
  category: 'pronunciation' | 'vocabulary' | 'grammar' | 'listening' | 'speaking' | 'reading' | 'writing' | 'culture' | 'exam'
  type?: string
  tags: string[]
  studentsCount: number
  totalDuration: number
  instructor: string
}

export interface Word {
  id: string
  term: string
  definition: string
  pronunciation: string
  example: string
  language: 'english' | 'japanese' | 'korean'
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface GrammarExercise {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  category: 'tense' | 'particle' | 'conjugation' | 'syntax'
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface ListeningExercise {
  id: string
  audioUrl: string
  question: string
  options: string[]
  correctAnswer: number
  transcript: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface SpeakingExercise {
  id: string
  text: string
  translation: string
  language: 'english' | 'japanese' | 'korean'
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt?: string
  xpReward: number
}

export interface Comment {
  id: string
  userId: string
  username: string
  content: string
  createdAt: string
}

export interface Post {
  id: string
  userId: string
  username: string
  avatar?: string
  content: string
  language: string
  likes: number
  comments: Comment[]
  createdAt: string
}

export interface StudyGroup {
  id: string
  name: string
  description: string
  members: string[]
  language: 'english' | 'japanese' | 'korean'
  createdAt: string
}

export interface DirectMessage {
  id: string
  senderId: string
  receiverId: string
  content: string
  createdAt: string
  read: boolean
}

export interface StudyHistory {
  id: string
  userId: string
  type: 'word' | 'grammar' | 'listening' | 'speaking'
  itemId: string
  completed: boolean
  score?: number
  duration: number
  date: string
}

export interface DailyChallenge {
  id: string
  date: string
  questions: (GrammarExercise | ListeningExercise)[]
  completed: boolean
  score: number
}

export interface BattleRoom {
  id: string
  player1: string
  player2?: string
  status: 'waiting' | 'playing' | 'finished'
  questions: GrammarExercise[]
  scores: Record<string, number>
}

export const mockCourses: Course[] = [
  {
    id: '1',
    language: 'english',
    level: 'beginner',
    title: '英语入门：ABC与基础词汇',
    description: '从零开始学习英语，掌握基础词汇和简单对话，建立语言学习的信心',
    coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=300&fit=crop',
    progress: 35,
    category: 'vocabulary',
    tags: ['基础', '词汇', '入门'],
    studentsCount: 2847,
    totalDuration: 69,
    instructor: 'Sarah Johnson',
    lessons: [
      { id: 'l1', title: '字母与发音', duration: 15, completed: true, description: '学习26个英文字母的标准发音' },
      { id: 'l2', title: '问候与自我介绍', duration: 20, completed: true, description: '掌握日常问候语和自我介绍的句型' },
      { id: 'l3', title: '数字与时间', duration: 18, completed: false, description: '学习数字表达和时间的说法' },
      { id: 'l4', title: '颜色与形状', duration: 16, completed: false, description: '掌握常见颜色和形状的英文表达' },
    ]
  },
  {
    id: '2',
    language: 'english',
    level: 'beginner',
    title: '英语发音训练',
    description: '系统学习英语音标和发音规则，纠正常见发音错误，说出地道英语',
    coverImage: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=300&fit=crop',
    progress: 0,
    category: 'pronunciation',
    tags: ['发音', '音标', '口语'],
    studentsCount: 1956,
    totalDuration: 85,
    instructor: 'Michael Chen',
    lessons: [
      { id: 'l1', title: '元音音标详解', duration: 20, completed: false, description: '学习20个英语元音的正确发音' },
      { id: 'l2', title: '辅音音标详解', duration: 25, completed: false, description: '掌握24个辅音的发音技巧' },
      { id: 'l3', title: '连读与弱读', duration: 22, completed: false, description: '学习自然语流中的连读和弱读规则' },
      { id: 'l4', title: '语调与重音', duration: 18, completed: false, description: '掌握英语句子的语调和重音模式' },
    ]
  },
  {
    id: '3',
    language: 'english',
    level: 'elementary',
    title: '初级英语：日常会话',
    description: '学习实用的日常英语表达，提高沟通能力，自信应对各种生活场景',
    coverImage: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=300&fit=crop',
    progress: 15,
    category: 'speaking',
    tags: ['会话', '日常', '实用'],
    studentsCount: 3210,
    totalDuration: 67,
    instructor: 'Sarah Johnson',
    lessons: [
      { id: 'l1', title: '购物用语', duration: 22, completed: false, description: '学习购物场景的常用表达' },
      { id: 'l2', title: '餐厅点餐', duration: 25, completed: false, description: '掌握餐厅点餐和交流的技巧' },
      { id: 'l3', title: '问路与指路', duration: 20, completed: false, description: '学会问路和给别人指路' },
    ]
  },
  {
    id: '4',
    language: 'english',
    level: 'elementary',
    title: '英语听力入门',
    description: '从慢速英语开始，逐步提升听力理解能力，适应不同语速和口音',
    coverImage: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=400&h=300&fit=crop',
    progress: 0,
    category: 'listening',
    tags: ['听力', '入门', '理解'],
    studentsCount: 1789,
    totalDuration: 90,
    instructor: 'Emily Watson',
    lessons: [
      { id: 'l1', title: '数字与字母听力', duration: 20, completed: false, description: '训练数字和字母的听力识别' },
      { id: 'l2', title: '短对话理解', duration: 25, completed: false, description: '理解日常简短对话的内容' },
      { id: 'l3', title: '公告与通知', duration: 22, completed: false, description: '听懂公共场所的广播和通知' },
      { id: 'l4', title: '简单故事听力', duration: 23, completed: false, description: '听懂简短的英语故事' },
    ]
  },
  {
    id: '5',
    language: 'english',
    level: 'intermediate',
    title: '中级英语：语法与写作',
    description: '系统梳理英语语法体系，提升写作能力，写出流畅地道的英文',
    coverImage: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&h=300&fit=crop',
    progress: 0,
    category: 'grammar',
    tags: ['语法', '写作', '进阶'],
    studentsCount: 2134,
    totalDuration: 110,
    instructor: 'Michael Chen',
    lessons: [
      { id: 'l1', title: '时态综合复习', duration: 30, completed: false, description: '全面复习英语12种时态的用法' },
      { id: 'l2', title: '从句与连接词', duration: 28, completed: false, description: '掌握名词性从句、定语从句和状语从句' },
      { id: 'l3', title: '被动语态与虚拟语气', duration: 25, completed: false, description: '学习被动语态和虚拟语气的用法' },
      { id: 'l4', title: '段落写作技巧', duration: 27, completed: false, description: '学习如何写出结构清晰的段落' },
    ]
  },
  {
    id: '6',
    language: 'english',
    level: 'advanced',
    title: '高级英语：商务沟通',
    description: '掌握职场英语沟通技巧，包括邮件写作、会议发言、商务谈判等',
    coverImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop',
    progress: 0,
    category: 'speaking',
    tags: ['商务', '职场', '沟通'],
    studentsCount: 1567,
    totalDuration: 120,
    instructor: 'Sarah Johnson',
    lessons: [
      { id: 'l1', title: '商务邮件写作', duration: 30, completed: false, description: '学习正式和半正式商务邮件的写法' },
      { id: 'l2', title: '会议发言技巧', duration: 35, completed: false, description: '掌握会议中的发言和讨论技巧' },
      { id: 'l3', title: '商务谈判英语', duration: 30, completed: false, description: '学习谈判中的专业表达和策略' },
      { id: 'l4', title: '演讲与演示', duration: 25, completed: false, description: '提升英语演讲和演示的能力' },
    ]
  },
  {
    id: '7',
    language: 'japanese',
    level: 'beginner',
    title: '日语入门：五十音图',
    description: '学习平假名和片假名，掌握日语发音基础，开启日语学习之旅',
    coverImage: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=300&fit=crop',
    progress: 60,
    category: 'pronunciation',
    tags: ['五十音', '假名', '入门'],
    studentsCount: 4567,
    totalDuration: 105,
    instructor: '田中 美咲',
    lessons: [
      { id: 'l1', title: 'あ行～さ行', duration: 25, completed: true, description: '学习あいうえお到さしすせそ的发音和书写' },
      { id: 'l2', title: 'た行～な行', duration: 25, completed: true, description: '学习たちつてと到なにぬねの的发音和书写' },
      { id: 'l3', title: 'は行～わ行', duration: 25, completed: false, description: '学习はひふへほ到わをん的发音和书写' },
      { id: 'l4', title: '片假名入门', duration: 30, completed: false, description: '学习片假名的发音和书写规则' },
    ]
  },
  {
    id: '8',
    language: 'japanese',
    level: 'beginner',
    title: '日语汉字入门',
    description: '学习常用日语汉字的读音和写法，掌握汉字在日语中的独特用法',
    coverImage: 'https://images.unsplash.com/photo-1529255484355-cb73c33c04bb?w=400&h=300&fit=crop',
    progress: 0,
    category: 'vocabulary',
    tags: ['汉字', '词汇', '书写'],
    studentsCount: 3245,
    totalDuration: 95,
    instructor: '佐藤 健一',
    lessons: [
      { id: 'l1', title: '数字与方向汉字', duration: 22, completed: false, description: '学习数字和方位相关的常用汉字' },
      { id: 'l2', title: '自然与天气汉字', duration: 25, completed: false, description: '掌握自然现象和天气相关的汉字' },
      { id: 'l3', title: '学校与生活汉字', duration: 24, completed: false, description: '学习校园和日常生活相关的汉字' },
      { id: 'l4', title: '音读与训读规则', duration: 24, completed: false, description: '理解汉字音读和训读的区别和规律' },
    ]
  },
  {
    id: '9',
    language: 'japanese',
    level: 'elementary',
    title: '初级日语：日常会话',
    description: '学习实用的日语日常表达，掌握基本的语法结构，进行简单交流',
    coverImage: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=300&fit=crop',
    progress: 0,
    category: 'speaking',
    tags: ['会话', '日常', '实用'],
    studentsCount: 2890,
    totalDuration: 80,
    instructor: '田中 美咲',
    lessons: [
      { id: 'l1', title: '自我介绍与寒暄', duration: 20, completed: false, description: '学习日语的自我介绍和日常寒暄' },
      { id: 'l2', title: '购物与点餐', duration: 22, completed: false, description: '掌握购物和餐厅点餐的表达' },
      { id: 'l3', title: '交通与问路', duration: 20, completed: false, description: '学习乘坐交通工具和问路的说法' },
      { id: 'l4', title: '邀请与约定', duration: 18, completed: false, description: '学会发出邀请和约定时间' },
    ]
  },
  {
    id: '10',
    language: 'japanese',
    level: 'intermediate',
    title: '中级日语：语法进阶',
    description: '深入学习日语语法体系，掌握更复杂的表达方式和句型结构',
    coverImage: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=400&h=300&fit=crop',
    progress: 0,
    category: 'grammar',
    tags: ['语法', '进阶', '句型'],
    studentsCount: 1987,
    totalDuration: 100,
    instructor: '佐藤 健一',
    lessons: [
      { id: 'l1', title: 'て形与た形', duration: 30, completed: false, description: '学习动词て形和た形的变形规则' },
      { id: 'l2', title: '可能形与被动形', duration: 35, completed: false, description: '掌握可能形和被动的用法' },
      { id: 'l3', title: '使役形与条件形', duration: 35, completed: false, description: '学习使役形和条件形的表达' },
    ]
  },
  {
    id: '11',
    language: 'japanese',
    level: 'intermediate',
    title: '日语阅读训练',
    description: '通过阅读各类日语文章，提升阅读理解能力和词汇量',
    coverImage: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=300&fit=crop',
    progress: 0,
    category: 'reading',
    tags: ['阅读', '理解', '文章'],
    studentsCount: 1456,
    totalDuration: 90,
    instructor: '田中 美咲',
    lessons: [
      { id: 'l1', title: '短篇新闻阅读', duration: 22, completed: false, description: '阅读简短的日语新闻文章' },
      { id: 'l2', title: '散文与随笔', duration: 25, completed: false, description: '欣赏日语散文和随笔作品' },
      { id: 'l3', title: '实用邮件阅读', duration: 20, completed: false, description: '学习阅读日语邮件和通知' },
      { id: 'l4', title: '小说节选阅读', duration: 23, completed: false, description: '阅读日语小说的精彩节选' },
    ]
  },
  {
    id: '12',
    language: 'japanese',
    level: 'advanced',
    title: '高级日语：新闻与写作',
    description: '读懂日语新闻，提升书面表达能力，达到高级日语水平',
    coverImage: 'https://images.unsplash.com/photo-1504711434969-e33886168d8c?w=400&h=300&fit=crop',
    progress: 0,
    category: 'writing',
    tags: ['新闻', '写作', '高级'],
    studentsCount: 987,
    totalDuration: 115,
    instructor: '佐藤 健一',
    lessons: [
      { id: 'l1', title: '新闻标题解读', duration: 25, completed: false, description: '学习日语新闻标题的特点和解读技巧' },
      { id: 'l2', title: '社论与评论', duration: 30, completed: false, description: '阅读日语社论和评论文章' },
      { id: 'l3', title: '小论文写作', duration: 35, completed: false, description: '学习日语小论文的写作方法' },
      { id: 'l4', title: '研究报告写作', duration: 25, completed: false, description: '掌握日语研究报告的写作规范' },
    ]
  },
  {
    id: '13',
    language: 'korean',
    level: 'beginner',
    title: '韩语入门：Hangul',
    description: '学习韩文字母Hangul，掌握韩语发音规则，轻松开启韩语学习',
    coverImage: 'https://images.unsplash.com/photo-1538485399081-7191377e8231?w=400&h=300&fit=crop',
    progress: 80,
    category: 'pronunciation',
    tags: ['韩文', '字母', '入门'],
    studentsCount: 3890,
    totalDuration: 85,
    instructor: '박지민',
    lessons: [
      { id: 'l1', title: '辅音与元音', duration: 20, completed: true, description: '学习韩语基本辅音和元音的发音' },
      { id: 'l2', title: '音节组合', duration: 22, completed: true, description: '掌握辅音和元音组合成音节的方法' },
      { id: 'l3', title: '收音规则', duration: 25, completed: true, description: '学习韩语收音（韵尾）的发音规则' },
      { id: 'l4', title: '基础问候', duration: 18, completed: false, description: '学习韩语的基础问候表达' },
    ]
  },
  {
    id: '14',
    language: 'korean',
    level: 'beginner',
    title: '韩语发音训练',
    description: '系统训练韩语发音，掌握连音、紧音、送气音等核心发音规则',
    coverImage: 'https://images.unsplash.com/photo-1525648199074-cee30ba79a4a?w=400&h=300&fit=crop',
    progress: 0,
    category: 'pronunciation',
    tags: ['发音', '训练', '口语'],
    studentsCount: 2345,
    totalDuration: 75,
    instructor: '김수진',
    lessons: [
      { id: 'l1', title: '紧音与送气音', duration: 20, completed: false, description: '学习韩语紧音和送气音的发音区别' },
      { id: 'l2', title: '连音规则', duration: 18, completed: false, description: '掌握韩语连音的发音规则' },
      { id: 'l3', title: '同化现象', duration: 20, completed: false, description: '学习韩语中的同化发音现象' },
      { id: 'l4', title: '语调与节奏', duration: 17, completed: false, description: '掌握韩语句子的语调和节奏' },
    ]
  },
  {
    id: '15',
    language: 'korean',
    level: 'elementary',
    title: '初级韩语：日常用语',
    description: '学习实用的韩语日常会话，掌握基础语法，畅游韩国无障碍',
    coverImage: 'https://images.unsplash.com/photo-1534274988757-a28bf1a00c0c?w=400&h=300&fit=crop',
    progress: 0,
    category: 'speaking',
    tags: ['会话', '日常', '旅行'],
    studentsCount: 2678,
    totalDuration: 70,
    instructor: '박지민',
    lessons: [
      { id: 'l1', title: '自我介绍', duration: 20, completed: false, description: '学习韩语的自我介绍表达' },
      { id: 'l2', title: '购物与砍价', duration: 28, completed: false, description: '掌握购物场景的韩语表达' },
      { id: 'l3', title: '餐厅与美食', duration: 22, completed: false, description: '学习餐厅点餐和美食相关的韩语' },
    ]
  },
  {
    id: '16',
    language: 'korean',
    level: 'elementary',
    title: '韩语听力训练',
    description: '通过多样化的听力材料，提升韩语听力理解能力和反应速度',
    coverImage: 'https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=400&h=300&fit=crop',
    progress: 0,
    category: 'listening',
    tags: ['听力', '训练', '理解'],
    studentsCount: 1567,
    totalDuration: 80,
    instructor: '김수진',
    lessons: [
      { id: 'l1', title: '日常对话听力', duration: 20, completed: false, description: '训练日常韩语对话的听力理解' },
      { id: 'l2', title: '广播与公告', duration: 22, completed: false, description: '听懂韩语广播和公共场所的公告' },
      { id: 'l3', title: '韩剧片段听力', duration: 20, completed: false, description: '通过韩剧片段提升听力水平' },
      { id: 'l4', title: '新闻简讯听力', duration: 18, completed: false, description: '听懂简短的韩语新闻' },
    ]
  },
  {
    id: '17',
    language: 'korean',
    level: 'intermediate',
    title: '中级韩语：语法进阶',
    description: '深入学习韩语语法体系，掌握敬语、连接词尾等核心语法点',
    coverImage: 'https://images.unsplash.com/photo-1511911063855-2bf8e8275fb2?w=400&h=300&fit=crop',
    progress: 0,
    category: 'grammar',
    tags: ['语法', '进阶', '敬语'],
    studentsCount: 1876,
    totalDuration: 100,
    instructor: '박지민',
    lessons: [
      { id: 'l1', title: '敬语体系详解', duration: 30, completed: false, description: '学习韩语的敬语体系和用法' },
      { id: 'l2', title: '连接词尾与转折', duration: 25, completed: false, description: '掌握各种连接词尾的用法' },
      { id: 'l3', title: '间接引语', duration: 22, completed: false, description: '学习韩语的间接引语表达' },
      { id: 'l4', title: '使动与被动态', duration: 23, completed: false, description: '掌握使动和被动的表达方式' },
    ]
  },
  {
    id: '18',
    language: 'korean',
    level: 'advanced',
    title: '高级韩语：TOPIK备考',
    description: '针对TOPIK考试进行系统训练，全面提升听力、阅读、写作能力',
    coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=300&fit=crop',
    progress: 0,
    category: 'exam',
    tags: ['TOPIK', '考试', '备考'],
    studentsCount: 1234,
    totalDuration: 130,
    instructor: '김수진',
    lessons: [
      { id: 'l1', title: 'TOPIK听力技巧', duration: 35, completed: false, description: '学习TOPIK听力的解题技巧' },
      { id: 'l2', title: 'TOPIK阅读策略', duration: 35, completed: false, description: '掌握TOPIK阅读的答题策略' },
      { id: 'l3', title: 'TOPIK写作模板', duration: 30, completed: false, description: '学习TOPIK写作的常用模板' },
      { id: 'l4', title: '模拟试题精讲', duration: 30, completed: false, description: '通过模拟试题巩固所学知识' },
    ]
  }
]

export const mockWords: Word[] = [
  { id: 'w1', term: 'Hello', definition: '你好', pronunciation: '/həˈloʊ/', example: 'Hello, nice to meet you!', language: 'english', difficulty: 'easy' },
  { id: 'w2', term: 'Thank you', definition: '谢谢', pronunciation: '/θæŋk juː/', example: 'Thank you for your help!', language: 'english', difficulty: 'easy' },
  { id: 'w3', term: 'Goodbye', definition: '再见', pronunciation: '/ɡʊdˈbaɪ/', example: 'Goodbye, see you tomorrow!', language: 'english', difficulty: 'easy' },
  { id: 'w4', term: 'Please', definition: '请', pronunciation: '/pliːz/', example: 'Please sit down.', language: 'english', difficulty: 'easy' },
  { id: 'w5', term: 'Sorry', definition: '对不起', pronunciation: '/ˈsɑːri/', example: 'Sorry, I\'m late.', language: 'english', difficulty: 'easy' },
  { id: 'w6', term: 'こんにちは', definition: '你好', pronunciation: 'konnichiwa', example: 'こんにちは、元気ですか？', language: 'japanese', difficulty: 'easy' },
  { id: 'w7', term: 'ありがとう', definition: '谢谢', pronunciation: 'arigatou', example: 'ありがとうございます！', language: 'japanese', difficulty: 'easy' },
  { id: 'w8', term: '안녕하세요', definition: '你好', pronunciation: 'annyeonghaseyo', example: '안녕하세요, 반갑습니다!', language: 'korean', difficulty: 'easy' },
  { id: 'w9', term: 'Serendipity', definition: '意外发现珍宝的运气', pronunciation: '/ˌserənˈdɪpəti/', example: 'Meeting you was pure serendipity.', language: 'english', difficulty: 'hard' },
  { id: 'w10', term: 'Ephemeral', definition: '短暂的', pronunciation: '/ɪˈfemərəl/', example: 'Life is ephemeral.', language: 'english', difficulty: 'hard' },
]

export const mockGrammarExercises: GrammarExercise[] = [
  {
    id: 'g1',
    question: 'I ___ to school every day.',
    options: ['go', 'goes', 'going', 'went'],
    correctAnswer: 0,
    explanation: '一般现在时，主语是I，用动词原形go。',
    category: 'tense',
    difficulty: 'easy'
  },
  {
    id: 'g2',
    question: 'She ___ a book now.',
    options: ['read', 'reads', 'is reading', 'reading'],
    correctAnswer: 2,
    explanation: '现在进行时，用be + doing结构，she用is。',
    category: 'tense',
    difficulty: 'easy'
  },
  {
    id: 'g3',
    question: 'They ___ football yesterday.',
    options: ['play', 'plays', 'played', 'playing'],
    correctAnswer: 2,
    explanation: '一般过去时，动词用过去式played。',
    category: 'tense',
    difficulty: 'easy'
  },
  {
    id: 'g4',
    question: '私は日本語 ___ 勉強しています。',
    options: ['を', 'が', 'は', 'に'],
    correctAnswer: 0,
    explanation: 'を表示动作的对象。',
    category: 'particle',
    difficulty: 'medium'
  },
  {
    id: 'g5',
    question: 'If I ___ rich, I would travel the world.',
    options: ['am', 'was', 'were', 'be'],
    correctAnswer: 2,
    explanation: '虚拟语气中，be动词统一用were。',
    category: 'tense',
    difficulty: 'hard'
  },
  {
    id: 'g6',
    question: 'By next year, I ___ my degree.',
    options: ['will finish', 'will have finished', 'finish', 'have finished'],
    correctAnswer: 1,
    explanation: '将来完成时，表示到将来某时已完成。',
    category: 'tense',
    difficulty: 'hard'
  },
  {
    id: 'g7',
    question: '___ you study harder, you will pass the exam.',
    options: ['If', 'Unless', 'Although', 'Because'],
    correctAnswer: 0,
    explanation: 'If引导条件状语从句。',
    category: 'syntax',
    difficulty: 'easy'
  },
  {
    id: 'g8',
    question: 'The book ___ I bought yesterday is very interesting.',
    options: ['who', 'which', 'whom', 'whose'],
    correctAnswer: 1,
    explanation: 'which引导定语从句修饰物。',
    category: 'syntax',
    difficulty: 'medium'
  },
  {
    id: 'g9',
    question: 'Not only ___ speak English, but he also speaks French.',
    options: ['he does', 'does he', 'he can', 'can he'],
    correctAnswer: 1,
    explanation: 'Not only置于句首需倒装。',
    category: 'syntax',
    difficulty: 'hard'
  },
  {
    id: 'g10',
    question: '私の趣味は音楽___聞くことです。',
    options: ['を', 'が', 'は', 'に'],
    correctAnswer: 0,
    explanation: 'を表示动作对象。',
    category: 'particle',
    difficulty: 'easy'
  },
]

export const mockListeningExercises: ListeningExercise[] = [
  {
    id: 'lst1',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    question: 'What is the weather like?',
    options: ['Sunny', 'Rainy', 'Cloudy', 'Snowy'],
    correctAnswer: 0,
    transcript: 'It\'s a beautiful sunny day today!',
    difficulty: 'easy'
  },
  {
    id: 'lst2',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    question: 'What time is the meeting?',
    options: ['2 PM', '3 PM', '4 PM', '5 PM'],
    correctAnswer: 1,
    transcript: 'The meeting will start at 3 PM.',
    difficulty: 'easy'
  },
  {
    id: 'lst3',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    question: 'Where does the conversation take place?',
    options: ['At a restaurant', 'At a hotel', 'At an airport', 'At a hospital'],
    correctAnswer: 2,
    transcript: 'May I see your passport and boarding pass, please?',
    difficulty: 'medium'
  },
  {
    id: 'lst4',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    question: 'What does the speaker want to order?',
    options: ['Coffee', 'Tea', 'Juice', 'Water'],
    correctAnswer: 0,
    transcript: 'I\'d like a cup of coffee, please.',
    difficulty: 'easy'
  },
  {
    id: 'lst5',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    question: 'What is the main topic?',
    options: ['Technology', 'Environment', 'Education', 'Health'],
    correctAnswer: 2,
    transcript: 'Today we will discuss the importance of education in modern society.',
    difficulty: 'medium'
  },
]

export const mockSpeakingExercises: SpeakingExercise[] = [
  {
    id: 's1',
    text: 'Hello, how are you today?',
    translation: '你好，今天过得怎么样？',
    language: 'english',
    difficulty: 'easy'
  },
  {
    id: 's2',
    text: 'The quick brown fox jumps over the lazy dog.',
    translation: '敏捷的棕色狐狸跳过懒惰的狗。',
    language: 'english',
    difficulty: 'medium'
  },
  {
    id: 's3',
    text: 'こんにちは、お元気ですか？',
    translation: '你好，身体好吗？',
    language: 'japanese',
    difficulty: 'easy'
  },
  {
    id: 's4',
    text: '안녕하세요, 만나서 반갑습니다.',
    translation: '你好，很高兴见到你。',
    language: 'korean',
    difficulty: 'easy'
  },
  {
    id: 's5',
    text: 'Could you please help me with this?',
    translation: '你能帮我一下吗？',
    language: 'english',
    difficulty: 'easy'
  },
  {
    id: 's6',
    text: 'I would like to make a reservation.',
    translation: '我想预约。',
    language: 'english',
    difficulty: 'medium'
  },
  {
    id: 's7',
    text: 'お疲れ様です。',
    translation: '辛苦了。',
    language: 'japanese',
    difficulty: 'easy'
  },
]

export const mockAchievements: Achievement[] = [
  { id: 'a1', title: '初学者', description: '完成第一节课', icon: 'star', unlocked: true, unlockedAt: '2024-01-15', xpReward: 50 },
  { id: 'a2', title: '学习达人', description: '连续学习7天', icon: 'flame', unlocked: true, unlockedAt: '2024-01-22', xpReward: 100 },
  { id: 'a3', title: '词汇大师', description: '掌握100个单词', icon: 'book-open', unlocked: false, xpReward: 200 },
  { id: 'a4', title: '语法达人', description: '完成50道语法题', icon: 'lightbulb', unlocked: false, xpReward: 150 },
  { id: 'a5', title: '社区明星', description: '发布10条动态', icon: 'message-circle', unlocked: false, xpReward: 100 },
  { id: 'a6', title: '语言通', description: '解锁3门语言', icon: 'globe', unlocked: false, xpReward: 300 },
  { id: 'a7', title: '听力专家', description: '完成20道听力题', icon: 'headphones', unlocked: false, xpReward: 150 },
  { id: 'a8', title: '口语达人', description: '完成10次口语练习', icon: 'mic', unlocked: false, xpReward: 150 },
]

export const mockPosts: Post[] = [
  {
    id: 'p1',
    userId: 'u1',
    username: '学习小王子',
    content: '今天终于完成了日语五十音图的学习！虽然花了不少时间，但很有成就感。继续加油！💪',
    language: 'japanese',
    likes: 24,
    comments: [
      { id: 'c1', userId: 'u2', username: '日语爱好者', content: '恭喜！五十音图是基础，加油！', createdAt: '2024-02-20T10:30:00Z' }
    ],
    createdAt: '2024-02-20T09:15:00Z'
  },
  {
    id: 'p2',
    userId: 'u3',
    username: 'K-pop迷',
    content: '终于学会用韩语点咖啡了！"아이스 아메리카노 주세요" ☕ 去韩国旅游终于不怕啦～',
    language: 'korean',
    likes: 45,
    comments: [
      { id: 'c2', userId: 'u4', username: '韩语小白', content: '太厉害了！我也要学这个', createdAt: '2024-02-19T15:20:00Z' },
      { id: 'c3', userId: 'u5', username: '旅行达人', content: '实用！收藏了', createdAt: '2024-02-19T16:45:00Z' }
    ],
    createdAt: '2024-02-19T14:00:00Z'
  },
  {
    id: 'p3',
    userId: 'u6',
    username: '英语学霸',
    content: '分享一个背单词的小技巧：每天早上起床后和晚上睡觉前各背10个，记忆效果超棒！大家可以试试～',
    language: 'english',
    likes: 89,
    comments: [],
    createdAt: '2024-02-18T21:30:00Z'
  }
]

export const mockStudyGroups: StudyGroup[] = [
  { id: 'sg1', name: '日语学习小组', description: '一起攻克N1！', members: ['u1', 'u2', 'u3'], language: 'japanese', createdAt: '2024-01-01' },
  { id: 'sg2', name: '韩语爱好者', description: '韩剧原声学习', members: ['u3', 'u4'], language: 'korean', createdAt: '2024-01-15' },
  { id: 'sg3', name: '英语角', description: '每日英语口语练习', members: ['u6', 'u5', 'u1'], language: 'english', createdAt: '2024-02-01' },
]

export const mockDirectMessages: DirectMessage[] = [
  { id: 'dm1', senderId: 'u2', receiverId: 'u0', content: '你好！一起学习日语吗？', createdAt: '2024-02-20T10:00:00Z', read: false },
  { id: 'dm2', senderId: 'u0', receiverId: 'u2', content: '好啊！一起加油！', createdAt: '2024-02-20T10:05:00Z', read: true },
]

export const mockStudyHistory: StudyHistory[] = [
  { id: 'h1', userId: 'u0', type: 'word', itemId: 'w1', completed: true, score: 100, duration: 5, date: '2024-02-20' },
  { id: 'h2', userId: 'u0', type: 'grammar', itemId: 'g1', completed: true, score: 100, duration: 3, date: '2024-02-20' },
  { id: 'h3', userId: 'u0', type: 'listening', itemId: 'lst1', completed: true, score: 100, duration: 8, date: '2024-02-19' },
  { id: 'h4', userId: 'u0', type: 'word', itemId: 'w2', completed: true, score: 100, duration: 4, date: '2024-02-19' },
  { id: 'h5', userId: 'u0', type: 'grammar', itemId: 'g2', completed: false, duration: 2, date: '2024-02-18' },
]

export const mockUser: User = {
  id: 'u0',
  username: '语言学习者',
  email: 'learner@example.com',
  level: 'beginner',
  createdAt: '2024-01-10T00:00:00Z',
  xp: 1250,
  totalXP: 3000,
  streakDays: 7,
  longestStreak: 14,
  dailyGoal: 30,
  reminderTime: '09:00',
  theme: 'dark',
  language: 'zh',
  followers: ['u1', 'u2'],
  following: ['u1', 'u3', 'u6'],
  role: 'user'
}

export const mockAdmin: User = {
  id: 'admin-1',
  username: '系统管理员',
  email: '[已脱敏]',
  level: 'advanced',
  createdAt: '2024-01-01T00:00:00Z',
  xp: 99999,
  totalXP: 99999,
  streakDays: 365,
  longestStreak: 365,
  dailyGoal: 60,
  reminderTime: '08:00',
  theme: 'light',
  language: 'zh',
  followers: [],
  following: [],
  role: 'admin'
}

export const mockProgress = {
  totalWordsLearned: 45,
  totalLessonsCompleted: 8,
  totalStudyTime: 320,
  streak: 7,
  weeklyData: [
    { day: '周一', minutes: 45 },
    { day: '周二', minutes: 60 },
    { day: '周三', minutes: 30 },
    { day: '周四', minutes: 50 },
    { day: '周五', minutes: 65 },
    { day: '周六', minutes: 40 },
    { day: '周日', minutes: 30 },
  ],
  streakCalendar: [
    { date: '2024-02-14', studied: true, minutes: 30 },
    { date: '2024-02-15', studied: true, minutes: 45 },
    { date: '2024-02-16', studied: true, minutes: 60 },
    { date: '2024-02-17', studied: true, minutes: 25 },
    { date: '2024-02-18', studied: true, minutes: 40 },
    { date: '2024-02-19', studied: true, minutes: 55 },
    { date: '2024-02-20', studied: true, minutes: 35 },
    { date: '2024-02-21', studied: false, minutes: 0 },
  ]
}

export const generateDailyChallenge = (): DailyChallenge => {
  const allQuestions = [...mockGrammarExercises, ...mockListeningExercises]
  const shuffled = allQuestions.sort(() => 0.5 - Math.random())
  return {
    id: `dc-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    questions: shuffled.slice(0, 5),
    completed: false,
    score: 0
  }
}

export interface SRSWord extends Word {
  box: 0 | 1 | 2 | 3 | 4
  nextReview: string
  reviewCount: number
  ease: number
  interval: number
}

export function generateWords(count: number): Word[] {
  return mockWords.slice(0, count).map((w, i) => ({
    ...w,
    id: `srs-${Date.now()}-${i}`,
  }))
}

export function generateSRSReview(): SRSWord[] {
  return []
}
