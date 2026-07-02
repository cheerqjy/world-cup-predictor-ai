import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

interface Match {
  id: number; round: string; group_name: string | null; match_number: number
  home_team_id: string; away_team_id: string
  home_name_cn: string | null; home_flag: string | null; home_ranking: number | null
  away_name_cn: string | null; away_flag: string | null; away_ranking: number | null
  match_date: string; match_time: string; status: string
  home_score: number | null; away_score: number | null
  home_score_90: number | null; away_score_90: number | null
  half_home_score: number | null; half_away_score: number | null
}

interface Prediction {
  id: number; match_id: number; home_score: number; away_score: number
  half_home_score: number; half_away_score: number
  result_1x2: string; total_goals: string; total_goals_2?: string; handicap_result: string
  half_full_result: string; confidence: number; ai_model: string
  correct_score: number; correct_result: number; correct_total_goals: number; correct_half_full: number; correct_rq_result: number
  confidence_detail?: string
}

function formatDateLabel(dateStr: string, now: Date): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const month = d.getMonth() + 1
  const day = d.getDate()
  const weekday = weekdays[d.getDay()]

  if (diffDays === 0) return `今天 ${month}月${day}日 ${weekday}`
  if (diffDays === 1) return `明天 ${month}月${day}日 ${weekday}`
  if (diffDays === -1) return `昨天 ${month}月${day}日 ${weekday}`
  return `${month}月${day}日 ${weekday}`
}

