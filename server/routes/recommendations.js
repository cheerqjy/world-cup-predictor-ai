const express = require('express')
const { getDb } = require('../db')
const { fetchOdds, getOddsForMatch, generateSyntheticOdds } = require('../odds')
const { getBeijingDateStr, getBeijingNow, getRecommendDate, isMatchExpired, getBeijingHourMin } = require('../tz')

const router = express.Router()

function parseConfidence(detail) {
  if (!detail) return [0.05, 0.5, 0.3, 0.15]
  try { return JSON.parse(detail) } catch { return [0.05, 0.5, 0.3, 0.15] }
}

function estimateOdds(prob) {
  if (prob <= 0) return 0
  return Math.round(Math.min(50, Math.max(1.1, 1 / prob * 0.9)) * 100) / 100
}

function poissonProb(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0
  let p = Math.exp(-lambda)
  for (let i = 1; i <= k; i++) p *= lambda / i
  return p
}

function computeScoreGrid(homeRanking, awayRanking) {
  const diff = awayRanking - homeRanking
  const rankGap = Math.abs(diff)
  let hXg = 1.55 + diff / 48
  let aXg = 1.15 - diff / 48
  if (rankGap > 40) { hXg += 0.3; aXg -= 0.15 }
  hXg = Math.max(0.4, Math.min(4.0, hXg))
  aXg = Math.max(0.3, Math.min(3.5, aXg))
  const grid = []
  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      grid.push({ h, a, prob: poissonProb(h, hXg) * poissonProb(a, aXg) })
    }
  }
  return { grid, hXg, aXg }
}

function computeBetProbs(homeRanking, awayRanking) {
  const { grid } = computeScoreGrid(homeRanking, awayRanking)
  const spf = { '胜': 0, '平': 0, '负': 0 }
  const zq = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 }
  const bf = {}
  let bfWinOther = 0, bfDrawOther = 0, bfLoseOther = 0
  const bqc = { '胜胜': 0, '胜平': 0, '胜负': 0, '平胜': 0, '平平': 0, '平负': 0, '负胜': 0, '负平': 0, '负负': 0 }
  for (const s of grid) {
    const { h, a, prob } = s
    const result = h > a ? '胜' : h < a ? '负' : '平'
    spf[result] += prob
    const total = h + a >= 7 ? '7+' : String(h + a)
    zq[total] = (zq[total] || 0) + prob
    const scoreKey = `${h}:${a}`
    if (SCORE_OPTIONS.includes(scoreKey)) {
      bf[scoreKey] = (bf[scoreKey] || 0) + prob
    } else {
      if (h > a) bfWinOther += prob
      else if (h === a) bfDrawOther += prob
      else bfLoseOther += prob
    }
    const halfH = h > 0 ? Math.max(1, Math.round(h * 0.45)) : 0
    const halfA = a > 0 ? Math.max(1, Math.round(a * 0.42)) : 0
    const adjHalfH = Math.min(halfH, h)
    const adjHalfA = Math.min(halfA, a)
    const halfResult = adjHalfH > adjHalfA ? '胜' : adjHalfH < adjHalfA ? '负' : '平'
    const fullResult = h > a ? '胜' : h < a ? '负' : '平'
    const hfKey = `${halfResult}${fullResult}`
    if (bqc[hfKey] !== undefined) bqc[hfKey] += prob
  }
  if (bfWinOther > 0) bf['胜其他'] = bfWinOther
  if (bfDrawOther > 0) bf['平其他'] = bfDrawOther
  if (bfLoseOther > 0) bf['负其他'] = bfLoseOther
  for (const k of Object.keys(bf)) bf[k] = Math.round(bf[k] * 10000) / 10000
  for (const k of Object.keys(zq)) zq[k] = Math.round(zq[k] * 10000) / 10000
  for (const k of Object.keys(bqc)) bqc[k] = Math.round(bqc[k] * 10000) / 10000
  return { spf, zq, bf, bqc }
}

function computeRqProbs(homeRanking, awayRanking, rqNum) {
  const { grid } = computeScoreGrid(homeRanking, awayRanking)
  const rq = { '胜': 0, '平': 0, '负': 0 }
  for (const s of grid) {
    const adjHome = s.h + rqNum
    const r = adjHome > s.a ? '胜' : adjHome < s.a ? '负' : '平'
    rq[r] += s.prob
  }
  return rq
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
  // 体彩让球规则：正数=主队受让（弱队），负数=主队让球（强队）
  if (rqNum > 0) return `受让${rqNum}`
  if (rqNum < 0) return `让${Math.abs(rqNum)}`
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
    let oddsData = normalizeRealOdds(realOddsMap?.[pick.match_id])
    // 没有真实赔率时，用 Poisson 合成赔率兜底
    if (!oddsData) {
      const rqNum = Math.round(((pick.home?.ranking || 50) - (pick.away?.ranking || 50)) / 25)
      oddsData = generateSyntheticOdds(pick.home?.ranking || 50, pick.away?.ranking || 50, rqNum)
    }
    const confidence = parseConfidence(pick.prediction.confidence_detail)
    const markets = [
      buildSpfMarket(pick, oddsData, confidence[1] || 0.5),
      buildRqMarket(pick, oddsData, confidence[1] || 0.5),
      buildScoreMarket(pick, oddsData, confidence[0] || 0.05),
      buildTotalMarket(pick, oddsData, confidence[2] || 0.3),
      buildHalfFullMarket(pick, oddsData, confidence[3] || 0.15),
    ]
    const selectedBet = selectBetFromMarkets(markets)
    const bestValueBet = selectBestValueBet(pick, selectedBet, oddsData)
    const bestScoreBet = selectBestScoreBet(pick, oddsData)
    return { ...pick, markets, selectedBet, bestValueBet, bestScoreBet }
  })

  return { picks: enrichedPicks, betSlip: buildBetSlip(enrichedPicks), betSlip2: buildBetSlip2(enrichedPicks), betSlip3: buildBetSlip3(enrichedPicks) }
}

