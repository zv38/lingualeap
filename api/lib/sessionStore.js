import { safeRedisOp, isRedisReady } from './redisClient.js'

const KEY_PREFIX_SESSIONS = 'sessions:'
const KEY_PREFIX_LOGIN_HISTORY = 'login_history:'
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天，与 refresh token 有效期一致

// 内存兜底（开发环境无 Redis 时使用）
const memorySessions = new Map()
const memoryLoginHistory = new Map()

function getMemorySessions(userId) {
  return memorySessions.get(userId) || []
}

function setMemorySessions(userId, sessions) {
  memorySessions.set(userId, sessions)
}

function deleteMemorySessions(userId) {
  memorySessions.delete(userId)
}

function getMemoryLoginHistory(userId) {
  return memoryLoginHistory.get(userId) || []
}

function setMemoryLoginHistory(userId, history) {
  memoryLoginHistory.set(userId, history)
}

function deleteMemoryLoginHistory(userId) {
  memoryLoginHistory.delete(userId)
}

async function getRedisSessions(userId) {
  const raw = await safeRedisOp(c => c.get(KEY_PREFIX_SESSIONS + userId), null)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function setRedisSessions(userId, sessions) {
  await safeRedisOp(
    c => c.setEx(KEY_PREFIX_SESSIONS + userId, DEFAULT_TTL_SECONDS, JSON.stringify(sessions)),
    null
  )
}

async function deleteRedisSessions(userId) {
  await safeRedisOp(c => c.del(KEY_PREFIX_SESSIONS + userId), null)
}

async function getRedisLoginHistory(userId) {
  const raw = await safeRedisOp(c => c.get(KEY_PREFIX_LOGIN_HISTORY + userId), null)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function setRedisLoginHistory(userId, history) {
  await safeRedisOp(
    c => c.setEx(KEY_PREFIX_LOGIN_HISTORY + userId, DEFAULT_TTL_SECONDS, JSON.stringify(history)),
    null
  )
}

async function deleteRedisLoginHistory(userId) {
  await safeRedisOp(c => c.del(KEY_PREFIX_LOGIN_HISTORY + userId), null)
}

/**
 * 获取用户会话列表
 */
export async function getSessions(userId) {
  if (isRedisReady()) return getRedisSessions(userId)
  return getMemorySessions(userId)
}

/**
 * 覆盖用户会话列表
 */
export async function setSessions(userId, sessions) {
  if (isRedisReady()) await setRedisSessions(userId, sessions)
  else setMemorySessions(userId, sessions)
}

/**
 * 添加一条会话记录
 */
export async function addSession(userId, session) {
  const sessions = await getSessions(userId)
  sessions.push(session)
  await setSessions(userId, sessions)
}

/**
 * 删除用户全部会话
 */
export async function deleteSessions(userId) {
  if (isRedisReady()) await deleteRedisSessions(userId)
  else deleteMemorySessions(userId)
}

/**
 * 获取用户登录历史
 */
export async function getLoginHistory(userId) {
  if (isRedisReady()) return getRedisLoginHistory(userId)
  return getMemoryLoginHistory(userId)
}

/**
 * 覆盖用户登录历史
 */
export async function setLoginHistory(userId, history) {
  if (isRedisReady()) await setRedisLoginHistory(userId, history)
  else setMemoryLoginHistory(userId, history)
}

/**
 * 添加一条登录历史记录
 */
export async function addLoginHistory(userId, record) {
  const history = await getLoginHistory(userId)
  history.unshift(record)
  // 控制历史长度，避免无限增长
  if (history.length > 100) history.length = 100
  await setLoginHistory(userId, history)
}

/**
 * 删除用户全部登录历史
 */
export async function deleteLoginHistory(userId) {
  if (isRedisReady()) await deleteRedisLoginHistory(userId)
  else deleteMemoryLoginHistory(userId)
}
