let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []
let startTime = 0
let recordingState: 'idle' | 'recording' | 'stopped' = 'idle'
let stream: MediaStream | null = null
let resolveCallback: ((blob: Blob | null) => void) | null = null

export async function startRecording(): Promise<{ startTime: number }> {
  if (!isRecordingSupported()) {
    throw new Error('Screen recording is not supported in this browser')
  }

  if (recordingState === 'recording') {
    throw new Error('A recording is already in progress')
  }

  recordedChunks = []

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  } catch (err) {
    recordingState = 'idle'
    stream = null
    throw new Error('User cancelled or denied screen sharing')
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm'

  mediaRecorder = new MediaRecorder(stream, { mimeType })

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data)
    }
  }

  mediaRecorder.onstop = () => {
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    recordingState = 'stopped'

    if (recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: mimeType })
      resolveCallback?.(blob)
    } else {
      resolveCallback?.(null)
    }
    resolveCallback = null
  }

  mediaRecorder.onerror = () => {
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    mediaRecorder = null
    recordingState = 'idle'
    resolveCallback?.(null)
    resolveCallback = null
  }

  mediaRecorder.start()
  startTime = Date.now()
  recordingState = 'recording'

  return { startTime }
}

export function stopRecording(): Promise<Blob | null> {
  if (!mediaRecorder || recordingState !== 'recording') {
    return Promise.resolve(null)
  }

  return new Promise<Blob | null>(resolve => {
    resolveCallback = resolve
    mediaRecorder?.stop()
  })
}

export function getRecordingState(): 'idle' | 'recording' | 'stopped' {
  return recordingState
}

export function getDuration(): number {
  if (startTime === 0) return 0
  return Math.floor((Date.now() - startTime) / 1000)
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function isRecordingSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}