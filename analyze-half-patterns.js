const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const DB_PATH = path.join(__dirname, 'data', 'worldcup.db')

async function main() {
  const SQL = await initSqlJs()
  const buffer = fs.readFileSync(DB_PATH)
  const db = new SQL.Database(buffer)

  // 获取所有有半场数据的已完成比赛
  const matches = db.exec(`
    SELECT m.id, m.match_number, m.home_score, m.away_score, m.half_home_score, m.half_away_score,
      ht.name_cn as home_name, ht.ranking as home_rank,
      at.name_cn as away_name, at.ranking as away_rank
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.status='completed' AND m.half_home_score IS NOT NULL
    ORDER BY m.match_number
  `)

  if (!matches.length) {
    console.log('No matches with half-time data')
    db.close()
    return
  }

  const data = matches[0].values
  console.log(`Total matches with half-time data: ${data.length}\n`)

  // 分析半全场模式
  const patterns = {}
  const rankGapPatterns = {}

  for (const row of data) {
    const [id, mn, h, a, hh, ha, hn, hr, an, ar] = row
    const rankGap = (hr || 50) - (ar || 50) // 正数=主队强

    // 半场结果
    const halfResult = hh > ha ? '胜' : hh < ha ? '负' : '平'
    const fullResult = h > a ? '胜' : h < a ? '负' : '平'
    const pattern = `${halfResult}${fullResult}`

    patterns[pattern] = (patterns[pattern] || 0) + 1

    // 按排名差距分组
    const gapKey = rankGap > 20 ? '主队强20+' : rankGap < -20 ? '客队强20+' : '接近'
    if (!rankGapPatterns[gapKey]) rankGapPatterns[gapKey] = {}
    rankGapPatterns[gapKey][pattern] = (rankGapPatterns[gapKey][pattern] || 0) + 1

    console.log(`${hn}(${hr}) vs ${an}(${ar}): ${h}:${a} 半${hh}:${ha} → ${pattern} (差距${rankGap})`)
  }

  console.log('\n=== 半全场模式统计 ===')
  const total = data.length
  Object.entries(patterns).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`${k}: ${v}场 (${(v / total * 100).toFixed(1)}%)`)
  })

  console.log('\n=== 按排名差距分组 ===')
  for (const [gap, pats] of Object.entries(rankGapPatterns)) {
    console.log(`\n${gap}:`)
    const gapTotal = Object.values(pats).reduce((a, b) => a + b, 0)
    Object.entries(pats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}场 (${(v / gapTotal * 100).toFixed(1)}%)`)
    })
  }

  // 转移概率
  console.log('\n=== 半场→全场转移概率 ===')
  const transitions = {}
  for (const row of data) {
    const [id, mn, h, a, hh, ha] = row
    const halfResult = hh > ha ? '胜' : hh < ha ? '负' : '平'
    const fullResult = h > a ? '胜' : h < a ? '负' : '平'
    const key = `${halfResult}→${fullResult}`
    transitions[key] = (transitions[key] || 0) + 1
  }

  const halfGroups = {}
  for (const [k, v] of Object.entries(transitions)) {
    const half = k[0]
    if (!halfGroups[half]) halfGroups[half] = { total: 0, items: {} }
    halfGroups[half].total += v
    halfGroups[half].items[k] = v
  }

  for (const [half, data] of Object.entries(halfGroups)) {
    console.log(`\n半场${half}:`)
    for (const [k, v] of Object.entries(data.items)) {
      console.log(`  ${k}: ${v}场 (${(v / data.total * 100).toFixed(1)}%)`)
    }
  }

  db.close()
}

main().catch(console.error)
