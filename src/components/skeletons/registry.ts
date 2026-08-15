/**
 * 骨架屏注册表：按 pathname 段映射到骨架屏 key。
 * 具体骨架组件复用现有 SuspenseFallback 的玻璃风格，由各页懒加载时按需渲染。
 */
export type SkeletonKey = 'dashboard' | 'list' | 'form' | 'detail' | 'default'

export function skeletonKeyFor(pathname: string): SkeletonKey {
  if (pathname === '/' || pathname === '/courses') return 'dashboard'
  if (pathname.startsWith('/admin')) return 'form'
  if (pathname.startsWith('/learn') || pathname.startsWith('/daily')) return 'detail'
  if (pathname.startsWith('/messages') || pathname.startsWith('/notifications')) return 'list'
  return 'default'
}