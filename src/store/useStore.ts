import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  User, MembershipInfo, Course, Word, GrammarExercise, ListeningExercise, SpeakingExercise,
  Achievement, Post, Comment, StudyGroup, DirectMessage, StudyHistory,
  DailyChallenge, BattleRoom,
  mockCourses, mockWords, mockGrammarExercises, mockListeningExercises,
  mockSpeakingExercises, mockAchievements, mockPosts, mockProgress,
  mockStudyGroups, mockDirectMessages, mockStudyHistory, generateDailyChallenge
} from '../data/mockData'
import { authApi, initAuth as initAuthApi, type HumanSignals } from '../utils/api'
import { smartApi } from '../utils/smartApi'
import { setCachedToken, getCachedToken } from '../utils/authCache'

interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration: number
}

export interface Notification {
  id: string
  type: 'study_reminder' | 'streak_alert' | 'achievement_unlocked' | 'daily_challenge' | 'new_follower' | 'system' | 'survey'
  title: string
  message?: string
  time: string
  read: boolean
  link?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  isSearch?: boolean
  searchResults?: { title: string; url: string; snippet: string }[]
}

export interface BugReport {
  id: string
  title: string
  category: string
  severity: 'low' | 'medium' | 'high'
  description: string
  status: 'pending' | 'processing' | 'analyzing' | 'analyzed' | 'resolved' | 'closed'
  submittedAt: string
  reporter: string
  email?: string
  screenshots?: string[]
  browserInfo?: { browser: string; os: string; resolution: string }
  adminResponse?: string
  resolvedAt?: string
  /** 关联自动检测的 incidentId */
  incidentId?: string
  /** 是否为自动检测上报 */
  autoDetected?: boolean
  /** 增强上下文 */
  context?: Record<string, unknown>
  /** AI 分析结果 */
  aiAnalysis?: {
    rootCause: string
    impact: string
    suggestedFix: string
    affectedFiles: string[]
    priority: 'high' | 'medium' | 'low'
    analysisSummary: string
    analyzedAt: string
  }
}

interface StoreState {
  user: User | null
  isAuthenticated: boolean
  courses: Course[]
  words: Word[]
  grammarExercises: GrammarExercise[]
  listeningExercises: ListeningExercise[]
  speakingExercises: SpeakingExercise[]
  achievements: Achievement[]
  posts: Post[]
  progress: typeof mockProgress
  currentLanguage: 'english' | 'japanese' | 'korean'
  uiLanguage: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'de'
  currentLevel: 'beginner' | 'elementary' | 'intermediate' | 'advanced'
  favorites: string[]
  studyHistory: StudyHistory[]
  dailyChallenge: DailyChallenge | null
  studyGroups: StudyGroup[]
  directMessages: DirectMessage[]
  battleRoom: BattleRoom | null
  toasts: ToastItem[]
  theme: 'dark' | 'light' | 'system'
  notifications: Notification[]
  bugReports: BugReport[]
  chatMessages: ChatMessage[]
  privacyAgreed: boolean
  aiDataConsent: boolean
  token: string | null
  membershipInfo: MembershipInfo | null
  _hydrated: boolean
  appVersion: string
  cloudConfig: Record<string, unknown> | null

