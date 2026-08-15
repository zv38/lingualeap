// ============================================================
// TCP-WAF — TCP 连接层 Web 应用防火墙
// 职责：
//   1. 基于滑动窗口的请求速率限制
//   2. 本地回环地址（127.0.0.1/::1）与外部地址差异化策略
//   3. 两级预警：超限前警告 → 超限后短时封禁
//   4. 自动解封与恢复，避免误封导致服务不可用
// ============================================================

import { logAudit } from '../core/auditLogger.js'

// ===== 本地回环地址配置（宽松） =====
const LOOPBACK_MAX_CONNECTIONS_PER_IP = 50
const LOOPBACK_MAX_REQUESTS_PER_MINUTE = 500
const LOOPBACK_BLOCK_DURATION = 30 * 1000        // 30 秒
const LOOPBACK_WARN_THRESHOLD = 0.7               // 达到 70% 阈值时警告

// ===== 外部地址配置（严格） =====
const EXTERNAL_MAX_CONNECTIONS_PER_IP = 30
const EXTERNAL_MAX_REQUESTS_PER_MINUTE = 100
const EXTERNAL_BLOCK_DURATION = 15 * 60 * 1000    // 15 分钟
const EXTERNAL_WARN_THRESHOLD = 0.85

const WINDOW_MS = 60 * 1000

// ===== 辅助函数 =====
function isLoopback(ip) {
  if (!ip || ip === 'unknown') return false
  if (ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '127.0.0.1') return true
  if (ip.startsWith('127.')) return true
  if (ip === 'localhost') return true
  return false
}

function getConfig(ip) {
  if (isLoopback(ip)) {
    return {
      maxRequests: LOOPBACK_MAX_REQUESTS_PER_MINUTE,
      maxConnections: LOOPBACK_MAX_CONNECTIONS_PER_IP,
      blockDuration: LOOPBACK_BLOCK_DURATION,
      warnThreshold: LOOPBACK_WARN_THRESHOLD,
      type: 'loopback',
    }
  }
  return {
    maxRequests: EXTERNAL_MAX_REQUESTS_PER_MINUTE,
    maxConnections: EXTERNAL_MAX_CONNECTIONS_PER_IP,
    blockDuration: EXTERNAL_BLOCK_DURATION,
    warnThreshold: EXTERNAL_WARN_THRESHOLD,
    type: 'external',
  }
}

class ConnectionTracker {
  constructor() {
    // IP -> { sockets: Set<Socket>, history: number[], warned: boolean }
    this.connections = new Map()
    this.blockedIPs = new Map()
  }

  _cleanup(ip) {
    const now = Date.now()

    // 清理已过期封禁
    for (const [blockedIp, { blockUntil }] of this.blockedIPs.entries()) {
      if (blockUntil < now) {
        const entry = this.blockedIPs.get(blockedIp)
        const blockedDuration = entry ? Math.round((now - entry.blockedAt) / 1000) : 0
        console.log('')
        console.log(`\x1b[42m\x1b[30m ● TCP-WAF 解封 \x1b[0m \x1b[32mIP ${blockedIp} 封禁已到期，自动解封\x1b[0m`)
        console.log(`  原因: ${entry?.reason}  |  封禁持续: ${blockedDuration}秒`)
        this.blockedIPs.delete(blockedIp)
      }
    }

    // 清理该 IP 超过时间窗口的请求历史
    const entry = this.connections.get(ip)
    if (!entry) return

    entry.history = entry.history.filter(t => now - t < WINDOW_MS)

    // 清理已关闭的 socket
    for (const socket of entry.sockets) {
      if (socket.destroyed || socket.closed) {
        entry.sockets.delete(socket)
      }
    }

    if (entry.sockets.size === 0 && entry.history.length === 0) {
      this.connections.delete(ip)
    }
  }

  isBlocked(ip) {
    this._cleanup(ip)
    const entry = this.blockedIPs.get(ip)
    return !!(entry && entry.blockUntil > Date.now())
  }

