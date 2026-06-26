#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const pkgPath = path.join(__dirname, 'package.json')
const versionsPath = path.join(__dirname, 'src', 'data', 'versions.json')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
let versions = []
if (fs.existsSync(versionsPath)) {
  versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'))
}

const currentVersion = pkg.version
const today = new Date().toISOString().split('T')[0]
const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

// 已存在则跳过
if (versions.find(v => v.version === currentVersion)) {
  console.log('[VersionLog] v' + currentVersion + ' already exists, skip')
  process.exit(0)
}

// 自动从 git log 收集变更内容
let changes = []
try {
  const log = execSync('git log --oneline --since="2 weeks ago" --no-merges -20', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
  const lines = log.trim().split('\n').filter(Boolean)
  const seen = new Set()
  for (const line of lines) {
    const msg = line.replace(/^[a-f0-9]+ /, '').trim()
    if (msg && !seen.has(msg)) {
      seen.add(msg)
      changes.push(msg)
    }
  }
} catch (e) {
  // not a git repo or no commits, ignore
}

// git 没内容就用默认
if (changes.length === 0) {
  changes = ['Version ' + currentVersion + ' release']
}

versions.unshift({
  version: currentVersion,
  date: today,
  changes
})

fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n', 'utf8')
console.log('[VersionLog] v' + currentVersion + ' added (' + changes.length + ' items)')
