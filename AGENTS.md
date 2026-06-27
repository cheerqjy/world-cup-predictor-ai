# AGENTS.md - 项目完整操作手册

> **每次操作前必须读这个文件，不要凭记忆乱搞。**

---

## 一、项目架构

```
world-cup-predictor/
├── server/             # Node.js 服务端
│   ├── index.js        # 入口，监听端口 8888
│   ├── db.js           # 数据库（sql.js），路径 = path.join(__dirname, '..', 'data', 'worldcup.db')
│   ├── ai.js           # 预测模型
│   ├── fetcher.js      # 比分抓取
│   ├── odds.js         # 体彩赔率
│   ├── tz.js           # 北京时间工具
│   └── routes/
│       └── recommendations.js  # 推荐+历史快照+结算逻辑
├── src/                # React 前端
├── public/             # 静态资源（icon.ico, icon.png, gzh.webp, zanzhu.webp）
├── data/worldcup.db    # ⚠️ 核心数据库，所有数据都在这里
├── electron/           # Windows 桌面版壳（main.js + config.json）
├── dist/               # 前端构建产物
├── release/            # electron-builder 构建输出（只留 exe）
├── release-server/     # 服务器部署包（用户手动上传到服务器）
└── AGENTS.md           # 本文件
```

### Windows 桌面版原理
- `electron/main.js` 第25行：`mainWindow.loadURL(url)` 连接远程服务器
- **Windows 版没有本地数据库**，只是个浏览器壳，显示内容完全取决于服务器
- `electron/config.json` 配置服务器地址，默认 `120.48.126.193:8888`

### 服务器数据库路径
- `server/db.js` 第4-6行：
  ```js
  const DB_PATH = process.env.ELECTRON_DATA_DIR
    ? path.join(process.env.ELECTRON_DATA_DIR, 'worldcup.db')
    : path.join(__dirname, '..', 'data', 'worldcup.db')
  ```
- 服务器上的实际路径 = `release-server/data/worldcup.db`
- **打包时必须包含 `data/` 目录，否则页面为空**

---

## 二、打包规范

### release/ 目录（electron-builder 输出）

**只保留这两个文件：**
- `WorldCupPredictor-{version}-Portable.exe` — 免安装便携版
- `WorldCupPredictor-{version}-Setup.exe` — 安装版

**打包后必须删除的中间产物：**
- `win-unpacked/`（~220MB）
- `assets/`（旧版前端残留）
- `*.blockmap`、`latest.yml`、`builder-debug.yml`
- `favicon.svg`、`icon.png`、`icons.svg`、`.icon-ico/`
- `gzh.webp`、`zanzhu.webp`
- `*.7z`（旧版缓存）

### release-server/ 目录（服务器部署包）

**必须包含：**
| 文件/目录 | 说明 |
|---|---|
| `data/worldcup.db` | ⚠️ 核心数据库，漏了页面就是空的 |
| `server/` | 服务端代码 |
| `dist/` | 前端构建产物 |
| `public/` | 静态资源（icon.ico, gzh.webp, zanzhu.webp） |
| `node_modules/` | 依赖（用 robocopy /MT:8 复制） |
| `package.json` | 简化版（main: server/index.js） |
| `start.bat` | Windows 启动脚本 |
| `install.bat` | Windows 安装依赖脚本 |
| `start.sh` | Linux 启动脚本 |
| `downloads/` | Windows 版 exe（供用户下载） |

**不要包含：**
- 根目录的 `dev.bat`、`build.bat`、`add-log.bat`、`deploy.bat` 等开发脚本

---

## 三、版本更新流程（严格按顺序执行）

### 1. 修改代码
- 先改代码，测试本地 `npm run dev`

### 2. 更新版本号（三个文件必须同时改）
- `package.json` → `"version": "x.x.x"`
- `src/hooks/useVersionCheck.ts` → `const LOCAL_VERSION = 'x.x.x'`
- `src/data/versions.json` → 顶部添加新版本变更日志

### 3. 前端构建
```bash
npm run build
```

### 4. 打包 Windows 版
```bash
# 先清理旧的
Remove-Item -Recurse -Force release

# 打包（portable + nsis）
npx electron-builder --win portable nsis

# 清理 release/ 只留两个 exe
Remove-Item -Recurse -Force release\win-unpacked, release\assets, release\.icon-ico
Remove-Item release\*.blockmap, release\latest.yml, release\builder-debug.yml
Remove-Item release\favicon.svg, release\icon.png, release\icons.svg, release\*.7z
Remove-Item release\gzh.webp, release\zanzhu.webp
```

### 5. 打包 release-server/（一键打包）
```bash
# ✅ 唯一正确方式：运行 deploy.js
node deploy.js

# deploy.js 会自动完成：
# 1. 打包 Windows exe
# 2. 构建前端 (npm run build)
# 3. 复制 dist/ server/ data/ public/ node_modules/
# 4. 生成 start.bat / start.sh / install.bat
# 5. 复制 exe 到 downloads/
```

