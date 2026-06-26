const { getDb, saveDbSync } = require('./db')
const { predictMatch, predictChampion } = require('./ai')
const { fetchAndUpdate } = require('./fetcher')
const { getOddsForMatch } = require('./odds')

function updateCompletedAccuracy() {
  const db = getDb()

  const completed = db.prepare(`
    SELECT p.id, p.match_id, p.home_score as ph, p.away_score as pa,
      p.result_1x2, p.total_goals, p.total_goals_2, p.half_full_result, p.handicap_result,
      m.home_score as mh, m.away_score as ma,
      m.half_home_score as mhh, m.half_away_score as mha,
      ht.name_cn as home_name, at.name_cn as away_name
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.status = 'completed'
  `).all()

  const update = db.prepare(`
    UPDATE predictions SET correct_score=?, correct_result=?, correct_total_goals=?, correct_half_full=?, correct_rq_result=?
    WHERE id=?
  `)

  for (const p of completed) {
    if (p.mh === null) continue

    const correctScore = (p.ph === p.mh && p.pa === p.ma) ? 1 : 0

    const result = p.mh > p.ma ? '胜' : p.mh < p.ma ? '负' : '平'
    const correctResult = p.result_1x2 === result ? 1 : 0

    const totalGoals = p.mh + p.ma
    const tgActual = totalGoals >= 7 ? '7+' : String(totalGoals)
    const correctTG = (p.total_goals === tgActual || p.total_goals_2 === tgActual) ? 1 : 0

    const halfR = p.mhh > p.mha ? '胜' : p.mhh < p.mha ? '负' : '平'
    const fullR = p.mh > p.ma ? '胜' : p.mh < p.ma ? '负' : '平'
    const actualHF = `${halfR}-${fullR}`
    const correctHF = p.half_full_result === actualHF ? 1 : 0

    // 让球结果: 使用体彩实际让球数计算
    let correctRq = 0
    if (p.handicap_result && p.home_name && p.away_name) {
      const oddsData = getOddsForMatch(p.home_name, p.away_name)
      const rqNum = oddsData && typeof oddsData.rqNum === 'number' ? oddsData.rqNum : 0
      const adjustedHome = p.mh + rqNum
      const rqActual = adjustedHome > p.ma ? '胜' : adjustedHome < p.ma ? '负' : '平'
      const rqPred = p.handicap_result.replace('让球', '')
      if (rqPred === rqActual) correctRq = 1
    }

    update.run(correctScore, correctResult, correctTG, correctHF, correctRq, p.id)
  }

  if (completed.length > 0) {
    console.log(`[Auto] 已更新 ${completed.length} 场预测准确度`)
  }
}

async function autoPredictAll() {
  const db = getDb()

  const unpredicted = db.prepare(`
    SELECT m.id FROM matches m
    WHERE m.home_team_id IS NOT NULL
      AND m.home_team_id != ''
      AND m.id NOT IN (SELECT match_id FROM predictions)
    ORDER BY m.match_number ASC
  `).all()

  if (unpredicted.length === 0) {
    console.log('[Auto] 所有比赛已预测')
    return { predicted: 0 }
  }

  console.log(`[Auto] 正在自动预测 ${unpredicted.length} 场比赛...`)
  let count = 0

  for (const m of unpredicted) {
    try {
      await predictMatch(m.id)
      count++
    } catch (err) {
      console.error(`[Auto] 预测比赛 ${m.id} 失败:`, err.message)
    }
  }

  console.log(`[Auto] 预测完成: ${count} 场`)
  return { predicted: count }
}

async function autoChampion() {
  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) as c FROM champion_predictions').get()
  if (existing.c > 0) return

  try {
    await predictChampion()
    console.log('[Auto] 冠亚军预测完成')
  } catch (err) {
    console.error('[Auto] 冠亚军预测失败:', err.message)
  }
}

async function autoCycle() {
  console.log('[Auto] === 自动刷新周期开始 ===')

  try {
    await fetchAndUpdate()
    const predictResult = await autoPredictAll()
    await autoChampion()
    updateCompletedAccuracy()

    const db = getDb()
    const stats = {
      teams: db.prepare('SELECT COUNT(*) as c FROM teams').get().c,
      matches: db.prepare('SELECT COUNT(*) as c FROM matches').get().c,
      completed: db.prepare("SELECT COUNT(*) as c FROM matches WHERE status='completed'").get().c,
      predictions: db.prepare('SELECT COUNT(*) as c FROM predictions').get().c,
    }
    console.log(`[Auto] 状态: ${stats.completed}/${stats.matches} 已完赛, ${stats.predictions} 预测`)

    saveDbSync()
  } catch (err) {
    console.error('[Auto] 周期错误:', err.message)
  }

  console.log('[Auto] === 自动刷新周期结束 ===')
}

function startAutoRefresh(intervalMinutes = 2) {
  console.log(`[Auto] 启动自动刷新 (每 ${intervalMinutes} 分钟)`)
  setTimeout(autoCycle, 3000)
  setInterval(autoCycle, intervalMinutes * 60 * 1000)
}

module.exports = { startAutoRefresh, autoCycle, updateCompletedAccuracy }
