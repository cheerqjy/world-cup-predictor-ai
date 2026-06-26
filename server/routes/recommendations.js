const express = require('express')
const { getDb } = require('../db')
const { fetchOdds, getOddsForMatch } = require('../odds')
const { getBeijingDateStr } = require('../tz')

const router = express.Router()

function parseConfidence(detail) {
  if (!detail) return [0.05, 0.5, 0.3, 0.15]
  try { return JSON.parse(detail) } catch { return [0.05, 0.5, 0.3, 0.15] }
}

function estimateOdds(prob) {
  if (prob <= 0) return 0
  return Math.round(Math.min(50, Math.max(1.1, 1 / prob * 0.9)) * 100) / 100
}

const RESULT_LABEL_MAP = { '胜': '主胜', '平': '平', '负': '主负' }
const SCORE_CODE_MAP = {
  '10': '1:0', '20': '2:0', '21': '2:1', '30': '3:0', '31': '3:1', '32': '3:2',
  '40': '4:0', '41': '4:1', '42': '4:2', '50': '5:0', '51': '5:1', '52': '5:2', '90': '胜其他',
  '00': '0:0', '11': '1:1', '22': '2:2', '33': '3:3', '99': '平其他',
  '01': '0:1', '02': '0:2', '12': '1:2', '03': '0:3', '13': '1:3', '23': '2:3',
  '04': '0:4', '14': '1:4', '24': '2:4', '05': '0:5', '15': '1:5', '25': '2:5', '09': '负其他',
}
const HALF_FULL_CODE_MAP = {
  '33': '胜胜', '31': '胜平', '30': '胜负',
  '13': '平胜', '11': '平平', '10': '平负',
  '03': '负胜', '01': '负平', '00': '负负',
}
const SCORE_OPTIONS = [
  '1:0', '2:0', '2:1', '3:0', '3:1', '3:2', '4:0', '4:1', '4:2', '5:0', '5:1', '5:2', '胜其他',
  '0:0', '1:1', '2:2', '3:3', '平其他',
  '0:1', '0:2', '1:2', '0:3', '1:3', '2:3', '0:4', '1:4', '2:4', '0:5', '1:5', '2:5', '负其他',
]
const TOTAL_GOAL_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const HALF_FULL_OPTIONS = ['胜胜', '胜平', '胜负', '平胜', '平平', '平负', '负胜', '负平', '负负']
const MARKET_WEIGHT_MAP = { spf: 1, rq: 0.96, zq: 0.92, bqc: 0.8, bf: 0.66 }

function round2(value) {
  return Math.round(value * 100) / 100
}

function getResultLabel(result) {
  return RESULT_LABEL_MAP[result] || result || '-'
}

function inferResultByScore(homeScore, awayScore) {
  if (typeof homeScore !== 'number' || typeof awayScore !== 'number') return '平'
  if (homeScore > awayScore) return '胜'
  if (homeScore < awayScore) return '负'
  return '平'
}

function inferRqNum(pick) {
  const homeRank = pick.home?.ranking || 0
  const awayRank = pick.away?.ranking || 0
  const diff = homeRank - awayRank
  if (diff <= -20) return -2
  if (diff >= 20) return 2
  if (diff <= -10) return -1
  if (diff >= 10) return 1
  return 0
}

function getRqDisplay(rqNum) {
  // 体彩让球规则：正数=主队让球，负数=主队受让
  if (rqNum > 0) return `让${rqNum}`
  if (rqNum < 0) return `受让${Math.abs(rqNum)}`
  return '平手'
}

