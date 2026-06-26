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

function calcHalfFull(hh, ha, fh, fa) {
  const half = hh > ha ? '胜' : hh < ha ? '负' : '平'
  const full = fh > fa ? '胜' : fh < fa ? '负' : '平'
  return `${half}-${full}`
}

function poissonProb(k, lambda) {
  let p = Math.exp(-lambda)
  for (let i = 1; i <= k; i++) p *= lambda / i
  return p
}

function fallbackPrediction(home, away) {
  const diff = away.ranking - home.ranking
  const rankGap = Math.abs(diff)

  // 2026世界杯高进球趋势: 基础xG调高
  // 主队优势 + 排名差距映射
  let hXg = 1.55 + diff / 48
  let aXg = 1.15 - diff / 48

  // 排名差距极大时(>40), 强队进攻更猛
  if (rankGap > 40) {
    hXg += 0.3
    aXg -= 0.15
  }

  hXg = Math.max(0.4, Math.min(4.0, hXg))
  aXg = Math.max(0.3, Math.min(3.5, aXg))

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

  // 选择最可能比分: 仅当概率非常接近且排名差距很小时才偏向平局
  const top = scores[0]
  const drawBest = scores.find(s => s.h === s.a)
  // 收紧平局条件: 排名差距<10 且 概率差<10% 才选平局
  const useDraw = drawBest && rankGap < 10 && top.h !== top.a &&
    (top.prob - drawBest.prob) / top.prob < 0.10
  const pick = useDraw ? drawBest : top

  const homeScore = pick.h
  const awayScore = pick.a

  // 半场进球: 调整为更合理的比例 (上半场约45%的进球)
  const halfH = homeScore > 0 ? Math.max(1, Math.round(homeScore * 0.45 + (homeScore === 1 ? 0.1 : 0))) : 0
  const halfA = awayScore > 0 ? Math.max(1, Math.round(awayScore * 0.42 + (awayScore === 1 ? 0.1 : 0))) : 0
  // 防止半场超过全场
  const adjHalfH = Math.min(halfH, homeScore)
  const adjHalfA = Math.min(halfA, awayScore)

  const confidence = Math.min(0.82, 0.22 + Math.min(1, rankGap / 50) * 0.38 + top.prob * 1.8)

  // 各维度置信度
  const confScore = Math.round(top.prob * 100) / 100
  const predResult = homeScore > awayScore ? '胜' : homeScore < awayScore ? '负' : '平'
  const confResult = Math.round(scores.filter(s => predResult === (s.h > s.a ? '胜' : s.h < s.a ? '负' : '平')).reduce((sum, s) => sum + s.prob, 0) * 100) / 100
  const confTotal = Math.round((totalProbs[tg1] || 0) * 100) / 100

  const halfPattern = adjHalfH > adjHalfA ? '胜' : adjHalfH < adjHalfA ? '负' : '平'
  const fullPattern = homeScore > awayScore ? '胜' : homeScore < awayScore ? '负' : '平'
  const confHalf = Math.round(scores.filter(s => {
    const sh = s.h > 0 ? Math.max(1, Math.round(s.h * 0.45)) : 0
    const sa = s.a > 0 ? Math.max(1, Math.round(s.a * 0.42)) : 0
    const hp = sh > sa ? '胜' : sh < sa ? '负' : '平'
    const fp = s.h > s.a ? '胜' : s.h < s.a ? '负' : '平'
    return hp === halfPattern && fp === fullPattern
  }).reduce((sum, s) => sum + s.prob, 0) * 100) / 100

  return {
    home_score: homeScore, away_score: awayScore,
    half_home_score: adjHalfH, half_away_score: adjHalfA,
    result_1x2: predResult,
    total_goals: tg1,
    total_goals_2: tg1 === tg2 ? null : tg2,
    handicap_result: calcHandicap(homeScore, awayScore, home.ranking, away.ranking),
    half_full_result: calcHalfFull(adjHalfH, adjHalfA, homeScore, awayScore),
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

module.exports = { predictMatch, predictChampion, getConfig }
