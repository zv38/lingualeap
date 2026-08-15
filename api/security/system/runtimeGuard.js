// ============================================================
// Runtime Guard — 军工级运行态安全自检模块
// 职责：
//   1. 周期性检测测试后门、敏感文件暴露、环境配置漂移
//   2. 检测进程启动参数是否包含危险标志（--inspect、--experimental-loader 等）
//   3. 监听未捕获异常与未处理 Promise 拒绝，防止信息泄露
//   4. 提供 /api/health 聚合接口所需的安全状态摘要（不含敏感细节）
//   5. 发现严重违规时触发隔离或安全事件
// ============================================================

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { logAudit, getClientIP } from '../core/auditLogger.js'
import {
  detectAntiDebug,
  startAntiDebugMonitoring,
  getAntiDebugStatus,
} from '../runtime/antiDebug.js'
import { getMemoryGuardStatus, scanMemoryForSecrets } from '../runtime/memoryGuard.js'
import { getSandboxStatus } from '../runtime/processSandbox.js'
import {
  checkRuntimeIntegrity,
  getRuntimeIntegrityStatus,
} from '../runtime/runtimeIntegrity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '../../..')

const CHECK_INTERVAL_MS = Number(process.env.RUNTIME_GUARD_INTERVAL_MS || 60 * 1000)

// 禁止存在的测试后门 / 临时文件（与 startupValidator 保持一致）
const FORBIDDEN_FILES = [
  'patch_index.mjs',
  'test_login.cjs',
  'test_all.cjs',
  'test_login.json',
  '.tmp_api_index_head.js',
  '.tmp_diff.txt',
]

// 禁止通过 HTTP 暴露的敏感路径模式（重点关注可泄露密钥/会话/状态的数据文件）
const FORBIDDEN_PATH_PATTERNS = [
  /\/\.env/i,
  /\/\.env\.local/i,
  /\/\.git\//i,
  /\.(?:key|pem|p12|pfx)$/i,
  /\/isolation-state\.json$/i,
  /\/audit-log\.json$/i,
  /\/file-encryption-keys\.enc$/i,
  /\.sqlite$/i,
]

// 危险的 Node.js 启动参数（可能用于代码注入或调试暴露）
const DANGEROUS_NODE_ARGS = [
  '--inspect',
  '--inspect-brk',
  '--inspect-port',
  '--experimental-loader',
  '--loader',
  '--require',
  '-r',
  '--experimental-vm-modules',
  '--experimental-policy',
  '--allow-fs-write',
  '--allow-fs-read',
]

const runtimeState = {
  lastCheckAt: null,
  violations: [],
  checksPassed: 0,
  checksFailed: 0,
  seriousViolation: false,
}

function logViolation(type, detail, serious = false) {
  const entry = { type, detail, at: new Date().toISOString(), serious }
  runtimeState.violations.push(entry)
  if (runtimeState.violations.length > 100) runtimeState.violations.shift()
  if (serious) runtimeState.seriousViolation = true
  logAudit({
    userId: 'system',
    action: 'runtime_guard_violation',
    details: { type, detail, serious },
    success: false,
  })
  const severityLabel = serious ? '严重违规' : '一般违规'
  const icon = serious ? '🔴' : '🟡'
  console.log('')
  console.log(`\x1b[${serious ? '41' : '43'}m\x1b[37m ■ RuntimeGuard ${severityLabel} \x1b[0m`)
  console.log(`  类型: ${type}`)
  console.log(`  详情: ${detail}`)
  console.log(`  时间: ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`)
}

function checkForbiddenFiles() {
  for (const file of FORBIDDEN_FILES) {
    const fullPath = path.join(ROOT_DIR, file)
    if (fs.existsSync(fullPath)) {
      logViolation('FORBIDDEN_FILE', `发现禁止文件: ${file}`, true)
    }
  }
}

function checkSensitivePathExposure() {
  // 仅检测项目根目录下是否存在被意外挂载到静态服务的敏感文件
  // 开发环境允许 .env / .env.example 模板存在；生产环境任何 .env 都不应部署
  const isProd = process.env.NODE_ENV === 'production'
  const suspicious = []
  for (const entry of fs.readdirSync(ROOT_DIR, { withFileTypes: true })) {
    const name = entry.name
    for (const pattern of FORBIDDEN_PATH_PATTERNS) {
      if (pattern.test('/' + name)) {
        // 开发环境跳过 .env / .env.example / .env.test 等模板文件
        if (!isProd && /\.env(\.example|\.test|)$/.test(name)) continue
        suspicious.push(name)
        break
      }
    }
  }
  if (suspicious.length) {
    const serious = isProd || suspicious.some(n => /\.key$|\.pem$|\.enc$|\.sqlite$|audit-log\.json$|isolation-state\.json$/.test(n))
    logViolation('SENSITIVE_FILE_EXPOSED', `根目录存在敏感文件/目录: ${suspicious.join(', ')}`, serious)
  }
}

function checkProcessIntegrity() {
  const args = process.execArgv.concat(process.argv.slice(2))
  for (const arg of args) {
    for (const dangerous of DANGEROUS_NODE_ARGS) {
      if (arg.startsWith(dangerous)) {
        logViolation('DANGEROUS_NODE_ARG', `进程启动参数包含 ${arg}`, true)
      }
    }
  }
}

