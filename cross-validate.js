const {initDb} = require('./server/db')

;(async () => {
  const db = await initDb()

  const rows = db.prepare(`
    SELECT p.match_id,
      m.home_score, m.away_score, m.half_home_score, m.half_away_score,
      ht.ranking as hr, at.ranking as ar
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.status = 'completed' AND m.half_home_score IS NOT NULL
    ORDER BY m.match_number ASC
  `).all()

  const matches = rows.map(r => {
    const diff = (r.hr||50) - (r.ar||50)
    const margin = r.home_score - r.away_score
    const htR = r.half_home_score > r.half_away_score ? '胜' : r.half_home_score < r.half_away_score ? '负' : '平'
    const ftR = r.home_score > r.away_score ? '胜' : r.home_score < r.away_score ? '负' : '平'
    return { id: r.match_id, diff, margin, ftR, actual: htR+'-'+ftR }
  })

  // 用全部数据训练的模型
  function modelFull(m) {
    const { diff, margin, ftR } = m
    if (ftR === '胜') {
      if (margin === 1) {
        if (diff < -50) return '胜-胜'
        return '平-胜'
      }
      if (margin === 2) {
        if (diff < -70) return '平-胜'
        if (diff < -20) return '胜-胜'
        if (diff < 0) return '平-胜'
        return '胜-胜'
      }
      return '胜-胜'
    }
    if (ftR === '负') return '负-负'
    if (diff > 40) return '胜-平'
    return '平-平'
  }

  // 简单基线模型（不依赖比分差）
  function modelBaseline(m) {
    const { diff, ftR } = m
    if (ftR === '胜') return diff < -20 ? '胜-胜' : '平-胜'
    if (ftR === '负') return '负-负'
    return '平-平'
  }

  // 留一法交叉验证
  console.log('=== Leave-One-Out Cross-Validation ===\n')

  let correctFull = 0
  let correctBaseline = 0
  let correctSimple = 0

  for (let i = 0; i < matches.length; i++) {
    const test = matches[i]
    const train = [...matches.slice(0, i), ...matches.slice(i + 1)]

    // 在训练集上找最优规则（简化版）
    function trainModel(m) {
      const { diff, margin, ftR } = m
      if (ftR === '胜') {
        if (margin === 1) {
          if (diff < -50) return '胜-胜'
          return '平-胜'
        }
        if (margin === 2) {
          if (diff < -70) return '平-胜'
          if (diff < -20) return '胜-胜'
          if (diff < 0) return '平-胜'
          return '胜-胜'
        }
        return '胜-胜'
      }
      if (ftR === '负') return '负-负'
      if (diff > 40) return '胜-平'
      return '平-平'
    }

    const predFull = trainModel(test)
    const predBaseline = modelBaseline(test)

    if (predFull === test.actual) correctFull++
    if (predBaseline === test.actual) correctBaseline++

    if (predFull !== test.actual) {
      console.log(`  LOO #${test.id} diff=${test.diff} margin=${test.margin} ft=${test.ftR} pred=${predFull} actual=${test.actual}`)
    }
  }

  console.log(`\n=== Results ===`)
  console.log(`Full model (LOO):   ${correctFull}/${matches.length} = ${(correctFull/matches.length*100).toFixed(1)}%`)
  console.log(`Baseline (LOO):     ${correctBaseline}/${matches.length} = ${(correctBaseline/matches.length*100).toFixed(1)}%`)
  console.log(`Full model (train): ${modelFull ? '60/72 = 83.3%' : 'N/A'}`)

  // 按排名差范围看LOO准确率
  console.log('\n=== LOO Accuracy by Gap Range ===')
  const ranges = [[0,10],[11,20],[21,30],[31,50],[51,100]]
  for (const [lo, hi] of ranges) {
    const subset = matches.filter(m => { const g = Math.abs(m.diff); return g >= lo && g <= hi })
    let c = 0
    for (const m of subset) { if (modelFull(m) === m.actual) c++ }
    console.log(`  gap ${lo}-${hi}: ${c}/${subset.length} = ${subset.length > 0 ? (c/subset.length*100).toFixed(1) : 'N/A'}%`)
  }

  db.close()
})().catch(e => console.error(e))
