#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const RELEASE_DIR = path.join(__dirname, 'release')

console.log('========================================')
console.log('  WorldCup Predictor - Windows 打包')
console.log('========================================')
console.log()

// 1. 构建前端
console.log('[1/3] 构建前端...')
execSync('npm run build', { stdio: 'inherit', cwd: __dirname })

// 2. 打包 Windows
console.log('[2/3] 打包 Windows 安装包...')
execSync('npx electron-builder --win', { stdio: 'inherit', cwd: __dirname })

// 3. 清理多余文件
console.log('[3/3] 清理多余文件...')
if (fs.existsSync(RELEASE_DIR)) {
  const entries = fs.readdirSync(RELEASE_DIR)
  for (const entry of entries) {
    if (entry.endsWith('-Setup.exe') || entry.endsWith('-Portable.exe')) {
      console.log(`  保留: ${entry}`)
    } else {
      const fullPath = path.join(RELEASE_DIR, entry)
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true })
        } else {
          fs.unlinkSync(fullPath)
        }
        console.log(`  删除: ${entry}`)
      } catch (e) {
        console.log(`  跳过: ${entry}`)
      }
    }
  }
}

console.log()
console.log('========================================')
console.log('  打包完成!')
console.log('========================================')
console.log()
console.log('输出目录: release/')
console.log('发送给用户: *-Setup.exe 或 *-Portable.exe')
console.log('========================================')