  login: (email: string, password: string, captcha: { token: string; code: string }, humanToken: string, humanSignals: HumanSignals, turnstileToken: string) => Promise<{ success: boolean; error: string }>
  register: (username: string, email: string, password: string, captcha: { token: string; code: string }, humanToken: string, humanSignals: HumanSignals, behaviorSignals: import('../utils/api').BehaviorSignals | undefined, turnstileToken: string) => Promise<{ success: boolean; error: string }>
  logout: () => void
  initAuth: () => Promise<void>
  setLanguage: (lang: 'english' | 'japanese' | 'korean') => void
  setUiLanguage: (lang: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'de') => void
  setLevel: (level: 'beginner' | 'elementary' | 'intermediate' | 'advanced') => void
  updateCourseProgress: (courseId: string, progress: number) => void
  addPost: (post: Omit<Post, 'id' | 'likes' | 'comments' | 'createdAt'>) => void
  likePost: (postId: string) => void
  addComment: (postId: string, comment: Omit<Comment, 'id' | 'createdAt'>) => void
  toggleFavorite: (wordId: string) => void
  addStudyHistory: (history: StudyHistory) => void
  completeDailyChallenge: (score: number) => void
  joinGroup: (groupId: string) => void
  leaveGroup: (groupId: string) => void
  sendDM: (dm: DirectMessage) => void
  createBattleRoom: () => void
  joinBattleRoom: (roomId: string) => void
  submitBattleAnswer: (roomId: string, score: number) => void
  addToast: (message: string, type: 'success' | 'error' | 'info', duration: number) => void
  removeToast: (id: string) => void
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  addXP: (amount: number) => void
  addNotification: (notification: Omit<Notification, 'id'>) => void
  markAllNotificationsRead: () => void
  deleteNotification: (id: string) => void
  submitBugReport: (report: Omit<BugReport, 'id' | 'submittedAt'>) => void
  updateBugReport: (id: string, updates: Partial<BugReport>) => void
  updatePrivacySettings: (settings: { publicProgress?: boolean; onlineStatus?: boolean; allowFriendSearch?: boolean; allowMessages?: boolean }) => void
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearChatHistory: () => void
  setPrivacyAgreed: (agreed: boolean) => void
  setAiDataConsent: (agreed: boolean) => Promise<boolean>
  fetchMembership: () => Promise<void>
  setMembershipInfo: (info: MembershipInfo | null) => void
  fetchCloudConfig: () => Promise<void>
  refreshUserData: () => Promise<void>
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
  user: null,
  isAuthenticated: false,
  courses: mockCourses,
  words: mockWords,
  grammarExercises: mockGrammarExercises,
  listeningExercises: mockListeningExercises,
  speakingExercises: mockSpeakingExercises,
  achievements: mockAchievements,
  posts: mockPosts,
  progress: mockProgress,
  currentLanguage: 'english',
  uiLanguage: 'zh',
  currentLevel: 'beginner',
  favorites: [],
  studyHistory: mockStudyHistory,
  dailyChallenge: generateDailyChallenge(),
  studyGroups: mockStudyGroups,
  directMessages: mockDirectMessages,
  battleRoom: null,
  toasts: [],
  theme: 'system',
  notifications: [
    { id: 'n1', type: 'system', title: '欢迎加入 LinguaLeap', message: '开始你的语言学习之旅吧！', time: '刚刚', read: false },
    { id: 'n2', type: 'daily_challenge', title: '每日挑战已更新', message: '今天的5道题目已准备好，快来挑战吧！', time: '2小时前', read: false },
    { id: 'n3', type: 'achievement_unlocked', title: '成就解锁：初学者', message: '恭喜你完成了第一节课！', time: '昨天', read: true },
  ],
  bugReports: [],
  chatMessages: [],
  privacyAgreed: false,
  aiDataConsent: false,
  token: null,
  membershipInfo: null,
  _hydrated: false,
  appVersion: '1.0.0',
  cloudConfig: null,

  login: async (email: string, password: string, captcha: { token: string; code: string }, humanToken: string, humanSignals: HumanSignals, turnstileToken: string) => {
    const result = await authApi.login(email, password, captcha, humanToken, humanSignals, turnstileToken)
    if (result.success && result.data) {
      setCachedToken(result.data.token)
      set({ user: result.data.user, isAuthenticated: true, token: result.data.token, aiDataConsent: result.data.user?.aiDataConsent === true })
      get().fetchMembership()
      return { success: true, error: '' }
    }
    return { success: false, error: result.message || '登录失败，请稍后重试' }
  },

  register: async (username: string, email: string, password: string, captcha: { token: string; code: string }, humanToken: string, humanSignals: HumanSignals, behaviorSignals: import('../utils/api').BehaviorSignals | undefined, turnstileToken: string) => {
    const result = await authApi.register(username, email, password, captcha, humanToken, humanSignals, behaviorSignals, turnstileToken)
    if (result.success && result.data) {
      setCachedToken(result.data.token)
      set({ user: result.data.user, isAuthenticated: true, token: result.data.token, aiDataConsent: result.data.user?.aiDataConsent === true })
      get().fetchMembership()
      return { success: true, error: '' }
    }
    return { success: false, error: result.message || '注册失败，请稍后重试' }
  },

  logout: () => {
    authApi.logout()
    setCachedToken(null)
    set({ user: null, isAuthenticated: false, token: null })
  },

