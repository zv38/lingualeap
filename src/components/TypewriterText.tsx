import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface TypewriterTextProps {
  text: string
  speed?: number
  delay?: number
  className?: string
  onComplete?: () => void
}

export default function TypewriterText({ text, speed = 60, delay = 0, className = '', onComplete }: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  useEffect(() => {
    if (!started) return
    if (displayed.length >= text.length) {
      onComplete?.()
      const cursorTimer = setInterval(() => setShowCursor((p) => !p), 530)
      return () => clearInterval(cursorTimer)
    }
    const timer = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1))
    }, speed + Math.random() * 30)
    return () => clearTimeout(timer)
  }, [started, displayed, text, speed, onComplete])

  return (
    <span className={className}>
      {displayed}
      {started && displayed.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          className="inline-block w-[2px] h-[1em] bg-[var(--accent-primary)] ml-0.5 align-middle"
        />
      )}
      {started && displayed.length >= text.length && showCursor && (
        <span className="inline-block w-[2px] h-[1em] bg-[var(--accent-primary)]/40 ml-0.5 align-middle" />
      )}
    </span>
  )
}
