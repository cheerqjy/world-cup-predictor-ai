const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const net = require('net')

const isDev = process.env.NODE_ENV !== 'production'

// 配置文件路径
const configPath = path.join(__dirname, 'config.json')

// 读取配置
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }
  } catch (e) {
    console.error('[Config] 读取配置失败:', e.message)
  }
  return { server: { host: '127.0.0.1', port: 3001 } }
}

const config = loadConfig()
const serverHost = config.server?.host || '127.0.0.1'
const serverPort = config.server?.port || 3001

let mainWindow = null
let actualPort = null

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

function waitForServer(host, port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const req = require('http').get(`http://${host}:${port}/api/health`, (res) => {
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('服务器启动超时'))
        } else {
          setTimeout(check, 500)
        }
      })
      req.end()
    }
    check()
  })
}

function createWindow(port) {
  const host = '127.0.0.1'
  const url = port ? `http://${host}:${port}` : `http://${serverHost}:${serverPort}`
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '2026世界杯预测',
    icon: path.join(__dirname, '..', 'public', 'favicon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    show: false,
  })

  console.log(`[Electron] 连接服务器: ${url}`)
  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function startLocalServer() {
  try {
    const port = await findAvailablePort()
    process.env.PORT = String(port)
    process.env.ELECTRON_APP = '1'
    
    const userDataPath = app.getPath('userData')
    const dataDir = path.join(userDataPath, 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    process.env.ELECTRON_DATA_DIR = dataDir

    // 复制初始数据库到用户目录（如果不存在）
    const targetDb = path.join(dataDir, 'worldcup.db')
    if (!fs.existsSync(targetDb)) {
      const sourceDb = path.join(__dirname, '..', 'data', 'worldcup.db')
      if (fs.existsSync(sourceDb)) {
        fs.copyFileSync(sourceDb, targetDb)
        console.log(`[Electron] 已复制初始数据库到 ${targetDb}`)
      }
    }

    require(path.join(__dirname, '..', 'server', 'index.js'))
    await waitForServer('127.0.0.1', port)
    console.log(`[Electron] 本地服务器启动在端口 ${port}`)
    return port
  } catch (err) {
    console.error('[Electron] 本地服务器启动失败:', err)
    throw err
  }
}

async function main() {
  // 判断是否连接远程服务器
  const useRemote = serverHost !== '127.0.0.1' && serverHost !== 'localhost'
  
  if (useRemote) {
    console.log(`[Electron] 使用远程服务器: ${serverHost}:${serverPort}`)
    try {
      await waitForServer(serverHost, serverPort, 5000)
      createWindow()
    } catch (err) {
      dialog.showErrorBox('连接失败', `无法连接到远程服务器 ${serverHost}:${serverPort}\n\n请确认服务器已启动`)
      app.quit()
    }
  } else {
    console.log('[Electron] 启动本地服务器...')
    try {
      const port = await startLocalServer()
      actualPort = port
      createWindow(port)
    } catch (err) {
      dialog.showErrorBox('启动失败', `本地服务器启动失败: ${err.message}`)
      app.quit()
    }
  }
}

app.whenReady().then(main)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(actualPort)
  }
})
