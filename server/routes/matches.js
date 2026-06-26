const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

router.get('/', (req, res) => {
  const db = getDb()
  const round = req.query.round || ''
  const group = req.query.group || ''

  let sql = `
    SELECT m.*, 
      ht.name_cn as home_name_cn, ht.flag as home_flag, ht.ranking as home_ranking,
      at.name_cn as away_name_cn, at.flag as away_flag, at.ranking as away_ranking
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE 1=1
  `
  const params = []

  if (round) {
    sql += ' AND m.round = ?'
    params.push(round)
  }
  if (group) {
    sql += ' AND m.group_name = ?'
    params.push(group)
  }

  sql += ' ORDER BY m.match_number ASC'

  const matches = db.prepare(sql).all(...params)
  res.json(matches)
})

router.get('/rounds', (req, res) => {
  const db = getDb()
  const rounds = db.prepare(`
    SELECT round, COUNT(*) as count, MIN(match_date) as start_date, MAX(match_date) as end_date
    FROM matches GROUP BY round ORDER BY MIN(match_number)
  `).all()
  res.json(rounds)
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const match = db.prepare(`
    SELECT m.*,
      ht.name_cn as home_name_cn, ht.flag as home_flag, ht.ranking as home_ranking,
      at.name_cn as away_name_cn, at.flag as away_flag, at.ranking as away_ranking
    FROM matches m
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.id = ?
  `).get(req.params.id)

  if (!match) return res.status(404).json({ error: '比赛不存在' })
  res.json(match)
})

router.put('/:id/result', (req, res) => {
  const db = getDb()
  const { home_score, away_score, half_home_score, half_away_score } = req.body

  if (home_score === undefined || away_score === undefined) {
    return res.status(400).json({ error: '请提供比分' })
  }

  db.prepare(`
    UPDATE matches SET home_score = ?, away_score = ?, half_home_score = ?, half_away_score = ?, status = 'completed'
    WHERE id = ?
  `).run(home_score || 0, away_score || 0, half_home_score || 0, half_away_score || 0, req.params.id)

  const preds = db.prepare('SELECT * FROM predictions WHERE match_id = ?').all(req.params.id)
  const updateCorrect = db.prepare(`
    UPDATE predictions SET correct_score = ?, correct_result = ?, correct_total_goals = ?, correct_half_full = ?
    WHERE id = ?
  `)

  const result1x2 = home_score > away_score ? '胜' : home_score < away_score ? '负' : '平'
  const totalGoals = home_score + away_score
  const tgActual = totalGoals >= 7 ? '7+' : String(totalGoals)
  const halfResult = half_home_score > half_away_score ? '胜' : half_home_score < half_away_score ? '负' : '平'
  const fullResult = home_score > away_score ? '胜' : home_score < away_score ? '负' : '平'
  const actualHalfFull = `${halfResult}-${fullResult}`

  for (const p of preds) {
    const correctScore = (p.home_score === home_score && p.away_score === away_score) ? 1 : 0
    const correctResult = p.result_1x2 === result1x2 ? 1 : 0
    const correctTG = (p.total_goals === tgActual || p.total_goals_2 === tgActual) ? 1 : 0
    const correctHF = p.half_full_result === actualHalfFull ? 1 : 0
    updateCorrect.run(correctScore, correctResult, correctTG, correctHF, p.id)
  }

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id)
  res.json(match)
})

router.get('/:id/predictions', (req, res) => {
  const db = getDb()
  const predictions = db.prepare(`
    SELECT p.* FROM predictions p WHERE p.match_id = ? ORDER BY p.predicted_at DESC
  `).all(req.params.id)
  res.json(predictions)
})

module.exports = router
