// Test the free World Cup API
const https = require('https')

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error('JSON parse error'))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function main() {
  console.log('=== 测试免费世界杯API ===\n')
  
  const data = await fetchJson('https://worldcup26.ir/get/games')
  const games = data.games
  
  console.log(`总共 ${games.length} 场比赛\n`)
  
  // 统计已完成的比赛
  const completed = games.filter(g => g.finished === 'TRUE')
  const scheduled = games.filter(g => g.finished !== 'TRUE')
  
  console.log(`已完成: ${completed.length} 场`)
  console.log(`未开始/进行中: ${scheduled.length} 场\n`)
  
  // 按日期分组
  const byDate = {}
  for (const g of completed) {
    const date = g.local_date.split(' ')[0] // "06/11/2026" 格式
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(g)
  }
  
  console.log('已完成比赛按日期:')
  const sortedDates = Object.keys(byDate).sort((a, b) => {
    const [am, ad, ay] = a.split('/')
    const [bm, bd, by] = b.split('/')
    return new Date(`${ay}-${am}-${ad}`) - new Date(`${by}-${bm}-${bd}`)
  })
  
  for (const date of sortedDates) {
    const matches = byDate[date]
    const [m, d, y] = date.split('/')
    console.log(`  ${y}-${m}-${d}: ${matches.length} 场`)
    for (const g of matches) {
      console.log(`    #${g.id} ${g.home_team_name_en} ${g.home_score}:${g.away_score} ${g.away_team_name_en}`)
    }
  }
}

main().catch(console.error)
