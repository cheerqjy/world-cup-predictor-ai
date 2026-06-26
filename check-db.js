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

function queryOne(db, sql) {
  const results = queryAll(db, sql)
  return results[0] || {}
}

async function checkDb() {
  const SQL = await initSqlJs()
  
  // Check local database
  const localBuf = fs.readFileSync('C:/Users/EDY/Desktop/ai/world-cup-predictor/data/worldcup.db')
  const localDb = new SQL.Database(localBuf)
  
  console.log('=== 本地数据库 ===')
  const localCompleted = queryAll(localDb, "SELECT match_date, COUNT(*) as c FROM matches WHERE status='completed' GROUP BY match_date ORDER BY match_date")
  localCompleted.forEach(r => console.log(`  ${r.match_date}: ${r.c} matches`))
  const localTotal = queryOne(localDb, "SELECT COUNT(*) as c FROM matches WHERE status='completed'")
  console.log(`  Total completed: ${localTotal.c}`)
  const localPred = queryOne(localDb, "SELECT COUNT(*) as c FROM predictions")
  console.log(`  Total predictions: ${localPred.c}`)
  localDb.close()
  
  // Check server database (release-server)
  const serverBuf = fs.readFileSync('C:/Users/EDY/Desktop/ai/world-cup-predictor/release-server/data/worldcup.db')
  const serverDb = new SQL.Database(serverBuf)
  
  console.log('\n=== release-server 数据库 ===')
  const serverCompleted = queryAll(serverDb, "SELECT match_date, COUNT(*) as c FROM matches WHERE status='completed' GROUP BY match_date ORDER BY match_date")
  serverCompleted.forEach(r => console.log(`  ${r.match_date}: ${r.c} matches`))
  const serverTotal = queryOne(serverDb, "SELECT COUNT(*) as c FROM matches WHERE status='completed'")
  console.log(`  Total completed: ${serverTotal.c}`)
  const serverPred = queryOne(serverDb, "SELECT COUNT(*) as c FROM predictions")
  console.log(`  Total predictions: ${serverPred.c}`)
  serverDb.close()
}

checkDb().catch(console.error)
