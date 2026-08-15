import { useState } from 'react'
import { motion } from 'framer-motion'
import { ImageOff } from 'lucide-react'

interface ImageWithFallbackProps {
  src: string
  alt: string
  className?: string
}

export default function ImageWithFallback({ src, alt, className = '' }: ImageWithFallbackProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && !error && (
        <motion.div
          className="absolute inset-0 bg-[var(--border-primary)]/20"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {error ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-[var(--bg-elevated)]/50 flex flex-col items-center justify-center gap-1.5"
        >
          <ImageOff size={20} className="text-[var(--text-muted)]/50" />
          <span className="text-[10px] text-[var(--text-muted)]/40 font-sans">图片加载失败</span>
        </motion.div>
      ) : (
        <motion.img
          src={src}
          alt={alt}
          loading="lazy"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 1.05 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  )
}