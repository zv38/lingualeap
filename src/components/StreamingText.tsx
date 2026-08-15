import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'

interface StreamingTextProps {
  content: string
  /** 是否正在流式接收中 */
  isStreaming?: boolean
  /** 打字速度 (ms/字符)，默认 20 */
  speed?: number
  /** 稳定后的闪烁光标 */
  showCursor?: boolean
  className?: string
  onComplete?: () => void
}

export default function StreamingText({
  content,
  isStreaming = false,
  speed = 20,
  showCursor = true,
  className = '',
  onComplete,
}: StreamingTextProps) {
  const [displayedContent, setDisplayedContent] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    // 如果正在流式接收，或者内容变了但还没显示完
    if (isStreaming) {
      // 流式接收中，直接显示已有内容
      setDisplayedContent(content)
      completedRef.current = false
      return
    }

    // 内容变长，需要打字机效果展现新增部分
    if (content.length > displayedContent.length && !isStreaming) {
      clearTimer()
      setIsTyping(true)
      completedRef.current = false

      timerRef.current = setInterval(() => {
        indexRef.current++
        setDisplayedContent(content.slice(0, indexRef.current))

        if (indexRef.current >= content.length) {
          clearTimer()
          setIsTyping(false)
          if (!completedRef.current) {
            completedRef.current = true
            onComplete?.()
          }
        }
      }, speed)
    } else if (content.length > 0 && displayedContent.length === 0) {
      // 首次显示
      setDisplayedContent(content)
    }

    return clearTimer
  }, [content, isStreaming, speed, clearTimer, onComplete])

  // 初始渲染：如果 content 有内容，直接显示
  useEffect(() => {
    if (content && !displayedContent && !isStreaming) {
      // 短内容直接显示，长内容打字机效果
      if (content.length < 50) {
        setDisplayedContent(content)
      } else {
        setIsTyping(true)
        timerRef.current = setInterval(() => {
          indexRef.current += 2 // 每次跳2个字符加速
          setDisplayedContent(content.slice(0, Math.min(indexRef.current, content.length)))
          if (indexRef.current >= content.length) {
            clearTimer()
            setIsTyping(false)
            if (!completedRef.current) {
              completedRef.current = true
              onComplete?.()
            }
          }
        }, speed)
      }
    }
    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showCursorEffect = showCursor && (isStreaming || isTyping)

  return (
    <span className={className}>
      {displayedContent || content}
      {showCursorEffect && (
        <motion.span
          className="inline-block w-[2px] h-[1em] ml-[1px] align-middle"
          style={{ background: 'var(--accent-indigo)' }}
          animate={{ opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }}
        />
      )}
    </span>
  )
}