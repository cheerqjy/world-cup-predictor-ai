import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

interface MarketOption {
  key: string; label: string; odds: number; selected: boolean; secondary?: boolean; realOdds: boolean
}

interface Market {
  type: string; title: string; typeLabel: string; tags: string[]; confidence: number; handicap?: number
  options: MarketOption[]
}

interface SelectedBet {
  type: string; typeLabel: string; marketTitle: string; marketTags: string[]; betName: string
  optionKey: string; odds: number; prob: number; realOdds: boolean; handicap?: number
}

interface ScoreBet {
  type: string; typeLabel: string; marketTitle: string; marketTags: string[]; betName: string
  optionKey: string; odds: number; prob: number; realOdds: boolean
  optionKey2?: string; betName2?: string; odds2?: number; prob2?: number; combinedProb?: number
}

interface Pick {
  match_id: number; date: string; time: string; round: string; group_name: string; match_number: number
  home: { id: string; name_cn: string; flag: string; ranking: number }
  away: { id: string; name_cn: string; flag: string; ranking: number }
  prediction: {
    home_score: number | null; away_score: number | null; result_1x2: string
    total_goals: string; total_goals_2?: string; handicap_result?: string; half_full_result: string
    confidence: number; confidence_detail?: string
  }
  completed: boolean
  pending?: boolean
  actual: { home: number; away: number; half_home: number; half_away: number } | null
  hits: { score: number; result: number; total: number; half_full: number; rq_result: number } | null
  markets?: Market[]
  selectedBet?: SelectedBet | null
  bestValueBet?: SelectedBet & { optionKey2?: string; betName2?: string; odds2?: number } | null
  bestScoreBet?: ScoreBet | null
}

interface MatchBet {
  matchId: number; home: { name_cn: string; flag: string }; away: { name_cn: string; flag: string }
  type: string; typeLabel: string; marketTitle: string; marketTags: string[]; betName: string; optionKey: string
  odds: number; prob: number; won: boolean | null; realOdds: boolean; handicap?: number
  optionKey2?: string; betName2?: string; odds2?: number; wonKey?: string | null
  prob2?: number; combinedProb?: number
}

interface BetSlip {
  type: string; passType: string; passOptions: string[]; matches: MatchBet[]
  combinedOdds: number; amount: number;注数: number; multiple: number
  payout: number; status: 'pending' | 'won' | 'lost'; potentialPayout: number
}

interface DayGroup {
  date: string; picks: Pick[]; betSlip: BetSlip; dailyProfit: number
  betSlip2?: BetSlip; dailyProfit2?: number
  betSlip3?: BetSlip; dailyProfit3?: number
}

interface UpsetAnalysis {
  matchId: number; home: { name_cn: string; flag: string }; away: { name_cn: string; flag: string }
  isUpset: boolean; type: string; probability: number; confidence: number
}

const RESULT_LABEL_MAP: Record<string, string> = { 胜: '主胜', 平: '平', 负: '主负' }

function getResultLabel(result: string) {
  return RESULT_LABEL_MAP[result] || result || '-'
}

function formatHandicap(handicap?: number) {
  if (typeof handicap !== 'number') return ''
  // 体彩让球规则：正数=主队让球，负数=主队受让
  if (handicap > 0) return `让${handicap}`
  if (handicap < 0) return `受让${Math.abs(handicap)}`
  return '平手'
}

function formatPassLabel(passType: string) {
  if (passType === '单关') return '单关'
  return passType.replace('串1', '关')
}

function formatHalfFullLabel(value: string) {
  if (value.includes('-')) return value
  if (value.length === 2) return `${value[0]}-${value[1]}`
  return value
}

function getMatchResultLabel(actual: Pick['actual']) {
  if (!actual) return '-'
  if (actual.home > actual.away) return '主胜'
  if (actual.home < actual.away) return '主负'
  return '平'
}

function getHandicapResultLabel(actual: Pick['actual'], handicap = 0) {
  if (!actual) return '-'
  const adjustedHome = actual.home + handicap
  // 显示让球后的结果
  if (adjustedHome > actual.away) return '让球胜'
  if (adjustedHome < actual.away) return '让球负'
  return '让球平'
}

