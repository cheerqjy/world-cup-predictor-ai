const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'worldcup.db');

async function main() {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  // Get all completed predictions with odds
  const r = db.exec(`
    SELECT p.match_id, p.home_score as ph, p.away_score as pa,
           p.total_goals, p.total_goals_2, p.half_full_result, p.handicap_result,
           m.match_number, m.home_score as mh, m.away_score as ma,
           m.half_home_score, m.half_away_score,
           ht.name_cn as home_name, at.name_cn as away_name,
           o.sp3, o.sp1, o.sp0, o.bqc_odds
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    LEFT JOIN lottery_odds o ON o.match_id = m.id
    WHERE m.status = 'completed' AND m.half_home_score IS NOT NULL
    ORDER BY m.match_number
  `);

  if (!r.length) { console.log('No data'); db.close(); return; }

  let scoreProfit = 0, hfProfit = 0, tgProfit = 0;
  let scoreWins = 0, tgWins = 0, hfWins = 0;
  let totalMatches = 0;

  const scoreDetail = [];
  const hfDetail = [];
  const tgDetail = [];

  r[0].values.forEach(([mid, ph, pa, tg, tg2, hf_pred, rq, num, mh, ma, hhs, has, hn, an, sp3, sp1, sp0, bqc]) => {
    totalMatches++;
    const actualResult = mh > ma ? '胜' : mh < ma ? '负' : '平';
    const actualTG = mh + ma;
    const actualTGStr = actualTG >= 7 ? '7+' : String(actualTG);
    
    let actualHF = '';
    const htDiff = hhs - has;
    const ftDiff = mh - ma;
    if (htDiff > 0 && ftDiff > 0) actualHF = '胜-胜';
    else if (htDiff > 0 && ftDiff === 0) actualHF = '胜-平';
    else if (htDiff > 0 && ftDiff < 0) actualHF = '胜-负';
    else if (htDiff === 0 && ftDiff > 0) actualHF = '平-胜';
    else if (htDiff === 0 && ftDiff === 0) actualHF = '平-平';
    else if (htDiff === 0 && ftDiff < 0) actualHF = '平-负';
    else if (htDiff < 0 && ftDiff > 0) actualHF = '负-胜';
    else if (htDiff < 0 && ftDiff === 0) actualHF = '负-平';
    else if (htDiff < 0 && ftDiff < 0) actualHF = '负-负';

    // 比分: 用合成比分赔率
    const scoreKey = `${ph}-${pa}`;
    const scoreOdds = estimateScoreOdds(ph, pa, sp3, sp1, sp0);
    if (mh === ph && ma === pa) {
      const win = 10 * scoreOdds - 10;
      scoreProfit += win;
      scoreWins++;
      scoreDetail.push(`#${num} ${hn}vs${an} ${scoreKey} ✓ +${win.toFixed(1)}元 (赔率${scoreOdds})`);
    } else {
      scoreProfit -= 10;
      scoreDetail.push(`#${num} ${hn}vs${an} ${ph}-${pa} ✗ -10元 (实际${mh}-${ma})`);
    }

    // 半全场
    if (bqc) {
      try {
        const bqcObj = JSON.parse(bqc);
        const hfOdds = getHfOdds(hf_pred, bqcObj);
        if (hf_pred === actualHF) {
          const win = 10 * hfOdds - 10;
          hfProfit += win;
          hfWins++;
          hfDetail.push(`#${num} ${hn}vs${an} ${hf_pred} ✓ +${win.toFixed(1)}元 (赔率${hfOdds})`);
        } else {
          hfProfit -= 10;
          hfDetail.push(`#${num} ${hn}vs${an} ${hf_pred} ✗ -10元 (实际${actualHF})`);
        }
      } catch {
        // 无赔率数据，用估算
        const hfOdds = estimateHfOdds(hf_pred);
        if (hf_pred === actualHF) {
          const win = 10 * hfOdds - 10;
          hfProfit += win;
          hfWins++;
        } else {
          hfProfit -= 10;
        }
      }
    } else {
      const hfOdds = estimateHfOdds(hf_pred);
      if (hf_pred === actualHF) {
        const win = 10 * hfOdds - 10;
        hfProfit += win;
        hfWins++;
        hfDetail.push(`#${num} ${hn}vs${an} ${hf_pred} ✓ +${win.toFixed(1)}元 (估赔率${hfOdds})`);
      } else {
        hfProfit -= 10;
        hfDetail.push(`#${num} ${hn}vs${an} ${hf_pred} ✗ -10元 (实际${actualHF})`);
      }
    }

    // 总进球
    const tgOdds = estimateTgOdds(tg);
    if (tg === actualTGStr || tg2 === actualTGStr) {
      const win = 10 * tgOdds - 10;
      tgProfit += win;
      tgWins++;
      tgDetail.push(`#${num} ${hn}vs${an} 进球${tg} ✓ +${win.toFixed(1)}元 (赔率${tgOdds})`);
    } else {
      tgProfit -= 10;
      tgDetail.push(`#${num} ${hn}vs${an} 进球${tg} ✗ -10元 (实际${actualTGStr})`);
    }
  });

  console.log('========================================');
  console.log('          投注盈亏分析 (每场10元)');
  console.log('========================================');
  console.log(`总场次: ${totalMatches}`);
  
  console.log('\n--- 比分 ---');
  console.log(`命中: ${scoreWins}/${totalMatches} (${(scoreWins/totalMatches*100).toFixed(1)}%)`);
  console.log(`总投入: ${totalMatches * 10}元`);
  console.log(`总回收: ${(scoreProfit + totalMatches * 10).toFixed(1)}元`);
  console.log(`净盈亏: ${scoreProfit >= 0 ? '+' : ''}${scoreProfit.toFixed(1)}元`);
  scoreDetail.filter(d => d.includes('✓')).forEach(d => console.log('  ' + d));

  console.log('\n--- 半全场 ---');
  console.log(`命中: ${hfWins}/${totalMatches} (${(hfWins/totalMatches*100).toFixed(1)}%)`);
  console.log(`总投入: ${totalMatches * 10}元`);
  console.log(`总回收: ${(hfProfit + totalMatches * 10).toFixed(1)}元`);
  console.log(`净盈亏: ${hfProfit >= 0 ? '+' : ''}${hfProfit.toFixed(1)}元`);
  hfDetail.filter(d => d.includes('✓')).forEach(d => console.log('  ' + d));

  console.log('\n--- 总进球 ---');
  console.log(`命中: ${tgWins}/${totalMatches} (${(tgWins/totalMatches*100).toFixed(1)}%)`);
  console.log(`总投入: ${totalMatches * 10}元`);
  console.log(`总回收: ${(tgProfit + totalMatches * 10).toFixed(1)}元`);
  console.log(`净盈亏: ${tgProfit >= 0 ? '+' : ''}${tgProfit.toFixed(1)}元`);
  tgDetail.filter(d => d.includes('✓')).forEach(d => console.log('  ' + d));

  db.close();
}

