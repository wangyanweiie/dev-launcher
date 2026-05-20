# Dev Launcher

本地开发服务可视化面板：扫描项目目录，识别 `dev` / `serve` 脚本，一键启停，实时日志与运行地址。

**仅供本机开发使用**（默认监听 `127.0.0.1`，无鉴权，请勿暴露到局域网或公网）。

## 快速开始

```bash
cd tools/dev-launcher
pnpm install --ignore-workspace
pnpm start    # 或 pnpm dev（watch 模式）
```

启动后自动打开浏览器（可在 `config.json` 设置 `"openBrowser": false` 关闭）。

默认地址：**http://127.0.0.1:3847**

## 界面说明

| 区域 | 功能 |
|------|------|
| 顶栏搜索 | 按项目名 / 子项目名过滤 |
| 左侧列表 | APP / PC 分页；级联选择子项目与脚本；启动 / 停止 / 保存默认 / 副本 |
| 右侧上方 | **运行中的服务**：本面板任务 + **Company 历史服务**（扫描 `Company` 下进程 cwd 关联项目，可关闭） |
| 右侧下方 | 选中任务的实时日志（错误行高亮） |

## 配置

复制 `config.example.json` 为 `config.json` 后修改：

| 字段 | 说明 |
|------|------|
| `scanRoot` | 扫描根目录 |
| `categories` | 子目录分类，如 `App`、`Pc` |
| `port` | 面板端口，默认 `3847` |
| `host` | 监听地址，默认 `127.0.0.1` |
| `openBrowser` | 启动后是否打开浏览器 |
| `scanCacheSeconds` | 扫描缓存秒数，默认 `30`；点「刷新」强制重扫 |

### 环境变量（覆盖 config.json）

```bash
export DEV_LAUNCHER_SCAN_ROOT=/path/to/Company
export DEV_LAUNCHER_PORT=3847
pnpm start
```

## 脚本识别规则

匹配 `package.json` 中 `scripts` 名称：`dev`、`serve`、`dev:*`、`serve:*`。

自动忽略 `node_modules`、`.git`、`dist`、`uni_modules` 等（见 `config.json`）。

## 数据文件（已加入 .gitignore）

- `defaults.json` — 各项目默认子项目与脚本
- `instances.json` — 项目副本列表

## 常见问题

**端口 3847 被占用**

```bash
lsof -i :3847
kill -9 $(lsof -ti :3847)
```

**面板重启后 Vite 仍在跑**

右侧「Company 历史服务」会扫描 `localhost` 监听，仅显示工作目录在 `Company` 下的进程，可点「关闭」。非 Company 目录的服务不会显示。

**扫描目录不存在**

检查 `scanRoot` 或 `DEV_LAUNCHER_SCAN_ROOT`，界面会显示具体错误原因。

## 开发

```bash
pnpm dev   # tsx watch server/index.ts
```

前端模块说明见 `public/js/STRUCTURE.md`。
