// ===== 军工级出站请求过滤器 =====
// 拦截未授权的外部网络请求，维护域名白名单/黑名单，并阻止 SSRF 敏感目标：
// localhost、内网 IP、链路本地地址、云元数据地址等。
//
// 使用示例：
//   import { OutboundFilter } from './security/network/index.js'
//   const filter = new OutboundFilter({
//     allowList: ['api.trusted.com', '*.partner.io'],
//     denyList: ['evil.com'],
//   })
//   const safeFetch = filter.wrapFetch(globalThis.fetch)
//   const res = await safeFetch('https://api.trusted.com/v1/data')

import dns from 'dns/promises'
import net from 'net'

const DEFAULT_SENSITIVE_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.google.internal.',
  'metadata.platform.mock',
])

const DEFAULT_METADATA_IPS = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'fd00:ec2::254',
  'fe80::a9fe:a9fe',
])

const PRIVATE_IPV4_CIDRS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '224.0.0.0/4',
  '0.0.0.0/8',
  '255.255.255.255/32',
]

const PRIVATE_IPV6_CIDRS = [
  '::1/128',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8',
]

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
}

function cidrMatchIPv4(ip, cidr) {
  const [network, bits] = cidr.split('/')
  const mask = 0xffffffff << (32 - parseInt(bits, 10))
  return (ipToLong(ip) & mask) === (ipToLong(network) & mask)
}

function expandIPv6(ip) {
  // 将 IPv6 规范化补全为 8 组，便于前缀比较
  let full = ip.toLowerCase()
  if (full.includes('::')) {
    const [left, right] = full.split('::', 2)
    const leftParts = left ? left.split(':') : []
    const rightParts = right ? right.split(':') : []
    const missing = 8 - leftParts.length - rightParts.length
    const zeros = Array(missing).fill('0')
    full = [...leftParts, ...zeros, ...rightParts].join(':')
  }
  return full.split(':').map(part => part.padStart(4, '0'))
}

function cidrMatchIPv6(ip, cidr) {
  const [network, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr, 10)
  const ipGroups = expandIPv6(ip)
  const netGroups = expandIPv6(network)
  let remaining = bits
  for (let i = 0; i < 8; i++) {
    if (remaining <= 0) return true
    const width = Math.min(16, remaining)
    const mask = 0xffff << (16 - width)
    const ipVal = parseInt(ipGroups[i], 16)
    const netVal = parseInt(netGroups[i], 16)
    if ((ipVal & mask) !== (netVal & mask)) return false
    remaining -= width
  }
  return true
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_CIDRS.some(cidr => cidrMatchIPv4(ip, cidr))
  }
  if (net.isIPv6(ip)) {
    return PRIVATE_IPV6_CIDRS.some(cidr => cidrMatchIPv6(ip, cidr))
  }
  return false
}

function isMetadataIP(ip) {
  return DEFAULT_METADATA_IPS.has(ip.toLowerCase())
}

function extractHostPort(hostPort) {
  // 处理 IPv6 字面量 [::1]:8080 与纯域名/IP
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']')
    if (end === -1) return null
    const host = hostPort.slice(1, end)
    const port = hostPort.slice(end + 1)
    return { host, port: port.startsWith(':') ? port.slice(1) : port || null }
  }
  const idx = hostPort.lastIndexOf(':')
  if (idx > -1 && hostPort.indexOf(':') === idx && !net.isIPv6(hostPort)) {
    return { host: hostPort.slice(0, idx), port: hostPort.slice(idx + 1) }
  }
  return { host: hostPort, port: null }
}

function normalizeDomain(domain) {
  return domain.toLowerCase().replace(/\.$/, '')
}

function matchDomain(host, pattern) {
  const h = normalizeDomain(host)
  const p = normalizeDomain(pattern)

  if (p === h) return true
  if (p.startsWith('*.')) {
    const suffix = p.slice(2)
    return h === suffix || h.endsWith('.' + suffix)
  }
  if (p.startsWith('.')) {
    return h.endsWith(p)
  }
  return false
}

