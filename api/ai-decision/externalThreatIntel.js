// ===== 外部威胁情报查询与缓存 =====
// 支持 AbuseIPDB、FireHOL 公开列表、IPinfo/ip-api.com 地理/ASN 信息
// 所有查询默认走缓存；缓存未命中时异步刷新，不阻塞请求路径。

import { safeRedisOp, isRedisReady } from '../lib/redisClient.js'

const CACHE_TTL_SECONDS = Number(process.env.THREAT_INTEL_CACHE_TTL_SECONDS || 3600)
const ABUSEIPDB_API_KEY = process.env.ABUSEIPDB_API_KEY
const IPINFO_TOKEN = process.env.IPINFO_TOKEN

const KEY_PREFIX = 'threat_intel:'

// 内存兜底缓存
const memoryCache = new Map()

function getCacheKey(source, ip) {
  return `${KEY_PREFIX}${source}:${ip}`
}

async function getCache(key) {
  if (isRedisReady()) {
    const raw = await safeRedisOp(c => c.get(key), null)
    if (raw) {
      try { return JSON.parse(raw) } catch { return null }
    }
    return null
  }
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key)
    return null
  }
  return entry.value
}

async function setCache(key, value, ttlSeconds = CACHE_TTL_SECONDS) {
  if (isRedisReady()) {
    await safeRedisOp(c => c.setEx(key, ttlSeconds, JSON.stringify(value)), null)
    return
  }
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || 5000)
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return null
  // 支持 IPv4 与 IPv6；去除 IPv4-mapped IPv6 前缀
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

// ===== AbuseIPDB =====
async function queryAbuseIPDB(ip) {
  if (!ABUSEIPDB_API_KEY) return null
  try {
    const data = await fetchJson(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}`, {
      timeout: 5000,
      headers: {
        Key: ABUSEIPDB_API_KEY,
        Accept: 'application/json',
      },
    })
    if (!data?.data) return null
    return {
      source: 'abuseipdb',
      ip: data.data.ipAddress,
      score: Math.min(data.data.abuseConfidenceScore / 100, 0.99),
      country: data.data.countryCode,
      isp: data.data.isp,
      reports: data.data.totalReports || 0,
      lastReported: data.data.lastReportedAt,
      isMalicious: (data.data.abuseConfidenceScore || 0) >= 25,
    }
  } catch (err) {
    console.warn(`[ThreatIntel] AbuseIPDB 查询失败 ${ip}:`, err.message)
    return null
  }
}

// ===== FireHOL 公开 IP 列表 =====
// 使用 firehol_level1.netset（高置信度恶意 IP）
async function queryFireHOL(ip) {
  try {
    const cacheKey = getCacheKey('firehol_list', 'level1')
    let list = await getCache(cacheKey)
    if (!list) {
      const res = await fetch('https://iplists.firehol.org/files/firehol_level1.netset', { signal: new AbortController().signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      list = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
      await setCache(cacheKey, list, 6 * 3600) // 6 小时刷新一次列表
    }

    const isListed = list.some(entry => ipInCIDR(ip, entry))
    return {
      source: 'firehol',
      ip,
      score: isListed ? 0.85 : 0,
      isMalicious: isListed,
      listName: 'firehol_level1',
    }
  } catch (err) {
    console.warn(`[ThreatIntel] FireHOL 查询失败 ${ip}:`, err.message)
    return null
  }
}

function ipToLong(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  return parts.reduce((acc, part) => (acc << 8) + parseInt(part, 10), 0) >>> 0
}

function ipInCIDR(ip, cidr) {
  if (!ip.includes('.') || !cidr.includes('.')) return false
  const [network, bits] = cidr.split('/')
  const mask = parseInt(bits, 10)
  const ipLong = ipToLong(ip)
  const netLong = ipToLong(network)
  if (ipLong === null || netLong === null) return false
  const shift = 32 - mask
  return (ipLong >>> shift) === (netLong >>> shift)
}

// ===== IPinfo / ip-api.com（地理与 ASN） =====
async function queryIPinfo(ip) {
  try {
    if (IPINFO_TOKEN) {
      const data = await fetchJson(`https://ipinfo.io/${ip}/json?token=${IPINFO_TOKEN}`, { timeout: 5000 })
      return {
        source: 'ipinfo',
        ip,
        country: data.country,
        region: data.region,
        city: data.city,
        org: data.org,
        asn: data.asn?.asn,
        asnName: data.asn?.name,
        isVpn: data.privacy?.vpn || false,
        isProxy: data.privacy?.proxy || false,
        isTor: data.privacy?.tor || false,
        isHosting: data.privacy?.hosting || false,
      }
    }
    // 无 token 时使用 ip-api.com（免费，无需 key，有速率限制）
    const data = await fetchJson(`http://ip-api.com/json/${ip}?fields=66846719`, { timeout: 5000 })
    return {
      source: 'ip-api',
      ip,
      country: data.countryCode,
      region: data.regionName,
      city: data.city,
      org: data.isp,
      asn: data.as,
      asnName: data.org,
      isVpn: data.proxy || false,
      isProxy: data.proxy || false,
      isTor: false,
      isHosting: data.hosting || false,
    }
  } catch (err) {
    console.warn(`[ThreatIntel] IP 信息查询失败 ${ip}:`, err.message)
    return null
  }
}

