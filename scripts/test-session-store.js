// 会话状态存储模块集成测试（内存降级路径）
// 本测试直接加载 api/lib/sessionStore.js 与 api/security/tokenBlacklist.js，
// 验证会话增删改查、登录历史、令牌吊销在内存降级路径下工作正常。
// 启动 Redis 并设置 REDIS_ENABLED=true 后，同一套代码会自动切换到 Redis 存储。
import { fileURLToPath } from 'url'
import path from 'path'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 避免污染真实环境，使用独立测试缓存目录
process.env.AUDIT_SQLITE_PATH = path.resolve(__dirname, '../data/test-audit.sqlite')

const {
  getSessions,
  setSessions,
  addSession,
  deleteSessions,
  getLoginHistory,
  addLoginHistory,
  deleteLoginHistory,
} = await import('../api/lib/sessionStore.js')

const { isTokenRevoked, revokeToken } = await import('../api/security/auth/tokenBlacklist.js')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  console.log('🔐 会话状态存储模块集成测试\n')

  const userId = `test-user-${Date.now()}`
  const token = `test-token-${crypto.randomUUID()}`
  const refreshToken = `test-refresh-${crypto.randomUUID()}`

  // 1. 初始会话为空
  let sessions = await getSessions(userId)
  assert(Array.isArray(sessions) && sessions.length === 0, '初始会话列表应为空')
  console.log('  ✅ 初始会话列表为空')

  // 2. 添加会话
  const session = {
    id: crypto.randomUUID(),
    device: 'Windows PC',
    browser: 'Chrome 120 · Windows 11',
    ip: '127.0.0.1',
    lastActive: new Date().toISOString(),
    isCurrent: true,
    token,
    refreshToken,
  }
  await addSession(userId, session)
  sessions = await getSessions(userId)
  assert(sessions.length === 1 && sessions[0].id === session.id, '添加会话后应能查询到')
  console.log('  ✅ 添加会话后查询成功')

  // 3. 更新会话列表
  sessions[0].lastActive = new Date().toISOString()
  await setSessions(userId, sessions)
  sessions = await getSessions(userId)
  assert(sessions.length === 1, '更新后会话数量应保持 1')
  console.log('  ✅ 更新会话列表成功')

  // 4. 添加登录历史
  await addLoginHistory(userId, {
    id: 'h' + Date.now(),
    dateTime: new Date().toISOString(),
    device: 'Windows PC',
    browser: 'Chrome',
    os: 'Windows 11',
    ip: '127.0.0.1',
    success: true,
  })
  const history = await getLoginHistory(userId)
  assert(Array.isArray(history) && history.length === 1, '登录历史应为 1 条')
  console.log('  ✅ 添加并查询登录历史成功')

  // 5. 令牌黑名单联动
  assert(!(await isTokenRevoked(token)), '新 token 不应被吊销')
  await revokeToken(token)
  assert(await isTokenRevoked(token), '吊销后 token 应被标记')
  console.log('  ✅ 令牌吊销与检查成功')

  // 6. 删除用户全部数据
  await deleteSessions(userId)
  await deleteLoginHistory(userId)
  sessions = await getSessions(userId)
  assert(sessions.length === 0, '删除后会话应为空')
  const historyAfterDelete = await getLoginHistory(userId)
  assert(historyAfterDelete.length === 0, '删除后登录历史应为空')
  console.log('  ✅ 删除用户全部会话与历史成功')

  // 7. 多用户隔离
  const userA = 'user-a'
  const userB = 'user-b'
  await addSession(userA, { id: 'sa1', device: 'A', browser: 'B', ip: '1.1.1.1', lastActive: new Date().toISOString(), isCurrent: true })
  await addSession(userB, { id: 'sb1', device: 'A', browser: 'B', ip: '2.2.2.2', lastActive: new Date().toISOString(), isCurrent: true })
  const aSessions = await getSessions(userA)
  const bSessions = await getSessions(userB)
  assert(aSessions.length === 1 && aSessions[0].id === 'sa1', '用户 A 数据应独立')
  assert(bSessions.length === 1 && bSessions[0].id === 'sb1', '用户 B 数据应独立')
  console.log('  ✅ 多用户会话隔离正确')

  // 清理
  await deleteSessions(userA)
  await deleteSessions(userB)

  console.log('\n✅ 会话状态存储模块集成测试通过')
  console.log('   提示：当前未检测到 Redis，测试验证的是内存降级路径。')
  console.log('   启动 Redis 并设置 REDIS_ENABLED=true 可验证 Redis 路径。')
}

main().catch(err => {
  console.error('\n❌ 测试失败:', err.message)
  process.exit(1)
})
