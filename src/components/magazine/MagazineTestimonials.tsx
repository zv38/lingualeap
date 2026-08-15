import { useMagazineReveal } from './useMagazineReveal'

interface Testimonial {
  quote: string
  name: string
  role: string
  avatar: string
}

interface MagazineTestimonialsProps {
  title?: string
  subtitle?: string
  testimonials: Testimonial[]
}

function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  const { ref, visible } = useMagazineReveal<HTMLDivElement>()
  const gridClass = index === 0 ? 'testi-a' : index === 1 ? 'testi-b' : 'testi-c'
  const staggerClass = index === 1 ? 'stagger-1' : index === 2 ? 'stagger-2' : ''

  return (
    <div
      ref={ref}
      className={`magazine-testi magazine-reveal ${staggerClass} ${gridClass} ${visible ? 'visible' : ''}`}
    >
      <p>{testimonial.quote}</p>
      <div className="magazine-testi-author">
        <div className="magazine-testi-avatar">{testimonial.avatar}</div>
        <div>
          {testimonial.name}
          <span>{testimonial.role}</span>
        </div>
      </div>
    </div>
  )
}

export default function MagazineTestimonials({ title = '学员故事', subtitle, testimonials }: MagazineTestimonialsProps) {
  const { ref: headerRef, visible: headerVisible } = useMagazineReveal<HTMLDivElement>()

  return (
    <section className="magazine-section" id="stories">
      <div className="magazine-container magazine-grid">
        <div
          ref={headerRef}
          className={`magazine-section-header magazine-reveal ${headerVisible ? 'visible' : ''}`}
        >
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        {testimonials.slice(0, 3).map((t, i) => (
          <TestimonialCard key={t.name} testimonial={t} index={i} />
        ))}
      </div>
    </section>
  )
}
