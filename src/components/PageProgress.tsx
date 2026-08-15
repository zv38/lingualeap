import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, useSpring, useMotionValue } from 'framer-motion'

export default function PageProgress() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const prevPath = useRef(location.pathname)
  const width = useMotionValue(0)
  const springWidth = useSpring(width, { stiffness: 200, damping: 30 })

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname
      width.set(0)
      setVisible(true)

      const t0 = setTimeout(() => width.set(30), 50)
      const t1 = setTimeout(() => width.set(70), 250)
      const t2 = setTimeout(() => {
        width.set(100)
        setTimeout(() => {
          setVisible(false)
          width.set(0)
        }, 300)
      }, 450)

      return () => {
        clearTimeout(t0)
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [location.pathname])

  if (!visible) return null

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-[99999] h-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative h-full w-full overflow-hidden">
        <motion.div
          className="absolute inset-0 h-full"
          style={{
            width: springWidth,
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--success))',
          }}
        />
      </div>
    </motion.div>
  )
}