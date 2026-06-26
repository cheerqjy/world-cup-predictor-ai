import { useState, useEffect } from 'react'
import { api } from '../api'

export function Champion() {
  const [predictions, setPredictions] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    load()
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [])

  async function load() {
    const [p, s] = await Promise.all([
      api.champion.list(),
      api.champion.stats().catch(() => null),
    ])
    setPredictions(p)
    setStats(s)
  }

  const latest = predictions[0]

  return (
    <div className="page">
      <div className="champion-hero">
        <h2>👑 2026世界杯冠亚军预测</h2>
        <p>AI大模型分析球队实力、历史战绩、综合预测</p>
      </div>

      {latest && (
        <div className="current-champion-pred">
          <div className="champion-result">
            <div className="champion-card gold">
              <div className="medal">🥇</div>
              <div className="champ-flag">{latest.champion_flag}</div>
              <div className="champ-name">{latest.champion_name_cn}</div>
              <div className="champ-title">🏆 冠军</div>
            </div>
            <div className="champion-card silver">
              <div className="medal">🥈</div>
              <div className="champ-flag">{latest.runner_up_flag}</div>
              <div className="champ-name">{latest.runner_up_name_cn}</div>
              <div className="champ-title">🥈 亚军</div>
            </div>
          </div>
          <div className="champion-updated">预测时间: {latest.predicted_at}</div>
        </div>
      )}

      {stats && (
        <div className="champion-stats">
          <h3 className="section-title">累计统计（共{stats.total_predictions}次预测）</h3>
          <div className="stats-columns">
            <div className="stats-col">
              <h4>🏆 冠军预测分布</h4>
              <div className="stats-list">
                {stats.champion_counts.map((c: any, i: number) => (
                  <div key={c.champion_team_id} className="stat-row">
                    <span className="stat-rank">{i + 1}</span>
                    <span className="stat-flag">{c.flag}</span>
                    <span className="stat-name">{c.name_cn}</span>
                    <span className="stat-bar-bg">
                      <span className="stat-bar" style={{ width: `${Math.min(100, c.count / stats.champion_counts[0].count * 100)}%` }} />
                    </span>
                    <span className="stat-count">{c.count}次</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="stats-col">
              <h4>🥈 亚军预测分布</h4>
              <div className="stats-list">
                {stats.runner_up_counts.map((c: any, i: number) => (
                  <div key={c.runner_up_team_id} className="stat-row">
                    <span className="stat-rank">{i + 1}</span>
                    <span className="stat-flag">{c.flag}</span>
                    <span className="stat-name">{c.name_cn}</span>
                    <span className="stat-bar-bg">
                      <span className="stat-bar silver" style={{ width: `${Math.min(100, c.count / stats.runner_up_counts[0].count * 100)}%` }} />
                    </span>
                    <span className="stat-count">{c.count}次</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="champion-history">
        <h3 className="section-title">历史记录</h3>
        {predictions.length === 0 && <div className="empty-state">暂无预测记录</div>}
        <div className="champ-history-list">
          {predictions.slice(0, 20).map(p => (
            <div key={p.id} className="champ-history-card">
              <span className="champ-date">{p.predicted_at}</span>
              <span className="champ-pred">
                🥇 {p.champion_flag} {p.champion_name_cn} <span className="vs-text">vs</span> 🥈 {p.runner_up_flag} {p.runner_up_name_cn}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
