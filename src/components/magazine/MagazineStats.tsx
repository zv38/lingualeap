import { useMagazineReveal, useCountUp } from './useMagazineReveal'

interface Stat {
  value: number
  suffix?: string
  label: string
}

interface MagazineStatsProps {
  stats: Stat[]
}

function StatCard({ stat, index }: { stat: Stat; index: number }) {
  const { ref, visible } = useMagazineReveal<HTMLDivElement>()
  const count = useCountUp(stat.value, 1300, 0, visible)

  const gridClass = index === 0 ? 'stat-a' : index === 1 ? 'stat-b' : index === 2 ? 'stat-c' : 'stat-d'
  const staggerClass = index === 1 ? 'stagger-1' : index === 2 ? 'stagger-2' : index === 3 ? 'stagger-3' : ''

  return (
    <div
      ref={ref}
      className={`magazine-stat-card magazine-reveal ${staggerClass} ${gridClass} ${visible ? 'visible' : ''}`}
    >
      <strong>
        {count}
        {stat.suffix || ''}
      </strong>
      <span>{stat.label}</span>
    </div>
  )
}

export default function MagazineStats({ stats }: MagazineStatsProps) {
  return (
    <section className="magazine-stats">
      <div className="magazine-container magazine-grid">
        {stats.slice(0, 4).map((stat, i) => (
          <StatCard key={stat.label} stat={stat} index={i} />
        ))}
      </div>
    </section>
  )
}
