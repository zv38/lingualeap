import { useEffect, useState } from 'react'

export default function StartupOverlay() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    // 移除 index.html 内联占位，避免重复叠加
    document.getElementById('startup-placeholder')?.remove()
    // 等首屏内容就绪后再淡出移除，避免闪烁
    const t = window.setTimeout(() => setDone(true), 350)
    return () => window.clearTimeout(t)
  }, [])

  if (done) return null

  return (
    <div
      data-startup-overlay
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'rgba(250,250,250,0.72)',
        backdropFilter: 'blur(18px) saturate(165%)',
        WebkitBackdropFilter: 'blur(18px) saturate(165%)',
        color: '#09090b',
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'opacity 0.28s ease',
        opacity: 1,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>正在准备您的体验…</div>
    </div>
  )
}