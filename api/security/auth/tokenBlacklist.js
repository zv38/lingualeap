import { isRedisReady } from '../../lib/redisClient.js'
import {
  addSetMember,
  removeSetMember,
  isSetMember,
  setString,
  getString,
} from '../../lib/sharedState.js'

const SET_KEY = 'token:blacklist:set'
const TTL_PREFIX = 'token:blacklist:ttl:'
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天
const memoryFallback = new Map()

const FAIL_CLOSED =
  process.env.TOKEN_BLACKLIST_FAIL_CLOSED === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.TOKEN_BLACKLIST_FAIL_CLOSED !== 'false')

function ttlKey(token) {
  return `${TTL_PREFIX}${token}`
}

function memorySet(token, revokedAt, expiresAt) {
  memoryFallback.set(token, { revokedAt, expiresAt })
}

function memoryGet(token) {
  const rec = memoryFallback.get(token)
  if (!rec) return null
  if (Date.now() > rec.expiresAt) {
    memoryFallback.delete(token)
    return null
  }
  return rec.revokedAt
}

/**
 * 吊销令牌。使用 sharedState Set 记录令牌，并配合带 TTL 的字符串键实现自动过期。
 */
export async function revokeToken(token, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!token) return
  const revokedAt = Date.now()
  const expiresAt = revokedAt + ttlSeconds * 1000
  memorySet(token, revokedAt, expiresAt)

  await addSetMember(SET_KEY, token)
  await setString(ttlKey(token), String(revokedAt), ttlSeconds)
}

/**
 * 异步查询 Redis 判断令牌是否已被吊销。
 */
export async function isTokenRevoked(token) {
  if (!token) return false

  if (isRedisReady()) {
    const member = await isSetMember(SET_KEY, token)
    if (!member) return false

    const revokedAt = await getString(ttlKey(token))
    if (!revokedAt) {
      // TTL 已过期，从集合中清理
      await removeSetMember(SET_KEY, token)
      return false
    }
    return true
  }

  // Redis 不可用：生产环境可配置 fail-closed
  if (FAIL_CLOSED) {
    return true
  }

  return memoryGet(token) !== null
}

/**
 * 获取令牌吊销时间戳，未吊销返回 null。
 */
export async function getTokenRevokedAt(token) {
  if (!token) return null

  const revokedAt = await getString(ttlKey(token))
  if (revokedAt) return Number(revokedAt)

  return memoryGet(token)
}

/**
 * 同步检查：仅在 Redis 不可用时检查内存回退。
 * Redis 就绪时返回 false（依赖异步路径做严格校验），但会尝试异步同步 Redis 状态到内存。
 */
export function isTokenRevokedSync(token) {
  if (!token) return false

  if (isRedisReady()) {
    // 不同步依赖内存，仅异步刷新内存缓存
    ;(async () => {
      const revoked = await isTokenRevoked(token)
      if (revoked) {
        memorySet(token, Date.now(), Date.now() + DEFAULT_TTL_SECONDS * 1000)
      }
    })().catch(() => {})
    return false
  }

  // Redis 不可用：先查内存回退，再尝试异步同步
  if (FAIL_CLOSED) {
    ;(async () => {
      const revoked = await isTokenRevoked(token)
      if (revoked) {
        memorySet(token, Date.now(), Date.now() + DEFAULT_TTL_SECONDS * 1000)
      }
    })().catch(() => {})
    return true
  }

  const fromMemory = memoryGet(token) !== null

  ;(async () => {
    const revoked = await isTokenRevoked(token)
    if (revoked) {
      memorySet(token, Date.now(), Date.now() + DEFAULT_TTL_SECONDS * 1000)
    }
  })().catch(() => {})

  return fromMemory
}

/**
 * 从内存回退中清理过期记录。Redis 键自带 TTL，无需额外清理。
 */
export function cleanupExpiredTokens(maxAgeMs = DEFAULT_TTL_SECONDS * 1000) {
  const now = Date.now()
  for (const [token, rec] of memoryFallback) {
    if (now > rec.expiresAt) {
      memoryFallback.delete(token)
    }
  }
}

// 每 5 分钟清理一次内存回退中的过期记录
setInterval(cleanupExpiredTokens, 5 * 60 * 1000)