// 估算比分赔率
function estimateScoreOdds(ph, pa, sp3, sp1, sp0) {
  const total = ph + pa;
  // 基础比分赔率参考
  const baseOdds = {
    '0-0': 9, '1-1': 6.5, '2-2': 15,
    '1-0': 5.5, '2-1': 8, '3-1': 15, '3-2': 28, '4-1': 40, '4-2': 60, '3-0': 10, '4-0': 22, '2-0': 6.5,
    '0-1': 7, '1-2': 9.5, '2-3': 18, '3-4': 50, '1-3': 18, '0-2': 9, '0-3': 17, '1-4': 40, '0-4': 45,
  };
  const key = `${ph}-${pa}`;
  return baseOdds[key] || (total <= 1 ? 8 : total <= 2 ? 12 : total <= 3 ? 18 : 25);
}

// 估算半全场赔率
function estimateHfOdds(hf) {
  const odds = {
    '胜-胜': 2.2, '胜-平': 14, '胜-负': 28,
    '平-胜': 4.5, '平-平': 5, '平-负': 8,
    '负-胜': 22, '负-平': 12, '负-负': 3,
  };
  return odds[hf] || 10;
}

// 从bqc_odds获取半全场赔率
function getHfOdds(hf, bqcObj) {
  // bqc_odds格式可能是 {胜-胜: x.x, ...}
  if (bqcObj[hf]) return bqcObj[hf];
  // 尝试其他格式
  const map = {'胜胜':'胜-胜','胜平':'胜-平','胜负':'胜-负','平胜':'平-胜','平平':'平-平','平负':'平-负','负胜':'负-胜','负平':'负-平','负负':'负-负'};
  for (const [k, v] of Object.entries(map)) {
    if (v === hf && bqcObj[k]) return bqcObj[k];
  }
  return estimateHfOdds(hf);
}

// 估算总进球赔率
function estimateTgOdds(tg) {
  const odds = {
    '0': 8.5, '1': 4.2, '2': 3.5, '3': 3.5, '4': 4.8, '5': 7.5, '6': 12, '7+': 15,
  };
  return odds[tg] || 10;
}

main();
