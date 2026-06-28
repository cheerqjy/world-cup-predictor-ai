const { getDb } = require('./db')

const teams = [
  { id: 'mex', name: 'Mexico', name_cn: '墨西哥', flag: '🇲🇽', ranking: 14, group_name: 'A' },
  { id: 'rsa', name: 'South Africa', name_cn: '南非', flag: '🇿🇦', ranking: 60, group_name: 'A' },
  { id: 'kor', name: 'South Korea', name_cn: '韩国', flag: '🇰🇷', ranking: 25, group_name: 'A' },
  { id: 'cze', name: 'Czechia', name_cn: '捷克', flag: '🇨🇿', ranking: 39, group_name: 'A' },

  { id: 'can', name: 'Canada', name_cn: '加拿大', flag: '🇨🇦', ranking: 31, group_name: 'B' },
  { id: 'bih', name: 'Bosnia and Herzegovina', name_cn: '波黑', flag: '🇧🇦', ranking: 64, group_name: 'B' },
  { id: 'qat', name: 'Qatar', name_cn: '卡塔尔', flag: '🇶🇦', ranking: 55, group_name: 'B' },
  { id: 'sui', name: 'Switzerland', name_cn: '瑞士', flag: '🇨🇭', ranking: 19, group_name: 'B' },

  { id: 'bra', name: 'Brazil', name_cn: '巴西', flag: '🇧🇷', ranking: 6, group_name: 'C' },
  { id: 'mar', name: 'Morocco', name_cn: '摩洛哥', flag: '🇲🇦', ranking: 7, group_name: 'C' },
  { id: 'sco', name: 'Scotland', name_cn: '苏格兰', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', ranking: 43, group_name: 'C' },
  { id: 'hai', name: 'Haiti', name_cn: '海地', flag: '🇭🇹', ranking: 82, group_name: 'C' },

  { id: 'usa', name: 'USA', name_cn: '美国', flag: '🇺🇸', ranking: 17, group_name: 'D' },
  { id: 'tur', name: 'Türkiye', name_cn: '土耳其', flag: '🇹🇷', ranking: 22, group_name: 'D' },
  { id: 'aus', name: 'Australia', name_cn: '澳大利亚', flag: '🇦🇺', ranking: 27, group_name: 'D' },
  { id: 'par', name: 'Paraguay', name_cn: '巴拉圭', flag: '🇵🇾', ranking: 40, group_name: 'D' },

  { id: 'ger', name: 'Germany', name_cn: '德国', flag: '🇩🇪', ranking: 10, group_name: 'E' },
  { id: 'ecu', name: 'Ecuador', name_cn: '厄瓜多尔', flag: '🇪🇨', ranking: 24, group_name: 'E' },
  { id: 'civ', name: 'Ivory Coast', name_cn: '科特迪瓦', flag: '🇨🇮', ranking: 33, group_name: 'E' },
  { id: 'cuw', name: 'Curaçao', name_cn: '库拉索', flag: '🇨🇼', ranking: 83, group_name: 'E' },

  { id: 'ned', name: 'Netherlands', name_cn: '荷兰', flag: '🇳🇱', ranking: 8, group_name: 'F' },
  { id: 'jpn', name: 'Japan', name_cn: '日本', flag: '🇯🇵', ranking: 18, group_name: 'F' },
  { id: 'swe', name: 'Sweden', name_cn: '瑞典', flag: '🇸🇪', ranking: 38, group_name: 'F' },
  { id: 'tun', name: 'Tunisia', name_cn: '突尼斯', flag: '🇹🇳', ranking: 46, group_name: 'F' },

  { id: 'bel', name: 'Belgium', name_cn: '比利时', flag: '🇧🇪', ranking: 9, group_name: 'G' },
  { id: 'irn', name: 'Iran', name_cn: '伊朗', flag: '🇮🇷', ranking: 20, group_name: 'G' },
  { id: 'egy', name: 'Egypt', name_cn: '埃及', flag: '🇪🇬', ranking: 29, group_name: 'G' },
  { id: 'nzl', name: 'New Zealand', name_cn: '新西兰', flag: '🇳🇿', ranking: 85, group_name: 'G' },

  { id: 'esp', name: 'Spain', name_cn: '西班牙', flag: '🇪🇸', ranking: 2, group_name: 'H' },
  { id: 'uru', name: 'Uruguay', name_cn: '乌拉圭', flag: '🇺🇾', ranking: 17, group_name: 'H' },
  { id: 'ksa', name: 'Saudi Arabia', name_cn: '沙特阿拉伯', flag: '🇸🇦', ranking: 61, group_name: 'H' },
  { id: 'cpv', name: 'Cape Verde', name_cn: '佛得角', flag: '🇨🇻', ranking: 68, group_name: 'H' },

  { id: 'fra', name: 'France', name_cn: '法国', flag: '🇫🇷', ranking: 3, group_name: 'I' },
  { id: 'sen', name: 'Senegal', name_cn: '塞内加尔', flag: '🇸🇳', ranking: 15, group_name: 'I' },
  { id: 'nor', name: 'Norway', name_cn: '挪威', flag: '🇳🇴', ranking: 31, group_name: 'I' },
  { id: 'irq', name: 'Iraq', name_cn: '伊拉克', flag: '🇮🇶', ranking: 56, group_name: 'I' },

  { id: 'arg', name: 'Argentina', name_cn: '阿根廷', flag: '🇦🇷', ranking: 1, group_name: 'J' },
  { id: 'aut', name: 'Austria', name_cn: '奥地利', flag: '🇦🇹', ranking: 23, group_name: 'J' },
  { id: 'alg', name: 'Algeria', name_cn: '阿尔及利亚', flag: '🇩🇿', ranking: 28, group_name: 'J' },
  { id: 'jor', name: 'Jordan', name_cn: '约旦', flag: '🇯🇴', ranking: 63, group_name: 'J' },

  { id: 'por', name: 'Portugal', name_cn: '葡萄牙', flag: '🇵🇹', ranking: 5, group_name: 'K' },
  { id: 'col', name: 'Colombia', name_cn: '哥伦比亚', flag: '🇨🇴', ranking: 13, group_name: 'K' },
  { id: 'cod', name: 'DR Congo', name_cn: '民主刚果', flag: '🇨🇩', ranking: 45, group_name: 'K' },
  { id: 'uzb', name: 'Uzbekistan', name_cn: '乌兹别克斯坦', flag: '🇺🇿', ranking: 50, group_name: 'K' },

  { id: 'eng', name: 'England', name_cn: '英格兰', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ranking: 4, group_name: 'L' },
  { id: 'cro', name: 'Croatia', name_cn: '克罗地亚', flag: '🇭🇷', ranking: 11, group_name: 'L' },
  { id: 'pan', name: 'Panama', name_cn: '巴拿马', flag: '🇵🇦', ranking: 34, group_name: 'L' },
  { id: 'gha', name: 'Ghana', name_cn: '加纳', flag: '🇬🇭', ranking: 73, group_name: 'L' },
]

function buildMatches() {
  const matches = []
  let mn = 1

  const groups = ['A','B','C','D','E','F','G','H','I','J','K','L']

  const groupFixtures = {
    // teams: [mex(0), rsa(1), kor(2), cze(3)]
    A: [[0,1],[2,3],[3,1],[0,2],[3,0],[1,2]],
    // teams: [can(0), bih(1), qat(2), sui(3)]
    B: [[0,1],[2,3],[3,1],[0,2],[3,0],[1,2]],
    // teams: [bra(0), mar(1), sco(2), hai(3)]
    C: [[0,1],[3,2],[2,1],[0,3],[2,0],[1,3]],
    // teams: [usa(0), tur(1), aus(2), par(3)]
    D: [[0,3],[2,1],[0,2],[1,3],[1,0],[3,2]],
    // teams: [ger(0), ecu(1), civ(2), cuw(3)]
    E: [[0,3],[2,1],[0,2],[1,3],[3,2],[1,0]],
    // teams: [ned(0), jpn(1), swe(2), tun(3)]
    F: [[0,1],[2,3],[0,2],[3,1],[1,2],[3,0]],
    // teams: [bel(0), irn(1), egy(2), nzl(3)]
    G: [[0,2],[1,3],[0,1],[3,2],[2,1],[3,0]],
    // teams: [esp(0), uru(1), ksa(2), cpv(3)]
    H: [[0,3],[2,1],[0,2],[1,3],[3,2],[1,0]],
    // teams: [fra(0), sen(1), nor(2), irq(3)]
    I: [[0,1],[3,2],[0,3],[2,1],[2,0],[1,3]],
    // teams: [arg(0), aut(1), alg(2), jor(3)]
    J: [[0,2],[1,3],[0,1],[3,2],[2,1],[3,0]],
    // teams: [por(0), col(1), cod(2), uzb(3)]
    K: [[0,2],[3,1],[0,3],[1,2],[1,0],[2,3]],
    // teams: [eng(0), cro(1), pan(2), gha(3)]
    L: [[0,1],[3,2],[0,3],[2,1],[2,0],[1,3]],
  }

  const baseDate = new Date('2026-06-11T00:00:00+08:00')

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]
    const gTeams = teams.filter(t => t.group_name === g)
    const fixtures = groupFixtures[g]

    for (let fi = 0; fi < fixtures.length; fi++) {
      const [i, j] = fixtures[fi]
      const date = new Date(baseDate.getTime() + (gi * 0.5 + fi) * 86400000)
      const bjDate = new Date(date.getTime() + (8 * 60 * 60 * 1000))
      matches.push({
        round: '小组赛',
        group_name: g,
        match_number: mn++,
        home_team_id: gTeams[i].id,
        away_team_id: gTeams[j].id,
        match_date: bjDate.toISOString().split('T')[0],
        status: 'scheduled',
      })
    }
  }

  const knockRounds = [
    { round: '1/16决赛', count: 16, startDay: 17 },
    { round: '1/8决赛', count: 8, startDay: 23 },
    { round: '1/4决赛', count: 4, startDay: 29 },
    { round: '半决赛', count: 2, startDay: 34 },
    { round: '季军赛', count: 1, startDay: 38 },
    { round: '决赛', count: 1, startDay: 39 },
  ]

  for (const kr of knockRounds) {
    for (let k = 0; k < kr.count; k++) {
      const date = new Date(baseDate.getTime() + (kr.startDay + k) * 86400000)
      const bjDate = new Date(date.getTime() + (8 * 60 * 60 * 1000))
      matches.push({
        round: kr.round,
        group_name: null,
        match_number: mn++,
        home_team_id: null,
        away_team_id: null,
        match_date: bjDate.toISOString().split('T')[0],
        status: 'scheduled',
      })
    }
  }

  return matches
}

