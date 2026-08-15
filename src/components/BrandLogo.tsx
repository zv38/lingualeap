import { motion } from 'framer-motion'

interface BrandLogoProps {
  size?: number
  className?: string
  animated?: boolean
}

export default function BrandLogo({ size = 40, className = '', animated = true }: BrandLogoProps) {
  const pathVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { delay: i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
        opacity: { delay: i * 0.12, duration: 0.3 }
      }
    })
  }

  const glowVariants = {
    animate: {
      opacity: [0.2, 0.5, 0.2],
      scale: [1, 1.06, 1],
      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const }
    }
  }

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="relative z-10"
      >
        <defs>
          <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="50%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#52525b" />
          </linearGradient>
          <linearGradient id="logoGradTop" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4d4d8" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <linearGradient id="logoGradBook" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#27272a" />
            <stop offset="50%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <filter id="logoGlow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="starGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {animated && (
          <motion.circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            stroke="url(#logoGrad)"
            strokeWidth="0.4"
            strokeOpacity="0.2"
            variants={glowVariants}
            animate="animate"
          />
        )}

        <motion.path
          d="M24 17 L18 34 Q24 28 30 34 L24 17"
          fill="none"
          stroke="url(#logoGradBook)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#logoGlow)"
          custom={0}
          variants={animated ? pathVariants : undefined}
          initial={animated ? 'hidden' : undefined}
          animate={animated ? 'visible' : undefined}
        />

        <motion.path
          d="M15 34 Q24 22 24 17"
          fill="none"
          stroke="url(#logoGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#logoGlow)"
          custom={1}
          variants={animated ? pathVariants : undefined}
          initial={animated ? 'hidden' : undefined}
          animate={animated ? 'visible' : undefined}
        />

        <motion.path
          d="M33 34 Q24 22 24 17"
          fill="none"
          stroke="url(#logoGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#logoGlow)"
          custom={2}
          variants={animated ? pathVariants : undefined}
          initial={animated ? 'hidden' : undefined}
          animate={animated ? 'visible' : undefined}
        />

        <motion.path
          d="M24 10 L26 13.5 L30 14 L27 16.5 L28 20.5 L24 18.5 L20 20.5 L21 16.5 L18 14 L22 13.5 Z"
          fill="url(#logoGradTop)"
          stroke="none"
          filter="url(#starGlow)"
          custom={3}
          variants={animated ? pathVariants : undefined}
          initial={animated ? 'hidden' : undefined}
          animate={animated ? 'visible' : undefined}
        />

        <motion.circle
          cx="24"
          cy="14"
          r="1.5"
          fill="#27272a"
          filter="url(#starGlow)"
          custom={3}
          variants={animated ? pathVariants : undefined}
          initial={animated ? 'hidden' : undefined}
          animate={animated ? 'visible' : undefined}
        />
      </svg>
    </div>
  )
}