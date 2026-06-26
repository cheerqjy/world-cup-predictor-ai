const { getDb, saveDbSync } = require('./db')
const { getBeijingDateStr } = require('./tz')
const { scrapeRealScores } = require('./scraper')

async function fetchAndUpdate() {
  const db = getDb()
  const todayBj = getBeijingDateStr()
  console.log(`[Fetcher] === 数据更新开始 (${todayBj}) ===`)

  const scrapedScores = await scrapeRealScores()

  if (scrapedScores.length === 0) {
    console.log('[Fetcher] 无比分数据，跳过')
    return { updated: 0, errors: 0 }
  }

  // 建立比分查找表
  const scoreMap = {}
  for (const s of scrapedScores) {
    scoreMap[`${s.home}-${s.away}`] = s
  }

  let updated = 0
  let skipped = 0

  for (const score of scrapedScores) {
    const { home, away, homeScore, awayScore } = score

    const dbMatch = db.prepare(
      `SELECT id, status, home_score, away_score FROM matches WHERE home_team_id=? AND away_team_id=?`
    ).get(home, away)

    if (!dbMatch) {
      skipped++
      continue
    }

    // 如果比分有变化，更新
    if (dbMatch.home_score !== homeScore || dbMatch.away_score !== awayScore) {
      db.prepare(
        'UPDATE matches SET home_score=?, away_score=?, status=? WHERE id=?'
      ).run(homeScore, awayScore, 'completed', dbMatch.id)
      updated++
      console.log(`[Fetcher] ${home} ${dbMatch.home_score ?? '-'}-${dbMatch.away_score ?? '-'} → ${homeScore}-${awayScore}`)
    }
  }

  const totalCompleted = db.prepare("SELECT COUNT(*) as c FROM matches WHERE status='completed'").get().c
  console.log(`[Fetcher] 更新: ${updated} | 跳过: ${skipped} | 已完赛: ${totalCompleted}`)

  saveDbSync()
  console.log(`[Fetcher] === 数据更新结束 ===`)
  return { updated, errors: skipped }
}

module.exports = { fetchAndUpdate }
