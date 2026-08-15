import { Component, ReactNode, ErrorInfo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Sentry from '@sentry/react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
              className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] border border-[var(--border-primary)]/50 flex items-center justify-center shadow-sm"
            >
              <motion.svg
                className="w-8 h-8 text-[var(--text-muted)]"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </motion.svg>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-center space-y-2"
            >
              <h2 className="font-serif text-xl text-[var(--text-primary)]">页面出现异常</h2>
              <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto leading-relaxed">
                页面遇到了意外错误，可能是网络问题或临时的系统故障
              </p>
              {this.state.error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3"
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--error)]/5 border border-[var(--error)]/10">
                    <span className="text-[10px] text-[var(--error)]/70 font-mono max-w-[300px] truncate">
                      {this.state.error.message || '未知错误'}
                    </span>
                  </div>
                </motion.div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="flex items-center gap-3"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={this.handleRetry}
                className="px-6 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
              >
                重试
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={this.handleReload}
                className="px-6 py-2.5 rounded-2xl border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-elevated)]/50 transition-colors"
              >
                刷新页面
              </motion.button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-[10px] text-[var(--text-muted)] font-sans"
            >
              如果问题持续出现，请通过 Bug 反馈页面告知我们
            </motion.p>
          </motion.div>
        </AnimatePresence>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary