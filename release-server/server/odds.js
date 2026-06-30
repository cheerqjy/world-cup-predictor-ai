const https = require('https')
const http = require('http')
const { getBeijingDateStr } = require('./tz')

let cachedOdds = null
let lastFetch = 0
const CACHE_TTL = 300000

function httpGet(url, timeout = 10000) {
  const mod = url.startsWith('https') ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.lottery.gov.cn/',
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

async function fetchCalculatorOdds() {
  const url = 'https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel='
  const text = await httpGet(url, 12000)
  const json = JSON.parse(text)
  if (json.errorCode !== '0' && json.errorCode !== 0) throw new Error(`API error: ${json.errorMessage}`)

  const leagues = json.value?.matchInfoList || []
  const odds = {}
  let totalMatches = 0
  let totalWithOdds = 0

  for (const lg of leagues) {
    for (const m of (lg.subMatchList || [])) {
      const home = m.homeTeamAllName || ''
      const away = m.awayTeamAllName || ''
      if (!home || !away) continue
      totalMatches++

      const pools = (m.poolList || []).map(p => p.poolCode)
      const hasHAD = pools.includes('HAD')
      const hasHHAD = pools.includes('HHAD')
      const hasHAFU = pools.includes('HAFU')
      const hasCRS = pools.includes('CRS')
      const hasTTG = pools.includes('TTG')

      const had = m.had || {}
      const hhad = m.hhad || {}

      const entry = {
        matchId: m.matchId,
        home, away,
        pools,
        hasHAD, hasHHAD, hasHAFU, hasCRS, hasTTG,
        sp3: parseFloat(had.h) || 0, sp1: parseFloat(had.d) || 0, sp0: parseFloat(had.a) || 0,
        rqNum: parseInt(hhad.goalLine) || 0,
        rqSp3: parseFloat(hhad.h) || 0, rqSp1: parseFloat(hhad.d) || 0, rqSp0: parseFloat(hhad.a) || 0,
        bqcOdds: {},
        scoreOdds: {},
        totalGoals: {},
      }

      const hafu = m.hafu || {}
      if (hasHAFU) {
        entry.bqcOdds = {
          '胜胜': parseFloat(hafu.hh) || 0, '胜平': parseFloat(hafu.hd) || 0, '胜负': parseFloat(hafu.ha) || 0,
          '平胜': parseFloat(hafu.dh) || 0, '平平': parseFloat(hafu.dd) || 0, '平负': parseFloat(hafu.da) || 0,
          '负胜': parseFloat(hafu.ah) || 0, '负平': parseFloat(hafu.ad) || 0, '负负': parseFloat(hafu.aa) || 0,
        }
      }

      if (entry.sp3 > 0 || entry.rqSp3 > 0) {
        odds[`${home}|${away}`] = entry
        totalWithOdds++
      }
    }
  }

  console.log(`[Odds] calculator API: ${totalMatches} 场, ${totalWithOdds} 场有赔率`)
  return odds
}

function fetchOdds(forceRefresh) {
  const now = Date.now()
  if (!forceRefresh && cachedOdds && now - lastFetch < CACHE_TTL) return cachedOdds

  try {
    return fetchCalculatorOdds().then(odds => {
      if (Object.keys(odds).length > 0) {
        cachedOdds = odds
        lastFetch = now
        try { saveOddsToDb(require('./db').getDb()) } catch (e) {}
        return odds
      }
      return cachedOdds || {}
    })
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

function poissonPmf(k, lambda) {
  let logP = k * Math.log(lambda) - lambda
  for (let i = 2; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

function generateSyntheticOdds(homeRank, awayRank, rqNum) {
  const diff = (awayRank || 50) - (homeRank || 50)
  let hXg = 1.55 + diff / 48
  let aXg = 1.15 - diff / 48
  if (diff > 40) { hXg += 0.3; aXg -= 0.15 }
  hXg = Math.max(0.3, hXg)
  aXg = Math.max(0.3, aXg)

  const maxGoals = 7
  const grid = []
  let pH = 0, pD = 0, pA = 0
  for (let i = 0; i <= maxGoals; i++) {
    grid[i] = []
    for (let j = 0; j <= maxGoals; j++) {
      const p = poissonPmf(i, hXg) * poissonPmf(j, aXg)
      grid[i][j] = p
      if (i > j) pH += p
      else if (i === j) pD += p
      else pA += p
    }
  }

  const margin = 0.08
  const toOdds = (p) => p > 0 ? Math.round((1 / p * (1 - margin)) * 100) / 100 : 0

  const sp3 = toOdds(pH), sp1 = toOdds(pD), sp0 = toOdds(pA)

  const handicap = rqNum || 0
  let rqH = 0, rqD = 0, rqA = 0
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const diff2 = (i + handicap) - j
      if (diff2 > 0) rqH += grid[i][j]
      else if (diff2 === 0) rqD += grid[i][j]
      else rqA += grid[i][j]
    }
  }
  const rqSp3 = toOdds(rqH), rqSp1 = toOdds(rqD), rqSp0 = toOdds(rqA)

  const bqcOdds = {}
  const bqcKeys = [['胜胜', 3, 3], ['胜平', 3, 1], ['胜负', 3, 0], ['平胜', 1, 3], ['平平', 1, 1], ['平负', 1, 0], ['负胜', 0, 3], ['负平', 0, 1], ['负负', 0, 0]]
  for (const [key, hs, as] of bqcKeys) bqcOdds[key] = toOdds(grid[hs][as])

  return {
    sp3, sp1, sp0,
    rqNum: handicap,
    rqSp3, rqSp1, rqSp0,
    bqcOdds,
    totalGoals: {},
    scoreOdds: {},
    hasHAD: true, hasHHAD: true, hasHAFU: true,
    _synthetic: true,
  }
}

function generateAllSyntheticOdds(matches) {
  const odds = {}
  for (const m of matches) {
    if (!m.home_name || !m.away_name) continue
    const key = `${m.home_name}|${m.away_name}`
    odds[key] = generateSyntheticOdds(m.home_ranking, m.away_ranking, m.rqNum || 0)
  }
  return odds
}

function saveOddsToDb(db) {
  if (!cachedOdds) return
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lottery_odds (match_id, home_name, away_name, pools, sp3, sp1, sp0, rq_num, rq_sp3, rq_sp1, rq_sp0, bqc_odds, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
  `)
  const tx = db.transaction(() => {
    for (const [key, o] of Object.entries(cachedOdds)) {
      stmt.run(o.matchId, o.home, o.away, (o.pools || []).join(','),
        o.sp3, o.sp1, o.sp0, o.rqNum, o.rqSp3, o.rqSp1, o.rqSp0,
        JSON.stringify(o.bqcOdds || {}))
    }
  })
  tx()
  console.log(`[Odds] 已保存 ${Object.keys(cachedOdds).length} 场赔率到数据库`)
}

function startOddsCron(db) {
  async function refresh() {
    try {
      await fetchOdds(true)
      if (cachedOdds) saveOddsToDb(db)
    } catch (e) { console.log(`[Odds] cron 刷新失败: ${e.message}`) }
  }
  refresh()
  setInterval(refresh, 2 * 60 * 1000)
  console.log('[Odds] 定时任务已启动 (每2分钟刷新)')
}

module.exports = { fetchOdds, getOddsForMatch, generateSyntheticOdds, generateAllSyntheticOdds, saveOddsToDb, startOddsCron }
