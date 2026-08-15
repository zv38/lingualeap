import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface TiltCardProps {
  children: React.ReactNode
  className?: string
  tiltDegree?: number
}

export default function TiltCard({ children, className = '', tiltDegree = 8 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState({ rotateX: 0, rotateY: 0, scale: 1 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setStyle({
      rotateX: -y * tiltDegree,
      rotateY: x * tiltDegree,
      scale: 1.02,
    })
  }

  const handleMouseLeave = () => {
    setStyle({ rotateX: 0, rotateY: 0, scale: 1 })
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${style.rotateX}deg) rotateY(${style.rotateY}deg) scale(${style.scale})`,
        transition: 'transform 0.1s ease-out',
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}