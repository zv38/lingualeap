const WINDOW_MS = 60000;
const CLEANUP_INTERVAL = 300000;

class RequestTracker {
  constructor() {
    this.requests = new Map()
    this.failedAttempts = new Map()
    this.uniqueEmails = new Map()
    this.hourlyRegistrations = new Map()
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL)
  }

  record(ip, info = {}) {
    const now = Date.now()
    if (!this.requests.has(ip)) {
      this.requests.set(ip, { timestamps: [], uas: [], fingerprints: new Set(), pathCounts: new Map(), firstSeen: now })
    }
    const record = this.requests.get(ip)
    record.timestamps.push(now)
    if (info.ua) record.uas.push(info.ua)
    if (info.fingerprint) record.fingerprints.add(info.fingerprint)
    if (info.path) {
      record.pathCounts.set(info.path, (record.pathCounts.get(info.path) || 0) + 1)
    }

    if (info.registration) {
      const hourKey = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}-${new Date().getHours()}`
      this.hourlyRegistrations.set(hourKey, (this.hourlyRegistrations.get(hourKey) || 0) + 1)
    }
  }

  recordFailedLogin(ip, email) {
    const now = Date.now()
    if (!this.failedAttempts.has(ip)) {
      this.failedAttempts.set(ip, [])
    }
    this.failedAttempts.get(ip).push({ time: now, email })

    if (email) {
      if (!this.uniqueEmails.has(ip)) {
        this.uniqueEmails.set(ip, new Set())
      }
      this.uniqueEmails.get(ip).add(email)
    }
  }

  recordSuccessfulLogin(ip) {
    this.failedAttempts.delete(ip)
  }

  getContext(ip) {
    const now = Date.now()
    const windowStart = now - WINDOW_MS

    const record = this.requests.get(ip)
    if (!record) {
      return {
        requestsPerMinute: 0,
        avgInterval: 0,
        minInterval: Infinity,
        uaSwitches: 0,
        hasFingerprint: false,
        isBrowser: false,
        parallelConns: 0,
        failedLogins: 0,
        uniqueEmails: 0,
        failedLoginRate: 0,
        period: 0,
        registrationsThisHour: 0,
      }
    }

    const windowTimestamps = record.timestamps.filter(t => t >= windowStart)
    const uaWindow = record.uas.slice(-record.uas.length)

    const uniqueUAs = new Set(uaWindow)
    const uaSwitches = uaWindow.length - uniqueUAs.size + 1
    const isBrowser = uaWindow.length > 0 && /Mozilla|Chrome|Safari|Firefox|Edg/i.test(uaWindow[uaWindow.length - 1] || '')

    let intervals = []
    if (windowTimestamps.length >= 2) {
      const sorted = windowTimestamps.slice().sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i] - sorted[i - 1])
      }
    }

    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0
    const minInterval = intervals.length > 0 ? Math.min(...intervals) : Infinity

    const failedData = this.failedAttempts.get(ip)
    const recentFailures = failedData ? failedData.filter(f => f.time >= windowStart) : []
    const recentUniqueEmails = this.uniqueEmails.get(ip)
    const period = failedData && failedData.length > 0
      ? now - failedData[failedData.length - 1].time
      : 0

    const hourKey = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}-${new Date().getHours()}`
    const registrationsThisHour = this.hourlyRegistrations.get(hourKey) || 0

    return {
      requestsPerMinute: windowTimestamps.length,
      avgInterval,
      minInterval: minInterval === Infinity ? 0 : minInterval,
      uaSwitches: Math.max(0, uaSwitches - 1),
      hasFingerprint: record.fingerprints.size > 0,
      isBrowser,
      parallelConns: record.timestamps.filter(t => now - t < 2000).length,
      failedLogins: recentFailures.length,
      uniqueEmails: recentUniqueEmails ? recentUniqueEmails.size : 0,
      failedLoginRate: Math.min(1, recentFailures.length / Math.max(windowTimestamps.length, 1)),
      period,
      registrationsThisHour,
      requestCount: windowTimestamps.length,
      sessionDuration: now - record.firstSeen,
    }
  }

  getRate(ip) {
    const context = this.getContext(ip);
    return context.requestsPerMinute;
  }

  cleanup() {
    const now = Date.now()
    const windowStart = now - WINDOW_MS * 10

    for (const [ip, record] of this.requests) {
      record.timestamps = record.timestamps.filter(t => t >= windowStart)
      if (record.timestamps.length === 0) {
        this.requests.delete(ip)
        this.failedAttempts.delete(ip)
        this.uniqueEmails.delete(ip)
      }
    }

    for (const [ip, failures] of this.failedAttempts) {
      const recent = failures.filter(f => f.time >= windowStart)
      if (recent.length === 0) {
        this.failedAttempts.delete(ip)
        this.uniqueEmails.delete(ip)
      } else {
        this.failedAttempts.set(ip, recent)
      }
    }

    const expiredHourKeys = []
    for (const key of this.hourlyRegistrations.keys()) {
      const parts = key.split('-')
      const hourDate = new Date(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]))
      if (now - hourDate.getTime() > 86400000) expiredHourKeys.push(key)
    }
    for (const key of expiredHourKeys) this.hourlyRegistrations.delete(key)
  }
}

export const requestTracker = new RequestTracker()