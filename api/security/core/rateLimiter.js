import rateLimit from 'express-rate-limit';
import { getRedisClient, isRedisReady } from '../../lib/redisClient.js';

/**
 * 统一限流器工厂
 * - 默认使用内存存储（开发/单机）
 * - 生产环境可通过 RATE_LIMIT_STORE=redis + REDIS_URL 切换到 Redis
 * - Redis 不可用时自动降级为内存，避免启动失败
 */

// 军工级：生产环境强制使用 Redis 共享存储；开发环境若 Redis 就绪也优先使用，否则内存降级
const DEFAULT_STORE = process.env.RATE_LIMIT_STORE || (process.env.NODE_ENV === 'production' ? 'redis' : 'memory');

let redisStoreModule = null;

async function loadRedisStore() {
  if (redisStoreModule) return redisStoreModule;
  try {
    const { default: RedisStore } = await import('rate-limit-redis');
    const client = getRedisClient();
    if (!client || !isRedisReady()) {
      console.warn('[RATE_LIMIT] Redis 尚未就绪，使用内存存储');
      return null;
    }
    redisStoreModule = new RedisStore({ sendCommand: (...args) => client.sendCommand(args) });
    console.log('[RATE_LIMIT] 已切换到 Redis 存储');
    return redisStoreModule;
  } catch (err) {
    console.warn(`[RATE_LIMIT] Redis store 加载失败: ${err.message}，已降级为内存存储`);
    return null;
  }
}

export async function createRateLimiter(options = {}) {
  const store = DEFAULT_STORE === 'redis' ? await loadRedisStore() : null;
  return rateLimit({
    ...options,
    ...(store ? { store, standardHeaders: true, legacyHeaders: false } : { legacyHeaders: false }),
  });
}

/**
 * 同步创建内存版限流器（用于大多数场景，保持 api/index.js 的同步初始化）
 * Redis 切换通过重启服务并设置 RATE_LIMIT_STORE=redis 实现
 */
export function createMemoryRateLimiter(options = {}) {
  return rateLimit({
    ...options,
    legacyHeaders: false,
  });
}
