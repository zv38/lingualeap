// 智能化人机验证前端信号采集
// 与后端 api/security/humanVerification.js 配套使用

export interface HumanSignals {
  timeOnPage: number
  mouseMoveCount: number
  keyPressCount: number
  scrollCount: number
  screenWidth: number
  screenHeight: number
  timezone: string
}

let collectedSignals: HumanSignals = {
  timeOnPage: 0,
  mouseMoveCount: 0,
  keyPressCount: 0,
  scrollCount: 0,
  screenWidth: window.innerWidth,
  screenHeight: window.innerHeight,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

let pageEnterTime = Date.now()
let listenersAttached = false

function attachListeners() {
  if (listenersAttached) return
  listenersAttached = true

  const increment = (key: keyof HumanSignals) => {
    ;(collectedSignals[key] as number)++
  }

  window.addEventListener('mousemove', () => increment('mouseMoveCount'), { passive: true })
  window.addEventListener('keydown', () => increment('keyPressCount'), { passive: true })
  window.addEventListener('scroll', () => increment('scrollCount'), { passive: true })

  setInterval(() => {
    collectedSignals.timeOnPage = Date.now() - pageEnterTime
  }, 500)
}

export function startHumanSignalCollection() {
  pageEnterTime = Date.now()
  collectedSignals = {
    timeOnPage: 0,
    mouseMoveCount: 0,
    keyPressCount: 0,
    scrollCount: 0,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
  attachListeners()
}

export function getHumanSignals(): HumanSignals {
  return {
    ...collectedSignals,
    timeOnPage: Date.now() - pageEnterTime,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
  }
}

export async function requestHumanChallenge(): Promise<string | null> {
  try {
    const res = await fetch('/api/human-challenge', { cache: 'no-store' })
    const result = await res.json()
    if (result.success && result.data?.token) {
      return result.data.token
    }
    return null
  } catch {
    return null
  }
}
