// 临时验证：确认守卫的白名单签名机制能防篡改
import { createAdminIntegrityGuard } from '../api/security/defense/adminIntegrityGuard.js'
import { signSecretValue } from '../api/security/vault/secretVault.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-sig-'))

function buildGuard(users) {
  const usersDB = new Map()
  for (const u of users) usersDB.set(u.id, u)
  const saveUsers = async () => {}
  const guard = createAdminIntegrityGuard({ usersDB, saveUsers, verifiedAdminIds: new Set(['admin-1']), dataDir: tmpDir })
  return { usersDB, guard }
}

// 测试1: 合法签名白名单被正确加载
const wlFile = path.join(tmpDir, 'admin-verified-whitelist.json')
const legitAdmins = ['admin-1', 'legit-admin']
const sig = signSecretValue('admin-verified-whitelist', JSON.stringify(legitAdmins))
fs.writeFileSync(wlFile, JSON.stringify({ admins: legitAdmins, sig }, null, 2))
const { usersDB: db1, guard: g1 } = buildGuard([
  { id: 'admin-1', role: 'admin' },
  { id: 'legit-admin', role: 'admin' },
])
const deleted1 = await g1.scanOnce()
console.log('[测试1] 合法签名白名单: 删除数=', deleted1, '| 期望0 →', deleted1 === 0 ? 'PASS' : 'FAIL')

// 测试2: 被篡改的白名单（伪造账号洗白）应被拒绝，伪造账号被删除
const tamperedAdmins = ['admin-1', 'admin-pentest-01']
// 写入无签名或错误签名的白名单（模拟攻击者直接改文件）
fs.writeFileSync(wlFile, JSON.stringify({ admins: tamperedAdmins, sig: 'forged-signature' }, null, 2))
const { usersDB: db2, guard: g2 } = buildGuard([
  { id: 'admin-1', role: 'admin' },
  { id: 'admin-pentest-01', role: 'admin' },
])
const deleted2 = await g2.scanOnce()
console.log('[测试2] 篡改白名单: 删除数=', deleted2, '| 期望1（删除伪造）→', deleted2 === 1 ? 'PASS' : 'FAIL')
console.log('[测试2] 伪造账号已移除:', !db2.has('admin-pentest-01') ? 'PASS' : 'FAIL')
console.log('[测试2] 合法 admin-1 保留:', db2.has('admin-1') ? 'PASS' : 'FAIL')

fs.rmSync(tmpDir, { recursive: true, force: true })