// 搏冷分析: 计算冷门概率
function analyzeUpset(pick) {
  const homeRank = pick.home?.ranking || 50
  const awayRank = pick.away?.ranking || 50
  const rankDiff = Math.abs(homeRank - awayRank)

  // 排名差距越大，冷门概率越低
  // 排名接近时，冷门概率较高
  let upsetProb = 0
  if (rankDiff <= 5) upsetProb = 0.35      // 排名接近，冷门概率高
  else if (rankDiff <= 10) upsetProb = 0.25
  else if (rankDiff <= 15) upsetProb = 0.18
  else if (rankDiff <= 20) upsetProb = 0.12
  else if (rankDiff <= 30) upsetProb = 0.08
  else upsetProb = 0.05

  // 强队主场被弱队逼平或击败的概率
  const stronger = homeRank < awayRank ? 'home' : 'away'
  const weaker = homeRank < awayRank ? 'away' : 'home'

  // 如果模型预测弱队获胜或平局，冷门概率更高
  const conf = parseConfidence(pick.prediction?.confidence_detail)
  const resultConf = conf[1] || 0.5

  // 模型预测结果
  const predResult = pick.prediction?.result_1x2

  // 如果模型预测弱队获胜，这是真正的搏冷
  if ((stronger === 'home' && predResult === '负') || (stronger === 'away' && predResult === '胜')) {
    return { isUpset: true, type: '冷胜', probability: Math.min(0.4, upsetProb * 1.5), confidence: resultConf }
  }

  // 如果模型预测平局，这也是冷门信号
  if (predResult === '平') {
    return { isUpset: true, type: '冷平', probability: upsetProb, confidence: resultConf }
  }

  // 模型预测强队获胜，但赔率显示有冷门可能
  return { isUpset: false, type: '正常', probability: upsetProb * 0.5, confidence: resultConf }
}

function inferHandicapResult(pick, rqNum) {
  // 优先使用体彩让球数计算结果
  const homeScore = typeof pick.prediction.home_score === 'number' ? pick.prediction.home_score : 0
  const awayScore = typeof pick.prediction.away_score === 'number' ? pick.prediction.away_score : 0
  const adjustedHome = homeScore + rqNum
  if (adjustedHome > awayScore) return '胜'
  if (adjustedHome < awayScore) return '负'
  return '平'
}

function normalizeScoreKey(option) {
  if (option === null || option === undefined) return ''
  const text = String(option).trim()
  if (!text) return ''
  if (SCORE_CODE_MAP[text]) return SCORE_CODE_MAP[text]
  if (/^\d:\d$/.test(text)) return text
  if (/^\d-\d$/.test(text)) return text.replace('-', ':')
  if (/^\d\d$/.test(text) && Number(text[0]) <= 5 && Number(text[1]) <= 5) return `${text[0]}:${text[1]}`
  if (text.includes('胜其他')) return '胜其他'
  if (text.includes('平其他')) return '平其他'
  if (text.includes('负其他')) return '负其他'
  return text
}

function normalizeHalfFullKey(option) {
  if (option === null || option === undefined) return ''
  const text = String(option).trim()
  if (!text) return ''
  if (HALF_FULL_CODE_MAP[text]) return HALF_FULL_CODE_MAP[text]
  if (text.includes('-')) return text.replace(/-/g, '')
  return text
}

function normalizeTotalGoalsKey(option) {
  if (option === null || option === undefined) return ''
  const text = String(option).trim()
  if (!text) return ''
  if (text === '7') return '7+'
  if (text.includes('+')) return '7+'
  return text
}

function getPredictedScoreKey(pick) {
  const homeScore = pick.prediction.home_score
  const awayScore = pick.prediction.away_score
  if (typeof homeScore !== 'number' || typeof awayScore !== 'number') return ''
  if (homeScore > 5 || awayScore > 5) {
    if (homeScore > awayScore) return '胜其他'
    if (homeScore < awayScore) return '负其他'
    return '平其他'
  }
  if (homeScore === awayScore && homeScore >= 4) return '平其他'
  return `${homeScore}:${awayScore}`
}

function getActualScoreKey(actual) {
  if (!actual) return ''
  if (actual.home > 5 || actual.away > 5) {
    if (actual.home > actual.away) return '胜其他'
    if (actual.home < actual.away) return '负其他'
    return '平其他'
  }
  if (actual.home === actual.away && actual.home >= 4) return '平其他'
  return `${actual.home}:${actual.away}`
}

