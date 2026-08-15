#!/usr/bin/env node
// ===== 数据库备份脚本 =====
// 创建带时间戳的备份，压缩为 .zip，自动清理旧备份

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.resolve(ROOT, 'api', 'data')
const DB_PATH = path.join(DATA_DIR, 'database.sqlite')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const LOG_FILE = path.join(BACKUPS_DIR, 'backup.log')
const MAX_BACKUPS = 30

const JSON_FILES = [
  'users.json',
  'notifications.json',
  'bug-reports.json',
  'surveys.json',
  'survey-responses.json',
  'revoked-tokens.json',
]

/**
 * 写入备份日志
 */
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${type}] ${message}`
  console.log(line)
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true })
    }
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8')
  } catch { /* 忽略日志写入错误 */ }
}

/**
 * 生成时间戳字符串
 */
function getTimestamp() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}-${h}${min}${s}`
}

/**
 * 验证备份源文件是否存在
 */
function validateSources() {
  const missing = []

  if (!fs.existsSync(DB_PATH)) {
    missing.push(DB_PATH)
  }

  for (const file of JSON_FILES) {
    const filePath = path.join(DATA_DIR, file)
    if (!fs.existsSync(filePath)) {
      missing.push(filePath)
    }
  }

  return missing
}

/**
 * 创建压缩归档
 * @param {string} sourceDir - 源目录路径
 * @param {string} outputPath - 输出 .zip 路径
 */
function createArchive(sourceDir, outputPath) {
  const isWindows = process.platform === 'win32'

  if (isWindows) {
    // Windows 使用 PowerShell Compress-Archive
    const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${outputPath}' -Force"`
    execSync(psCmd, { stdio: 'pipe', timeout: 60000 })
  } else {
    // Unix 使用 tar
    const parentDir = path.dirname(sourceDir)
    const baseName = path.basename(sourceDir)
    execSync(`tar -czf "${outputPath}" -C "${parentDir}" "${baseName}"`, {
      stdio: 'pipe',
      timeout: 60000,
    })
  }
}

/**
 * 执行备份
 */
async function runBackup() {
  console.log('========================================')
  console.log('  数据库备份工具')
  console.log('========================================')

  // 确保备份目录存在
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
    log('备份目录已创建')
  }

  // 验证源文件
  const missing = validateSources()
  if (missing.length > 0) {
    log('缺少以下源文件:', 'ERROR')
    for (const f of missing) {
      log(`  - ${f}`, 'ERROR')
    }
    console.error('\n❌ 备份失败：缺少源文件')
    process.exit(1)
  }

  // 检查数据库文件大小
  const dbSize = fs.statSync(DB_PATH).size
  log(`数据库文件大小: ${(dbSize / 1024).toFixed(1)} KB`)

  // 创建临时备份目录
  const timestamp = getTimestamp()
  const backupDirName = `backup-${timestamp}`
  const backupDir = path.join(BACKUPS_DIR, backupDirName)
  const zipPath = path.join(BACKUPS_DIR, `${backupDirName}.zip`)

  fs.mkdirSync(backupDir, { recursive: true })
  log(`创建临时备份目录: ${backupDirName}`)

  try {
    // 复制 SQLite 数据库文件
    const dbDest = path.join(backupDir, 'database.sqlite')
    fs.copyFileSync(DB_PATH, dbDest)
    log('已备份: database.sqlite')

    // 复制 JSON 文件
    let copiedCount = 0
    for (const file of JSON_FILES) {
      const src = path.join(DATA_DIR, file)
      const dest = path.join(backupDir, file)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
        copiedCount++
        log(`已备份: ${file}`)
      }
    }
    log(`已备份 ${copiedCount} 个 JSON 文件`)

    // 压缩备份目录
    log('正在压缩备份...')
    createArchive(backupDir, zipPath)

    // 删除临时目录
    fs.rmSync(backupDir, { recursive: true, force: true })
    log(`已删除临时目录: ${backupDirName}`)

    // 验证 zip 文件
    if (!fs.existsSync(zipPath)) {
      throw new Error('压缩文件创建失败')
    }
    const zipSize = fs.statSync(zipPath).size
    log(`备份完成: ${backupDirName}.zip (${(zipSize / 1024 / 1024).toFixed(2)} MB)`)

    // 清理旧备份
    cleanupOldBackups()

    console.log(`\n✅ 备份成功: ${zipPath}`)
    return { success: true, path: zipPath, timestamp }
  } catch (err) {
    // 清理临时目录
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true })
    }
    // 清理可能已创建的 zip 文件
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath)
    }

    log(`备份失败: ${err.message}`, 'ERROR')
    console.error(`\n❌ 备份失败: ${err.message}`)
    return { success: false, error: err.message }
  }
}

/**
 * 清理旧备份，只保留最近 MAX_BACKUPS 个
 */
function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => ({
        name: f,
        path: path.join(BACKUPS_DIR, f),
        mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime) // 最新的在前

    if (files.length <= MAX_BACKUPS) {
      log(`当前备份数 ${files.length}，无需清理（上限 ${MAX_BACKUPS}）`)
      return
    }

    const toDelete = files.slice(MAX_BACKUPS)
    for (const file of toDelete) {
      fs.unlinkSync(file.path)
      log(`已清理旧备份: ${file.name}`)
    }
    log(`清理完成: 删除了 ${toDelete.length} 个旧备份`)
  } catch (err) {
    log(`清理旧备份时出错: ${err.message}`, 'WARN')
  }
}

// 执行
runBackup()