import express from 'express'
import { pendingEvents } from '../core/events.js'
import { analyzeEvents } from './analyzer.js'

export function createSecurityAdminRouter({ requireAdmin }) {
  const router = express.Router()

  router.get('/summary', requireAdmin, (req, res) => {
    const stats = analyzeEvents(pendingEvents)
    res.json({ success: true, data: stats })
  })

  router.get('/events', requireAdmin, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500)
    res.json({ success: true, data: pendingEvents.slice(-limit) })
  })

  return router
}
