import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Loader2, AlertCircle, Sparkles, Type, Volume2, Contrast, RotateCcw } from 'lucide-react'
import { request } from '../utils/api'

export type ImageCaptchaType = 'numeric' | 'math' | 'rotate' | 'sequence' | 'audio'

export interface ImageCaptchaValue {
  token: string
  code: string
}

export interface ImageCaptchaRef {
  refresh: () => void
  focus: () => void
  clear: () => void
}

interface CaptchaData {
  token: string
  image?: string
  svg?: string
  hint: string
  type: ImageCaptchaType
  digits?: string[]
  highContrast: boolean
}

interface ImageCaptchaProps {
  onChange?: (value: ImageCaptchaValue | null) => void
  onVerify?: (value: ImageCaptchaValue) => void
  type?: ImageCaptchaType
  className?: string
  label?: string
  disabled?: boolean
}

const TYPE_ORDER: ImageCaptchaType[] = ['numeric', 'math', 'rotate', 'sequence', 'audio']

function typeLabel(type: ImageCaptchaType) {
  switch (type) {
    case 'math': return '数学验证'
    case 'rotate': return '旋转验证'
    case 'sequence': return '点选验证'
    case 'audio': return '语音验证'
    default: return '数字验证'
  }
}

export default forwardRef<ImageCaptchaRef, ImageCaptchaProps>(function ImageCaptcha(
  {
    onChange,
    onVerify,
    type = 'numeric',
    className = '',
    label = '人机验证',
    disabled = false,
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null)
  const [answer, setAnswer] = useState('')
  const [sequence, setSequence] = useState<string[]>([])
  const [rotateAngle, setRotateAngle] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [internalType, setInternalType] = useState<ImageCaptchaType>(type)
  const [highContrast, setHighContrast] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const isFetchingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const buildAnswer = useCallback((type: ImageCaptchaType, text: string, seq: string[], angle: number) => {
    if (type === 'sequence') return seq.join(',')
    if (type === 'rotate') return String(angle)
    return text.trim()
  }, [])

  const notifyChange = useCallback((type: ImageCaptchaType, text: string, seq: string[], angle: number) => {
    if (!captcha) return
    const value = buildAnswer(type, text, seq, angle)
    if (value.length > 0) {
      onChange?.({ token: captcha.token, code: value })
    } else {
      onChange?.(null)
    }
  }, [captcha, buildAnswer, onChange])

  const fetchCaptcha = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    if (mountedRef.current) {
      setState('loading')
      setErrorMsg(null)
      setAnswer('')
      setSequence([])
      setRotateAngle(0)
    }

    try {
      const res = await request(`/captcha/image?type=${internalType}&highContrast=${highContrast}`, {
        method: 'GET',
        signal: controller.signal,
      })
      if (!mountedRef.current) return

      // request() 返回结构为 { success, data, message }，data 是后端实际响应
      const backendData = res.data as {
        success: boolean
        type?: ImageCaptchaType
        token?: string
        image?: string
        svg?: string
        hint?: string
        digits?: string[]
        highContrast?: boolean
        message?: string
      } | null

      if (res.success && backendData?.token) {
        const data: CaptchaData = {
          token: backendData.token,
          image: backendData.image,
          svg: backendData.svg,
          hint: backendData.hint || '请完成验证',
          type: backendData.type || internalType,
          digits: backendData.digits,
          highContrast: !!backendData.highContrast,
        }
        setCaptcha(data)
        setAnswer('')
        setSequence([])
        setRotateAngle(0)
        onChange?.(null)
        setState('idle')
      } else {
        throw new Error(backendData?.message || res.message || '获取验证码失败')
      }
    } catch (err) {
      if (!mountedRef.current) return
      if (err instanceof Error && err.name === 'AbortError') return
      setState('error')
      setErrorMsg('验证码加载失败，请点击刷新')
    } finally {
      isFetchingRef.current = false
    }
  }, [internalType, highContrast, onChange])

  const refresh = useCallback(() => {
    fetchCaptcha()
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [fetchCaptcha])

  const switchType = useCallback(() => {
    setInternalType((prev) => {
      const idx = TYPE_ORDER.indexOf(prev)
      return TYPE_ORDER[(idx + 1) % TYPE_ORDER.length]
    })
  }, [])

  const toggleHighContrast = useCallback(() => {
    setHighContrast((prev) => !prev)
  }, [])

  const clear = useCallback(() => {
    setAnswer('')
    setSequence([])
    setRotateAngle(0)
    onChange?.(null)
  }, [onChange])

  useImperativeHandle(ref, () => ({
    refresh,
    focus: () => inputRef.current?.focus(),
    clear,
  }))

  useEffect(() => {
    mountedRef.current = true
    fetchCaptcha()
    return () => {
      mountedRef.current = false
      abortControllerRef.current?.abort()
      // Strict Mode 等场景下前一个请求可能尚未完成 cleanup，重置标记避免下次挂载被误判为正在请求
      isFetchingRef.current = false
    }
  }, [fetchCaptcha])

  // 文本类答案变化时通知父组件
  useEffect(() => {
    if (!captcha) return
    if (captcha.type === 'sequence' || captcha.type === 'rotate') return
    notifyChange(captcha.type, answer, sequence, rotateAngle)
  }, [answer, captcha, notifyChange, sequence, rotateAngle])

  // 顺序点选：为内联 SVG 绑定点击事件
  useEffect(() => {
    if (!captcha || captcha.type !== 'sequence' || !svgContainerRef.current) return

    const container = svgContainerRef.current
    const dots = container.querySelectorAll<SVGGElement>('.captcha-dot')

    const handleClick = (e: Event) => {
      const target = e.currentTarget as SVGGElement
      const id = target.getAttribute('data-id')
      if (!id) return

      setSequence((prev) => {
        if (prev.includes(id)) {
          // 已点选则取消
          const next = prev.filter((x) => x !== id)
          target.querySelector('circle')?.setAttribute('fill', 'var(--bg-secondary, #f4f4f5)')
          if (captcha) notifyChange(captcha.type, answer, next, rotateAngle)
          return next
        }
        const next = [...prev, id]
        target.querySelector('circle')?.setAttribute('fill', 'var(--accent-primary, #000000)')
        if (captcha) notifyChange(captcha.type, answer, next, rotateAngle)
        return next
      })
    }

    dots.forEach((dot) => {
      dot.style.cursor = 'pointer'
      dot.addEventListener('click', handleClick)
    })

    return () => {
      dots.forEach((dot) => dot.removeEventListener('click', handleClick))
    }
  }, [captcha, answer, rotateAngle, notifyChange])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = buildAnswer(internalType, answer, sequence, rotateAngle)
      if (captcha && value) {
        onVerify?.({ token: captcha.token, code: value })
      }
    }
  }

  const speakDigits = useCallback(() => {
    if (!captcha?.digits || !('speechSynthesis' in window)) return
    const utter = new SpeechSynthesisUtterance(captcha.digits.join('，'))
    utter.lang = 'zh-CN'
    utter.rate = 0.85
    utter.pitch = 1
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }, [captcha])

  // 检测语音合成可用性
  useEffect(() => {
    if ('speechSynthesis' in window) {
      setAudioReady(true)
    }
  }, [])

  const renderCaptchaArea = () => {
    if (state === 'loading' || !captcha) {
      return (
        <div className="flex h-full w-full items-center justify-center gap-2 text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs">加载中…</span>
        </div>
      )
    }

    if (captcha.type === 'audio') {
      return (
        <button
          type="button"
          onClick={speakDigits}
          disabled={!audioReady}
          className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-50"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <Volume2 size={28} />
          <span className="text-xs">{audioReady ? '点击播放语音' : '当前浏览器不支持语音播放'}</span>
        </button>
      )
    }

    if (captcha.type === 'sequence' && captcha.svg) {
      return (
        <div
          ref={svgContainerRef}
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl"
          dangerouslySetInnerHTML={{ __html: captcha.svg }}
          title={captcha.hint}
        />
      )
    }

    return (
      <motion.img
        key={captcha.token}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.04 }}
        transition={{ duration: 0.25 }}
        src={captcha.image}
        alt={captcha.hint}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    )
  }

  const renderInputArea = () => {
    if (!captcha) return null

    if (captcha.type === 'rotate') {
      return (
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={359}
              value={rotateAngle}
              onChange={(e) => {
                const angle = parseInt(e.target.value, 10)
                setRotateAngle(angle)
                notifyChange(captcha.type, answer, sequence, angle)
              }}
              disabled={disabled}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[var(--bg-secondary)] accent-[var(--accent-primary)]"
              aria-label="旋转角度"
            />
            <span className="w-10 text-right text-sm font-medium text-[var(--text-primary)]">{rotateAngle}°</span>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">拖动滑块旋转指针，使其指向圆点</p>
        </div>
      )
    }

    if (captcha.type === 'sequence') {
      return (
        <div className="flex-1">
          <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border bg-[var(--bg-secondary)] px-3 py-2" style={{ borderColor: 'var(--border-primary)' }}>
            {sequence.length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">按 1-2-3-4 顺序点选上方圆点</span>
            ) : (
              sequence.map((id, idx) => (
                <span
                  key={`${id}-${idx}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-primary)]/10 text-xs font-semibold text-[var(--accent-primary)]"
                >
                  {id}
                </span>
              ))
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSequence([])
                notifyChange(captcha.type, answer, [], rotateAngle)
              }}
              className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)]"
            >
              <RotateCcw size={11} />
              重新点选
            </button>
          </div>
        </div>
      )
    }

    const maxLength = captcha.type === 'math' ? 3 : 4
    const placeholder = captcha.type === 'math' ? '计算结果' : captcha.type === 'audio' ? '输入听到的数字' : '请输入 4 位数字'

    return (
      <div className="flex-1">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={maxLength}
          value={answer}
          onChange={(e) => setAnswer(e.target.value.replace(/[^0-9\-]/g, ''))}
          onKeyDown={handleKeyDown}
          disabled={disabled || !captcha}
          placeholder={placeholder}
          className="w-full rounded-xl border bg-[var(--bg-secondary)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/10 disabled:opacity-60"
          style={{ borderColor: 'var(--border-primary)' }}
          aria-label={captcha.hint || label}
        />
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
          {captcha.type === 'audio' ? '如听不清可点击上方按钮重播' : '点击图片可刷新，输入图中的内容'}
        </p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border bg-[var(--bg-card)] p-4 transition-shadow hover:shadow-sm ${className}`}
      style={{ borderColor: 'var(--border-primary)' }}
      role="region"
      aria-label={label}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
          <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
            {typeLabel(internalType)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleHighContrast}
            disabled={state === 'loading' || internalType === 'audio'}
            className={`rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50 ${highContrast ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`}
            title={highContrast ? '关闭高对比度' : '开启高对比度'}
            aria-pressed={highContrast}
          >
            <Contrast size={14} />
          </button>
          <button
            type="button"
            onClick={switchType}
            disabled={state === 'loading'}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="切换验证类型"
          >
            <Type size={14} />
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={disabled || state === 'loading'}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="刷新验证码"
          >
            <RefreshCw size={14} className={state === 'loading' ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={refresh}
          disabled={disabled || state === 'loading' || internalType === 'sequence'}
          className="group relative flex h-[120px] w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border bg-[var(--bg-secondary)] sm:h-[140px] sm:w-[160px]"
          style={{ borderColor: 'var(--border-primary)' }}
          title={captcha?.hint || '点击刷新验证码'}
        >
          <AnimatePresence mode="wait">
            {renderCaptchaArea()}
          </AnimatePresence>

          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5" />
        </button>

        {renderInputArea()}
      </div>

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] px-3 py-2 text-xs text-[var(--text-primary)]"
          >
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
