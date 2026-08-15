import type { ReactNode } from 'react'
import MagazineNav from './MagazineNav'

interface MagazineRootProps {
  children: ReactNode
  showNav?: boolean
}

export default function MagazineRoot({ children, showNav = true }: MagazineRootProps) {
  return (
    <div className="magazine-root min-h-screen">
      <div className="magazine-paper" aria-hidden="true" />
      <div className="magazine-grain" aria-hidden="true" />
      {showNav && <MagazineNav />}
      {children}
    </div>
  )
}
