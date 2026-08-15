import { useState } from 'react'
import { useMagazineReveal } from './useMagazineReveal'
import { Link, useNavigate } from 'react-router-dom'

interface MagazineCTAProps {
  title?: string
  subtitle?: string
}

export default function MagazineCTA({ title = '准备好开始了吗？', subtitle = '加入超过 50,000 名学习者，每天 15 分钟，打开新的语言世界。' }: MagazineCTAProps) {
  const { ref, visible } = useMagazineReveal<HTMLDivElement>()
  const [email, setEmail] = useState('')
  const navigate = useNavigate()

  return (
    <section className="magazine-cta-wrap" id="start">
      <div className="magazine-container magazine-grid">
        <div ref={ref} className={`magazine-cta magazine-reveal ${visible ? 'visible' : ''}`}>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          <form
            className="magazine-cta-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (email) navigate(`/auth?email=${encodeURIComponent(email)}`)
            }}
          >
            <input
              type="email"
              placeholder="输入邮箱，免费开始"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Link to="/auth">
              <button type="submit">立即注册</button>
            </Link>
          </form>
        </div>
      </div>
    </section>
  )
}
