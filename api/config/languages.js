// 平台支持的语言列表
export const SUPPORTED_LANGUAGES = [
  'zh-CN',
  'zh-TW',
  'en',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'ar',
  'ru',
]

export const DEFAULT_LANGUAGE = 'en'

// IP 地理位置 → 推荐语言
export const COUNTRY_TO_LANGUAGE = {
  CN: 'zh-CN',
  TW: 'zh-TW',
  HK: 'zh-TW',
  MO: 'zh-TW',
  SG: 'zh-CN',
  JP: 'ja',
  KR: 'ko',
  FR: 'fr',
  BE: 'fr',
  CH: 'fr',
  DE: 'de',
  AT: 'de',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  SA: 'ar',
  AE: 'ar',
  EG: 'ar',
  RU: 'ru',
  US: 'en',
  GB: 'en',
  CA: 'en',
  AU: 'en',
}

// Accept-Language 代码 → 标准 tag
export const LANG_CODE_MAP = {
  'zh':      'zh-CN',
  'zh-cn':   'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-sg':   'zh-CN',
  'zh-tw':   'zh-TW',
  'zh-hk':   'zh-TW',
  'zh-hant': 'zh-TW',
  'en':      'en',
  'en-us':   'en',
  'en-gb':   'en',
  'ja':      'ja',
  'ko':      'ko',
  'fr':      'fr',
  'de':      'de',
  'es':      'es',
  'ar':      'ar',
  'ru':      'ru',
}
