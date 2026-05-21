# 目录结构

本文档只说明仓库内**目录、文件职责**以及**模块依赖关系**。功能、API、界面行为、配置与排错见 [README.md](README.md)。

---

## 仓库目录树

```
dev-launcher/
├── README.md                 # 功能说明、API、配置、FAQ
├── STRUCTURE.md              # 本文件：目录与依赖
├── LICENSE
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
│
├── config.example.json       # 配置模板（提交仓库）
├── config.json               # 本地配置（gitignore，从 example 复制）
├── launcher-settings.json    # 界面「保存」写入的 scanRoot（gitignore）
├── defaults.json             # 各项目/副本默认子项目与脚本（gitignore）
├── instances.json            # 项目副本列表（gitignore）
├── CHANGELOG.md              # 版本记录
├── RELEASE_CHECKLIST.md      # 发版手工验收
│
├── server/                   # 后端 TypeScript（ESM）
│   ├── index.ts              # HTTP、WebSocket、路由聚合
│   ├── config.ts             # 配置加载、scanRoot 解析与校验
│   ├── settings.ts           # launcher-settings.json 读写
│   ├── scanner.ts            # 目录扫描、项目分组与 skipped
│   ├── scan-cache.ts         # 扫描结果缓存
│   ├── runner.ts             # 子进程启停、日志缓冲、URL 提取
│   ├── orphans.ts            # 本机端口检测与按端口结束进程
│   ├── defaults.ts           # defaults.json CRUD
│   └── instances.ts          # instances.json CRUD
│
└── public/                   # 静态前端
    ├── index.html            # 页面骨架
    ├── styles.css            # 全局样式
    ├── favicon.svg
    ├── app.js                # 浏览器入口，加载 js/main.js
    └── js/                   # 前端 ES Module（22 个 .js 文件）
        ├── main.js           # 应用入口：初始化与顶栏全局操作
        ├── types.js          # JSDoc 类型定义
        ├── state.js          # 全局可变状态
        ├── dom.js            # DOM 元素引用
        ├── utils.js          # 任务 ID、转义等工具
        ├── urls.js           # 多 URL 规范化与链接 HTML
        ├── filter.js         # 列表搜索匹配
        ├── project.js        # 子项目、默认、副本元数据
        ├── render.js         # 项目列表 HTML 片段
        ├── selection.js      # 下拉与行级 task 解析
        ├── collapse.js       # 分组折叠状态
        ├── tabs.js           # APP/PC Tab 与主列表渲染
        ├── skipped.js        # Tab 底部「未列入」区块
        ├── tasks.js          # 实例行运行态 UI
        ├── log.js            # 日志面板
        ├── websocket.js      # WebSocket 消息处理
        ├── api.js            # REST 拉取项目与日志
        ├── events.js         # 列表区交互与重渲染编排
        ├── services.js       # 右侧服务面板
        ├── orphan-sync.js    # 历史服务与左侧列表/运行中面板同步
        ├── scan-root.js      # 顶栏扫描目录栏
        ├── sidebar-layout.js # 侧栏服务区/日志区高度
        └── theme.js          # 日间/夜间主题
```

---

## 运行时关系（概览）

```
浏览器
  index.html → app.js → public/js/main.js
                    ↕ HTTP /api/* 、 WebSocket /ws
  server/index.ts → scanner / runner / orphans / …
                    ↕ 读写
  config.json、launcher-settings.json、defaults.json、instances.json
```

---

## 后端 `server/` 依赖

```
index.ts
├── config.ts ────── settings.ts
├── scan-cache.ts ── scanner.ts
├── settings.ts
├── scanner.ts          （仅 Node fs/path）
├── runner.ts ──────── orphans.ts
├── orphans.ts ─────── scanner.ts（类型）
├── defaults.ts         （仅 Node fs/path）
└── instances.ts ───── defaults.ts
```

