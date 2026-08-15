import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'

export default function NetworkStatus() {
  const [online, setOnline] = useState(true)
  const [showReconnected, setShowReconnected] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)

    const goOnline = () => {
      setOnline(true)
      setShowReconnected(true)
      setTimeout(() => setShowReconnected(false), 3000)
    }
    const goOffline = () => {
      setOnline(false)
      setShowReconnected(false)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          key="offline"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          className="fixed top-0 left-0 right-0 z-[10001] bg-[var(--error)]/90 backdrop-blur-md text-white text-sm py-2.5 px-4 flex items-center justify-center gap-2.5"
        >
          <WifiOff size={16} className="flex-shrink-0" />
          <span className="font-sans font-medium">网络已断开</span>
          <span className="text-white/70 text-xs font-sans">部分功能可能不可用</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-2 px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 transition-colors text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            重试
          </button>
        </motion.div>
      )}
      {showReconnected && online && (
        <motion.div
          key="reconnected"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          className="fixed top-0 left-0 right-0 z-[10001] bg-[var(--success)]/90 backdrop-blur-md text-white text-sm py-2.5 px-4 flex items-center justify-center gap-2"
        >
          <Wifi size={16} className="flex-shrink-0" />
          <span className="font-sans font-medium">网络已恢复</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}