function getActualResult(actual) {
  if (!actual) return ''
  return inferResultByScore(actual.home, actual.away)
}

function getActualHandicapResult(actual, rqNum) {
  if (!actual) return ''
  const adjustedHome = actual.home + rqNum
  if (adjustedHome > actual.away) return '胜'
  if (adjustedHome < actual.away) return '负'
  return '平'
}

function getActualTotalGoals(actual) {
  if (!actual) return ''
  const total = actual.home + actual.away
  return total >= 7 ? '7+' : String(total)
}

function getActualHalfFull(actual) {
  if (!actual) return ''
  const half = inferResultByScore(actual.half_home, actual.half_away)
  const full = inferResultByScore(actual.home, actual.away)
  return `${half}${full}`
}

function getScoreOutcome(scoreKey) {
  if (!scoreKey) return ''
  if (scoreKey === '胜其他') return '胜'
  if (scoreKey === '平其他') return '平'
  if (scoreKey === '负其他') return '负'
  const [homeText, awayText] = scoreKey.split(':')
  const homeScore = Number(homeText)
  const awayScore = Number(awayText)
  return inferResultByScore(homeScore, awayScore)
}

function getSelectedOption(market) {
  return market.options.find(option => option.selected) || null
}

function normalizeRealOdds(realOdds) {
  if (!realOdds) return null
  const scoreOdds = {}
  const halfFullOdds = {}
  const totalGoals = {}
  for (const [key, value] of Object.entries(realOdds.scoreOdds || {})) scoreOdds[normalizeScoreKey(key)] = Number(value) || 0
  for (const [key, value] of Object.entries(realOdds.bqcOdds || {})) halfFullOdds[normalizeHalfFullKey(key)] = Number(value) || 0
  for (const [key, value] of Object.entries(realOdds.totalGoals || {})) totalGoals[normalizeTotalGoalsKey(key)] = Number(value) || 0
  return { ...realOdds, scoreOdds, bqcOdds: halfFullOdds, totalGoals }
}

function buildSpfMarket(pick, oddsData, resultConf) {
  const selectedKey = pick.prediction.result_1x2 || inferResultByScore(pick.prediction.home_score, pick.prediction.away_score)
  const options = ['胜', '平', '负'].map(key => {
    const prob = key === selectedKey ? resultConf : Math.max(0.08, resultConf * (key === '平' ? 0.58 : 0.42))
    const odds = oddsData && ({ '胜': oddsData.sp3, '平': oddsData.sp1, '负': oddsData.sp0 }[key] || 0) || estimateOdds(prob)
    return { key, label: getResultLabel(key), odds: round2(odds), selected: key === selectedKey, prob, realOdds: !!(oddsData && odds > 0) }
  })
  return { type: 'spf', title: '胜平负', typeLabel: '胜平负', tags: ['单关', '过关'], confidence: resultConf, options }
}

function buildRqMarket(pick, oddsData, resultConf) {
  const rqNum = oddsData && typeof oddsData.rqNum === 'number' ? oddsData.rqNum : inferRqNum(pick)
  const selectedKey = inferHandicapResult(pick, rqNum)
  const options = ['胜', '平', '负'].map(key => {
    const prob = key === selectedKey ? Math.max(0.18, resultConf * 0.92) : Math.max(0.06, resultConf * (key === '平' ? 0.5 : 0.38))
    const odds = oddsData && ({ '胜': oddsData.rqSp3, '平': oddsData.rqSp1, '负': oddsData.rqSp0 }[key] || 0) || estimateOdds(prob)
    return { key, label: getResultLabel(key), odds: round2(odds), selected: key === selectedKey, prob, realOdds: !!(oddsData && odds > 0) }
  })
  return { type: 'rq', title: '让球胜平负', typeLabel: `让球(${getRqDisplay(rqNum)})`, tags: ['过关'], confidence: Math.max(0.18, resultConf * 0.92), handicap: rqNum, options }
}

