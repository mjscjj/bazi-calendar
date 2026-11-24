# 流日历

个人行动日历：按出生信息给出每天适合做什么、几点做。注册后免费体验 2 次（按使用日计），之后开通月度会员（支付宝当面付）。

- 线上：https://mindflow.zone/bazi/ ，后台 https://mindflow.zone/bazi/admin
- 起源：`ref/original.html` 是最初的单页版本，打分引擎从这里原样搬到 `server/engine.js`，`test/engine.test.js` 逐日对拍保证一致。

## 一起改

```bash
git clone https://github.com/mjscjj/bazi-calendar.git
cd bazi-calendar
npm install
ALIPAY_FAKE=1 ASK_AI=fake COOKIE_SECURE=0 DB_PATH=./data/dev.db PORT=3210 ADMIN_PASSWORD=dev npm start
# 浏览器打开 http://127.0.0.1:3210/bazi/
```

- **改文案、签文、能量卡、穿搭色、挑日子规则**：只改 `content/` 里的 JSON，保存后重启服务就能看到。服务启动时会检查字段，少了会直接报错并指出是哪一条。
- **改页面**：在 `public/js/` 和 `public/app.css` 里改，不需要构建，刷新浏览器即可。界面有白色和深色两套主题（顶栏的太阳 / 月亮按钮或「我的 · 外观」切换），颜色都在 `public/app.css` 顶部的变量里；唯一的强调色是朱砂红，层级靠留白和字重，不加边框。
- 本地付款是模拟的，不会真扣钱：下单后打开 `POST /bazi/api/dev/pay/<订单号>` 就算付款成功。
- 改完跑一下 `npm test`，然后提交、推送；发布到线上见下面「线上」一节。

## 结构

| 路径 | 内容 |
|---|---|
| `content/` | **文案和内容，产品发起人可以直接改**：能量卡（`energy-cards.json`）、日柱图鉴（`day-pillars.json`：60 个日柱的称号、介绍和身强身弱各一句，插画在 `public/art/pillars/`，用 Codex 生成的水墨图，换图时文件名对上即可）、今日一句（`daily-line.json`：按档位的行动话 + 为什么）、穿搭色映射（`outfit.json`）、观音灵签 100 签（`lots.json`）、挑日子的事项与黄历宜忌对照（`pick.json`）、问事的八卦和 64 卦、拒答词（`ask.json`）和给 AI 的提示词（`ask-prompt.md`）、追问的提示词（`ask-follow-prompt.md`）、追问次数和回看选项（`ask.json` 的 `follow`）、祈愿的心愿、颜色和节气图案（`amulets.json`）、心情便签的心情词、对应分数和纸色（`moods.json`）。服务启动时检查字段，缺了直接启动失败 |
| `server/engine.js` | 排盘与流日、时辰打分（规则为假设，可调）、通用黄历 |
| `server/content.js` | 读取 `content/`，算能量卡、今日一句、穿搭色、每日一签 |
| `server/solar.js`、`server/cities.json` | 出生城市（392 个，含海外）和真太阳时换算（夏令时、经度时差、均时差），时辰交界判断 |
| `server/pick.js` | 挑日子：排除黄历忌、月破岁破、本命冲，排序取前 3 天和 7–21 点里的好时段 |
| `server/ics.js` | 订阅到手机日历（iCalendar）：未来 60 天每天一条，定了时段的计划带提醒 |
| `server/meihua.js` | 问事的梅花易数起卦：时间或三个数起卦，本卦、互卦、变卦，体用生克和月令旺衰得出倾向（顺 / 先阻后顺 / 宜缓 / 有阻） |
| `server/ai.js` | 问事的白话解读和追问回答：调用 150 上的 Codex（关掉所有工具、空目录只读、不继承服务环境变量），最多同时 2 个，输出检查长度和禁用词；`ASK_AI=fake` 时用固定文字 |
| `public/js/ask.js`、`public/js/wish.js`、`public/js/lots.js` | 问事（写问题、起卦动画、解读、问事记录）；祈愿与御守（选择、全屏静坐：点香或颂钵、倒计时、呼吸引导、切出去暂停；御守 SVG、揭晓、我的御守）；签谱（抽过的签和当时所问） |
| `server/stats.js` | 后台数据看板：漏斗、留存、北极星、功能使用、分享邀请、自评吻合度 |
| `server/app.js` | 全部接口：账号、资料、今天、日历、签、计划与挑日子、邀请、每晚自评、日历订阅、注销、免费次数、会员与支付、反馈、埋点、后台 |
| `server/alipay.js` | 支付宝当面付：预下单、查单、撤销、通知验签 |
| `server/db.js` | SQLite（Node 自带 `node:sqlite`）建表 |
| `server/settings.js` | 后台可改的价格、免费次数、订单名称、协议文本默认值 |
| `public/js/` | 前台模块（无构建）：`mood.js` 心情便签（今天页心情板、月历小纸片、当日详情），`main.js` 路由和页签，`today.js` 今天页（本周、跟手滑动的每日卡片、明天寄语；求签仪式：默念、上香、掷筊请示、摇签、掷筊确认），`calendar.js` 日历，`me.js` 我的和能量档案，`onboard.js` 出生信息表单（日期、时间用 `wheel.js` 的滚轮一次选完，公历农历可切）、能量卡揭晓、引导和加到主屏，`account.js` 登录注册与资料等页面，`pay.js` 支付，`share.js` 分享图（跟随白色 / 深色），`growth.js` 邀请好友和日历订阅，`day.js` 当日详情，`data.js` 展示用常量，`core.js` 公共工具 |
| `public/sw.js`、`manifest.webmanifest`、`icons/` | 可安装到主屏、离线时显示上一次的今天 |
| `public/admin.*` | 管理后台 |
| `scripts/backup.mjs` | SQLite 一致性备份，保留 14 份 |
| `deploy/` | systemd 服务与每日备份定时器 |

