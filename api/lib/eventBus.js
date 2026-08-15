// ===== SSE 事件总线 — 服务端主动推送 =====
// 支持后端向前端实时推送版本更新、安全事件、系统通知等

import { getClientIP } from '../security/core/auditLogger.js'

// 所有活跃的 SSE 连接
const clients = new Map() // clientId -> { res, userId, ip, connectedAt, lastEventId }

let clientIdCounter = 0

// 当前服务版本（启动时从 package.json 读取）
let currentVersion = process.env.npm_package_version || '1.0.0'
let currentBuildTime = process.env.BUILD_TIME || new Date().toISOString()

/**
 * 设置当前版本信息
 */
export function setVersionInfo(version, buildTime) {
  currentVersion = version || currentVersion
  currentBuildTime = buildTime || currentBuildTime
}

/**
 * 获取当前版本信息
 */
export function getVersionInfo() {
  return { version: currentVersion, buildTime: currentBuildTime }
}

/**
 * 创建 SSE 事件端点中间件
 * 用法: app.get('/api/events', sseMiddleware)
 */
export function sseMiddleware(req, res) {
  const clientId = ++clientIdCounter

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁用 nginx 缓冲
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  })

  // 发送初始连接事件
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, version: currentVersion, buildTime: currentBuildTime })}\n\n`)

  // 发送心跳（每 30 秒）
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`:heartbeat ${Date.now()}\n\n`)
    } catch {
      clearInterval(heartbeatTimer)
    }
  }, 30000)

  // 注册客户端
  const client = {
    res,
    userId: req.tokenPayload?.userId || null,
    ip: getClientIP(req),
    connectedAt: new Date().toISOString(),
    lastEventId: null,
    heartbeatTimer,
  }
  clients.set(clientId, client)

  console.log(`[SSE] 客户端 ${clientId} 已连接 (IP: ${client.ip})`)

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(heartbeatTimer)
    clients.delete(clientId)
    console.log(`[SSE] 客户端 ${clientId} 已断开，当前连接数: ${clients.size}`)
  })

  // 如果有新版本，立即推送版本更新事件（适用于刚部署后客户端重连）
  const localVersion = req.headers['x-app-version']
  if (localVersion && localVersion !== currentVersion) {
    setTimeout(() => {
      broadcastVersionUpdate({ forceUpdate: false })
    }, 1000)
  }
}

/**
 * 向所有客户端广播事件
 * @param {string} event - 事件名
 * @param {*} data - 事件数据
 * @param {object} options
 * @param {string} [options.userId] - 仅推送给特定用户
 * @param {number} [options.retry] - 客户端重连间隔(ms)
 */
export function broadcast(event, data, options = {}) {
  const payload = JSON.stringify(data)
  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let sent = 0

  for (const [clientId, client] of clients) {
    // 如果指定了 userId，只推送给该用户
    if (options.userId && client.userId !== options.userId) continue

    try {
      if (options.retry) {
        client.res.write(`retry: ${options.retry}\n`)
      }
      client.res.write(`id: ${eventId}\nevent: ${event}\ndata: ${payload}\n\n`)
      client.lastEventId = eventId
      sent++
    } catch (err) {
      // 写失败，关闭并清理
      clearInterval(client.heartbeatTimer)
      clients.delete(clientId)
      console.warn(`[SSE] 客户端 ${clientId} 写入失败，已移除:`, err.message)
    }
  }

  if (sent > 0) {
    console.log(`[SSE] 广播事件 "${event}" 到 ${sent} 个客户端, 当前连接: ${clients.size}`)
  }
  return sent
}

/**
 * 广播版本更新通知（携带更新详情）
 * @param {object} options
 * @param {boolean} [options.forceUpdate] - 是否强制更新
 * @param {Array} [options.changelog] - 更新详情列表
 */
export function broadcastVersionUpdate(options = {}) {
  broadcast('version_update', {
    version: currentVersion,
    buildTime: currentBuildTime,
    forceUpdate: !!options.forceUpdate,
    changelog: options.changelog || [],
    timestamp: new Date().toISOString(),
  })
}

/**
 * 延迟广播版本更新（用于服务器重启后，等待前端 SSE 重连再推送）
 * 在 retryInterval 时间内，每隔 1 秒尝试一次，直到广播成功或超时
 * @param {object} options
 * @param {number} [options.maxRetries=10] - 最大重试次数
 * @param {number} [options.retryDelay=1000] - 重试间隔(ms)
 * @param {Array} [options.changelog] - 更新详情
 */
export function delayedBroadcastVersionUpdate(options = {}) {
  const maxRetries = options.maxRetries || 10
  const retryDelay = options.retryDelay || 1000
  let retries = 0

  const tryBroadcast = () => {
    const sent = broadcast('version_update', {
      version: currentVersion,
      buildTime: currentBuildTime,
      forceUpdate: !!options.forceUpdate,
      changelog: options.changelog || [],
      timestamp: new Date().toISOString(),
    })

    if (sent > 0) {
      console.log(`[HMR] 延迟广播成功: ${currentVersion}，推送到 ${sent} 个客户端`)
      return
    }

    retries++
    if (retries < maxRetries) {
      console.log(`[HMR] 等待客户端连接... (${retries}/${maxRetries})`)
      setTimeout(tryBroadcast, retryDelay)
    } else {
      console.log(`[HMR] 延迟广播结束: 无客户端连接（${maxRetries} 次重试后放弃）`)
    }
  }

  setTimeout(tryBroadcast, retryDelay)
}

/**
 * 获取当前连接统计
 */
export function getSSEStats() {
  return {
    totalClients: clients.size,
    version: currentVersion,
    buildTime: currentBuildTime,
    clients: Array.from(clients.entries()).map(([id, c]) => ({
      id,
      userId: c.userId,
      ip: c.ip,
      connectedAt: c.connectedAt,
      lastEventId: c.lastEventId,
    })),
  }
}

/**
 * 清理所有连接
 */
export function closeAll() {
  for (const [clientId, client] of clients) {
    try {
      clearInterval(client.heartbeatTimer)
      client.res.end()
    } catch {}
    clients.delete(clientId)
  }
  console.log('[SSE] 所有客户端连接已关闭')
}