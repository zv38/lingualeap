#!/usr/bin/env node
// ===== 数据库恢复脚本 =====
// 列出可用备份，从指定时间戳恢复，自动创建恢复前备份

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import readline from 'readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.resolve(ROOT, 'api', 'data')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const DB_PATH = path.join(DATA_DIR, 'database.sqlite')

const JSON_FILES = [
  'users.json',
  'notifications.json',
  'bug-reports.json',
  'surveys.json',
  'survey-responses.json',
  'revoked-tokens.json',
]

/**
 * 创建 readline 接口用于用户输入
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * 询问用户确认
 */
function askConfirmation(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

/**
 * 列出可用备份
 */
function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return []
  }

  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const filePath = path.join(BACKUPS_DIR, f)
      const stat = fs.statSync(filePath)
      const match = f.match(/^backup-(\d{8}-\d{6})\.zip$/)
      return {
        fileName: f,
        filePath,
        timestamp: match ? match[1] : f.replace('.zip', ''),
        size: stat.size,
        sizeKB: (stat.size / 1024).toFixed(1),
        date: stat.mtime,
      }
    })
    .sort((a, b) => b.date - a.date) // 最新的在前
}

/**
 * 从 zip 备份中恢复文件
 */
function extractBackup(backupPath, targetDir) {
  const isWindows = process.platform === 'win32'

  if (isWindows) {
    // 使用 PowerShell Expand-Archive
    const psCmd = `powershell -NoProfile -Command "Expand-Archive -Path '${backupPath}' -DestinationPath '${targetDir}' -Force"`
    execSync(psCmd, { stdio: 'pipe', timeout: 60000 })
  } else {
    // Unix 使用 tar
    const ext = path.extname(backupPath)
    if (ext === '.gz' || ext === '.tgz') {
      execSync(`tar -xzf "${backupPath}" -C "${targetDir}"`, {
        stdio: 'pipe',
        timeout: 60000,
      })
    } else {
      execSync(`unzip -o "${backupPath}" -d "${targetDir}"`, {
        stdio: 'pipe',
        timeout: 60000,
      })
    }
  }
}

/**
 * 创建恢复前的自动备份
 */
function createPreRestoreBackup() {
  const backupScript = path.resolve(__dirname, 'backup-db.js')
  try {
    console.log('\n⏳ 正在创建恢复前自动备份...')
    execSync(`node "${backupScript}"`, { stdio: 'inherit', timeout: 120000 })
    console.log('✅ 恢复前备份已创建\n')
  } catch (err) {
    console.warn('⚠️  恢复前备份创建失败（不影响恢复操作）:', err.message)
  }
}

/**
 * 恢复文件到 data 目录
 */
function restoreFiles(sourceDir, timestamp) {
  const restored = []

  // 恢复 SQLite 数据库
  const dbSrc = path.join(sourceDir, 'database.sqlite')
  if (fs.existsSync(dbSrc)) {
    // 先关闭数据库连接（通过备份确保一致性）
    fs.copyFileSync(dbSrc, DB_PATH)
    restored.push('database.sqlite')
  }

  // 恢复 JSON 文件
  for (const file of JSON_FILES) {
    const src = path.join(sourceDir, file)
    const dest = path.join(DATA_DIR, file)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest)
      restored.push(file)
    }
  }

  return restored
}

/**
 * 主流程
 */
async function main() {
  console.log('========================================')
  console.log('  数据库恢复工具')
  console.log('========================================')

  // 检查备份目录是否存在
  if (!fs.existsSync(BACKUPS_DIR)) {
    console.error('❌ 备份目录不存在:', BACKUPS_DIR)
    console.error('   请先运行备份脚本创建备份')
    process.exit(1)
  }

  const backups = listBackups()

  if (backups.length === 0) {
    console.error('❌ 没有找到可用的备份文件')
    process.exit(1)
  }

  // 获取命令行参数（可选的时间戳）
  const targetTimestamp = process.argv[2]

  if (targetTimestamp) {
    // 通过时间戳恢复
    const backup = backups.find(b => b.timestamp === targetTimestamp)

    if (!backup) {
      console.error(`❌ 未找到时间戳为 "${targetTimestamp}" 的备份`)
      console.log('\n可用备份:')
      displayBackupList(backups)
      process.exit(1)
    }

    const rl = createPrompt()
    console.log(`\n📦 选择恢复的备份:`)
    console.log(`   文件名: ${backup.fileName}`)
    console.log(`   大小: ${backup.sizeKB} KB`)
    console.log(`   创建时间: ${backup.date.toLocaleString('zh-CN')}`)

    const confirmed = await askConfirmation(
      rl,
      '\n⚠️  恢复将覆盖当前数据库和 JSON 文件。\n   是否继续？(y/N) '
    )
    rl.close()

    if (!confirmed) {
      console.log('\n❌ 操作已取消')
      process.exit(0)
    }

    // 创建恢复前备份
    createPreRestoreBackup()

    // 创建临时目录解压
    const tempDir = path.join(BACKUPS_DIR, `._restore_temp_${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      console.log('📂 正在解压备份文件...')
      extractBackup(backup.filePath, tempDir)

      console.log('📝 正在恢复文件...')
      const restored = restoreFiles(tempDir, targetTimestamp)

      console.log('\n✅ 恢复完成！已恢复以下文件:')
      for (const file of restored) {
        console.log(`   - ${file}`)
      }
    } catch (err) {
      console.error(`\n❌ 恢复失败: ${err.message}`)
      process.exit(1)
    } finally {
      // 清理临时目录
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  } else {
    // 没有指定时间戳，列出备份并提示
    console.log(`\n📋 找到 ${backups.length} 个备份:\n`)
    displayBackupList(backups)

    console.log('\n使用方式: node scripts/restore-db.js <时间戳>')
    console.log('示例: node scripts/restore-db.js 20260802-120000')
    console.log('      node scripts/restore-db.js 20260802-120000 --force  (跳过确认)')
  }
}

/**
 * 显示备份列表
 */
function displayBackupList(backups) {
  backups.forEach((b, i) => {
    console.log(
      `  ${String(i + 1).padStart(2, ' ')}. ${b.timestamp}  ` +
      `${b.sizeKB.padStart(8, ' ')} KB  ${b.date.toLocaleString('zh-CN')}`
    )
  })
}

main()