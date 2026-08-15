const SESSION_KEY = '_ls_session'

function getSessionSecret(): string {
  let secret = sessionStorage.getItem(SESSION_KEY)
  if (!secret) {
    secret = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, secret)
  }
  return secret
}

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const secret = getSessionSecret()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptValue(value: string): Promise<string> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(salt)
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(value),
    )
    const combined = new Uint8Array(16 + 12 + encrypted.byteLength)
    combined.set(salt, 0)
    combined.set(iv, 16)
    combined.set(new Uint8Array(encrypted), 28)
    return btoa(String.fromCharCode(...combined))
  } catch {
    return value
  }
}

export async function decryptValue(encrypted: string): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
    const salt = combined.slice(0, 16)
    const iv = combined.slice(16, 28)
    const data = combined.slice(28)
    const key = await deriveKey(salt)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

export async function setSecureItem(key: string, value: string) {
  try {
    const encrypted = await encryptValue(value)
    localStorage.setItem(key, encrypted)
  } catch {}
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    const encrypted = localStorage.getItem(key)
    if (!encrypted) return null
    return await decryptValue(encrypted)
  } catch {
    return null
  }
}

export function removeSecureItem(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {}
}