// 淘汰赛真实数据（来源：体彩官网 + worldcup26.ir API）
// 日期时间为北京时间
const KNOCKOUT_DATA = [
  // 1/16决赛（体彩编号对应 worldcup26.ir 编号）
  { mn: 73, home: 'rsa', away: 'can', date: '2026-06-29', time: '03:00' },   // 南非 vs 加拿大
  { mn: 74, home: 'bra', away: 'jpn', date: '2026-06-30', time: '01:00' },   // 巴西 vs 日本
  { mn: 75, home: 'ger', away: 'par', date: '2026-06-30', time: '04:30' },   // 德国 vs 巴拉圭
  { mn: 76, home: 'ned', away: 'mar', date: '2026-06-30', time: '09:00' },   // 荷兰 vs 摩洛哥
  { mn: 77, home: 'civ', away: 'nor', date: '2026-07-01', time: '01:00' },   // 科特迪瓦 vs 挪威
  { mn: 78, home: 'fra', away: 'swe', date: '2026-07-01', time: '05:00' },   // 法国 vs 瑞典
  { mn: 79, home: 'mex', away: 'ecu', date: '2026-07-01', time: '08:00' },   // 墨西哥 vs 厄瓜多尔
  { mn: 80, home: 'eng', away: 'cod', date: '2026-07-02', time: '00:00' },   // 英格兰 vs 民主刚果
  { mn: 81, home: 'usa', away: 'bih', date: '2026-07-02', time: '05:00' },   // 美国 vs 波黑
  { mn: 82, home: 'bel', away: 'sen', date: '2026-07-02', time: '01:00' },   // 比利时 vs 塞内加尔
  { mn: 83, home: 'por', away: 'cro', date: '2026-07-03', time: '08:00' },   // 葡萄牙 vs 克罗地亚
  { mn: 84, home: 'esp', away: 'aut', date: '2026-07-03', time: '00:00' },   // 西班牙 vs 奥地利
  { mn: 85, home: 'sui', away: 'alg', date: '2026-07-03', time: '09:00' },   // 瑞士 vs 阿尔及利亚
  { mn: 86, home: 'arg', away: 'cpv', date: '2026-07-04', time: '07:00' },   // 阿根廷 vs 佛得角
  { mn: 87, home: 'col', away: 'gha', date: '2026-07-04', time: '09:30' },   // 哥伦比亚 vs 加纳
  { mn: 88, home: 'aus', away: 'egy', date: '2026-07-04', time: '01:00' },   // 澳大利亚 vs 埃及
  // 1/8决赛（待小组赛结果确定后填充）
  { mn: 89, home: null, away: null, date: '2026-07-05', time: '03:00' },
  { mn: 90, home: null, away: null, date: '2026-07-05', time: '09:00' },
  { mn: 91, home: null, away: null, date: '2026-07-06', time: '03:00' },
  { mn: 92, home: null, away: null, date: '2026-07-06', time: '09:00' },
  { mn: 93, home: null, away: null, date: '2026-07-07', time: '03:00' },
  { mn: 94, home: null, away: null, date: '2026-07-07', time: '09:00' },
  { mn: 95, home: null, away: null, date: '2026-07-08', time: '03:00' },
  { mn: 96, home: null, away: null, date: '2026-07-08', time: '09:00' },
  // 1/4决赛
  { mn: 97, home: null, away: null, date: '2026-07-10', time: '03:00' },
  { mn: 98, home: null, away: null, date: '2026-07-10', time: '09:00' },
  { mn: 99, home: null, away: null, date: '2026-07-11', time: '03:00' },
  { mn: 100, home: null, away: null, date: '2026-07-11', time: '09:00' },
  // 半决赛
  { mn: 101, home: null, away: null, date: '2026-07-15', time: '03:00' },
  { mn: 102, home: null, away: null, date: '2026-07-16', time: '09:00' },
  // 季军赛 + 决赛
  { mn: 103, home: null, away: null, date: '2026-07-19', time: '03:00' },
  { mn: 104, home: null, away: null, date: '2026-07-20', time: '03:00' },
]