export function MatchList() {
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({})
  const [activeRound, setActiveRound] = useState('小组赛')
  const [activeGroup, setActiveGroup] = useState('')
  const [activeTab, setActiveTab] = useState<'round' | 'date'>('date')
  const [dateTab, setDateTab] = useState<'future' | 'history'>('future')
  const [loading, setLoading] = useState(true)
  const [rounds, setRounds] = useState<{ round: string; count: number }[]>([])
  const [now, setNow] = useState(new Date())

  const groups = ['A','B','C','D','E','F','G','H','I','J','K','L']

  const loadAll = useCallback(async () => {
    try {
      const [roundData, predData] = await Promise.all([
        api.matches.list({ _: Date.now().toString() }),
        api.predictions.list(),
      ])
      const seen = new Set<string>()
      const r: typeof rounds = []
      for (const m of roundData as Match[]) {
        if (!seen.has(m.round)) { seen.add(m.round); r.push({ round: m.round, count: (roundData as Match[]).filter((x: Match) => x.round === m.round).length }) }
      }
      setRounds(r)
      const pmap: Record<number, Prediction> = {}
      for (const p of predData as Prediction[]) {
        if (!pmap[p.match_id] || p.id > pmap[p.match_id].id) pmap[p.match_id] = p
      }
      setPredictions(pmap)
    } catch {}
  }, [])

  const loadMatches = useCallback(async (round: string, group?: string) => {
    setActiveTab('round')
    setLoading(true)
    setActiveRound(round)
    setActiveGroup(group || '')
    try {
      const params: Record<string, string> = { round, _: Date.now().toString() }
      if (group) params.group = group
      const data = await api.matches.list(params)
      setMatches(data as Match[])
    } catch {}
    setLoading(false)
  }, [])

  const loadByDate = useCallback(async () => {
    setActiveTab('date')
    setActiveRound('')
    setActiveGroup('')
    setLoading(true)
    try {
      const data = await api.matches.list({ _: Date.now().toString() })
      setMatches(data as Match[])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadAll(); loadByDate() }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
      loadAll()
      if (activeTab === 'round') {
        loadMatches(activeRound, activeGroup)
      } else {
        loadByDate()
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [activeRound, activeGroup, activeTab])

  function isPast(dateStr: string): boolean {
    const d = new Date(dateStr + 'T23:59:00')
    return d < new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  function renderMatchCard(m: Match) {
    const pred = predictions[m.id]
    const isKO = !m.home_team_id
    const completed = m.status === 'completed'
    const expired = !completed && isPast(m.match_date)

    return (
      <div key={m.id} className={`match-card ${completed ? 'completed' : expired ? 'expired' : ''}`}>
        <div className="match-header">
          <span className="match-round-badge">{m.round}</span>
          {m.group_name && <span className="match-group-badge">第{m.group_name}组</span>}
          <span className="match-number">#{m.match_number}</span>
          <span className="match-date">
            {m.match_date ? `${m.match_date.slice(5,7)}月${m.match_date.slice(8,10)}日 ` : ''}
            {m.match_time ? m.match_time.slice(0,5) : ''}
          </span>
          {expired && <span className="match-status-pending">待更新赛果</span>}
        </div>

        <div className="match-body">
          {isKO ? (
            <div className="match-teams">
              <div className="team-slot home"><span className="team-name">待定</span></div>
              <div className="vs">VS</div>
              <div className="team-slot away"><span className="team-name">待定</span></div>
            </div>
          ) : (
            <div className="match-teams">
              <div className={`team-slot home ${completed && m.home_score_90 !== null && m.home_score_90 > (m.away_score_90 ?? 0) ? 'winner-team' : ''}`}>
                <span className="team-flag">{m.home_flag}</span>
                <span className="team-name">{m.home_name_cn}</span>
                <span className="team-rank">#{m.home_ranking}</span>
              </div>
              <div className="vs">
                {completed && m.home_score_90 !== null ? (
                  <span className="score">
                    {m.home_score_90}-{m.away_score_90}
                    <span className="score-half">({m.half_home_score}-{m.half_away_score})</span>
                  </span>
                ) : pred ? (
                  <span className="score-pred">{pred.home_score}-{pred.away_score}</span>
                ) : (
                  <span>VS</span>
                )}
              </div>
              <div className={`team-slot away ${completed && m.away_score_90 !== null && m.away_score_90 > (m.home_score_90 ?? 0) ? 'winner-team' : ''}`}>
                <span className="team-flag">{m.away_flag}</span>
                <span className="team-name">{m.away_name_cn}</span>
                <span className="team-rank">#{m.away_ranking}</span>
              </div>
            </div>
          )}
        </div>

        {pred && (
          <div className="match-prediction">
            <div className="pred-header">
              <span className="pred-label">🤖 AI预测</span>
              {pred.confidence > 0.6 && <span className="pred-rec">推荐</span>}
              <span className={`pred-result-tag ${pred.result_1x2 === '胜' ? 'win' : pred.result_1x2 === '负' ? 'lose' : 'draw'}`}>
                {pred.result_1x2}
              </span>
              <span className="pred-confidence">{Math.round(pred.confidence * 100)}%</span>
              <span className="pred-model">{pred.ai_model}</span>
            </div>
            {pred.confidence_detail && (() => {
              try {
                const [cs, cr, ct, ch] = JSON.parse(pred.confidence_detail)
                const items = [
                  { k: '比分', v: cs, t: 0.05 },                   { k: '胜平负', v: cr, t: 0.50 },
                  { k: '进球', v: ct, t: 0.30 }, { k: '半全场', v: ch, t: 0.15 },
                ]
                return <div className="pred-conf-row">{items.map(i =>
                  <span key={i.k} className={i.v > i.t ? 'conf-yes' : 'conf-no'}>{i.k}{i.v > i.t ? '✓' : '✗'}</span>
                )}</div>
              } catch { return null }
            })()}
            <div className="pred-grid">
              <div className="pred-item"><span className="pl">比分</span><span className="pv">{pred.home_score}-{pred.away_score}</span></div>
              <div className="pred-item"><span className="pl">总进球</span><span className="pv">{pred.total_goals}{pred.total_goals_2 ? `/${pred.total_goals_2}` : ''}</span></div>
              <div className="pred-item"><span className="pl">半全场</span><span className="pv">{pred.half_full_result}</span></div>
              <div className="pred-item"><span className="pl">让球</span><span className="pv">{pred.handicap_result}</span></div>
            </div>

            {completed && (
              <div className="pred-accuracy-row">
                <span className={pred.correct_score ? 'tag-green' : 'tag-red'}>比分{pred.correct_score ? '✓' : '✗'}</span>
                <span className={pred.correct_result ? 'tag-green' : 'tag-red'}>胜平负{pred.correct_result ? '✓' : '✗'}</span>
                <span className={pred.correct_rq_result ? 'tag-green' : 'tag-red'}>让球{pred.correct_rq_result ? '✓' : '✗'}</span>
                <span className={pred.correct_total_goals ? 'tag-green' : 'tag-red'}>进球{pred.correct_total_goals ? '✓' : '✗'}</span>
                <span className={pred.correct_half_full ? 'tag-green' : 'tag-red'}>半全场{pred.correct_half_full ? '✓' : '✗'}</span>
              </div>
            )}
          </div>
        )}

        {!pred && !isKO && (
          <div className="match-prediction pending-pred">
            <span className="pred-pending-label">⏳ 等待AI预测...</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="round-tabs">
        <button className={`round-tab date-tab ${activeTab === 'date' ? 'active' : ''}`}
          onClick={loadByDate}>
          📅 按日期
        </button>
        {rounds.map(r => (
          <button key={r.round} className={`round-tab ${activeRound === r.round ? 'active' : ''}`}
            onClick={() => { setActiveGroup(''); loadMatches(r.round) }}>
            {r.round} <span className="tab-count">{r.count}</span>
          </button>
        ))}
      </div>

      {activeTab === 'round' && activeRound === '小组赛' && (
        <div className="group-tabs">
          {groups.map(g => (
            <button key={g} className={`group-tab ${activeGroup === g ? 'active' : ''}`}
              onClick={() => loadMatches('小组赛', g)}>第{g}组</button>
          ))}
          <button className={`group-tab ${activeGroup === '' ? 'active' : ''}`}
            onClick={() => loadMatches('小组赛')}>全部</button>
        </div>
      )}

      {activeTab === 'date' && (
        <div className="round-tabs" style={{ marginTop: 4 }}>
          <button className={`round-tab ${dateTab === 'future' ? 'active' : ''}`}
            onClick={() => setDateTab('future')}>
            ⏳ 未来
          </button>
          <button className={`round-tab ${dateTab === 'history' ? 'active' : ''}`}
            onClick={() => setDateTab('history')}>
            📋 历史
          </button>
        </div>
      )}

      <div className="match-list">
        {activeTab === 'date' ? (
          (() => {
            const grouped = new Map<string, Match[]>()
            for (const m of matches) {
              const list = grouped.get(m.match_date) || []
              list.push(m)
              grouped.set(m.match_date, list)
            }
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
            const futureDates = [...grouped.entries()].filter(([date]) => date >= todayStr).sort((a, b) => a[0].localeCompare(b[0]))
            const pastDates = [...grouped.entries()].filter(([date]) => date < todayStr).sort((a, b) => b[0].localeCompare(a[0]))
            const displayDates = dateTab === 'future' ? futureDates : pastDates
            if (displayDates.length === 0) {
              return <div className="empty-state">{dateTab === 'future' ? '暂无未来比赛' : '暂无历史比赛'}</div>
            }
            return displayDates.map(([date, dayMatches]) => (
              <div key={date}>
                <div className="date-header">{formatDateLabel(date, now)}</div>
                {dayMatches.sort((a, b) => (a.match_time || '').localeCompare(b.match_time || '')).map(m => renderMatchCard(m))}
              </div>
            ))
          })()
        ) : (
          matches.sort((a, b) => (a.match_date + (a.match_time || '')).localeCompare(b.match_date + (b.match_time || ''))).map(m => renderMatchCard(m))
        )}
        {matches.length === 0 && !loading && <div className="empty-state">暂无比赛数据</div>}
      </div>
    </div>
  )
}
