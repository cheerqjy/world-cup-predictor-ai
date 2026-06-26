# 服务器部署指南

## 快速部署（3步完成）

### 第一步：打包
在本地双击运行 `deploy.bat`，会自动：
- 构建前端
- 复制必要文件
- 生成 `release-server` 目录

### 第二步：上传
将 `release-server` 整个目录上传到服务器，推荐使用：
- WinSCP（Windows）
- FileZilla（跨平台）
- 或者直接复制

### 第三步：启动
在服务器上：
1. 运行 `install.bat` 安装依赖（首次需要）
2. 运行 `start.bat` 启动服务

---

## 服务器目录结构

```
world-cup-predictor/
├── dist/              # 前端静态文件
├── server/            # 后端代码
│   ├── index.js       # 入口文件
│   ├── db.js          # 数据库
│   ├── ai.js          # AI预测
│   ├── auto.js        # 自动刷新
│   ├── fetcher.js     # 数据拉取
│   ├── odds.js        # 赔率获取
│   ├── seed.js        # 种子数据
│   └── routes/        # API路由
├── data/              # 数据库文件（自动创建）
├── package.json       # 依赖配置
├── start.bat          # 启动脚本
└── install.bat        # 安装脚本
```

---

## 访问方式

### 网页版
直接在浏览器访问：
```
http://120.48.126.193:5173
```

### Windows 桌面版（Electron）
1. 修改 `electron/config.json` 中的服务器地址：
```json
{
  "server": {
    "host": "120.48.126.193",
    "port": 5173
  }
}
```

2. 重新打包 Electron 应用

---

## 常见问题

### 1. 端口被占用
修改 `start.bat` 中的端口号：
```bat
set PORT=8080
```

### 2. 防火墙放行
Windows 服务器需要放行 5173 端口：
```powershell
netsh advfirewall firewall add rule name="WorldCup Predictor" dir=in action=allow protocol=TCP localport=5173
```

### 3. 数据持久化
数据存储在 `data/worldcup.db` 文件中，定期备份此文件即可。

### 4. 查看日志
启动后控制台会显示访问地址和运行状态。

---

## 数据说明

- ✅ **数据持久化**：所有数据保存在 SQLite 数据库文件中
- ✅ **多人共享**：所有人访问同一服务器，看到相同数据
- ✅ **预测不变**：预测结果生成后不会改变，除非重新预测
