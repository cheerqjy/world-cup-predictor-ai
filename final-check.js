const initSqlJs = require('sql.js')
const fs = require('fs')

function queryAll(db, sql) {
  const results = []
  const stmt = db.prepare(sql)
  while (stmt.step()) { results.push(stmt.getAsObject()) }
  stmt.free()
  return results
}

async function main() {
  const SQL = await initSqlJs()
  const buf = fs.readFileSync('C:/Users/EDY/Desktop/ai/world-cup-predictor/data/worldcup.db')
  const db = new SQL.Database(buf)
  
  console.log('=== 当前数据库状态 ===\n')
  
  // 已完赛统计
  const completed = queryAll(db, `
    SELECT match_date, COUNT(*) as c 
    FROM matches WHERE status='completed' 
    GROUP BY match_date ORDER BY match_date
  `)
  console.log('已完赛比赛:')
  let totalCompleted = 0
  for (const r of completed) {
    console.log(`  ${r.match_date}: ${r.c}场`)
    totalCompleted += r.c
  }
  console.log(`  总计: ${totalCompleted}场\n`)
  
  // 今日比赛
  console.log('6月25日比赛:')
  const today = queryAll(db, `
    SELECT m.match_number, m.match_time, m.status, m.home_score, m.away_score,
           ht.name_cn as home_name, ht.flag as home_flag,
           at.name_cn as away_name, at.flag as away_flag
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.match_date = '2026-06-25' AND m.home_team_id IS NOT NULL
    ORDER BY m.match_time
  `)
  for (const m of today) {
    const score = m.status === 'completed' ? `${m.home_score}:${m.away_score}` : '-:-'
    console.log(`  ${m.match_time || '--:--'} ${m.home_flag}${m.home_name} ${score} ${m.away_flag}${m.away_name} [${m.status}]`)
  }
  
  // 预测统计
  const predCount = queryAll(db, 'SELECT COUNT(*) as c FROM predictions')
  console.log(`\n预测数: ${predCount[0].c}`)
  
  db.close()
}

main().catch(console.error)
