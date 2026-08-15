// ===== 隔离系统测试脚本 =====
// 用法：node scripts/test-isolation.js [baseUrl]
// 示例：node scripts/test-isolation.js http://127.0.0.1:3001

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(__dirname, '..', 'isolation-state.json')

// 重置上一次测试可能留下的隔离状态
if (fs.existsSync(STATE_FILE)) {
  fs.unlinkSync(STATE_FILE)
  console.log('[INIT] 已清除历史隔离状态')
}

const BASE = process.argv[2] || 'http://127.0.0.1:3001'

// 模拟外部攻击者 IP，确保本地测试也能触发隔离
const TEST_ATTACKER_IP = '192.0.2.100'

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
}

function log(level, msg) {
  const c = level === 'ok' ? colors.green : level === 'warn' ? colors.yellow : level === 'info' ? colors.blue : colors.red
  console.log(`${c}[${level.toUpperCase()}]${colors.reset} ${msg}`)
}

async function request(path, opts = {}) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...opts,
    headers: {
      'User-Agent': opts.ua || 'isolation-test-script/1.0',
      'X-Forwarded-For': opts.realIp || TEST_ATTACKER_IP,
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), json, text }
}

async function getStatus() {
  // 状态查询使用本地 IP，避免被隔离规则阻止
  const { json } = await request('/api/test/isolation/status', { realIp: '127.0.0.1' })
  return json?.data || json
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function run() {
  console.log(`\n${colors.magenta}=== 隔离系统自动化测试 ===${colors.reset}\n`)

  // 0. 基础连通性
  log('info', `测试后端连通性: ${BASE}`)
  const health = await request('/api/health')
  if (health.status !== 200) {
    log('error', `健康检查失败: ${health.status}`)
    process.exit(1)
  }
  log('ok', '健康检查通过')

  // 1. 敏感路径扫描测试
  log('info', '1. 敏感路径扫描测试（触发警戒/半隔离）')
  for (let i = 0; i < 8; i++) {
    const paths = ['/.env', '/.git/config', '/vite.config.ts', '/src/App.tsx', '/@fs/etc/passwd']
    const p = paths[i % paths.length]
    await request(p)
  }
  await wait(1000)
  let status = await getStatus()
  log(status?.level !== 'normal' ? 'ok' : 'warn', `敏感扫描后隔离级别: ${status?.level || 'unknown'}, 原因: ${status?.reason || 'none'}`)

  // 2. 管理员接口未授权访问测试
  log('info', '2. 管理员接口未授权访问测试')
  for (let i = 0; i < 5; i++) {
    await request('/api/admin/isolation', { headers: { Authorization: 'Bearer fake-token' } })
  }
  await wait(1000)
  status = await getStatus()
  log(status?.level !== 'normal' ? 'ok' : 'warn', `管理员攻击后隔离级别: ${status?.level || 'unknown'}`)

  // 3. 可疑 User-Agent 扫描测试
  log('info', '3. 可疑 User-Agent 扫描测试')
  for (let i = 0; i < 6; i++) {
    await request('/api/admin/users', { ua: 'sqlmap/1.0' })
  }
  await wait(1000)
  status = await getStatus()
  log(status?.level !== 'normal' ? 'ok' : 'warn', `可疑 UA 后隔离级别: ${status?.level || 'unknown'}`)

  // 4. 验证隔离生效：普通请求应被阻止或受限
  log('info', '4. 验证隔离生效：非核心接口应返回 503')
  const blocked = await request('/api/me')
  if (blocked.status === 503 && blocked.json?.code === 'ISOLATION_BLOCKED') {
    log('ok', `隔离已生效，/api/me 返回 503 ISOLATION_BLOCKED`)
  } else {
    log('warn', `/api/me 返回 ${blocked.status}，隔离可能未生效或处于 alert 级别`)
  }

  // 5. 验证 health 头携带隔离级别
  log('info', '5. 验证 /api/health 响应头携带 X-Isolation-Level')
  const h2 = await request('/api/health')
  const isoLevel = h2.headers['x-isolation-level']
  log(isoLevel && isoLevel !== 'normal' ? 'ok' : 'warn', `X-Isolation-Level = ${isoLevel || 'missing'}`)

  // 6. 手动解除隔离（需要管理员登录）
  log('info', '6. 尝试手动解除隔离（需要管理员已登录）')
  log('warn', '如果未登录管理员账号，此步骤会失败。测试结束后请手动调用 /api/admin/isolation/deactivate 解除。')

  console.log(`\n${colors.magenta}=== 测试结束 ===${colors.reset}`)
  console.log(`当前隔离状态: ${status?.level || 'unknown'}`)
  console.log(`查看详情: ${BASE}/api/admin/isolation`)
}

run().catch(err => {
  console.error('测试出错:', err.message)
  process.exit(1)
})
