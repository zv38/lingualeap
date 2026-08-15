import geoip from 'geoip-lite'
import { COUNTRY_TO_LANGUAGE } from '../config/languages.js'

/**
 * 从请求中提取客户端 IP
 * 安全规范：此 IP 不用于安全决策，仅用于地域/语言推荐；即便如此也不信任 X-Forwarded-For
 */
export function extractClientIP(req) {
  // 优先使用 Express 设置的 req.ip（已考虑 trust proxy 配置），否则使用直接连接地址
  if (req.ip && isValidIP(req.ip)) return req.ip
  return req.socket?.remoteAddress ?? '127.0.0.1'
}

/**
 * 通过 IP 查询推荐语言
 */
export function getLanguageFromIP(ip) {
  try {
    if (isPrivateIP(ip)) return null
    const geo = geoip.lookup(ip)
    if (!geo?.country) return null
    return COUNTRY_TO_LANGUAGE[geo.country] ?? null
  } catch {
    return null
  }
}

function isValidIP(ip) {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[0-9a-fA-F:]+$/
  return ipv4.test(ip) || ipv6.test(ip)
}

function isPrivateIP(ip) {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}
