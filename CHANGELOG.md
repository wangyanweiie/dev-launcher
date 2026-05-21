# Changelog

本文件记录面向发行的版本变更。功能细节见 [README.md](README.md)。

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
- Company 历史服务（本机 `lsof`，macOS / Linux）
- 搜索、折叠、日间/夜间主题、侧栏动态高度
- 顶栏扫描目录保存与扫描；环境变量 `DEV_LAUNCHER_SCAN_ROOT`
- 文档：README、STRUCTURE

### Security / scope

- 默认仅监听 `127.0.0.1`，无鉴权
- `config.json`、`defaults.json`、`instances.json` 不纳入版本库

### Known limitations

- Windows 下无 Company 历史服务；端口检测与杀进程能力弱于 macOS
- `pnpm start` 依赖开发依赖中的 `tsx`（需完整 `pnpm install`）
- 启动 API 不校验 `cwd` 是否在 `scanRoot` 内（信任本机用户）

[1.0.1]: https://github.com/wangyanweiie/dev-launcher/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/wangyanweiie/dev-launcher/releases/tag/v1.0.0
