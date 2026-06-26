#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = __dirname
const RELEASE_DIR = path.join(ROOT, 'release-server')

console.log('========================================')
console.log('  WorldCup Predictor - Deploy Packager')
console.log('========================================')
console.log()

// 0. Build Windows portable first
console.log('[0/7] Building Windows portable...')
try {
  execSync('npx electron-builder --win portable', { stdio: 'inherit', cwd: ROOT })
} catch (e) {
  console.log('  Windows build failed, continuing...')
}

// 1. Clean
console.log('[1/6] Cleaning old release...')
if (fs.existsSync(RELEASE_DIR)) {
  try { fs.rmSync(RELEASE_DIR, { recursive: true, force: true }) } catch (e) {
    // 部分文件被占用时，尝试逐个删除
    const deleteDir = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name)
        try {
          if (entry.isDirectory()) deleteDir(p)
          else fs.unlinkSync(p)
        } catch {}
      }
      try { fs.rmdirSync(dir) } catch {}
    }
    deleteDir(RELEASE_DIR)
  }
}
fs.mkdirSync(RELEASE_DIR, { recursive: true })

// 2. Build frontend
console.log('[2/6] Building frontend...')
execSync('npm run build', { stdio: 'inherit', cwd: ROOT })

// 3. Copy dist
console.log('[3/6] Copying dist...')
copyDirSync(path.join(ROOT, 'dist'), path.join(RELEASE_DIR, 'dist'))

// 4. Copy server
console.log('[4/6] Copying server...')
copyDirSync(path.join(ROOT, 'server'), path.join(RELEASE_DIR, 'server'))

// 5. Copy database (预置数据)
console.log('[5/6] Copying database...')
const srcDb = path.join(ROOT, 'data', 'worldcup.db')
const destDbDir = path.join(RELEASE_DIR, 'data')
const destDb = path.join(destDbDir, 'worldcup.db')
if (fs.existsSync(srcDb)) {
  fs.mkdirSync(destDbDir, { recursive: true })
  fs.copyFileSync(srcDb, destDb)
  const size = fs.statSync(srcDb).size
  console.log(`  Copied worldcup.db (${(size / 1024).toFixed(1)} KB)`)
} else {
  console.log('  Warning: No database found, server will create new one')
}

// 6. Create package.json
console.log('[6/6] Creating package.json...')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const deployPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: 'server/index.js',
  scripts: { start: 'node server/index.js' },
  dependencies: pkg.dependencies,
  engines: pkg.engines,
}
fs.writeFileSync(path.join(RELEASE_DIR, 'package.json'), JSON.stringify(deployPkg, null, 2))

// 6. Create start.bat (ASCII only to avoid encoding issues)
const startBat = [
  '@echo off',
  'echo ========================================',
  'echo   WorldCup Predictor',
  'echo ========================================',
  'echo.',
  'set NODE_ENV=production',
  'set PORT=8888',
  'echo Starting server on port 8888...',
  'echo Visit: http://localhost:8888',
  'echo.',
  'node server/index.js',
  'pause',
].join('\r\n')
fs.writeFileSync(path.join(RELEASE_DIR, 'start.bat'), startBat)

// 7. Create install.bat
const installBat = [
  '@echo off',
  'echo ========================================',
  'echo   Installing dependencies...',
  'echo ========================================',
  'echo.',
  'call npm install --production',
  'echo.',
  'echo Done! Run start.bat to start server.',
  'pause',
].join('\r\n')
fs.writeFileSync(path.join(RELEASE_DIR, 'install.bat'), installBat)

// 8. Create start.sh (for Linux)
const startSh = [
  '#!/bin/bash',
  'export NODE_ENV=production',
  'export PORT=8888',
  'echo "Starting server on port 8888..."',
  'echo "Visit: http://localhost:8888"',
  'node server/index.js',
].join('\n')
fs.writeFileSync(path.join(RELEASE_DIR, 'start.sh'), startSh)

// 9. Copy Windows release files to downloads directory
console.log('[7/7] Copying Windows release files...')
const downloadsDir = path.join(RELEASE_DIR, 'downloads')
const releaseDir = path.join(ROOT, 'release')
if (fs.existsSync(releaseDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true })
  const releaseFiles = fs.readdirSync(releaseDir)
  for (const file of releaseFiles) {
    if (file.endsWith('.exe')) {
      try {
        fs.copyFileSync(path.join(releaseDir, file), path.join(downloadsDir, file))
        console.log(`  Copied: ${file}`)
      } catch (e) {
        console.log(`  Skip (locked): ${file}`)
      }
    }
  }
}

console.log()
console.log('========================================')
console.log('  Build Complete!')
console.log('========================================')
console.log()
console.log('Release dir: release-server/')
console.log()
console.log('Files:')
listDir(RELEASE_DIR, '')
console.log()
console.log('========================================')
console.log('  Deploy Steps:')
console.log('========================================')
console.log('  1. Upload release-server/ to your server')
console.log('  2. Run install.bat on server')
console.log('  3. Run start.bat to start')
console.log('  4. Visit http://120.48.126.193:8888')
console.log('========================================')

// --- Helpers ---
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function listDir(dir, prefix) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  entries.forEach((e, i) => {
    const isLast = i === entries.length - 1
    const connector = isLast ? '└── ' : '├── '
    console.log(prefix + connector + e.name)
    if (e.isDirectory()) {
      listDir(path.join(dir, e.name), prefix + (isLast ? '    ' : '│   '))
    }
  })
}