function isSensitiveHostname(host) {
  const h = normalizeDomain(host)
  if (DEFAULT_SENSITIVE_HOSTS.has(h)) return true
  // 任意 localhost 子域名
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  return false
}

/**
 * 出站请求过滤器。
 */
export class OutboundFilter {
  /**
   * @param {object} [options]
   * @param {string[]} [options.allowList=[]] - 域名白名单（支持 *.example.com）
   * @param {string[]} [options.denyList=[]] - 域名黑名单
   * @param {boolean} [options.blockPrivate=true] - 是否拦截私有/回环/链路本地 IP
   * @param {boolean} [options.blockMetadata=true] - 是否拦截云元数据地址
   * @param {number[]} [options.blockPorts=[]] - 额外禁止的端口列表
   * @param {number} [options.dnsTimeout=5000] - DNS 解析超时（毫秒）
   */
  constructor(options = {}) {
    this.allowList = [...(options.allowList || [])]
    this.denyList = [...(options.denyList || [])]
    this.blockPrivate = options.blockPrivate !== false
    this.blockMetadata = options.blockMetadata !== false
    this.blockPorts = new Set(options.blockPorts || [])
    this.dnsTimeout = options.dnsTimeout || 5000
  }

  /**
   * 判断单个主机（域名或 IP）是否允许访问。
   *
   * @param {string} host - 不含端口的主机名或 IP
   * @returns {{allowed: boolean, reason?: string}}
   */
  isAllowedHost(host) {
    if (!host) {
      return { allowed: false, reason: '主机名为空' }
    }

    const ipVersion = net.isIP(host)

    // IP 层面的 SSRF 拦截
    if (ipVersion) {
      if (this.blockMetadata && isMetadataIP(host)) {
        return { allowed: false, reason: `拦截云元数据 IP: ${host}` }
      }
      if (this.blockPrivate && isPrivateIP(host)) {
        return { allowed: false, reason: `拦截私有/回环/链路本地 IP: ${host}` }
      }
      return { allowed: true }
    }

    // 主机名层面的敏感目标拦截
    if (this.blockPrivate && isSensitiveHostname(host)) {
      return { allowed: false, reason: `拦截敏感主机名: ${host}` }
    }

    // 黑名单优先
    for (const pattern of this.denyList) {
      if (matchDomain(host, pattern)) {
        return { allowed: false, reason: `命中域名黑名单: ${pattern}` }
      }
    }

    // 白名单：只要配置了白名单，未命中即拒绝
    if (this.allowList.length > 0) {
      const matched = this.allowList.some(pattern => matchDomain(host, pattern))
      if (!matched) {
        return { allowed: false, reason: `不在域名白名单: ${host}` }
      }
    }

    return { allowed: true }
  }

  /**
   * 判断 URL 是否允许访问（不解析 DNS）。
   *
   * @param {string} urlString
   * @returns {{allowed: boolean, reason?: string, host: string|null, port: string|null}}
   */
  isAllowedUrl(urlString) {
    let parsed
    try {
      parsed = new URL(urlString)
    } catch {
      return { allowed: false, reason: '非法 URL', host: null, port: null }
    }

    const protocol = parsed.protocol.slice(0, -1).toLowerCase()
    if (protocol !== 'http' && protocol !== 'https') {
      return {
        allowed: false,
        reason: `禁止的协议: ${protocol}`,
        host: parsed.hostname,
        port: parsed.port,
      }
    }

    const { host, port } = extractHostPort(parsed.host)
    if (!host) {
      return { allowed: false, reason: '无法解析主机', host: null, port }
    }

    if (port && this.blockPorts.has(parseInt(port, 10))) {
      return { allowed: false, reason: `禁止访问端口: ${port}`, host, port }
    }

    const hostCheck = this.isAllowedHost(host)
    if (!hostCheck.allowed) {
      return { allowed: false, reason: hostCheck.reason, host, port }
    }

    return { allowed: true, host, port }
  }

