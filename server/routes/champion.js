const express = require('express')
const { getDb } = require('../db')
const { predictChampion } = require('../ai')

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const result = await predictChampion()
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/', (req, res) => {
  const db = getDb()
  const predictions = db.prepare(`
    SELECT cp.*,
      ct.name_cn as champion_name_cn, ct.flag as champion_flag,
      rt.name_cn as runner_up_name_cn, rt.flag as runner_up_flag
    FROM champion_predictions cp
    LEFT JOIN teams ct ON cp.champion_team_id = ct.id
    LEFT JOIN teams rt ON cp.runner_up_team_id = rt.id
    ORDER BY cp.predicted_at DESC
  `).all()
  res.json(predictions)
})

router.get('/stats', (req, res) => {
  const db = getDb()
  const champCounts = db.prepare(`
    SELECT champion_team_id, t.name_cn, t.flag, COUNT(*) as count
    FROM champion_predictions cp
    JOIN teams t ON cp.champion_team_id = t.id
    GROUP BY cp.champion_team_id
    ORDER BY count DESC
  `).all()

  const runnerCounts = db.prepare(`
    SELECT runner_up_team_id, t.name_cn, t.flag, COUNT(*) as count
    FROM champion_predictions cp
    JOIN teams t ON cp.runner_up_team_id = t.id
    GROUP BY cp.runner_up_team_id
    ORDER BY count DESC
  `).all()

  const total = db.prepare('SELECT COUNT(*) as total FROM champion_predictions').get()

  res.json({ champion_counts: champCounts, runner_up_counts: runnerCounts, total_predictions: total.total })
})

module.exports = router
