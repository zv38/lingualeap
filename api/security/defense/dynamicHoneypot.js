import crypto from 'crypto'
import { BlockList } from '../core/guards.js'

const REPUTATION_DECAY = 3600000
const BLOCK_THRESHOLD = 80
const BLOCK_DURATION = 86400000
// ── 蜜罐误伤缓解参数 ──
// 冷却 TTL：一次封禁到期后，即使 reputation 仍高位，也需信号在冷却期内重新积累到
// REBLOCK_THRESHOLD 才会再次封禁，避免良性高频 IP 被“永久式”反复隔离。
const COOLDOWN_TTL = 3600000      // 1 小时冷却期
const REBLOCK_THRESHOLD = 95     // 冷却期内重新封禁所需更高阈值（顽固攻击者）
// 可信代理：仅当直连对端命中这些代理时，才信任 X-Forwarded-For 中的真实客户端 IP，
// 防止攻击者伪造 XFF 把恶意流量嫁祸给他人。
const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'])

const DYNAMIC_PATHS = [
  '/api/admin/settings',
  '/api/server/status',
  '/api/internal/health',
  '/api/staging/config',
  '/api/credentials/test',
  '/api/oauth/token',
  '/api/v2/admin/users',
  '/api/debug/performance',
  '/api/secret/key',
  '/api/internal/backup',
]

class IPReputation {
  constructor() {
    this.scores = new Map()
    this.history = new Map()
    this.log = []
  }

  /**
   * 从 XFF/X-Real-IP 提取真实客户端 IP，仅当直连对端为可信代理时信任。
   * 防止攻击者伪造 XFF 将恶意流量嫁祸给真实用户（XFF 恢复场景）。
   */
  resolveClientIP(req, peerIp) {
    const peer = String(peerIp || '').trim()
    if (!TRUSTED_PROXIES.has(peer)) {
      // 直连非可信代理：不信任任何 XFF，直接使用对端 socket IP
      return peer
    }
    const xff = req?.headers?.['x-forwarded-for']
    if (typeof xff === 'string' && xff.trim()) {
      // 取最左（最初发起）的非空条目作为真实客户端；若非法则回退对端 IP
      const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
      if (parts.length) return parts[0]
    }
    const real = req?.headers?.['x-real-ip']
    if (typeof real === 'string' && real.trim()) return real.trim()
    return peer
  }

  recordSignal(ip, signalType, weight, clientIp) {
    const now = Date.now()
    // XFF 恢复：若上层调用传入真实客户端 IP，则以其为准，避免共享代理被连带误伤
    const key = clientIp || ip
    if (!this.scores.has(key)) {
      this.scores.set(key, { score: 0, lastDecay: now, lastBlockTime: 0 })
    }
    if (!this.history.has(key)) {
      this.history.set(key, [])
    }

    const rep = this.scores.get(key)
    const elapsed = now - rep.lastDecay
    if (elapsed > REPUTATION_DECAY) {
      const decayFactor = Math.floor(elapsed / REPUTATION_DECAY)
      rep.score = Math.max(0, rep.score - decayFactor * 5)
      rep.lastDecay = now
    }

    rep.score = Math.min(100, rep.score + weight)

    const entry = { time: now, signalType, weight }
    this.history.get(key).push(entry)
    this.log.push({ ip: key, ...entry })
    if (this.history.get(key).length > 10) this.history.get(key).shift()
    if (this.log.length > 10000) this.log.shift()

    // 冷却 TTL：封禁过期后处于冷却期时，仅当分数重新累计到更高阈值才复封，
    // 防止良性高频 IP 到期立被反复封禁（“永久式”隔离）。
    const blocked = BlockList.isBlocked(key)
    const inCooldown = !blocked && Date.now() - rep.lastBlockTime < COOLDOWN_TTL
    const threshold = inCooldown ? REBLOCK_THRESHOLD : BLOCK_THRESHOLD
    if (rep.score >= threshold) {
      BlockList.add(key, BLOCK_DURATION)
      rep.lastBlockTime = now
    }

    return rep.score
  }

