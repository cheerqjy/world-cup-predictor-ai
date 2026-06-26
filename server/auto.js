const { getDb, saveDbSync } = require('./db')
const { predictMatch, predictChampion } = require('./ai')
const { fetchAndUpdate } = require('./fetcher')
const { getOddsForMatch } = require('./odds')
const { getBeijingNow, getBeijingDateStr } = require('./tz')

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

// 逻辑B：10:30兜底归档
// 强制将昨天及之前的所有遗留快照补建完整
async function archiveOldRecommendations() {
  const now = getBeijingNow()
  const hour = parseInt(now.toISOString().substring(11, 13))
  const min = parseInt(now.toISOString().substring(14, 16))
  const todayStr = getBeijingDateStr()

  // 只在10:30-10:35执行
  if (hour !== 10 || min < 30 || min > 35) return

  console.log('[Archive] 10:30兜底归档开始')
  const db = getDb()

  // 昨天的日期
  const yesterday = new Date(todayStr + 'T12:00:00')
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // 查找昨天及之前有比赛但没有快照的日期
  const datesWithoutSnapshot = db.prepare(`
    SELECT DISTINCT m.match_date
    FROM matches m
    WHERE m.match_date <= ? AND m.match_date IS NOT NULL
      AND m.home_team_id IS NOT NULL AND m.home_team_id != ''
      AND m.match_date NOT IN (
        SELECT snapshot_date FROM recommendation_snapshots
      )
    ORDER BY m.match_date DESC
  `).all(yesterdayStr)

  if (datesWithoutSnapshot.length === 0) {
    console.log('[Archive] 所有日期已有快照，无需归档')
    return
  }

  console.log(`[Archive] 需要归档 ${datesWithoutSnapshot.length} 个日期`)

  // 为每个缺失快照的日期生成快照
  const { buildRecommendationPackage, settleBetSlip, computeHits } = require('./routes/recommendations')

  for (const { match_date } of datesWithoutSnapshot) {
    try {
      const allDayMatches = db.prepare(`
        SELECT p.id as pred_id, p.match_id, p.home_score, p.away_score,
          p.half_home_score, p.half_away_score, p.result_1x2, p.total_goals, p.total_goals_2, p.handicap_result,
          p.half_full_result, p.confidence, p.confidence_detail,
          m.match_date, m.match_time, m.round, m.group_name, m.match_number, m.status,
          m.home_team_id, m.away_team_id,
          m.home_score as actual_home, m.away_score as actual_away,
          m.half_home_score as actual_half_home, m.half_away_score as actual_half_away,
          ht.name_cn as home_name_cn, ht.flag as home_flag, ht.ranking as home_ranking,
          at.name_cn as away_name_cn, at.flag as away_flag, at.ranking as away_ranking
        FROM matches m
        LEFT JOIN predictions p ON p.match_id = m.id AND p.id = (
          SELECT MAX(id) FROM predictions WHERE match_id = m.id
        )
        LEFT JOIN teams ht ON m.home_team_id = ht.id
        LEFT JOIN teams at ON m.away_team_id = at.id
        WHERE m.match_date = ?
          AND m.home_team_id IS NOT NULL AND m.home_team_id != ''
        ORDER BY m.match_number ASC
      `).all(match_date)

      if (allDayMatches.length === 0) continue

      const formatPick = (r) => {
        const isCompleted = r.status === 'completed'
        return {
          match_id: r.match_id,
          date: r.match_date, time: r.match_time, round: r.round, group_name: r.group_name, match_number: r.match_number,
          home: { id: r.home_team_id, name_cn: r.home_name_cn, flag: r.home_flag, ranking: r.home_ranking },
          away: { id: r.away_team_id, name_cn: r.away_name_cn, flag: r.away_flag, ranking: r.away_ranking },
          prediction: {
            home_score: r.home_score, away_score: r.away_score,
            result_1x2: r.result_1x2, total_goals: r.total_goals, total_goals_2: r.total_goals_2, handicap_result: r.handicap_result,
            half_full_result: r.half_full_result,
            confidence: r.confidence, confidence_detail: r.confidence_detail,
          },
          completed: isCompleted,
          pending: false,
          actual: isCompleted ? {
            home: r.actual_home, away: r.actual_away,
            half_home: r.actual_half_home, half_away: r.actual_half_away,
          } : null,
          hits: isCompleted ? computeHits(r) : null,
        }
      }

      let realOddsMap = {}
      try {
        const allTeams = db.prepare('SELECT id, name, name_cn FROM teams').all()
        const teamNames = {}
        for (const t of allTeams) teamNames[t.id] = t.name_cn || t.name
        const allMatches = db.prepare('SELECT id, home_team_id, away_team_id FROM matches').all()
        for (const m of allMatches) {
          const h = teamNames[m.home_team_id]; const a = teamNames[m.away_team_id]
          if (h && a) { const o = getOddsForMatch(h, a); if (o) realOddsMap[m.id] = o }
        }
      } catch (e) {}

      const picks = allDayMatches.map(formatPick)
      const dayPack = buildRecommendationPackage(picks, realOddsMap)
      const slip = settleBetSlip(dayPack.betSlip, dayPack.picks)
      const dailyProfit = slip.status === 'won'
        ? Math.round((slip.payout - slip.amount) * 100) / 100
        : slip.status === 'lost'
          ? Math.round(-slip.amount * 100) / 100
          : 0

      db.prepare('DELETE FROM recommendation_snapshots WHERE snapshot_date = ?').run(match_date)
      db.prepare(
        'INSERT INTO recommendation_snapshots (snapshot_date, active_data) VALUES (?, ?)'
      ).run(match_date, JSON.stringify({
        picks: dayPack.picks,
        betSlip: slip,
        dailyProfit,
      }))
      console.log(`[Archive] 已归档 ${match_date} (${dayPack.picks.length} 场)`)
    } catch (err) {
      console.error(`[Archive] 归档 ${match_date} 失败:`, err.message)
    }
  }

  console.log('[Archive] 10:30兜底归档完成')
}

async function autoCycle() {
  console.log('[Auto] === 自动刷新周期开始 ===')

  try {
    await fetchAndUpdate()
    const predictResult = await autoPredictAll()
    await autoChampion()
    updateCompletedAccuracy()
    await archiveOldRecommendations()

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
