# AGENTS.md - 开发记录

## 打包规范

### release/ 目录（Windows 桌面版）
electron-builder 会生成以下内容，**只需要保留两个 exe**：

**保留：**
- `WorldCupPredictor-{version}-Portable.exe` — 免安装便携版
- `WorldCupPredictor-{version}-Setup.exe` — 安装版

**打包后必须清理（构建中间产物）：**
- `win-unpacked/` — 解压后的 electron 应用（~220MB）
- `assets/` — 旧版前端文件残留
- `*.blockmap` — 自动更新差量包
- `latest.yml` — 自动更新清单
- `builder-debug.yml` — 构建调试信息
- `favicon.svg`, `icon.png`, `icons.svg` — 被复制过来的图标
- `.icon-ico/` — 图标缓存
- `gzh.webp`, `zanzhu.webp` — 被复制过来的二维码
- `*.7z` — 旧版 nsis 安装包缓存

### release-server/ 目录（服务器部署包）
必须包含：
- `server/` — 服务端代码
- `dist/` — 前端构建产物
- `public/` — 静态资源（二维码等）
- `node_modules/` — 依赖
- `package.json` — 简化版（main 指向 server/index.js）
- `start.bat` / `install.bat` / `start.sh` — 启动脚本
- `downloads/` — Windows 版 exe 下载

**不要包含：**
- `db.sqlite` — 服务器上的数据库不能覆盖
- 根目录的 `.bat` 文件（dev.bat, build.bat 等开发脚本）

## 图标规范
- Windows 需要 `.ico` 格式，不能用 `.png`
- `.ico` 文件放在 `public/icon.ico`
- `package.json` build.win.icon 配置为 `public/icon.ico`
- 生成 ICO：`node --input-type=module -e "import pngToIco from 'png-to-ico'; import fs from 'fs'; const buf = await pngToIco('public/icon.png'); fs.writeFileSync('public/icon.ico', buf);"`

## 版本更新流程
1. 更新 `package.json` version
2. 更新 `src/hooks/useVersionCheck.ts` LOCAL_VERSION
3. 更新 `src/data/versions.json` 添加变更日志
4. `npm run build`
5. 清理 release/ 只留 exe
6. 重新 electron-builder 打包
7. 复制 exe 到 release-server/downloads/
8. 打包 release-server/
