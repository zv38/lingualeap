import { DEFAULT_LANGUAGE } from '../config/languages.js'
import { parseAcceptLanguage, matchLanguageFromHeader, resolveLanguage } from '../utils/parseAcceptLanguage.js'
import { extractClientIP, getLanguageFromIP } from '../utils/geoLookup.js'

/**
 * 语言检测中间件
 * 执行流程：用户偏好 → Redis 缓存 → Accept-Language header → IP 地理位置 → 加权合并
 */
export function createLangDetectMiddleware(options) {
  const { redis, ttl = 3600, getUserPreferredLang } = options

  return async function langDetectMiddleware(req, res, next) {
    try {
      // 0. 用户已有语言偏好（登录态）
      if (getUserPreferredLang) {
        const savedLang = getUserPreferredLang(req)
        if (savedLang) {
          req.detectedLang = savedLang
          req.detectedLangMeta = {
            language: savedLang,
            source: 'cache',
            headerLang: null,
            geoLang: null,
            ip: '',
            fromCache: true,
          }
          return next()
        }
      }

      const ip = extractClientIP(req)
      const cacheKey = `lang:detect:${ip}`

      // 1. Redis 缓存
      if (redis) {
        const cached = await redis.get(cacheKey).catch(() => null)
        if (cached) {
          try {
            const meta = JSON.parse(cached)
            req.detectedLang = meta.language
            req.detectedLangMeta = { ...meta, fromCache: true }
            res.setHeader('X-Detected-Language', meta.language)
            return next()
          } catch {}
        }
      }

      // 2. 解析 Accept-Language header
      const acceptHeader = req.headers['accept-language'] || ''
      const parsedLangs = parseAcceptLanguage(acceptHeader)
      const headerLang = matchLanguageFromHeader(parsedLangs)
      const topQuality = parsedLangs[0]?.quality ?? 0

      // 3. IP 地理位置
      const geoLang = getLanguageFromIP(ip)

      // 4. 加权合并
      const resolved = resolveLanguage(headerLang, topQuality, geoLang)

      // 5. 确定 source 标签
      let source = 'default'
      if (headerLang && geoLang && headerLang !== geoLang) source = 'combined'
      else if (headerLang) source = 'header'
      else if (geoLang) source = 'geo'

      const meta = {
        language: resolved,
        source,
        headerLang,
        geoLang,
        ip,
        fromCache: false,
      }

      // 6. 异步写入 Redis 缓存
      if (redis) {
        redis.setEx(cacheKey, ttl, JSON.stringify(meta)).catch(() => {})
      }

      // 7. 挂载到 req
      req.detectedLang = resolved
      req.detectedLangMeta = meta
      res.setHeader('X-Detected-Language', resolved)
      next()
    } catch (err) {
      console.error('[lang-detect] Error:', err)
      req.detectedLang = DEFAULT_LANGUAGE
      req.detectedLangMeta = {
        language: DEFAULT_LANGUAGE,
        source: 'default',
        headerLang: null,
        geoLang: null,
        ip: '',
        fromCache: false,
      }
      next()
    }
  }
}
