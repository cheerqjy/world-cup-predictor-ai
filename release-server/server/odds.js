const https = require('https')
const http = require('http')
const { getBeijingDateStr } = require('./tz')

let cachedOdds = null
let lastFetch = 0
const CACHE_TTL = 300000

function httpGet(url, timeout = 8000) {
  const mod = url.startsWith('https') ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

function parseOddsCsv(str) {
  if (!str) return []
  return str.split(',').map(Number).filter(v => v > 0)
}

async function trySporttery(matchDate) {
  const urls = [
    `https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=1&pcOrWap=0&pageSize=50&matchBeginDate=${matchDate}&matchEndDate=${matchDate}`,
    `https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=1&pcOrWap=0&pageSize=50`,
    `http://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=1&pcOrWap=0&pageSize=50`,
  ]
  for (const url of urls) {
    try {
      const text = await httpGet(url, 10000)
      const json = JSON.parse(text)
      const list = json?.value?.matchResultList || json?.value?.matches || []
      if (list.length === 0) continue

      const odds = {}
      for (const m of list) {
        const home = m.homeTeam || m.home_team_name || ''
        const away = m.awayTeam || m.away_team_name || ''
        if (!home || !away) continue
        const matchId = m.matchId || m.match_id
        odds[`${home}|${away}`] = { matchId, home, away }
      }
      if (Object.keys(odds).length > 0) {
        console.log(`[Odds] sporttery.cn 获取 ${Object.keys(odds).length} 场`)
        return odds
      }
    } catch (e) {
      console.log(`[Odds] ${url.includes('https') ? 'HTTPS' : 'HTTP'} ${e.message}`)
    }
  }
  return null
}

async function trySportteryOdds(matchId) {
  const urls = [
    `https://webapi.sporttery.cn/gateway/jc/football/getFixedBonusV1.qry?clientCode=3001&matchId=${matchId}`,
    `http://webapi.sporttery.cn/gateway/jc/football/getFixedBonusV1.qry?clientCode=3001&matchId=${matchId}`,
  ]
  for (const url of urls) {
    try {
      const text = await httpGet(url, 8000)
      const json = JSON.parse(text)
      const data = json?.value?.matchResultList?.[0] || {}
      if (data.sp3) return {
        sp3: parseFloat(data.sp3) || 0, sp1: parseFloat(data.sp1) || 0, sp0: parseFloat(data.sp0) || 0,
        rqNum: parseInt(data.rqNum) || 0,
        rqSp3: parseFloat(data.handicapSp3) || 0, rqSp1: parseFloat(data.handicapSp1) || 0, rqSp0: parseFloat(data.handicapSp0) || 0,
        totalGoals: parseTotalGoals(data.totalGoals),
        scoreOdds: parseScoreOdds(data.scoreOdds),
        bqcOdds: parseBqcOdds(data.halfFullOdds),
      }
    } catch { /* skip */ }
  }
  return null
}

function parseTotalGoals(str) {
  const map = {}
  if (!str) return map
  const parts = str.split('|')
  for (let i = 0; i < parts.length; i += 2) map[parts[i]] = parseFloat(parts[i + 1]) || 0
  return map
}

function parseScoreOdds(arr) {
  const map = {}
  if (!Array.isArray(arr)) return map
  for (const s of arr) map[s.option] = parseFloat(s.odds) || 0
  return map
}

function parseBqcOdds(arr) {
  const map = {}
  if (!Array.isArray(arr)) return map
  for (const b of arr) map[b.option] = parseFloat(b.odds) || 0
  return map
}

async function fetchOdds() {
  const now = Date.now()
  if (cachedOdds && now - lastFetch < CACHE_TTL) return cachedOdds

  const matchDate = getBeijingDateStr()

  try {
    const matchOdds = await trySporttery(matchDate)
    if (matchOdds) {
      const odds = {}
      for (const [key, info] of Object.entries(matchOdds)) {
        const detailed = await trySportteryOdds(info.matchId)
        if (detailed && detailed.sp3 > 0) odds[key] = detailed
      }
      if (Object.keys(odds).length > 0) {
        cachedOdds = odds
        lastFetch = now
        return odds
      }
    }
  } catch (e) { console.log(`[Odds] fetchOdds 异常: ${e.message}`) }

  return cachedOdds || {}
}

function getOddsForMatch(homeName, awayName) {
  if (!cachedOdds) return null
  const key = `${homeName}|${awayName}`
  if (cachedOdds[key]) return cachedOdds[key]
  const revKey = `${awayName}|${homeName}`
  if (cachedOdds[revKey]) return cachedOdds[revKey]
  for (const [k, v] of Object.entries(cachedOdds)) {
    const [h, a] = k.split('|')
    if ((h.includes(homeName) || homeName.includes(h)) && (a.includes(awayName) || awayName.includes(a))) return v
    if ((h.includes(awayName) || awayName.includes(h)) && (a.includes(homeName) || homeName.includes(a))) return v
  }
  return null
}

module.exports = { fetchOdds, getOddsForMatch }
