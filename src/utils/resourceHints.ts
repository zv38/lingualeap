// 资源提示管理：动态注入 dns-prefetch / preconnect / prefetch / modulepreload
// 用于加速关键域名与关键资源的解析和加载

const injected = new Set<string>()

function createLink(rel: string, href: string, as?: string, type?: string) {
  const key = `${rel}|${href}|${as || ''}|${type || ''}`
  if (injected.has(key)) return
  if (typeof document === 'undefined') return

  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  if (as) link.as = as
  if (type) link.type = type
  if (rel === 'preconnect' || rel === 'dns-prefetch') {
    link.crossOrigin = 'anonymous'
  }
  document.head.appendChild(link)
  injected.add(key)
}

export function dnsPrefetch(domain: string) {
  createLink('dns-prefetch', domain)
}

export function preconnect(domain: string) {
  createLink('preconnect', domain)
}

export function prefetchResource(href: string, as: 'script' | 'style' | 'image' | 'document' | 'fetch' = 'fetch') {
  createLink('prefetch', href, as)
}

export function preloadModule(href: string) {
  createLink('modulepreload', href)
}

export function preloadCriticalResource(href: string, as: 'script' | 'style' | 'image' | 'font' | 'fetch') {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.href = href
  link.as = as
  if (as === 'font') {
    link.crossOrigin = 'anonymous'
  }
  document.head.appendChild(link)
}

// 根据当前环境注入默认资源提示
export function initResourceHints() {
  if (typeof document === 'undefined') return

  // 同源后端 API 预连接
  const origin = window.location.origin
  preconnect(origin)
  dnsPrefetch(origin)

  // 如果部署到 CDN，可在此处预连接 CDN 域名
  // preconnect('https://cdn.example.com')
  // dnsPrefetch('https://cdn.example.com')

  // 预加载关键字体（如使用自定义字体）
  // preloadCriticalResource('/fonts/inter-var.woff2', 'font')
}

// 预加载页面将要用到的 JS chunk（由 Vite 构建产物路径决定）
export function prefetchKnownChunk(path: string) {
  // 仅对已知构建产物路径做提示，避免 404
  if (path.startsWith('/assets/')) {
    preloadModule(path)
  }
}
