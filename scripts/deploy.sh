#!/usr/bin/env bash
# 在 150 上发布流日历：先备份数据库，再拉 GitHub 上的 master（依赖有变就重装），重启服务并做健康检查。
# 用法（都在服务器的 /root/apps/bazi-calendar 里执行）：
#   ./scripts/deploy.sh          拉 GitHub 最新代码再发布（本地改完 push 之后用）
#   ./scripts/deploy.sh --local  不拉远程，直接发布服务器上现在的代码（在服务器上改完先看效果用）
set -euo pipefail
cd "$(dirname "$0")/.."
node --disable-warning=ExperimentalWarning scripts/backup.mjs data/app.db /root/backups/bazi-calendar
if [ "${1:-}" != "--local" ]; then
  before=$(git rev-parse HEAD)
  git pull --ff-only origin master
  git diff --quiet "$before" HEAD -- package.json package-lock.json || npm ci --omit=dev
fi
systemctl restart bazi-calendar
sleep 2
systemctl is-active bazi-calendar
curl -fsS http://127.0.0.1:3200/bazi/api/health && echo
git log --oneline -1
git status --short
