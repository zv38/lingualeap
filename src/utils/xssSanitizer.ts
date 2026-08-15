export function sanitizeHtml(input: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }
  const reg = /[&<>"'/]/gi
  return input.replace(reg, (match) => map[match] || match)
}

export function sanitizeUrl(url: string): string {
  const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:']
  try {
    const parsed = new URL(url, window.location.origin)
    if (!allowedProtocols.includes(parsed.protocol)) return ''
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const blocklist = ['javascript:', 'data:', 'vbscript:', 'file:']
      for (const bad of blocklist) {
        if (parsed.href.toLowerCase().startsWith(bad)) return ''
      }
    }
    return parsed.href
  } catch {
    return ''
  }
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeHtml(value)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result as T
}

export function stripScriptTags(input: string): string {
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validatePasswordStrength(password: string): {
  score: number
  label: string
  errors: string[]
} {
  const errors: string[] = []
  let score = 0
  if (password.length >= 8) score++
  else errors.push('至少8个字符')
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  if (/[A-Z]/.test(password)) score++
  else errors.push('需要大写字母')
  if (/[a-z]/.test(password)) score++
  else errors.push('需要小写字母')
  if (/[0-9]/.test(password)) score++
  else errors.push('需要数字')
  if (/[^A-Za-z0-9]/.test(password)) score++
  else errors.push('需要特殊字符')
  const label = score <= 2 ? '弱' : score <= 4 ? '中' : '强'
  return { score, label, errors }
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}