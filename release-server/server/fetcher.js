const { getDb, saveDbSync } = require('./db')
const { getBeijingDateStr } = require('./tz')
const { scrapeRealScores } = require('./scraper')

async function fetchAndUpdate() {
  const db = getDb()
  const todayBj = getBeijingDateStr()
  console.log(`[Fetcher] === 数据更新开始 (${todayBj}) ===`)

  const scrapedData = await scrapeRealScores()

  if (scrapedData.length === 0) {
    console.log('[Fetcher] 无数据，跳过')
    return { updated: 0, errors: 0 }
  }

  let updated = 0
  let skipped = 0

  for (const item of scrapedData) {
    const { home, away, homeScore, awayScore, status, matchNumber } = item

    // 已完赛：更新比分
    if (status === 'completed') {
      const dbMatch = db.prepare(
        `SELECT id, status, home_score, away_score FROM matches WHERE home_team_id=? AND away_team_id=?`
      ).get(home, away)

      if (!dbMatch) { skipped++; continue }

      if (dbMatch.home_score !== homeScore || dbMatch.away_score !== awayScore) {
        db.prepare(
          'UPDATE matches SET home_score=?, away_score=?, status=? WHERE id=?'
        ).run(homeScore, awayScore, 'completed', dbMatch.id)
        updated++
        console.log(`[Fetcher] 比分: ${home} ${dbMatch.home_score ?? '-'}-${dbMatch.away_score ?? '-'} → ${homeScore}-${awayScore}`)
      }
    }

    // 未开赛但对阵已确定：更新淘汰赛对阵和时间
    if (status !== 'completed' && matchNumber && matchNumber >= 73) {
      const dbMatch = db.prepare(
        `SELECT id, home_team_id, away_team_id, match_date, match_time FROM matches WHERE match_number=?`
      ).get(matchNumber)

      if (dbMatch) {
        const needsUpdate = (!dbMatch.home_team_id && home) || (!dbMatch.away_team_id && away)
        if (needsUpdate) {
          db.prepare(
            'UPDATE matches SET home_team_id=COALESCE(?,home_team_id), away_team_id=COALESCE(?,away_team_id) WHERE id=?'
          ).run(home, away, dbMatch.id)
          updated++
          console.log(`[Fetcher] 对阵: #${matchNumber} ${home} vs ${away}`)
        }
      }
    }
  }

  const totalCompleted = db.prepare("SELECT COUNT(*) as c FROM matches WHERE status='completed'").get().c
  console.log(`[Fetcher] 更新: ${updated} | 跳过: ${skipped} | 已完赛: ${totalCompleted}`)

  saveDbSync()
  console.log(`[Fetcher] === 数据更新结束 ===`)
  return { updated, errors: skipped }
}

module.exports = { fetchAndUpdate }
