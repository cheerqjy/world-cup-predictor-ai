const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'worldcup.db');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // Fix: set correct_half_full = 0 for match 73 (prediction 负-负 doesn't match actual 平-负)
  db.run("UPDATE predictions SET correct_half_full = 0 WHERE match_id = (SELECT id FROM matches WHERE match_number = 73)");

  // Verify
  const r = db.exec(`
    SELECT p.half_full_result, p.correct_half_full,
           m.half_home_score, m.half_away_score, m.home_score, m.away_score
    FROM predictions p JOIN matches m ON p.match_id = m.id
    WHERE m.match_number = 73
  `);
  if (r.length) {
    console.log('After fix:', r[0].values[0]);
  }

  // Save to both locations
  const data = db.export();
  const buf = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buf);
  fs.writeFileSync(path.join(__dirname, 'release-server', 'data', 'worldcup.db'), buf);
  console.log('Saved to both local and release-server!');

  db.close();
}
main();
