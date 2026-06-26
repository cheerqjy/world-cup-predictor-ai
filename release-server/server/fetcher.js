const https = require('https')
const { getDb, saveDbSync } = require('./db')
const { getBeijingDateStr, utcToBeijingDate, utcToBeijingTime, isFutureDate } = require('./tz')

// 免费世界杯2026 API - 完整数据，无需API密钥
const WC_API_URL = 'https://worldcup26.ir/get/games'
const FETCH_TIMEOUT = 15000

// 体育场ID -> 场地本地时间转北京时间的小时偏移量
// 2026世界杯场馆时区:
//   墨西哥 (CST UTC-6): +14小时
//   美国中部 (CDT UTC-5): +13小时
//   美国东部/加拿大多伦多 (EDT UTC-4): +12小时
//   美国西部/加拿大温哥华 (PDT UTC-7): +15小时
const STADIUM_TO_BEIJING_OFFSET = {
  '1': 14,   // Mexico City (CST)
  '2': 14,   // Guadalajara (CST)
  '3': 14,   // Monterrey (CST)
  '4': 13,   // Dallas (CDT)
  '5': 13,   // Houston (CDT)
  '6': 13,   // Kansas City (CDT)
  '7': 12,   // Atlanta (EDT)
  '8': 12,   // Miami (EDT)
  '9': 12,   // Boston (EDT)
  '10': 12,  // Philadelphia (EDT)
  '11': 12,  // New York/New Jersey (EDT)
  '12': 12,  // Toronto (EDT)
  '13': 15,  // Vancouver (PDT)
  '14': 15,  // Seattle (PDT)
  '15': 15,  // San Francisco (PDT)
  '16': 15,  // Los Angeles (PDT)
}

