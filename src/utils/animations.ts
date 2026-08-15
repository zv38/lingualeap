import type { Variants, Transition } from 'framer-motion'

export const spring: Transition = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 22,
  mass: 0.6,
}

export const springSoft: Transition = {
  type: 'spring' as const,
  stiffness: 150,
  damping: 20,
  mass: 0.8,
}

export const springBouncy: Transition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 15,
  mass: 0.5,
}

export const springGentle: Transition = {
  type: 'spring' as const,
  stiffness: 120,
  damping: 18,
  mass: 1,
}

export const easeOut: Transition = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1] as const,
}

export const easeOutFast: Transition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1] as const,
}

export const easeOutSlow: Transition = {
  duration: 0.8,
  ease: [0.22, 1, 0.36, 1] as const,
}

export const pageEnter: Variants = {
  initial: { opacity: 0, y: 40, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: easeOutSlow },
  exit: { opacity: 0, y: -20, filter: 'blur(4px)', transition: easeOutFast },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: easeOut },
}

export const fadeUpDelay = (delay: number = 0): Variants => ({
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { ...easeOut, delay } },
})

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: easeOut },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: spring },
}

export const scaleInBouncy: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: springBouncy },
}

export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: easeOut },
}

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: easeOut },
}

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: spring },
}

export const cardHover = {
  whileHover: { y: -6, scale: 1.01, transition: spring },
  whileTap: { scale: 0.98, transition: { duration: 0.1 } },
}

export const buttonTap = {
  whileHover: { scale: 1.03, transition: spring },
  whileTap: { scale: 0.96, transition: { duration: 0.08 } },
}

export const listStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
}

export const listItem: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: spring },
}

export const flipCard: Variants = {
  front: { rotateY: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  back: { rotateY: 180, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
}

export const chatMessage: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring },
}

export const numberRoll = (value: number, duration: number = 1.5) => ({
  from: 0,
  to: value,
  config: { duration, ease: [0.22, 1, 0.36, 1] as const },
})

export const progressBar: Variants = {
  hidden: { width: '0%' },
  visible: (width: number) => ({
    width: `${width}%`,
    transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

export const ringProgress = (percentage: number, circumference: number) => ({
  hidden: { strokeDashoffset: circumference },
  visible: {
    strokeDashoffset: circumference - (percentage / 100) * circumference,
    transition: { duration: 1.5, ease: [0.22, 1, 0.36, 1] as const },
  },
})