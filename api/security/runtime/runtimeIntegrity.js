// ============================================================
// Runtime Integrity — 运行态完整性检查
// 职责：
//   1. 检测关键文件是否被修改（复用 fileGuardian 基线校验）
//   2. 检测异常模块加载（可疑 CJS 缓存 / 原生模块）
//   3. 统计内存中敏感字符串数量（仅计数，不输出值）
//   4. 提供周期性运行态完整性报告
// ============================================================

import { createRequire } from 'module'
import { verifyIntegrity } from '../privacy/fileGuardian.js'
import { logAudit } from '../core/auditLogger.js'

const require = createRequire(import.meta.url)

const isDev = process.env.NODE_ENV !== 'production'

const SUSPICIOUS_MODULE_PATTERNS = [
  // 开发环境放宽检测：点文件（.eslintrc.js 等）是正常配置，不触发
  ...(isDev ? [] : [/[\\/]\.[a-zA-Z0-9_]+\.js$/]),
  /[\\/](?:patch|inject|hook|exploit|reverse|shell|spawn|backdoor|trojan)[^\\/]*\.js$/i,
  /[\\/]node_modules\/[a-z0-9]{20,}[\\/]/,
]

const SUSPICIOUS_NATIVE_MODULES = [
  'NativeModule inspector',
]

const SECRET_PATTERNS = [
  { name: 'jwt_token', regex: /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g },
  { name: 'private_key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'bearer_token', regex: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi },
  { name: 'api_key', regex: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi },
  { name: 'password', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}/gi },
]

const state = {
  lastCheckAt: null,
  checksRun: 0,
  fileChanges: [],
  moduleFindings: [],
  memoryFindings: [],
  serious: false,
}

function logFinding(type, detail, serious = false) {
  if (serious) state.serious = true
  logAudit({
    userId: 'system',
    action: 'runtime_integrity_finding',
    details: { type, detail, serious },
    success: false,
  })
  console.log('')
  console.log(`\x1b[${serious ? '41' : '43'}m\x1b[37m ■ RuntimeIntegrity \x1b[0m ${serious ? '严重' : '一般'}: ${type}`)
  console.log(`  详情: ${detail}`)
  console.log(`  时间: ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`)
}

/**
 * 校验关键文件基线完整性。
 */
export function checkCriticalFiles() {
  const report = verifyIntegrity()
  if (report.error) {
    if (isDev) {
      console.log(`[RuntimeIntegrity] 开发环境: ${report.error}`)
      return { ok: true, info: report.error }
    }
    logFinding('BASELINE_MISSING', report.error, false)
    return { ok: false, error: report.error }
  }

  const critical = report.changes?.filter(c => c.critical) || []
  if (critical.length) {
    if (isDev) {
      console.log(`\x1b[90m[RuntimeIntegrity] 开发环境: ${critical.length} 个文件已变更（开发中正常）\x1b[0m`)
      if (critical.length > 0) {
        console.log(`\x1b[90m  变更文件示例: ${critical.slice(0, 3).map(c => c.file).join(', ')}${critical.length > 3 ? ` ...等${critical.length}个文件` : ''}\x1b[0m`)
      }
    } else {
      logFinding('CRITICAL_FILE_MODIFIED', `发现 ${critical.length} 个关键文件变更`, true)
    }
  }
  if (report.changes?.length) {
    state.fileChanges = report.changes.slice(-50)
  }
  return {
    ok: critical.length === 0 || isDev,
    totalFiles: report.totalFiles,
    changes: report.changes?.length || 0,
    criticalChanges: isDev ? 0 : critical.length,
  }
}

/**
 * 扫描已加载模块，发现可疑或异常模块。
 */
