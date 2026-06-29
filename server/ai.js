const OpenAI = require('openai')
const { getDb } = require('./db')

function getConfig() {
  const db = getDb()
  const config = db.prepare('SELECT * FROM ai_config WHERE id = 1').get()
  return config || { provider: 'openai', api_key: '', model: 'gpt-4o', base_url: '' }
}

function createClient() {
  const config = getConfig()
  if (!config.api_key) return null
  return new OpenAI({
    apiKey: config.api_key,
    baseURL: config.base_url || undefined,
  })
}

function buildPrompt(match, homeTeam, awayTeam) {
  return `你是一位专业的足球赛事分析师。请预测以下2026世界杯比赛的结果。

比赛信息：
- 赛事：2026 FIFA世界杯
- 轮次：${match.round}
- 主队：${homeTeam.name_cn} (${homeTeam.name}) - FIFA排名第${homeTeam.ranking}
- 客队：${awayTeam.name_cn} (${awayTeam.name}) - FIFA排名第${awayTeam.ranking}
- 比赛日期：${match.match_date}

请根据两队FIFA排名、历史战绩、近期状态等因素，给出详细预测。

请以JSON格式返回（不要markdown标记，纯JSON）：
{
  "home_score": 主队进球数,
  "away_score": 客队进球数,
  "half_home_score": 半场主队进球数,
  "half_away_score": 半场客队进球数,
  "result_1x2": "胜/平/负" (主队视角),
  "total_goals": "0/1/2/3/4/5/6/7+" (总进球数区间),
  "handicap_result": "让球胜/让球平/让球负" (默认主队让1球，如果排名差距大于20则让2球，客队更强则为负值),
  "half_full_result": "胜-胜/胜-平/胜-负/平-胜/平-平/平-负/负-胜/负-平/负-负" (半场结果-全场结果),
  "confidence": 0.0-1.0 (信心指数),
  "analysis": "简要分析"
}`
}

function buildChampionPrompt(teams) {
  const teamList = teams.map(t =>
    `${t.name_cn}(${t.name}) - FIFA排名${t.ranking} - ${t.group_name}组`
  ).join('\n')

  return `你是一位专业的足球赛事分析师。2026世界杯共有48支球队参赛，12个小组（每组4队），每组前两名及8个成绩最好的小组第三名晋级32强淘汰赛。

参赛球队：
${teamList}

请预测本届世界杯的冠军和亚军。

请以JSON格式返回（不要markdown标记，纯JSON）：
{
  "champion_id": "冠军球队ID",
  "runner_up_id": "亚军球队ID",
  "champion_reason": "冠军夺冠理由",
  "runner_up_reason": "亚军晋级理由"
}

球队ID对应关系：
${teams.map(t => `${t.id}: ${t.name_cn}`).join('\n')}`
}

function parsePredictionResponse(content) {
  try {
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {}
    }
    return null
  }
}