  /**
   * 解封自助通道：解除 BlockList 封禁并清零信誉分。
   * 由校验过“人机证明”的接口调用，避免被封 IP 直接调用绕过。
   */
  unblock(ip) {
    BlockList.remove(ip)
    const rep = this.scores.get(ip)
    if (rep) {
      rep.score = 0
      rep.lastDecay = Date.now()
      rep.lastBlockTime = Date.now()
    }
  }

  isBlocked(ip) {
    return BlockList.isBlocked(ip)
  }

  getScore(ip) {
    const rep = this.scores.get(ip)
    if (!rep) return 0
    const elapsed = Date.now() - rep.lastDecay
    if (elapsed > REPUTATION_DECAY) {
      const decayFactor = Math.floor(elapsed / REPUTATION_DECAY)
      rep.score = Math.max(0, rep.score - decayFactor * 5)
      rep.lastDecay = Date.now()
    }
    return rep.score
  }

  resetScore(ip) {
    const rep = this.scores.get(ip)
    if (rep) {
      rep.score = 0
      rep.lastDecay = Date.now()
    }
  }

  getStats() {
    const blocked = []
    for (const [ip] of this.scores) {
      const score = this.getScore(ip)
      if (score >= BLOCK_THRESHOLD) blocked.push({ ip, score })
    }
    return {
      trackedIPs: this.scores.size,
      blockedCount: blocked.length,
      topThreats: blocked.sort((a, b) => b.score - a.score).slice(0, 20),
      recentSignals: this.log.slice(-50).reverse(),
    }
  }
}

class DynamicHoneypot {
  constructor() {
    this.activePaths = []
    this.lastRotation = 0
    this.ROTATION_INTERVAL = 1800000
    this.rotate()
  }

  rotate() {
    const shuffled = [...DYNAMIC_PATHS].sort(() => Math.random() - 0.5)
    this.activePaths = shuffled.slice(0, 3 + Math.floor(Math.random() * 2))
    this.lastRotation = Date.now()
  }

  getActivePaths() {
    if (Date.now() - this.lastRotation > this.ROTATION_INTERVAL) {
      this.rotate()
    }
    return this.activePaths
  }

  createResponse(req) {
    const fakeData = {
      '/api/admin/settings': {
        site_name: 'LinguaLeap Internal',
        maintenance_mode: false,
        db_host: '10.0.0.1',
        db_name: 'lingualeap_prod',
        redis_host: '10.0.0.2',
        admin_email: 'root@lingualeap-internal.com',
        secret_key: crypto.randomBytes(16).toString('hex'),
      },
      '/api/internal/health': {
        status: 'healthy',
        uptime: `${Math.floor(Math.random() * 365)}d ${Math.floor(Math.random() * 24)}h`,
        version: 'v2.1.' + Math.floor(Math.random() * 10),
        load: (Math.random() * 5).toFixed(2),
        memory: `${Math.floor(Math.random() * 60 + 20)}%`,
        active_connections: Math.floor(Math.random() * 1000),
      },
      '/api/credentials/test': {
        success: true,
        message: '数据库连接成功',
        server: 'db-01.internal',
        latency: `${Math.floor(Math.random() * 50 + 5)}ms`,
      },
      '/api/oauth/token': {
        access_token: `eyJ${crypto.randomBytes(32).toString('base64url')}`,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'admin full_access',
      },
      '/api/secret/key': {
        key: `sk_live_${crypto.randomBytes(16).toString('hex')}`,
        algorithm: 'HS256',
        created: new Date().toISOString(),
        permissions: ['read', 'write', 'admin', 'delete'],
      },
    }

    const response = fakeData[req.path] || {
      success: true,
      message: '操作成功',
      data: { id: crypto.randomUUID(), timestamp: new Date().toISOString() },
    }

    return response
  }
}

export const ipReputation = new IPReputation()
export const dynamicHoneypot = new DynamicHoneypot()