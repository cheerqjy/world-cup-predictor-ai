const https = require('https')

const SC_URL = 'https://sportscore.com/football/competition/world/fifa-world-cup/kp3glrw7hwqdyjv/'
const FETCH_TIMEOUT = 15000

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.get({ 
      hostname: u.hostname, 
      path: u.pathname + u.search, 
      method: 'GET', 
      timeout: FETCH_TIMEOUT, 
      headers: { 'User-Agent': 'node', ...headers } 
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(d))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function decode(s) { 
  return s.replace(/&#x27;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)) 
}

function parseSportScore(html) {
  const rows = html.match(/<div class="comp-match-row">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) || []
  return rows.map(row => {
    const slug = row.match(/href="\/football\/match\/([^"]+)"/)
    const utc = row.match(/data-utc="([^"]+)"/)
    const st = row.match(/data-live="status"[^>]*>([^<]*)</)
    const links = [...row.matchAll(/<a[^>]*href="\/football\/team\/[^"]+"[^>]*title="[^"]*"[^>]*>([^<]+)<\/a>/g)]
    const hs = row.match(/data-live="home-score"[^>]*><b[^>]*>(\d+)<\/b><\/span>/)
    const as = row.match(/data-live="away-score"[^>]*><b[^>]*>(\d+)<\/b><\/span>/)
    if (!slug || !utc || links.length < 2) return null
    const statusText = st ? st[1].trim() : ''
    const homeScore = hs ? parseInt(hs[1]) : null
    const awayScore = as ? parseInt(as[1]) : null
    let status = 'scheduled'
    if (statusText === 'FT') status = 'completed'
    else if (statusText && !isNaN(statusText) && homeScore !== null) status = 'live'
    const utcStr = utc[1]
    let time = ''
    let date = utcStr.split('T')[0]
    if (utcStr.includes('T')) {
      const parts = utcStr.split('T')[1]
      const utcHour = parseInt(parts.substring(0, 2))
      const min = parts.substring(3, 5)
      const beijingHour = ((utcHour + 8) % 24 + 24) % 24
      time = String(beijingHour).padStart(2, '0') + ':' + min
      if (beijingHour < utcHour) {
        const d = new Date(date + 'T12:00:00')
        d.setDate(d.getDate() + 1)
        date = d.toISOString().split('T')[0]
      }
    }
    const home = decode(links[0][1].trim())
    const away = decode(links[1][1].trim())
    if (/^[A-Z]\d(\/[A-Z]\d)*$/.test(home) || /^[A-Z]\d(\/[A-Z]\d)*$/.test(away)) return null
    return { home, away, date, time, homeScore, awayScore, status, statusText }
  }).filter(Boolean)
}

async function main() {
  console.log('=== 测试 SportScore 数据源 ===\n')
  
  try {
    console.log('正在从 SportScore 获取数据...')
    const html = await fetchUrl(SC_URL, { 'User-Agent': 'Mozilla/5.0' })
    console.log(`获取到 ${html.length} 字节 HTML\n`)
    
    const matches = parseSportScore(html)
    console.log(`解析出 ${matches.length} 场比赛\n`)
    
    // 按日期分组统计
    const byDate = {}
    for (const m of matches) {
      if (!byDate[m.date]) byDate[m.date] = { completed: 0, scheduled: 0, live: 0 }
      byDate[m.date][m.status]++
    }
    
    console.log('日期分布:')
    const sortedDates = Object.keys(byDate).sort()
    for (const date of sortedDates) {
      const stats = byDate[date]
      console.log(`  ${date}: completed=${stats.completed} scheduled=${stats.scheduled} live=${stats.live}`)
    }
    
    console.log('\n已完赛比赛列表:')
    const completed = matches.filter(m => m.status === 'completed')
    for (const m of completed.slice(0, 20)) {
      console.log(`  ${m.date} ${m.home} ${m.homeScore}:${m.awayScore} ${m.away}`)
    }
    if (completed.length > 20) console.log(`  ... 还有 ${completed.length - 20} 场`)
    
    console.log(`\n总计: ${completed.length} 场已完赛`)
    
  } catch (err) {
    console.error('错误:', err.message)
    console.error(err.stack)
  }
}

main()
