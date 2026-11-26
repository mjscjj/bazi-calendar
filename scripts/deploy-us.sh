#!/usr/bin/env bash
# 在 150 上发布美国版 Flow Day（us-mvp 分支，和中文版分开跑）：先备份数据库，再拉 GitHub 上的 us-mvp，重启服务并做健康检查。
# 用法（在服务器的 /root/apps/bazi-us 里执行）：./scripts/deploy-us.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f data/app.db ] && node --disable-warning=ExperimentalWarning scripts/backup.mjs data/app.db /root/backups/bazi-us
before=$(git rev-parse HEAD)
git pull --ff-only origin us-mvp
git diff --quiet "$before" HEAD -- package.json package-lock.json || npm ci --omit=dev
systemctl restart bazi-us
sleep 2
systemctl is-active bazi-us
curl -fsS http://127.0.0.1:3201/sixty/api/health && echo
git log --oneline -1
