// ===== SQLite 数据库管理器 =====
// 封装 sql.js 的初始化、查询、事务操作
// 支持渐进式迁移：先创建数据库 + 加载数据到内存，后续再逐步迁移到 SQL 查询

import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'database.sqlite')

let db = null
let SQL = null
let ready = false

/**
 * 初始化 SQLite 数据库
 * 创建表结构（如果不存在）
 */
export async function initDatabase() {
  if (ready) return db

  try {
    // 确保 data 目录存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }

    // 初始化 sql.js
    SQL = await initSqlJs()

    // 加载或创建数据库
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH)
      db = new SQL.Database(buffer)
      console.log(`[DB] 已加载现有数据库: ${DB_PATH} (${(buffer.length / 1024).toFixed(1)} KB)`)
    } else {
      db = new SQL.Database()
      console.log('[DB] 创建新数据库')
    }

    // 启用 WAL 模式（更好的并发性能）
    db.run('PRAGMA journal_mode=WAL')
    db.run('PRAGMA foreign_keys=ON')
    db.run('PRAGMA cache_size=-8000') // 8MB 缓存

    // 创建表结构
    const { CREATE_TABLES, SCHEMA_VERSION } = await import('./schema.js')
    db.run(CREATE_TABLES)

    // 检查并更新 schema 版本
    const versionResult = db.exec('SELECT MAX(version) as v FROM schema_version')
    const currentVersion = versionResult.length > 0 && versionResult[0].values.length > 0
      ? versionResult[0].values[0][0]
      : 0

    if (currentVersion < SCHEMA_VERSION) {
      db.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION])
      console.log(`[DB] Schema 已更新到版本 ${SCHEMA_VERSION}`)
    }

    ready = true
    saveDatabase()
    return db
  } catch (err) {
    console.error('[DB] 初始化失败:', err.message)
    throw err
  }
}

/**
 * 保存数据库到磁盘
 */
export function saveDatabase() {
  if (!db) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(DB_PATH, buffer)
  } catch (err) {
    console.error('[DB] 保存失败:', err.message)
  }
}

/**
 * 获取数据库实例
 */
export function getDatabase() {
  return db
}

/**
 * 检查数据库是否就绪
 */
export function isReady() {
  return ready
}

/**
 * 执行查询并返回结果数组
 * @param {string} sql - SQL 查询语句
 * @param {Array} params - 参数数组
 * @returns {Array<Object>}
 */
export function queryAll(sql, params = []) {
  if (!db) throw new Error('数据库未初始化')
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)

  const results = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    results.push(row)
  }
  stmt.free()
  return results
}

/**
 * 执行查询并返回第一行
 */
export function queryOne(sql, params = []) {
  const results = queryAll(sql, params)
  return results.length > 0 ? results[0] : null
}

/**
 * 执行写入操作（INSERT/UPDATE/DELETE）
 * @returns {object} { changes: number, lastInsertRowid: number }
 */
export function execute(sql, params = []) {
  if (!db) throw new Error('数据库未初始化')
  db.run(sql, params)
  return {
    changes: db.getRowsModified(),
    lastInsertRowid: db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0],
  }
}

/**
 * 在事务中执行多个操作
 * @param {Function} callback - (db) => void
 */
export function transaction(callback) {
  if (!db) throw new Error('数据库未初始化')
  try {
    db.run('BEGIN TRANSACTION')
    callback(db)
    db.run('COMMIT')
    saveDatabase()
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
}

/**
 * 批量插入数据
 * @param {string} table - 表名
 * @param {Array<Object>} rows - 数据行数组
 */
export function bulkInsert(table, rows) {
  if (!db || rows.length === 0) return

  transaction(() => {
    const columns = Object.keys(rows[0])
    const placeholders = columns.map(() => '?').join(', ')
    const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`

    const stmt = db.prepare(sql)
    for (const row of rows) {
      stmt.bind(columns.map(c => {
        const val = row[c]
        // 将数组/对象序列化为 JSON 字符串
        if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
          return JSON.stringify(val)
        }
        // 将布尔值转为整数
        if (typeof val === 'boolean') return val ? 1 : 0
        return val
      }))
      stmt.step()
      stmt.reset()
    }
    stmt.free()
  })
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
  if (db) {
    saveDatabase()
    db.close()
    db = null
    ready = false
    console.log('[DB] 数据库连接已关闭')
  }
}

/**
 * 获取数据库统计信息
 */
export function getDBStats() {
  if (!db) return { ready: false }

  const tables = queryAll(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )

  const tableStats = tables.map(t => {
    const count = queryOne(`SELECT COUNT(*) as count FROM ${t.name}`)
    return { name: t.name, rowCount: count?.count || 0 }
  })

  const fileSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0

  return {
    ready: true,
    path: DB_PATH,
    fileSize,
    fileSizeKB: (fileSize / 1024).toFixed(1),
    tables: tableStats,
    totalRows: tableStats.reduce((sum, t) => sum + t.rowCount, 0),
  }
}

export { DB_PATH }