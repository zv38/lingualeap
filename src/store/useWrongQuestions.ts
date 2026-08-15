import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ===== 错题本（AI 讲解 → 错题闭环）=====
// 在 AI 讲解/练习中答错的题目会被自动归纳进错题本，
// 形成"问 → 懂 → 记 → 复习"闭环，帮助学生针对薄弱点反复突破。

export interface WrongQuestion {
  id: string
  question: string
  userAnswer: string
  correctAnswer: string
  explanation: string
  source: string
  missedAt: number
  reviewed: boolean
  reviewCount: number
}

interface WrongQuestionsState {
  items: WrongQuestion[]
  /** 是否已自动打开过错题本引导（首次被加入时弹出来） */
  hasGuided: boolean
  addWrongQuestion: (q: Omit<WrongQuestion, 'id' | 'missedAt' | 'reviewed' | 'reviewCount'>) => void
  markReviewed: (id: string) => void
  removeWrongQuestion: (id: string) => void
  clearAll: () => void
}

export const useWrongQuestions = create<WrongQuestionsState>()(
  persist(
    (set, get) => ({
      items: [],
      hasGuided: false,

      addWrongQuestion: (q) => {
        const state = get()
        // 去重：同一道题（按题干）只保留一条，已有的标记为再次失误
        const existing = state.items.find((i) => i.question === q.question)
        if (existing) {
          set({
            items: state.items.map((i) =>
              i.id === existing.id
                ? { ...i, reviewCount: i.reviewCount + 1, reviewed: false, missedAt: Date.now() }
                : i,
            ),
          })
          return
        }
        const item: WrongQuestion = {
          ...q,
          id: `wq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          missedAt: Date.now(),
          reviewed: false,
          reviewCount: 1,
        }
        set({ items: [item, ...state.items] })
      },

      markReviewed: (id) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, reviewed: true, reviewCount: i.reviewCount + 1 } : i,
          ),
        }))
      },

      removeWrongQuestion: (id) => {
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }))
      },

      clearAll: () => {
        set({ items: [] })
      },
    }),
    {
      name: 'lingualeap-wrong-questions',
      partialize: (state) => ({
        items: state.items,
        hasGuided: state.hasGuided,
      }),
    },
  ),
)