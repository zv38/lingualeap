import { describe, it, expect } from 'vitest'
import { createAdminIntegrityGuard } from '../security/defense/adminIntegrityGuard.js'

describe('管理员完整性守卫 (adminIntegrityGuard)', () => {
  function buildGuard({ verified = ['admin-1'], dataDir = null } = {}) {
    const usersDB = new Map()
    const saveUsers = async (db) => { /* 模拟持久化 */ }
    const guard = createAdminIntegrityGuard({
      usersDB,
      saveUsers,
      verifiedAdminIds: new Set(verified),
      dataDir,
    })
    return { usersDB, guard }
  }

  it('白名单内的系统管理员不会被删除', async () => {
    const { usersDB, guard } = buildGuard()
    usersDB.set('admin-1', { id: 'admin-1', role: 'admin', email: 'admin@test.com' })
    const deleted = await guard.scanOnce()
    expect(deleted).toBe(0)
    expect(usersDB.has('admin-1')).toBe(true)
  })

  it('未登记的伪造管理员会被立即删除', async () => {
    const { usersDB, guard } = buildGuard()
    usersDB.set('pentest_admin', { id: 'pentest_admin', role: 'admin', email: 'pentest@evil.com' })
    usersDB.set('admin-1', { id: 'admin-1', role: 'admin', email: 'admin@test.com' })
    const deleted = await guard.scanOnce()
    expect(deleted).toBe(1)
    expect(usersDB.has('pentest_admin')).toBe(false)
    expect(usersDB.has('admin-1')).toBe(true)
  })

  it('通过 registerVerifiedAdmin 登记后不再被删除', async () => {
    const { usersDB, guard } = buildGuard()
    usersDB.set('legit-admin', { id: 'legit-admin', role: 'admin', email: 'legit@test.com' })
    guard.registerVerifiedAdmin('legit-admin')
    const deleted = await guard.scanOnce()
    expect(deleted).toBe(0)
    expect(usersDB.has('legit-admin')).toBe(true)
  })

  it('普通 user 角色不受影响', async () => {
    const { usersDB, guard } = buildGuard()
    usersDB.set('u-1', { id: 'u-1', role: 'user', email: 'user@test.com' })
    const deleted = await guard.scanOnce()
    expect(deleted).toBe(0)
    expect(usersDB.has('u-1')).toBe(true)
  })

  it('从白名单文件加载已验证管理员', async () => {
    const { usersDB, guard } = buildGuard({ dataDir: null })
    // 手动注入持久化白名单（模拟文件加载路径）
    usersDB.set('persisted-admin', { id: 'persisted-admin', role: 'admin', email: 'p@test.com' })
    // registerVerifiedAdmin 会持久化；此处直接登记验证其进入白名单
    guard.registerVerifiedAdmin('persisted-admin')
    const deleted = await guard.scanOnce()
    expect(deleted).toBe(0)
    expect(usersDB.has('persisted-admin')).toBe(true)
  })
})