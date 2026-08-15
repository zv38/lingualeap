import { Link } from 'react-router-dom'
import { useMagazineReveal } from './useMagazineReveal'

interface MagazineSectionHeaderProps {
  title: string
  subtitle?: string
  linkTo?: string
  linkText?: string
}

export default function MagazineSectionHeader({ title, subtitle, linkTo, linkText }: MagazineSectionHeaderProps) {
  const { ref, visible } = useMagazineReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={`magazine-section-header magazine-reveal ${visible ? 'visible' : ''}`}
    >
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {linkTo && linkText && (
        <Link to={linkTo}>{linkText} →</Link>
      )}
    </div>
  )
}
