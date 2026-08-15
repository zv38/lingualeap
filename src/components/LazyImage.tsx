import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface SrcSetItem {
  url: string
  width: number
}

interface LazyImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'srcSet'> {
  src: string
  alt: string
  srcSet?: SrcSetItem[]
  placeholderColor?: string
  placeholderSrc?: string
  containerClassName?: string
  rootMargin?: string
}

function buildSrcset(items: SrcSetItem[]): string {
  return items.map(s => `${s.url} ${s.width}w`).join(', ')
}

export default function LazyImage({
  src,
  alt,
  srcSet,
  sizes,
  placeholderColor = 'var(--border-primary)',
  placeholderSrc,
  className = '',
  containerClassName = '',
  decoding = 'async',
  loading: loadingProp,
  rootMargin = '200px',
  ...props
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [rootMargin])

  useEffect(() => {
    if (!inView || loaded) return
    // 使用 requestIdleCallback 让图片解码不阻塞主线程
    const decodeImage = () => {
      const img = new Image()
      img.decoding = decoding
      img.srcset = srcSet ? buildSrcset(srcSet) : ''
      img.sizes = sizes || ''
      img.src = src
      img.decode?.().catch(() => {})
    }
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(decodeImage, { timeout: 500 })
    } else {
      decodeImage()
    }
  }, [inView, src, srcSet, sizes, decoding, loaded])

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${containerClassName}`}
      style={{
        backgroundColor: placeholderColor,
        opacity: loaded ? 1 : 0.85,
      }}
    >
      {inView && (
        <img
          src={src}
          alt={alt}
          srcSet={srcSet ? buildSrcset(srcSet) : undefined}
          sizes={sizes}
          decoding={decoding}
          loading={loadingProp}
          className={`transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
          onLoad={() => setLoaded(true)}
          {...props}
        />
      )}
      {!loaded && placeholderSrc && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-sm scale-105 opacity-60"
        />
      )}
      {!loaded && (
        <motion.div
          className="absolute inset-0"
          style={{ backgroundColor: placeholderColor }}
          animate={{ opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}