  track(ip, socket) {
    this._cleanup(ip)

    const now = Date.now()
    const config = getConfig(ip)

    let entry = this.connections.get(ip)
    if (!entry) {
      entry = {
        sockets: new Set(),
        history: [],
        warned: false,
      }
      this.connections.set(ip, entry)
    }

    // 跟踪活跃的 TCP socket
    if (socket && !entry.sockets.has(socket)) {
      entry.sockets.add(socket)
      const removeSocket = () => entry.sockets.delete(socket)
      socket.once('close', removeSocket)
      socket.once('error', removeSocket)
    }

    // 请求速率统计
    entry.history.push(now)
    const requestCount = entry.history.length
    const activeConnections = entry.sockets.size

    // 一级预警：接近阈值时警告，但不禁封
    const warnAt = Math.floor(config.maxRequests * config.warnThreshold)
    if (requestCount >= warnAt && !entry.warned) {
      entry.warned = true
      const usage = Math.round((requestCount / config.maxRequests) * 100)
      console.log('')
      console.log(`\x1b[43m\x1b[30m ▲ TCP-WAF 预警 \x1b[0m \x1b[33m请求频率偏高\x1b[0m`)
      console.log(`  IP: ${ip}  |  类型: ${config.type === 'loopback' ? '本地回环' : '外部地址'}`)
      console.log(`  当前: ${requestCount} 次/分钟  |  上限: ${config.maxRequests} 次/分钟  |  使用率: ${usage}%`)
      console.log(`  活跃连接: ${activeConnections}  |  将达限流阈值，继续增加将被封禁`)
      logAudit({
        userId: 'system',
        action: 'tcp_waf_warning',
        ip,
        details: { type: config.type, requestCount, maxRequests: config.maxRequests, activeConnections },
        success: true,
      })
    }
    // 正常请求：在较高频率时显示简要跟踪信息
    else if (requestCount > 10 && requestCount % 50 === 0) {
      const usage = Math.round((requestCount / config.maxRequests) * 100)
      console.log(`  \x1b[90m[TCP-WAF] ${ip} 请求跟踪: ${requestCount}/${config.maxRequests} (${usage}%) 连接: ${activeConnections}\x1b[0m`)
    }
    // 开发模式：低频率时也显示追踪，让测试时能看到 WAF 在工作
    else if (process.env.NODE_ENV !== 'production' && requestCount <= 10) {
      const usage = Math.round((requestCount / config.maxRequests) * 100)
      const time = new Date().toLocaleTimeString('zh-CN')
      console.log(`\x1b[90m  [TCP-WAF] ${time} ${ip} ${requestCount}/${config.maxRequests} (${usage}%) 连接:${activeConnections} ${config.type === 'loopback' ? '本地' : '外部'}\x1b[0m`)
    }

    // 二级封禁：超过阈值时封禁
    if (requestCount > config.maxRequests) {
      this.blockIP(ip, `超过每分钟 ${config.maxRequests} 次请求（${config.type === 'loopback' ? '本地回环' : '外部地址'}）`, config.blockDuration)
      logAudit({
        userId: 'system',
        action: 'tcp_waf_blocked',
        ip,
        details: { type: config.type, requestCount, maxRequests: config.maxRequests, activeConnections, blockDuration: config.blockDuration },
        success: false,
      })
      return { blocked: true, reason: `每分钟请求过多（超过 ${config.maxRequests} 次）` }
    }

    // 连接数限制
    if (activeConnections > config.maxConnections) {
      this.blockIP(ip, `同时打开超过 ${config.maxConnections} 个连接（${config.type === 'loopback' ? '本地回环' : '外部地址'}）`, config.blockDuration)
      logAudit({
        userId: 'system',
        action: 'tcp_waf_blocked',
        ip,
        details: { type: config.type, activeConnections, maxConnections: config.maxConnections },
        success: false,
      })
      return { blocked: true, reason: `同时打开连接过多（超过 ${config.maxConnections} 个）` }
    }

    return { blocked: false }
  }

  blockIP(ip, reason, duration) {
    const blockUntil = Date.now() + duration
    this.blockedIPs.set(ip, {
      blockUntil,
      reason,
      blockedAt: Date.now(),
      duration,
    })
    const durationStr = duration >= 60000 ? `${Math.round(duration / 60000)}分钟` : `${duration / 1000}秒`
    console.log('')
    console.log(`\x1b[41m\x1b[37m ■ TCP-WAF 封禁 \x1b[0m \x1b[31mIP 已被封锁\x1b[0m`)
    console.log(`  IP: ${ip}`)
    console.log(`  原因: ${reason}`)
    console.log(`  时长: ${durationStr}  |  解封时间: ${new Date(blockUntil).toLocaleTimeString('zh-CN', { hour12: false })}`)
  }

  unblockIP(ip) {
    this.blockedIPs.delete(ip)
    console.log(`[TCP-WAF] IP ${ip} 已手动解封`)
  }

  getStats(ip) {
    this._cleanup(ip)
    const config = getConfig(ip)
    const entry = this.connections.get(ip)
    const blockedInfo = this.blockedIPs.get(ip)
    return {
      isBlocked: this.isBlocked(ip),
      ipType: config.type,
      activeConnections: entry?.sockets?.size || 0,
      requestsInWindow: entry?.history?.length || 0,
      maxRequestsPerMinute: config.maxRequests,
      usagePercent: entry?.history?.length ? Math.round((entry.history.length / config.maxRequests) * 100) : 0,
      blockedUntil: blockedInfo?.blockUntil || null,
      blockReason: blockedInfo?.reason || null,
    }
  }
}

const connectionTracker = new ConnectionTracker()

function getRealIP(req) {
  // 安全规范：WAF 必须使用直接连接 IP，禁止信任可被伪造的 X-Forwarded-For
  return req.socket?.remoteAddress ||
         req.connection?.remoteAddress ||
         'unknown'
}

function tcpWafMiddleware(req, res, next) {
  const ip = getRealIP(req)

  // 检查是否被封禁
  if (connectionTracker.isBlocked(ip)) {
    const entry = connectionTracker.blockedIPs.get(ip)
    const remainingSeconds = entry ? Math.ceil((entry.blockUntil - Date.now()) / 1000) : 0
    res.status(403).json({
      success: false,
      message: 'IP已被暂时封禁',
      reason: entry?.reason || '安全策略限制',
      remainingSeconds,
    })
    return
  }

  // 跟踪请求
  const result = connectionTracker.track(ip, req.socket)
  if (result.blocked) {
    res.status(403).json({
      success: false,
      message: '连接被安全策略拒绝',
      reason: result.reason,
    })
    return
  }

  next()
}

export {
  tcpWafMiddleware,
  connectionTracker,
  getRealIP,
  ConnectionTracker,
}