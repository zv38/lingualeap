import { Link } from 'react-router-dom'

export default function MagazineFooter() {
  return (
    <footer className="magazine-footer">
      <div className="magazine-container magazine-footer-inner">
        <div>© 2026 LinguaLeap. 保留所有权利。</div>
        <div className="magazine-footer-links">
          <Link to="/privacy">隐私政策</Link>
          <Link to="/security-policy">安全政策</Link>
          <Link to="/terms">服务条款</Link>
          <Link to="/bug-report">帮助中心</Link>
        </div>
      </div>
    </footer>
  )
}
