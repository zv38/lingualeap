// ===== Sentry 后端错误监控 =====
// 仅在环境变量 SENTRY_DSN 设置时启用
// 启动时静默跳过，不阻塞服务器启动

import * as Sentry from '@sentry/node'

let enabled = false

export function initSentry() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    console.log('[Sentry] 未配置 SENTRY_DSN 环境变量，跳过初始化')
    return false
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      beforeSend(event) {
        // 过滤掉已知的非关键错误
        const ignoredErrors = [
          'ECONNRESET',
          'EPIPE',
          'ETIMEDOUT',
        ]
        if (event.exception?.values?.[0]?.value) {
          for (const msg of ignoredErrors) {
            if (event.exception.values[0].value.includes(msg)) {
              return null
            }
          }
        }
        return event
      },
    })

    enabled = true
    console.log('[Sentry] 后端错误监控已初始化')
    return true
  } catch (err) {
    console.warn('[Sentry] 初始化失败:', err.message)
    return false
  }
}

export function captureError(error, context) {
  if (!enabled) return
  Sentry.captureException(error, {
    extra: context,
  })
}

export function captureMessage(message, level = 'info') {
  if (!enabled) return
  Sentry.captureMessage(message, level)
}

export function getRequestHandler() {
  if (!enabled) return (req, res, next) => next()
  return Sentry.Handlers.requestHandler()
}

export function getErrorHandler() {
  if (!enabled) return (err, req, res, next) => next(err)
  return Sentry.Handlers.errorHandler()
}

export { Sentry }