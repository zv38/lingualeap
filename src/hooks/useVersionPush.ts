// ===== 热更新 SSE 推送监听 Hook =====
// 通过 SSE 实时接收后端推送的版本更新通知
// 替代传统的轮询方式，实现"后端更新→前端即时收到通知"

import { useEffect, useRef } from 'react'
import { startVersionCheck, stopVersionCheck, checkVersion } from '../utils/versionCheck'

let globalEventSource: EventSource | null = null
let globalReconnectTimer: ReturnType<typeof setTimeout> | null = null
let connectionAttempts = 0
const MAX_RECONNECT_DELAY = 30000 // 最大重连延迟 30 秒

type UpdateListener = (info: { version: string; buildTime: string; forceUpdate: boolean }) => void
let onVersionUpdate: UpdateListener | null = null

/**
 * 注册版本更新回调
 */
export function setOnVersionUpdate(callback: UpdateListener) {
  onVersionUpdate = callback
}

/**
 * 建立 SSE 连接
 */
function connectSSE() {
  // 如果已有连接，先关闭
  if (globalEventSource) {
    globalEventSource.close()
    globalEventSource = null
  }

  try {
    const es = new EventSource('/api/events', { withCredentials: true })
    globalEventSource = es

    es.addEventListener('connected', ((e: MessageEvent) => {
      const data = JSON.parse(e.data)
      console.log(`[SSE] 已连接 (clientId: ${data.clientId}, version: ${data.version})`)
      connectionAttempts = 0

      // 连接后检查版本是否最新
      checkVersion()
    }) as EventListener)

    // 版本更新事件 — 后端推送新版本时触发
    es.addEventListener('version_update', ((e: MessageEvent) => {
      const data = JSON.parse(e.data)
      console.log(`[SSE] 检测到新版本: ${data.version} (forceUpdate: ${data.forceUpdate})`)
      onVersionUpdate?.(data)
    }) as EventListener)

    // 错误处理 + 自动重连
    es.onerror = () => {
      es.close()
      globalEventSource = null

      // 指数退避重连
      const delay = Math.min(1000 * Math.pow(2, connectionAttempts), MAX_RECONNECT_DELAY)
      connectionAttempts++
      console.log(`[SSE] 连接断开，${delay}ms 后重连 (第 ${connectionAttempts} 次)`)

      if (globalReconnectTimer) clearTimeout(globalReconnectTimer)
      globalReconnectTimer = setTimeout(() => {
        connectSSE()
      }, delay)
    }
  } catch (err) {
    console.warn('[SSE] 连接失败:', err)
    // 兜底：使用轮询
    setTimeout(() => {
      if (!globalEventSource) connectSSE()
    }, 10000)
  }
}

/**
 * 关闭 SSE 连接
 */
function disconnectSSE() {
  if (globalEventSource) {
    globalEventSource.close()
    globalEventSource = null
  }
  if (globalReconnectTimer) {
    clearTimeout(globalReconnectTimer)
    globalReconnectTimer = null
  }
}

/**
 * 启动 SSE 监听
 */
export function startSSE() {
  // 如果已经连接，不重复创建
  if (globalEventSource) return
  connectSSE()
}

/**
 * 停止 SSE 监听
 */
export function stopSSE() {
  disconnectSSE()
}

/**
 * React Hook: 在组件中使用 SSE 版本推送
 * 自动管理连接生命周期，组件卸载时自动断开
 */
export function useVersionPush(onUpdate?: UpdateListener) {
  const savedCallback = useRef<UpdateListener | null>(null)

  // 保存最新的回调
  useEffect(() => {
    savedCallback.current = onUpdate || null
  }, [onUpdate])

  useEffect(() => {
    // 注册全局回调
    setOnVersionUpdate((info) => {
      savedCallback.current?.(info)
    })

    // 启动 SSE 连接
    startSSE()

    // 兜底：仍然保留轮询作为 fallback（每 10 分钟检查一次）
    startVersionCheck(10 * 60 * 1000)

    return () => {
      // 注意：不在这里断开 SSE，因为全局只需要一个连接
      // 只在应用卸载时断开
      stopVersionCheck()
    }
  }, [])

  return { reconnect: connectSSE }
}

/**
 * 应用级清理（在应用卸载时调用）
 */
export function cleanupSSE() {
  disconnectSSE()
  stopVersionCheck()
}