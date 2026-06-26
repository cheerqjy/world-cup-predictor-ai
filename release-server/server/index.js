const express = require('express')
const cors = require('cors')
const path = require('path')
const { initDb } = require('./db')
const { seed } = require('./seed')
const { startAutoRefresh } = require('./auto')
const { initTime, getBeijingDateStr } = require('./tz')

const matchesRouter = require('./routes/matches')
const predictionsRouter = require('./routes/predictions')
const championRouter = require('./routes/champion')
const recommendationsRouter = require('./routes/recommendations')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

async function main() {
  // 初始化网络时间同步
  console.log('[Server] 正在同步网络时间...')
  await initTime()
  console.log(`[Server] 当前北京时间: ${getBeijingDateStr()}`)

  await initDb()
  await seed()

  app.get('/api/health', (req, res) => res.json({ 
    status: 'ok',
    date: getBeijingDateStr(),
    time: new Date().toISOString()
  }))

  app.get('/api/time', (req, res) => res.json({
    beijing: getBeijingDateStr(),
    utc: new Date().toISOString(),
    serverTime: Date.now()
  }))

  app.use('/api/matches', matchesRouter)
  app.use('/api/predictions', predictionsRouter)
  app.use('/api/champion', championRouter)
  app.use('/api/recommendations', recommendationsRouter)

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'dist')))
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
    })
  }

  app.listen(PORT, () => {
    console.log(`[Server] 服务器运行在 http://localhost:${PORT}`)
    console.log(`[Server] 外网访问: http://120.48.126.193:${PORT}`)
    startAutoRefresh(2)
  })
}

main().catch(err => {
  console.error('启动失败:', err)
  process.exit(1)
})

// Export for Vercel serverless
module.exports = app
