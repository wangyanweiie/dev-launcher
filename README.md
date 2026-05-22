# Dev Launcher

[![GitHub](https://img.shields.io/github/license/wangyanweiie/dev-launcher)](https://github.com/wangyanweiie/dev-launcher)

本地开发服务可视化面板：扫描 `Company`（或自定义）目录下的前端/uni-app 项目，识别 `dev` / `serve` 脚本，一键启停，实时日志、多地址展示与孤儿进程管理。

**仓库**：<https://github.com/wangyanweiie/dev-launcher>

**仅供本机开发使用**（默认监听 `127.0.0.1`，无鉴权，请勿暴露到局域网或公网）。

### 发行范围（v1.0）

| 项目 | 说明 |
|------|------|
| 目标用户 | 本机 / 小团队开发者，自行克隆仓库运行 |
| 推荐平台 | **macOS**（扫描、启停、历史服务均可用） |
| Linux | 可扫描与启停；历史服务依赖 `lsof`，与 macOS 类似 |
| Windows | 可扫描与启停；**无**历史服务与 `lsof` 端口兜底 |
| 非目标 | 公网部署、多用户鉴权、CI 远程执行 |

首次安装请复制 `config.example.json` 为 `config.json` 并填写本机 `scanRoot`（该文件不会提交到 Git）。

---

## 功能概览

| 模块 | 能力 |
|------|------|
| 项目扫描 | 按 `App` / `Pc` 分类扫描子目录，识别可运行脚本，支持缓存与强制刷新 |
| 任务启停 | 通过 `pnpm` / `npm` / `yarn` 启动子进程，停止时杀进程树并按端口兜底 |
| 实时状态 | WebSocket 推送日志、运行状态、本地访问地址（支持多端口） |
| 项目配置 | 每项目/副本保存默认子项目与脚本；支持多实例副本 |
| 服务监控 | 面板内任务列表 + 扫描目录下历史监听进程 |
| 界面体验 | 搜索过滤、折叠、日间/夜间主题、侧栏动态高度、Tab 下未列入提示 |

---

## 快速开始

**环境要求**：Node.js **≥ 20**。

```bash
git clone https://github.com/wangyanweiie/dev-launcher.git
cd dev-launcher
cp config.example.json config.json   # 首次：编辑 scanRoot 为你的项目根目录
pnpm install --ignore-workspace      # 需完整安装（含 tsx，用于 pnpm start / dev）
pnpm start    # 编译后用 node 启动（`prestart` 自动 `pnpm build`）
# 或
pnpm start:tsx  # 直接 tsx，改完即跑、无需 build
pnpm dev      # tsx watch，改服务端代码自动重启
```

本仓库为 **GitHub 克隆运行**（`package.json` 中 `private: true`，不发布 npm 包）。

启动后默认打开浏览器（`config.json` 中 `"openBrowser": false` 可关闭）。

**面板地址**：<http://127.0.0.1:5555>（端口可在 `config.json` 修改）

---

## 最小成本运行（本机，无需部署服务器）

Dev Launcher 是**本机工具**，不部署到公网；在你自己的 Mac 上跑一个 Node 进程即可。

| 方式 | 说明 |
|------|------|
| **双击启动（推荐）** | macOS：在 Finder 中双击 `scripts/启动 Dev Launcher.command`，关闭终端窗口即停止 |
| 命令行 | `bash scripts/start-dev-launcher.sh` 或 `pnpm start` |
| 开发调试 | `pnpm dev`（改服务端代码自动重启） |

**首次双击前**（只需一次）：

1. 安装 [Node.js](https://nodejs.org/) ≥ 20、`pnpm`（`npm install -g pnpm`）
2. 若提示无法打开：终端执行 `chmod +x scripts/*.sh scripts/*.command`
3. 脚本会自动生成 `config.json`；按提示填写 `scanRoot`（项目根目录，如 `~/Company`）

**可选配置**（`config.json`）：

- `wifiIp`：局域网访问地址展示（如 `192.168.4.231`）
- `openBrowser: false`：启动时不自动打开浏览器
- `DEV_LAUNCHER_SCAN_ROOT`：环境变量锁定扫描目录（高于配置文件）

---

## 界面与主要功能

### 顶栏

| 功能 | 说明 |
|------|------|
| 扫描目录 | 输入项目根路径（其下需有 `App`、`Pc` 等分类文件夹） |
| 保存 | 将路径写入 `launcher-settings.json` 与 `config.json`，**不触发扫描** |
| 扫描 | 按当前输入路径扫描并刷新左侧列表 |
| 当前目录 | 填入启动 dev-launcher 时的工作目录 |
| 日间/夜间 | 切换主题，偏好保存在浏览器 `localStorage`（`dl-theme`） |
| 搜索 | 按项目文件夹名、子项目名、`package.json` name 过滤当前 Tab 列表 |
| 刷新列表 | 请求 `/api/projects?refresh=1`，绕过扫描缓存 |
| 全部停止 | 停止本面板管理的所有运行中任务 |

### 左侧：APP / PC 项目列表

- **分类 Tab**：`App` 显示为 APP，`Pc` 显示为 PC；Tab 上显示项目数量、运行中绿点、未列入数量（`+n`）。
- **项目分组**：每个文件夹（如 `x-mart`、`leyuan_app`）为一组，可折叠/展开；有运行中任务时自动展开。
- **Monorepo（存在 `apps/`）**：只扫描 `apps/*` 一层子包的 `package.json`（如 `xmart-web`），不扫描根目录其它一级目录（如 `blog`）。
- **单仓库**：只解析项目根目录 `package.json`（如 `nandateqi_pc` 仅一个 `dev`）。
- **级联选择**：多子项目时先选子项目再选脚本；单子项目仅选脚本。
- **实例行操作**：启动、停止、查看日志、保存默认；多子项目可「复制」副本（独立默认配置）。
- **运行地址**：运行中在实例行展示一个或多个本地 URL（如 Vite `5173` + 代理 `8888`），可点击打开。
- **未列入说明**：当前 Tab 底部虚线框列出「有目录但无 dev/serve 脚本」的项目及原因（如仅有 `test` 脚本）。

### 右侧：服务与日志

**运行中的服务**（可折叠）

- 展示本面板通过「启动」拉起的任务（运行中 / 已崩溃）。
- 每条可打开地址、查看日志、停止任务。
- **历史服务**：扫描本机 `localhost` 监听端口，根据进程 `cwd` 关联到当前 `scanRoot` 下项目；可一键关闭端口。不在扫描根目录下的进程不显示。

**日志**（可折叠）

- 显示当前选中任务的 stdout/stderr，错误关键词高亮。
- 刷新页面后从服务端缓冲恢复（`/api/tasks/logs` + WS `logs-sync`）。
- 主动停止不误报「已崩溃」；真实异常退出显示退出码。

侧栏三块区域（运行中服务、历史服务、日志）支持**动态高度分配**：其它块折叠时当前块尽量占满；全部展开且内容多时按比例/三等分，内容不足则保持自然高度。

---

## 项目扫描规则

### 目录结构约定

```
{scanRoot}/
├── App/
│   ├── leyuan_app/          # 单仓库 → 根 package.json
│   └── x-mart/               # monorepo → apps/* 下各子包
│       └── apps/
│           ├── web/
│           └── h5/
└── Pc/
    └── nandateqi_pc/
```

### 脚本识别

`package.json` 的 `scripts` 中，名称匹配以下规则才会列入：

- `dev`、`serve`
- `dev:*`（如 `dev:h5`、`dev:mp-weixin`）
- `serve:*`

### 忽略规则

`config.json` 中可配置：

- **ignoreDirNames**：路径任一段为该目录名则跳过（如 `node_modules`、`.git`、`uni_modules` 等）。
- **ignorePathSegments**：路径包含某片段则跳过（如 `/internal/`）。

### 包管理器

按目录下 lock 文件自动选择：`pnpm-lock.yaml` → pnpm，`yarn.lock` → yarn，否则 npm。

### 扫描缓存

默认 `scanCacheSeconds`（30 秒）内重复请求使用内存缓存；顶栏「刷新列表」或 `POST /api/settings/scan` 会清空缓存。

### 未列入（skipped）

扫描到文件夹但未进入列表时（常见原因：无 dev/serve 脚本），会在对应 **APP/PC Tab 底部** 说明，API 字段为 `skipped[]`。

---

## 任务与进程管理

- **任务 ID**：`{cwd绝对路径}::{scriptName}`，同一目录同一脚本同时只能运行一个实例。
- **启动**：`spawn` 包管理器执行 `run <script>`；日志逐行推送并解析 `http://localhost:端口`。
- **多 URL**：同一任务可累积多个本地地址（去重、Vite 517x 端口优先排序展示）。
- **停止**：标记主动停止 → 杀进程组 → 对已知端口 `lsof` 兜底释放，避免 Vite 孤儿进程。
- **状态**：`running` / `stopped` / `crashed`（仅非零退出且非主动停止为 crashed）。
- **安全**：`POST /api/tasks/start` 与 `stop` 仅允许 `cwd` 位于当前生效的 `scanRoot` 之下，否则返回 403。

---

## 配置

`config.json` 为本地文件（已在 `.gitignore`），从 `config.example.json` 复制后修改：

| 字段 | 说明 | 默认 |
|------|------|------|
| `scanRoot` | 扫描根目录，可留空 | 见下方优先级 |
| `categories` | 分类子目录名 | `["App","Pc"]` |
| `port` | 面板 HTTP/WS 端口 | `5555` |
| `host` | 监听地址 | `127.0.0.1` |
| `openBrowser` | 启动后是否打开浏览器 | `true` |
| `scanCacheSeconds` | 扫描结果缓存秒数 | `30` |
| `nodeOptions` | 注入子进程 `NODE_OPTIONS`（如限制堆内存） | 无 |
| `taskEnv` | 注入子进程的额外环境变量（键值均为字符串） | `{}` |
| `maxTaskLogLines` | 每个任务在服务端保留的日志行数上限 | `500` |
| `clearTaskLogsOnStop` | 停止任务后清空该任务日志缓冲 | `false` |
| `detectOrphanServices` | 是否在拉取项目列表时检测「历史服务」（`lsof`） | `true` |
| `orphanDetectMinIntervalSeconds` | 历史服务检测最小间隔（秒），`0` 为每次请求都检测 | `0` |
| `maxRetainedTaskStates` | 内存中保留的已停止任务状态条数上限 | `200` |
| `ignoreDirNames` | 忽略的目录名列表 | 见 example |
| `ignorePathSegments` | 忽略的路径片段 | 见 example |

### 低内存示例（`config.json` 片段）

```json
{
  "nodeOptions": "--max-old-space-size=2048",
  "maxTaskLogLines": 200,
  "clearTaskLogsOnStop": true,
  "orphanDetectMinIntervalSeconds": 30
}
```

`nodeOptions` 会追加到子进程已有的 `NODE_OPTIONS` 之后；`taskEnv` 可设置项目级变量（勿在此放密钥）。关闭历史服务检测可设 `"detectOrphanServices": false`（侧栏不再显示本机其它监听进程）。

### 扫描目录生效优先级

1. 环境变量 `DEV_LAUNCHER_SCAN_ROOT`（界面不可改）
2. `launcher-settings.json` 的 `scanRoot`（界面「保存」写入）
3. `config.json` 的 `scanRoot`
4. 启动 dev-launcher 时的**当前工作目录**

每次请求 `/api/config`、`/api/projects` 会重新从文件读取路径，避免刷新页面后丢失已保存目录。

### 环境变量

```bash
export DEV_LAUNCHER_SCAN_ROOT=/path/to/Company
export DEV_LAUNCHER_PORT=5555
pnpm start
```

---

## HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 当前扫描根、端口、是否可扫描、是否被 env 锁定 |
| POST | `/api/settings/scan-root/save` | 保存默认扫描目录 |
| POST | `/api/settings/scan` | 应用路径并清空扫描缓存 |
| GET | `/api/projects` | 项目列表等；`?refresh=1` 强制重扫；`?includeOrphans=1` 含历史服务（默认不含，请用 `/api/orphans`） |
| GET | `/api/orphans` | 历史服务列表；`?refresh=1` 绕过检测缓存 |
| POST | `/api/settings/reload` | 热重载 `config.json`（任务 env、日志上限等；`port`/`host` 需重启进程） |
| GET | `/api/defaults` | 全部默认配置 |
| POST | `/api/defaults` | 保存某分组/副本的默认子项目与脚本 |
| POST | `/api/instances` | 创建项目副本 |
| DELETE | `/api/instances` | 删除项目副本 |
| POST | `/api/tasks/start` | 启动任务 |
| POST | `/api/tasks/stop` | 停止任务 |
| POST | `/api/tasks/stop-all` | 停止全部任务 |
| GET | `/api/tasks/logs` | 获取服务端缓冲的日志（刷新恢复用） |
| POST | `/api/orphans/kill` | 按端口结束进程（历史服务「关闭」） |

## WebSocket（`/ws`）

连接后服务端推送：

| type | 说明 |
|------|------|
| `logs-sync` | 全量任务日志（首连时） |
| `log` | 单行日志 |
| `status` | 任务状态变更，可选 `exitCode` |
| `urls` | 任务本地地址列表更新 |
| `url` | 兼容旧版单地址推送 |

---

## 本地持久化（`.gitignore`，不提交 Git）

| 文件 | 内容 |
|------|------|
| `config.json` | 扫描根、端口、忽略规则等 |
| `launcher-settings.json` | 界面保存的默认 `scanRoot` |
| `defaults.json` | 各项目/副本默认 `{ subKey, script }` |
| `instances.json` | 各项目的副本列表 `{ instanceId, createdAt }` |

副本的默认配置 key 为 `{groupId}::{instanceId}`；主实例为 `groupId`（项目根路径）。

---

## 项目结构

```
dev-launcher/
├── config.example.json      # 模板（复制为 config.json）
├── config.json              # 本地配置（gitignore）
├── launcher-settings.json   # 运行时生成（gitignore）
├── defaults.json / instances.json   # 本地数据（gitignore）
├── CHANGELOG.md
├── server/
│   ├── index.ts       # HTTP + WebSocket 入口
│   ├── config.ts      # 配置加载与校验
│   ├── settings.ts    # 扫描路径持久化
│   ├── scanner.ts     # 项目扫描与 skipped 判定
│   ├── scan-cache.ts  # 扫描缓存
│   ├── runner.ts      # 子进程、日志、URL、启停
│   ├── orphans.ts     # 本机端口与历史孤儿服务
│   ├── defaults.ts    # 默认配置
│   └── instances.ts   # 项目副本
└── public/
    ├── index.html / styles.css / favicon.svg
    ├── app.js         # 入口 → js/main.js
    └── js/            # 前端模块（见 STRUCTURE.md）
```

---

## 常见问题

**端口 5555 被占用**

```bash
lsof -i :5555
kill -9 $(lsof -ti :5555)
```

**停止后 Vite 仍在、或刷新后任务还在跑**

使用右侧「历史服务」关闭对应端口；或终端 `lsof -ti :端口 | xargs kill`。面板停止已对已知 URL 端口做兜底。

**App 下新项目扫不到**

1. 点「刷新列表」排除缓存。  
2. 看 APP Tab 底部「未列入」说明（多为 `package.json` 无 `dev`/`serve`）。  
3. 参考同目录其它 uni-app 项目补全 `scripts`（如 `dev`、`dev:h5`）。

**扫描目录不存在**

检查 `scanRoot` 或 `DEV_LAUNCHER_SCAN_ROOT`；界面顶栏会显示 `scanError` 具体原因。

**保存扫描路径后刷新又没了**

确认已点「保存」而非仅「扫描」；保存写入 `launcher-settings.json` 与 `config.json`。若设置了 `DEV_LAUNCHER_SCAN_ROOT`，以环境变量为准。

---

## 开发

```bash
pnpm run typecheck   # TypeScript 检查
pnpm test            # 单元测试（config 路径校验等）
pnpm dev             # tsx watch server/index.ts
```

- 前端为原生 ES Module，改 `public/js` 后刷新浏览器即可。  
- 目录与模块依赖见 [STRUCTURE.md](STRUCTURE.md)。  
- 发版前验收见 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)。

---

## License

[MIT](LICENSE)
