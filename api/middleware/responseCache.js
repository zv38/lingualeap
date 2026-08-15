// 后端响应缓存中间件
// 用于热点数据接口，减少数据库/文件 IO 和重复计算

import { getClientIP } from '../security/core/auditLogger.js';

const cache = new Map();

function makeKey(req, prefix = '') {
  const userId = req.tokenPayload?.userId || 'anonymous';
  const ip = getClientIP(req);
  return `${prefix}:${userId}:${ip}:${req.originalUrl || req.url}`;
}

export function createCacheMiddleware(options = {}) {
  const {
    ttlMs = 30 * 1000,
    keyPrefix = 'api',
    varyByUser = true,
    condition = () => true,
  } = options;

  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!condition(req)) return next();

    const key = makeKey(req, keyPrefix);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.set('X-Cache', 'HIT');
      return res.json(hit.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && data?.success) {
        cache.set(key, { data, expiresAt: Date.now() + ttlMs });
      }
      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

export function invalidateCacheByPrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function getCacheStats() {
  return { entries: cache.size };
}