| 模块 | 作用 |
|------|------|
| `index.ts` | 挂载 Express 与 `/ws`，调用各模块完成 API |
| `config.ts` | 合并 env、`config.json`、`launcher-settings.json`；`isCwdUnderScanRoot` |
| `config.test.ts` | `isCwdUnderScanRoot` 单元测试 |
| `settings.ts` | `launcher-settings.json` 持久化 |
| `scanner.ts` | 扫描 `App`/`Pc` 等分类，产出 `groups` 与 `skipped` |
| `scan-cache.ts` | 包装 `scanProjects`，供 `index` 缓存失效 |
| `runner.ts` | 管理子进程生命周期与日志；停止时配合 `orphans` |
| `orphans.ts` | 检测/结束本机监听端口（历史服务） |
| `defaults.ts` | 默认子项目与脚本 |
| `instances.ts` | 副本增删；删除副本时清理对应 default |

`config.ts` 与 `scanner.ts` 共享配置类型定义（`LauncherConfig` 等定义在 `scanner.ts`）。

---

## 前端 `public/js/` 依赖

**加载链**：`app.js` → `main.js` → 各 `bind*` / `connectWs` / `loadProjects`。

```
main.js
├── theme.js
├── scan-root.js → api.js
├── events.js ──┬── tabs.js ──┬── render.js → project.js → state.js, utils.js
│               │             ├── skipped.js → state.js, utils.js
│               │             └── filter.js
│               ├── tasks.js ──┬── selection.js → render.js
│               │              ├── collapse.js → tabs.js
│               │              ├── services.js → sidebar-layout.js, project.js, …
│               │              └── urls.js → utils.js
│               └── log.js → sidebar-layout.js
├── services.js
├── sidebar-layout.js → dom.js, state.js
├── websocket.js → tasks.js, log.js, state.js, urls.js
└── api.js → events.js, tabs.js, services.js, log.js, state.js, …

state.js → urls.js
types.js   （无 import，仅类型注释）
dom.js     （无业务 import）
```

| 层级 | 文件 | 作用 |
|------|------|------|
| 入口 | `main.js` | 串联初始化；顶栏刷新/搜索/全部停止 |
| 基础 | `types.js` | 数据结构 JSDoc |
| 基础 | `state.js` | 项目列表、运行态、日志、skipped 等集中状态 |
| 基础 | `dom.js` | `querySelector` 缓存 |
| 基础 | `utils.js` | `taskId`、HTML 转义 |
| 基础 | `urls.js` | `taskUrls` 数组与链接渲染 |
| 数据 | `project.js` | 从 `state` 解析子项目与 task 元信息 |
| 数据 | `filter.js` | 搜索过滤谓词 |
| 视图 | `render.js` | 分组与实例行 HTML |
| 视图 | `tabs.js` | Tab 与列表容器内容 |
| 视图 | `skipped.js` | 未列入面板 HTML |
| 视图 | `selection.js` | 读取当前选中脚本/子项目 |
| 视图 | `collapse.js` | 折叠与 Tab 运行指示 |
| 交互 | `events.js` | 列表点击、启停、默认、副本；触发重绘 |
| 交互 | `tasks.js` | 根据 `state` 更新行内按钮与状态 |
| 侧栏 | `services.js` | 运行中任务与孤儿服务列表 |
| 侧栏 | `log.js` | 日志展示与折叠 |
| 侧栏 | `sidebar-layout.js` | 侧栏区块 `max-height` 分配 |
| 网络 | `api.js` | `GET /api/projects` 等，写入 `state` 后驱动渲染 |
| 网络 | `websocket.js` | 接收 log/status/urls，更新 `state` 与 UI |
| 顶栏 | `scan-root.js` | 扫描路径保存与扫描按钮 |
| 顶栏 | `theme.js` | `data-theme` 与 localStorage |

**约定**：`state.js` 为前端数据中心，不反向依赖 UI 模块；UI 通过 `api.js` / `websocket.js` 或用户操作间接改 `state`。

---

## 修改代码时对照

| 改动类型 | 优先查看 |
|----------|----------|
| 扫描规则、skipped | `server/scanner.ts` |
| 启停、日志、多 URL | `server/runner.ts`、`public/js/websocket.js`、`urls.js` |
| 扫描路径保存 | `server/settings.ts`、`public/js/scan-root.js` |
| 列表与 Tab | `public/js/tabs.js`、`render.js`、`events.js` |
| 右侧服务/端口 | `server/orphans.ts`、`public/js/services.js` |

详细行为说明见 [README.md](README.md)。
