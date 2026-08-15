import { useMagazineReveal } from './useMagazineReveal'

interface MagazineQuoteProps {
  quote: string
  attribution?: string
}

export default function MagazineQuote({ quote, attribution }: MagazineQuoteProps) {
  const { ref, visible } = useMagazineReveal<HTMLDivElement>()

  return (
    <section className="magazine-quote">
      <div ref={ref} className={`magazine-container magazine-reveal ${visible ? 'visible' : ''}`}>
        <p>{quote}</p>
        {attribution && <span>— {attribution}</span>}
      </div>
    </section>
  )
}