function checkEnvironmentDrift() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.CAPTCHA_TEST_MODE === 'true') {
      logViolation('PROD_WEAK_CONFIG', '生产环境 CAPTCHA_TEST_MODE=true', true)
    }
    if (!process.env.TURNSTILE_SECRET_KEY) {
      logViolation('PROD_WEAK_CONFIG', '生产环境未配置 TURNSTILE_SECRET_KEY', true)
    }
    if (process.env.ADMIN_PASSWORD) {
      logViolation('PROD_WEAK_CONFIG', '生产环境存在明文 ADMIN_PASSWORD', true)
    }
    if ((!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 60) && process.env._JWT_SECRET_PROTECTED !== '1') {
      logViolation('PROD_WEAK_CONFIG', '生产环境 JWT_SECRET 强度不足或未受内存保护', true)
    }
  }
}

function checkSourceMapLeakage() {
  const distDir = path.join(ROOT_DIR, 'dist', 'assets')
  if (!fs.existsSync(distDir)) return
  const maps = fs.readdirSync(distDir).filter(f => f.endsWith('.map'))
  if (maps.length) {
    logViolation('SOURCE_MAP_LEAKED', `构建产物包含 ${maps.length} 个 .map 文件`, true)
  }
}

function runRuntimeSecurityChecks() {
  try {
    detectAntiDebug()
  } catch (err) {
    logViolation('ANTI_DEBUG_ERROR', `反调试检测异常: ${err.message}`, false)
  }

  try {
    scanMemoryForSecrets()
  } catch (err) {
    logViolation('MEMORY_SCAN_ERROR', `内存敏感扫描异常: ${err.message}`, false)
  }

  try {
    const integrity = checkRuntimeIntegrity()
    if (!integrity.ok) {
      const isProd = process.env.NODE_ENV === 'production'
      if (isProd) {
        logViolation('RUNTIME_INTEGRITY_FAIL', `运行态完整性异常: 文件=${integrity.files.changes}, 模块=${integrity.modules.count}, 内存敏感串=${integrity.memory.total}`, integrity.serious)
      } else {
        // 开发环境：文件变更和模块加载是正常行为，仅记录 info 日志，不触发违规
        console.log(`\x1b[90m[RuntimeGuard] 开发环境完整性检查: 文件变更=${integrity.files.changes}, 可疑模块=${integrity.modules.count}, 内存敏感串=${integrity.memory.total}\x1b[0m`)
      }
    }
  } catch (err) {
    logViolation('INTEGRITY_CHECK_ERROR', `完整性检查异常: ${err.message}`, false)
  }
}

function runAllChecks() {
  const start = Date.now()
  try {
    checkForbiddenFiles()
    checkSensitivePathExposure()
    checkProcessIntegrity()
    checkEnvironmentDrift()
    checkSourceMapLeakage()
    runRuntimeSecurityChecks()
    runtimeState.checksPassed++
  } catch (err) {
    runtimeState.checksFailed++
    logViolation('CHECK_ERROR', `自检异常: ${err.message}`, false)
  }
  runtimeState.lastCheckAt = new Date().toISOString()
  return runtimeState
}

// 启动周期性自检
const timer = setInterval(runAllChecks, CHECK_INTERVAL_MS)
timer.unref?.()

// 监听未捕获异常，防止栈跟踪泄露
process.on('uncaughtException', (err) => {
  logViolation('UNCAUGHT_EXCEPTION', err.message, true)
  console.error('[RuntimeGuard] 未捕获异常，将安全退出')
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  logViolation('UNHANDLED_REJECTION', msg, false)
})

// Express 中间件：拦截对敏感路径的直接访问请求（兜底）
export function runtimeGuardMiddleware(req, res, next) {
  const url = (req.url || '').split('?')[0]
  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(url)) {
      logViolation('HTTP_SENSITIVE_PATH_ACCESS', `${getClientIP(req)} 尝试访问 ${url}`, false)
      return res.status(404).json({ success: false, message: 'Not Found' })
    }
  }
  next()
}

// 获取当前运行态安全摘要（供 /api/health 使用，不含敏感细节）
export function getRuntimeSecurityStatus() {
  return {
    status: runtimeState.seriousViolation ? 'warning' : 'ok',
    lastCheckAt: runtimeState.lastCheckAt,
    checksPassed: runtimeState.checksPassed,
    checksFailed: runtimeState.checksFailed,
    violationCount: runtimeState.violations.length,
    seriousViolation: runtimeState.seriousViolation,
    antiDebug: getAntiDebugStatus(),
    memoryGuard: getMemoryGuardStatus(),
    processSandbox: getSandboxStatus(),
    runtimeIntegrity: getRuntimeIntegrityStatus(),
  }
}

export function getRuntimeGuardViolations(limit = 20) {
  return runtimeState.violations.slice(-limit)
}

// 启动运行态安全子模块监控
startAntiDebugMonitoring()

// 初始立即执行一次
runAllChecks()

export default {
  runtimeGuardMiddleware,
  getRuntimeSecurityStatus,
  getRuntimeGuardViolations,
}
