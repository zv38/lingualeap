const KEY = 'lingualeap-update-dismiss'
const COOLDOWN_MS = 30 * 60 * 1000

interface DismissRecord {
  version: string
  at: number
}

export function dismissUpdate(version: string): void {
  const record: DismissRecord = { version, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* 存储不可用时静默降级 */
  }
}

export function isDismissed(version: string): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const record = JSON.parse(raw) as DismissRecord
    if (record.version !== version) return false
    return Date.now() - record.at < COOLDOWN_MS
  } catch {
    return false
  }
}