const express = require('express')
const { getDb } = require('../db')
const { predictMatch } = require('../ai')

const router = express.Router()

router.post('/predict/:matchId', async (req, res) => {
  try {
    const result = await predictMatch(Number(req.params.matchId))
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/', (req, res) => {
  const db = getDb()
  const predictions = db.prepare(`
    SELECT p.*, m.round, m.group_name, m.match_date, m.match_time, m.home_team_id, m.away_team_id,
      m.home_score_90 as actual_home, m.away_score_90 as actual_away, m.status as match_status,
      ht.name_cn as home_name_cn, ht.flag as home_flag, ht.ranking as home_ranking,
      at.name_cn as away_name_cn, at.flag as away_flag, at.ranking as away_ranking
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    ORDER BY p.predicted_at DESC
  `).all()
  res.json(predictions)
})

router.get('/compare', (req, res) => {
  const db = getDb()
  const data = db.prepare(`
    SELECT p.*, m.match_number, m.round, m.group_name, m.match_date, m.match_time,
      m.home_score_90 as actual_home, m.away_score_90 as actual_away,
      m.half_home_score as actual_half_home, m.half_away_score as actual_half_away,
      m.status as match_status,
      ht.name_cn as home_name_cn, ht.flag as home_flag,
      at.name_cn as away_name_cn, at.flag as away_flag
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.status = 'completed'
    ORDER BY m.match_number ASC
  `).all()

  const stats = {
    total: data.length,
    correct_scores: data.filter(d => d.correct_score).length,
    correct_results: data.filter(d => d.correct_result).length,
    correct_total_goals: data.filter(d => d.correct_total_goals).length,
    correct_half_full: data.filter(d => d.correct_half_full).length,
    correct_rq_results: data.filter(d => d.correct_rq_result).length,
    score_accuracy: 0,
    result_accuracy: 0,
    total_goals_accuracy: 0,
    half_full_accuracy: 0,
    rq_result_accuracy: 0,
  }

  if (stats.total > 0) {
    stats.score_accuracy = Math.round(stats.correct_scores / stats.total * 10000) / 100
    stats.result_accuracy = Math.round(stats.correct_results / stats.total * 10000) / 100
    stats.total_goals_accuracy = Math.round(stats.correct_total_goals / stats.total * 10000) / 100
    stats.half_full_accuracy = Math.round(stats.correct_half_full / stats.total * 10000) / 100
    stats.rq_result_accuracy = Math.round(stats.correct_rq_results / stats.total * 10000) / 100
  }

  res.json({ predictions: data, stats })
})

router.get('/config', (req, res) => {
  const db = getDb()
  let config = db.prepare('SELECT * FROM ai_config WHERE id = 1').get()
  if (!config) {
    db.prepare('INSERT INTO ai_config (provider, api_key, model) VALUES (?, ?, ?)')
      .run('openai', '', 'gpt-4o')
    config = db.prepare('SELECT * FROM ai_config WHERE id = 1').get()
  }
  const { api_key, ...safe } = config
  res.json({ ...safe, has_key: !!api_key })
})

router.put('/config', (req, res) => {
  const db = getDb()
  const { provider, api_key, model, base_url } = req.body
  const existing = db.prepare('SELECT id FROM ai_config WHERE id = 1').get()
  if (existing) {
    db.prepare('UPDATE ai_config SET provider=?, api_key=?, model=?, base_url=? WHERE id=1')
      .run(provider || 'openai', api_key || '', model || 'gpt-4o', base_url || '')
  } else {
    db.prepare('INSERT INTO ai_config (provider, api_key, model, base_url) VALUES (?,?,?,?)')
      .run(provider || 'openai', api_key || '', model || 'gpt-4o', base_url || '')
  }
  res.json({ success: true })
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM predictions WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

module.exports = router
