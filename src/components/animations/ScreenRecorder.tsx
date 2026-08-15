import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Monitor, Square, Download, AlertCircle, CheckCircle2, X, Info, Play, Pause, RotateCcw, Upload } from 'lucide-react'
import InlineLoading from '../ui/InlineLoading'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { getCsrfToken } from '../../utils/api'

export interface RecordedVideo {
  blob: Blob
  url: string
  duration: number
  size: number
  mimeType: string
  createdAt: Date
}

export interface ScreenRecorderProps {
  onVideoReady?: (video: RecordedVideo) => void
  maxDurationSeconds?: number
  className?: string
  autoUpload?: boolean
  uploadEndpoint?: string
  onUploadComplete?: (url: string) => void
  onUploadError?: (error: string) => void
}

export default function ScreenRecorder({
  onVideoReady,
  maxDurationSeconds = 300,
  className = '',
  autoUpload = false,
  uploadEndpoint = '/api/bug-report/upload-video',
  onUploadComplete,
  onUploadError,
}: ScreenRecorderProps) {
  const reduced = useReducedMotion()
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [recordedVideo, setRecordedVideo] = useState<RecordedVideo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [includeAudio, setIncludeAudio] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const stopTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      cleanupRecording()
      if (timerRef.current) clearInterval(timerRef.current)
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current)
    }
  }, [])

  const cleanupRecording = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (recordedVideo?.url) {
      try { URL.revokeObjectURL(recordedVideo.url) } catch {}
    }
  }, [recordedVideo])

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    setElapsedTime(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setElapsedTime(elapsed)

      if (elapsed >= maxDurationSeconds) {
        stopRecording()
      }
    }, 100)
  }, [maxDurationSeconds])

  const startRecording = useCallback(async () => {
    setError(null)
    setIsPreparing(true)

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('当前浏览器不支持屏幕录制功能。请使用 Chrome 89+、Edge 89+、Firefox 106+ 等现代浏览器。')
      }

      let stream: MediaStream

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            frameRate: { ideal: 30, max: 60 },
            width: { ideal: 1920, max: 3840 },
            height: { ideal: 1080, max: 2160 },
          } as any,
        } as any

        if (includeAudio && navigator.mediaDevices?.getUserMedia) {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            constraints.audio = true
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: constraints.video })
            audioStream.getAudioTracks().forEach(t => displayStream.addTrack(t))
            stream = displayStream
          } catch (audioErr) {
            if (audioErr instanceof DOMException && audioErr.name === 'NotAllowedError') {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: constraints.video })
            } else {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: constraints.video })
            }
          }
        } else {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: constraints.video })
        }
      } catch (e) {
        if (e instanceof DOMException) {
          if (e.name === 'NotAllowedError') {
            throw new Error('你取消了屏幕共享授权')
          }
          if (e.name === 'NotFoundError') {
            throw new Error('没有可用的屏幕源')
          }
          if (e.name === 'NotReadableError') {
            throw new Error('屏幕源被其他应用占用，请关闭后重试')
          }
        }
        throw e
      }

      streamRef.current = stream

      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
      let selectedMime: string | undefined
      for (const m of mimeCandidates) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m
          break
        }
      }

      const recorder = new MediaRecorder(stream!, selectedMime ? { mimeType: selectedMime, videoBitsPerSecond: 8_000_000 } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const url = URL.createObjectURL(blob)

        const video: RecordedVideo = {
          blob,
          url,
          duration: elapsedTime,
          size: blob.size,
          mimeType,
          createdAt: new Date(),
        }
        setRecordedVideo(video)
        onVideoReady?.(video)

        cleanupRecording()
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        setIsRecording(false)
        setIsPaused(false)

        if (autoUpload) {
          uploadVideo(blob)
        }
      }

      recorder.onerror = (e: any) => {
        console.error('MediaRecorder error:', e)
        setError('录制过程出错：' + (e?.error?.message || '未知错误'))
        setIsRecording(false)
      }

      if (previewRef.current && stream) {
        previewRef.current.srcObject = stream
        previewRef.current.muted = true
        previewRef.current.play().catch(() => {})
      }

      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (recorderRef.current?.state === 'recording') {
            stopRecording()
          }
        })
      })

      recorder.start(1000)
      setIsRecording(true)
      setIsPaused(false)
      setIsPreparing(false)
      startTimer()
    } catch (e) {
      setIsPreparing(false)
      const msg = e instanceof Error ? e.message : '启动录制失败'
      setError(msg)
    }
  }, [includeAudio, elapsedTime, onVideoReady, autoUpload, cleanupRecording, startTimer])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch (e) {
        console.error('Stop failed:', e)
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  const pauseRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') {
      recorder.pause()
      setIsPaused(true)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const resumeRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'paused') {
      recorder.resume()
      setIsPaused(false)
      const currentElapsed = elapsedTime
      startTimeRef.current = Date.now() - currentElapsed * 1000
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = window.setInterval(() => {
        const e = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setElapsedTime(e)
        if (e >= maxDurationSeconds) stopRecording()
      }, 100)
    }
  }, [elapsedTime, maxDurationSeconds, stopRecording])

  const discardRecording = useCallback(() => {
    if (recordedVideo?.url) {
      try { URL.revokeObjectURL(recordedVideo.url) } catch {}
    }
    setRecordedVideo(null)
    setUploadedUrl(null)
    setUploadProgress(0)
    setElapsedTime(0)
  }, [recordedVideo])

  const downloadVideo = useCallback(() => {
    if (!recordedVideo) return
    const a = document.createElement('a')
    a.href = recordedVideo.url
    const ext = recordedVideo.mimeType.includes('mp4') ? 'mp4' : 'webm'
    a.download = `bug-recording-${Date.now()}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [recordedVideo])

  const uploadVideo = useCallback(async (blob: Blob) => {
    if (!uploadEndpoint) return
    setIsUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const fd = new FormData()
      fd.append('video', blob, `recording-${Date.now()}.${ext}`)

      // 文件上传无法通过自定义 header 携带 CSRF token，改为通过 form field 携带
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        fd.append('_csrf', csrfToken)
      }

      const xhr = new XMLHttpRequest()
      // 文件上传在 multipart 解析前无法从 body 读取 CSRF token，改为通过 query 携带
      const uploadUrl = csrfToken ? `${uploadEndpoint}?_csrf=${encodeURIComponent(csrfToken)}` : uploadEndpoint
      xhr.open('POST', uploadUrl, true)
      xhr.withCredentials = true
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        setIsUploading(false)
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText)
            const url = result?.data?.url || result?.url
            if (url) {
              setUploadedUrl(url)
              onUploadComplete?.(url)
            } else {
              onUploadComplete?.('')
            }
          } catch {
            onUploadComplete?.('')
          }
        } else {
          const err = `上传失败 (${xhr.status})`
          setError(err)
          onUploadError?.(err)
        }
      }
      xhr.onerror = () => {
        setIsUploading(false)
        const err = '网络错误，上传失败'
        setError(err)
        onUploadError?.(err)
      }
      xhr.send(fd)
    } catch (e) {
      setIsUploading(false)
      const err = e instanceof Error ? e.message : '上传失败'
      setError(err)
      onUploadError?.(err)
    }
  }, [uploadEndpoint, onUploadComplete, onUploadError])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div className={`screen-recorder ${className}`}>
      <AnimatePresence mode="wait">
        {!isRecording && !recordedVideo && !isPreparing && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <motion.button
              type="button"
              whileHover={reduced ? {} : { scale: 1.02 }}
              whileTap={reduced ? {} : { scale: 0.98 }}
              onClick={startRecording}
              className="w-full p-4 rounded-xl border-2 border-dashed border-[var(--border-primary)] hover:border-[var(--accent-primary)] bg-gradient-to-br from-[var(--bg-secondary)] to-transparent hover:from-[var(--bg-tertiary)] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
                  <Monitor className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[var(--text-primary)]">录制屏幕</div>
                  <div className="text-sm text-[var(--text-tertiary)]">录制问题重现过程，管理员可以更直观地定位问题</div>
                </div>
                <div className="w-3 h-3 rounded-full bg-[var(--error)] animate-pulse" />
              </div>
            </motion.button>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--accent-primary)]"
              />
              <span>同时录制系统声音和麦克风</span>
            </label>

            <div className="text-xs text-[var(--text-tertiary)] flex items-start gap-2 p-2 rounded-lg bg-[var(--bg-tertiary)]/50">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>
                浏览器将弹出系统级权限请求，选择要共享的窗口或整个屏幕。最大时长 {Math.floor(maxDurationSeconds / 60)} 分钟。
              </div>
            </div>
          </motion.div>
        )}

        {isPreparing && (
          <motion.div
            key="preparing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center gap-3"
          >
            <InlineLoading size="md" color="primary" />
            <span className="text-sm text-[var(--text-secondary)]">正在准备录制环境...</span>
          </motion.div>
        )}

        {isRecording && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-xl overflow-hidden border-2 border-[var(--error)]/50 bg-black shadow-2xl"
          >
            <div className="relative aspect-video bg-black">
              <video
                ref={previewRef}
                className="w-full h-full object-contain"
                autoPlay
                muted
                playsInline
              />
              {!streamRef.current?.getVideoTracks().length && (
                <div className="absolute inset-0 flex items-center justify-center text-white/70">
                  <div className="text-center">
                    <InlineLoading size="lg" color="primary" className="mx-auto mb-2" />
                    <p className="text-sm">等待屏幕流...</p>
                  </div>
                </div>
              )}

              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md">
                <motion.div
                  className="w-2.5 h-2.5 rounded-full bg-[var(--error)]"
                  animate={isPaused ? {} : { opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-white text-xs font-mono font-semibold">
                  {isPaused ? '已暂停' : 'REC'} {formatTime(elapsedTime)} / {formatTime(maxDurationSeconds)}
                </span>
              </div>

              <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/60 backdrop-blur-md text-white text-xs font-mono">
                {((recordedVideo?.size || 0) / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-secondary)] flex items-center gap-2">
              {isPaused ? (
                <motion.button
                  whileHover={reduced ? {} : { scale: 1.05 }}
                  whileTap={reduced ? {} : { scale: 0.95 }}
                  onClick={resumeRecording}
                  className="flex-1 py-2.5 rounded-lg bg-[var(--accent-primary)] text-white font-medium flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" /> 继续
                </motion.button>
              ) : (
                <motion.button
                  whileHover={reduced ? {} : { scale: 1.05 }}
                  whileTap={reduced ? {} : { scale: 0.95 }}
                  onClick={pauseRecording}
                  className="flex-1 py-2.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium flex items-center justify-center gap-2"
                >
                  <Pause className="w-4 h-4" /> 暂停
                </motion.button>
              )}
              <motion.button
                whileHover={reduced ? {} : { scale: 1.05 }}
                whileTap={reduced ? {} : { scale: 0.95 }}
                onClick={stopRecording}
                className="flex-1 py-2.5 rounded-lg bg-[var(--error)] text-white font-medium flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" /> 停止
              </motion.button>
            </div>
          </motion.div>
        )}

        {recordedVideo && !isRecording && (
          <motion.div
            key="recorded"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
          >
            <div className="relative aspect-video bg-black">
              <video
                src={recordedVideo.url}
                className="w-full h-full object-contain"
                controls
                playsInline
              />
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" />
                <span>录制完成 · {formatTime(recordedVideo.duration)} · {formatSize(recordedVideo.size)}</span>
              </div>
            </div>

            {isUploading && (
              <div className="p-3 border-t border-[var(--border-primary)]">
                <div className="flex items-center gap-2 mb-2">
                  <InlineLoading size="sm" color="primary" />
                  <span className="text-sm text-[var(--text-secondary)]">上传中... {uploadProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {uploadedUrl && !isUploading && (
              <div className="p-3 border-t border-[var(--border-primary)] flex items-center gap-2 text-sm text-[var(--success)]">
                <CheckCircle2 className="w-4 h-4" />
                <span>视频已上传到服务器，管理员可在后台查看</span>
              </div>
            )}

            <div className="p-3 border-t border-[var(--border-primary)] flex flex-wrap gap-2">
              <motion.button
                whileHover={reduced ? {} : { scale: 1.03 }}
                whileTap={reduced ? {} : { scale: 0.97 }}
                onClick={downloadVideo}
                className="flex-1 min-w-[120px] py-2 px-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-quaternary)] text-[var(--text-primary)] text-sm font-medium flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> 下载
              </motion.button>
              {!autoUpload && !uploadedUrl && (
                <motion.button
                  whileHover={reduced ? {} : { scale: 1.03 }}
                  whileTap={reduced ? {} : { scale: 0.97 }}
                  onClick={() => uploadVideo(recordedVideo.blob)}
                  disabled={isUploading}
                  className="flex-1 min-w-[120px] py-2 px-3 rounded-lg bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" /> 上传到服务器
                </motion.button>
              )}
              <motion.button
                whileHover={reduced ? {} : { scale: 1.03 }}
                whileTap={reduced ? {} : { scale: 0.97 }}
                onClick={discardRecording}
                className="py-2 px-3 rounded-lg bg-[var(--error)]/10 hover:bg-[var(--error)]/20 text-[var(--error)] text-sm font-medium flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> 重录
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30 text-[var(--error)] text-sm flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </div>
  )
}