// 测试新的数据同步器
const { initDb } = require('./server/db')
const { seed } = require('./server/seed')
const { fetchAndUpdate } = require('./server/fetcher')

async function test() {
  console.log('=== 测试新数据同步器 ===\n')
  
  await initDb()
  await seed()
  
  console.log('\n开始同步数据...')
  const result = await fetchAndUpdate()
  
  console.log('\n同步完成:', result)
  
  // 检查结果
  const { getDb } = require('./server/db')
  const db = getDb()
  
  const stats = {
    teams: db.prepare('SELECT COUNT(*) as c FROM teams').get().c,
    matches: db.prepare('SELECT COUNT(*) as c FROM matches').get().c,
    completed: db.prepare("SELECT COUNT(*) as c FROM matches WHERE status='completed'").get().c,
    predictions: db.prepare('SELECT COUNT(*) as c FROM predictions').get().c,
  }
  
  console.log('\n=== 数据库状态 ===')
  console.log(`球队: ${stats.teams}`)
  console.log(`比赛: ${stats.matches}`)
  console.log(`已完赛: ${stats.completed}`)
  console.log(`预测: ${stats.predictions}`)
  
  process.exit(0)
}

test().catch(err => {
  console.error('错误:', err)
  process.exit(1)
})