function getScoreResultLabel(actual: Pick['actual']) {
  if (!actual) return '-'
  return `${actual.home}:${actual.away}`
}

function getTotalGoalsLabel(actual: Pick['actual']) {
  if (!actual) return '-'
  const total = actual.home + actual.away
  return total >= 7 ? '7+球' : `${total}球`
}

function getHalfFullResultLabel(actual: Pick['actual']) {
  if (!actual) return '-'
  const half = actual.half_home > actual.half_away ? '胜' : actual.half_home < actual.half_away ? '负' : '平'
  const full = actual.home > actual.away ? '胜' : actual.home < actual.away ? '负' : '平'
  return `${half}-${full}`
}

function getMarketResultLabel(pick: Pick, market: Market) {
  if (!pick.actual) return ''
  if (market.type === 'spf') return getMatchResultLabel(pick.actual)
  if (market.type === 'rq') return `${getHandicapResultLabel(pick.actual, market.handicap)} (${formatHandicap(market.handicap)})`
  if (market.type === 'bf') return getScoreResultLabel(pick.actual)
  if (market.type === 'zq') return getTotalGoalsLabel(pick.actual)
  if (market.type === 'bqc') return getHalfFullResultLabel(pick.actual)
  return ''
}

function getOptionGridClass(type: string) {
  if (type === 'bf') return 'rec-option-grid score-grid'
  if (type === 'zq') return 'rec-option-grid total-grid'
  return 'rec-option-grid'
}

