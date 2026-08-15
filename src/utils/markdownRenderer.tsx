import React from 'react'

interface MarkdownProps {
  content: string
  className?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[([^\]]+)\]\(([^)]+)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, match.index)))
    }

    if (match[1]) {
      parts.push(<code key={parts.length} className="px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/8 text-[var(--accent-primary)] text-xs font-mono">{escapeHtml(match[1].slice(1, -1))}</code>)
    } else if (match[2]) {
      parts.push(<strong key={parts.length} className="font-bold text-[var(--text-primary)]">{escapeHtml(match[2].slice(2, -2))}</strong>)
    } else if (match[3]) {
      parts.push(<em key={parts.length} className="italic text-[var(--text-secondary)]">{escapeHtml(match[3].slice(1, -1))}</em>)
    } else if (match[4]) {
      parts.push(
        <a key={parts.length} href={match[6]} target="_blank" rel="noopener noreferrer"
           className="text-[var(--accent-primary)] underline hover:text-[var(--accent-primary)] transition-colors">
          {escapeHtml(match[5])}
        </a>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)))
  }

  return parts
}

function parseCodeBlock(lines: string[], startIdx: number): { html: React.ReactNode; endIdx: number } | null {
  const line = lines[startIdx]
  if (!line.trimStart().startsWith('```')) return null

  const lang = line.trimStart().slice(3).trim()
  let codeLines: string[] = []
  let endIdx = startIdx + 1

  while (endIdx < lines.length) {
    if (lines[endIdx].trimStart().startsWith('```')) {
      endIdx++
      break
    }
    codeLines.push(lines[endIdx])
    endIdx++
  }

  const code = codeLines.join('\n')
  return {
    html: (
      <div key={`code-${startIdx}`} className="relative group my-3">
        {lang && (
          <div className="flex items-center justify-between px-4 py-1.5 bg-black/[0.06] rounded-t-xl border-b border-black/[0.05]">
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">{lang}</span>
            <button
              onClick={() => navigator.clipboard.writeText(code)}
              className="text-[10px] px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/8 transition-all font-mono"
            >
              复制
            </button>
          </div>
        )}
        <pre className="bg-black/[0.03] rounded-b-xl p-4 overflow-x-auto">
          <code className="text-sm font-mono text-[var(--text-primary)] leading-relaxed whitespace-pre">{code}</code>
        </pre>
      </div>
    ),
    endIdx,
  }
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownProps) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const block = parseCodeBlock(lines, i)
    if (block) {
      elements.push(block.html)
      i = block.endIdx
      continue
    }

    const line = lines[i].trim()
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="font-serif text-lg text-[var(--text-primary)] mt-5 mb-2">{parseInline(line.slice(4))}</h3>
      )
      i++
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="font-serif text-xl text-[var(--text-primary)] mt-6 mb-2">{parseInline(line.slice(3))}</h2>
      )
      i++
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="font-serif text-2xl text-[var(--text-primary)] mt-6 mb-3">{parseInline(line.slice(2))}</h1>
      )
      i++
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const listItems: React.ReactNode[] = []
      while (i < lines.length && (lines[i].trimStart().startsWith('- ') || lines[i].trimStart().startsWith('* '))) {
        const item = lines[i].trimStart().slice(2)
        listItems.push(
          <li key={i} className="text-[var(--text-primary)] text-sm leading-relaxed pl-1">
            {parseInline(item)}
          </li>
        )
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1 my-2 list-disc list-inside text-[var(--text-secondary)]">
          {listItems}
        </ul>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^\d+\.\s/, '')
        listItems.push(
          <li key={i} className="text-[var(--text-primary)] text-sm leading-relaxed pl-1">
            {parseInline(item)}
          </li>
        )
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1 my-2 list-decimal list-inside text-[var(--text-secondary)]">
          {listItems}
        </ol>
      )
    } else if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quoteLines.push(lines[i].trimStart().slice(2))
        i++
      }
      elements.push(
        <blockquote key={`quote-${i}`} className="border-l-2 border-[var(--accent-primary)]/30 pl-4 my-3 text-[var(--text-secondary)] text-sm italic">
          {quoteLines.map((ql, qi) => <p key={qi}>{parseInline(ql)}</p>)}
        </blockquote>
      )
    } else if (line === '---') {
      elements.push(<hr key={`hr-${i}`} className="my-4 border-t border-black/[0.06]" />)
      i++
    } else if (!line && (i === 0 || i === lines.length - 1 || !lines[i - 1]?.trim())) {
      i++
    } else if (line) {
      elements.push(
        <p key={i} className="text-[var(--text-primary)] text-sm leading-relaxed my-1.5">{parseInline(line)}</p>
      )
      i++
    } else {
      i++
    }
  }

  return <div className={`space-y-1 ${className}`}>{elements}</div>
}