  /**
   * 同步断言 URL 允许访问，否则抛出异常。
   *
   * @param {string} urlString
   */
  guard(urlString) {
    const result = this.isAllowedUrl(urlString)
    if (!result.allowed) {
      const err = new Error(`Outbound request blocked: ${result.reason}`)
      err.code = 'OUTBOUND_BLOCKED'
      err.url = urlString
      throw err
    }
  }

  /**
   * 解析域名并校验所有解析结果，防止 DNS 重绑定与 SSRF。
   *
   * @param {string} hostname
   * @returns {Promise<{allowed: boolean, reason?: string, ips: string[]}>}
   */
  async resolveAndCheckHost(hostname) {
    const ips = []
    try {
      const signal = AbortSignal.timeout(this.dnsTimeout)
      const [aRecords, aaaaRecords] = await Promise.allSettled([
        dns.resolve4(hostname, { ttl: true, signal }),
        dns.resolve6(hostname, { ttl: true, signal }),
      ])

      if (aRecords.status === 'fulfilled') {
        for (const r of aRecords.value) ips.push(r.address)
      }
      if (aaaaRecords.status === 'fulfilled') {
        for (const r of aaaaRecords.value) ips.push(r.address)
      }
    } catch (err) {
      return { allowed: false, reason: `DNS 解析失败: ${err.message}`, ips: [] }
    }

    if (ips.length === 0) {
      return { allowed: false, reason: '主机名未解析到任何 IP', ips: [] }
    }

    for (const ip of ips) {
      const check = this.isAllowedHost(ip)
      if (!check.allowed) {
        return { allowed: false, reason: `${hostname} -> ${ip}: ${check.reason}`, ips }
      }
    }

    return { allowed: true, ips }
  }

  /**
   * 异步校验 URL（默认解析 DNS，防止域名指向内网）。
   *
   * @param {string} urlString
   * @param {object} [options]
   * @param {boolean} [options.resolve=true]
   * @returns {Promise<{allowed: boolean, reason?: string, host: string|null, port: string|null}>}
   */
  async checkUrl(urlString, { resolve = true } = {}) {
    const syncResult = this.isAllowedUrl(urlString)
    if (!syncResult.allowed) return syncResult

    const { host, port } = syncResult
    if (!host) return { ...syncResult, allowed: false, reason: '无法解析主机' }

    if (net.isIP(host)) {
      // IP 字面量已完成校验
      return syncResult
    }

    if (resolve) {
      const dnsResult = await this.resolveAndCheckHost(host)
      if (!dnsResult.allowed) {
        return { allowed: false, reason: dnsResult.reason, host, port }
      }
    }

    return syncResult
  }

  /**
   * 包装 fetch 函数，在发起请求前执行过滤。
   *
   * @param {Function} [fetchImpl=globalThis.fetch]
   * @returns {Function}
   */
  wrapFetch(fetchImpl = globalThis.fetch) {
    const filter = this
    return async function safeFetch(input, init) {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input?.url
      if (!url || typeof url !== 'string') {
        throw new TypeError('OutboundFilter.wrapFetch 需要字符串或 URL/Request 对象')
      }

      const check = await filter.checkUrl(url)
      if (!check.allowed) {
        const err = new Error(`Outbound fetch blocked: ${check.reason}`)
        err.code = 'OUTBOUND_FETCH_BLOCKED'
        err.url = url
        throw err
      }

      return fetchImpl(input, init)
    }
  }

  /**
   * 动态添加白名单。
   * @param {string|string[]} patterns
   */
  allow(patterns) {
    const list = Array.isArray(patterns) ? patterns : [patterns]
    this.allowList.push(...list.filter(Boolean))
    return this
  }

  /**
   * 动态添加黑名单。
   * @param {string|string[]} patterns
   */
  deny(patterns) {
    const list = Array.isArray(patterns) ? patterns : [patterns]
    this.denyList.push(...list.filter(Boolean))
    return this
  }
}

/**
 * 工厂函数，创建默认配置的出站过滤器。
 *
 * @param {object} [options]
 * @returns {OutboundFilter}
 */
export function createOutboundFilter(options = {}) {
  return new OutboundFilter(options)
}
