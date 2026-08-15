import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEncryptedFile, writeEncryptedFile } from '../api/security/privacy/fileVault.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'api', 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const DB_PATH = path.join(DATA_DIR, 'database.sqlite')
const TARGET_ID = 'admin-pentest-01'
const TARGET_EMAIL = 'pentest_admin@ll.local'

// 1) 清理加密 JSON
let removedJson = 0
const raw = await readEncryptedFile(USERS_FILE)
if (raw !== null) {
  const users = JSON.parse(raw)
  const filtered = users.filter(u => u.id !== TARGET_ID && u.email !== TARGET_EMAIL)
  removedJson = users.length - filtered.length
  await writeEncryptedFile(USERS_FILE, JSON.stringify(filtered, null, 2))
  console.log(`[JSON] 移除 ${removedJson} 个伪造账号`)
} else {
  console.log('[JSON] users.json 不存在')
}

// 2) 清理 SQLite
const SQL = await initSqlJs()
const buf = fs.readFileSync(DB_PATH)
const db = new SQL.Database(buf)
let removedDb = 0
try {
  db.run(`DELETE FROM users WHERE id = ? OR email = ?`, [TARGET_ID, TARGET_EMAIL])
  const res = db.exec('SELECT total_changes()')[0].values[0][0]
  removedDb = res
  // 持久化回写 database.sqlite
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
  console.log(`[SQLite] 删除影响行数: ${removedDb}`)
} catch (e) {
  console.log('[SQLite] 清理失败:', e.message)
} finally {
  db.close()
}

// 3) 校验
const verifyRaw = await readEncryptedFile(USERS_FILE)
const verifyUsers = verifyRaw ? JSON.parse(verifyRaw) : []
const adminIds = verifyUsers.filter(u => u.role === 'admin').map(u => u.id)
console.log('\n=== 最终 users.json 管理员 ===', adminIds.join(', ') || '(无)')
console.log('=== 用户总数 ===', verifyUsers.length)

const db2 = new SQL.Database(fs.readFileSync(DB_PATH))
try {
  const res = db2.exec("SELECT id,email FROM users WHERE role='admin'")
  console.log('=== 最终 SQLite 管理员 ===', res.length ? JSON.stringify(res[0].values) : '(无)')
} finally {
  db2.close()
}