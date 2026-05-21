# Release 验收清单

发版或合并主分支前，在本机按顺序勾选。默认面板端口见 `config.json`（示例为 `5555`）。

## 环境

- [ ] Node.js ≥ 20（`node -v`）
- [ ] `cp config.example.json config.json` 且 `scanRoot` 指向含 `App` / `Pc` 的真实目录
- [ ] `pnpm install --ignore-workspace` 无报错
- [ ] `pnpm run typecheck` 通过
- [ ] `pnpm test` 通过

## 启动与配置

- [ ] `pnpm start` 可打开面板（或 `openBrowser: false` 时手动访问）
- [ ] `GET /api/config` 返回 `scanOk: true` 与正确 `scanRoot`
- [ ] 顶栏「保存」后刷新页面，`scanRoot` 仍正确
- [ ] 「扫描」可刷新左侧列表；「刷新列表」可绕过缓存

## 项目列表

- [ ] APP / PC Tab 切换正常，数量与运行中绿点正确
- [ ] 搜索可过滤项目名 / 子项目名
- [ ] 有目录但无 dev/serve 时，Tab 底部显示「未列入」说明
- [ ] Monorepo（`apps/`）仅列出 apps 子包；单仓库列出根脚本

## 任务启停

- [ ] 启动后状态为运行中，日志有输出
- [ ] 运行中显示一个或多个本地 URL，链接可打开
- [ ] 停止后状态为已停止，**不误报**已崩溃
- [ ] 「全部停止」可停止所有面板管理任务
- [ ] 对扫描根外的 `cwd` 调用 `POST /api/tasks/start` 返回 **403**（安全边界）

## 日志与服务侧栏

- [ ] 点击「查看日志」可切换日志面板
- [ ] 刷新浏览器后日志可从缓冲恢复
- [ ] 右侧「运行中的服务」列出当前任务
- [ ] macOS：「历史服务」可列出相关端口并可关闭（若环境有残留进程）

## 其它

- [ ] 日间/夜间主题切换正常，刷新后偏好保留
- [ ] `pnpm dev` 修改 `server/*.ts` 后服务自动重启

---

**备注**：Windows 不验收「历史服务」；Linux 与 macOS 行为可能略有差异。