// ===== 对外接口 =====

/**
 * 查询单个 IP 的外部威胁情报。优先返回缓存；缓存未命中时异步刷新。
 * @param {string} ip
 * @param {object} options
 * @param {number} [options.timeoutMs=3000] 首次查询等待超时，默认 3 秒避免阻塞请求路径
 */
export async function queryExternalThreatIntel(ip, options = {}) {
  const normalized = normalizeIP(ip)
  if (!normalized) {
    return { ip, sources: [], score: 0, isMalicious: false, geo: null }
  }

  const cacheKey = getCacheKey('aggregate', normalized)
  const cached = await getCache(cacheKey)
  if (cached) return cached

  // 异步并行查询所有源，不阻塞返回
  const resultPromise = Promise.all([
    queryAbuseIPDB(normalized),
    queryFireHOL(normalized),
    queryIPinfo(normalized),
  ]).then(([abuse, firehol, geo]) => {
    const sources = [abuse, firehol].filter(Boolean)
    const malicious = sources.some(s => s.isMalicious)
    const maxScore = sources.reduce((max, s) => Math.max(max, s.score || 0), 0)
    const result = {
      ip: normalized,
      sources,
      score: Math.min(maxScore, 0.99),
      isMalicious: malicious,
      geo,
      queriedAt: new Date().toISOString(),
    }
    setCache(cacheKey, result, CACHE_TTL_SECONDS).catch(() => {})
    return result
  })

  // 等待结果（首次查询），但设置超时避免阻塞
  const timeoutMs = options.timeoutMs ?? 3000
  try {
    return await Promise.race([
      resultPromise,
      new Promise((resolve) =>
        setTimeout(() => resolve({
          ip: normalized,
          sources: [],
          score: 0,
          isMalicious: false,
          geo: null,
          pending: true,
        }), timeoutMs)
      ),
    ])
  } catch (err) {
    return { ip: normalized, sources: [], score: 0, isMalicious: false, geo: null, error: err.message }
  }
}

/**
 * 批量查询（用于后台扫描或管理后台）
 */
export async function queryBulkThreatIntel(ips) {
  return Promise.all(ips.map(ip => queryExternalThreatIntel(ip)))
}

export function getStats() {
  return {
    abuseipdbEnabled: !!ABUSEIPDB_API_KEY,
    ipinfoEnabled: !!IPINFO_TOKEN,
    fireholEnabled: true,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    memoryCacheSize: memoryCache.size,
  }
}