function updateKnockoutData(db) {
  let updated = 0
  const stmt = db.prepare('UPDATE matches SET home_team_id=?, away_team_id=?, match_date=?, match_time=? WHERE match_number=?')
  for (const k of KNOCKOUT_DATA) {
    stmt.run(k.home, k.away, k.date, k.time, k.mn)
    updated++
  }
  console.log(`[Seed] 淘汰赛数据已更新: ${updated} 场`)
  return updated
}

async function seed() {
  const { initDb } = require('./db')
  await initDb()
  const db = getDb()
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'").get()
  if (!tableExists) {
    console.log('数据库未初始化，请先启动服务')
    return
  }

  // 每次启动都更新淘汰赛数据
  updateKnockoutData(db)
  const { saveDbSync } = require('./db')
  saveDbSync()

  const existingTeams = db.prepare('SELECT COUNT(*) as cnt FROM teams').get()
  if (existingTeams.cnt > 0) {
    console.log('数据库已有数据，跳过种子数据')
    return
  }

  const insertTeam = db.prepare(
    'INSERT INTO teams (id, name, name_cn, flag, ranking, group_name) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const insertMatch = db.prepare(
    'INSERT INTO matches (round, group_name, match_number, home_team_id, away_team_id, match_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )

  const tx = db.transaction(() => {
    for (const t of teams) insertTeam.run(t.id, t.name, t.name_cn, t.flag, t.ranking, t.group_name)

    const all = buildMatches()
    for (const m of all) insertMatch.run(m.round, m.group_name, m.match_number, m.home_team_id, m.away_team_id, m.match_date, m.status)
  })

  tx()
  const mCount = buildMatches().length
  console.log(`种子数据已导入: ${teams.length} 支球队, ${mCount} 场比赛`)
}

module.exports = { seed, teams, buildMatches }