function selectBestValueBet(pick, scheme1Bet, oddsData) {
  const homeRank = pick.home?.ranking || 50
  const awayRank = pick.away?.ranking || 50
  const probs = computeBetProbs(homeRank, awayRank)
  const rqNum = oddsData && typeof oddsData.rqNum === 'number' ? oddsData.rqNum : inferRqNum(pick)
  const rqProbs = computeRqProbs(homeRank, awayRank, rqNum)

  const hasHAD = oddsData && (oddsData.hasHAD !== false) && (oddsData.sp3 > 0 || oddsData.sp1 > 0 || oddsData.sp0 > 0)
  const hasHHAD = oddsData && (oddsData.hasHHAD !== false) && (oddsData.rqSp3 > 0 || oddsData.rqSp1 > 0 || oddsData.rqSp0 > 0)

  const getRealOdds = (type, key) => {
    if (type === 'spf') return oddsData?.[({ '胜': 'sp3', '平': 'sp1', '负': 'sp0' }[key])] || 0
    if (type === 'rq') return oddsData?.[({ '胜': 'rqSp3', '平': 'rqSp1', '负': 'rqSp0' }[key])] || 0
    if (type === 'bqc') return oddsData?.bqcOdds?.[key] || 0
    return 0
  }

  const getProb = (type, key) => {
    if (type === 'spf') return probs.spf[key] || 0
    if (type === 'rq') return rqProbs[key] || 0
    if (type === 'bqc') return probs.bqc[key] || 0
    return 0
  }

  const candidates = []

  if (hasHAD) {
    for (const [k1, k2] of [['胜', '平'], ['平', '负'], ['胜', '负']]) {
      const p1 = getProb('spf', k1); const p2 = getProb('spf', k2)
      const o1 = getRealOdds('spf', k1); const o2 = getRealOdds('spf', k2)
      if (p1 <= 0 || p2 <= 0 || o1 <= 0 || o2 <= 0) continue
      candidates.push({
        type: 'spf', typeLabel: '胜平负', marketTitle: '胜平负', marketTags: ['单关', '过关'],
        betName: getResultLabel(k1), optionKey: k1,
        optionKey2: k2, betName2: getResultLabel(k2),
        odds: round2(o1), odds2: round2(o2),
        prob: round2(p1 + p2), realProb: round2(p1 + p2), realOdds: true,
      })
    }
  }

  if (hasHHAD) {
    for (const [k1, k2] of [['胜', '平'], ['平', '负'], ['胜', '负']]) {
      const p1 = getProb('rq', k1); const p2 = getProb('rq', k2)
      const o1 = getRealOdds('rq', k1); const o2 = getRealOdds('rq', k2)
      if (p1 <= 0 || p2 <= 0 || o1 <= 0 || o2 <= 0) continue
      candidates.push({
        type: 'rq', typeLabel: `让球(${getRqDisplay(rqNum)})`, marketTitle: '让球胜平负', marketTags: ['过关'],
        betName: getResultLabel(k1), optionKey: k1, handicap: rqNum,
        optionKey2: k2, betName2: getResultLabel(k2),
        odds: round2(o1), odds2: round2(o2),
        prob: round2(p1 + p2), realProb: round2(p1 + p2), realOdds: true,
      })
    }
  }

  if (hasHAD) {
    for (const [k1, k2] of [['胜胜', '平胜'], ['负负', '平负']]) {
      const p1 = probs.bqc[k1] || 0; const p2 = probs.bqc[k2] || 0
      const o1 = oddsData?.bqcOdds?.[k1] || 0; const o2 = oddsData?.bqcOdds?.[k2] || 0
      if (p1 <= 0 || p2 <= 0 || o1 <= 0 || o2 <= 0) continue
      candidates.push({
        type: 'bqc', typeLabel: '半全场', marketTitle: '半全场胜平负', marketTags: ['单关', '过关'],
        betName: k1, optionKey: k1,
        optionKey2: k2, betName2: k2,
        odds: round2(o1), odds2: round2(o2),
        prob: round2(p1 + p2), realProb: round2(p1 + p2), realOdds: true,
      })
    }
  }

  candidates.sort((a, b) => b.realProb - a.realProb)

  if (candidates[0] && candidates[0].realProb >= 0.70) return candidates[0]

  return null
}

