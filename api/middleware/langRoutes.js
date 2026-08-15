import { Router } from 'express'

export function createLangRouter(redis) {
  const router = Router()

  // GET /api/language/detect — 返回检测到的推荐语言
  router.get('/detect', (req, res) => {
    const meta = req.detectedLangMeta

    const alternatives = []
    if (meta.headerLang && meta.headerLang !== meta.language) {
      alternatives.push(meta.headerLang)
    }
    if (meta.geoLang && meta.geoLang !== meta.language) {
      alternatives.push(meta.geoLang)
    }

    res.json({
      language: meta.language,
      source: meta.source,
      fromCache: meta.fromCache,
      alternatives,
    })
  })

  // POST /api/language/preference — 用户主动选择语言
  router.post('/preference', async (req, res) => {
    const { language } = req.body
    if (!language) {
      res.status(400).json({ error: 'language is required' })
      return
    }

    const ip = req.detectedLangMeta?.ip
    if (!ip) {
      res.status(400).json({ error: 'Could not determine client IP' })
      return
    }

    try {
      const updatedMeta = {
        ...req.detectedLangMeta,
        language,
        source: 'user_preference',
        fromCache: false,
      }
      // 用户主动选择，缓存 7 天
      await redis.setEx(`lang:detect:${ip}`, 60 * 60 * 24 * 7, JSON.stringify(updatedMeta))
      res.json({ ok: true, language })
    } catch (err) {
      console.error('[lang-detect] Failed to save preference:', err)
      res.status(500).json({ error: 'Failed to save preference' })
    }
  })

  // DELETE /api/language/cache — 清除缓存（管理用）
  router.delete('/cache', async (req, res) => {
    const ip = req.detectedLangMeta?.ip
    if (!ip) {
      res.status(400).json({ error: 'Could not determine client IP' })
      return
    }
    await redis.del(`lang:detect:${ip}`).catch(() => {})
    res.json({ ok: true })
  })

  return router
}