function buildScoreMarket(pick, oddsData, scoreConf) {
  const selectedKey = getPredictedScoreKey(pick)
  const [predHome, predAway] = selectedKey.includes(':') ? selectedKey.split(':').map(Number) : [null, null]
  const options = SCORE_OPTIONS.map(key => {
    let factor = 0.18
    if (key === selectedKey) factor = 1
    else if (selectedKey.endsWith('其他') && getScoreOutcome(key) === getScoreOutcome(selectedKey)) factor = 0.46
    else if (selectedKey.includes(':') && key.includes(':')) {
      const [homeScore, awayScore] = key.split(':').map(Number)
      const distance = Math.abs(homeScore - predHome) + Math.abs(awayScore - predAway)
      if (distance === 1) factor = 0.55
      else if (distance === 2) factor = 0.4
      else if (getScoreOutcome(key) === getScoreOutcome(selectedKey)) factor = 0.28
    } else if (getScoreOutcome(key) === getScoreOutcome(selectedKey)) factor = 0.24
    const prob = Math.max(0.01, scoreConf * factor)
    const odds = oddsData?.scoreOdds?.[key] || estimateOdds(prob)
    return { key, label: key, odds: round2(odds), selected: key === selectedKey, prob, realOdds: !!(oddsData?.scoreOdds?.[key]) }
  })
  return { type: 'bf', title: '比分', typeLabel: '比分', tags: ['单关', '过关'], confidence: scoreConf, options }
}

function buildTotalMarket(pick, oddsData, totalConf) {
  const primary = normalizeTotalGoalsKey(pick.prediction.total_goals || '')
  const secondary = normalizeTotalGoalsKey(pick.prediction.total_goals_2 || '')
  const primaryNum = primary === '7+' ? 7 : Number(primary || 0)
  const secondaryNum = secondary === '7+' ? 7 : Number(secondary || 0)
  const options = TOTAL_GOAL_OPTIONS.map(key => {
    const currentNum = key === '7+' ? 7 : Number(key)
    let factor = 0.18
    if (key === primary) factor = 1
    else if (secondary && key === secondary) factor = 0.82
    else {
      const nearPrimary = Math.abs(currentNum - primaryNum)
      const nearSecondary = secondary ? Math.abs(currentNum - secondaryNum) : 10
      const near = Math.min(nearPrimary, nearSecondary)
      if (near === 1) factor = 0.56
      else if (near === 2) factor = 0.34
    }
    const prob = Math.max(0.03, totalConf * factor)
    const odds = oddsData?.totalGoals?.[key] || estimateOdds(prob)
    return { key, label: key, odds: round2(odds), selected: key === primary, secondary: !!secondary && key === secondary, prob, realOdds: !!(oddsData?.totalGoals?.[key]) }
  })
  return { type: 'zq', title: '总进球', typeLabel: '总进球', tags: ['单关', '过关'], confidence: totalConf, options }
}

function buildHalfFullMarket(pick, oddsData, halfFullConf) {
  const selectedKey = normalizeHalfFullKey(pick.prediction.half_full_result || '')
  const options = HALF_FULL_OPTIONS.map(key => {
    let factor = 0.16
    if (key === selectedKey) factor = 1
    else if (key[1] === selectedKey[1]) factor = 0.42
    else if (key[0] === selectedKey[0]) factor = 0.34
    const prob = Math.max(0.015, halfFullConf * factor)
    const odds = oddsData?.bqcOdds?.[key] || estimateOdds(prob)
    return { key, label: key, odds: round2(odds), selected: key === selectedKey, prob, realOdds: !!(oddsData?.bqcOdds?.[key]) }
  })
  return { type: 'bqc', title: '半全场胜平负', typeLabel: '半全场', tags: ['单关', '过关'], confidence: halfFullConf, options }
}