function renderSlip(slip: BetSlip, dailyProfit: number, showDate?: string) {
  return (
    <div className="rec-slip rec-slip-board">
      <div className="rec-slip-head">
        <div>
          <div className="rec-slip-mode">{slip.type}</div>
          <div className="rec-slip-sub">{showDate ? `${showDate} · ` : ''}已选 {slip.matches.length} 场 · {slip.注数} 注</div>
        </div>
        <div className={`rec-slip-status ${slip.status}`}>
          {slip.status === 'won' ? '已命中' : slip.status === 'lost' ? '未命中' : '待开奖'}
        </div>
      </div>

      <div className="rec-slip-match-list">
        {slip.matches.map((match, index) => (
          <div key={`${match.matchId}-${match.type}`} className={`rec-slip-match ${match.won === true ? 'bet-win' : match.won === false ? 'bet-lose' : ''}`}>
            <div className="rec-slip-tag">{match.marketTitle}</div>
            <div className="rec-slip-match-main">
              <div className="rec-slip-match-line">
                <span className="bet-num">{index + 1}</span>
                <span className="bet-teams">{match.home.flag}{match.home.name_cn} vs {match.away.flag}{match.away.name_cn}</span>
                {match.realOdds && <span className="bet-source">体彩</span>}
              </div>
              <div className="rec-slip-match-line rec-slip-match-line2">
                <span className="bet-name">{match.betName}</span>
                <span className="bet-type">{match.typeLabel}</span>
                <span className="bet-odds">@{match.odds.toFixed(2)}</span>
                {match.won !== null && (
                  <span className={`bet-result ${match.won ? 'bet-result-win' : 'bet-result-lose'}`}>
                    {match.won ? '✓' : '✗'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {slip.passOptions.length > 0 && (
        <div className="rec-pass-row">
          {slip.passOptions.map(passType => (
            <span key={passType} className={`rec-pass-chip ${passType === slip.passType ? 'active' : ''}`}>
              {formatPassLabel(passType)}
            </span>
          ))}
        </div>
      )}

      <div className={`rec-slip-footer ${dailyProfit > 0 ? 'slip-profit' : dailyProfit < 0 ? 'slip-loss' : ''}`}>
        <div className="slip-row">
          <span>投注: {slip.amount}元 {slip.注数}注</span>
          <span>过关: {formatPassLabel(slip.passType || '单关')}</span>
        </div>
        <div className="slip-row">
          <span>{slip.status === 'pending' ? `理论奖金: ¥${slip.potentialPayout.toFixed(2)}` : `返奖: ¥${slip.payout.toFixed(2)}`}</span>
          <span>盈亏: {dailyProfit >= 0 ? '+' : ''}{dailyProfit.toFixed(2)}元</span>
        </div>
      </div>
    </div>
  )
}

function renderSlip2(slip: BetSlip, dailyProfit: number, showDate?: string) {
  return (
    <div className="rec-slip rec-slip-board">
      <div className="rec-slip-head">
        <div>
          <div className="rec-slip-mode">{slip.type}</div>
          <div className="rec-slip-sub">{showDate ? `${showDate} · ` : ''}已选 {slip.matches.length} 场 · {slip.注数} 注</div>
        </div>
        <div className={`rec-slip-status ${slip.status}`}>
          {slip.status === 'won' ? '已命中' : slip.status === 'lost' ? '未命中' : '待开奖'}
        </div>
      </div>

      <div className="rec-slip-match-list">
        {slip.matches.map((match, index) => (
          <div key={`${match.matchId}-${match.type}`} className={`rec-slip-match ${match.won === true ? 'bet-win' : match.won === false ? 'bet-lose' : ''}`}>
            <div className="rec-slip-tag">{match.marketTitle}</div>
            <div className="rec-slip-match-main">
              <div className="rec-slip-match-line">
                <span className="bet-num">{index + 1}</span>
                <span className="bet-teams">{match.home.flag}{match.home.name_cn} vs {match.away.flag}{match.away.name_cn}</span>
                <span className="bet-source">双选</span>
              </div>
              <div className="rec-slip-match-line rec-slip-match-line2">
                <span className="bet-name">
                  <span className={match.won === null ? '' : (match.optionKey === match.wonKey ? 'bet-name-hit' : 'bet-name-miss')}>{match.betName}</span>
                  {match.betName2 ? <><span className="bet-name-sep"> / </span><span className={match.won === null ? '' : (match.optionKey2 === match.wonKey ? 'bet-name-hit' : 'bet-name-miss')}>{match.betName2}</span></> : ''}
                </span>
                <span className="bet-type">{match.typeLabel}</span>
                <span className="bet-odds">
                  <span className={match.won !== null ? (match.wonKey === match.optionKey ? 'bet-odds-hit' : 'bet-odds-miss') : ''}>@{match.odds.toFixed(2)}</span>
                  {match.odds2 ? <>
                    <span className="bet-name-sep"> / </span>
                    <span className={match.won !== null ? (match.wonKey === match.optionKey2 ? 'bet-odds-hit' : 'bet-odds-miss') : ''}>@{match.odds2.toFixed(2)}</span>
                  </> : ''}
                </span>
                {match.won !== null && (
                  <span className={`bet-result ${match.won ? 'bet-result-win' : 'bet-result-lose'}`}>
                    {match.won ? '✓' : '✗'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={`rec-slip-footer ${dailyProfit > 0 ? 'slip-profit' : dailyProfit < 0 ? 'slip-loss' : ''}`}>
        <div className="slip-row">
          <span>投注: {slip.amount}元 {slip.注数}注</span>
          <span>过关: {formatPassLabel(slip.passType || '单关')}</span>
        </div>
        <div className="slip-row">
          <span>综合概率: {slip.matches.reduce((s, m) => s * m.prob, 1) >= 0.01 ? `${(slip.matches.reduce((s, m) => s * m.prob, 1) * 100).toFixed(0)}%` : '<1%'}</span>
          <span>盈亏: {dailyProfit >= 0 ? '+' : ''}{dailyProfit.toFixed(2)}元</span>
        </div>
      </div>
    </div>
  )
}

function renderSlip3(slip: BetSlip, dailyProfit: number, showDate?: string) {
  return (
    <div className="rec-slip rec-slip-board">
      <div className="rec-slip-head">
        <div>
          <div className="rec-slip-mode">{slip.type}</div>
          <div className="rec-slip-sub">{showDate ? `${showDate} · ` : ''}已选 {slip.matches.length} 场 · {slip.注数} 注</div>
        </div>
        <div className={`rec-slip-status ${slip.status}`}>
          {slip.status === 'won' ? '已命中' : slip.status === 'lost' ? '未命中' : '待开奖'}
        </div>
      </div>

      <div className="rec-slip-match-list">
        {slip.matches.map((match, index) => (
          <div key={`${match.matchId}-${match.type}`} className={`rec-slip-match ${match.won === true ? 'bet-win' : match.won === false ? 'bet-lose' : ''}`}>
            <div className="rec-slip-tag">{match.marketTitle}</div>
            <div className="rec-slip-match-main">
              <div className="rec-slip-match-line">
                <span className="bet-num">{index + 1}</span>
                <span className="bet-teams">{match.home.flag}{match.home.name_cn} vs {match.away.flag}{match.away.name_cn}</span>
                <span className="bet-source">比分双选</span>
              </div>
              <div className="rec-slip-match-line rec-slip-match-line2">
                <span className="bet-name">
                  <span className={match.won === null ? '' : (match.optionKey === match.wonKey ? 'bet-name-hit' : 'bet-name-miss')}>{match.betName}</span>
                  {match.betName2 ? <><span className="bet-name-sep"> / </span><span className={match.won === null ? '' : (match.optionKey2 === match.wonKey ? 'bet-name-hit' : 'bet-name-miss')}>{match.betName2}</span></> : ''}
                </span>
                <span className="bet-type">{match.typeLabel}</span>
                <span className="bet-odds">
                  <span className={match.won !== null ? (match.wonKey === match.optionKey ? 'bet-odds-hit' : 'bet-odds-miss') : ''}>@{match.odds.toFixed(2)}</span>
                  {match.odds2 ? <>
                    <span className="bet-name-sep"> / </span>
                    <span className={match.won !== null ? (match.wonKey === match.optionKey2 ? 'bet-odds-hit' : 'bet-odds-miss') : ''}>@{match.odds2.toFixed(2)}</span>
                  </> : ''}
                </span>
                {match.won !== null && (
                  <span className={`bet-result ${match.won ? 'bet-result-win' : 'bet-result-lose'}`}>
                    {match.won ? '✓' : '✗'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={`rec-slip-footer ${dailyProfit > 0 ? 'slip-profit' : dailyProfit < 0 ? 'slip-loss' : ''}`}>
        <div className="slip-row">
          <span>投注: {slip.amount}元 {slip.注数}注</span>
          <span>过关: {formatPassLabel(slip.passType || '单关')}</span>
        </div>
        <div className="slip-row">
          <span>综合概率: {slip.matches.reduce((s, m) => (s * (m.combinedProb || m.prob)), 1) >= 0.01 ? `${(slip.matches.reduce((s, m) => (s * (m.combinedProb || m.prob)), 1) * 100).toFixed(0)}%` : '<1%'}</span>
          <span>盈亏: {dailyProfit >= 0 ? '+' : ''}{dailyProfit.toFixed(2)}元</span>
        </div>
      </div>
    </div>
  )
}

export function Recommend() {
  const [active, setActive] = useState<DayGroup | null>(null)
  const [past, setPast] = useState<DayGroup[]>([])
  const [snapshots, setSnapshots] = useState<DayGroup[]>([])
  const [upsetAnalysis, setUpsetAnalysis] = useState<UpsetAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'future' | 'history'>('future')
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.recommendations.list()
      setActive(data.active as DayGroup)
      setPast(data.past as DayGroup[])
      setUpsetAnalysis(data.upsetAnalysis || [])
    } catch { setActive(null); setPast([]); setUpsetAnalysis([]) }
    setLoading(false)
  }, [])

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await api.recommendations.snapshots()
      setSnapshots(data.snapshots as DayGroup[])
    } catch { setSnapshots([]) }
  }, [])

  useEffect(() => { load() }, [])
  useEffect(() => { if (activeTab === 'history') loadSnapshots() }, [activeTab])

  function fmtDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const week = ['日','一','二','三','四','五','六']
    return `${d.getMonth()+1}月${d.getDate()}日 周${week[d.getDay()]}`
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>竞彩推荐</h2>
        <span className="page-sub">参考体彩玩法规则生成模拟投注单</span>
      </div>

      {/* Tab切换 */}
      <div className="round-tabs">
        <button 
          className={`round-tab ${activeTab === 'future' ? 'active' : ''}`}
          onClick={() => setActiveTab('future')}
        >
          ⚽ 未来推荐
        </button>
        <button 
          className={`round-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📋 历史记录
        </button>
      </div>

      {loading && <div className="loading">加载中...</div>}

      {/* 未来推荐Tab */}
      {activeTab === 'future' && !loading && (
        <>
          {!active && <div className="empty-state">暂无推荐数据</div>}

          {active && active.betSlip && (
            <div className="rec-day active-day">
              <div className="rec-day-header rec-day-header-strong">
                <div>
                  <span className="rec-date">{fmtDate(active.date)}</span>
                  <span className="rec-budget">混合过关 · {active.betSlip.matches.length}场</span>
                </div>
                <span className="rec-summary-odds">组合赔率 @{active.betSlip.combinedOdds.toFixed(2)}</span>
              </div>

              {/* 投注单 */}
              {renderSlip(active.betSlip, active.dailyProfit)}

              {/* 方案二：双选稳胆 */}
              {active.betSlip2 && active.betSlip2.matches.length > 0 && (
                <div className="rec-day" style={{marginTop: '16px'}}>
                  <div className="rec-day-header rec-day-header-strong" style={{background: 'linear-gradient(135deg, #ff6b35, #e85d26)'}}>
                    <div>
                      <span className="rec-date" style={{color: '#fff'}}>双选稳胆</span>
                      <span className="rec-budget" style={{color: 'rgba(255,255,255,0.9)'}}>每场2选 · {active.betSlip2.matches.length}场</span>
                    </div>
                    <span className="rec-summary-odds" style={{color: '#fff'}}>{active.betSlip2.matches.length === 1 ? '单关' : `${active.betSlip2.matches.length}串1`} @{active.betSlip2.combinedOdds.toFixed(2)}</span>
                  </div>
                  {renderSlip2(active.betSlip2, (active as any).dailyProfit2 || 0)}
                </div>
              )}

              {/* 方案三：比分双选 */}
              {active.betSlip3 && active.betSlip3.matches.length > 0 && (
                <div className="rec-day" style={{marginTop: '16px'}}>
                  <div className="rec-day-header rec-day-header-strong" style={{background: 'linear-gradient(135deg, #7c3aed, #5b21b6)'}}>
                    <div>
                      <span className="rec-date" style={{color: '#fff'}}>比分双选</span>
                      <span className="rec-budget" style={{color: 'rgba(255,255,255,0.9)'}}>每场2比分 · {active.betSlip3.matches.length}场</span>
                    </div>
                    <span className="rec-summary-odds" style={{color: '#fff'}}>{active.betSlip3.matches.length === 1 ? '单关' : `${active.betSlip3.matches.length}串1`} @{active.betSlip3.combinedOdds.toFixed(2)}</span>
                  </div>
                  {renderSlip3(active.betSlip3, (active as any).dailyProfit3 || 0)}
                </div>
              )}

              {/* 搏冷分析 */}
              {upsetAnalysis.length > 0 && (
                <div className="upset-section">
                  <h3 className="upset-title">🎯 搏冷分析</h3>
                  {upsetAnalysis.map(ua => (
                    <div key={ua.matchId} className={`upset-card ${ua.isUpset ? 'upset-hot' : 'upset-normal'}`}>
                      <div className="upset-match">
                        <span>{ua.home.flag}{ua.home.name_cn} vs {ua.away.flag}{ua.away.name_cn}</span>
                        <span className={`upset-badge ${ua.isUpset ? 'upset-badge-hot' : ''}`}>
                          {ua.isUpset ? ua.type : '正常'}
                        </span>
                      </div>
                      <div className="upset-detail">
                        <span>冷门概率: {Math.round(ua.probability * 100)}%</span>
                        <span>模型置信: {Math.round(ua.confidence * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 比赛详情 */}
              <div className="rec-picks">
                {active.picks.map(p => {
                  const isExpanded = expandedCards.has(p.match_id)
                  return (
                  <div key={p.match_id} className={`rec-card rec-market-card ${p.completed ? 'rec-done' : ''} ${p.pending ? 'rec-pending' : ''}`}>
                    <div className="rec-card-top" style={{cursor: 'pointer'}} onClick={() => {
                      setExpandedCards(prev => {
                        const next = new Set(prev)
                        if (next.has(p.match_id)) next.delete(p.match_id)
                        else next.add(p.match_id)
                        return next
                      })}}>
                      <div className="rec-teams">
                        <span className="rec-team">{p.home.flag} {p.home.name_cn}</span>
                        <span className="rec-vs">vs</span>
                        <span className="rec-team">{p.away.flag} {p.away.name_cn}</span>
                        <span className="rec-round">{p.round}</span>
                      </div>
                      <div className="rec-card-meta">
                        <span>{p.date ? `${p.date.slice(5,7)}月${p.date.slice(8,10)}日 ` : ''}{p.time ? p.time.slice(0,5) : ''} #{String(p.match_number).padStart(3,'0')}</span>
                        {p.selectedBet && (
                          <span className="rec-selected-pill">
                            推荐 {p.selectedBet.marketTitle} · {p.selectedBet.betName}
                          </span>
                        )}
                        <span className="rec-expand-icon">{isExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>

                    {isExpanded && (
                    <div className="rec-market-list">
                      {p.markets?.map(market => (
                        <div key={`${p.match_id}-${market.type}`} className="rec-market">
                          <div className="rec-market-head">
                            <div className="rec-market-title">
                              <span>{market.title}</span>
                              {typeof market.handicap === 'number' && (
                                <span className="rec-market-handicap">({formatHandicap(market.handicap)})</span>
                              )}
                            </div>
                            <div className="rec-market-tags">
                              {market.tags.map(tag => <span key={tag} className="rec-market-tag">{tag}</span>)}
                            </div>
                          </div>

                          <div className={getOptionGridClass(market.type)}>
                            {market.options.map(option => (
                              <div
                                key={option.key}
                                className={`rec-option ${option.selected ? 'selected' : ''} ${option.secondary ? 'secondary' : ''}`}
                              >
                                <span className="rec-option-label">{option.label}</span>
                                <span className="rec-option-odds">{option.odds.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>

                          {p.actual && (
                            <div className="rec-market-result">
                              赛果: {getMarketResultLabel(p, market)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    )}

                    <div className="rec-footer rec-footer-rich">
                      <span className="rec-conf">模型置信度 {Math.round(p.prediction.confidence * 100)}%</span>
                      <span className="rec-pred-brief">比分 {p.prediction.home_score ?? '-'}:{p.prediction.away_score ?? '-'} · 胜平负 {getResultLabel(p.prediction.result_1x2)}</span>
                      {p.prediction.handicap_result && <span className="rec-pred-brief">{p.prediction.handicap_result}</span>}
                      {p.prediction.total_goals_2 && <span className="rec-secondary-note">总进球次选 {p.prediction.total_goals_2}球</span>}
                      {p.pending && <span className="rec-pending-note">⏳ 待更新赛果</span>}
                      {p.actual && <span className="rec-actual-note">实际 {p.actual.home}:{p.actual.away} / {formatHalfFullLabel(getHalfFullResultLabel(p.actual))}</span>}
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* 历史记录Tab */}
      {activeTab === 'history' && !loading && (
        <div className="rec-past-section">
          {snapshots.length === 0 && <div className="empty-state">暂无历史记录</div>}
          {snapshots.map(day => (
            <div key={day.date} className="rec-day">
              <div className="rec-day-header">
                <span className="rec-date">{fmtDate(day.date)}</span>
                <span className="rec-budget">{day.betSlip.matches.length}场 · @{day.betSlip.combinedOdds.toFixed(2)}</span>
              </div>
              {day.betSlip && renderSlip(day.betSlip, day.dailyProfit, fmtDate(day.date))}
              {day.betSlip2 && day.betSlip2.matches.length > 0 && (
                <div style={{marginTop: '8px'}}>
                  {renderSlip2(day.betSlip2, (day as any).dailyProfit2 || 0, fmtDate(day.date))}
                </div>
              )}
              {day.betSlip3 && day.betSlip3.matches.length > 0 && (
                <div style={{marginTop: '8px'}}>
                  {renderSlip3(day.betSlip3, (day as any).dailyProfit3 || 0, fmtDate(day.date))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && active && active.picks.length === 0 && (
        <div className="empty-state">暂无即将开赛的比赛</div>
      )}
    </div>
  )
}