function selectBestScoreBet(pick, oddsData) {
  const homeRank = pick.home?.ranking || 50
  const awayRank = pick.away?.ranking || 50
  const { grid } = computeScoreGrid(homeRank, awayRank)
  const homeScore = typeof pick.prediction.home_score === 'number' ? pick.prediction.home_score : 0
  const awayScore = typeof pick.prediction.away_score === 'number' ? pick.prediction.away_score : 0

  const scoreProbs = grid.map(s => ({ key: `${s.h}:${s.a}`, prob: s.prob }))
  scoreProbs.sort((a, b) => b.prob - a.prob)

  const top2 = scoreProbs.slice(0, 2)
  if (top2.length < 2) return null

  const getScoreOdds = (key) => {
    if (oddsData?.scoreOdds?.[key]) return Number(oddsData.scoreOdds[key]) || 0
    return 0
  }

  const o1 = getScoreOdds(top2[0].key)
  const o2 = getScoreOdds(top2[1].key)

  return {
    type: 'bf', typeLabel: '比分', marketTitle: '比分', marketTags: ['单关'],
    betName: top2[0].key, optionKey: top2[0].key,
    odds: o1 > 0 ? round2(o1) : round2(estimateOdds(top2[0].prob)),
    prob: round2(top2[0].prob),
    optionKey2: top2[1].key, betName2: top2[1].key,
    odds2: o2 > 0 ? round2(o2) : round2(estimateOdds(top2[1].prob)),
    prob2: round2(top2[1].prob),
    combinedProb: round2(top2[0].prob + top2[1].prob),
    realOdds: !!(o1 > 0 || o2 > 0),
  }
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

function buildBetSlip2(picks) {
  const selectedMatches = picks.filter(pick => pick.bestValueBet)
  if (selectedMatches.length === 0) {
    return { type: '混合过关', passType: '', passOptions: [], matches: [], combinedOdds: 0, amount: 0, 注数: 0, multiple: 1, payout: 0, status: 'pending', potentialPayout: 0 }
  }

  // 按 realProb 降序排序，取前3场（最高胜率组合）
  const sorted = [...selectedMatches].sort((a, b) => b.bestValueBet.realProb - a.bestValueBet.realProb)
  const top = sorted.slice(0, 3)

  const maxPass = top.some(match => match.bestValueBet.type === 'bf' || match.bestValueBet.type === 'bqc')
    ? 4
    : top.some(match => match.bestValueBet.type === 'zq')
      ? 6
      : 8
  const passSize = top.length === 1 ? 1 : Math.min(top.length, maxPass)
  const passOptions = top.length === 1
    ? ['单关']
    : Array.from({ length: passSize - 1 }, (_, index) => `${index + 2}串1`)
  const combinedOdds = round2(top.reduce((total, pick) => total * pick.bestValueBet.odds, 1))
  const optionsPerMatch = 2  // 每场双选
  const totalZhu = top.length > 0 ? Math.pow(optionsPerMatch, top.length) : 0
  const amount = totalZhu * 2

  return {
    type: '双选稳胆',
    passType: top.length === 1 ? '单关' : `${passSize}串1`,
    passOptions,
    matches: top.map(pick => ({
      matchId: pick.match_id,
      home: pick.home,
      away: pick.away,
      type: pick.bestValueBet.type,
      typeLabel: pick.bestValueBet.typeLabel,
      marketTitle: pick.bestValueBet.marketTitle,
      marketTags: pick.bestValueBet.marketTags,
      betName: pick.bestValueBet.betName,
      optionKey: pick.bestValueBet.optionKey,
      odds: pick.bestValueBet.odds,
      prob: pick.bestValueBet.prob,
      realOdds: false,
      handicap: pick.bestValueBet.handicap,
      optionKey2: pick.bestValueBet.optionKey2,
      betName2: pick.bestValueBet.betName2,
      odds2: pick.bestValueBet.odds2,
      won: null,
    })),
    combinedOdds,
    amount,
    注数: totalZhu,
    multiple: 1,
    payout: 0,
    status: 'pending',
    potentialPayout: round2(2 * combinedOdds),  // 双选实际只有1注能中
  }
}

function buildBetSlip3(picks) {
  const selectedMatches = picks.filter(pick => pick.bestScoreBet)
  if (selectedMatches.length === 0) {
    return { type: '比分双选', passType: '', passOptions: [], matches: [], combinedOdds: 0, amount: 0, 注数: 0, multiple: 1, payout: 0, status: 'pending', potentialPayout: 0 }
  }

  const sorted = [...selectedMatches].sort((a, b) => b.bestScoreBet.combinedProb - a.bestScoreBet.combinedProb)
  const top = sorted.slice(0, 3)

  const passSize = top.length === 1 ? 1 : Math.min(top.length, 4)
  const passOptions = top.length === 1
    ? ['单关']
    : Array.from({ length: passSize - 1 }, (_, index) => `${index + 2}串1`)
  const combinedOdds = round2(top.reduce((total, pick) => total * pick.bestScoreBet.odds, 1))
  const optionsPerMatch = 2
  const totalZhu = top.length > 0 ? Math.pow(optionsPerMatch, top.length) : 0
  const amount = totalZhu * 2

  return {
    type: '比分双选',
    passType: top.length === 1 ? '单关' : `${passSize}串1`,
    passOptions,
    matches: top.map(pick => ({
      matchId: pick.match_id,
      home: pick.home,
      away: pick.away,
      type: pick.bestScoreBet.type,
      typeLabel: pick.bestScoreBet.typeLabel,
      marketTitle: pick.bestScoreBet.marketTitle,
      marketTags: pick.bestScoreBet.marketTags,
      betName: pick.bestScoreBet.betName,
      optionKey: pick.bestScoreBet.optionKey,
      odds: pick.bestScoreBet.odds,
      prob: pick.bestScoreBet.prob,
      realOdds: pick.bestScoreBet.realOdds,
      handicap: pick.bestScoreBet.handicap,
      optionKey2: pick.bestScoreBet.optionKey2,
      betName2: pick.bestScoreBet.betName2,
      odds2: pick.bestScoreBet.odds2,
      prob2: pick.bestScoreBet.prob2,
      combinedProb: pick.bestScoreBet.combinedProb,
      won: null,
    })),
    combinedOdds,
    amount,
    注数: totalZhu,
    multiple: 1,
    payout: 0,
    status: 'pending',
    potentialPayout: round2(2 * combinedOdds),
  }
}

function settleBetSlip(betSlip, picks) {
  if (!betSlip || betSlip.matches.length === 0) return betSlip

  const settledMatches = betSlip.matches.map(match => {
    const pick = picks.find(item => item.match_id === match.matchId)
    if (!pick?.actual) return { ...match, won: null }

    let won = false, wonKey = null
    if (match.type === 'spf') {
      const result = getActualResult(pick.actual)
      won = result === match.optionKey || result === match.optionKey2
      wonKey = result
    }
    if (match.type === 'rq') {
      const result = getActualHandicapResult(pick.actual, match.handicap || 0)
      won = result === match.optionKey || result === match.optionKey2
      wonKey = result
    }
    if (match.type === 'zq') {
      const result = getActualTotalGoals(pick.actual)
      won = result === match.optionKey || result === match.optionKey2
      wonKey = result
    }
    if (match.type === 'bf') {
      const result = getActualScoreKey(pick.actual)
      won = result === match.optionKey || result === match.optionKey2
      wonKey = result
    }
    if (match.type === 'bqc') {
      const result = getActualHalfFull(pick.actual)
      won = result === match.optionKey || result === match.optionKey2
      wonKey = result
    }

    return { ...match, won, wonKey }
  })

  const allSettled = settledMatches.every(match => match.won !== null)
  const hasLost = settledMatches.some(match => match.won === false)
  const allWon = settledMatches.length > 0 && settledMatches.every(match => match.won === true)
  // 双选稳胆：按实际命中的选项赔率计算
  let payout = 0
  if (allWon) {
    const isShuangXuan = betSlip.type === '双选稳胆' || betSlip.type === '比分双选'
    if (isShuangXuan) {
      // 每个双选场次取实际命中的那个选项的赔率
      const actualCombinedOdds = round2(settledMatches.reduce((total, match) => {
        const winningOdds = match.wonKey === match.optionKey ? match.odds : (match.odds2 || match.odds)
        return total * winningOdds
      }, 1))
      payout = round2(2 * actualCombinedOdds)
    } else {
      payout = round2(betSlip.amount * betSlip.combinedOdds)
    }
  }
  const status = hasLost ? 'lost' : allSettled ? 'won' : 'pending'

  return { ...betSlip, matches: settledMatches, payout, status }
}

router.get('/', async (req, res) => {
  const db = getDb()
  const todayStr = getRecommendDate() // 11点开售，11点前算昨天
  console.log(`[Recommend] 当前推荐日期: ${todayStr}`)

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

  // 计算停售截止时间（北京时间）：当前时间用于过滤已过停售时间的比赛
  // 停售规则：开球前15分钟停止销售
  const nowBeijing = getBeijingNow()
  const nowHour = parseInt(nowBeijing.toISOString().substring(11, 13))
  const nowMin = parseInt(nowBeijing.toISOString().substring(14, 16))
  const nowTotalMin = nowHour * 60 + nowMin
  const beijingToday = getBeijingDateStr()

  // 计算某场比赛是否已过停售时间
  const isMatchOnSale = (matchDate, matchTime) => {
    if (matchDate > beijingToday) return true  // 未来的日期，全部可买
    if (matchDate < beijingToday) return false  // 过去的日期，不可买
    if (!matchTime) return true
    const [h, m] = matchTime.split(':').map(Number)
    const matchTotalMin = h * 60 + m
    const cutoffTotalMin = matchTotalMin - 15
    return nowTotalMin < cutoffTotalMin
  }

  // 查询当天所有未完成比赛（用于判断是否有可买的比赛）
  const todayAllMatches = db.prepare(`
    SELECT m.match_date, m.match_time FROM matches m
    WHERE m.match_date = ? AND m.status != 'completed'
      AND m.home_team_id IS NOT NULL AND m.home_team_id != ''
  `).all(todayStr)

  // 过滤出仍在销售中的比赛
  const todayOnSaleMatches = todayAllMatches.filter(m => isMatchOnSale(m.match_date, m.match_time))

  // 找下一个有可买比赛的日期（>= 今天）
  let startDate = todayStr
  if (todayOnSaleMatches.length === 0) {
    // 今天没有可买的比赛，找下一个有比赛的日期
    const nextMatch = db.prepare(`
      SELECT match_date, match_time FROM matches
      WHERE status != 'completed'
        AND home_team_id IS NOT NULL AND home_team_id != ''
        AND match_date >= ?
      ORDER BY match_date ASC
      LIMIT 10
    `).all(todayStr)
    // 找第一个有可买比赛的日期
    for (const m of nextMatch) {
      if (isMatchOnSale(m.match_date, m.match_time)) {
        startDate = m.match_date
        break
      }
    }
    // 如果都没找到，用第一个未来的日期
    if (startDate === todayStr && nextMatch.length > 0) {
      startDate = nextMatch[0].match_date
    }
  }

  // 默认只推荐1天，如果该天不足2场可买比赛则扩展到2天
  const day1AllMatches = db.prepare(`
    SELECT m.match_date, m.match_time FROM matches m
    WHERE m.match_date = ? AND m.status != 'completed'
      AND m.home_team_id IS NOT NULL AND m.home_team_id != ''
  `).all(startDate)
  const day1Count = day1AllMatches.filter(m => isMatchOnSale(m.match_date, m.match_time)).length

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

  // 过滤掉已过停售时间的比赛（开球前15分钟）
  const filteredUpcoming = upcoming.filter(r => isMatchOnSale(r.match_date, r.match_time))

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

  const activePicks = filteredUpcoming.map(formatPick)

  // 搏冷分析
  const upsetAnalysis = activePicks.map(pick => ({
    matchId: pick.match_id,
    home: pick.home,
    away: pick.away,
    ...analyzeUpset(pick),
  }))

  const activePack = buildRecommendationPackage(activePicks, realOddsMap)
  const activeBetSlip = settleBetSlip(activePack.betSlip, activePack.picks)
  const activeBetSlip2 = settleBetSlip(activePack.betSlip2, activePack.picks)
  const activeBetSlip3 = settleBetSlip(activePack.betSlip3, activePack.picks)
  const activeDailyProfit = activeBetSlip.status === 'won'
    ? round2(activeBetSlip.payout - activeBetSlip.amount)
    : activeBetSlip.status === 'lost'
      ? round2(-activeBetSlip.amount)
      : 0
  const activeDailyProfit2 = activeBetSlip2.status === 'won'
    ? round2(activeBetSlip2.payout - activeBetSlip2.amount)
    : activeBetSlip2.status === 'lost'
      ? round2(-activeBetSlip2.amount)
      : 0
  const activeDailyProfit3 = activeBetSlip3.status === 'won'
    ? round2(activeBetSlip3.payout - activeBetSlip3.amount)
    : activeBetSlip3.status === 'lost'
      ? round2(-activeBetSlip3.amount)
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
    const slip2 = settleBetSlip(dayPack.betSlip2, dayPack.picks)
    const slip3 = settleBetSlip(dayPack.betSlip3, dayPack.picks)
    const dailyProfit = slip.status === 'won'
      ? round2(slip.payout - slip.amount)
      : slip.status === 'lost'
        ? round2(-slip.amount)
        : 0
    const dailyProfit2 = slip2.status === 'won'
      ? round2(slip2.payout - slip2.amount)
      : slip2.status === 'lost'
        ? round2(-slip2.amount)
        : 0
    const dailyProfit3 = slip3.status === 'won'
      ? round2(slip3.payout - slip3.amount)
      : slip3.status === 'lost'
        ? round2(-slip3.amount)
        : 0
    return { date, picks: dayPack.picks, betSlip: slip, betSlip2: slip2, betSlip3: slip3, dailyProfit, dailyProfit2, dailyProfit3 }
  })

  res.json({
    active: {
      date: startDate,
      picks: activePack.picks,
      betSlip: activeBetSlip,
      betSlip2: activeBetSlip2,
      betSlip3: activeBetSlip3,
      dailyProfit: activeDailyProfit,
      dailyProfit2: activeDailyProfit2,
      dailyProfit3: activeDailyProfit3,
    },
    upsetAnalysis,
    past: pastDays,
  })

  // 保存今日推荐快照（每次更新覆盖，确保包含全部比赛）
  // 注意：快照必须包含当天所有比赛（已完成+未完成），否则历史记录会缺场
  try {
    if (activePack.picks.length > 0) {
      // 查询当天所有比赛（包括已完成的），确保快照完整
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
      `).all(startDate)
      const allDayPicks = allDayMatches.map(formatPick)
      const allDayPack = buildRecommendationPackage(allDayPicks, realOddsMap)
      const allDaySlip = settleBetSlip(allDayPack.betSlip, allDayPack.picks)
      const allDaySlip2 = settleBetSlip(allDayPack.betSlip2, allDayPack.picks)
      const allDaySlip3 = settleBetSlip(allDayPack.betSlip3, allDayPack.picks)
      const allDayProfit = allDaySlip.status === 'won'
        ? round2(allDaySlip.payout - allDaySlip.amount)
        : allDaySlip.status === 'lost'
          ? round2(-allDaySlip.amount)
          : 0
      const allDayProfit2 = allDaySlip2.status === 'won'
        ? round2(allDaySlip2.payout - allDaySlip2.amount)
        : allDaySlip2.status === 'lost'
          ? round2(-allDaySlip2.amount)
          : 0
      const allDayProfit3 = allDaySlip3.status === 'won'
        ? round2(allDaySlip3.payout - allDaySlip3.amount)
        : allDaySlip3.status === 'lost'
          ? round2(-allDaySlip3.amount)
          : 0

      // 删除旧快照并重新插入（确保数据完整）
      db.prepare('DELETE FROM recommendation_snapshots WHERE snapshot_date = ?').run(startDate)
      db.prepare(
        'INSERT INTO recommendation_snapshots (snapshot_date, active_data) VALUES (?, ?)'
      ).run(startDate, JSON.stringify({
        picks: allDayPack.picks,
        betSlip: allDaySlip,
        dailyProfit: allDayProfit,
        betSlip2: allDaySlip2,
        dailyProfit2: allDayProfit2,
        betSlip3: allDaySlip3,
        dailyProfit3: allDayProfit3,
      }))
      console.log(`[Recommend] 已保存 ${startDate} 的推荐快照 (${allDayPack.picks.length} 场)`)
    }
  } catch (e) {
    console.error('[Recommend] 保存快照失败:', e.message)
  }
})

// 获取历史推荐快照
router.get('/snapshots', (req, res) => {
  const db = getDb()
  const now = getBeijingDateStr()
  const nowBeijing = getBeijingNow()
  const hour = parseInt(nowBeijing.toISOString().substring(11, 13))

  // 11点后，今天也属于历史；11点前，今天仍是推荐日
  const cutoffDate = new Date(now + 'T12:00:00')
  if (hour < 11) cutoffDate.setDate(cutoffDate.getDate() - 1)
  const cutoffStr = cutoffDate.toISOString().split('T')[0]

  try {
    // 获取已有快照
    const snapshots = db.prepare(`
      SELECT snapshot_date, created_at, active_data
      FROM recommendation_snapshots
      WHERE snapshot_date <= ?
      ORDER BY snapshot_date DESC
      LIMIT 30
    `).all(cutoffStr)

    const snapshotMap = {}
    for (const s of snapshots) {
      const data = JSON.parse(s.active_data)
      snapshotMap[s.snapshot_date] = {
        date: s.snapshot_date,
        createdAt: s.created_at,
        picks: data.picks,
        betSlip: data.betSlip,
        dailyProfit: data.dailyProfit,
        betSlip2: data.betSlip2 || { type: '双选稳胆', passType: '', passOptions: [], matches: [], combinedOdds: 0, amount: 0, 注数: 0, multiple: 1, payout: 0, status: 'pending', potentialPayout: 0 },
        dailyProfit2: data.dailyProfit2 || 0,
        betSlip3: data.betSlip3 || { type: '比分双选', passType: '', passOptions: [], matches: [], combinedOdds: 0, amount: 0, 注数: 0, multiple: 1, payout: 0, status: 'pending', potentialPayout: 0 },
        dailyProfit3: data.dailyProfit3 || 0,
      }
    }

    // 获取所有过去日期有比赛的日期列表
    const allDates = db.prepare(`
      SELECT DISTINCT match_date FROM matches
      WHERE match_date <= ? AND match_date IS NOT NULL
        AND home_team_id IS NOT NULL AND home_team_id != ''
      ORDER BY match_date DESC
    `).all(cutoffStr).map(r => r.match_date)

    // 检查每个快照是否完整（与DB中该日比赛数对比）
    for (const date of allDates) {
      if (snapshotMap[date]) {
        const matchCount = db.prepare(`
          SELECT COUNT(*) as c FROM matches
          WHERE match_date = ? AND home_team_id IS NOT NULL AND home_team_id != ''
        `).get(date).c
        if (snapshotMap[date].picks.length < matchCount) {
          delete snapshotMap[date]  // 快照不完整，需要重新生成
        }
      }
    }

    // 对缺失或不完整的日期，动态生成
    const missingDates = allDates.filter(d => !snapshotMap[d])

    if (missingDates.length > 0) {
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
        WHERE m.match_date IN (${missingDates.map(() => '?').join(',')})
          AND m.home_team_id IS NOT NULL AND m.home_team_id != ''
        ORDER BY m.match_date DESC, m.match_number ASC
      `).all(...missingDates)

      function formatPickFallback(r) {
        const isCompleted = r.status === 'completed'
        const isPending = !isCompleted && r.match_date < now
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

      const missingByDate = {}
      for (const r of past) {
        const date = r.match_date || 'unknown'
        if (!missingByDate[date]) missingByDate[date] = []
        if (missingByDate[date].length < 16) missingByDate[date].push(r)
      }

      let realOddsMap = {}
      try {
        const { getOddsForMatch } = require('../odds')
        const allTeams = db.prepare('SELECT id, name, name_cn FROM teams').all()
        const teamNames = {}
        for (const t of allTeams) teamNames[t.id] = t.name_cn || t.name
        const allMatches = db.prepare('SELECT id, home_team_id, away_team_id FROM matches').all()
        for (const m of allMatches) {
          const h = teamNames[m.home_team_id]; const a = teamNames[m.away_team_id]
          if (h && a) { const o = getOddsForMatch(h, a); if (o) realOddsMap[m.id] = o }
        }
      } catch (e) {}

      for (const [date, rows] of Object.entries(missingByDate)) {
        const dayPack = buildRecommendationPackage(rows.map(formatPickFallback), realOddsMap)
        const slip = settleBetSlip(dayPack.betSlip, dayPack.picks)
        const slip2 = settleBetSlip(dayPack.betSlip2, dayPack.picks)
        const slip3 = settleBetSlip(dayPack.betSlip3, dayPack.picks)
        const dailyProfit = slip.status === 'won'
          ? round2(slip.payout - slip.amount)
          : slip.status === 'lost'
            ? round2(-slip.amount)
            : 0
        const dailyProfit2 = slip2.status === 'won'
          ? round2(slip2.payout - slip2.amount)
          : slip2.status === 'lost'
            ? round2(-slip2.amount)
            : 0
        const dailyProfit3 = slip3.status === 'won'
          ? round2(slip3.payout - slip3.amount)
          : slip3.status === 'lost'
            ? round2(-slip3.amount)
            : 0
        snapshotMap[date] = { date, picks: dayPack.picks, betSlip: slip, betSlip2: slip2, betSlip3: slip3, dailyProfit, dailyProfit2, dailyProfit3 }
      }
    }

    // 历史快照补方案2：对 betSlip2 无比赛的快照，用 Poisson 模型赔率生成
    {
      const { generateAllSyntheticOdds } = require('../odds')
      const matchRows = db.prepare(`
        SELECT m.id, t1.name_cn AS home_name, t2.name_cn AS away_name,
               t1.ranking AS home_ranking, t2.ranking AS away_ranking
        FROM matches m
        JOIN teams t1 ON m.home_team_id = t1.id
        JOIN teams t2 ON m.away_team_id = t2.id
      `).all()
      const syntheticOddsMap = generateAllSyntheticOdds(matchRows)
      const matchIdToOdds = {}
      for (const m of matchRows) {
        const key = `${m.home_name}|${m.away_name}`
        if (syntheticOddsMap[key]) matchIdToOdds[m.id] = syntheticOddsMap[key]
      }
      for (const [date, entry] of Object.entries(snapshotMap)) {
        if (entry.betSlip2.matches && entry.betSlip2.matches.length > 0 && entry.betSlip3 && entry.betSlip3.matches && entry.betSlip3.matches.length > 0) continue
        try {
          const backfilledPack = buildRecommendationPackage(entry.picks, matchIdToOdds)
          entry.picks = backfilledPack.picks
          if (!entry.betSlip2.matches || entry.betSlip2.matches.length === 0) {
            entry.betSlip2 = settleBetSlip(backfilledPack.betSlip2, entry.picks)
            entry.dailyProfit2 = entry.betSlip2.status === 'won'
              ? round2(entry.betSlip2.payout - entry.betSlip2.amount)
              : entry.betSlip2.status === 'lost' ? round2(-entry.betSlip2.amount) : 0
          }
          if (!entry.betSlip3 || !entry.betSlip3.matches || entry.betSlip3.matches.length === 0) {
            entry.betSlip3 = settleBetSlip(backfilledPack.betSlip3, entry.picks)
            entry.dailyProfit3 = entry.betSlip3.status === 'won'
              ? round2(entry.betSlip3.payout - entry.betSlip3.amount)
              : entry.betSlip3.status === 'lost' ? round2(-entry.betSlip3.amount) : 0
          }
          db.prepare('UPDATE recommendation_snapshots SET active_data = ? WHERE snapshot_date = ?').run(
            JSON.stringify({ picks: entry.picks, betSlip: entry.betSlip, dailyProfit: entry.dailyProfit, betSlip2: entry.betSlip2, dailyProfit2: entry.dailyProfit2, betSlip3: entry.betSlip3, dailyProfit3: entry.dailyProfit3 }),
            date
          )
          console.log(`[History] ${date} 补方案2+3: 方案2=${entry.betSlip2.matches.length}场, 方案3=${entry.betSlip3.matches.length}场`)
        } catch (e) { console.log(`[History] ${date} 补方案失败: ${e.message}`) }
      }
    }

    // 对所有快照（包括恢复的旧快照）用当前赛果重新比对结算
    const allDateActuals = db.prepare(`
      SELECT match_date, id as match_id, home_score, away_score, half_home_score, half_away_score, status
      FROM matches
      WHERE match_date IN (${allDates.map(() => '?').join(',')})
    `).all(...allDates)
    const actualByDate = {}
    for (const a of allDateActuals) {
      if (!actualByDate[a.match_date]) actualByDate[a.match_date] = {}
      actualByDate[a.match_date][a.match_id] = a
    }
    for (const date of allDates) {
      const entry = snapshotMap[date]
      if (!entry) continue
      const dateActuals = actualByDate[date] || {}
      let needsResettle = false
      for (const pick of entry.picks) {
        const dbRow = dateActuals[pick.match_id]
        if (!dbRow) continue
        const isCompleted = dbRow.status === 'completed'
        const newActual = isCompleted ? { home: dbRow.home_score, away: dbRow.away_score, half_home: dbRow.half_home_score, half_away: dbRow.half_away_score } : null
        if (JSON.stringify(pick.actual) !== JSON.stringify(newActual)) {
          pick.actual = newActual
          pick.completed = isCompleted
          needsResettle = true
        }
      }
      // 检查 betSlip2 是否有未结算的已完成比赛（快照保存时 picks 已有 actual，但 betSlip2 未结算）
      if (!needsResettle && entry.betSlip2?.matches?.length > 0) {
        for (const match of entry.betSlip2.matches) {
          if (match.won === null || match.won === undefined) {
            const pick = entry.picks.find(p => p.match_id === match.matchId)
            if (pick?.actual) { needsResettle = true; break }
          }
        }
      }
      // 检查 betSlip3 是否有未结算的已完成比赛
      if (!needsResettle && entry.betSlip3?.matches?.length > 0) {
        for (const match of entry.betSlip3.matches) {
          if (match.won === null || match.won === undefined) {
            const pick = entry.picks.find(p => p.match_id === match.matchId)
            if (pick?.actual) { needsResettle = true; break }
          }
        }
      }
      if (needsResettle) {
        const beforeLen2 = entry.betSlip2?.matches?.length || 0
        const beforeLen3 = entry.betSlip3?.matches?.length || 0
        entry.betSlip = settleBetSlip(entry.betSlip, entry.picks)
        entry.betSlip2 = settleBetSlip(entry.betSlip2, entry.picks)
        entry.betSlip3 = settleBetSlip(entry.betSlip3, entry.picks)
        const afterLen2 = entry.betSlip2?.matches?.length || 0
        const afterLen3 = entry.betSlip3?.matches?.length || 0
        if (beforeLen2 !== afterLen2) console.log(`[Resettle] ${date}: betSlip2 ${beforeLen2}→${afterLen2}`)
        if (beforeLen3 !== afterLen3) console.log(`[Resettle] ${date}: betSlip3 ${beforeLen3}→${afterLen3}`)
        entry.dailyProfit = entry.betSlip.status === 'won' ? round2(entry.betSlip.payout - entry.betSlip.amount) : entry.betSlip.status === 'lost' ? round2(-entry.betSlip.amount) : 0
        entry.dailyProfit2 = entry.betSlip2.status === 'won' ? round2(entry.betSlip2.payout - entry.betSlip2.amount) : entry.betSlip2.status === 'lost' ? round2(-entry.betSlip2.amount) : 0
        entry.dailyProfit3 = entry.betSlip3.status === 'won' ? round2(entry.betSlip3.payout - entry.betSlip3.amount) : entry.betSlip3.status === 'lost' ? round2(-entry.betSlip3.amount) : 0
        // 持久化到DB，避免下次请求重新计算
        db.prepare('UPDATE recommendation_snapshots SET active_data = ? WHERE snapshot_date = ?').run(
          JSON.stringify({ picks: entry.picks, betSlip: entry.betSlip, dailyProfit: entry.dailyProfit, betSlip2: entry.betSlip2, dailyProfit2: entry.dailyProfit2, betSlip3: entry.betSlip3, dailyProfit3: entry.dailyProfit3 }),
          date
        )
      }
    }

    const result = allDates.filter(d => snapshotMap[d]).map(d => snapshotMap[d])
    res.json({ snapshots: result })
  } catch (e) {
    console.error('[Recommend] 获取历史快照失败:', e.message)
    res.json({ snapshots: [] })
  }
})

module.exports = router
