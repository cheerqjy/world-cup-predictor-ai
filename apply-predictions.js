const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const DB_PATH = path.join(__dirname, 'data', 'worldcup.db')

function poissonProb(k, lambda) {
  let p = Math.exp(-lambda)
  for (let i = 1; i <= k; i++) p *= lambda / i
  return p
}

function calcHalfFull(homeRank, awayRank, homeScore, awayScore) {
  const diff = (homeRank || 50) - (awayRank || 50)
  if (diff > 20) {
    if (homeScore > awayScore) return '负-胜'
    if (homeScore < awayScore) return '负-负'
    return '平-平'
  }
  if (diff < -20) {
    if (homeScore > awayScore) return '胜-胜'
    if (homeScore < awayScore) return '负-负'
    return '平-平'
  }
  if (homeScore > awayScore) return '平-胜'
  if (homeScore < awayScore) return '负-负'
  return '平-平'
}

function calcHalfTime(homeRank, awayRank, homeScore, awayScore) {
  const diff = (homeRank || 50) - (awayRank || 50)
  if (diff > 20) return { hh: 0, ha: 1 }
  if (diff < -20) return { hh: homeScore > awayScore ? 1 : 0, ha: 0 }
  return { hh: 0, ha: 0 }
}

function predict(homeRank, awayRank) {
  const diff = awayRank - homeRank
  const rankGap = Math.abs(diff)
  let hXg = 1.75 + diff / 45
  let aXg = 1.25 - diff / 45
  if (rankGap > 50) { hXg += 0.7; aXg -= 0.3 }
  else if (rankGap > 30) { hXg += 0.35; aXg -= 0.15 }
  else if (rankGap > 15) { hXg += 0.1; aXg -= 0.05 }
  hXg = Math.max(0.5, Math.min(5.0, hXg))
  aXg = Math.max(0.2, Math.min(3.5, aXg))

  const maxGoals = 8
  const scores = []
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      scores.push({ h, a, prob: poissonProb(h, hXg) * poissonProb(a, aXg) })
    }
  }
  scores.sort((x, y) => y.prob - x.prob)

  const totalProbs = {}
  for (const s of scores) {
    const t = s.h + s.a
    const key = t >= 7 ? '7+' : String(t)
    totalProbs[key] = (totalProbs[key] || 0) + s.prob
  }
  const sortedTotals = Object.entries(totalProbs).sort((a, b) => b[1] - a[1])
  const tg1 = sortedTotals[0][0]

  const top = scores[0]
  const drawBest = scores.find(s => s.h === s.a)
  const useDraw = drawBest && rankGap < 10 && top.h !== top.a &&
    (top.prob - drawBest.prob) / top.prob < 0.10
  const pick = useDraw ? drawBest : top

  return { homeScore: pick.h, awayScore: pick.a, tg1 }
}

async function main() {
  const SQL = await initSqlJs()
  const buffer = fs.readFileSync(DB_PATH)
  const db = new SQL.Database(buffer)

  const matches = db.exec(`
    SELECT m.id, ht.ranking, at.ranking
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.status != 'completed'
  `)

  if (!matches.length || !matches[0].values.length) {
    console.log('No matches to predict')
    db.close()
    return
  }

  const matchList = matches[0].values
  console.log(`Found ${matchList.length} matches to predict`)

  db.run('DELETE FROM predictions')

  let count = 0
  for (const m of matchList) {
    const [id, homeRank, awayRank] = m
    const pred = predict(homeRank || 50, awayRank || 50)
    const ht = calcHalfTime(homeRank, awayRank, pred.homeScore, pred.awayScore)
    const hf = calcHalfFull(homeRank, awayRank, pred.homeScore, pred.awayScore)

    const result1x2 = pred.homeScore > pred.awayScore ? '3' : pred.homeScore === pred.awayScore ? '1' : '0'
    const totalGoals = String(pred.homeScore + pred.awayScore)
    const confidence = Math.min(0.82, 0.22 + Math.min(1, Math.abs(homeRank - awayRank) / 50) * 0.38)

    db.run(`
      INSERT INTO predictions (match_id, home_score, away_score, half_home_score, half_away_score, result_1x2, total_goals, half_full_result, confidence, ai_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'empirical-v1')
    `, [id, pred.homeScore, pred.awayScore, ht.hh, ht.ha, result1x2, totalGoals, hf, Math.round(confidence * 100) / 100])

    count++
  }

  console.log(`Done! Predicted ${count} matches`)

  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
  console.log('Database saved')
  db.close()
}

main().catch(console.error)
