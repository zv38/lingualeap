const TOKEN_KEY = 'lingualeap_admin_reauth_token'

export function setAdminReauthToken(token: string | null) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(TOKEN_KEY)
  }
}

export function getAdminReauthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearAdminReauthToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {}
}

export function isAdminPath(path: string): boolean {
  return path.startsWith('/admin')
}