async function predictMatch(matchId) {
  const db = getDb()
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId)
  if (!match) throw new Error('比赛不存在')

  if (!match.home_team_id || match.home_team_id === 'TBD') {
    throw new Error('淘汰赛对阵待定，请等待小组赛结果')
  }

  const homeTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.home_team_id)
  const awayTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.away_team_id)

  const client = createClient()
  let prediction

  if (client) {
    try {
      const prompt = buildPrompt(match, homeTeam, awayTeam)
      const config = getConfig()
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: '你是一位专业的足球赛事分析师。请基于球队实力和数据分析，给出准确的比赛预测。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      })

      const content = response.choices[0]?.message?.content
      if (content) {
        prediction = parsePredictionResponse(content)
      }
    } catch (err) {
      console.error('AI预测失败:', err.message)
    }
  }

  if (!prediction) {
    prediction = fallbackPrediction(homeTeam, awayTeam)
  }

  const homeScore = prediction.home_score
  const awayScore = prediction.away_score
  const halfHome = prediction.half_home_score ?? Math.round(homeScore * 0.4)
  const halfAway = prediction.half_away_score ?? Math.round(awayScore * 0.4)
  const result1x2 = prediction.result_1x2 || (homeScore > awayScore ? '胜' : homeScore < awayScore ? '负' : '平')
  const totalGoals = prediction.total_goals || (homeScore + awayScore > 7 ? '7+' : String(homeScore + awayScore))
  const totalGoals2 = prediction.total_goals_2 || null
  const handicapResult = prediction.handicap_result || calcHandicap(homeScore, awayScore, homeTeam.ranking, awayTeam.ranking)
  const halfFull = prediction.half_full_result || calcHalfFull(halfHome, halfAway, homeScore, awayScore)
  const confidence = prediction.confidence ?? 0.5
  const confidenceDetail = prediction.confidence_detail || null

  const result = db.prepare(`
    INSERT INTO predictions (match_id, home_score, away_score, half_home_score, half_away_score,
      result_1x2, total_goals, total_goals_2, handicap_result, half_full_result, ai_model, confidence, confidence_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    matchId, homeScore, awayScore, halfHome, halfAway,
    result1x2, totalGoals, totalGoals2, handicapResult, halfFull,
    client ? (getConfig().model || 'ai') : 'statistical',
    Math.round(confidence * 100) / 100,
    confidenceDetail
  )

  return {
    id: result.lastInsertRowid,
    match_id: matchId,
    home_team: homeTeam,
    away_team: awayTeam,
    home_score: homeScore,
    away_score: awayScore,
    half_home_score: halfHome,
    half_away_score: halfAway,
    result_1x2: result1x2,
    total_goals: totalGoals,
    total_goals_2: totalGoals2,
    handicap_result: handicapResult,
    half_full_result: halfFull,
    confidence: Math.round(confidence * 100) / 100,
    confidence_detail: confidenceDetail,
  }
}

function calcHandicap(hs, as, homeRank, awayRank) {
  const diff = homeRank - awayRank
  const adjustedHs = diff <= -20 ? hs - 2 : diff >= 20 ? hs + 2 : diff <= -10 ? hs - 1 : diff >= 10 ? hs + 1 : hs
  if (adjustedHs > as) return '让球胜'
  if (adjustedHs < as) return '让球负'
  return '让球平'
}

function calcHalfFull(halfHome, halfAway, homeScore, awayScore) {
  // 基于半场和全场比分计算半全场结果
  const halfResult = halfHome > halfAway ? '胜' : halfHome < halfAway ? '负' : '平'
  const fullResult = homeScore > awayScore ? '胜' : homeScore < awayScore ? '负' : '平'
  return `${halfResult}-${fullResult}`
}

// ─── 半全场顶级预测模型 ───
// 两半场独立泊松 + 球队攻防参数 + 半场比分对下半场的影响

// 从数据库学习球队攻防参数
function learnTeamParams(db) {
  if (!db) db = getDb()

  // 获取所有已完成比赛
  const matches = db.prepare(`
    SELECT m.home_team_id, m.away_team_id,
           m.half_home_score, m.half_away_score,
           m.home_score - m.half_home_score as second_home,
           m.away_score - m.half_away_score as second_away,
           ht.ranking as hr, at.ranking as ar
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.status = 'completed' AND m.half_home_score IS NOT NULL
  `).all()

  if (matches.length === 0) return null

  // 计算全局平均值
  let totalH1 = 0, totalA1 = 0, totalH2 = 0, totalA2 = 0
  for (const m of matches) {
    totalH1 += m.half_home_score
    totalA1 += m.half_away_score
    totalH2 += m.second_home
    totalA2 += m.second_away
  }
  const n = matches.length
  const avgH1 = totalH1 / n
  const avgA1 = totalA1 / n
  const avgH2 = totalH2 / n
  const avgA2 = totalA2 / n

  // 每支球队的攻防参数
  const teamData = {}

  for (const m of matches) {
    ;[m.home_team_id, m.away_team_id].forEach(tid => {
      if (!teamData[tid]) {
        teamData[tid] = {
          matches: 0, h1gf: 0, h1ga: 0, a1gf: 0, a1ga: 0,
          h2gf: 0, h2ga: 0, a2gf: 0, a2ga: 0,
          ranking: 0
        }
      }
    })
  }

  for (const m of matches) {
    const h = teamData[m.home_team_id]
    h.matches++
    h.h1gf += m.half_home_score
    h.h1ga += m.half_away_score
    h.h2gf += m.second_home
    h.h2ga += m.second_away
    h.ranking = m.hr

    const a = teamData[m.away_team_id]
    a.matches++
    a.a1gf += m.half_away_score
    a.a1ga += m.half_home_score
    a.a2gf += m.second_away
    a.a2ga += m.second_home
    a.ranking = m.ar
  }

  // 计算每支球队的攻防强度
  const teamStrength = {}
  for (const [tid, td] of Object.entries(teamData)) {
    const mu = td.matches || 1
    teamStrength[tid] = {
      // 上半场：主场进攻、主场防守、客场进攻、客场防守
      hAtt1: td.h1gf / mu / avgH1,
      hDef1: td.h1ga / mu / avgA1,
      aAtt1: td.a1gf / mu / avgA1,
      aDef1: td.a1ga / mu / avgH1,
      // 下半场
      hAtt2: td.h2gf / mu / avgH2,
      hDef2: td.h2ga / mu / avgA2,
      aAtt2: td.a2gf / mu / avgA2,
      aDef2: td.a2ga / mu / avgH2,
      matches: td.matches,
      ranking: td.ranking
    }
  }

  return { teamStrength, avgH1, avgA1, avgH2, avgA2, n }
}

// 获取球队攻防参数（排名 → 攻防强度）
// 公式: attack = 1 + (50 - rank) / 100, defense = 1 - (50 - rank) / 100
// rank=1 → attack=1.49, defense=0.51 (最强)
// rank=50 → attack=1.0, defense=1.0 (平均)
// rank=99 → attack=0.51, defense=1.49 (最弱)
function getTeamParams(teamId, teamRanking, learned) {
  const rankStrength = (ranking) => {
    const r = ranking || 50
    return { attack: 1 + (50 - r) / 100, defense: 1 - (50 - r) / 100 }
  }

  const ranking = teamRanking || 50
  const base = rankStrength(ranking)

  if (learned && learned.teamStrength[teamId]) {
    const ts = learned.teamStrength[teamId]
    const mu = Math.min(ts.matches, 10)
    const w = mu / 10
    return {
      hAtt1: ts.hAtt1 * w + base.attack * (1 - w),
      hDef1: ts.hDef1 * w + base.defense * (1 - w),
      aAtt1: ts.aAtt1 * w + base.attack * (1 - w),
      aDef1: ts.aDef1 * w + base.defense * (1 - w),
      hAtt2: ts.hAtt2 * w + base.attack * (1 - w),
      hDef2: ts.hDef2 * w + base.defense * (1 - w),
      aAtt2: ts.aAtt2 * w + base.attack * (1 - w),
      aDef2: ts.aDef2 * w + base.defense * (1 - w),
    }
  }
  return {
    hAtt1: base.attack, hDef1: base.defense,
    aAtt1: base.attack, aDef1: base.defense,
    hAtt2: base.attack, hDef2: base.defense,
    aAtt2: base.attack, aDef2: base.defense,
  }
}

// 半场比分对下半场的影响修正（基于73场实际数据校准）
// 关键发现：领先的球队下半场进攻更强（×1.27-1.37），而非更保守
// 平局半场则双方都偏保守（×0.91/×0.74）
function halftimeEffect(halfHome, halfAway) {
  const diff = halfHome - halfAway
  const absDiff = Math.abs(diff)

  if (diff > 0) {
    // 主队领先
    if (absDiff >= 2) return { homeMul: 1.37, awayMul: 0.85 }
    return { homeMul: 1.27, awayMul: 1.28 }
  }
  if (diff < 0) {
    // 客队领先
    if (absDiff >= 2) return { homeMul: 0.64, awayMul: 2.74 }
    return { homeMul: 0.75, awayMul: 0.64 }
  }
  // 平局
  return { homeMul: 0.91, awayMul: 0.74 }
}

// 核心预测函数：计算全部9种半全场联合概率
function predictHalfFullProbs(homeTeamId, homeRanking, awayTeamId, awayRanking, learned) {
  const hp = getTeamParams(homeTeamId, homeRanking, learned)
  const ap = getTeamParams(awayTeamId, awayRanking, learned)

  const avg = learned || { avgH1: 0.7, avgA1: 0.5, avgH2: 1.0, avgA2: 0.7 }

  const lambdaH1 = Math.max(0.05, avg.avgH1 * hp.hAtt1 * ap.aDef1)
  const lambdaA1 = Math.max(0.05, avg.avgA1 * ap.aAtt1 * hp.hDef1)

  const halfProbs = {}
  const MAX_HALF = 4
  for (let hh = 0; hh <= MAX_HALF; hh++) {
    for (let ha = 0; ha <= MAX_HALF; ha++) {
      halfProbs[`${hh}-${ha}`] = poissonProb(hh, lambdaH1) * poissonProb(ha, lambdaA1)
    }
  }

  const hfProbs = {
    '胜-胜': 0, '胜-平': 0, '胜-负': 0,
    '平-胜': 0, '平-平': 0, '平-负': 0,
    '负-胜': 0, '负-平': 0, '负-负': 0,
  }

  const MAX_FULL = 8
  for (let hh = 0; hh <= MAX_HALF; hh++) {
    for (let ha = 0; ha <= MAX_HALF; ha++) {
      const halfProb = halfProbs[`${hh}-${ha}`]
      if (halfProb < 0.001) continue

      const halfResult = hh > ha ? '胜' : hh < ha ? '负' : '平'
      const { homeMul, awayMul } = halftimeEffect(hh, ha)
      const lambdaH2 = Math.max(0.05, avg.avgH2 * hp.hAtt2 * ap.aDef2 * homeMul)
      const lambdaA2 = Math.max(0.05, avg.avgA2 * ap.aAtt2 * hp.hDef2 * awayMul)

      for (let sh = 0; sh <= MAX_FULL; sh++) {
        for (let sa = 0; sa <= MAX_FULL; sa++) {
          const secondProb = poissonProb(sh, lambdaH2) * poissonProb(sa, lambdaA2)
          const totalProb = halfProb * secondProb
          if (totalProb < 0.0001) continue

          const fh = hh + sh
          const fa = ha + sa
          const fullResult = fh > fa ? '胜' : fh < fa ? '负' : '平'

          const key = `${halfResult}-${fullResult}`
          hfProbs[key] = (hfProbs[key] || 0) + totalProb
        }
      }
    }
  }

  const total = Object.values(hfProbs).reduce((s, v) => s + v, 0)
  for (const k of Object.keys(hfProbs)) {
    hfProbs[k] /= total
  }

  return hfProbs
}

// 边缘概率选择：从联合分布中分别选择最可能的半场和全场结果
function calcHalfFullAdvanced(homeTeamId, homeRanking, awayTeamId, awayRanking, learned) {
  const probs = predictHalfFullProbs(homeTeamId, homeRanking, awayTeamId, awayRanking, learned)

  // 计算半场边缘概率 P(半场结果)
  let pHalfWin = 0, pHalfDraw = 0, pHalfLose = 0
  // 计算全场边缘概率 P(全场结果)
  let pFullWin = 0, pFullDraw = 0, pFullLose = 0

  for (const [key, prob] of Object.entries(probs)) {
    const halfResult = key[0]
    const fullResult = key[2]

    if (halfResult === '胜') pHalfWin += prob
    else if (halfResult === '平') pHalfDraw += prob
    else pHalfLose += prob

    if (fullResult === '胜') pFullWin += prob
    else if (fullResult === '平') pFullDraw += prob
    else pFullLose += prob
  }

  const halfPred = pHalfWin > pHalfDraw && pHalfWin > pHalfLose ? '胜'
    : pHalfDraw > pHalfLose ? '平' : '负'
  const fullPred = pFullWin > pFullDraw && pFullWin > pFullLose ? '胜'
    : pFullDraw > pFullLose ? '平' : '负'

  const result = `${halfPred}-${fullPred}`
  const halfConf = halfPred === '胜' ? pHalfWin : halfPred === '平' ? pHalfDraw : pHalfLose
  const fullConf = fullPred === '胜' ? pFullWin : fullPred === '平' ? pFullDraw : pFullLose
  const confidence = Math.round(Math.min(halfConf, fullConf) * 100) / 100

  return { result, confidence, allProbs: probs }
}

// 向后兼容（已弃用）
function calcHalfFullPoisson(homeRank, awayRank) {
  const db = getDb()
  const learned = learnTeamParams(db)
  const result = calcHalfFullAdvanced('h', homeRank, 'a', awayRank, learned)
  return result.result
}

function calcHalfTime(homeRank, awayRank, homeScore, awayScore) {
  // 基于排名差距预测半场比分
  const diff = (homeRank || 50) - (awayRank || 50)
  if (diff > 20) {
    // 主队强: 大概率半场落后
    return { hh: 0, ha: homeScore > awayScore ? 1 : 1 }
  }
  if (diff < -20) {
    // 客队强: 大概率半场领先
    return { hh: homeScore > awayScore ? 1 : 0, ha: 0 }
  }
  // 接近: 半场平局
  return { hh: 0, ha: 0 }
}

function poissonProb(k, lambda) {
  let p = Math.exp(-lambda)
  for (let i = 1; i <= k; i++) p *= lambda / i
  return p
}

function fallbackPrediction(home, away) {
  const diff = away.ranking - home.ranking
  const rankGap = Math.abs(diff)

  // 2026世界杯校准: 实际平均总进球3.0 (主场1.79, 客场1.19)
  // 基于72场已完成比赛的实际数据校准
  let hXg = 1.75 + diff / 45
  let aXg = 1.25 - diff / 45

  // 排名差距调整
  if (rankGap > 50) {
    hXg += 0.7
    aXg -= 0.3
  } else if (rankGap > 30) {
    hXg += 0.35
    aXg -= 0.15
  } else if (rankGap > 15) {
    hXg += 0.1
    aXg -= 0.05
  }

  hXg = Math.max(0.5, Math.min(5.0, hXg))
  aXg = Math.max(0.2, Math.min(3.5, aXg))

  // 扩展到 8-8 的比分网格
  const maxGoals = 8
  const scores = []
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      scores.push({ h, a, prob: poissonProb(h, hXg) * poissonProb(a, aXg) })
    }
  }
  scores.sort((x, y) => y.prob - x.prob)

  // 总进球概率
  const totalProbs = {}
  for (const s of scores) {
    const t = s.h + s.a
    const key = t >= 7 ? '7+' : String(t)
    totalProbs[key] = (totalProbs[key] || 0) + s.prob
  }
  const sortedTotals = Object.entries(totalProbs).sort((a, b) => b[1] - a[1])
  const tg1 = sortedTotals[0][0]
  const tg2 = sortedTotals.length > 1 ? sortedTotals[1][0] : tg1

  const top = scores[0]
  const drawBest = scores.find(s => s.h === s.a)
  const useDraw = drawBest && rankGap < 10 && top.h !== top.a &&
    (top.prob - drawBest.prob) / top.prob < 0.10
  const pick = useDraw ? drawBest : top

  const homeScore = pick.h
  const awayScore = pick.a

  const ht = calcHalfTime(home.ranking, away.ranking, homeScore, awayScore)
  const adjHalfH = ht.hh
  const adjHalfA = ht.ha

  // 使用新的顶级半全场预测模型
  const db = getDb()
  const learned = learnTeamParams(db)
  const hfResult = calcHalfFullAdvanced(home.id, home.ranking, away.id, away.ranking, learned)

  const confidence = Math.min(0.82, 0.22 + Math.min(1, rankGap / 50) * 0.38 + top.prob * 1.8)

  const confScore = Math.round(top.prob * 100) / 100
  const predResult = homeScore > awayScore ? '胜' : homeScore < awayScore ? '负' : '平'
  const confResult = Math.round(scores.filter(s => predResult === (s.h > s.a ? '胜' : s.h < s.a ? '负' : '平')).reduce((sum, s) => sum + s.prob, 0) * 100) / 100
  const confTotal = Math.round((totalProbs[tg1] || 0) * 100) / 100
  const confHalf = hfResult.confidence

  return {
    home_score: homeScore, away_score: awayScore,
    half_home_score: adjHalfH, half_away_score: adjHalfA,
    result_1x2: predResult,
    total_goals: tg1,
    total_goals_2: tg1 === tg2 ? null : tg2,
    handicap_result: calcHandicap(homeScore, awayScore, home.ranking, away.ranking),
    half_full_result: hfResult.result,
    confidence: Math.round(confidence * 100) / 100,
    confidence_detail: JSON.stringify([confScore, confResult, confTotal, confHalf]),
  }
}

async function predictChampion() {
  const db = getDb()
  const allTeams = db.prepare('SELECT * FROM teams ORDER BY ranking ASC').all()

  const client = createClient()
  let prediction

  if (client) {
    try {
      const prompt = buildChampionPrompt(allTeams)
      const config = getConfig()
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: '你是一位专业的足球赛事分析师。请基于球队实力分析，给出2026世界杯冠亚军预测。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      })

      const content = response.choices[0]?.message?.content
      if (content) {
        const parsed = parsePredictionResponse(content)
        if (parsed && parsed.champion_id && parsed.runner_up_id) {
          prediction = parsed
        }
      }
    } catch (err) {
      console.error('AI冠军预测失败:', err.message)
    }
  }

  if (!prediction) {
    const top = allTeams.slice(0, 8)
    prediction = {
      champion_id: top[0].id,
      runner_up_id: top[1].id,
      champion_reason: '基于FIFA排名最高的球队',
      runner_up_reason: '基于FIFA排名第二的球队',
    }
  }

  const champion = db.prepare('SELECT * FROM teams WHERE id = ?').get(prediction.champion_id)
  const runnerUp = db.prepare('SELECT * FROM teams WHERE id = ?').get(prediction.runner_up_id)

  db.prepare('INSERT INTO champion_predictions (champion_team_id, runner_up_team_id) VALUES (?, ?)')
    .run(prediction.champion_id, prediction.runner_up_id)

  return {
    champion,
    runner_up: runnerUp,
    champion_reason: prediction.champion_reason || '',
    runner_up_reason: prediction.runner_up_reason || '',
  }
}

module.exports = { predictMatch, predictChampion, getConfig, calcHalfFull, calcHalfFullPoisson }
