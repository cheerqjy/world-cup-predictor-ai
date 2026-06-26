# 2026 世界杯预测系统

基于 **Poisson 期望进球模型** 的 AI 世界杯预测平台，自动抓取实时赛果，可视化比对预测准确率。

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
  - [方式一：Windows 安装版/免安装版](#方式一windows-安装版免安装版)
  - [方式二：开发模式](#方式二开发模式)
  - [方式三：服务器部署](#方式三服务器部署)
- [使用教程](#使用教程)
- [预测模型](#预测模型)
- [打包发布](#打包发布)
- [API 文档](#api-文档)
- [项目结构](#项目结构)
- [常见问题](#常见问题)

---

## 功能特性

- **实时数据**：每 2 分钟从 [worldcup26.ir](https://worldcup26.ir) API 自动同步最新比分（104 场全覆盖），已验证数据准确性
- **AI 预测**：支持 Poisson 统计模型（免费）和 AI 大模型（需 API key）
- **竞彩推荐**：胜平负 / 让球 / 比分 / 总进球 / 半全场 5 种玩法
- **搏冷分析**：自动识别高赔冷门场次
- **准确率对比**：预测 vs 实际，5 维度命中统计
- **冠亚军预测**：自动预测冠军和亚军
- **多端部署**：Windows 桌面版 / 服务器网页版 / 开发模式，数据统一
- **数据持久化**：SQLite 数据库，重启不丢失

---

## 快速开始

### 方式一：Windows 安装版/免安装版

> 适合普通用户，无需安装任何开发工具。

**安装版：**
1. 下载 `WorldCupPredictor-x.x.x-Setup.exe`
2. 双击运行，选择安装目录
3. 桌面出现快捷方式，双击启动

**免安装版（便携版）：**
1. 下载 `WorldCupPredictor-x.x.x-Portable.exe`
2. 可以放在 U 盘里，到任何 Windows 电脑上双击直接运行
3. 数据保存在 `C:\Users\用户名\AppData\Roaming\WorldCupPredictor\`

启动后会自动：
- 初始化数据库
- 从世界杯 API 拉取实时比赛数据
- 自动预测所有未预测的比赛
- 每 2 分钟自动刷新数据

### 方式二：开发模式

> 适合开发者，支持热重载。

**前置要求：** 安装 [Node.js](https://nodejs.org/) 18+

```bash
# 1. 进入项目目录
cd world-cup-predictor

# 2. 安装依赖
npm install

# 3. 双击 dev.bat（Windows）
#    或手动执行：
npm run dev:server    # 终端 1：启动后端 (port 3001)
npm run dev           # 终端 2：启动前端 (port 5173)
```

**快捷方式：** 直接双击 `dev.bat`，自动打开两个命令行窗口。

打开浏览器访问 `http://localhost:5173`（开发模式）

### 方式三：服务器部署

> 适合部署到服务器，多人访问。

**一键部署：**
```bash
# 1. 打包（在本地执行）
双击 deploy.bat

# 2. 上传 release-server/ 目录到服务器

# 3. 在服务器上安装依赖
双击 install.bat

# 4. 启动服务
双击 start.bat
```

**手动部署：**
```bash
# 1. 安装依赖
npm install --production

# 2. 启动服务
NODE_ENV=production PORT=8888 node server/index.js
```

访问 `http://服务器IP:8888`

---

## 数据一致性

**本地开发、服务器部署、Windows 桌面版数据完全一致：**

| 环境 | 数据源 | 数据存储 | 自动同步 |
|------|--------|----------|----------|
| 本地开发 | 免费世界杯 API | 项目目录/data/worldcup.db | ✅ 每2分钟 |
| 服务器部署 | 免费世界杯 API | 服务器/data/worldcup.db | ✅ 每2分钟 |
| Windows 桌面版 | 免费世界杯 API | 用户数据目录/data/worldcup.db | ✅ 每2分钟 |

**数据源：** [https://worldcup26.ir/get/games](https://worldcup26.ir/get/games)
- 免费、无需 API 密钥
- 覆盖全部 104 场比赛
- 已验证数据准确性（与 FIFA.com 一致）
- 实时更新比分和状态
- 北京时间为准

---

## 使用教程

### 赛事页面 (`/`)

主页面，展示所有比赛的预测信息。

- **按轮次查看**：小组赛 / 1/16 决赛 / 1/8 决赛 / 1/4 决赛 / 半决赛 / 决赛
- **按日期查看**：按比赛日期分组
- **小组赛筛选**：可按 A-L 组筛选

每场比赛卡片显示：
- 主客队国旗、名称、FIFA 排名
- 实时比分（已完赛）或预测比分
- 预测结果：胜平负、置信度、AI 模型
- 准确率标签：命中比分 / 命中结果 / 命中总球数 / 命中半全场

### 推荐单页面 (`/recommend`)

模拟竞彩投注推荐，包含 5 种玩法：

| 玩法 | 说明 |
|------|------|
| **胜平负 (SPF)** | 主队胜/平/负 |
| **让球 (RQ)** | 根据排名差计算让球数 |
| **比分 (BF)** | 精确比分预测（31 种结果） |
| **总进球 (ZQ)** | 0-7+球 |
| **半全场 (BQC)** | 半场+全场组合 |

### 对比页面 (`/history`)

查看预测准确率的详细统计：
- 命中率统计：比分 / 结果 / 总球数 / 半全场 / 让球
- 逐场对比：每场预测 vs 实际结果

### 冠亚军页面 (`/champion`)

查看冠亚军预测和历史分布统计。

### 设置页面 (`/settings`)

配置 AI 预测模型（可选，未配置时使用免费统计模型）。

---

## 预测模型

### 统计模型（默认，免费）

基于 Poisson 概率分布计算 36 种比分概率，确定性预测（每次结果一致）。

### AI 模型（可选，需 API key）

支持 OpenAI / DeepSeek / Kimi 等兼容接口，失败时自动回退到统计模型。

---

## 打包发布

### Windows 桌面版

```bash
# 双击 build.bat（Windows）
# 或手动执行：
node release.js
```

输出：`release/WorldCupPredictor-x.x.x-Setup.exe` 和 `WorldCupPredictor-x.x.x-Portable.exe`

### 服务器部署包

```bash
# 双击 deploy.bat
# 输出：release-server/ 目录
```

---

## API 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/time` | 服务器时间（北京时间） |
| GET | `/api/matches` | 比赛列表 |
| GET | `/api/matches/:id` | 单场详情 |
| GET | `/api/predictions` | 预测记录 |
| POST | `/api/predictions/predict/:matchId` | 触发预测 |
| GET | `/api/predictions/compare` | 准确率对比 |
| GET | `/api/recommendations` | 竞彩推荐 |
| GET | `/api/recommendations/snapshots` | 历史推荐快照 |
| GET/POST | `/api/champion` | 冠亚军预测 |

---

## 项目结构

```
world-cup-predictor/
├── electron/             # Electron 桌面应用
│   ├── main.js           # 主进程
│   ├── config.json       # 服务器连接配置
│   └── preload.js        # 安全预加载
├── server/               # 后端服务
│   ├── index.js          # Express 入口
│   ├── db.js             # SQLite 数据库
│   ├── tz.js             # 北京时间工具
│   ├── seed.js           # 种子数据（48队+104场）
│   ├── fetcher.js        # 世界杯 API 数据同步
│   ├── ai.js             # 预测引擎
│   ├── auto.js           # 自动刷新调度
│   ├── odds.js           # 赔率获取
│   ├── scraper.js        # 数据源模块（worldcup26.ir API）
│   └── routes/           # API 路由
├── src/                  # 前端 React 代码
├── data/                 # SQLite 数据库（自动生成）
├── dist/                 # 前端构建产物
├── release/              # Windows 打包输出
├── release-server/       # 服务器部署包
├── deploy.bat            # 服务器部署打包
├── build.bat             # Windows 桌面版打包
├── dev.bat               # 开发模式启动
└── package.json
```

---

## 常见问题

### Q: 启动后没有数据？

A: 系统会自动从世界杯 API 拉取数据，首次启动需要等待 1-2 分钟。确保网络连接正常。

### Q: 本地和服务器数据不一样？

A: 确保服务器上的数据库是最新的。运行 `reset.bat` 可删除旧数据库，系统会自动重建。

### Q: Windows 桌面版如何连接远程服务器？

A: 修改 `electron/config.json` 中的 `host` 为服务器 IP，重启应用即可。

### Q: 如何配置 AI 模型？

A: 打开设置页面 → 选择 Provider → 输入 API Key → 保存。未配置时使用免费的统计模型。

---

## 数据源

| 来源 | 用途 | 说明 |
|------|------|------|
| [worldcup26.ir](https://worldcup26.ir) | 比赛数据 | 免费、完整、实时 |
| [体彩网](https://sporttery.cn) | 竞彩赔率 | 可选 |

---

## 技术栈

| 前端 | 后端 | 数据层 |
|------|------|--------|
| Vite 4 + React 19 | Express 4 | SQLite (sql.js) |
| TypeScript | Node.js 18+ | 自动迁移 |
| React Router 7 | OpenAI SDK | 持久化存储 |

---

## 更新日志

### v1.5.1 (2026-06-26)
- 简化数据抓取模块：移除5个失效外部数据源，仅保留 worldcup26.ir API
- 重写数据同步逻辑：移除过度保护的数据覆盖防护，确保比分正确更新
- 验证API数据准确性：所有60场已完赛比分与FIFA.com一致

### v1.5.0 (2026-06-26)
- 修复推荐日期切换逻辑：11点前推荐昨天，11点后推荐今天
- 实现随赛停售：开球前15分钟自动停止推荐该场比赛
- 实现10:30兜底归档：自动补建缺失的历史快照
- 修复快照保存：每次保存当天全部比赛（已完成+未完成）
- 修复历史记录：动态补建缺失日期的数据
- Tab切换风格统一：推荐单页面使用圆角胶囊按钮样式
- 页面切换自动滚动到顶部
- 添加推荐单Tab图标（⚽未来推荐、📋历史记录）

### v1.4.1 (2026-06-25)
- 修复数据同步：使用免费完整世界杯 API 替代 SportScore
- 修复时区问题：统一使用北京时间 (UTC+8)
- 修复 Electron 启动崩溃问题
- 部署包自动生成：deploy.bat 一键打包
- 部署包包含预置数据库
- 数据一致性：本地/服务器/Windows 版数据统一

### v1.3.0
- 推荐单功能完善
- 搏冷分析
- 集成 Vercel 部署

### v1.2.0
- 新增版本自动记录功能
- 新增一键打包 build.bat

### v1.1.0
- 新增版本更新记录页面
- 支持 Windows 免安装便携版

### v1.0.0
- 首次发布：2026 世界杯预测系统

---

## License

MIT
