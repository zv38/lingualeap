// ============================================================
// Key Rotation Scheduler — 自动密钥轮换调度器
// 基于 keyRotationEngine.js 实现定时轮换
// 功能：
//   - 可配置轮换周期（默认 90 天），通过 KEY_ROTATION_INTERVAL_DAYS 环境变量覆盖
//   - 首次启动时检查密钥使用时长，超过轮换周期则自动触发轮换
//   - 每 24 小时定时检查
//   - 轮换前自动执行 dryRun 验证
//   - 轮换成功后记录审计日志
//   - 轮换失败时发送告警（console.error + 审计日志）
//   - 支持手动触发轮换
//   - 状态追踪：上次轮换时间、轮换次数、下次轮换时间
// ============================================================

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rotateFileEncryptionKeys } from './keyRotationEngine.js'
import { SECRETS_DIR } from './keyStorageProvider.js'
import { logAudit } from '../core/auditLogger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---- 配置 ----
const ROTATION_INTERVAL_DAYS = parseInt(process.env.KEY_ROTATION_INTERVAL_DAYS, 10) || 90
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 小时
const STATE_FILE = path.join(SECRETS_DIR, 'key-rotation-state.json')
const KEY_STORE_FILE = path.join(SECRETS_DIR, 'file-encryption-keys.enc')

// ---- 状态 ----
let _timer = null
let _state = {
  lastRotationTime: null,   // ISO 字符串
  rotationCount: 0,
  nextRotationTime: null,   // ISO 字符串
  isRunning: false,
  lastError: null,
}

// ---- 内部工具 ----

/**
 * 加载持久化状态
 */
function _loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      _state = { ..._state, ...JSON.parse(raw) }
    }
  } catch (err) {
    console.warn(`[KeyRotationScheduler] 无法加载状态文件: ${err.message}`)
  }
}

/**
 * 持久化状态
 */
function _saveState() {
  try {
    const dir = path.dirname(STATE_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(_state, null, 2), 'utf-8')
  } catch (err) {
    console.warn(`[KeyRotationScheduler] 无法保存状态文件: ${err.message}`)
  }
}

/**
 * 获取密钥存储文件的 mtime，作为密钥最近一次轮换时间的参考
 */
function _getKeyStoreMtime() {
  try {
    if (fs.existsSync(KEY_STORE_FILE)) {
      const stat = fs.statSync(KEY_STORE_FILE)
      return stat.mtime
    }
  } catch (err) {
    console.warn(`[KeyRotationScheduler] 无法读取密钥文件时间: ${err.message}`)
  }
  return null
}

/**
 * 计算下次轮换时间
 */
