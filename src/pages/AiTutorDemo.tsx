import { motion } from 'framer-motion'

/**
 * 错题可视化 Demo（ai-tutor skill 演示）
 * 通过 iframe 内嵌 public/ai-tutor-demo/index.html 静态演示页，
 * 避免与主应用的 React 运行时、样式与路由冲突。
 */
export default function AiTutorDemo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen px-4 py-6"
      style={{ background: '#eeeeec' }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0 18px 50px -22px rgba(43,41,38,0.35)',
          border: '1px solid rgba(28,26,24,0.08)',
        }}
      >
        <iframe
          src="/ai-tutor-demo/index.html"
          title="错题可视化 Demo"
          style={{ width: '100%', height: 'calc(100vh - 120px)', border: 'none', display: 'block' }}
        />
      </div>
    </motion.div>
  )
}