日历由服务端算好再返回，没有免费次数也没有会员时接口返回 402（今天页仍带着“大家的今天”），页面拿不到个人数据。

页面结构：底部三个页签「今天 / 日历 / 我的」。今天页从上往下：本周 7 天（能量趋势线、你记的心情、大家的这一天）→ 每天的卡片（左右滑看前后一天，滑出本周取 `/api/week`）→ 每日一签、穿搭色、问一件事、本月御守 → 记录此刻 → 明天寄语（`daily-line.json` 的 `tomorrow`）。访客先看示例的今天，点“测测我的”填出生信息就能看到能量卡（不用注册），点“保存并看我的今天”才注册。

## 本地开发

```bash
npm install
ALIPAY_FAKE=1 COOKIE_SECURE=0 DB_PATH=/tmp/lrl/dev.db PORT=3210 ADMIN_PASSWORD=dev npm start
# 想用另一份内容试文案：CONTENT_DIR=/path/to/content
# 打开 http://127.0.0.1:3210/bazi/ ；模拟付款：POST /bazi/api/dev/pay/<订单号>
npm test                      # 引擎对拍 + 接口端到端
# 浏览器走查（需要 Playwright 和 Chromium）
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/flow.mjs http://127.0.0.1:3210/bazi /tmp/lrl/dev.db /tmp/lrl/shots
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/admin.mjs http://127.0.0.1:3210/bazi /tmp/lrl/shots dev
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/ask.mjs http://127.0.0.1:3210/bazi /tmp/lrl/dev.db /tmp/lrl/shots dev   # 服务端加 ASK_AI=fake
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/wish.mjs http://127.0.0.1:3210/bazi /tmp/lrl/dev.db /tmp/lrl/shots
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/today.mjs http://127.0.0.1:3210/bazi /tmp/lrl/shots                  # 今天页：本周、滑动卡片、小卡、记录此刻、明天寄语
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/mood.mjs http://127.0.0.1:3210/bazi /tmp/lrl/dev.db /tmp/lrl/shots     # 心情便签
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/follow.mjs http://127.0.0.1:3210/bazi /tmp/lrl/dev.db /tmp/lrl/shots   # 追问和回看，服务端加 ASK_AI=fake
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/batch2.mjs http://127.0.0.1:3210/bazi /tmp/lrl/dev.db /tmp/lrl/shots dev
```

