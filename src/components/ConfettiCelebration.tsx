import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
  opacity: number
  decay: number
}

const COLORS = ['#000000', '#27272a', '#52525b', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#ffffff']

export default function ConfettiCelebration({ active, duration = 3000 }: { active: boolean; duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // 从屏幕底部中间发射
    const originX = canvas.width / 2
    const originY = canvas.height * 0.7
    for (let i = 0; i < 160; i++) {
      const angle = (Math.random() * Math.PI) - Math.PI / 2 + Math.PI / 2
      const speed = Math.random() * 14 + 6
      particlesRef.current.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 0.8 + 0.2),
        vy: -Math.abs(Math.sin(angle) * speed) - Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        opacity: 1,
        decay: Math.random() * 0.015 + 0.008,
      })
    }

    let startTime = Date.now()
    function animate() {
      const now = Date.now()
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.35 // 重力
        p.vx *= 0.98
        p.rotation += p.rotationSpeed
        p.opacity -= p.decay

        if (p.opacity > 0) {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rotation)
          ctx.globalAlpha = Math.max(0, p.opacity)
          ctx.fillStyle = p.color
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
          ctx.restore()
        }
      })

      particlesRef.current = particlesRef.current.filter(p => p.opacity > 0)

      if (now - startTime < duration || particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
      particlesRef.current = []
    }
  }, [active, duration])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[60]"
      style={{ width: '100vw', height: '100vh' }}
    />
  )
}
