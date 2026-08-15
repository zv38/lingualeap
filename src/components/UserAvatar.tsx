const gradients = [
  'from-[var(--accent-secondary)] to-[var(--accent-hover)]',
  'from-[var(--accent-secondary)] to-[var(--accent-cool)]',
  'from-[var(--accent-hover)] to-[var(--accent-secondary)]',
  'from-[var(--error)] to-[var(--error)]',
  'from-[var(--accent-cool)] to-[var(--accent-secondary)]',
  'from-[var(--accent-secondary)] to-[var(--accent-secondary)]',
  'from-[var(--accent-secondary)] to-[var(--accent-secondary)]',
  'from-[var(--accent-hover)] to-[var(--accent-secondary)]',
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getInitial(name: string): string {
  if (!name || name.trim().length === 0) return '?'
  return name.trim()[0].toUpperCase()
}

interface UserAvatarProps {
  username?: string
  size?: number
  className?: string
  src?: string | null
}

export default function UserAvatar({ username = '', size = 40, className = '', src }: UserAvatarProps) {
  const colorIndex = username ? hashName(username) % gradients.length : 0
  const initial = getInitial(username)
  const ringClass = 'ring-1 ring-[var(--accent-primary)]/[0.08]'

  if (src) {
    return (
      <img
        src={src}
        alt={username}
        loading="lazy"
        className={`rounded-full object-cover ${ringClass} ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const parent = target.parentElement
          if (parent) {
            const fallback = document.createElement('div')
            fallback.className = `rounded-full bg-gradient-to-br ${gradients[colorIndex]} flex items-center justify-center text-white font-semibold ${ringClass}`
            fallback.style.width = `${size}px`
            fallback.style.height = `${size}px`
            fallback.style.fontSize = `${Math.max(size * 0.42, 10)}px`
            fallback.textContent = initial
            parent.appendChild(fallback)
          }
        }}
      />
    )
  }

  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradients[colorIndex]} flex items-center justify-center text-white font-semibold flex-shrink-0 ${ringClass} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(size * 0.42, 10) }}
      title={username}
    >
      {initial}
    </div>
  )
}