## 线上（腾讯云 150）

- 代码 `/root/apps/bazi-calendar`，数据库 `data/app.db`，配置 `/etc/bazi-calendar.env`（仅 root 可读）。
- 服务 `bazi-calendar.service` 监听 `127.0.0.1:3200`；备份 `bazi-calendar-backup.timer` 每天 04:30 写到 `/root/backups/bazi-calendar/`。
- Caddy（容器 `hapi-caddy`）在 `mindflow.zone` 下把 `/bazi/*` 转给 3200，`/bazi/report/*` 是静态的竞品报告；Caddyfile 是单文件挂载，改时必须原地写，先 validate 再 reload。
- 支付宝与 Ai Article 共用同一个应用（AppID 尾号 9060），订单号以 `LRL` 开头区分；回调 `https://mindflow.zone/bazi/api/pay/notify`。
- 服务器上的代码目录就是这个 GitHub 仓库的 clone（`origin` = `git@github.com:mjscjj/bazi-calendar.git`，分支 `master`）。`data/`、`node_modules/` 不进仓库。
- 推送权限：仓库公开，谁都能 clone；推送用服务器上的仓库专用钥匙 `/root/.ssh/bazi_calendar_deploy`（GitHub 上的 Deploy key，只能推这一个仓库），已经配在服务器这份 clone 的 `core.sshCommand` 里，在服务器上直接 `git push` 就行。想在自己电脑上推，把这把钥匙拷下来，用 `GIT_SSH_COMMAND='ssh -i <钥匙路径> -o IdentitiesOnly=yes' git push`。钥匙泄露了就到仓库 Settings → Deploy keys 删掉重配。
- 发布：`scripts/deploy.sh` 会先备份数据库，再拉 master（依赖有变就 `npm ci`），然后重启服务、做健康检查。
  - 本地改：改完 push 到 GitHub，再执行 `ssh root@150.109.21.115 'cd /root/apps/bazi-calendar && ./scripts/deploy.sh'`。
  - 服务器上改：直接在 `/root/apps/bazi-calendar` 里改，`./scripts/deploy.sh --local` 先上线看效果，确认后 `git commit` 再 `git push`。别把没提交的改动长期留在服务器上，否则下次有人从本地发布时会拉不下来。
- 日志：`journalctl -u bazi-calendar -f`。回滚：`git reset --hard <上一个提交> && ./scripts/deploy.sh --local`；数据库回滚用 `/root/backups/bazi-calendar/` 里的备份（先停服务再替换 `data/app.db`）。

配置项：`PORT` `HOST` `BASE_PATH`（默认 `/bazi`）`DB_PATH` `COOKIE_SECURE`（本地 http 设 0）`ADMIN_USER` `ADMIN_PASSWORD` `ALIPAY_APPID` `ALIPAY_PRIVATE_KEY` `ALIPAY_PUBLIC_KEY` `ALIPAY_NOTIFY_URL` `ALIPAY_FAKE` `CONTENT_DIR`（默认仓库里的 `content/`）`PUBLIC_URL`（日历订阅链接用的对外地址，默认按请求头推出来）`ASK_AI`（问事解读：`codex` / `fake` / 不填为关闭）`ASK_MODEL`（默认 gpt-6.2-sol）`ASK_EFFORT`（默认 xhigh）`ASK_CONCURRENCY`（默认 2）`ASK_TIMEOUT_MS`（默认 120000）`ASK_WORKDIR`。