⚠️ **不要手动 robocopy 拼凑 release-server/，必须用 `node deploy.js` 一键生成。**
手动拼凑容易漏掉文件（如 start.bat、data/worldcup.db、node_modules/），导致服务器数据不一致。

### 6. 上传部署
- 用户手动上传 `release-server/` 到服务器
- 在服务器运行 `install.bat`（首次），然后 `start.bat`
- **不需要重新分发 Windows exe**（它只是连服务器的壳）

### 7. 本地调试与服务器数据同步
- 本地调试必须用 `npm run dev:all`（同时启动前后端），fetcher 才会更新数据库
- `npm run dev` 只启动前端，**不启动后端**，数据库不会更新，数据会和服务器不一致
- 打包时 `deploy.js` 会把本地最新的 `data/worldcup.db` 一起打包进 release-server/
- 服务器上访问推荐页面时，服务端会自动修正历史快照（补方案2、重新结算），并持久化到 DB

---

## 四、图标规范

- Windows 需要 `.ico` 格式，`package.json` build.win.icon = `public/icon.ico`
- 生成 ICO：
  ```bash
  node --input-type=module -e "import pngToIco from 'png-to-ico'; import fs from 'fs'; const buf = await pngToIco('public/icon.png'); fs.writeFileSync('public/icon.ico', buf);"
  ```

---

## 五、本地开发命令

| 命令 | 作用 | 数据库更新 |
|---|---|---|
| `npm run dev` | 只启动前端 Vite (localhost:5173) | ❌ 不更新 |
| `npm run dev:server` | 只启动后端 (localhost:3001) | ✅ fetcher 自动更新 |
| `npm run dev:all` | 同时启动前后端 | ✅ fetcher 自动更新 |

⚠️ **`npm run dev` 只有前端没有后端，数据库不会更新！本地和服务器数据会不一致！**

---

## 六、服务器信息

- 地址：`http://120.48.126.193:8888/`
- 部署方式：用户手动上传 release-server/ 后重启
- 无法 SSH/SCP，只能用户手动操作
- 体彩销售时间：周一至五 11:00-22:00，周六日 11:00-23:00
- 停售规则：开球前15分钟
- 推荐日期：11点前→昨天，11点后→今天
- 所有时间：北京时间（UTC+8）

---

## 七、核心业务逻辑备忘

### 方案一（稳胆推荐）
- `buildBetSlip()` 从 `selectedBet` 生成
- 单关或混合过关，每场1注2元

### 方案二（双选稳胆）
- `selectBestValueBet()` 生成双选候选
- 每场选2个互补选项（如胜+平），联合概率≥70%
- 优先级：SPF让球 → RQ让球胜平负 → BQC半全场 → 跳过
- `buildBetSlip2()` 生成：注数 = 2^N，金额 = 注数×2元
- 结算：`settleBetSlip()` 逐场判断 won/wonKey，用命中选项赔率计算

### 让球规则
- 正数 = 主队受让（弱队），负数 = 主队让球（强队）
- `adjHome = s.h + rqNum`
- `getRqDisplay()`: 正数→"受让X"，负数→"让X"

### 历史快照
- 每次推荐保存快照到 `recommendation_snapshots` 表
- 10:30 自动归档
- 加载时：检查完整性 → 补缺失日期 → 补方案2（Poisson合成赔率）→ 重新结算
- 重新结算触发条件：actual 变化 **或** betSlip2 有 won=null 的已完成比赛
- 结算后持久化到 DB

### 赔率数据
- `getMatchCalculatorV1.qry`（能用）> `getMatchResultV1.qry`（被WAF拦截）
- 30分钟定时任务 `startOddsCron()` 抓取并缓存到 `lottery_odds` 表
- 无真实赔率时用 `generateSyntheticOdds()` 合成

---

## 八、禁止事项

1. **不要**在打包时漏掉 `data/worldcup.db`
2. **不要**手动 robocopy 拼凑 release-server/，必须用 `node deploy.js` 一键生成（否则容易漏 start.bat、data/、node_modules/）
3. **不要**用 `Remove-Item -Recurse -Force release-server` 后忘记创建 start.bat 等脚本
4. **不要**在 release/ 里留中间产物（win-unpacked 等）
5. **不要**改 `server/db.js` 的数据库路径
6. **不要**在服务器上覆盖数据库（上传的是预置基础数据，服务器启动后 fetcher 会自动更新）
7. **不要**凭记忆操作，先读本文件
8. **不要**用 `npm run dev` 就以为本地和服务器一样——它只启动前端，不启动后端，数据库不会更新
9. **不要**打包完 release-server/ 后不检查 start.bat、data/worldcup.db 是否存在
