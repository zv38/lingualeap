const APP_NAME = 'LinguaLeap'
const APP_VERSION = '1.0.0'

const BIG_ASCII = `
%c
 ███████╗██╗     ██╗███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ██╗     ███████╗ █████╗ ██████╗
 ██╔════╝██║     ██║████╗  ██║██╔════╝ ██║   ██║██╔══██╗██║     ██╔════╝██╔══██╗██╔══██╗
 █████╗  ██║     ██║██╔██╗ ██║██║  ███╗██║   ██║███████║██║     █████╗  ███████║██████╔╝
 ██╔══╝  ██║     ██║██║╚██╗██║██║   ██║██║   ██║██╔══██║██║     ██╔══╝  ██╔══██║██╔═══╝
 ███████╗███████╗██║██║ ╚████║╚██████╔╝╚██████╔╝██║  ██║███████╗███████╗██║  ██║██║
 ╚══════╝╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝
`

function ansiGradient(count: number, baseColor: string, shift: number): string {
  const r = parseInt(baseColor.slice(1, 3), 16)
  const g = parseInt(baseColor.slice(3, 5), 16)
  const b = parseInt(baseColor.slice(5, 7), 16)
  const toHex = (n: number, f: number) => Math.min(255, Math.round(n * f)).toString(16).padStart(2, '0')
  return Array.from({ length: count }, (_, i) => {
    const f = 1 + (i / count) * shift
    return `color: #${toHex(r, f)}${toHex(g, f)}${toHex(b, f)}; font-weight: ${i % 3 === 0 ? 700 : 500};`
  }).join('')
}

export function initConsoleArt() {
  typewriteInit()
}

function typewriteInit() {
  const gradient = ansiGradient(6, '#000000', 0.6)
  const lines = [
    { t: '', s: '' },
    { t: BIG_ASCII, s: gradient },
    { t: '', s: '' },
    { t: `  ${APP_NAME} v${APP_VERSION} — 智能语言学习平台`, s: 'font-size: 16px; font-weight: 700; color: #000000;' },
    { t: '', s: '' },
    { t: '  \u2550'.repeat(50), s: 'color: #a1a1aa;' },
    { t: '', s: '' },
    { t: '  \u269B\uFE0F Frontend    React 19 + TypeScript + Vite 5 + Framer Motion', s: 'font-size: 12px; color: #71717a;' },
    { t: '  \u2699\uFE0F Backend     Express + JWT + 2FA/TOTP + SQLite', s: 'font-size: 12px; color: #71717a;' },
    { t: '  \u{1F6E1}\uFE0F Security    WAF + AES-256-GCM + CSP + Rate Limit', s: 'font-size: 12px; color: #71717a;' },
    { t: '', s: '' },
    { t: '  \u2550'.repeat(50), s: 'color: #a1a1aa;' },
    { t: '', s: '' },
    { t: '  \u{1F50D} 输入 help() 查看命令  |  输入 security() 检查安全状态', s: 'font-size: 13px; color: #52525b; font-weight: 500;' },
    { t: '', s: '' },
    { t: '  \u{1F680} 安全第一，学习第二', s: 'font-size: 14px; color: #71717a; font-style: italic;' },
    { t: '', s: '' },
  ]

  console.clear()
  let i = 0
  const timer = setInterval(() => {
    if (i >= lines.length) { clearInterval(timer); return }
    const { t, s } = lines[i++]
    console.log(s ? `${t}` : t, s || '')
  }, 50)
}

export function help() {
  console.log('%c\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557', 'color: #000000; font-weight: 700;')
  console.log('%c\u2551           \u{1F6E1}\uFE0F  安全控制台              \u2551', 'color: #52525b; font-weight: 700; font-size: 14px;')
  console.log('%c\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D', 'color: #000000; font-weight: 700;')
  console.log('')
  const cmds = [
    { c: 'security()', d: '\u{1F6E1}\uFE0F  完整安全审计 — 检查 HTTPS/CSP/隐私等' },
    { c: 'health()', d: '\u{1F3E5}  API 健康检查 — 检测后端服务状态' },
    { c: 'whoami()', d: '\u{1F464}  当前登录用户信息' },
    { c: 'help()', d: '\u{1F4D6}  显示此帮助' },
    { c: 'version', d: '\u{1F4CB}  显示版本号' },
  ]
  cmds.forEach(({ c, d }) => {
    console.log(
      `%c  ${c.padEnd(18)}%c${d}`,
      'font-size: 13px; color: #52525b; font-weight: 600; font-family: "Courier New", monospace;',
      'font-size: 12px; color: #71717a;'
    )
  })
  console.log('')
  console.log('%c  \u{1F4A1} Tip: security() 会做真实的安全检测，不是花架子', 'font-size: 11px; color: #52525b; font-style: italic;')
}

