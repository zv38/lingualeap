/**
 * Sentry 前端错误监控配置
 * 仅在 VITE_SENTRY_DSN 环境变量设置时启用
 */
import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.log('[Sentry] 未配置 VITE_SENTRY_DSN，跳过初始化')
    }
    return false
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // 过滤掉已知的非关键错误
      const ignoredErrors = [
        'ResizeObserver loop limit exceeded',
        'NetworkError when attempting to fetch resource',
        'AbortError',
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

  return true
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, {
    extra: context,
  })
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' | 'fatal' | 'debug' | 'log' = 'info') {
  Sentry.captureMessage(message, level)
}

export { Sentry }