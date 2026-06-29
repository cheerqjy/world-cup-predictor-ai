const initSqlJs = require('sql.js');
const fs = require('fs');
const DB_PATH = require('path').join(__dirname, 'data', 'worldcup.db');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  
  // Check predictions table schema
  const schema = db.exec("PRAGMA table_info(predictions)");
  if (schema.length) {
    console.log('=== predictions columns ===');
    schema[0].values.forEach(row => console.log(row[1] + ' | ' + row[2]));
  }
  
  // Check predictions for match 73
  const r = db.exec("SELECT * FROM predictions WHERE match_id = (SELECT id FROM matches WHERE match_number = 73)");
  if (r.length) {
    console.log('\n=== Predictions for match #73 ===');
    console.log('Columns:', r[0].columns.join(', '));
    r[0].values.forEach(v => console.log(v));
  } else {
    console.log('\nNo predictions for match #73');
  }

  // Also check what the compare endpoint would return for this match
  const cmp = db.exec(`
    SELECT p.half_full as pred_hf, p.correct_half_full,
           m.half_home_score, m.half_away_score, m.home_score, m.away_score,
           ht.name_cn, at.name_cn
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    LEFT JOIN teams ht ON m.home_team_id = ht.id
    LEFT JOIN teams at ON m.away_team_id = at.id
    WHERE m.match_number = 73
  `);
  if (cmp.length) {
    console.log('\n=== Compare data for #73 ===');
    console.log('Columns:', cmp[0].columns.join(', '));
    cmp[0].values.forEach(v => console.log(v));
  }
  
  db.close();
}
main();
