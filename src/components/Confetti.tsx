import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  rotation: number
  duration: number
  delay: number
  shape: 'rect' | 'circle' | 'star' | 'emoji'
  emoji?: string
  driftX: number
}

interface ConfettiProps {
  trigger: boolean
  onComplete?: () => void
  count?: number
  emojis?: string[]
}

const colors = ['#000000', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#ffffff']

const defaultEmojis = ['🎉', '✨', '⭐', '🎊', '💫', '🌟', '🎯', '🏆']

export default function Confetti({ trigger, onComplete, count = 80, emojis = defaultEmojis }: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!trigger) return

    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => {
      const shapeRand = Math.random()
      const shape: Particle['shape'] = shapeRand < 0.4 ? 'rect' : shapeRand < 0.7 ? 'circle' : shapeRand < 0.9 ? 'star' : 'emoji'

      return {
        id: Date.now() + i,
        x: 50 + (Math.random() - 0.5) * 40,
        y: 30 + (Math.random() - 0.5) * 30,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: shape === 'emoji' ? 20 : shape === 'rect' ? Math.random() * 8 + 4 : Math.random() * 6 + 3,
        rotation: Math.random() * 360,
        duration: Math.random() * 2.5 + 1.5,
        delay: Math.random() * 0.4,
        shape,
        emoji: shape === 'emoji' ? emojis[Math.floor(Math.random() * emojis.length)] : undefined,
        driftX: (Math.random() - 0.5) * 60,
      }
    })

    setParticles(newParticles)

    const timer = setTimeout(() => {
      setParticles([])
      onComplete?.()
    }, 5000)

    return () => clearTimeout(timer)
  }, [trigger, onComplete, count, emojis])

  if (particles.length === 0) return null

  return (
    <AnimatePresence>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{
            x: `${p.x}vw`,
            y: `${p.y}vh`,
            opacity: 1,
            scale: 1,
            rotate: p.rotation,
          }}
          animate={{
            x: `${p.x + p.driftX}vw`,
            y: `${p.y + 65}vh`,
            opacity: 0,
            scale: p.shape === 'emoji' ? [1, 1.3, 0.5] : 0.2,
            rotate: p.rotation + (Math.random() > 0.5 ? 540 : -540),
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="fixed pointer-events-none z-[10001] flex items-center justify-center"
          style={
            p.shape === 'emoji'
              ? { width: p.size, height: p.size, fontSize: p.size }
              : {
                  width: p.shape === 'rect' ? p.size : p.size * 1.2,
                  height: p.shape === 'rect' ? p.size * 0.6 : p.size * 1.2,
                  background: p.color,
                  borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'star' ? '2px' : '2px',
                  clipPath: p.shape === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' : undefined,
                }
          }
        >
          {p.shape === 'emoji' ? p.emoji : null}
        </motion.div>
      ))}
    </AnimatePresence>
  )
}