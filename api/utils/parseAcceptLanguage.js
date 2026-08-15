import { SUPPORTED_LANGUAGES, LANG_CODE_MAP, DEFAULT_LANGUAGE } from '../config/languages.js'

/**
 * 解析 Accept-Language header
 * 例：'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
 */
export function parseAcceptLanguage(header) {
  if (!header || typeof header !== 'string') return []

  return header
    .split(',')
    .map((part) => {
      const [rawCode, qPart] = part.trim().split(';')
      const code = rawCode.trim()
      const quality = qPart
        ? parseFloat(qPart.replace(/q\s*=\s*/i, '')) || 0
        : 1.0
      return { code, quality }
    })
    .filter((lang) => lang.code && lang.quality > 0)
    .sort((a, b) => b.quality - a.quality)
}

/**
 * 从解析结果中找到支持的第一个语言
 */
export function matchLanguageFromHeader(parsed) {
  for (const { code } of parsed) {
    const normalized = code.toLowerCase()

    // 精确匹配 map
    const exact = LANG_CODE_MAP[normalized]
    if (exact) return exact

    // 主语言匹配
    const primary = normalized.split('-')[0]
    const byPrimary = LANG_CODE_MAP[primary]
    if (byPrimary) return byPrimary

    // 直接匹配支持列表
    const direct = SUPPORTED_LANGUAGES.find((l) => l.toLowerCase() === normalized)
    if (direct) return direct
  }
  return null
}

/**
 * 综合 header + IP 地理结果，返回推荐语言
 */
export function resolveLanguage(headerLang, headerQuality, geoLang) {
  if (!headerLang && !geoLang) return DEFAULT_LANGUAGE
  if (!headerLang) return geoLang
  if (!geoLang) return headerLang
  if (headerLang === geoLang) return headerLang

  // header quality >= 0.9 完全信任 header
  if (headerQuality >= 0.9) return headerLang

  // 中文变体：IP 在台湾但 header 是简中 → 尊重 header
  if (headerLang.startsWith('zh') && geoLang.startsWith('zh')) {
    return headerQuality >= 0.5 ? headerLang : geoLang
  }

  // 默认 header 优先
  return headerLang
}
