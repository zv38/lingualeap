export interface FAQItem {
  keywords: string[]
  question: string
  answer: string
  category: 'navigation' | 'feature' | 'learning' | 'account' | 'bug'
  actions?: { label: string; type: 'navigate' | 'submit'; payload: string }[]
}

const faqList: FAQItem[] = [
  {
    keywords: ['开始', '学习', '怎么', '如何', '入门', '新手'],
    question: '怎么开始学习？',
    answer: '点击导航栏的「课程学习」即可查看所有课程，选择你感兴趣的语言和难度开始学习吧！',
    category: 'navigation',
    actions: [{ label: '去选课', type: 'navigate', payload: '/courses' }],
  },
  {
    keywords: ['课程', '选择', '语言', '英语', '日语', '韩语'],
    question: '有哪些课程？',
    answer: '平台支持英语、日语、韩语三种语言，每种语言从初级到高级都有丰富的课程内容。',
    category: 'navigation',
    actions: [{ label: '查看课程', type: 'navigate', payload: '/courses' }],
  },
  {
    keywords: ['每日', '挑战', 'daily'],
    question: '每日挑战在哪里？',
    answer: '点击导航栏的「每日挑战」即可参与。每天5道题目，完成后可获得经验值奖励！',
    category: 'navigation',
    actions: [{ label: '去挑战', type: 'navigate', payload: '/daily' }],
  },
  {
    keywords: ['对战', 'battle', '比赛', 'pk'],
    question: '对战模式怎么玩？',
    answer: '进入「对战」页面，创建房间或加入别人的房间，与其它学习者实时比拼答题速度和准确率！',
    category: 'feature',
    actions: [{ label: '去对战', type: 'navigate', payload: '/battle' }],
  },
  {
    keywords: ['进度', '统计', '学习进度', '进展', '数据'],
    question: '学习进度怎么看？',
    answer: '在「学习进度」页面可以查看你的学习统计数据，包括已学课程、掌握词汇量、学习时长等。',
    category: 'feature',
    actions: [{ label: '查看进度', type: 'navigate', payload: '/progress' }],
  },
  {
    keywords: ['社区', '交流', '帖子', '动态', 'social'],
    question: '社区怎么使用？',
    answer: '在「社区」页面可以查看其他学习者的分享，发布自己的学习动态，与大家互动交流！',
    category: 'feature',
    actions: [{ label: '去社区', type: 'navigate', payload: '/community' }],
  },
  {
    keywords: ['成就', '徽章', '勋章', '解锁'],
    question: '成就系统是什么？',
    answer: '完成特定学习目标即可解锁成就徽章，在「成就」页面可以查看所有可获得的成就。',
    category: 'feature',
    actions: [{ label: '查看成就', type: 'navigate', payload: '/achievements' }],
  },
  {
    keywords: ['单词', '背词', '词汇', '记忆', '复习', 'srs'],
    question: '背单词有什么技巧？',
    answer: '使用「单词本」功能，系统会通过SRS间隔重复算法帮你高效记忆单词。建议每天坚持复习！',
    category: 'learning',
    actions: [{ label: '去背单词', type: 'navigate', payload: '/learn/vocabulary' }],
  },
  {
    keywords: ['语音', '口语', '发音', '练习', 'speak'],
    question: '语音练习怎么用？',
    answer: '在「语音练习」页面，跟读标准发音并获取AI评分反馈，帮你改善发音准确度。',
    category: 'learning',
    actions: [{ label: '去练习', type: 'navigate', payload: '/voice-practice' }],
  },
  {
    keywords: ['阅读', '写作', '读写', '练习'],
    question: '阅读写作练习有哪些内容？',
    answer: '「阅读写作」模块提供精选文章和写作题目，帮助你提升读写综合能力。',
    category: 'learning',
    actions: [{ label: '去练习', type: 'navigate', payload: '/reading-writing' }],
  },
  {
    keywords: ['计划', '规划', '学习计划', '目标'],
    question: '如何制定学习计划？',
    answer: '在「学习计划」页面可以设定每日学习目标和提醒时间，系统会帮你规划学习路径。',
    category: 'feature',
    actions: [{ label: '制定计划', type: 'navigate', payload: '/planner' }],
  },
  {
    keywords: ['密码', '修改', '重置', '账号'],
    question: '如何修改密码？',
    answer: '在「安全设置」页面可以修改密码和管理账号安全选项。',
    category: 'account',
    actions: [{ label: '去设置', type: 'navigate', payload: '/security' }],
  },
  {
    keywords: ['隐私', '设置', '个人信息', '可见'],
    question: '隐私设置在哪里？',
    answer: '在「隐私设置」页面可以管理你的个人资料可见性、在线状态、好友搜索等隐私选项。',
    category: 'account',
    actions: [{ label: '去设置', type: 'navigate', payload: '/privacy-settings' }],
  },
  {
    keywords: ['反馈', 'bug', '问题', '提交', '报告'],
    question: '如何提交反馈？',
    answer: '点击右下角的Bug图标，进入「Bug反馈」页面，填写问题描述后提交，我们会尽快处理。',
    category: 'bug',
    actions: [{ label: '去反馈', type: 'navigate', payload: '/bug-report' }],
  },
  {
    keywords: ['处理', '进度', '反馈记录', '状态'],
    question: '反馈多久能处理？',
    answer: '我们通常会在24-48小时内处理反馈。你可以在「反馈记录」中查看最新处理状态。',
    category: 'bug',
    actions: [{ label: '查看记录', type: 'navigate', payload: '/bug-history' }],
  },
  {
    keywords: ['等级', '经验', 'xp', '升级'],
    question: '等级和经验值是什么？',
    answer: '完成课程、每日挑战、对战等都可以获得经验值(XP)。积累XP可以提升等级，解锁更多内容！',
    category: 'feature',
  },
  {
    keywords: ['通知', '消息', '提醒'],
    question: '通知怎么管理？',
    answer: '在「通知设置」页面可以管理各类通知的开关，包括学习提醒、成就通知等。',
    category: 'account',
    actions: [{ label: '去设置', type: 'navigate', payload: '/notification-settings' }],
  },
  {
    keywords: ['好友', '添加', '关注', 'follow'],
    question: '怎么添加好友？',
    answer: '在「社区」页面可以关注其他学习者，也可以搜索用户名添加好友。',
    category: 'feature',
    actions: [{ label: '去社区', type: 'navigate', payload: '/community' }],
  },
  {
    keywords: ['排行', '榜', 'leaderboard', '排名'],
    question: '排行榜在哪里？',
    answer: '在「排行榜」页面可以查看学习时长排名，与其他学习者良性竞争！',
    category: 'feature',
    actions: [{ label: '查看排行', type: 'navigate', payload: '/leaderboard' }],
  },
]

export const quickQuestions = [
  faqList[0],
  faqList[1],
  faqList[13],
  faqList[2],
]

export function matchFAQ(input: string): FAQItem | null {
  const normalized = input.toLowerCase()
  let bestMatch: FAQItem | null = null
  let bestScore = 0

  for (const item of faqList) {
    const hits = item.keywords.filter(kw => normalized.includes(kw.toLowerCase()))
    const score = hits.length / item.keywords.length
    if (score > 0.3 && (score > bestScore || (score === bestScore && item.keywords.length > (bestMatch?.keywords.length || 0)))) {
      bestMatch = item
      bestScore = score
    }
  }

  return bestMatch
}

export function getFAQAnswer(input: string): FAQItem | null {
  return matchFAQ(input)
}

const bugKeywords = ['bug', '错误', '问题', '坏了', '不行', '异常', '失败', '报错', '崩溃', '卡顿', '加载不出来', 'bug', 'bug']

export function detectBugIntent(input: string): boolean {
  const normalized = input.toLowerCase()
  return bugKeywords.some(kw => normalized.includes(kw.toLowerCase()))
}