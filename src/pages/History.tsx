import { useState, useEffect } from 'react'
import { api } from '../api'

export function History() {
  const [predictions, setPredictions] = useState<any[]>([])
  const [compare, setCompare] = useState<any>(null)
  const [tab, setTab] = useState('compare')

  useEffect(() => {
    load()
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [])

  async function load() {
    const [p, c] = await Promise.all([
      api.predictions.list(),
      api.predictions.compare().catch(() => null),
    ])
    setPredictions(p)
    setCompare(c)
  }

  return (
    <div className="page">
      <div className="round-tabs">
        <button className={`round-tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>
          📊 预测vs实际
        </button>
        <button className={`round-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          📋 全部预测记录
        </button>
      </div>

      {tab === 'compare' && (
        <div className="compare-page">
          {compare && (
            <>
              <div className="stats-cards">
                <div className="stat-card">
                  <div className="stat-number">{compare.stats.total}</div>
                  <div className="stat-label">已完赛场次</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{compare.stats.correct_results}/{compare.stats.total}</div>
                  <div className="stat-label">胜平负正确</div>
                  <div className="stat-pct">{compare.stats.result_accuracy}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{compare.stats.correct_rq_results}/{compare.stats.total}</div>
                  <div className="stat-label">让球正确</div>
                  <div className="stat-pct">{compare.stats.rq_result_accuracy}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{compare.stats.correct_scores}/{compare.stats.total}</div>
                  <div className="stat-label">比分正确</div>
                  <div className="stat-pct">{compare.stats.score_accuracy}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{compare.stats.correct_total_goals}/{compare.stats.total}</div>
                  <div className="stat-label">总进球正确</div>
                  <div className="stat-pct">{compare.stats.total_goals_accuracy}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{compare.stats.correct_half_full}/{compare.stats.total}</div>
                  <div className="stat-label">半全场正确</div>
                  <div className="stat-pct">{compare.stats.half_full_accuracy}%</div>
                </div>
              </div>

              <h3 className="section-title">逐场对比</h3>
              <div className="compare-list">
                {compare.predictions.map((p: any) => (
                  <div key={p.id} className="compare-card">
                    <div className="compare-header">
                      <span className="match-round-badge">{p.round}</span>
                      {p.group_name && <span className="match-group-badge">第{p.group_name}组</span>}
                      <span className="match-date">{p.match_date} {p.match_time ? p.match_time.slice(0,5) : ''}</span>
                    </div>
                    <div className="compare-body">
                      <div className="compare-teams">
                        <span className="team-flag">{p.home_flag}</span>
                        <span>{p.home_name_cn}</span>
                        <span className="vs-text">vs</span>
                        <span className="team-flag">{p.away_flag}</span>
                        <span>{p.away_name_cn}</span>
                      </div>
                      <div className="compare-scores">
                        <div className="compare-col pred-col">
                          <span className="clabel">📈 预测</span>
                          <span className="cscore">{p.home_score}-{p.away_score}</span>
                          <span className={`cresult ${p.result_1x2 === '胜' ? 'win' : p.result_1x2 === '负' ? 'lose' : 'draw'}`}>{p.result_1x2}</span>
                        </div>
                        <div className="compare-col actual-col">
                          <span className="clabel">✅ 实际</span>
                          <span className="cscore">{p.actual_home}-{p.actual_away}</span>
                          <span className="cresult">
                            {p.actual_home > p.actual_away ? '胜' : p.actual_home < p.actual_away ? '负' : '平'}
                          </span>
                        </div>
                      </div>
                      <div className="compare-acc">
                        <span className={p.correct_score ? 'tag-green' : 'tag-red'}>比分{p.correct_score ? '✓' : '✗'}</span>
                        <span className={p.correct_result ? 'tag-green' : 'tag-red'}>胜平负{p.correct_result ? '✓' : '✗'}</span>
                        <span className={p.correct_rq_result ? 'tag-green' : 'tag-red'}>让球{p.correct_rq_result ? '✓' : '✗'}</span>
                        <span className={p.correct_total_goals ? 'tag-green' : 'tag-red'}>进球{p.correct_total_goals ? '✓' : '✗'}</span>
                        <span className={p.correct_half_full ? 'tag-green' : 'tag-red'}>半全场{p.correct_half_full ? '✓' : '✗'}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {compare.predictions.length === 0 && <div className="empty-state">暂无已完赛的预测对比数据</div>}
              </div>
            </>
          )}
          {!compare && <div className="empty-state">暂无数据</div>}
        </div>
      )}

      {tab === 'history' && (
        <div className="prediction-history">
          {predictions.length === 0 && <div className="empty-state">暂无预测记录</div>}
          {predictions.map(p => (
            <div key={p.id} className="history-card">
              <div className="history-header">
                <span className="match-round-badge">{p.round}</span>
                {p.group_name && <span className="match-group-badge">第{p.group_name}组</span>}
                <span className="match-date">{p.match_date} {p.match_time ? p.match_time.slice(0,5) : ''}</span>
                <span className="history-time">{p.predicted_at}</span>
              </div>
              <div className="history-body">
                <div className="history-teams">
                  <span className="team-flag">{p.home_flag}</span>
                  <span className="team-name">{p.home_name_cn}</span>
                  <span className="vs-score">vs</span>
                  <span className="team-flag">{p.away_flag}</span>
                  <span className="team-name">{p.away_name_cn}</span>
                </div>
                <div className="history-pred-detail">
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">胜平负</span>
                      <span className={`detail-value ${p.result_1x2 === '胜' ? 'win' : p.result_1x2 === '负' ? 'lose' : 'draw'}`}>{p.result_1x2}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">比分</span>
                      <span className="detail-value highlight">{p.home_score}-{p.away_score}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">总进球</span>
                      <span className="detail-value">{p.total_goals}{p.total_goals_2 ? `/${p.total_goals_2}` : ''}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">半全场</span>
                      <span className="detail-value">{p.half_full_result}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">让球</span>
                      <span className="detail-value">{p.handicap_result}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">置信度</span>
                      <span className="detail-value">{Math.round(p.confidence * 100)}%</span>
                    </div>
                  </div>
                  {(p.actual_home !== null && p.actual_home !== undefined) && (
                    <div className="accuracy-check">
                      <span className={p.correct_score ? 'acc-yes' : 'acc-no'}>{p.correct_score ? '✅' : '❌'}比分</span>
                        <span className={p.correct_result ? 'acc-yes' : 'acc-no'}>{p.correct_result ? '✅' : '❌'}胜平负</span>
                      <span className={p.correct_rq_result ? 'acc-yes' : 'acc-no'}>{p.correct_rq_result ? '✅' : '❌'}让球</span>
                      <span className={p.correct_total_goals ? 'acc-yes' : 'acc-no'}>{p.correct_total_goals ? '✅' : '❌'}总进球</span>
                      <span className={p.correct_half_full ? 'acc-yes' : 'acc-no'}>{p.correct_half_full ? '✅' : '❌'}半全场</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