  initAuth: async () => {
    initAuthApi()
    // 安全：访问令牌从本地缓存读取；刷新令牌存储在 HttpOnly Cookie 中，JS 不可读取。
    // user/isAuthenticated 不持久化，每次刷新都必须通过 /api/me 从后端重新验证，防止前端 storage 被注入伪造 role。
    const token = get().token || getCachedToken()
    if (token) {
      setCachedToken(token)
      try {
        const result = await authApi.me()
        if (result.success && result.data) {
          set({ user: result.data.user, isAuthenticated: true, token, aiDataConsent: result.data.user?.aiDataConsent === true, membershipInfo: result.data.user?.membershipInfo || null })
        } else {
          setCachedToken(null)
          set({ user: null, isAuthenticated: false, token: null, membershipInfo: null })
        }
      } catch {
        set({ user: null, isAuthenticated: false, token: null, membershipInfo: null })
        setCachedToken(null)
      }
    } else {
      set({ user: null, isAuthenticated: false, token: null })
    }
  },

  setLanguage: (lang) => {
    set({ currentLanguage: lang })
  },

  setUiLanguage: (lang) => {
    set({ uiLanguage: lang })
  },

  setLevel: (level) => {
    set({ currentLevel: level })
  },

  updateCourseProgress: (courseId, progress) => {
    set(state => ({
      courses: state.courses.map(course =>
        course.id === courseId ? { ...course, progress } : course
      )
    }))
  },

  addPost: (postData) => {
    const newPost: Post = {
      id: Date.now().toString(),
      ...postData,
      likes: 0,
      comments: [],
      createdAt: new Date().toISOString()
    }
    set(state => ({
      posts: [newPost, ...state.posts]
    }))
  },

  likePost: (postId) => {
    set(state => ({
      posts: state.posts.map(post =>
        post.id === postId ? { ...post, likes: post.likes + 1 } : post
      )
    }))
  },

  addComment: (postId, commentData) => {
    const newComment: Comment = {
      id: Date.now().toString(),
      ...commentData,
      createdAt: new Date().toISOString()
    }
    set(state => ({
      posts: state.posts.map(post =>
        post.id === postId ? { ...post, comments: [...post.comments, newComment] } : post
      )
    }))
  },

  toggleFavorite: (wordId) => {
    set(state => {
      const exists = state.favorites.includes(wordId)
      return {
        favorites: exists
          ? state.favorites.filter(id => id !== wordId)
          : [...state.favorites, wordId]
      }
    })
  },

  addStudyHistory: (history) => {
    set(state => ({
      studyHistory: [history, ...state.studyHistory]
    }))
  },

  completeDailyChallenge: (score) => {
    set(state => {
      if (!state.dailyChallenge) return state
      const updatedChallenge = { ...state.dailyChallenge, completed: true, score }
      const newXP = (state.user?.xp || 0) + score
      const newTotalXP = (state.user?.totalXP || 0) + score
      return {
        dailyChallenge: updatedChallenge,
        user: state.user ? { ...state.user, xp: newXP, totalXP: newTotalXP } : null
      }
    })
  },

  joinGroup: (groupId) => {
    set(state => {
      const userId = state.user?.id
      if (!userId) return state
      return {
        studyGroups: state.studyGroups.map(group =>
          group.id === groupId && !group.members.includes(userId)
            ? { ...group, members: [...group.members, userId] }
            : group
        )
      }
    })
  },

  leaveGroup: (groupId) => {
    set(state => {
      const userId = state.user?.id
      if (!userId) return state
      return {
        studyGroups: state.studyGroups.map(group =>
          group.id === groupId
            ? { ...group, members: group.members.filter(id => id !== userId) }
            : group
        )
      }
    })
  },

  sendDM: (dm) => {
    set(state => ({
      directMessages: [...state.directMessages, dm]
    }))
  },

  createBattleRoom: () => {
    const userId = get().user?.id
    if (!userId) return
    const newRoom: BattleRoom = {
      id: `br-${Date.now()}`,
      player1: userId,
      status: 'waiting',
      questions: mockGrammarExercises.slice(0, 5),
      scores: { [userId]: 0 }
    }
    set({ battleRoom: newRoom })
  },

  joinBattleRoom: (roomId) => {
    const userId = get().user?.id
    if (!userId) return
    set(state => {
      if (!state.battleRoom || state.battleRoom.id !== roomId) return state
      return {
        battleRoom: {
          ...state.battleRoom,
          player2: userId,
          status: 'playing',
          scores: { ...state.battleRoom.scores, [userId]: 0 }
        }
      }
    })
  },

