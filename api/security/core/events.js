import express from 'express'
import rateLimit from 'express-rate-limit'
import { logAudit, getClientIP } from './auditLogger.js'
import { autoIsolation } from '../isolation/autoIsolation.js'

const router = express.Router()

const eventsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
})

const pendingEvents = []
const MAX_PENDING = 1000

router.post('/', eventsLimiter, express.json({ limit: '100kb' }), (req, res) => {
  const events = req.body?.events
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ success: false, message: '无效的事件数据' })
  }

  const ip = getClientIP(req)
  const accepted = events.slice(0, 50).map(e => ({
    ...e,
    serverReceivedAt: Date.now(),
    ip,
  }))

  pendingEvents.push(...accepted)
  if (pendingEvents.length > MAX_PENDING) {
    pendingEvents.splice(0, pendingEvents.length - MAX_PENDING)
  }

  // 触发隔离扩展
  accepted.forEach(e => {
    if (e.severity === 'critical' || e.type === 'SOURCE_CODE_EXPOSED') {
      autoIsolation.recordJwtAnomaly?.(req, { frontendEvent: e.type, severity: e.severity })
    }
  })

  logAudit({ userId: 'frontend_sdk', action: 'security_event_report', ip, details: `收到 ${accepted.length} 条安全事件`, success: true })
  res.json({ success: true, accepted: accepted.length })
})

router.get('/pending', (req, res) => {
  res.json({ success: true, count: pendingEvents.length, events: pendingEvents.slice(-100) })
})

export { router as securityEventsRouter, pendingEvents }
