// ===== 高级音效系统 =====
// 设计目标：舒缓、高级、不机械。全部使用 WebAudio 实时合成，
// 通过共享混响总线营造空间感，波形以 sine/triangle 为主避免刺耳，
// 音量整体偏低（0.08-0.2），包络采用平滑 attack / 指数 release。

type AudioContextType = typeof AudioContext

let sharedCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let reverbBus: DelayNode | null = null

// 混响反馈延迟，营造"余音绕梁"的高级空间感
function getReverb(ctx: AudioContext): DelayNode {
  const delay = ctx.createDelay(1.0)
  delay.delayTime.value = 0.18
  const feedback = ctx.createGain()
  feedback.gain.value = 0.32 // 反馈量，控制回声衰减时间
  const wet = ctx.createGain()
  wet.gain.value = 0.35 // 干湿比
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  wet.connect(ctx.destination)
  return delay
}

function getAudioContext(): AudioContext | null {
  try {
    const AC = window.AudioContext || ((window as unknown as { webkitAudioContext?: AudioContextType }).webkitAudioContext as AudioContextType | undefined)
    if (!AC) return null
    if (!sharedCtx) {
      sharedCtx = new AC()
      masterGain = sharedCtx.createGain()
      masterGain.gain.value = 1
      masterGain.connect(sharedCtx.destination)
      reverbBus = getReverb(sharedCtx)
    }
    return sharedCtx
  } catch {
    return null
  }
}

// 播放一个带泛音与混响的音符
interface ToneOptions {
  freq: number
  vol?: number
  start?: number
  duration?: number
  attack?: number
  type?: OscillatorType
  detune?: number
  useReverb?: boolean
}

function playTone({ freq, vol = 0.1, start = 0, duration = 0.6, attack = 0.05, type = 'sine', detune = 0, useReverb = true }: ToneOptions) {
  const ctx = getAudioContext()
  if (!ctx || !masterGain) return
  const now = ctx.currentTime + start

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.detune.value = detune
  osc.connect(gain)
  gain.connect(masterGain)

  // 干信号
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(vol, now + attack)
  gain.gain.setValueAtTime(vol, now + attack + 0.1)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  // 送入混响总线（若有）
  if (useReverb && reverbBus) {
    const rvGain = ctx.createGain()
    rvGain.gain.value = 0.5
    gain.connect(rvGain)
    rvGain.connect(reverbBus)
  }

  osc.start(now)
  osc.stop(now + duration + 0.1)
}

// 成功：明亮上行琶音，带轻微闪亮泛音
export function playSuccessSound() {
  const freqs = [523.25, 659.25, 783.99, 1046.5]
  freqs.forEach((f, i) => {
    playTone({ freq: f, vol: 0.1, start: i * 0.07, duration: 0.7, type: 'sine' })
    playTone({ freq: f * 2, vol: 0.03, start: i * 0.07, duration: 0.5, type: 'sine' })
  })
  playTone({ freq: 261.63, vol: 0.05, start: 0, duration: 1.0, type: 'triangle' })
}

// 升级 / 成就解锁：五声音阶上行 + 低音铺底 + 尾音火花
export function playUpgradeSound() {
  const freqs = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]
  freqs.forEach((f, i) => {
    playTone({ freq: f, vol: 0.08, start: i * 0.09, duration: 0.5, type: 'sine' })
    playTone({ freq: f * 1.5, vol: 0.02, start: i * 0.09, duration: 0.4, type: 'triangle' })
  })
  playTone({ freq: 261.63, vol: 0.05, start: 0, duration: 1.3, type: 'sine' })
  playTone({ freq: 130.81, vol: 0.04, start: 0.05, duration: 1.5, type: 'triangle' })
  // 尾音：高音火花
  playTone({ freq: 1568, vol: 0.025, start: 0.55, duration: 0.8, type: 'sine' })
}

// 课程/卡片选择：温暖钟声，泛音丰富
export function playCourseSelectSound() {
  const harmonics = [
    { freq: 261.63, vol: 0.06, delay: 0 },
    { freq: 329.63, vol: 0.04, delay: 0.02 },
    { freq: 392.0, vol: 0.035, delay: 0.04 },
    { freq: 523.25, vol: 0.025, delay: 0.06 },
  ]
  harmonics.forEach(({ freq, vol, delay }) => {
    playTone({ freq, vol, start: delay, duration: 0.9, attack: 0.06, type: 'sine' })
    playTone({ freq: freq * 2, vol: vol * 0.3, start: delay, duration: 0.6, attack: 0.06, type: 'sine' })
  })
}

// 首页悬停：极轻柔的呼吸感低音
export function playHomePageHoverSound() {
  playTone({ freq: 220, vol: 0.018, duration: 0.5, attack: 0.1, type: 'triangle', useReverb: false })
  playTone({ freq: 330, vol: 0.012, duration: 0.4, attack: 0.12, type: 'sine', useReverb: false })
}

// 柔和点击：短促、圆润，不刺耳（用于按钮/导航轻微反馈）
export function playClickSound() {
  playTone({ freq: 660, vol: 0.05, duration: 0.12, attack: 0.005, type: 'sine', useReverb: false })
  playTone({ freq: 990, vol: 0.025, duration: 0.1, attack: 0.005, type: 'sine', useReverb: false })
}

// 通知：双音提示，轻柔但可辨识
export function playNotificationSound() {
  playTone({ freq: 587.33, vol: 0.06, duration: 0.35, attack: 0.02, type: 'sine' })
  playTone({ freq: 880, vol: 0.05, duration: 0.5, attack: 0.02, type: 'sine', start: 0.12 })
}

// 私信/消息：温暖的双音下行，预示有人联系
export function playMessageSound() {
  playTone({ freq: 659.25, vol: 0.06, duration: 0.4, attack: 0.02, type: 'sine' })
  playTone({ freq: 523.25, vol: 0.06, duration: 0.5, attack: 0.02, type: 'sine', start: 0.14 })
}

// 错误/提示：柔和下降音，不制造焦虑
export function playErrorSound() {
  playTone({ freq: 392, vol: 0.05, duration: 0.3, attack: 0.02, type: 'sine' })
  playTone({ freq: 330, vol: 0.05, duration: 0.4, attack: 0.02, type: 'sine', start: 0.12 })
  playTone({ freq: 294, vol: 0.04, duration: 0.5, attack: 0.02, type: 'sine', start: 0.24 })
}

// 对战/竞技开始：短促上行，营造期待感
export function playBattleStartSound() {
  playTone({ freq: 523.25, vol: 0.06, duration: 0.2, attack: 0.01, type: 'triangle' })
  playTone({ freq: 659.25, vol: 0.06, duration: 0.25, attack: 0.01, type: 'triangle', start: 0.12 })
  playTone({ freq: 783.99, vol: 0.07, duration: 0.4, attack: 0.01, type: 'triangle', start: 0.26 })
}

// 触觉反馈
export function triggerHaptic(pattern: number | number[] = 40) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  } catch {}
}