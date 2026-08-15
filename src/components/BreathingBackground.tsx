import { useReducedMotion } from '../utils/useReducedMotion'

export default function BreathingBackground() {
  const reduced = useReducedMotion()

  if (reduced) return null

  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none motion-safe:animate-breathe"
      style={{
        background:
          'radial-gradient(circle at 50% 35%, rgba(0, 0, 0, 0.06) 0%, rgba(0, 0, 0, 0.02) 35%, transparent 70%)',
        transformOrigin: '50% 35%',
      }}
      aria-hidden="true"
    />
  )
}
