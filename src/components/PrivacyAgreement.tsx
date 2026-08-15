import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'

export default function PrivacyAgreement() {
  const navigate = useNavigate()
  const { privacyAgreed } = useStore()

  useEffect(() => {
    if (!privacyAgreed) {
      navigate('/privacy-agreement', { replace: true })
    }
  }, [privacyAgreed, navigate])

  return null
}