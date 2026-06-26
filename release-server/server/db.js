const initSqlJs = require('sql.js')
const path = require('path')

const DB_PATH = process.env.ELECTRON_DATA_DIR
  ? path.join(process.env.ELECTRON_DATA_DIR, 'worldcup.db')
  : path.join(__dirname, '..', 'data', 'worldcup.db')

let db = null
let initPromise = null

class Statement {
  constructor(sqlDb, sql) {
    this.sqlDb = sqlDb
    this.sql = sql
  }
  get(...params) {
    const stmt = this.sqlDb.prepare(this.sql)
    if (params.length) stmt.bind(params)
    const has = stmt.step()
    if (has) {
      const row = stmt.getAsObject()
      stmt.free()
      return row
    }
    stmt.free()
    return undefined
  }
  all(...params) {
    const stmt = this.sqlDb.prepare(this.sql)
    if (params.length) stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }
  run(...params) {
    const stmt = this.sqlDb.prepare(this.sql)
    if (params.length) stmt.bind(params)
    stmt.step()
    stmt.free()
    const idResult = this.sqlDb.exec("SELECT last_insert_rowid() as id")
    const id = idResult[0] ? idResult[0].values[0][0] : 0
    return { changes: this.sqlDb.getRowsModified(), lastInsertRowid: Number(id) }
  }
}

class Database {
  constructor(sqlDb) {
    this.sqlDb = sqlDb
  }
  prepare(sql) { return new Statement(this.sqlDb, sql) }
  exec(sql) { this.sqlDb.exec(sql) }
  pragma() {}
  transaction(fn) {
    const self = this
    return function wrapped(...args) {
      self.sqlDb.exec("BEGIN")
      try {
        const result = fn(...args)
        self.sqlDb.exec("COMMIT")
        return result
      } catch (e) {
        self.sqlDb.exec("ROLLBACK")
        throw e
      }
    }
  }
  close() {
    if (this.sqlDb) {
      try { this.sqlDb.close() } catch (e) {}
    }
  }
  export() {
    return this.sqlDb.export()
  }
}

function getDb() {
  if (!db) throw new Error('数据库未初始化')
  return db
}

async function initDb() {
  if (db) return db
  if (initPromise) return initPromise

  initPromise = (async () => {
    const SqlJs = await initSqlJs()
    const fs = require('fs')
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH)
      const sqlDb = new SqlJs.Database(buffer)
      db = new Database(sqlDb)
      console.log('[DB] 从文件加载数据库')
    } else {
      const sqlDb = new SqlJs.Database()
      db = new Database(sqlDb)
      console.log('[DB] 创建新数据库')
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL, name_cn TEXT NOT NULL, flag TEXT NOT NULL,
        ranking INTEGER NOT NULL, group_name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round TEXT NOT NULL, group_name TEXT, match_number INTEGER NOT NULL,
        home_team_id TEXT, away_team_id TEXT, match_date TEXT,
        status TEXT DEFAULT 'scheduled',
        home_score INTEGER, away_score INTEGER,
        half_home_score INTEGER, half_away_score INTEGER
      );
      CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        predicted_at TEXT DEFAULT (datetime('now', 'localtime')),
        home_score INTEGER NOT NULL, away_score INTEGER NOT NULL,
        half_home_score INTEGER, half_away_score INTEGER,
        result_1x2 TEXT NOT NULL, total_goals TEXT NOT NULL,
        total_goals_2 TEXT,
        handicap_result TEXT, half_full_result TEXT NOT NULL,
        ai_model TEXT, confidence REAL,
        correct_score INTEGER DEFAULT 0, correct_result INTEGER DEFAULT 0,
        correct_total_goals INTEGER DEFAULT 0, correct_half_full INTEGER DEFAULT 0,
        correct_rq_result INTEGER DEFAULT 0,
        confidence_detail TEXT,
        FOREIGN KEY (match_id) REFERENCES matches(id)
      );
      CREATE TABLE IF NOT EXISTS champion_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        champion_team_id TEXT NOT NULL, runner_up_team_id TEXT NOT NULL,
        predicted_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (champion_team_id) REFERENCES teams(id),
        FOREIGN KEY (runner_up_team_id) REFERENCES teams(id)
      );
      CREATE TABLE IF NOT EXISTS ai_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL DEFAULT 'openai',
        api_key TEXT, model TEXT DEFAULT 'gpt-4o', base_url TEXT
      );
      CREATE TABLE IF NOT EXISTS recommendation_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        active_data TEXT NOT NULL,
        past_data TEXT
      );
    `)
    // Migration for existing databases
    try { db.exec(`ALTER TABLE predictions ADD COLUMN total_goals_2 TEXT`) } catch (e) {}
    try { db.exec(`ALTER TABLE matches ADD COLUMN match_time TEXT`) } catch (e) {}
    try { db.exec(`ALTER TABLE predictions ADD COLUMN confidence_detail TEXT`) } catch (e) {}
    try { db.exec(`ALTER TABLE predictions ADD COLUMN correct_rq_result INTEGER DEFAULT 0`) } catch (e) {}
    return db
  })()

  return initPromise
}

function saveDbSync() {
  if (!db) return
  try {
    const data = db.export()
    const fs = require('fs')
    fs.writeFileSync(DB_PATH, Buffer.from(data))
  } catch (e) {
    console.error('[DB] 保存失败:', e.message)
  }
}

module.exports = { getDb, initDb, saveDbSync }
