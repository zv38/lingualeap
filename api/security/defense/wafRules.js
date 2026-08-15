// ===== 轻量级 WAF 规则层 =====
// 在 TCP 连接层之后、业务路由之前检测常见 Web 攻击特征。
// 覆盖 SQL 注入、XSS、LFI/RFI、命令注入、SSRF、路径遍历等 OWASP Top 10 常见模式。
// 注意：Authorization / Cookie 等包含会话令牌的头部不在此层检测，避免误拦截合法 token。

import { getClientIP } from '../core/auditLogger.js'

const WAF_ENABLED = process.env.WAF_RULES_ENABLED !== 'false'

// 军工级：最大允许请求体 1MB，防止巨型 JSON/序列化对象导致内存耗尽或 ReDoS
const MAX_BODY_LENGTH = Number(process.env.WAF_MAX_BODY_LENGTH || 1024 * 1024)

// 安全头部白名单：只检测这些头部中的攻击特征
const INSPECTED_HEADERS = ['user-agent', 'referer', 'origin', 'x-requested-with']

// 深度检测限制：防止递归对象导致 CPU 耗尽
const MAX_INSPECT_DEPTH = 5
const MAX_KEYS_PER_OBJECT = 100
const MAX_STRING_LENGTH_TO_INSPECT = 10000

