#!/usr/bin/env bash
# 一键把 BAKABAKA 分享到公网（Cloudflare 临时隧道）。
# 用法：在项目根目录执行  bash scripts/share.sh
# 说明：临时网址每次重开都会变；要永久固定网址需走云部署。

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"

# 读取访问口令（来自 .env.local，仅展示提醒用）
PASS="$(grep -E '^ACCESS_PASSWORD=' .env.local 2>/dev/null | head -1 | cut -d= -f2- || true)"

echo "① 构建最新前端（私有实例模式：免登录、三引擎全开）…"
VITE_LOCAL_MODE=1 npm run build >/dev/null

echo "② 启动生产服务（端口 ${PORT}，带访问口令）…"
lsof -ti "tcp:${PORT}" 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1
nohup node server/index.js --serve-dist > /tmp/bakabaka-server.log 2>&1 &
sleep 2

if ! curl -s -o /dev/null --max-time 5 "http://127.0.0.1:${PORT}/"; then
  echo "⚠️ 本地服务没起来，看 /tmp/bakabaka-server.log"; exit 1
fi

echo ""
echo "================ 重要 ================"
echo " 访问口令（用户名随便填，密码填这个）：${PASS:-（未设置，去 .env.local 配 ACCESS_PASSWORD）}"
echo " 下面会出现一个 https://xxx.trycloudflare.com 网址，就是公网地址。"
echo " 这个窗口要一直开着；关掉或电脑关机，网址就失效。"
echo "====================================="
echo ""
echo "③ 开隧道（保持本窗口开着）…"
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}"
