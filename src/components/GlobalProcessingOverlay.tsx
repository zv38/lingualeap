import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Bot } from 'lucide-react'

interface ProcessingTask {
  id: string
  label: string
  description?: string
  progress?: number
}

// 全局处理状态管理
let setProcessingTasks: React.Dispatch<React.SetStateAction<ProcessingTask[]>> | null = null

export function addProcessingTask(task: ProcessingTask) {
  setProcessingTasks?.(prev => {
    if (prev.some(t => t.id === task.id)) return prev
    return [...prev, task]
  })
}

export function updateProcessingTask(id: string, updates: Partial<ProcessingTask>) {
  setProcessingTasks?.(prev =>
    prev.map(t => (t.id === id ? { ...t, ...updates } : t))
  )
}

export function removeProcessingTask(id: string) {
  setProcessingTasks?.(prev => prev.filter(t => t.id !== id))
}

export function clearAllProcessingTasks() {
  setProcessingTasks?.([])
}

export default function GlobalProcessingOverlay() {
  const [tasks, setTasks] = React.useState<ProcessingTask[]>([])
  setProcessingTasks = setTasks

  if (tasks.length === 0) return null

  return (
    <AnimatePresence>
      {tasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998]"
        >
          <div className="bg-[var(--bg-card)]/95 backdrop-blur-xl border border-[var(--border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] px-5 py-3.5 min-w-[280px] max-w-[400px]">
            {tasks.length === 1 ? (
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                >
                  <Bot size={20} style={{ color: 'var(--accent-indigo)' }} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {tasks[0].label}
                  </p>
                  {tasks[0].description && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {tasks[0].description}
                    </p>
                  )}
                  {tasks[0].progress !== undefined && (
                    <div className="mt-1.5 h-1 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'var(--accent-indigo)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${tasks[0].progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-medium text-[var(--text-muted)]">
                  正在处理 {tasks.length} 项任务
                </p>
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2.5">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                      className="shrink-0"
                    >
                      <Loader2 size={14} style={{ color: 'var(--accent-indigo)' }} />
                    </motion.div>
                    <span className="text-sm text-[var(--text-primary)] truncate flex-1">
                      {task.label}
                    </span>
                    {task.progress !== undefined && (
                      <span className="text-xs text-[var(--text-muted)] font-mono">
                        {task.progress}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

