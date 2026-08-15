import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEncryptedFile } from '../api/security/privacy/fileVault.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'api', 'data')

// users.json
const raw = await readEncryptedFile(path.join(DATA_DIR, 'users.json'))
const users = JSON.parse(raw)
console.log('[users.json] 用户数:', users.length)
console.log('[users.json] 管理员:', users.filter(u => u.role === 'admin').map(u => `id=${u.id} email=${u.email}`).join(' | ') || '(无)')

// SQLite
const SQL = await initSqlJs()
const db = new SQL.Database(fs.readFileSync(path.join(DATA_DIR, 'database.sqlite')))
try {
  const res = db.exec("SELECT id,email,role FROM users")
  if (res.length) {
    console.log('[SQLite] 用户数:', res[0].values.length)
    console.log('[SQLite] 管理员:', res[0].values.filter(r => r[2] === 'admin').map(r => `id=${r[0]} email=${r[1]}`).join(' | ') || '(无)')
  } else {
    console.log('[SQLite] users 表为空')
  }
} catch (e) {
  console.log('[SQLite] 查询失败:', e.message)
} finally {
  db.close()
}

// 白名单
const wlPath = path.join(DATA_DIR, 'admin-verified-whitelist.json')
if (fs.existsSync(wlPath)) {
  console.log('[whitelist] 存在:', fs.readFileSync(wlPath, 'utf-8'))
} else {
  console.log('[whitelist] 文件不存在（守卫重启后会自动生成带签名版本）')
}