const RULES = [
  {
    id: 'WAF-001',
    name: 'SQL Injection',
    severity: 'critical',
    patterns: [
      // 移除单字符 #/' 黑名单：会误杀含 # 的强密码；注入防护交给参数化查询/ORM。
      /((\%3D)|(=))[^\n]*((\%27)|(\')|(\%3B)|(;))/i,
      // 检测 SQL 关键字组合，忽略 /* */、--、# 等注释与换行/空白干扰
      new RegExp('\\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE|SCRIPT)\\b(\\s|/\\*|\\*/|--|#|\\r|\\n|\\+|\\%20){0,60}\\b(FROM|INTO|WHERE|TABLE|DATABASE)\\b', 'i'),
      // 检测被注释或编码分隔的危险函数与条件（增强：覆盖 OR/AND 被 /**/ 分隔的情况）
      new RegExp('\\b(SELECT|UNION)\\b(\\s|/\\*|\\*/|--|#|\\r|\\n|\\+|\\%20){0,60}\\b(SELECT|FROM|WHERE|AND|OR)\\b', 'i'),
      // 检测 -- 或 # 行尾注释出现在值中（可能用于截断查询）
      /('|\")\s*(--|#|\/\*)/i,
      // 检测等号/比较符后紧跟 /**/ 注释再跟条件（绕过常见形态：1=1、' or 1=1）
      /(=|<>|!=|<|>|\bLIKE\b|\bIN\b)\s*(\/\*|--|#|\r|\n|\%00|\%2d\%2d){0,5}\s*['"\d]/i,
      // 检测 /**/ 注释分隔的条件表达式（如 '/**/or/**/1=1）
      /['"\d]\s*(\/\*|--|#|\r|\n|\%00){0,5}\s*\b(OR|AND)\b(\s|\/\*|--|#|\r|\n){0,5}['"\d]/i,
      // 检测 SQL 注释栈叠或空注释被用作分隔符
      /(\/\*[^*]*\*\/|\/\*\*\/|\-\-|\#){2,}/i,
    ],
  },
  {
    id: 'WAF-002',
    name: 'Cross-Site Scripting (XSS)',
    severity: 'high',
    patterns: [
      /<script[^>]*>[\s\S]*?<\/script>/i,
      /javascript:/i,
      // 仅匹配常见 HTML 事件处理器，避免误杀 highContrast、background 等合法属性名
      /\bon(?:click|dblclick|mousedown|mouseup|mouseover|mousemove|mouseout|dragstart|drag|dragend|dragover|dragenter|dragleave|drop|load|unload|error|resize|scroll|focus|blur|change|select|submit|reset|keydown|keypress|keyup|keypress|contextmenu|cut|copy|paste|beforeunload|hashchange|popstate|pageshow|pagehide|visibilitychange|online|offline|animationstart|animationend|animationiteration|transitionstart|transitionend|transitionrun|wheel|input|invalid|search|toggle|play|pause|ended|volumechange|timeupdate|loadstart|progress|canplay|canplaythrough|seeking|seeked|durationchange|loadedmetadata|loadeddata|waiting|playing|ratechange|stalled|suspend|abort|emptied|ended|volumechange|timeupdate|cuechange|enter|exit|dragstart|drag|dragend|dragover|dragenter|dragleave|drop|touchstart|touchmove|touchend|touchcancel|pointerdown|pointerup|pointermove|pointerover|pointerout|pointerenter|pointerleave|pointercancel|gotpointercapture|lostpointercapture|beforeinput|beforecopy|beforecut|beforepaste|copy|cut|paste|selectstart|selectionchange|fullscreenchange|fullscreenerror|resize|scroll)\s*=/i,
      /<\s*iframe|<\s*object|<\s*embed/i,
    ],
  },
  {
    id: 'WAF-003',
    name: 'Local/Remote File Inclusion',
    severity: 'critical',
    patterns: [
      /\.\.[\\/]/,
      /\b(file|php|expect|data):\/\//i,
      /\/(etc|proc|sys|var|windows)\//i,
      /(boot\.ini|win\.ini|system32|passwd|shadow)/i,
    ],
  },
  {
    id: 'WAF-004',
    name: 'Command Injection',
    severity: 'critical',
    patterns: [
      /[;&|`]\s*\b(sh|bash|cmd|powershell|python|perl|ruby|nc|wget|curl)\b/i,
      /\$\(.*\)|`.*`/,
      /\b(eval|system|exec|passthru|shell_exec)\s*\(/i,
    ],
  },
  {
    id: 'WAF-005',
    name: 'Server-Side Request Forgery',
    severity: 'high',
    patterns: [
      // 仅检测明确的危险协议；内网/元数据主机通过语义级归一化单独检查，不依赖正则字面量
      /\b(file|gopher|dict|ldap|tftp|ftp|sftp|ssh|svn|git|jar|php|expect|data):\/\//i,
    ],
  },
  {
    id: 'WAF-006',
    name: 'XML/XXE',
    severity: 'high',
    patterns: [
      /<!ENTITY\s+.*SYSTEM/i,
      /<!DOCTYPE\s+.*\[/i,
    ],
  },
  {
    id: 'WAF-007',
    name: 'Security Scanner User-Agent',
    severity: 'medium',
    patterns: [
      /\b(sqlmap|nikto|nmap|masscan|gobuster|dirb|wfuzz|burp|metasploit|zgrab|censys|shodan)\b/i,
    ],
  },
  {
    id: 'WAF-008',
    name: 'Path Traversal / Null Byte',
    severity: 'critical',
    patterns: [
      /\.\.[\\/]/,
      /%2e%2e[\\/]/i,
      /%252e%252e[\\/]/i,
      /\x00/,
      /~\/\.\./,
    ],
  },
  {
    id: 'WAF-009',
    name: 'Prototype Pollution / Deserialization',
    severity: 'critical',
    patterns: [
      /["']__proto__["']|\.constructor\.|\.prototype\./i,
      /\[\s*["']constructor["']\s*\]/i,
      /rO0ABXNy|Y3发育|Y2FsYwAAAA/i, // Java serialized / base64 gadget hints
      /\{\["__proto__"\]|\{"constructor":\s*\{/i,
    ],
  },
  {
    id: 'WAF-010',
    name: 'ReDoS / Catastrophic Backtracking',
    severity: 'high',
    patterns: [
      /([^a-zA-Z0-9])\1{200,}/,
      /(a+)+\$/,
      /(.*a){20,}/i,
    ],
  },
  {
    id: 'WAF-011',
    name: 'JWT / Token Fuzzing',
    severity: 'high',
    patterns: [
      /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.?/,
      /["']none["']\s*:\s*["']none["']/i,
    ],
  },
  {
    id: 'WAF-012',
    name: 'Advanced Scanner / Crawler',
    severity: 'medium',
    patterns: [
      /\b(ahrefs|semrush|moz|mj12bot|dotbot|rogerbot|screaming frog|openvas|nessus|qualys|acunetix|appspider|netsparker|rapid7)\b/i,
      /\b(commons-httpclient|python-urllib|java|libwww-perl|httpunit|pycurl)\b/i,
    ],
  },
]

// ===== SSRF 语义级检测：先归一化 IP 字面量，再判断是否为内网/元数据/本地回环 =====
const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.aws',
  'instance-data',
  '169.254.169.254',
])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

function parseDottedDecimal(parts) {
  if (parts.length !== 4) return null
  const nums = []
  for (const p of parts) {
    // 支持十进制、八进制（0 开头）、十六进制（0x 开头）
    let n
    if (/^0[xX][0-9a-fA-F]+$/.test(p)) n = parseInt(p, 16)
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8)
    else if (/^[0-9]+$/.test(p)) n = parseInt(p, 10)
    else return null
    if (Number.isNaN(n) || n < 0 || n > 255) return null
    nums.push(n)
  }
  return nums.join('.')
}

function normalizeIpLiteral(host) {
  if (!host || typeof host !== 'string') return null
  const lower = host.toLowerCase().trim()
  if (LOOPBACK_HOSTS.has(lower) || METADATA_HOSTS.has(lower)) return lower

  // 纯十进制整数 IP，如 2130706433
  if (/^[0-9]+$/.test(lower)) {
    const num = parseInt(lower, 10)
    if (!Number.isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join('.')
    }
  }

  // 纯十六进制 IP，如 0x7f000001
  if (/^0[xX][0-9a-fA-F]{1,8}$/.test(lower)) {
    const num = parseInt(lower, 16)
    return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join('.')
  }

  // 点分十进制/八进制/十六进制混合，如 0177.0.0.1 或 0x7f.0.0.1
  if (lower.includes('.')) {
    const canonical = parseDottedDecimal(lower.split('.'))
    if (canonical) return canonical
  }

  return lower
}

function isPrivateOrMetadataHost(host) {
  const normalized = normalizeIpLiteral(host)
  if (!normalized) return false
  if (LOOPBACK_HOSTS.has(normalized) || METADATA_HOSTS.has(normalized)) return true
  if (normalized === '169.254.169.254') return true
  // 私有网段
  const m = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b, c] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])]
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  return false
}

function detectSsrfInValue(value) {
  if (value === null || value === undefined) return null
  const str = String(value)
  // 1. 危险协议
  if (/\b(file|gopher|dict|ldap|tftp|ftp|sftp|ssh|svn|git|jar|php|expect|data):\/\//i.test(str)) {
    return { id: 'WAF-005', name: 'Server-Side Request Forgery', severity: 'high', matched: str.slice(0, 200) }
  }
  // 2. 找出所有 http/https URL，语义级检查 host
  const urlMatches = str.match(/https?:\/\/[^\s"'`<>()[\]{}]+/gi) || []
  for (const raw of urlMatches) {
    try {
      const url = new URL(raw)
      if (isPrivateOrMetadataHost(url.hostname)) {
        return { id: 'WAF-005', name: 'Server-Side Request Forgery', severity: 'high', matched: raw.slice(0, 200) }
      }
    } catch {
      // 非合法 URL，忽略
    }
  }
  return null
}

function collectSsrfFindings(obj, basePath, findings, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > MAX_INSPECT_DEPTH) return
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue
    const currentPath = basePath ? `${basePath}.${key}` : key
    if (typeof value === 'object') {
      collectSsrfFindings(value, currentPath, findings, depth + 1)
    } else {
      const finding = detectSsrfInValue(value)
      if (finding) findings.push({ ...finding, path: currentPath })
    }
  }
}

function inspectValue(value, path, findings) {
  if (value === null || value === undefined) return null
  let str = String(value)
  if (str.length > MAX_STRING_LENGTH_TO_INSPECT) {
    findings.push({ id: 'WAF-015', name: 'Payload String Too Long', severity: 'medium', path, matched: `${str.length} chars` })
    str = str.slice(0, MAX_STRING_LENGTH_TO_INSPECT)
  }
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(str)) {
        const finding = {
          id: rule.id,
          name: rule.name,
          severity: rule.severity,
          path,
          matched: str.slice(0, 200),
        }
        if (findings) findings.push(finding)
        return finding
      }
    }
  }
  return null
}

function inspectObject(obj, path, findings, depth = 0) {
  if (!obj || typeof obj !== 'object') return
  if (depth > MAX_INSPECT_DEPTH) {
    findings.push({ id: 'WAF-013', name: 'Payload Depth Exceeded', severity: 'high', path, matched: 'object nested too deep' })
    return
  }
  const keys = Object.keys(obj)
  if (keys.length > MAX_KEYS_PER_OBJECT) {
    findings.push({ id: 'WAF-014', name: 'Too Many Object Keys', severity: 'high', path, matched: `${keys.length} keys` })
    return
  }
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key
    if (value === null || value === undefined) continue
    if (typeof value === 'object') {
      inspectObject(value, currentPath, findings, depth + 1)
    } else {
      inspectValue(value, currentPath, findings)
    }
  }
}

export function wafRulesMiddleware(req, res, next) {
  if (!WAF_ENABLED) return next()

  // 军工级：请求体大小硬限制，防止巨型 payload 导致 DoS / 反序列化攻击
  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_LENGTH) {
    return res.status(413).json({
      success: false,
      message: '请求体过大，拒绝处理',
      code: 'PAYLOAD_TOO_LARGE',
    })
  }

  // bug-report 端点豁免：description 包含堆栈跟踪等合法内容，可能触发 WAF 模式匹配
  // 内容已通过 sanitizeInput 转义后存储，安全可控
  if (req.path.startsWith('/api/bug-report')) return next()

  // 使用统一的 getClientIP，不再直接信任 X-Forwarded-For，防止伪造本地 IP 绕过 WAF
  const clientIp = getClientIP(req)

  const findings = []

  // 检查 URL 路径、查询参数、body
  inspectValue(req.path, 'path', findings)
  inspectValue(req.originalUrl, 'url', findings)
  inspectObject(req.query, 'query', findings)
  inspectObject(req.params, 'params', findings)
  if (req.body && typeof req.body === 'object') {
    inspectObject(req.body, 'body', findings)
  }

  // SSRF 语义级检测（body/query/url/path）：归一化 IP 字面量后判断，不依赖正则字面量
  const ssrfFinding = detectSsrfInValue(req.originalUrl) || detectSsrfInValue(req.path)
  if (ssrfFinding) findings.push({ ...ssrfFinding, path: 'url' })
  collectSsrfFindings(req.query, 'query', findings)
  collectSsrfFindings(req.params, 'params', findings)
  if (req.body && typeof req.body === 'object') {
    collectSsrfFindings(req.body, 'body', findings)
  }

  // 只检测安全头部，避免误拦截 Authorization / Cookie 中的 token
  // Origin/Referer 只做危险协议检测，不做 SSRF 内网 IP 检测（同源校验由 CSRF 层负责）
  const safeHeaders = {}
  for (const h of INSPECTED_HEADERS) {
    if (req.headers[h] !== undefined) safeHeaders[h] = req.headers[h]
  }
  inspectObject(safeHeaders, 'headers', findings)

  if (findings.length === 0) return next()

  const critical = findings.some(f => f.severity === 'critical')
  console.warn(`[WAF] 拦截 ${req.ip || 'unknown'} ${req.method} ${req.path}: ${findings.map(f => f.id).join(', ')}`)

  res.status(critical ? 403 : 400).json({
    success: false,
    message: critical ? '请求被安全策略拒绝' : '请求包含非法字符',
    waf: findings.map(f => ({ id: f.id, name: f.name })),
  })
}

export function getRules() {
  return RULES.map(r => ({ id: r.id, name: r.name, severity: r.severity }))
}
