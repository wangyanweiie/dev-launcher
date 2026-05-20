# Dev Launcher 目录结构说明

本文档描述 `dev-launcher` 项目的目录布局，重点说明前端 `public/js` 模块化拆分与后端 `server` 结构。

---

## 项目总览

```
dev-launcher/
├── config.json           # 扫描目录、分类、端口、忽略规则
├── defaults.json         # 各项目/副本的默认子项目与脚本（持久化）
├── instances.json        # 多子项目文件夹的副本列表（持久化）
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── README.md
│
├── server/               # 后端（TypeScript）
│   ├── index.ts          # HTTP + WebSocket 入口
│   ├── scanner.ts        # 扫描 Company 目录下的项目
│   ├── runner.ts         # 子进程启停、日志与 URL 解析
│   ├── defaults.ts       # 读写 defaults.json
│   └── instances.ts      # 读写 instances.json
│
└── public/               # 前端静态资源
    ├── index.html
    ├── styles.css
    ├── app.js            # 前端入口（仅 import main）
    └── js/               # 前端功能模块（ES Module）
        ├── STRUCTURE.md  # 本文件
        ├── main.js
        ├── types.js
        ├── state.js
        ├── dom.js
        ├── utils.js
        ├── project.js
        ├── selection.js
        ├── render.js
        ├── collapse.js
        ├── tabs.js
        ├── tasks.js
        ├── log.js
        ├── websocket.js
        ├── api.js
        └── events.js
```

---

## 前端入口与加载链

```
index.html
    └── app.js          import './js/main.js'
            └── main.js     初始化、全局按钮、启动 WebSocket
```

| 步骤 | 模块 | 说明 |
|------|------|------|
| 1 | `main.js` | 绑定刷新/全部停止/清空日志，调用 `init()` |
| 2 | `init()` | 拉取 `/api/config`，`bindCategoryTabs()`，`connectWs()`，`loadProjects()` |
| 3 | `api.js` | 请求 `/api/projects`，写入 `state`，渲染 Tab 与列表 |
| 4 | `events.js` | `finishListRender()` → `bindEvents()` + `updateCardStates()` |

---

## `public/js` 模块说明

### 基础层

| 文件 | 职责 |
|------|------|
| `types.js` | JSDoc 类型定义（`ProjectGroup`、`SubProject`、`SelectedTask` 等） |
| `state.js` | 全局可变状态：`statuses`、`taskUrls`、`allGroups`、`activeCategory`、`userExpanded` 等 |
| `dom.js` | DOM 引用：`listEl`、`tabsEl`、`logBody` 等 |
| `utils.js` | `makeTaskId`、`makeDefaultKey`、`escapeHtml` |

### 数据与渲染

| 文件 | 职责 |
|------|------|
| `project.js` | 收集子项目、解析默认配置、展开副本卡片、`getSubProjectsFromCard` |
| `selection.js` | 读取/填充下拉选中项、`rowHasTask` |
| `render.js` | 生成项目分组与实例行 HTML、`renderScriptSelectOptions` |
| `collapse.js` | 项目标题折叠/展开、运行中自动展开 |
| `tabs.js` | APP / PC Tab 渲染与运行指示点 |

### 运行时与交互

| 文件 | 职责 |
|------|------|
| `tasks.js` | 更新实例行状态点、按钮、运行地址 |
| `log.js` | 日志缓冲、日志面板渲染 |
| `websocket.js` | WebSocket 接收 log / status / url 推送 |
| `api.js` | `loadProjects(forceRefresh)` 拉取项目列表，处理 scanError |
| `filter.js` | 顶栏搜索过滤项目 |
| `services.js` | 右侧运行服务 + 外部孤儿端口 |
| `events.js` | 启停、保存默认、复制/删除副本、Tab 切换、`bindEvents` |
| `main.js` | 应用入口与顶栏全局操作 |

---

## 模块依赖关系

```
main.js
 ├── dom.js
 ├── api.js ──────┬── dom.js
 │                ├── state.js
 │                ├── tabs.js ──┬── dom.js
 │                │             ├── project.js ── state.js, utils.js
 │                │             └── render.js ──┬── project.js
 │                │                           └── state.js, utils.js
 │                └── events.js ──┬── tabs.js
 │                                ├── collapse.js ── tabs.js
 │                                ├── selection.js ── render.js
 │                                ├── tasks.js
 │                                ├── log.js
 │                                └── ...
 ├── events.js (bindCategoryTabs)
 ├── websocket.js ── tasks.js, log.js, state.js
 └── log.js

selection.js ── render.js
render.js ── project.js, state.js, utils.js
```

---

## 后端 `server` 模块说明

| 文件 | 职责 |
|------|------|
| `index.ts` | Express 静态资源、REST API、WebSocket 广播 |
| `scanner.ts` | 扫描 `config.scanRoot` 下 App/Pc 项目，过滤 dev/serve 脚本 |
| `runner.ts` | `pnpm/npm/yarn run` 子进程管理，日志与本地 URL 解析 |
| `defaults.ts` | 默认配置 CRUD，key 为 `groupId` 或 `groupId::instanceId` |
| `instances.ts` | 项目副本 CRUD，持久化到 `instances.json` |

### 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 扫描根目录与服务端口 |
| GET | `/api/projects` | 项目列表 + 状态 + URL + 默认 + 副本 |
| GET | `/api/defaults` | 全部默认配置 |
| POST | `/api/defaults` | 保存某实例的默认子项目/脚本 |
| POST | `/api/instances` | 创建项目副本 |
| DELETE | `/api/instances` | 删除项目副本 |
| POST | `/api/tasks/start` | 启动任务 |
| POST | `/api/tasks/stop` | 停止任务 |
| POST | `/api/tasks/stop-all` | 停止全部 |
| WS | `/ws` | 推送 `log` / `status` / `url` 事件 |

---

## 持久化文件

| 文件 | 格式示例 |
|------|----------|
| `defaults.json` | `{ "/path/to/x-mart": { "subKey": ".../apps/web", "script": "dev" } }` |
| `instances.json` | `{ "/path/to/x-mart": [{ "instanceId": "c-...", "createdAt": 1716... }] }` |

原项目默认 key 为项目根路径；副本默认 key 为 `groupId::instanceId`。

---

## 前端 UI 结构（逻辑）

```
[ 顶栏 ] Dev Launcher · 扫描路径 · 刷新 · 全部停止

[ Tab ] APP (n) · PC (n)

[ 项目分组 ] x-mart                    [副本数] [复制] [Pc]
  ├─ [ 标题点击折叠 ]
  ├─ 主实例   [子项目 ▼] › [脚本 ▼]   [启动][停止][日志][保存默认]
  └─ 副本 1   ...                      [删除]
      默认: apps/web · dev
      http://localhost:5173

[ 侧栏 ] 日志面板
```

---

## 注释规范（本项目）

- **文件 / 函数 / 变量**：块级注释 `/** */`
- **函数内部逻辑**：单行注释 `//`

---

## 启动方式

```bash
pnpm dev    # 开发模式，监听 server 变更
pnpm start  # 生产启动
```

默认访问：`http://localhost:3847`（端口见 `config.json`）
