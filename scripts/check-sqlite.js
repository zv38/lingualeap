import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'api', 'data', 'database.sqlite')

const SQL = await initSqlJs()
const buf = fs.readFileSync(DB_PATH)
const db = new SQL.Database(buf)

try {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")
  console.log('=== 表 ===')
  console.log(JSON.stringify(tables))
  try {
    const res = db.exec("SELECT id,email,username,role FROM users WHERE role='admin'")
    if (res.length === 0) {
      console.log('users 表无 admin 数据 或 表为空')
    } else {
      console.log('=== SQLite 中的管理员 ===')
      console.log(JSON.stringify(res[0].values))
    }
  } catch (e) {
    console.log('查询 users 失败:', e.message)
  }
} finally {
  db.close()
}