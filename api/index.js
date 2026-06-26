const express = require('express')
const cors = require('cors')
const path = require('path')

async function createApp() {
  const { initDb } = require('../server/db')
  const { seed } = require('../server/seed')
  const { autoCycle } = require('../server/auto')

  await initDb()
  await seed()

  const app = express()
  app.use(cors())
  app.use(express.json())

  // 健康检查
  app.get('/api/health', (req, res) => {
    try {
      const { getDb } = require('../server/db')
      const db = getDb()
      const matchCount = db.prepare('SELECT COUNT(*) as cnt FROM matches').get()
      res.json({ status: 'ok', matches: matchCount.cnt, uptime: process.uptime() })
    } catch (e) {
      res.json({ status: 'initializing', message: e.message })
    }
  })

  app.use('/api/matches', require('../server/routes/matches'))
  app.use('/api/predictions', require('../server/routes/predictions'))
  app.use('/api/champion', require('../server/routes/champion'))
  app.use('/api/recommendations', require('../server/routes/recommendations'))

  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })

  // Auto-predict on cold start (non-blocking)
  autoCycle().catch(err => console.error('[Vercel] Auto cycle error:', err))

  return app
}

let appPromise = null

module.exports = async (req, res) => {
  if (!appPromise) appPromise = createApp()
  const app = await appPromise
  return app(req, res)
}