// 队名映射 (英文 -> 数据库ID)
const TEAM_NAME_MAP = {
  'Mexico': 'mex', 'South Africa': 'rsa', 'South Korea': 'kor', 'Korea Republic': 'kor',
  'Czechia': 'cze', 'Czech Republic': 'cze', 'Canada': 'can',
  'Bosnia and Herzegovina': 'bih', 'Bosnia & Herzegovina': 'bih',
  'Qatar': 'qat', 'Switzerland': 'sui', 'Brazil': 'bra', 'Morocco': 'mar',
  'Haiti': 'hai', 'Scotland': 'sco', 'United States': 'usa', 'USA': 'usa',
  'Paraguay': 'par', 'Australia': 'aus', 'Türkiye': 'tur', 'Turkiye': 'tur', 'Turkey': 'tur',
  'Germany': 'ger', 'Curaçao': 'cuw', 'Curacao': 'cuw',
  "Côte d'Ivoire": 'civ', "Cote d'Ivoire": 'civ', 'Ivory Coast': 'civ',
  'Ecuador': 'ecu', 'Netherlands': 'ned', 'Japan': 'jpn', 'Sweden': 'swe',
  'Tunisia': 'tun', 'Belgium': 'bel', 'Egypt': 'egy',
  'Iran': 'irn', 'IR Iran': 'irn', 'New Zealand': 'nzl',
  'Spain': 'esp', 'Cape Verde': 'cpv', 'Cabo Verde': 'cpv',
  'Saudi Arabia': 'ksa', 'Uruguay': 'uru',
  'France': 'fra', 'Senegal': 'sen', 'Iraq': 'irq', 'Norway': 'nor',
  'Argentina': 'arg', 'Algeria': 'alg', 'Austria': 'aut', 'Jordan': 'jor',
  'Portugal': 'por', 'DR Congo': 'cod', 'Democratic Republic of the Congo': 'cod',
  'Uzbekistan': 'uzb', 'Colombia': 'col',
  'England': 'eng', 'Croatia': 'cro', 'Ghana': 'gha', 'Panama': 'pan',
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      timeout: FETCH_TIMEOUT,
      headers: { 'User-Agent': 'WorldCupPredictor/1.0' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`JSON解析失败: ${e.message}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// 将API日期格式 "06/11/2026 13:00" 转为北京时间
function parseApiDate(localDateStr, stadiumId) {
  if (!localDateStr) return { date: '', time: '' }
  
  const parts = localDateStr.split(' ')
  if (parts.length < 2) return { date: parts[0] || '', time: '' }
  
  const datePart = parts[0] // "06/11/2026"
  const timePart = parts[1] // "13:00"
  
  // 转换日期格式: "06/11/2026" -> "2026-06-11"
  const [month, day, year] = datePart.split('/')
  const venueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  
  // 获取该体育场到北京时间的偏移量
  const offsetHours = STADIUM_TO_BEIJING_OFFSET[String(stadiumId)] || 13 // 默认CDT
  
  // 解析场地本地时间
  const [hours, minutes] = timePart.split(':').map(Number)
  
  // 计算北京时间
  let beijingHours = hours + offsetHours
  let beijingDate = venueDate
  if (beijingHours >= 24) {
    beijingHours -= 24
    // 日期加一天
    const d = new Date(venueDate + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    beijingDate = d.toISOString().split('T')[0]
  }
  
  const beijingTime = String(beijingHours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0')
  
  return { date: beijingDate, time: beijingTime }
}

async function fetchAndUpdate() {
  const db = getDb()
  console.log('[Fetcher] 从免费API获取世界杯数据...')

  try {
    const data = await fetchJson(WC_API_URL)
    const games = data.games || []
    console.log(`[Fetcher] 获取到 ${games.length} 场比赛`)

    const todayBj = getBeijingDateStr()
    console.log(`[Fetcher] 当前北京时间: ${todayBj}`)

    let updated = 0
    let inserted = 0
    let skipped = 0

    for (const game of games) {
      const apiId = parseInt(game.id)
      if (!apiId) continue

      const homeTeamId = TEAM_NAME_MAP[game.home_team_name_en]
      const awayTeamId = TEAM_NAME_MAP[game.away_team_name_en]

      // 淘汰赛或未识别的队伍跳过
      if (!homeTeamId || !awayTeamId) {
        skipped++
        continue
      }

      const { date: matchDate, time: matchTime } = parseApiDate(game.local_date, game.stadium_id)
      const isFinished = game.finished === 'TRUE'
      const homeScore = isFinished ? parseInt(game.home_score) : null
      const awayScore = isFinished ? parseInt(game.away_score) : null

      // 确定状态
      let status = 'scheduled'
      if (isFinished) {
        // 关键保护：不将未来日期的比赛标记为已完成
        if (isFutureDate(matchDate)) {
          console.log(`[Fetcher] 跳过未来比赛: ${game.home_team_name_en} vs ${game.away_team_name_en} (${matchDate})`)
          continue
        }
        status = 'completed'
      } else if (game.time_elapsed && game.time_elapsed !== 'notstarted') {
        status = 'live'
      }

      // 查找现有比赛 (小组赛)
      const existing = db.prepare(
        `SELECT id, status FROM matches WHERE round='小组赛' AND home_team_id=? AND away_team_id=?`
      ).get(homeTeamId, awayTeamId)

      const existing2 = db.prepare(
        `SELECT id, status FROM matches WHERE round='小组赛' AND home_team_id=? AND away_team_id=?`
      ).get(awayTeamId, homeTeamId)

      const match = existing || existing2
      const matchId = match ? match.id : null

      if (matchId) {
        // 更新现有比赛
        if (status === 'completed' && match.status !== 'completed') {
          db.prepare(
            `UPDATE matches SET home_score=?, away_score=?, status=?, match_date=?, match_time=? WHERE id=?`
          ).run(homeScore, awayScore, status, matchDate, matchTime, matchId)
          updated++
        } else if (matchDate && matchTime) {
          // 更新日期和时间
          db.prepare(
            `UPDATE matches SET match_date=?, match_time=? WHERE id=?`
          ).run(matchDate, matchTime, matchId)
        }
      }
    }

    const totalCompleted = db.prepare("SELECT COUNT(*) as c FROM matches WHERE status='completed'").get().c
    console.log(`[Fetcher] 更新: ${updated} | 跳过: ${skipped} | 总已完赛: ${totalCompleted}`)

    saveDbSync()
    return { updated, errors: skipped }

  } catch (err) {
    console.error(`[Fetcher] 获取数据失败: ${err.message}`)
    return { updated: 0, errors: 1 }
  }
}

module.exports = { fetchAndUpdate }
