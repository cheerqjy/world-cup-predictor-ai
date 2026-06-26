const https = require('https')
const http = require('http')

function httpGet(url, timeout = 10000) {
  const mod = url.startsWith('https') ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.sporttery.cn/',
      },
      timeout,
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function main() {
  console.log('=== 测试体彩API ===\n')
  
  const urls = [
    'https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=1&pcOrWap=0&pageSize=50&matchBeginDate=2026-06-25&matchEndDate=2026-06-25',
    'https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=1&pcOrWap=0&pageSize=50',
  ]
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url.substring(0, 80)}...`)
      const text = await httpGet(url)
      const json = JSON.parse(text)
      
      console.log('响应状态:', json.value?.result)
      console.log('比赛数量:', json.value?.matchResultList?.length || 0)
      
      const list = json.value?.matchResultList || []
      if (list.length > 0) {
        console.log('\n比赛列表:')
        for (const m of list.slice(0, 10)) {
          console.log(`  ${m.matchDate || m.match_date} ${m.matchTime || m.match_time || '--:--'} ${m.homeTeam || m.home_team_name || '?'} vs ${m.awayTeam || m.away_team_name || '?'} [${m.matchStatus || m.status || '?'}]`)
        }
      }
      
      console.log('\n')
    } catch (e) {
      console.log(`  错误: ${e.message}\n`)
    }
  }
}

main().catch(console.error)
