import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config({ path: ['.env', '.env.local'], override: true })

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET missing')
const kv = crypto.createHash('sha256').update(JWT_SECRET).digest('hex').substring(0, 16)
const token = jwt.sign({ userId: 'admin-1', type: 'access', role: 'admin', kv }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' })

const BASE = 'http://localhost:3001'

async function req(method, path, { body, csrfToken } = {}) {
  const headers = { Authorization: 'Bearer ' + token }
  if (csrfToken && method.toUpperCase() !== 'GET') headers['X-CSRF-Token'] = csrfToken
  let fetchBody
  if (body) {
    headers['Content-Type'] = 'application/json'
    fetchBody = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: fetchBody })
  const text = await res.text()
  let json = null
  if (text) try { json = JSON.parse(text) } catch {}
  return { status: res.status, json }
}

// 1. 获取 CSRF token（绑定本地 IP）
const csrfRes = await req('GET', '/api/csrf-token')
const csrfToken = csrfRes.json?.data?.csrfToken || csrfRes.json?.data?.token
if (!csrfToken) {
  console.error('无法获取 CSRF token:', csrfRes.json?.message || csrfRes.status)
  process.exit(1)
}

// 2. 调用解除隔离接口
const res = await req('POST', '/api/admin/isolation/deactivate', { csrfToken })
console.log(JSON.stringify(res.json, null, 2))
