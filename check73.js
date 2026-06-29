const initSqlJs = require('sql.js');
const fs = require('fs');
const DB_PATH = require('path').join(__dirname, 'data', 'worldcup.db');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  
  // Check predictions for match 73 specifically
  const r = db.exec(`
    SELECT p.half_full_result, p.correct_half_full,
           m.half_home_score, m.half_away_score, m.home_score, m.away_score
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    WHERE m.match_number = 73
  `);
  if (r.length) {
    const [pred_hf, correct, hhs, has, hs, as] = r[0].values[0];
    console.log('Prediction:', pred_hf);
    console.log('correct_half_full:', correct);
    console.log('HT:', hhs, '-', has);
    console.log('FT:', hs, '-', as);
    
    const htDiff = hhs - has;
    const ftDiff = hs - as;
    let actual;
    if (htDiff > 0 && ftDiff > 0) actual = '胜-胜';
    else if (htDiff > 0 && ftDiff === 0) actual = '胜-平';
    else if (htDiff > 0 && ftDiff < 0) actual = '胜-负';
    else if (htDiff === 0 && ftDiff > 0) actual = '平-胜';
    else if (htDiff === 0 && ftDiff === 0) actual = '平-平';
    else if (htDiff === 0 && ftDiff < 0) actual = '平-负';
    else if (htDiff < 0 && ftDiff > 0) actual = '负-胜';
    else if (htDiff < 0 && ftDiff === 0) actual = '负-平';
    else if (htDiff < 0 && ftDiff < 0) actual = '负-负';
    console.log('Actual:', actual);
    console.log('Should be correct:', pred_hf === actual ? 1 : 0);
  }
  
  db.close();
}
main();
