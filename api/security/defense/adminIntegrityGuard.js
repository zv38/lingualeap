// ===== 管理员完整性守卫 =====
// 军工级：自动检测并立即删除「未通过验证流程创建」的管理员账号。
//
// 背景：曾发现通过直接写入 SQLite / 加密 JSON 插入的伪造管理员账号（如 pentest_admin），
// 绕过代码层面的创建校验。本守卫维护一个「已验证管理员」白名单：
//   - 系统管理员 admin-1 始终可信（由 seedAdmin 代码路径创建）；
//   - 其余管理员只有在通过 /admin/create-admin 完整验证链（口令 + 图形验证码 + TOTP + 二次验证）
//     创建后，才会被 registerVerifiedAdmin() 加入白名单。
//
// 行为：
//   - 周期性扫描内存 usersDB 与 SQLite 两张表来源；
//   - 任何 role === 'admin' 但不在白名单内的账号 → 立即删除（内存 + SQLite + 加密 JSON）。
//   - 删除即持久化：saveUsers() 会重写 users.json 与 SQLite，确保伪造账号被彻底移除（系统具备删除文件的能力）。
//   - 全程记录审计日志，便于追溯。

import { logAudit } from '../core/auditLogger.js'
import { signSecretValue, verifySecretValue } from '../vault/secretVault.js'
import fs from 'fs'
import path from 'path'

const DEFAULT_INTERVAL_MS = 30 * 1000 // 默认每 30 秒扫描一次
const WHITELIST_FILE_NAME = 'admin-verified-whitelist.json'