function _calcNextRotationTime() {
  const base = _state.lastRotationTime
    ? new Date(_state.lastRotationTime)
    : new Date()
  return new Date(base.getTime() + ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * 更新轮换后的状态
 */
function _updateStateAfterRotation(rotatedAt) {
  _state.lastRotationTime = rotatedAt.toISOString()
  _state.rotationCount += 1
  _state.nextRotationTime = _calcNextRotationTime().toISOString()
  _state.lastError = null
  _saveState()
}

/**
 * 轮换失败时记录状态
 */
function _updateStateOnError(errorMessage) {
  _state.lastError = errorMessage
  _saveState()
}

/**
 * 执行完整的轮换流程：dryRun → 正式轮换 → 审计日志
 * 返回 { success, result, error }
 */
async function _executeRotation({ isManual = false } = {}) {
  const source = isManual ? 'manual' : 'scheduled'

  // 1. dryRun 验证
  console.log(`[KeyRotationScheduler] 开始 ${source} 密钥轮换（dryRun 验证）`)
  let dryRunResult
  try {
    dryRunResult = await rotateFileEncryptionKeys({ dryRun: true })
  } catch (err) {
    const msg = `dryRun 验证失败: ${err.message}`
    console.error(`[KeyRotationScheduler] ${msg}`)
    logAudit('system', 'key-rotation.dry-run-failed', {
      details: msg,
      success: false,
      source,
    })
    _updateStateOnError(msg)
    return { success: false, error: msg }
  }

  if (dryRunResult.hasError) {
    const errors = dryRunResult.filesProcessed
      .filter(f => f.status === 'error')
      .map(f => `  ${f.filePath}: ${f.error}`)
      .join('\n')
    const msg = `dryRun 验证发现错误，中止轮换:\n${errors}`
    console.error(`[KeyRotationScheduler] ${msg}`)
    logAudit('system', 'key-rotation.dry-run-failed', {
      details: msg,
      success: false,
      source,
      filesProcessed: dryRunResult.filesProcessed.length,
    })
    _updateStateOnError(msg)
    return { success: false, error: msg }
  }

  // 2. 正式轮换
  console.log(`[KeyRotationScheduler] dryRun 通过，开始正式轮换（${source}）`)
  let rotationResult
  try {
    rotationResult = await rotateFileEncryptionKeys({ dryRun: false })
  } catch (err) {
    const msg = `密钥轮换执行失败: ${err.message}`
    console.error(`[KeyRotationScheduler] ${msg}`)
    logAudit('system', 'key-rotation.failed', {
      details: msg,
      success: false,
      source,
      previousPrimaryKeyId: dryRunResult.previousPrimaryKeyId,
    })
    _updateStateOnError(msg)
    return { success: false, error: msg }
  }

  if (rotationResult.hasError) {
    const errors = rotationResult.filesProcessed
      .filter(f => f.status === 'error')
      .map(f => `  ${f.filePath}: ${f.error}`)
      .join('\n')
    const msg = `密钥轮换部分文件失败:\n${errors}`
    console.error(`[KeyRotationScheduler] ${msg}`)
    logAudit('system', 'key-rotation.partial-failure', {
      details: msg,
      success: false,
      source,
      previousPrimaryKeyId: rotationResult.previousPrimaryKeyId,
      newPrimaryKeyId: rotationResult.newPrimaryKeyId,
      filesProcessed: rotationResult.filesProcessed.length,
    })
    _updateStateOnError(msg)
    return { success: false, error: msg }
  }

  // 3. 轮换成功，记录审计日志
  const now = new Date()
  _updateStateAfterRotation(now)

  const successCount = rotationResult.filesProcessed.filter(f => f.status === 'reencrypted').length
  const auditDetails = {
    previousPrimaryKeyId: rotationResult.previousPrimaryKeyId,
    newPrimaryKeyId: rotationResult.newPrimaryKeyId,
    filesReencrypted: successCount,
    totalFiles: rotationResult.filesProcessed.length,
    source,
    rotationCount: _state.rotationCount,
    nextRotationTime: _state.nextRotationTime,
  }

  console.log(
    `[KeyRotationScheduler] 密钥轮换成功（${source}）: ` +
    `${rotationResult.previousPrimaryKeyId} → ${rotationResult.newPrimaryKeyId}, ` +
    `重加密 ${successCount}/${rotationResult.filesProcessed.length} 个文件`
  )
  logAudit('system', 'key-rotation.completed', {
    details: auditDetails,
    success: true,
  })

  return { success: true, result: rotationResult }
}

// ---- 对外接口 ----

/**
 * 启动自动密钥轮换调度器。
 * 首次启动时检查密钥使用时长，如果超过轮换周期则自动触发轮换。
 * 之后每 24 小时检查一次。
 */
export function startKeyRotationScheduler() {
  if (_timer) {
    console.warn('[KeyRotationScheduler] 调度器已在运行中')
    return
  }

  _loadState()
  _state.isRunning = true

  console.log(
    `[KeyRotationScheduler] 启动调度器，轮换周期: ${ROTATION_INTERVAL_DAYS} 天` +
    `，检查间隔: 24 小时`
  )

  // 首次启动检查：判断是否需要立即轮换
  ;(async () => {
    try {
      const now = new Date()
      let needsRotation = false

      // 如果没有 lastRotationTime，尝试从密钥存储文件 mtime 推算
      if (!_state.lastRotationTime) {
        const mtime = _getKeyStoreMtime()
        if (mtime) {
          const daysSinceLastRotation = (now - mtime) / (24 * 60 * 60 * 1000)
          if (daysSinceLastRotation >= ROTATION_INTERVAL_DAYS) {
            console.log(
              `[KeyRotationScheduler] 首次启动：密钥文件已有 ${Math.round(daysSinceLastRotation)} 天` +
              `未轮换，超过 ${ROTATION_INTERVAL_DAYS} 天周期，自动触发轮换`
            )
            needsRotation = true
          } else {
            // 根据 mtime 初始化状态
            _state.lastRotationTime = mtime.toISOString()
            _state.nextRotationTime = _calcNextRotationTime().toISOString()
            _saveState()
            console.log(
              `[KeyRotationScheduler] 首次启动：密钥文件 ${Math.round(daysSinceLastRotation)} 天前轮换，` +
              `下次轮换: ${_state.nextRotationTime}`
            )
          }
        } else {
          // 无法获取 mtime，设置一个初始状态
          _state.nextRotationTime = _calcNextRotationTime().toISOString()
          _saveState()
          console.log(
            `[KeyRotationScheduler] 首次启动：无法获取密钥文件时间，` +
            `下次轮换: ${_state.nextRotationTime}`
          )
        }
      } else {
        // 已有状态，检查是否到期
        const next = new Date(_state.nextRotationTime)
        if (now >= next) {
          console.log(
            `[KeyRotationScheduler] 计划轮换时间已到（${_state.nextRotationTime}），` +
            `自动触发轮换`
          )
          needsRotation = true
        } else {
          console.log(
            `[KeyRotationScheduler] 距离下次轮换还有 ` +
            `${Math.round((next - now) / (24 * 60 * 60 * 1000))} 天`
          )
        }
      }

      if (needsRotation) {
        await _executeRotation({ isManual: false })
      }
    } catch (err) {
      const msg = `首次检查异常: ${err.message}`
      console.error(`[KeyRotationScheduler] ${msg}`)
      _updateStateOnError(msg)
    }
  })()

  // 定时检查（每 24 小时）
  _timer = setInterval(async () => {
    try {
      const now = new Date()
      const next = _state.nextRotationTime ? new Date(_state.nextRotationTime) : null

      if (next && now >= next) {
        console.log(
          `[KeyRotationScheduler] 定时检查触发：计划时间 ${_state.nextRotationTime}，开始轮换`
        )
        await _executeRotation({ isManual: false })
      } else {
        const daysRemaining = next
          ? Math.round((next - now) / (24 * 60 * 60 * 1000))
          : 'N/A'
        console.log(
          `[KeyRotationScheduler] 定时检查：距离下次轮换还有 ${daysRemaining} 天`
        )
      }
    } catch (err) {
      const msg = `定时检查异常: ${err.message}`
      console.error(`[KeyRotationScheduler] ${msg}`)
      _updateStateOnError(msg)
    }
  }, CHECK_INTERVAL_MS)

  // 阻止定时器阻止进程退出
  if (_timer.unref) {
    _timer.unref()
  }
}

/**
 * 停止自动密钥轮换调度器。
 */
export function stopKeyRotationScheduler() {
  if (!_timer) {
    console.warn('[KeyRotationScheduler] 调度器未在运行')
    return
  }
  clearInterval(_timer)
  _timer = null
  _state.isRunning = false
  _saveState()
  console.log('[KeyRotationScheduler] 调度器已停止')
}

/**
 * 手动触发一次密钥轮换。
 * 同样会先执行 dryRun 验证，成功后执行正式轮换。
 */
export async function manualRotateKeys() {
  if (_state.isRunning && _timer) {
    console.log('[KeyRotationScheduler] 手动触发密钥轮换（调度器运行中）')
  } else {
    console.log('[KeyRotationScheduler] 手动触发密钥轮换（调度器未运行）')
  }
  return _executeRotation({ isManual: true })
}

/**
 * 获取当前密钥轮换状态。
 * 返回状态对象的只读副本。
 */
export function getKeyRotationStatus() {
  return {
    lastRotationTime: _state.lastRotationTime,
    rotationCount: _state.rotationCount,
    nextRotationTime: _state.nextRotationTime,
    isRunning: _state.isRunning,
    lastError: _state.lastError,
    intervalDays: ROTATION_INTERVAL_DAYS,
    checkIntervalMs: CHECK_INTERVAL_MS,
  }
}