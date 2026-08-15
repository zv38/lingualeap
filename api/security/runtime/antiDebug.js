// ============================================================
// Anti-Debug — Node.js 后端反调试检测
// 职责：
//   1. 检测调试器附加（基于执行时间异常与 Node 调试参数）
//   2. 检测异常长时间执行（单次检测耗时超过阈值视为可疑）
//   3. 检测常见调试环境变量与进程标志
//   4. 以非侵入方式持续监控，避免中断正常业务
// ============================================================

import { logAudit } from '../core/auditLogger.js'

const DEBUG_ENV_KEYS = [
  'DEBUG',
  'NODE_DEBUG',
  'INSPECTOR_PORT',
  'WEBSTORM_DEBUG',
  'INTELLIJ_DEBUG',
  'DEBUGPY_RUNNING',
]

// IDE 正常环境变量，不触发告警
const IGNORED_ENV_KEYS = [
  'VSCODE_PID',
  'VSCODE_CWD',
  'VSCODE_NLS_CONFIG',
  'TRAE_SANDBOX_TRACE_FILE',
  'TRAE_PID',
]

const DEBUG_ENV_PATTERNS = [
  /inspect/i,
  /debug/i,
  /trace/i,
]

const DEBUG_PROCESS_ARGS = [
  '--inspect',
  '--inspect-brk',
  '--inspect-port',
  '--debug',
  '--debug-brk',
  '--experimental-loader',
  '--loader',
  '--require',
  '-r',
]

const state = {
  enabled: true,
  lastCheckAt: null,
  detections: [],
  totalChecks: 0,
  suspiciousCount: 0,
  thresholdMs: Number(process.env.ANTI_DEBUG_THRESHOLD_MS || 200),
  maxDetections: 100,
}

function recordDetection(type, detail, serious = false) {
  const entry = { type, detail, at: new Date().toISOString(), serious }
  state.detections.push(entry)
  if (state.detections.length > state.maxDetections) state.detections.shift()
  state.suspiciousCount++
  logAudit({
    userId: 'system',
    action: 'anti_debug_detection',
    details: { type, detail, serious },
    success: false,
  })
  console.error(`[AntiDebug] 可疑: ${type} | ${detail}`)
}

/**
 * 基于执行时间异常检测调试器：调试器断点会显著放大函数执行耗时。
 */
function detectTimingAnomaly() {
  const samples = []
  const iterations = 5
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint()
    // eslint-disable-next-line no-debugger
    debugger // 若调试器附加，此处断点会导致极端耗时
    const end = process.hrtime.bigint()
    samples.push(Number(end - start) / 1e6)
  }
  const maxMs = Math.max(...samples)
  return { maxMs, samples, suspicious: maxMs > state.thresholdMs }
}

function detectDebuggerArgs() {
  const args = process.execArgv.concat(process.argv.slice(2))
  const found = []
  for (const arg of args) {
    for (const flag of DEBUG_PROCESS_ARGS) {
      if (arg === flag || arg.startsWith(`${flag}=`)) {
        found.push(arg)
      }
    }
  }
  return found
}

function detectDebugEnvironment() {
  const found = []
  for (const key of DEBUG_ENV_KEYS) {
    if (process.env[key]) {
      found.push({ key, value: 'present' })
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    // 跳过已知的 IDE 正常环境变量
    if (IGNORED_ENV_KEYS.includes(key)) continue
    for (const pattern of DEBUG_ENV_PATTERNS) {
      if (pattern.test(key) && !DEBUG_ENV_KEYS.includes(key)) {
        found.push({ key, value: 'matches debug pattern' })
        break
      }
    }
    if (/\binspect\b/i.test(value || '') && /port|brk|url/i.test(value || '')) {
      found.push({ key, value: 'contains inspect directive' })
    }
  }
  return found
}

function detectLongExecution() {
  const start = Date.now()
  let sum = 0
  for (let i = 0; i < 1e6; i++) sum += i
  const elapsed = Date.now() - start
  // 正常 CPU 运算应远低于阈值；调试器单步执行会显著放大
  return { elapsed, suspicious: elapsed > state.thresholdMs * 5, sum }
}

/**
 * 执行一次完整的反调试检测，返回结果但不抛出异常。
 */
export function detectAntiDebug() {
  if (!state.enabled) return { enabled: false }

  state.totalChecks++
  const result = {
    at: new Date().toISOString(),
    suspicious: false,
    findings: [],
  }

  try {
    const timing = detectTimingAnomaly()
    if (timing.suspicious) {
      recordDetection('TIMING_ANOMALY', `单次检测最大耗时 ${timing.maxMs.toFixed(2)}ms，疑似调试器断点`, true)
      result.findings.push({ type: 'TIMING_ANOMALY', ...timing })
      result.suspicious = true
    }

    const args = detectDebuggerArgs()
    if (args.length) {
      recordDetection('DEBUG_PROCESS_ARGS', `进程参数包含调试标志: ${args.join(', ')}`, true)
      result.findings.push({ type: 'DEBUG_PROCESS_ARGS', args })
      result.suspicious = true
    }

    const env = detectDebugEnvironment()
    if (env.length) {
      recordDetection('DEBUG_ENVIRONMENT', `检测到调试相关环境变量: ${env.map(e => e.key).join(', ')}`, false)
      result.findings.push({ type: 'DEBUG_ENVIRONMENT', env })
      result.suspicious = true
    }

    const exec = detectLongExecution()
    if (exec.suspicious) {
      recordDetection('LONG_EXECUTION', `基准运算耗时 ${exec.elapsed}ms，存在异常暂停`, true)
      result.findings.push({ type: 'LONG_EXECUTION', elapsed: exec.elapsed })
      result.suspicious = true
    }
  } catch (err) {
    recordDetection('CHECK_ERROR', err.message, false)
    result.findings.push({ type: 'CHECK_ERROR', message: err.message })
  }

  state.lastCheckAt = result.at
  return result
}

let timer = null

/**
 * 启动周期性反调试监控。
 */
export function startAntiDebugMonitoring(intervalMs = 30 * 1000) {
  if (timer) return { alreadyRunning: true }
  timer = setInterval(() => {
    detectAntiDebug()
  }, Math.max(5000, intervalMs))
  timer.unref?.()
  return { started: true, intervalMs }
}

export function stopAntiDebugMonitoring() {
  if (timer) {
    clearInterval(timer)
    timer = null
    return { stopped: true }
  }
  return { stopped: false }
}

export function setAntiDebugEnabled(enabled) {
  state.enabled = !!enabled
}

export function getAntiDebugStatus(limit = 20) {
  return {
    enabled: state.enabled,
    lastCheckAt: state.lastCheckAt,
    totalChecks: state.totalChecks,
    suspiciousCount: state.suspiciousCount,
    thresholdMs: state.thresholdMs,
    detections: state.detections.slice(-limit),
  }
}

export default {
  detectAntiDebug,
  startAntiDebugMonitoring,
  stopAntiDebugMonitoring,
  setAntiDebugEnabled,
  getAntiDebugStatus,
}