export function createAdminIntegrityGuard(deps) {
  const {
    usersDB,
    saveUsers,
    verifiedAdminIds = new Set(['admin-1']),
    dataDir,
  } = deps

  const whitelistFile = dataDir ? path.join(dataDir, WHITELIST_FILE_NAME) : null

  // —— 白名单持久化：防止重启后误删通过验证链创建的管理员 ——
  // 军工级：白名单文件带 HMAC 完整性签名，防止被直接篡改「洗白」伪造管理员。
  // 签名校验失败 → 丢弃整个文件内容，回退到仅系统管理员 admin-1，并告警。
  const WHITELIST_SIG_NAME = 'admin-verified-whitelist'

  function loadWhitelistFile() {
    if (!whitelistFile) return
    try {
      if (fs.existsSync(whitelistFile)) {
        const raw = fs.readFileSync(whitelistFile, 'utf-8')
        const parsed = JSON.parse(raw)

        // 校验完整性签名：签名缺失或校验失败均视为文件被篡改
        const sig = parsed?.sig
        const admins = parsed?.admins
        if (!Array.isArray(admins) || !sig || !verifySecretValue(WHITELIST_SIG_NAME, JSON.stringify(admins), sig)) {
          console.warn(
            '[AdminGuard] ⚠️ 白名单文件签名校验失败（疑似被直接篡改），已丢弃全部白名单条目，回退到仅系统管理员 admin-1'
          )
          verifiedAdminIds.clear()
          verifiedAdminIds.add('admin-1')
          logAudit({
            userId: 'system',
            action: 'admin_whitelist_tamper_detected',
            ip: 'system',
            details: '白名单文件签名校验失败，疑似被直接篡改，已回退到仅系统管理员',
            success: false,
          })
          return
        }

        for (const id of admins) {
          if (typeof id === 'string' && id.trim()) verifiedAdminIds.add(id.trim())
        }
      }
    } catch (e) {
      console.warn('[AdminGuard] 读取白名单文件失败:', e.message)
    }
  }

  function persistWhitelistFile() {
    if (!whitelistFile) return
    try {
      const admins = [...verifiedAdminIds]
      const sig = signSecretValue(WHITELIST_SIG_NAME, JSON.stringify(admins))
      fs.writeFileSync(whitelistFile, JSON.stringify({ admins, sig }, null, 2), 'utf-8')
    } catch (e) {
      console.warn('[AdminGuard] 写入白名单文件失败:', e.message)
    }
  }

  loadWhitelistFile()

  let timer = null
  let running = false

  /**
   * 将某个管理员 ID 登记为「已验证」，仅创建接口的完整验证链通过后调用。
   */
  function registerVerifiedAdmin(adminId) {
    if (!adminId) return
    verifiedAdminIds.add(adminId)
    persistWhitelistFile()
    logAudit({
      userId: adminId,
      action: 'admin_verified_registered',
      ip: 'system',
      details: `管理员 ${adminId} 已登记为已验证，加入完整性守卫白名单`,
      success: true,
    })
  }

  /**
   * 从内存 usersDB 中识别未授权管理员。
   */
  function collectUnauthorizedInMemory() {
    const unauthorized = []
    for (const user of usersDB.values()) {
      if (!user) continue
      if (user.role === 'admin' && !verifiedAdminIds.has(user.id)) {
        unauthorized.push(user)
      }
    }
    return unauthorized
  }

  /**
   * 从 SQLite users 表中识别未授权管理员（防止直接写库绕过内存）。
   */
  function collectUnauthorizedInSQLite() {
    const unauthorized = []
    try {
      // 动态导入避免循环依赖；SQLite 未初始化时静默跳过
    } catch {
      return unauthorized
    }
    return unauthorized
  }

  /**
   * 删除一个未授权管理员账号：内存 Map + SQLite 行 + 加密 JSON 持久化。
   * @returns {Promise<boolean>} 是否成功彻底移除
   */
  async function deleteUnauthorizedAdmin(user) {
    const { id, email, username } = user
    let removedMem = false
    let removedDB = false
    let removedJSON = false

    // 1) 内存
    if (usersDB.has(id)) {
      usersDB.delete(id)
      removedMem = true
    }

    // 2) SQLite 行（直接删除，防御直接写库的伪造账号）
    try {
      const { isReady, execute, saveDatabase } = await import('../../database/db.js')
      if (isReady()) {
        const res = execute('DELETE FROM users WHERE id = ?', [id])
        if (res.changes > 0) {
          removedDB = true
          saveDatabase()
        }
      }
    } catch {
      // SQLite 不可用时忽略，交由 saveUsers 兜底
    }

    // 3) 加密 JSON + SQLite 全量重写（saveUsers 内部同步双写）
    if (typeof saveUsers === 'function') {
      try {
        await saveUsers(usersDB)
        removedJSON = true
      } catch (e) {
        console.warn('[AdminGuard] 持久化删除失败:', e.message)
      }
    }

    logAudit({
      userId: id,
      action: 'admin_unauthorized_deleted',
      ip: 'system',
      details: `自动删除未授权管理员 ${email || username || id}（内存=${removedMem}, SQLite=${removedDB}, JSON=${removedJSON}）`,
      success: removedMem || removedDB || removedJSON,
    })

    console.warn(
      `[AdminGuard] 🛡️ 已自动删除未授权管理员账号 ${email || username}（${id}）` +
      ` | 内存=${removedMem} SQLite=${removedDB} 持久化=${removedJSON}`
    )

    return removedMem || removedDB || removedJSON
  }

  /**
   * 执行一轮完整性扫描：找出未授权管理员并立即删除。
   */
  async function scanOnce() {
    // 内存来源
    const inMemory = collectUnauthorizedInMemory()

    // SQLite 来源（直接读库，防止伪造账号只存在于存储层而内存未加载）
    let inSQLite = []
    try {
      const { isReady, queryAll } = await import('../../database/db.js')
      if (isReady()) {
        const rows = queryAll("SELECT id, email, username, role FROM users WHERE role = 'admin'")
        inSQLite = rows
          .filter(r => r && !verifiedAdminIds.has(r.id))
          .map(r => ({ id: r.id, email: r.email, username: r.username, role: 'admin' }))
      }
    } catch {
      inSQLite = []
    }

    // 合并去重（按 id）
    const seen = new Set()
    const targets = []
    for (const u of [...inMemory, ...inSQLite]) {
      if (!u || !u.id || seen.has(u.id)) continue
      seen.add(u.id)
      targets.push(u)
    }

    if (targets.length === 0) return 0

    let deleted = 0
    for (const user of targets) {
      try {
        const ok = await deleteUnauthorizedAdmin(user)
        if (ok) deleted++
      } catch (e) {
        console.warn('[AdminGuard] 删除未授权管理员失败:', e.message)
      }
    }
    return deleted
  }

  /**
   * 启动周期性守卫。
   */
  function start(intervalMs = DEFAULT_INTERVAL_MS) {
    if (running) return
    running = true
    // 启动立即执行一次，随后按周期扫描
    scanOnce().catch(() => {})
    timer = setInterval(() => {
      scanOnce().catch(() => {})
    }, intervalMs)
    if (timer.unref) timer.unref()
    console.log(`[AdminGuard] 管理员完整性守卫已启动（每 ${Math.round(intervalMs / 1000)}s 扫描一次）`)
  }

  /**
   * 停止守卫。
   */
  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    running = false
  }

  return {
    registerVerifiedAdmin,
    scanOnce,
    start,
    stop,
    getVerifiedAdminIds: () => new Set(verifiedAdminIds),
  }
}