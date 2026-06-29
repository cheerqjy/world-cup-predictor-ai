const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'worldcup.db');

function calcActualHalfFull(hhs, has, hs, as) {
  if (hhs === null || has === null || hs === null || as === null) return null;
  const htDiff = hhs - has;
  const ftDiff = hs - as;
  if (htDiff > 0 && ftDiff > 0) return '胜-胜';
  if (htDiff > 0 && ftDiff === 0) return '胜-平';
  if (htDiff > 0 && ftDiff < 0) return '胜-负';
  if (htDiff === 0 && ftDiff > 0) return '平-胜';
  if (htDiff === 0 && ftDiff === 0) return '平-平';
  if (htDiff === 0 && ftDiff < 0) return '平-负';
  if (htDiff < 0 && ftDiff > 0) return '负-胜';
  if (htDiff < 0 && ftDiff === 0) return '负-平';
  if (htDiff < 0 && ftDiff < 0) return '负-负';
  return null;
}

async function main() {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  // Get all predictions for completed matches
  const r = db.exec(`
    SELECT p.id as pid, p.match_id, p.half_full_result as pred_hf, p.correct_half_full,
           m.match_number, m.half_home_score, m.half_away_score, m.home_score, m.away_score,
           ht.name_cn, at.name_cn
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.status = 'completed' AND m.half_home_score IS NOT NULL
    ORDER BY m.match_number
  `);

  if (!r.length) { console.log('No data'); db.close(); return; }

  let total = 0, correct = 0, changed = 0;
  console.log('=== Recalculating correct_half_full ===');

  r[0].values.forEach(([pid, mid, pred_hf, old_correct, num, hhs, has, hs, as, hn, an]) => {
    total++;
    const actual_hf = calcActualHalfFull(hhs, has, hs, as);
    const isCorrect = (actual_hf === pred_hf) ? 1 : 0;
    if (isCorrect) correct++;

    if (isCorrect !== old_correct) {
      console.log(`#${num} ${hn} vs ${an}: pred=${pred_hf} actual=${actual_hf} ${old_correct}→${isCorrect}`);
      changed++;
    }
    db.run('UPDATE predictions SET correct_half_full = ? WHERE id = ?', [isCorrect, pid]);
  });

  console.log(`\nTotal: ${total}, Correct: ${correct}, Accuracy: ${(correct/total*100).toFixed(1)}%`);
  console.log(`Changed: ${changed}`);

  // Save
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('DB saved!');

  // Copy to release-server
  const releaseDB = path.join(__dirname, 'release-server', 'data', 'worldcup.db');
  fs.writeFileSync(releaseDB, Buffer.from(data));
  console.log('Copied to release-server!');

  db.close();
}
main();
