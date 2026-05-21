# Changelog

本文件记录面向发行的版本变更。功能细节见 [README.md](README.md)。

## [1.0.5] - 2026-05-21

### Added

- 侧栏「正在运行中的服务」「历史服务」按 APP/PC Tab 分类展示，与主列表同步切换
- 项目列表、运行中/历史服务按名称首字母排序（`zh-CN`）

### Changed

- 侧栏 APP/PC Tab 改为淡色分段样式，融入右侧面板

## [1.0.4] - 2026-05-21

### Fixed

- 运行地址不再展示 Vite 插件调试路径（`/__devtools__/`、`/__inspect__/`），仅保留主应用访问地址

## [1.0.3] - 2026-05-20

### Added

- `scripts/start-dev-launcher.sh`：命令行启动，关闭窗口即停止服务
- `scripts/启动 Dev Launcher.command`：macOS 双击启动入口
- README「最小成本运行」说明（本机运行，无需部署）

## [1.0.2] - 2026-05-20

### Added

- 访问地址展示 localhost + 无线网 IP（`wifiIp` / 自动检测 Wi-Fi 网卡）
- `orphan-sync.js`：历史服务匹配左侧项目时回显运行态，并同步「运行中的服务」
- 复制主实例：副本独立选择子项目，不继承主实例默认与运行状态

### Changed

- 侧栏「历史服务」（原 Company 历史服务）；`isCompany` 重命名为 `isUnderScanRoot`
- 项目分组默认折叠，仅手动展开；运行/历史服务呼吸指示点缩小
- 历史服务过滤范围随当前 `scanRoot`，非固定路径

## [1.0.1] - 2026-05-20

### Added

- `engines.node` ≥ 20；`pnpm run typecheck` / `pnpm test`
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 发版手工验收清单
- `isCwdUnderScanRoot`：`/api/tasks/start` 与 `stop` 拒绝扫描根外的 `cwd`（403）

### Changed

- `tsx` 移至 `dependencies`，`pnpm install` 后即可 `pnpm start`
- README：环境要求、安装说明、安全边界与开发命令

## [1.0.0] - 2026-05-20

### Added

- 按 `App` / `Pc` 扫描项目，识别 `dev` / `serve` 及 `dev:*` / `serve:*` 脚本
- Monorepo（`apps/`）与单仓库扫描规则；未列入项目 `skipped` 提示
- 任务启停（pnpm / npm / yarn）、进程树停止、已知端口兜底
- WebSocket 实时日志、状态、多本地 URL
- 项目默认子项目/脚本、多实例副本
- 历史服务（本机 `lsof`，macOS / Linux）
- 搜索、折叠、日间/夜间主题、侧栏动态高度
- 顶栏扫描目录保存与扫描；环境变量 `DEV_LAUNCHER_SCAN_ROOT`
- 文档：README、STRUCTURE

### Security / scope

- 默认仅监听 `127.0.0.1`，无鉴权
- `config.json`、`defaults.json`、`instances.json` 不纳入版本库

### Known limitations

- Windows 下无历史服务；端口检测与杀进程能力弱于 macOS
- `pnpm start` 依赖开发依赖中的 `tsx`（需完整 `pnpm install`）
- 启动 API 不校验 `cwd` 是否在 `scanRoot` 内（信任本机用户）

[1.0.3]: https://github.com/wangyanweiie/dev-launcher/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/wangyanweiie/dev-launcher/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/wangyanweiie/dev-launcher/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/wangyanweiie/dev-launcher/releases/tag/v1.0.0
