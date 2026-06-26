const initSqlJs = require('sql.js')
const fs = require('fs')

function queryAll(db, sql, params) {
  const results = []
  const stmt = db.prepare(sql)
  if (params) stmt.bind(params)
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

async function main() {
  const SQL = await initSqlJs()
  const buf = fs.readFileSync('C:/Users/EDY/Desktop/ai/world-cup-predictor/data/worldcup.db')
  const db = new SQL.Database(buf)
  
  console.log('=== 6月25日及之后的比赛 ===')
  const matches = queryAll(db, "SELECT match_number, match_date, match_time, status, home_team_id, away_team_id FROM matches WHERE match_date >= '2026-06-25' ORDER BY match_date ASC, match_number ASC")
  
  for (const m of matches) {
    console.log(`#${m.match_number} ${m.match_date} ${m.match_time || '--:--'} [${m.status}] ${m.home_team_id} vs ${m.away_team_id}`)
  }
  
  console.log('\n=== 预测统计 ===')
  const predStats = queryAll(db, "SELECT m.match_date, COUNT(p.id) as pred_count FROM matches m LEFT JOIN predictions p ON p.match_id = m.id WHERE m.match_date >= '2026-06-25' GROUP BY m.match_date ORDER BY m.match_date")
  for (const r of predStats) {
    console.log(`${r.match_date}: ${r.pred_count} predictions`)
  }
  
  db.close()
}

main().catch(console.error)
