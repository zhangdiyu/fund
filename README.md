# Fund Tracker

一个用于跟踪基金/股票持仓、分红、快照和资产配置的个人财务工具。

- 前端：Vanilla JS + Chart.js
- 本地开发：Node.js + Express
- 数据存储：`data/*.json`
- 部署方式：GitHub Pages（由 GitHub Actions 生成静态站点）

## 1. 环境要求

- Node.js 20（CI 使用 Node 20，建议本地保持一致）
- npm

## 2. 安装依赖

本地首次运行：

```bash
npm install
```

如果你想严格按锁文件安装（和 CI 一致）：

```bash
npm ci
```

## 3. 本地运行

启动开发服务：

```bash
npm start
```

默认端口是 `3000`，启动后访问：

```text
http://localhost:3000
```

本地模式下（`localhost` / `127.0.0.1`）：

- 页面默认从本地 Express 接口读取数据：`/api/portfolio`、`/api/snapshots`、`/api/dividends`
- `server.js` 也会直接暴露 `/data/*`，方便调试原始 JSON
- 点击 `Update Prices` 会调用本地 `/api/update-prices`
- 不需要 GitHub token 也能调试本地数据读取和价格更新

GitHub Pages 线上模式下：

- 页面继续读取部署出来的静态 `data/*.json`
- `Update Prices` 按钮会直接打开 `update-prices.yml` 的 GitHub Actions 页面
- 然后在 GitHub 页面里点击 `Run workflow` 即可
- 这样不再依赖把 PAT 存在浏览器里来触发价格更新

如果要自定义端口：

```bash
PORT=3001 npm start
```

## 4. 手动更新价格

本地执行价格更新脚本：

```bash
node scripts/update-prices.js
```

这个脚本会：

- 读取 `data/portfolio.json`
- 拉取最新价格和汇率
- 回写 `data/portfolio.json`
- 如果当天还没有快照，则追加写入 `data/snapshots.json`

## 5. 本地开发时最常用的命令

```bash
# 安装依赖
npm install

# 启动本地服务
npm start

# 手动更新价格
node scripts/update-prices.js
```

如果你想直接看本地 JSON 是否可访问，可以打开：

```text
http://localhost:3000/data/portfolio.json
```

## 6. 部署到 GitHub Pages

这个项目**没有单独的 build 命令**。部署由 GitHub Actions 工作流完成。

工作流文件：

- `.github/workflows/deploy.yml`

触发方式：

- push 到 `main`
- 在 GitHub Actions 页面手动执行 `Deploy to GitHub Pages`

### 自动部署流程

当代码 push 到 `main` 后，GitHub Actions 会执行以下逻辑：

```bash
mkdir -p _site/data
cp public/index.html public/app.js public/style.css _site/
cp data/portfolio.json _site/data/
cp data/snapshots.json _site/data/ 2>/dev/null || echo '[]' > _site/data/snapshots.json
cp data/dividends.json _site/data/ 2>/dev/null || echo '[]' > _site/data/dividends.json
cp data/auth.json _site/data/ 2>/dev/null || true
```

也就是说，GitHub Pages 最终发布的是：

- `public/index.html`
- `public/app.js`
- `public/style.css`
- `data/portfolio.json`
- `data/snapshots.json`
- `data/dividends.json`
- `data/auth.json`（如果存在）

### 标准部署步骤

```bash
git add .
git commit -m "your message"
git push origin main
```

推送到 `main` 后，GitHub 会自动触发 Pages 部署。

## 7. 仅在本地预览 GitHub Pages 产物（可选）

如果你想在本地模拟 GitHub Pages 发布内容，可以先手动生成 `_site`：

```bash
mkdir -p _site/data
cp public/index.html public/app.js public/style.css _site/
cp data/portfolio.json _site/data/
cp data/snapshots.json _site/data/ 2>/dev/null || echo '[]' > _site/data/snapshots.json
cp data/dividends.json _site/data/ 2>/dev/null || echo '[]' > _site/data/dividends.json
cp data/auth.json _site/data/ 2>/dev/null || true
```

然后你可以用任意静态文件服务工具预览 `_site/`。

## 8. GitHub Actions 自动更新价格

工作流文件：

- `.github/workflows/update-prices.yml`

触发方式：

- 定时执行：每周一 `08:17 UTC`
- GitHub Actions 页面手动执行 `Update Prices`
- 接收 `repository_dispatch` 事件：`update-prices`

线上页面里的 `Open Update Workflow` 按钮会直接打开这个 workflow 页面，推荐用这个方式手动更新；它不需要浏览器保存 PAT。

该工作流执行的核心命令是：

```bash
npm ci
node scripts/update-prices.js
```

执行完成后，工作流会自动提交 `data/*.json` 的变更。

自动提交信息：

```text
chore: update prices [automated]
```

## 9. 数据文件说明

项目使用 JSON 文件直接存储数据：

- `data/portfolio.json`：持仓数据
- `data/snapshots.json`：资产快照历史
- `data/dividends.json`：分红记录
- `data/auth.json`：前端密码保护配置（如果启用）

这些文件会被提交到仓库，并在 GitHub Pages 部署时一起发布。

## 10. 项目结构

```text
.
├── server.js                  # 本地开发服务
├── lib/
│   ├── portfolio.js           # 读写持仓/分红 JSON
│   ├── price-fetcher.js       # 拉取价格和汇率
│   └── snapshot.js            # 生成资产快照
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── data/
│   ├── portfolio.json
│   ├── snapshots.json
│   └── dividends.json
└── scripts/
    └── update-prices.js       # 手动/自动价格更新入口
```

## 11. 备注

- 没有测试命令
- 没有 lint / format / build 流程
- 本地开发入口是 `npm start`
- 本地 `localhost` 默认读取本地 `data` / `/api`，线上 GitHub Pages 仍读取静态 `data/*.json`
- 线上 `Open Update Workflow` 只负责把你带到 GitHub Actions 页面；真正的手动触发在 GitHub 的 `Run workflow`
- 线上部署入口是 GitHub Actions 的 `Deploy to GitHub Pages`
