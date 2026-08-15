import { memo } from 'react'

const keyframesStyle = `
@keyframes ambient-drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(5%, 3%) scale(1.08); }
  50% { transform: translate(2%, -4%) scale(0.95); }
  75% { transform: translate(-3%, 2%) scale(1.04); }
}
@keyframes ambient-drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-4%, 5%) scale(0.95); }
  50% { transform: translate(3%, -2%) scale(1.08); }
  75% { transform: translate(-2%, -3%) scale(0.96); }
}
@keyframes ambient-drift-3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(3%, -3%) scale(1.05); }
  66% { transform: translate(-4%, 4%) scale(0.95); }
}
@keyframes ambient-drift-4 {
  0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
  50% { transform: translate(2%, 4%) scale(1.10) rotate(8deg); }
}
@keyframes ambient-drift-5 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-3%, -2%) scale(0.92); }
}
`

function AmbientBackground() {
  return (
    <>
      <style>{keyframesStyle}</style>
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        {/* 黑白灰底色渐变 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, #fafafa 0%, #f4f4f5 50%, #e4e4e7 100%)',
          }}
        />
        {/* 网格底纹（极淡） */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(0, 0, 0, 0.03) 0.5px, transparent 0.5px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 0.5px, transparent 0.5px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* 光斑 — 极淡黑灰 */}
        <div
          className="absolute w-[55vw] h-[55vw] max-w-[780px] max-h-[780px] rounded-full"
          style={{
            top: '5%',
            left: '-5%',
            background:
              'radial-gradient(circle at center, rgba(0, 0, 0, 0.06) 0%, rgba(0, 0, 0, 0.02) 40%, transparent 70%)',
            filter: 'blur(60px)',
            animation: 'ambient-drift-1 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[50vw] h-[50vw] max-w-[680px] max-h-[680px] rounded-full"
          style={{
            bottom: '8%',
            right: '-3%',
            background:
              'radial-gradient(circle at center, rgba(82, 82, 91, 0.06) 0%, rgba(82, 82, 91, 0.015) 40%, transparent 70%)',
            filter: 'blur(70px)',
            animation: 'ambient-drift-2 26s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[40vw] h-[40vw] max-w-[560px] max-h-[560px] rounded-full"
          style={{
            top: '40%',
            left: '50%',
            background:
              'radial-gradient(circle at center, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.01) 40%, transparent 70%)',
            filter: 'blur(65px)',
            animation: 'ambient-drift-3 19s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[35vw] h-[35vw] max-w-[480px] max-h-[480px] rounded-full"
          style={{
            top: '60%',
            left: '10%',
            background:
              'radial-gradient(circle at center, rgba(161, 161, 170, 0.04) 0%, rgba(161, 161, 170, 0.01) 40%, transparent 70%)',
            filter: 'blur(65px)',
            animation: 'ambient-drift-4 24s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[30vw] h-[30vw] max-w-[420px] max-h-[420px] rounded-full"
          style={{
            top: '15%',
            right: '15%',
            background:
              'radial-gradient(circle at center, rgba(63, 63, 70, 0.04) 0%, rgba(63, 63, 70, 0.01) 40%, transparent 70%)',
            filter: 'blur(70px)',
            animation: 'ambient-drift-5 21s ease-in-out infinite',
          }}
        />
        {/* 顶部径向高光 — 模拟天窗光 */}
        <div
          className="absolute w-[80vw] h-[40vw] max-w-[1100px] max-h-[550px] rounded-full"
          style={{
            top: '-15%',
            left: '50%',
            transform: 'translateX(-50%)',
            background:
              'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.18) 40%, transparent 70%)',
            filter: 'blur(50px)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </>
  )
}

export default memo(AmbientBackground)