export function scanLoadedModules() {
  const findings = []
  try {
    const cache = require.cache || {}
    for (const [filePath, mod] of Object.entries(cache)) {
      for (const pattern of SUSPICIOUS_MODULE_PATTERNS) {
        if (pattern.test(filePath)) {
          findings.push({ type: 'suspicious_cjs', file: filePath })
          break
        }
      }
      // 检测被修改过的 CJS 模块（loaded 后源码仍保留）
      if (mod?.loaded && mod?.exports && typeof mod.exports === 'object') {
        // 简单判断：路径包含 tmp/temp 目录
        if (/[\\/](?:tmp|temp|cache)[\\/]/i.test(filePath)) {
          findings.push({ type: 'temp_module', file: filePath })
        }
      }
    }

    const nativeList = process.moduleLoadList || []
    for (const item of nativeList) {
      for (const name of SUSPICIOUS_NATIVE_MODULES) {
        if (item.includes(name)) {
          findings.push({ type: 'native_module', module: item })
          break
        }
      }
    }
  } catch (err) {
    logFinding('MODULE_SCAN_ERROR', err.message, false)
  }

  if (findings.length) {
    state.moduleFindings = findings.slice(-100)
    const critical = findings.filter(f => f.type === 'suspicious_cjs')
    if (critical.length) {
      if (isDev) {
        console.log(`\x1b[90m[RuntimeIntegrity] 开发环境: ${critical.length} 个模块匹配模式（开发中正常，已忽略）\x1b[0m`)
        if (critical.length > 0) {
          const moduleNames = critical.slice(0, 3).map(f => f.module?.split(/[\\/]/).pop() || f.module)
          console.log(`\x1b[90m  模块示例: ${moduleNames.join(', ')}${critical.length > 3 ? ` ...等${critical.length}个模块` : ''}\x1b[0m`)
        }
      } else {
        logFinding('SUSPICIOUS_MODULE_LOADED', `发现 ${critical.length} 个可疑模块`, true)
      }
    }
  }
  return { count: findings.length, findings: findings.slice(-20) }
}

/**
 * 扫描内存中敏感字符串数量。
 * 仅基于已加载 CJS 源码、进程参数与环境变量进行模式匹配，不输出具体值。
 */
export function scanMemoryStrings() {
  const haystacks = []

  try {
    const cache = require.cache || {}
    for (const mod of Object.values(cache)) {
      if (mod?.loaded && typeof mod?.filename === 'string' && mod.filename.endsWith('.js')) {
        // 仅收集长度可控的源码片段
        const src = mod?.exports?.__source || ''
        if (src.length < 1_000_000) haystacks.push(src)
      }
    }
  } catch {
    // ignore
  }

  haystacks.push(process.argv.join(' '))
  haystacks.push(Object.entries(process.env).map(([k, v]) => `${k}=${v}`).join('\n'))

  const result = []
  let total = 0
  for (const { name, regex } of SECRET_PATTERNS) {
    let count = 0
    for (const text of haystacks) {
      const matches = text.match(regex)
      if (matches) count += matches.length
    }
    if (count) {
      result.push({ type: name, count })
      total += count
    }
  }

  state.memoryFindings = result
  const threshold = isDev ? 50 : 10
  if (total > threshold) {
    logFinding('MEMORY_SECRET_OVERFLOW', `内存中敏感字符串数量异常: ${total}`, true)
  }
  return { total, findings: result }
}

/**
 * 执行完整运行态完整性检查。
 */
export function checkRuntimeIntegrity() {
  state.checksRun++
  state.serious = false

  const files = checkCriticalFiles()
  const modules = scanLoadedModules()
  const memory = scanMemoryStrings()

  state.lastCheckAt = new Date().toISOString()

  return {
    at: state.lastCheckAt,
    ok: files.ok && modules.count === 0 && memory.total <= 10,
    files,
    modules,
    memory,
    serious: state.serious,
  }
}

let timer = null

export function startRuntimeIntegrityMonitoring(intervalMs = 60 * 1000) {
  if (timer) return { alreadyRunning: true }
  timer = setInterval(() => {
    try {
      checkRuntimeIntegrity()
    } catch (err) {
      logFinding('INTEGRITY_CHECK_ERROR', err.message, false)
    }
  }, Math.max(10000, intervalMs))
  timer.unref?.()
  return { started: true, intervalMs }
}

export function stopRuntimeIntegrityMonitoring() {
  if (timer) {
    clearInterval(timer)
    timer = null
    return { stopped: true }
  }
  return { stopped: false }
}

export function getRuntimeIntegrityStatus() {
  return {
    lastCheckAt: state.lastCheckAt,
    checksRun: state.checksRun,
    serious: state.serious,
    fileChangeCount: state.fileChanges.length,
    moduleFindingCount: state.moduleFindings.length,
    memoryFindingCount: state.memoryFindings.reduce((s, f) => s + f.count, 0),
  }
}

export default {
  checkCriticalFiles,
  scanLoadedModules,
  scanMemoryStrings,
  checkRuntimeIntegrity,
  startRuntimeIntegrityMonitoring,
  stopRuntimeIntegrityMonitoring,
  getRuntimeIntegrityStatus,
}
