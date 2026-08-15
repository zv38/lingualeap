let active = false

export interface GracefulReloadOptions {
  reason?: string
  /** 覆盖层文案 */
  message?: string
  /** 兜底强制刷新延迟（ms） */
  fallbackDelay?: number
}

export function gracefulReload(options: GracefulReloadOptions = {}): void {
  if (active) return
  active = true

  const message = options.message ?? '正在安全刷新'
  const fallbackDelay = options.fallbackDelay ?? 2000

  // 品牌玻璃覆盖层（对齐玻璃拟态）
  const overlay = document.createElement('div')
  overlay.setAttribute('data-graceful-reload', 'true')
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483000',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:16px',
    'background:rgba(250,250,250,0.72)',
    'backdrop-filter:blur(18px) saturate(165%)',
    '-webkit-backdrop-filter:blur(18px) saturate(165%)',
    'color:#09090b',
    'font-family:Inter,system-ui,sans-serif',
  ].join(';')
  overlay.innerHTML = `
    <div style="width:44px;height:44px;border-radius:14px;background:#000;display:flex;align-items:center;justify-content:center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
      </svg>
    </div>
    <div style="font-size:14px;font-weight:500">${message}…</div>
  `
  document.body.appendChild(overlay)

  // 等待当前任务落定；兜底 fallbackDelay 后强制刷新
  const doReload = () => window.location.reload()
  const safe = () => {
    doReload()
    cleanup()
  }
  const cleanup = () => {
    window.clearTimeout(timer)
    overlay.remove()
  }

  const timer = window.setTimeout(safe, fallbackDelay)
  const idleFn = window.requestIdleCallback
    ? () => window.requestIdleCallback(() => { if (active) safe() }, { timeout: 1200 })
    : () => window.setTimeout(() => { if (active) safe() }, 800)
  idleFn()
}