function selectBetFromMarkets(markets) {
  const candidates = markets.map(market => {
    const option = getSelectedOption(market)
    if (!option) return null
    // 这里按体彩页面的“稳胆优先”思路选每场最终展示玩法，避免比分类玩法过度抢占推荐位。
    const rankScore = (market.confidence * 0.72 + Math.min(option.odds / 10, 1) * 0.28) * (MARKET_WEIGHT_MAP[market.type] || 1)
    return {
      type: market.type,
      typeLabel: market.typeLabel,
      marketTitle: market.title,
      marketTags: market.tags,
      betName: option.label,
      optionKey: option.key,
      odds: option.odds,
      prob: market.confidence,
      realOdds: option.realOdds,
      handicap: market.handicap,
      rankScore,
    }
  }).filter(Boolean)

  candidates.sort((a, b) => b.rankScore - a.rankScore)
  return candidates[0] || null
}

function buildRecommendationPackage(picks, realOddsMap) {
  const enrichedPicks = picks.map(pick => {
    const oddsData = normalizeRealOdds(realOddsMap?.[pick.match_id])
    const confidence = parseConfidence(pick.prediction.confidence_detail)
    const markets = [
      buildSpfMarket(pick, oddsData, confidence[1] || 0.5),
      buildRqMarket(pick, oddsData, confidence[1] || 0.5),
      buildScoreMarket(pick, oddsData, confidence[0] || 0.05),
      buildTotalMarket(pick, oddsData, confidence[2] || 0.3),
      buildHalfFullMarket(pick, oddsData, confidence[3] || 0.15),
    ]
    const selectedBet = selectBetFromMarkets(markets)
    return { ...pick, markets, selectedBet }
  })

  return { picks: enrichedPicks, betSlip: buildBetSlip(enrichedPicks) }
}

function buildBetSlip(picks) {
  const selectedMatches = picks.filter(pick => pick.selectedBet)
  if (selectedMatches.length === 0) {
    return { type: '混合过关', passType: '', passOptions: [], matches: [], combinedOdds: 0, amount: 0, 注数: 0, multiple: 1, payout: 0, status: 'pending', potentialPayout: 0 }
  }

  const maxPass = selectedMatches.some(match => ['bf', 'bqc'].includes(match.selectedBet.type))
    ? 4
    : selectedMatches.some(match => match.selectedBet.type === 'zq')
      ? 6
      : 8
  const passSize = selectedMatches.length === 1 ? 1 : Math.min(selectedMatches.length, maxPass)
  const passOptions = selectedMatches.length === 1
    ? ['单关']
    : Array.from({ length: passSize - 1 }, (_, index) => `${index + 2}串1`)
  const combinedOdds = round2(selectedMatches.reduce((total, pick) => total * pick.selectedBet.odds, 1))
  const amount = selectedMatches.length > 0 ? 2 : 0

  return {
    type: selectedMatches.length === 1 ? '单场推荐' : '混合过关',
    passType: selectedMatches.length === 1 ? '单关' : `${passSize}串1`,
    passOptions,
    matches: selectedMatches.map(pick => ({
      matchId: pick.match_id,
      home: pick.home,
      away: pick.away,
      type: pick.selectedBet.type,
      typeLabel: pick.selectedBet.typeLabel,
      marketTitle: pick.selectedBet.marketTitle,
      marketTags: pick.selectedBet.marketTags,
      betName: pick.selectedBet.betName,
      optionKey: pick.selectedBet.optionKey,
      odds: pick.selectedBet.odds,
      prob: pick.selectedBet.prob,
      realOdds: pick.selectedBet.realOdds,
      handicap: pick.selectedBet.handicap,
      won: null,
    })),
    combinedOdds,
    amount,
    注数: selectedMatches.length > 0 ? 1 : 0,
    multiple: 1,
    payout: 0,
    status: 'pending',
    potentialPayout: round2(amount * combinedOdds),
  }
}

