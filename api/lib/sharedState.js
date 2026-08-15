import { safeRedisOp, isRedisReady } from './redisClient.js'

// 内存回退存储（Redis 不可用时使用）
const memoryStrings = new Map()
const memoryHashes = new Map() // key -> Map(field, value)
const memorySets = new Map() // key -> Set<string>
const memoryCounters = new Map()

let fallbackWarned = false

function warnFallback(op) {
  if (fallbackWarned) return
  fallbackWarned = true
  console.warn(`[sharedState] Redis 不可用，操作 "${op}" 已降级为内存存储；PM2 多实例下状态可能不同步`)
}

function scheduleCleanup() {
  const now = Date.now()
  for (const [key, item] of memoryStrings) {
    if (item.expiry && now > item.expiry) memoryStrings.delete(key)
  }
  for (const [key, item] of memoryCounters) {
    if (item.expiry && now > item.expiry) memoryCounters.delete(key)
  }
}

setInterval(scheduleCleanup, 5 * 60 * 1000)

function serializeMember(member) {
  if (typeof member === 'string') return member
  return JSON.stringify(member)
}

// ===== 字符串读写（支持 TTL） =====

export async function setString(key, value, ttlSeconds = null) {
  const expiry = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null
  memoryStrings.set(key, { value: String(value), expiry })

  if (isRedisReady()) {
    if (ttlSeconds && ttlSeconds > 0) {
      await safeRedisOp(c => c.setEx(key, ttlSeconds, String(value)))
    } else {
      await safeRedisOp(c => c.set(key, String(value)))
    }
  } else {
    warnFallback('setString')
  }
}

export async function getString(key) {
  if (isRedisReady()) {
    return safeRedisOp(c => c.get(key), null)
  }

  const item = memoryStrings.get(key)
  if (!item) return null
  if (item.expiry && Date.now() > item.expiry) {
    memoryStrings.delete(key)
    return null
  }
  return item.value
}

export async function deleteString(key) {
  memoryStrings.delete(key)
  if (isRedisReady()) {
    await safeRedisOp(c => c.del(key))
  }
}

// ===== Hash 字段读写 =====

export async function setHashField(key, field, value) {
  if (!memoryHashes.has(key)) memoryHashes.set(key, new Map())
  memoryHashes.get(key).set(field, String(value))

  if (isRedisReady()) {
    await safeRedisOp(c => c.hSet(key, field, String(value)))
  } else {
    warnFallback('setHashField')
  }
}

export async function getHashField(key, field) {
  if (isRedisReady()) {
    return safeRedisOp(c => c.hGet(key, field), null)
  }

  return memoryHashes.get(key)?.get(field) ?? null
}

export async function deleteHashField(key, field) {
  memoryHashes.get(key)?.delete(field)
  if (isRedisReady()) {
    await safeRedisOp(c => c.hDel(key, field))
  }
}

// ===== Set 成员增删查 =====

export async function addSetMember(key, member) {
  const s = serializeMember(member)
  if (!memorySets.has(key)) memorySets.set(key, new Set())
  memorySets.get(key).add(s)

  if (isRedisReady()) {
    await safeRedisOp(c => c.sAdd(key, s))
  } else {
    warnFallback('addSetMember')
  }
}

export async function removeSetMember(key, member) {
  const s = serializeMember(member)
  memorySets.get(key)?.delete(s)

  if (isRedisReady()) {
    await safeRedisOp(c => c.sRem(key, s))
  }
}

export async function isSetMember(key, member) {
  const s = serializeMember(member)

  if (isRedisReady()) {
    return safeRedisOp(c => c.sIsMember(key, s), false)
  }

  warnFallback('isSetMember')
  return memorySets.get(key)?.has(s) ?? false
}

export async function getSetMembers(key) {
  if (isRedisReady()) {
    const members = await safeRedisOp(c => c.sMembers(key), [])
    return Array.isArray(members) ? members : []
  }

  warnFallback('getSetMembers')
  return Array.from(memorySets.get(key) ?? [])
}

// ===== 计数器递增（支持 TTL） =====

export async function incrementCounter(key, ttlSeconds = null) {
  if (isRedisReady()) {
    const newValue = await safeRedisOp(async (c) => {
      const v = await c.incr(key)
      if (ttlSeconds && ttlSeconds > 0) {
        await c.expire(key, ttlSeconds)
      }
      return v
    }, null)

    if (newValue !== null) return Number(newValue)
  }

  warnFallback('incrementCounter')
  const expiry = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null
  const item = memoryCounters.get(key) || { value: 0, expiry: null }
  item.value += 1
  if (expiry) item.expiry = expiry
  memoryCounters.set(key, item)
  return item.value
}

// 通用删除（字符串/计数器等独立 key）
export async function deleteKey(key) {
  memoryStrings.delete(key)
  memoryCounters.delete(key)
  if (isRedisReady()) {
    await safeRedisOp(c => c.del(key))
  }
}
