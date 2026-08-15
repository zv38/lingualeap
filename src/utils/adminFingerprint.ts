export interface EnvironmentFingerprint {
  canvas: string
  webgl: string
  timezone: string
  language: string
  screen: string
  hardwareConcurrency: number
  platform: string
  userAgent: string
}

export async function collectEnvironmentFingerprint(): Promise<EnvironmentFingerprint> {
  const fingerprint: EnvironmentFingerprint = {
    canvas: getCanvasFingerprint(),
    webgl: getWebGLFingerprint(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    platform: navigator.platform || '',
    userAgent: navigator.userAgent,
  }
  return fingerprint
}

function getCanvasFingerprint(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 50
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#27272a'
  ctx.fillRect(0, 0, 200, 50)
  ctx.fillStyle = '#52525b'
  ctx.font = '14px Arial'
  ctx.fillText('LinguaLeap Admin', 10, 30)
  ctx.fillStyle = '#ffffff'
  ctx.font = '12px monospace'
  ctx.fillText(String(Date.now() % 100000), 10, 45)
  return hashString(canvas.toDataURL())
}

function getWebGLFingerprint(): string {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
  if (!gl) return ''
  const renderer = String(gl.getParameter(gl.RENDERER) || '')
  const vendor = String(gl.getParameter(gl.VENDOR) || '')
  return hashString(`${vendor}:${renderer}`)
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}