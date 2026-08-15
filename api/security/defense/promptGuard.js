// ===== 多层提示注入检测 (Prompt Guard) =====

const INJECTION_PATTERNS = [
  // 直接注入
  { pattern: /ignor(e|ing)\s+(all\s+)?(previous|prior|above|instructions?)/i, risk: 'critical', type: 'DIRECT_INJECTION' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above|instructions?)/i, risk: 'critical', type: 'DIRECT_INJECTION' },
  { pattern: /new\s+instructions?[:：]/i, risk: 'high', type: 'INSTRUCTION_OVERRIDE' },
  { pattern: /system\s+(prompt|instruction|message)[s：]?[:：]/i, risk: 'high', type: 'SYSTEM_PROMPT_EXTRACTION' },

  // 角色扮演注入
  { pattern: /pretend\s+(you\s+are|to\s+be)/i, risk: 'high', type: 'ROLE_PLAY' },
  { pattern: /act\s+as\s+(if\s+)?/i, risk: 'high', type: 'ROLE_PLAY' },
  { pattern: /from\s+now\s+on\s+you\s+are/i, risk: 'high', type: 'ROLE_PLAY' },
  { pattern: /you\s+are\s+now\s+/i, risk: 'high', type: 'ROLE_PLAY' },

  // 越狱提示
  { pattern: /\bDAN\b|do\s+anything\s+now/i, risk: 'critical', type: 'JAILBREAK' },
  { pattern: /developer\s+mode/i, risk: 'high', type: 'JAILBREAK' },
  { pattern: /supervisor\s+mode/i, risk: 'high', type: 'JAILBREAK' },
  { pattern: /out\s+of\s+(the\s+)?box/i, risk: 'medium', type: 'JAILBREAK' },
  { pattern: /ignore\s+(all\s+)?(ethics|safety|rules|guidelines|policy|alignment)/i, risk: 'critical', type: 'JAILBREAK' },
  { pattern: /unfiltered|no\s+(filter|restrictions?|limits?|boundaries)/i, risk: 'high', type: 'JAILBREAK' },

  // 敏感信息提取
  { pattern: /API[_\s]?KEY|api[_\s]?key/i, risk: 'critical', type: 'INFO_EXFIL' },
  { pattern: /(database|DB)[_\s]?(url|host|name|password)/i, risk: 'critical', type: 'INFO_EXFIL' },
  { pattern: /admin\s+(password|credential)/i, risk: 'critical', type: 'INFO_EXFIL' },
  { pattern: /system\s+(prompt|instruction)/i, risk: 'high', type: 'INFO_EXFIL' },
  { pattern: /tell\s+me\s+(your|the)\s+(prompt|instruction|guidelines?)/i, risk: 'high', type: 'INFO_EXFIL' },
  { pattern: /reveal\s+(your|the\s+)?(prompt|instructions?)/i, risk: 'high', type: 'INFO_EXFIL' },
  { pattern: /output\s+(your|the)\s+(prompt|instructions?)/i, risk: 'high', type: 'INFO_EXFIL' },

  // 社交工程
  { pattern: /send\s+(me\s+)?(an?\s+)?email/i, risk: 'high', type: 'SOCIAL_ENG' },
  { pattern: /forward\s+(this|the)\s+(to|for)/i, risk: 'high', type: 'SOCIAL_ENG' },
  { pattern: /execute|run\s+(shell|command|script)/i, risk: 'critical', type: 'CMD_EXECUTION' },
  { pattern: /bypass\s+(the\s+)?(limit|security|filter|restriction)/i, risk: 'critical', type: 'BYPASS' },

  // 语言学习平台特定攻击
  { pattern: /(grade|score|evaluate|assess)\s+(me|my|this)\s+(answer|response|submission|essay)/i, risk: 'high', type: 'ASSESSMENT_MANIP' },
  { pattern: /mark\s+(me|this)\s+as\s+(correct|passed|completed|100)/i, risk: 'high', type: 'ASSESSMENT_MANIP' },
  { pattern: /tell\s+me\s+(the\s+)?(answer|solution|translation)/i, risk: 'medium', type: 'CHEATING' },
  { pattern: /give\s+me\s+(the\s+)?(answer|solution|translation|cheat)/i, risk: 'medium', type: 'CHEATING' },
  { pattern: /complete\s+(my|the)\s+(lesson|course|exercise|quiz)\s+(for\s+)?me/i, risk: 'high', type: 'AUTO_COMPLETE' },
  { pattern: /(generate|create)\s+(harmful|dangerous|malicious|toxic)\s+(content|code|script)/i, risk: 'critical', type: 'HARMFUL_CONTENT' },
  // 对抗性输入 + 混淆绕过
  { pattern: /[pP][rR][0oO][mM][pP][tT]\s*[iI1][nN][jJ][eE][cC][tT]/i, risk: 'high', type: 'ADVERSARIAL_META' },
]

const OBFUSCATION_PATTERNS = [
  // 零宽字符
  { detect: /[\u200B-\u200D\uFEFF\u2060\u2061\u2062\u2063\u2064]/, type: 'ZERO_WIDTH_CHAR' },
  // 同形异义字（希腊/西里尔字母）
  { detect: /[Α-ΡΣ-Ωα-ρσ-ωА-Яа-яЁё]/, type: 'HOMOGLYPH' },
  // Base64 长字符串
  { detect: /[A-Za-z0-9+/]{40,}={0,2}/, type: 'BASE64_LONG' },
  // HTML 实体编码
  { detect: /&#x?[0-9A-Fa-f]+;/, type: 'HTML_ENTITY' },
  // Unicode 数学字母
  { detect: /[𝑨-𝒵𝒶-𝓏𝓐-𝔃𝔄-𝔷]/u, type: 'UNICODE_MATH' },
  // 十六进制编码
  { detect: /\\x[0-9a-fA-F]{2}/, type: 'HEX_ENCODED' },
  // URL 编码
  { detect: /%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}/, type: 'URL_ENCODED' },
]

