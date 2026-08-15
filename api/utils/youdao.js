import crypto from 'crypto'

const APP_ID = process.env.YOUDAO_APP_ID
const APP_SECRET = process.env.YOUDAO_APP_SECRET
const TTS_API = 'https://openapi.youdao.com/ttsapi'
const TRANSLATE_API = 'https://openapi.youdao.com/api'

/**
 * 生成有道智云 API 签名（signType=v3）
 */
function generateSign(input, salt, curtime) {
  const raw = APP_ID + input + salt + curtime + APP_SECRET
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/**
 * 计算 input 字段值
 */
function computeInput(q) {
  if (q.length <= 20) return q
  return q.slice(0, 10) + q.length + q.slice(-10)
}

/**
 * 语音合成 TTS
 * @param {string} text - 要合成的文本
 * @param {object} options - { voiceName, speed, volume }
 * @returns {Promise<Buffer>} - 音频二进制数据
 */
export async function tts(text, options = {}) {
  if (!APP_ID || !APP_SECRET) {
    throw new Error('YOUDAO_APP_ID 或 YOUDAO_APP_SECRET 未配置')
  }

  const q = text
  const salt = crypto.randomUUID()
  const curtime = Math.floor(Date.now() / 1000).toString()
  const input = computeInput(q)
  const sign = generateSign(input, salt, curtime)

  const params = new URLSearchParams()
  params.append('q', q)
  params.append('appKey', APP_ID)
  params.append('salt', salt)
  params.append('sign', sign)
  params.append('signType', 'v3')
  params.append('curtime', curtime)
  params.append('voiceName', options.voiceName || 'youxiaoqin')
  if (options.speed) params.append('speed', options.speed)
  if (options.volume) params.append('volume', options.volume)
  params.append('format', 'mp3')

  const response = await fetch(TTS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('audio/mp3') || contentType.includes('audio/')) {
    // 成功：返回音频 Buffer
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  // 失败：返回 JSON 错误信息
  const errorText = await response.text()
  let errorData
  try {
    errorData = JSON.parse(errorText)
  } catch {
    throw new Error(`TTS 请求失败: ${errorText}`)
  }
  throw new Error(`TTS 错误 ${errorData.errorCode}: ${getErrorMsg(errorData.errorCode)}`)
}

/**
 * 文本翻译
 * @param {string} text - 待翻译文本
 * @param {string} from - 源语言（如 'en', 'zh-CHS', 'ja'）
 * @param {string} to - 目标语言
 * @returns {Promise<{translation: string, source: string}>}
 */
export async function translate(text, from = 'auto', to = 'zh-CHS') {
  if (!APP_ID || !APP_SECRET) {
    throw new Error('YOUDAO_APP_ID 或 YOUDAO_APP_SECRET 未配置')
  }

  const q = text
  const salt = crypto.randomUUID()
  const curtime = Math.floor(Date.now() / 1000).toString()
  const input = computeInput(q)
  const sign = generateSign(input, salt, curtime)

  const params = new URLSearchParams()
  params.append('q', q)
  params.append('from', from)
  params.append('to', to)
  params.append('appKey', APP_ID)
  params.append('salt', salt)
  params.append('sign', sign)
  params.append('signType', 'v3')
  params.append('curtime', curtime)

  const response = await fetch(TRANSLATE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await response.json()

  if (data.errorCode === '0') {
    return {
      translation: data.translation?.[0] || '',
      source: data.query || q,
      basic: data.basic || null,
      web: data.web || null,
    }
  }

  throw new Error(`翻译错误 ${data.errorCode}: ${getErrorMsg(data.errorCode)}`)
}

function getErrorMsg(code) {
  const map = {
    '101': '缺少必填参数',
    '102': '不支持的语言类型',
    '103': '翻译文本过长',
    '108': '应用ID无效',
    '110': '无相关服务的有效实例，请在控制台绑定服务',
    '111': '开发者账号无效',
    '113': 'q不能为空',
    '202': '签名检验失败',
    '203': '访问IP不在白名单',
    '205': '请求的接口与应用平台类型不一致',
    '206': '时间戳无效',
    '207': '重放请求',
    '302': '翻译查询失败',
    '303': '服务端异常',
    '401': '账户已欠费',
    '411': '访问频率受限',
    '2004': '合成字符过长',
    '2006': '不支持的发音类型',
    '2013': 'voiceName参数错误',
  }
  return map[code] || '未知错误'
}

/**
 * 语言代码映射（有道格式 → 通用格式）
 */
export const LANG_MAP = {
  'zh': 'zh-CHS',
  'zh-cn': 'zh-CHS',
  'zh-tw': 'zh-CHT',
  'en': 'en',
  'ja': 'ja',
  'ko': 'ko',
  'fr': 'fr',
  'de': 'de',
  'es': 'es',
  'ru': 'ru',
  'pt': 'pt',
  'vi': 'vi',
  'th': 'th',
  'ar': 'ar',
}

/**
 * 根据语言代码获取 TTS 默认发音人
 */
export function getVoiceByLang(lang) {
  const map = {
    'zh': 'youxiaoqin',
    'zh-cn': 'youxiaoqin',
    'en': 'youxiaomei',
    'ja': 'youkejiang',
    'ko': 'piaozhiyou',
    'fr': 'faxiaomei',
    'de': 'dexiaomei',
    'es': 'xixiaomei',
    'ru': 'exiaomei',
  }
  return map[lang] || 'youxiaoqin'
}