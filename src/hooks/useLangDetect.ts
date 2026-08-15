import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

// 后端检测 code → store 中的 uiLanguage code
const LANG_MAP: Record<string, string> = {
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  'en':    'en',
  'ja':    'ja',
  'ko':    'ko',
  'fr':    'fr',
  'de':    'de',
  'es':    'es',
  'ar':    'ar',
  'ru':    'ru',
}

const LANG_NAMES: Record<string, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en':    'English',
  'ja':    '日本語',
  'ko':    '한국어',
  'fr':    'Français',
  'de':    'Deutsch',
  'es':    'Español',
  'ar':    'العربية',
  'ru':    'Русский',
}

export function useLangDetect() {
  const currentUiLang = useStore((s) => s.uiLanguage)
  const setUiLanguage = useStore((s) => s.setUiLanguage)

  const [suggestedLang, setSuggestedLang] = useState<string | null>(null)
  const [suggestedDisplay, setSuggestedDisplay] = useState<string>('')
  const [source, setSource] = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('lang-banner-dismissed')
    if (dismissed) return

    fetch('/api/language/detect')
      .then((r) => r.json())
      .then((data: { language: string; source: string }) => {
        const mapped = LANG_MAP[data.language]
        if (!mapped) return

        // 检测到的语言与当前一致 → 不显示
        if (mapped === currentUiLang) return

        setSuggestedLang(mapped)
        setSuggestedDisplay(LANG_NAMES[data.language] ?? data.language)
        setSource(data.source)
        setShowBanner(true)
      })
      .catch(() => {})
  }, [])

  const accept = async () => {
    if (!suggestedLang) return
    setUiLanguage(suggestedLang as 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'de')
    await fetch('/api/language/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: suggestedLang }),
    }).catch(() => null)
    localStorage.setItem('lang-banner-dismissed', '1')
    setShowBanner(false)
  }

  const dismiss = () => {
    localStorage.setItem('lang-banner-dismissed', '1')
    setShowBanner(false)
  }

  return { suggestedLang, suggestedDisplay, source, showBanner, accept, dismiss }
}