export class PromptGuard {
  static analyze(messages) {
    const results = []
    const userMessages = messages.filter(m => m.role === 'user')

    for (const msg of userMessages) {
      const content = msg.content
      const findings = {}

      for (const { pattern, risk, type } of INJECTION_PATTERNS) {
        if (pattern.test(content)) {
          if (!findings[type]) findings[type] = { risk, count: 0 }
          findings[type].count++
        }
      }

      const obfuscations = []
      for (const { detect, type } of OBFUSCATION_PATTERNS) {
        if (detect.test(content)) obfuscations.push(type)
      }

      // Base64内容解码检查
      const b64Matches = content.match(/[A-Za-z0-9+/]{40,}={0,2}/g)
      if (b64Matches) {
        for (const b64 of b64Matches) {
          try {
            const decoded = Buffer.from(b64, 'base64').toString('utf-8')
            if (/ignore|pretend|role|system|prompt|system|password|secret/i.test(decoded)) {
              obfuscations.push('BASE64_ENCODED_PAYLOAD')
            }
          } catch {}
        }
      }

      if (Object.keys(findings).length > 0 || obfuscations.length > 0) {
        const maxRisk = Object.values(findings).reduce((max, f) => f.risk === 'critical' ? 'critical' : max, 'medium')
        const totalScore = Object.values(findings).reduce((s, f) => {
          return s + (f.risk === 'critical' ? 30 : f.risk === 'high' ? 20 : 10)
        }, 0) + obfuscations.length * 15

        results.push({
          messageIndex: userMessages.indexOf(msg),
          risk: maxRisk,
          score: Math.min(totalScore, 100),
          matchedPatterns: Object.keys(findings),
          obfuscations,
          action: totalScore >= 60 ? 'REJECT' : totalScore >= 30 ? 'SANITIZE' : 'WARN',
        })
      }
    }

    return results
  }

  static sanitize(content) {
    let sanitized = content
    for (const { pattern } of INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }
    // 清理零宽字符
    sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF\u2060-\u2064]/g, '')
    return sanitized
  }

  static analyzeResponse(response) {
    const leaks = []

    const apiKeyPattern = /sk-[A-Za-z0-9]{32,}/g
    if (apiKeyPattern.test(response)) leaks.push('API_KEY')

    const tokenPattern = /[A-Za-z0-9-_]{40,}\.[A-Za-z0-9-_]{40,}\.[A-Za-z0-9-_]{40,}/g
    if (tokenPattern.test(response)) leaks.push('JWT_TOKEN')

    const urlPattern = /https?:\/\/[^\s]*(?:internal|private|secret|admin|api-key)[^\s]*/gi
    if (urlPattern.test(response)) leaks.push('SENSITIVE_URL')

    const credentialPattern = /(password|secret|credential|auth)[=:]["']?[A-Za-z0-9!@#$%^&*()+]{8,}/gi
    if (credentialPattern.test(response)) leaks.push('CREDENTIAL_LEAK')

    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    const emails = response.match(emailPattern)
    if (emails && emails && emails.length > 5) leaks.push('MASS_EMAIL_LEAK')

    const privateIP = /(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})/
    if (privateIP.test(response)) leaks.push('INTERNAL_IP_LEAK')

    return leaks
  }

  static getRuleCount() {
    return INJECTION_PATTERNS.length + OBFUSCATION_PATTERNS.length
  }

  // 增强：对消息列表进行综合风险评分
  static scoreMessages(messages) {
    const results = PromptGuard.analyze(messages)
    if (results.length === 0) return { score: 0, maxRisk: 'none', actions: [] }
    const maxScore = Math.max(...results.map(r => r.score))
    const maxRisk = results.reduce((max, r) => {
      if (r.risk === 'critical') return 'critical'
      if (r.risk === 'high' && max !== 'critical') return 'high'
      if (r.risk === 'medium' && max !== 'critical' && max !== 'high') return 'medium'
      return max
    }, 'low')
    const actions = [...new Set(results.map(r => r.action))]
    return { score: maxScore, maxRisk, actions, results }
  }

  static detectAdversarial(text) {
    const findings = []

    const normalized = text.toLowerCase()

    const homoglyphMap = {
      'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y',
      'х': 'x', 'і': 'i', 'ј': 'j', 'ο': 'o', 'ρ': 'p',
    }
    let homoglyphCount = 0
    for (const char of normalized) {
      if (homoglyphMap[char]) homoglyphCount++
    }
    if (homoglyphCount >= 5) findings.push('HOMOGLYPH_SPAM')

    const charFrequency = {}
    for (const char of text) {
      charFrequency[char] = (charFrequency[char] || 0) + 1
    }
    const uniqueRatio = Object.keys(charFrequency).length / Math.max(text.length, 1)
    if (uniqueRatio < 0.2 && text.length > 50) findings.push('LOW_ENTROPY_TEXT')

    if (/[A-Z\s]{50,}/.test(text)) findings.push('UPPERCASE_FLOOD')

    if (/(\S+\s+){100,}/.test(text)) findings.push('REPEATED_PATTERN')

    const avgWordLength = text.split(/\s+/).reduce((s, w) => s + w.length, 0) / Math.max(text.split(/\s+/).length, 1)
    if (avgWordLength > 20 || (avgWordLength < 2 && text.length > 30)) findings.push('ABNORMAL_WORD_LENGTH')

    return findings
  }
}