#!/usr/bin/env bash
# Dev Launcher 本地启动（关闭本窗口或 Ctrl+C 即停止服务）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVER_PID=""

cleanup() {
    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        echo ""
        echo "正在停止 Dev Launcher…"
        pkill -TERM -P "$SERVER_PID" 2>/dev/null || true
        kill -TERM "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM HUP

echo "========================================"
echo "  Dev Launcher"
echo "  目录: $ROOT"
echo "  关闭此窗口即停止服务"
echo "========================================"
echo ""

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "错误: 未找到 $1，请先安装。"
        echo "  Node.js: https://nodejs.org/ （需要 ≥ 20）"
        echo "  pnpm:    npm install -g pnpm"
        exit 1
    fi
}

need_cmd node
need_cmd pnpm

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
    echo "错误: 需要 Node.js ≥ 20，当前: $(node -v)"
    exit 1
fi

if [[ ! -f config.json ]]; then
    echo "首次运行：从 config.example.json 生成 config.json"
    cp config.example.json config.json
fi

if ! node -e "
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('config.json', 'utf8'));
process.exit(c.scanRoot && String(c.scanRoot).trim() ? 0 : 1);
" 2>/dev/null; then
    echo ""
    echo "请先在 config.json 中设置 scanRoot（你的项目根目录，其下含 App、Pc 等文件夹）。"
    echo "示例: \"/Users/你的用户名/Company\""
    echo ""
    if [[ "$(uname)" == Darwin ]]; then
        read -r -p "是否用文本编辑器打开 config.json？[Y/n] " ans
        ans="${ans:-Y}"
        if [[ "$ans" =~ ^[Yy]$ ]]; then
            open -e config.json 2>/dev/null || open -a TextEdit config.json 2>/dev/null || true
        fi
    fi
    exit 1
fi

if [[ ! -d node_modules ]]; then
    echo "安装依赖（首次约需 1 分钟）…"
    pnpm install --ignore-workspace
fi

PORT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')).port||5555)")"
HOST="$(node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')).host||'127.0.0.1')")"

echo "启动中… 面板地址: http://${HOST}:${PORT}"
echo ""

# 前台启动；关闭终端时 trap 会结束进程树
pnpm start &
SERVER_PID=$!
wait "$SERVER_PID"
