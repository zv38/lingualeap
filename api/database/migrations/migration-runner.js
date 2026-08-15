#!/usr/bin/env node
// ===== 数据库迁移运行器 =====
// 自动检测并执行待处理的迁移文件，追踪 schema_version 表

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = __dirname
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'database.sqlite')

/**
 * 初始化数据库连接
 */
async function openDatabase() {
  const SQL = await initSqlJs()

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    const db = new SQL.Database(buffer)
    console.log(`[迁移] 已加载现有数据库: ${DB_PATH}`)
    return db
  }

  const db = new SQL.Database()
  console.log('[迁移] 创建新数据库')
  return db
}

/**
 * 获取已应用的迁移版本列表
 */
function getAppliedVersions(db) {
  try {
    // 检查 schema_version 表是否存在
    const tableCheck = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      return []
    }

    const result = db.exec('SELECT version FROM schema_version ORDER BY version')
    if (result.length === 0) return []

    return result[0].values.map(row => row[0])
  } catch {
    return []
  }
}

/**
 * 获取迁移文件列表（按版本号排序）
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return []
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d+_.*\.sql$/.test(f))
    .sort()

  return files.map(f => {
    const match = f.match(/^(\d+)_/)
    return {
      fileName: f,
      filePath: path.join(MIGRATIONS_DIR, f),
      version: match ? parseInt(match[1], 10) : 0,
    }
  })
}

/**
 * 应用迁移
 */
async function runMigrations() {
  console.log('========================================')
  console.log('  数据库迁移运行器')
  console.log('========================================\n')

  const db = await openDatabase()

  // 确保 schema_version 表存在
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const appliedVersions = getAppliedVersions(db)
  const migrations = getMigrationFiles()

  if (migrations.length === 0) {
    console.log('❌ 未找到迁移文件')
    db.close()
    process.exit(1)
  }

  console.log(`📋 已应用的版本: ${appliedVersions.length > 0 ? appliedVersions.join(', ') : '无'}`)
  console.log(`📋 可用迁移文件: ${migrations.length}`)

  const pending = migrations.filter(m => !appliedVersions.includes(m.version))

  if (pending.length === 0) {
    console.log('\n✅ 所有迁移已应用，数据库是最新版本')
    saveDatabase(db)
    db.close()
    return
  }

  console.log(`\n⏳ 发现 ${pending.length} 个待应用的迁移:\n`)
  for (const m of pending) {
    console.log(`   - ${m.fileName} (版本 ${m.version})`)
  }

  let applied = 0
  for (const migration of pending) {
    console.log(`\n📝 正在应用迁移: ${migration.fileName}...`)

    try {
      const sql = fs.readFileSync(migration.filePath, 'utf-8')
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))

      for (const statement of statements) {
        db.run(statement)
      }

      // 记录迁移版本
      db.run(
        'INSERT INTO schema_version (version) VALUES (?)',
        [migration.version]
      )

      applied++
      console.log(`   ✅ 迁移 ${migration.fileName} 应用成功`)
    } catch (err) {
      console.error(`   ❌ 迁移 ${migration.fileName} 失败: ${err.message}`)
      saveDatabase(db)
      db.close()
      process.exit(1)
    }
  }

  // 保存数据库
  saveDatabase(db)

  console.log(`\n✅ 迁移完成！成功应用 ${applied} 个迁移`)
  db.close()
}

/**
 * 保存数据库到磁盘
 */
function saveDatabase(db) {
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(DB_PATH, buffer)
    console.log(`[迁移] 数据库已保存: ${DB_PATH}`)
  } catch (err) {
    console.error(`[迁移] 保存失败: ${err.message}`)
  }
}

runMigrations()