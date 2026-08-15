import Tooltip from './Tooltip'

interface InfoTipProps {
  content: string
  className?: string
}

export default function InfoTip({ content, className = '' }: InfoTipProps) {
  return (
    <Tooltip content={content} position="top" delay={200} className={className}>
      <span
        className="w-5 h-5 rounded-full bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/15 flex items-center justify-center text-[10px] text-[var(--accent-primary)] cursor-help select-none shrink-0"
        aria-label={content}
        role="img"
      >
        <span aria-hidden="true">?</span>
      </span>
    </Tooltip>
  )
}