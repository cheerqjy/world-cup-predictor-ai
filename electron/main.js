const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const configPath = path.join(__dirname, 'config.json')

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }
  } catch (e) {
    console.error('[Config] 读取配置失败:', e.message)
  }
  return { server: { host: '120.48.126.193', port: 8888 } }
}

const config = loadConfig()
const serverHost = config.server?.host || '120.48.126.193'
const serverPort = config.server?.port || 8888

let mainWindow = null

function createWindow() {
  const url = `http://${serverHost}:${serverPort}`

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '2026世界杯预测',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    show: false,
  })

  console.log(`[Electron] 加载远程页面: ${url}`)
  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    dialog.showErrorBox(
      '连接失败',
      `无法连接到服务器: ${url}\n\n错误: ${errorDescription}\n\n请检查网络连接后重试。`
    )
    app.quit()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