export function whoami() {
  try {
    const stored = localStorage.getItem('auth-storage')
    if (stored) {
      const parsed = JSON.parse(stored)
      const user = parsed?.state?.user
      if (user) {
        console.log('%c\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557', 'color: #52525b;')
        console.log('%c\u2551  \u{1F464}  用户信息                              \u2551', 'color: #52525b;')
        console.log('%c\u2551\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2551', 'color: #52525b;')
        console.log(`%c\u2551  ID:     ${(user.id || user._id || 'N/A').toString().padEnd(29)}\u2551`, 'color: #71717a;')
        console.log(`%c\u2551  名称:   ${(user.username || 'N/A').padEnd(29)}\u2551`, 'color: #000000; font-weight: 600;')
        console.log(`%c\u2551  邮箱:   ${(user.email || 'N/A').padEnd(29)}\u2551`, 'color: #71717a;')
        if (user.role) console.log(`%c\u2551  角色:   ${user.role.padEnd(29)}\u2551`, 'color: #71717a;')
        console.log('%c\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D', 'color: #52525b;')
        return
      }
    }
    console.log('%c\u{1F464} 未登录用户', 'font-size: 13px; color: #71717a;')
  } catch {
    console.log('%c\u26A0\uFE0F 无法读取用户信息', 'font-size: 12px; color: #27272a;')
  }
}

export async function health() {
  console.log('%c\u{1F50D} 正在检测 API 服务状态...', 'font-size: 12px; color: #71717a;')
  console.log('')
  try {
    const start = performance.now()
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })
    const elapsed = ((performance.now() - start) / 1000).toFixed(2)
    const data = await res.json()
    const ok = res.status === 200
    const c = ok ? '#52525b' : '#52525b'

    console.log(`%c\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`, `color: ${c};`)
    console.log(`%c\u2551  ${ok ? '\u2705' : '\u26A0\uFE0F'}  API 健康检查                      \u2551`, `color: ${c};`)
    console.log(`%c\u2551\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2551`, `color: ${c};`)
    console.log(`%c\u2551  状态码: ${res.status}${' '.repeat(27)}\u2551`, `color: ${c}; font-weight: 600;`)
    console.log(`%c\u2551  响应时间: ${elapsed}s${' '.repeat(22)}\u2551`, 'color: #71717a;')
    if (data.timestamp) {
      console.log(`%c\u2551  时间戳: ${String(data.timestamp).padEnd(27)}\u2551`, 'color: #71717a;')
    }
    console.log(`%c\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`, `color: ${c};`)
  } catch (e: any) {
    console.log('%c\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557', '#27272a;')
    console.log('%c\u2551  \u274C  API 连接失败                     \u2551', '#27272a; font-weight: 600;')
    console.log('%c\u2551\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2551', '#27272a;')
    console.log(`%c\u2551  错误: ${(e.message || '未知错误').padEnd(31)}\u2551`, '#27272a;')
    console.log('%c\u2551  请确保后端服务已启动                  \u2551', '#71717a;')
    console.log('%c\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D', '#27272a;')
  }
}

