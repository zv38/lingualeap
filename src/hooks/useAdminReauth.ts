import { useEffect, useState, useCallback } from 'react'
import { setAdminReauthToken, clearAdminReauthToken } from '../utils/adminReauthCache'
import { retryPendingAdminRequest } from '../utils/api'

export function useAdminReauth() {
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<{ path?: string; method?: string; message?: string }>({})

  useEffect(() => {
    function onRequired(e: Event) {
      const detail = (e as CustomEvent).detail || {}
      setContext(detail)
      setOpen(true)
    }

    function onAuthExpired() {
      clearAdminReauthToken()
    }

    window.addEventListener('admin-reauth-required', onRequired)
    window.addEventListener('auth-expired', onAuthExpired)
    return () => {
      window.removeEventListener('admin-reauth-required', onRequired)
      window.removeEventListener('auth-expired', onAuthExpired)
    }
  }, [])

  const handleVerified = useCallback((token: string) => {
    setAdminReauthToken(token)
    setOpen(false)
    retryPendingAdminRequest()
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  return { open, context, handleVerified, handleClose }
}