  submitBattleAnswer: (roomId, score) => {
    set(state => {
      if (!state.battleRoom || state.battleRoom.id !== roomId) return state
      const userId = state.user?.id
      if (!userId) return state
      return {
        battleRoom: {
          ...state.battleRoom,
          scores: { ...state.battleRoom.scores, [userId]: (state.battleRoom.scores[userId] || 0) + score }
        }
      }
    })
  },

  addToast: (message, type, duration) => {
    const id = Date.now().toString()
    set(state => ({
      toasts: [...state.toasts, { id, message, type, duration }]
    }))
    setTimeout(() => {
      get().removeToast(id)
    }, duration)
  },

  removeToast: (id) => {
    set(state => ({
      toasts: state.toasts.filter(toast => toast.id !== id)
    }))
  },

  setTheme: (theme) => {
    set({ theme })
  },

  addXP: (amount) => {
    set(state => {
      if (!state.user) return state
      return {
        user: {
          ...state.user,
          xp: state.user.xp + amount,
          totalXP: state.user.totalXP + amount
        }
      }
    })
  },

  addNotification: (notification) => {
    const id = Date.now().toString()
    set(state => ({
      notifications: [{ id, ...notification }, ...state.notifications]
    }))
  },

  markAllNotificationsRead: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true }))
    }))
  },

  deleteNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id)
    }))
  },

  submitBugReport: (report) => {
    const newReport: BugReport = {
      ...report,
      id: `BR-${Date.now()}`,
      submittedAt: new Date().toLocaleString('zh-CN'),
    }
    set(state => ({
      bugReports: [newReport, ...state.bugReports]
    }))
  },

  updateBugReport: (id, updates) => {
    set(state => ({
      bugReports: state.bugReports.map(r =>
        r.id === id ? { ...r, ...updates } : r
      )
    }))
  },

  updatePrivacySettings: (settings) => {
    set(state => ({
      user: state.user ? { ...state.user, ...settings } : null
    })
  )},

  addChatMessage: (msg) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    }
    set(state => ({
      chatMessages: [...state.chatMessages, newMsg]
    }))
  },

  clearChatHistory: () => {
    set({ chatMessages: [] })
  },

  setPrivacyAgreed: (agreed: boolean) => {
    set({ privacyAgreed: agreed })
  },

  setAiDataConsent: async (agreed: boolean) => {
    const result = await authApi.updatePrivacyConsent(agreed)
    if (result.success) {
      set(state => ({
        aiDataConsent: agreed,
        user: state.user ? { ...state.user, aiDataConsent: agreed } : null,
      }))
      return true
    }
    return false
  },

  fetchMembership: async () => {
    try {
      const token = get().token || getCachedToken()
      if (!token) return
      const result = await smartApi.getMembership()
      if (result.success && result.data) {
        set({ membershipInfo: result.data })
      }
    } catch {}
  },

  setMembershipInfo: (info) => {
    set({ membershipInfo: info })
  },

  fetchCloudConfig: async () => {
    try {
      const res = await fetch('/api/config', { cache: 'no-store' })
      const result = await res.json()
      if (result.success && result.data) {
        set({ cloudConfig: result.data })
      }
    } catch {}
  },

  refreshUserData: async () => {
    try {
      const result = await authApi.me()
      if (result.success && result.data) {
        set({
          user: result.data.user,
          isAuthenticated: true,
          token: get().token,
          membershipInfo: result.data.user?.membershipInfo || null,
        })
        await get().fetchMembership()
      } else {
        set({ user: null, isAuthenticated: false, token: null, membershipInfo: null })
        setCachedToken(null)
      }
    } catch {
      set({ user: null, isAuthenticated: false, token: null, membershipInfo: null })
      setCachedToken(null)
    }
  },
}),
{
  name: 'lingualeap-storage',
  partialize: (state) => ({
    // 安全：user 与 isAuthenticated 不再持久化，避免 sessionStorage/localStorage 注入伪造 role。
    // 每次页面刷新后通过 initAuth -> /api/me 从后端重新获取真实角色。
    currentLanguage: state.currentLanguage,
    uiLanguage: state.uiLanguage,
    currentLevel: state.currentLevel,
    theme: state.theme,
    favorites: state.favorites,
    progress: state.progress,
    bugReports: state.bugReports,
    chatMessages: state.chatMessages,
    privacyAgreed: state.privacyAgreed,
    aiDataConsent: state.aiDataConsent,
  }),
}
)
)