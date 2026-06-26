const initSqlJs = require('sql.js')
const fs = require('fs')

function queryAll(db, sql) {
  const results = []
  const stmt = db.prepare(sql)
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
  
  console.log('=== 预测统计 ===')
  
  const groupMatches = queryAll(db, "SELECT COUNT(*) as c FROM matches WHERE round='小组赛' AND home_team_id IS NOT NULL")
  console.log('小组赛总数:', groupMatches[0].c)
  
  const predictions = queryAll(db, "SELECT COUNT(*) as c FROM predictions")
  console.log('预测总数:', predictions[0].c)
  
  const completed = queryAll(db, "SELECT COUNT(*) as c FROM matches WHERE status='completed'")
  console.log('已完赛:', completed[0].c)
  
  const scheduled = queryAll(db, "SELECT COUNT(*) as c FROM matches WHERE status='scheduled' AND round='小组赛' AND home_team_id IS NOT NULL")
  console.log('未开赛小组赛:', scheduled[0].c)
  
  db.close()
}

main().catch(console.error)
