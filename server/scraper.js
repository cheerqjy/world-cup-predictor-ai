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

async function scrapeRealScores() {
  try {
    const data = await fetchJson(WC_API_URL)
    const games = data.games || []

    const results = []
    for (const game of games) {
      const home = TEAM_NAME_MAP[game.home_team_name_en]
      const away = TEAM_NAME_MAP[game.away_team_name_en]

      const isFinished = game.finished === 'TRUE'

      // 已完赛：返回比分
      if (isFinished && home && away) {
        results.push({
          home,
          away,
          homeScore: parseInt(game.home_score) || 0,
          awayScore: parseInt(game.away_score) || 0,
          status: 'completed',
          source: 'worldcup26.ir',
          confidence: 0.9,
        })
      }

      // 淘汰赛对阵已确定（即使未开赛）
      if (home && away && !isFinished) {
        results.push({
          home,
          away,
          homeScore: null,
          awayScore: null,
          status: game.time_elapsed !== 'notstarted' ? 'live' : 'scheduled',
          matchNumber: parseInt(game.game_number),
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
