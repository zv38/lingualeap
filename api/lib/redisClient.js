import { createClient } from 'redis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
// 生产环境默认启用 Redis；开发环境仅在显式启用或限流器指定 redis 时启用，避免无 Redis 时请求挂起
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.REDIS_ENABLED !== 'false') ||
  process.env.RATE_LIMIT_STORE === 'redis'
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 3000)

let client = null
let isReady = false
let isConnecting = false
let connectFailed = false

async function connectRedis() {
  if (client?.isReady) return client
  if (isConnecting) {
    // 等待连接完成，最多等 2 倍超时时间
    let waited = 0
    while (isConnecting && waited < REDIS_CONNECT_TIMEOUT_MS * 2) {
      await new Promise(r => setTimeout(r, 50))
      waited += 50
    }
    return client
  }

  if (!REDIS_ENABLED || connectFailed) {
    return null
  }

  isConnecting = true
  try {
    const newClient = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: false, // 连接失败后不重连，由应用层控制
      },
    })
    newClient.on('error', (err) => {
      // 避免连接失败时无限打印
      if (isReady) {
        console.error('[Redis] client error:', err.message)
      }
    })
    newClient.on('connect', () => {
      console.log('[Redis] 已连接到', REDIS_URL.replace(/:\/\/.*@/, '://***@'))
    })
    newClient.on('ready', () => {
      isReady = true
    })
    newClient.on('end', () => {
      isReady = false
    })

    await Promise.race([
      newClient.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis 连接超时')), REDIS_CONNECT_TIMEOUT_MS)
      ),
    ])
    client = newClient
    isReady = true
    return client
  } catch (err) {
    console.warn(`[Redis] 连接失败: ${err.message}，已降级为内存模式`)
    connectFailed = true
    client = null
    isReady = false
    return null
  } finally {
    isConnecting = false
  }
}

export function getRedisClient() {
  return client
}

export function isRedisReady() {
  return isReady && client?.isReady
}

/**
 * 安全执行 Redis 操作，失败时返回 fallbackValue 且不抛异常
 */
export async function safeRedisOp(op, fallbackValue = null) {
  try {
    const c = await connectRedis()
    if (!c) return fallbackValue
    return await op(c)
  } catch (err) {
    console.warn('[Redis] 操作失败:', err.message)
    return fallbackValue
  }
}

/**
 * 同步获取当前 Redis 状态（用于不便于 await 的场景）
 */
export function getRedisStatus() {
  return {
    enabled: REDIS_ENABLED,
    ready: isRedisReady(),
    url: REDIS_URL.replace(/:\/\/.*@/, '://***@'),
  }
}

// 启动时尝试连接，失败不阻塞
connectRedis().catch(() => {})
