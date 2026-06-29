const https = require('https')

const TIMEOUT = 15000

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
  'Cameroon': 'cmr', 'Nigeria': 'ngr', 'Poland': 'pol', 'Serbia': 'srb',
  'Wales': 'wal', 'Peru': 'per', 'Chile': 'chi',
}

// 体彩官网 API（获取在售比赛和对阵）
const LOTTERY_URL = 'https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel='
// worldcup26.ir API（获取比分和淘汰赛对阵）
const WC_API_URL = 'https://worldcup26.ir/get/games'

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'WorldCupPredictor/1.0' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(new Error(`JSON解析失败: ${e.message}`)) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

function parseScorers(scorersStr) {
  if (!scorersStr || scorersStr === 'null') return []
  try {
    const cleaned = scorersStr.replace(/\\"/g, '"').replace(/"/g, '"')
    return JSON.parse(cleaned)
  } catch {
    return scorersStr.split(',').map(s => s.trim().replace(/"/g, ''))
  }
}

function countHalfGoals(scorersStr) {
  const scorers = parseScorers(scorersStr)
  let half = 0
  for (const s of scorers) {
    // 匹配完整时间表达式，如 45+2' 或 90+2' 或 23'
    const m = s.match(/(\d+(?:\+\d+)?)'/)
    if (m) {
      const minuteStr = m[1]
      // 含有 +N 表示伤停补时
      if (minuteStr.includes('+')) {
        const base = parseInt(minuteStr)
        // 45+N' = 上半场补时，90+N' = 下半场补时
        if (base <= 45) half++
      } else {
        // 纯数字，≤45 为上半场
        if (parseInt(minuteStr) <= 45) half++
      }
    }
  }
  return half
}

async function scrapeRealScores() {
  try {
    const data = await fetchJson(WC_API_URL)
    const games = data.games || []

    const results = []
    for (const game of games) {
      const home = TEAM_NAME_MAP[game.home_team_name_en]
      const away = TEAM_NAME_MAP[game.away_team_name_en]

      const isFinished = game.finished === 'TRUE'

      // 已完赛：返回比分+半场数据
      if (isFinished && home && away) {
        const homeHalf = countHalfGoals(game.home_scorers)
        const awayHalf = countHalfGoals(game.away_scorers)
        results.push({
          home,
          away,
          homeScore: parseInt(game.home_score) || 0,
          awayScore: parseInt(game.away_score) || 0,
          halfHomeScore: homeHalf,
          halfAwayScore: awayHalf,
          status: 'completed',
          source: 'worldcup26.ir',
          confidence: 0.9,
        })
      }

      // 淘汰赛对阵已确定（即使未开赛）
      // API 使用 game.id 作为比赛编号（对应我们的 match_number）
      if (home && away && !isFinished) {
        results.push({
          home,
          away,
          homeScore: null,
          awayScore: null,
          status: game.time_elapsed !== 'notstarted' ? 'live' : 'scheduled',
          matchNumber: parseInt(game.id),
          source: 'worldcup26.ir',
        })
      }
    }

    console.log(`[Scraper] worldcup26.ir: ${results.length} 场`)
    return results
  } catch (e) {
    console.log(`[Scraper] API失败: ${e.message}`)
    return []
  }
}

module.exports = { scrapeRealScores, TEAM_NAME_MAP }
