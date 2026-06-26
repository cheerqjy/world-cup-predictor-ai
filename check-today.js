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
  
  console.log('=== 6月25日比赛状态（北京时间）===\n')
  
  const todayMatches = queryAll(db, `
    SELECT m.match_number, m.match_date, m.match_time, m.status, 
           m.home_score, m.away_score,
           ht.name_cn as home_name, ht.flag as home_flag,
           at.name_cn as away_name, at.flag as away_flag
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.match_date = '2026-06-25' AND m.home_team_id IS NOT NULL
    ORDER BY m.match_number
  `)
  
  for (const m of todayMatches) {
    const score = m.status === 'completed' ? `${m.home_score}:${m.away_score}` : 'vs'
    const time = m.match_time || '--:--'
    console.log(`#${m.match_number} ${time} [${m.status}] ${m.home_flag}${m.home_name} ${score} ${m.away_flag}${m.away_name}`)
  }
  
  console.log('\n=== API实时数据对比 ===\n')
  
  const https = require('https')
  const data = await new Promise((resolve, reject) => {
    https.get('https://worldcup26.ir/get/games', { timeout: 15000 }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
  
  const todayApi = data.games.filter(g => {
    const dateParts = g.local_date.split(' ')[0].split('/')
    return `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}` === '2026-06-25'
  })
  
  console.log('API返回的6月25日比赛:')
  for (const g of todayApi) {
    const finished = g.finished === 'TRUE'
    const score = finished ? `${g.home_score}:${g.away_score}` : 'vs'
    const status = finished ? '已完赛' : (g.time_elapsed === 'notstarted' ? '未开始' : '进行中')
    console.log(`#${g.id} [${status}] ${g.home_team_name_en} ${score} ${g.away_team_name_en}`)
  }
  
  db.close()
}

main().catch(console.error)