function checkSecurityHeaders(): Record<string, { status: 'pass' | 'fail' | 'warn'; detail: string }> {
  const results: Record<string, { status: 'pass' | 'fail' | 'warn'; detail: string }> = {}

  results['HTTPS'] = location.protocol === 'https:'
    ? { status: 'pass', detail: '连接已加密 (HTTPS)' }
    : { status: 'warn', detail: '使用 HTTP 而非 HTTPS — 数据传输未加密' }

  results['在线状态'] = navigator.onLine
    ? { status: 'pass', detail: '网络连接正常' }
    : { status: 'fail', detail: '当前处于离线状态' }

  results['Cookie 状态'] = navigator.cookieEnabled
    ? { status: 'pass', detail: 'Cookie 已启用' }
    : { status: 'warn', detail: 'Cookie 被禁用 — 登录状态可能无法持久化' }

  const doNotTrack = (navigator as any).doNotTrack
  results['隐私 (DNT)'] = doNotTrack === '1'
    ? { status: 'pass', detail: '已开启「请勿追踪」' }
    : doNotTrack === '0' || doNotTrack === null
      ? { status: 'warn', detail: '未开启「请勿追踪」' }
      : { status: 'pass', detail: `浏览器设置为: ${doNotTrack || '未设置'}` }

  results['localStorage'] = (() => {
    try {
      localStorage.setItem('__test__', '1')
      localStorage.removeItem('__test__')
      return { status: 'pass' as const, detail: '可用 — 令牌/用户数据安全存储' }
    } catch {
      return { status: 'fail' as const, detail: '不可用 — 某些功能可能受限' }
    }
  })()

  results['身份验证'] = (() => {
    const stored = localStorage.getItem('auth-storage')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const user = parsed?.state?.user
        const token = parsed?.state?.token
        if (user && token) {
          return { status: 'pass' as const, detail: `已登录 (${user.username || user.email || '用户'})` }
        }
      } catch {}
    }
    return { status: 'warn' as const, detail: '未登录或令牌已过期' }
  })()

  results['CSP'] = (() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    const csp = meta?.getAttribute('content')
    if (csp) {
      const hasScript = csp.includes('script-src') || csp.includes('default-src')
      return { status: 'pass' as const, detail: hasScript ? 'CSP 已启用 — 有效防护 XSS' : 'CSP 存在但覆盖面有限' }
    }
    return { status: 'warn' as const, detail: '未检测到 CSP 策略 — 存在 XSS 风险' }
  })()

  results['安全存储'] = (() => {
    const stored = localStorage.getItem('auth-storage')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed?.state?.token) {
          const token = parsed.state.token
          if (typeof token === 'string') {
            const parts = token.split('.')
            if (parts.length === 3) {
              return { status: 'pass' as const, detail: 'JWT 令牌格式正确 (Header.Payload.Signature)' }
            }
            return { status: 'warn' as const, detail: '令牌格式非标准 JWT' }
          }
        }
      } catch {}
    }
    return { status: 'pass' as const, detail: '当前无令牌存储' }
  })()

  return results
}

export function security() {
  console.log('%c\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557', 'color: #52525b; font-weight: 700;')
  console.log('%c\u2551  \u{1F6E1}\uFE0F  LinguaLeap 安全审计报告                               \u2551', 'color: #52525b; font-weight: 700; font-size: 14px;')
  console.log('%c\u2551\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2551', 'color: #52525b;')

  const checks = checkSecurityHeaders()
  let allPass = true

  Object.entries(checks).forEach(([name, result]) => {
    const icon = result.status === 'pass' ? '\u2705' : result.status === 'fail' ? '\u274C' : '\u26A0\uFE0F'
    const color = result.status === 'pass' ? '#52525b' : result.status === 'fail' ? '#27272a' : '#52525b'
    if (result.status !== 'pass') allPass = false

    const label = `${icon}  ${name}:`
    const detail = result.detail
    const padLen = 57 - label.length - detail.length
    console.log(
      `%c\u2551  ${label}${detail}${' '.repeat(Math.max(0, padLen))}\u2551`,
      `color: ${color}; font-size: 12px;`
    )
  })

  console.log('%c\u2551\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2551', 'color: #52525b;')

  const summaryIcon = allPass ? '\u2705' : '\u26A0\uFE0F'
  const summaryColor = allPass ? '#52525b' : '#52525b'
  const summaryText = allPass
    ? '  整体评价: 安全状态良好，所有检查通过'
    : '  整体评价: 存在待优化项，建议关注上述警告/错误'

  console.log(`%c\u2551${summaryIcon}${summaryText}${' '.repeat(Math.max(0, 26 - summaryText.length))}\u2551`, `color: ${summaryColor}; font-weight: 600; font-size: 13px;`)

  console.log('%c\u2551  \u{1F570}\uFE0F 检测时间: ' + new Date().toLocaleString().padEnd(38) + '\u2551', 'color: #52525b; font-size: 11px;')

  console.log('%c\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D', 'color: #52525b;')
  console.log('')
  console.log('%c  \u{1F4A1} 输入 help() 查看更多命令  |  security() 随时重新检测', 'font-size: 11px; color: #52525b; font-style: italic;')
}

;(window as any).help = help
;(window as any).whoami = whoami
;(window as any).health = health
;(window as any).security = security
;(window as any).version = `${APP_NAME} v${APP_VERSION}`
