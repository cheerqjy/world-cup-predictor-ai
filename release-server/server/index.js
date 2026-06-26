const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const { initDb } = require('./db')
const { seed } = require('./seed')
const { startAutoRefresh } = require('./auto')
const { initTime, getBeijingDateStr } = require('./tz')

const matchesRouter = require('./routes/matches')
const predictionsRouter = require('./routes/predictions')
const championRouter = require('./routes/champion')
const recommendationsRouter = require('./routes/recommendations')

// 读取版本号
const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const SERVER_VERSION = pkg.version

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

  app.get('/api/version', (req, res) => {
    // 直接下载（暂注释）
    // const downloadsDir = path.join(__dirname, '..', 'downloads')
    // const downloads = []
    // const fs2 = require('fs')
    // if (fs2.existsSync(downloadsDir)) {
    //   const files = fs2.readdirSync(downloadsDir)
    //   for (const file of files) {
    //     if (file.endsWith('.exe')) {
    //       downloads.push({
    //         name: file,
    //         url: `/downloads/${file}`,
    //         size: fs2.statSync(path.join(downloadsDir, file)).size
    //       })
    //     }
    //   }
    // }

    // 网盘下载
    const downloads = [
      {
        name: 'WorldCupPredictor-1.5.1-Portable.exe',
        url: 'https://pan.baidu.com/s/1v9bN_AIZAvqUWX9yLFWPmw?pwd=avch',
        label: '百度网盘',
      },
      {
        name: 'WorldCupPredictor-1.5.1-Portable.exe',
        url: 'https://pan.quark.cn/s/bf9186d84ca7?pwd=ia7U',
        label: '夸克网盘',
      },
    ]

    res.json({
      version: SERVER_VERSION,
      buildTime: pkg.buildTime || null,
      downloads
    })
  })

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
    app.use('/downloads', express.static(path.join(__dirname, '..', 'downloads')))
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