function settleBetSlip(betSlip, picks) {
  if (!betSlip || betSlip.matches.length === 0) return betSlip

  const settledMatches = betSlip.matches.map(match => {
    const pick = picks.find(item => item.match_id === match.matchId)
    if (!pick?.actual) return { ...match, won: null }

    let won = false
    if (match.type === 'spf') won = getActualResult(pick.actual) === match.optionKey
    if (match.type === 'rq') won = getActualHandicapResult(pick.actual, match.handicap || 0) === match.optionKey
    if (match.type === 'zq') won = getActualTotalGoals(pick.actual) === match.optionKey
    if (match.type === 'bf') won = getActualScoreKey(pick.actual) === match.optionKey
    if (match.type === 'bqc') won = getActualHalfFull(pick.actual) === match.optionKey

    return { ...match, won }
  })

  const allSettled = settledMatches.every(match => match.won !== null)
  const hasLost = settledMatches.some(match => match.won === false)
  const allWon = settledMatches.length > 0 && settledMatches.every(match => match.won === true)
  const payout = allWon ? round2(betSlip.amount * betSlip.combinedOdds) : 0
  const status = hasLost ? 'lost' : allSettled ? 'won' : 'pending'

  return { ...betSlip, matches: settledMatches, payout, status }
}

router.get('/', async (req, res) => {
  const db = getDb()
  const todayStr = getBeijingDateStr()
  console.log(`[Recommend] 当前北京时间日期: ${todayStr}`)

  // 拉取体彩赔率
  let realOddsMap = {}
  try {
    const realOdds = await fetchOdds()
    if (realOdds && Object.keys(realOdds).length > 0) {
      const allTeams = db.prepare('SELECT id, name, name_cn FROM teams').all()
      const teamNames = {}
      for (const t of allTeams) teamNames[t.id] = t.name_cn || t.name
      const allMatches = db.prepare('SELECT id, home_team_id, away_team_id FROM matches').all()
      for (const m of allMatches) {
        const h = teamNames[m.home_team_id]; const a = teamNames[m.away_team_id]
        if (h && a) { const o = getOddsForMatch(h, a); if (o) realOddsMap[m.id] = o }
      }
      if (Object.keys(realOddsMap).length > 0) console.log(`[Odds] 匹配 ${Object.keys(realOddsMap).length} 场`)
    }
  } catch (e) { /* odds fetch failed */ }

  const todayCount = db.prepare(`
    SELECT COUNT(*) as c FROM matches
    WHERE match_date = ? AND status != 'completed'
      AND home_team_id IS NOT NULL AND home_team_id != ''
  `).get(todayStr).c

  // 找下一个有未完赛的日期（>= 今天）
  let startDate = todayStr
  if (todayCount === 0) {
    const nextMatch = db.prepare(`
      SELECT match_date FROM matches
      WHERE status != 'completed'
        AND home_team_id IS NOT NULL AND home_team_id != ''
        AND match_date >= ?
      ORDER BY match_date ASC
      LIMIT 1
    `).get(todayStr)
    if (nextMatch) startDate = nextMatch.match_date
  }

  // 默认只推荐1天，如果该天不足2场则扩展到2天
  const day1Count = db.prepare(`
    SELECT COUNT(*) as c FROM matches
    WHERE match_date = ? AND status != 'completed'
      AND home_team_id IS NOT NULL AND home_team_id != ''
  `).get(startDate).c

  let endDateStr = startDate
  if (day1Count < 2) {
    const end_date = new Date(startDate + 'T00:00:00')
    end_date.setDate(end_date.getDate() + 1)
    endDateStr = end_date.toISOString().split('T')[0]
  }

  const upcoming = db.prepare(`
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
    WHERE m.status != 'completed' AND m.match_date >= ? AND m.match_date <= ?
      AND m.home_team_id IS NOT NULL AND m.home_team_id != ''
    ORDER BY m.match_date ASC, m.match_time ASC
  `).all(startDate, endDateStr)

  // 已完成比赛
  const past = db.prepare(`
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
    WHERE m.status = 'completed'
    ORDER BY m.match_date DESC, m.match_number ASC
  `).all()

  // 过期但未完成的比赛（日期已过但状态仍为scheduled/live）
  const orphaned = db.prepare(`
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
    WHERE m.status != 'completed' AND m.match_date < ?
      AND m.home_team_id IS NOT NULL AND m.home_team_id != ''
    ORDER BY m.match_date DESC, m.match_number ASC
  `).all(startDate)

  function formatPick(r) {
    const isCompleted = r.status === 'completed'
    const isPending = !isCompleted && r.match_date < startDate
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
      pending: isPending,
      actual: isCompleted ? {
        home: r.actual_home, away: r.actual_away,
        half_home: r.actual_half_home, half_away: r.actual_half_away,
      } : null,
      hits: isCompleted ? computeHits(r) : null,
    }
  }

  function computeHits(r) {
    const a = { home: r.actual_home, away: r.actual_away, half_home: r.actual_half_home, half_away: r.actual_half_away }
    return {
      score: (r.home_score === a.home && r.away_score === a.away) ? 1 : 0,
      result: (() => { const x = a.home > a.away ? '胜' : a.home < a.away ? '负' : '平'; return r.result_1x2 === x ? 1 : 0 })(),
      total: (() => { const t = a.home + a.away >= 7 ? '7+' : String(a.home + a.away); return (r.total_goals === t || r.total_goals_2 === t) ? 1 : 0 })(),
      half_full: (() => { const h = a.half_home > a.half_away ? '胜' : a.half_home < a.half_away ? '负' : '平'; const f = a.home > a.away ? '胜' : a.home < a.away ? '负' : '平'; return r.half_full_result === `${h}-${f}` ? 1 : 0 })(),
      rq_result: (() => {
        if (!r.handicap_result) return 0
        const rq = r.handicap_result.replace('让球', '')
        const x = a.home > a.away ? '胜' : a.home < a.away ? '负' : '平'
        return rq === x ? 1 : 0
      })(),
    }
  }

  const activePicks = upcoming.map(formatPick)

  // 搏冷分析
  const upsetAnalysis = activePicks.map(pick => ({
    matchId: pick.match_id,
    home: pick.home,
    away: pick.away,
    ...analyzeUpset(pick),
  }))

  const activePack = buildRecommendationPackage(activePicks, realOddsMap)
  const activeBetSlip = settleBetSlip(activePack.betSlip, activePack.picks)
  const activeDailyProfit = activeBetSlip.status === 'won'
    ? round2(activeBetSlip.payout - activeBetSlip.amount)
    : activeBetSlip.status === 'lost'
      ? round2(-activeBetSlip.amount)
      : 0

  // 历史记录
  const pastByDate = {}
  for (const r of past) {
    const date = r.match_date || 'unknown'
    if (!pastByDate[date]) pastByDate[date] = []
    if (pastByDate[date].length < 16) pastByDate[date].push(r)
  }
  // 合并过期未完成的比赛到历史记录中
  for (const r of orphaned) {
    const date = r.match_date || 'unknown'
    if (!pastByDate[date]) pastByDate[date] = []
    if (pastByDate[date].length < 16) pastByDate[date].push(r)
  }
  const pastDays = Object.entries(pastByDate).map(([date, rows]) => {
    const dayPack = buildRecommendationPackage(rows.map(formatPick), realOddsMap)
    const slip = settleBetSlip(dayPack.betSlip, dayPack.picks)
    const dailyProfit = slip.status === 'won'
      ? round2(slip.payout - slip.amount)
      : slip.status === 'lost'
        ? round2(-slip.amount)
        : 0
    return { date, picks: dayPack.picks, betSlip: slip, dailyProfit }
  })

  res.json({
    active: {
      date: startDate,
      picks: activePack.picks,
      betSlip: activeBetSlip,
      dailyProfit: activeDailyProfit,
    },
    upsetAnalysis,
    past: pastDays,
  })
})

module.exports = router
