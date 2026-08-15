import { useState, useCallback, useRef, useEffect } from 'react'

export type ProcessingStage = 'idle' | 'understanding' | 'thinking' | 'generating' | 'optimizing' | 'complete' | 'error'

export interface ProcessingStatus {
  stage: ProcessingStage
  message: string
  progress: number // 0-100
  startTime: number
  elapsed: number
}

const STAGE_CONFIG: Record<ProcessingStage, { message: string; weight: number }> = {
  idle: { message: '', weight: 0 },
  understanding: { message: '正在理解问题...', weight: 15 },
  thinking: { message: '正在思考分析...', weight: 35 },
  generating: { message: '正在生成回答...', weight: 70 },
  optimizing: { message: '正在优化表达...', weight: 90 },
  complete: { message: '完成', weight: 100 },
  error: { message: '处理出错', weight: 0 },
}

const STAGE_ORDER: ProcessingStage[] = ['understanding', 'thinking', 'generating', 'optimizing', 'complete']

export function useProcessingStatus() {
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    message: '',
    progress: 0,
    startTime: 0,
    elapsed: 0,
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)

  const startProcessing = useCallback(() => {
    const now = Date.now()
    startTimeRef.current = now
    setStatus({
      stage: 'understanding',
      message: STAGE_CONFIG.understanding.message,
      progress: 0,
      startTime: now,
      elapsed: 0,
    })

    // 模拟进度推进，让用户感知到 AI 在"思考"
    let currentStage = 0
    const stageWeights = STAGE_ORDER.map(s => STAGE_CONFIG[s].weight)
    
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const currentStageConfig = STAGE_ORDER[currentStage]
      const nextStageWeight = stageWeights[Math.min(currentStage + 1, stageWeights.length - 1)]
      const currentStageWeight = stageWeights[currentStage]

      // 在 3-8 秒内逐步推进到下一阶段
      const stageDuration = 3000 + Math.random() * 5000
      const stageProgress = Math.min(elapsed / stageDuration, 1)
      const progress = currentStageWeight + (nextStageWeight - currentStageWeight) * stageProgress

      setStatus(prev => ({
        ...prev,
        stage: currentStageConfig,
        message: STAGE_CONFIG[currentStageConfig].message,
        progress: Math.min(progress, 95),
        elapsed,
      }))

      if (stageProgress >= 1 && currentStage < STAGE_ORDER.length - 1) {
        currentStage++
      }
    }, 200)
  }, [])

  const completeProcessing = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    const now = Date.now()
    setStatus({
      stage: 'complete',
      message: STAGE_CONFIG.complete.message,
      progress: 100,
      startTime: startTimeRef.current,
      elapsed: now - startTimeRef.current,
    })
  }, [])

  const failProcessing = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setStatus(prev => ({
      ...prev,
      stage: 'error',
      message: STAGE_CONFIG.error.message,
      progress: 0,
    }))
  }, [])

  const resetProcessing = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setStatus({
      stage: 'idle',
      message: '',
      progress: 0,
      startTime: 0,
      elapsed: 0,
    })
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  return {
    status,
    startProcessing,
    completeProcessing,
    failProcessing,
    resetProcessing,
  }
}