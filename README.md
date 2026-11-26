# 流日历

个人行动日历：按出生信息给出每天适合做什么、几点做。注册后免费体验 2 次（按使用日计），之后开通月度会员（支付宝当面付；海外用户可经 Gumroad 用外币卡或 PayPal 按月/按年订阅）。

- 线上：https://mindflow.zone/bazi/ ，后台 https://mindflow.zone/bazi/admin
- 起源：`ref/original.html` 是最初的单页版本，打分引擎从这里原样搬到 `server/engine.js`，`test/engine.test.js` 逐日对拍保证一致。

## 一起改

```bash
git clone https://github.com/mjscjj/bazi-calendar.git
cd bazi-calendar
npm install
ALIPAY_FAKE=1 ASK_AI=fake JIAO_FAKE=xiao,sheng COOKIE_SECURE=0 DB_PATH=./data/dev.db PORT=3210 ADMIN_PASSWORD=dev npm start
# 浏览器打开 http://127.0.0.1:3210/bazi/
```

- **改文案、签文、能量卡、幸运色、挑日子规则**：只改 `content/` 里的 JSON，保存后重启服务就能看到。服务启动时会检查字段，少了会直接报错并指出是哪一条。
- **改页面**：在 `public/js/` 和 `public/app.css` 里改，不需要构建，刷新浏览器即可。界面有白色和深色两套主题（顶栏的太阳 / 月亮按钮或「我的 · 外观」切换），颜色都在 `public/app.css` 顶部的变量里；唯一的强调色是朱砂红，层级靠留白和字重，不加边框。
- 本地付款是模拟的，不会真扣钱：下单后打开 `POST /bazi/api/dev/pay/<订单号>` 就算付款成功。
- 改完跑一下 `npm test`，然后提交、推送；发布到线上见下面「线上」一节。

## 结构

| 路径 | 内容 |
|---|---|
| `content/` | **文案和内容，产品发起人可以直接改**：能量卡（`energy-cards.json`）、日柱图鉴（`day-pillars.json`：60 个日柱的称号、介绍和身强身弱各一句，插画在 `public/art/pillars/`，用 Codex 生成的水墨图，换图时文件名对上即可）、二十四节气（`terms.json`：每个节气一句话和当令的五行，插画在 `public/art/terms/`）、两个人的画（`pairs.json`：55 种日干组合的画名和六种关系的说法，插画在 `public/art/pairs/`）、今日一句（`daily-line.json`：按档位的行动话 + 为什么）、幸运色（`outfit.json`：五行各 6 个中国传统色，每天取第 n 和第 n+2 个，6 天一轮）、观音灵签 100 签（`lots.json`，含每签的解曰四句和 15 项仙机断语）、解签逐项运势的分类、星数规则、每类 1–5 星的说明和建议（`lot-topics.json`）、挑日子的事项与黄历宜忌对照（`pick.json`）、问事的八卦和 64 卦、拒答词（`ask.json`）和给 AI 的提示词（`ask-prompt.md`）、追问的提示词（`ask-follow-prompt.md`）、追问次数和回看选项（`ask.json` 的 `follow`）、御守的心愿、颜色、节气图案和冥想时长（`amulets.json`）、转运御守的善行件数和例子、冥想换御守的分钟数、释放练习每一步的话（`luck.json`）、心情便签的心情词、对应分数和纸色（`moods.json`）。服务启动时检查字段，缺了直接启动失败 |
| `server/engine.js` | 排盘与流日、时辰打分（规则为假设，可调）、通用黄历 |
| `server/content.js` | 读取 `content/`，算能量卡、今日一句、幸运色、每日一签 |
| `server/solar.js`、`server/cities.json` | 出生城市（392 个，含海外）和真太阳时换算（夏令时、经度时差、均时差），时辰交界判断 |
| `server/pick.js` | 挑日子：排除黄历忌、月破岁破、本命冲，排序取前 3 天和 7–21 点里的好时段 |
| `server/ics.js` | 订阅到手机日历（iCalendar）：未来 60 天每天一条，定了时段的计划带提醒 |
| `server/meihua.js` | 问事的梅花易数起卦：时间或三个数起卦，本卦、互卦、变卦，体用生克和月令旺衰得出倾向（顺 / 先阻后顺 / 宜缓 / 有阻）；推算过程（取了哪几个数、怎么相加、除几余几）存在 `cast.calc` 里，页面的推演照着演 |
| `server/ai.js` | 问事的白话解读和追问回答：调用 150 上的 Codex（关掉所有工具、空目录只读、不继承服务环境变量），最多同时 2 个，输出检查长度和禁用词；`ASK_AI=fake` 时用固定文字 |
| `public/js/ask.js`、`public/js/luck.js`、`public/js/wish.js`、`public/js/lots.js` | 问事（写问题、按住起卦、全屏推演真实的算式和八卦环、结果页的走势和依据、卦签分享、解读、追问、回看、问事记录）；转运御守（两个分页：做好事——记善行、攒 5 件换一枚；提能量——冥想、释放练习，攒 20 分钟换一枚；也可以直接买一枚）；御守 SVG、全屏冥想（点香或颂钵、倒计时、呼吸引导、切出去暂停）、我的御守；签谱（抽过的签和当时所问） |
| `server/stats.js` | 后台数据看板：漏斗、留存、北极星、功能使用、分享邀请、自评吻合度 |
| `server/app.js` | 全部接口：账号、资料、今天、日历、签、计划与挑日子、邀请、每晚自评、日历订阅、注销、免费次数、会员与支付、反馈、埋点、后台 |
| `server/alipay.js` | 支付宝当面付：预下单、查单、撤销、通知验签 |
| `server/gumroad.js` | Gumroad 海外付款：结账链接、Ping 验签、回查订单 |
| `server/db.js` | SQLite（Node 自带 `node:sqlite`）建表 |
| `server/settings.js` | 后台可改的价格、免费次数、订单名称、协议文本默认值 |
| `public/js/` | 前台模块（无构建）：`mood.js` 心情便签（今天页心情板、月历小纸片、当日详情），`main.js` 路由和页签，`today.js` 今天页（本周、跟手滑动的每日卡片、明天寄语），`rite.js` 每日一签的全屏仪式（默念、摇签、星盘起签、掷筊、解签），`calendar.js` 日历，`me.js` 我的和能量档案，`onboard.js` 出生信息表单（日期、时间用 `wheel.js` 的滚轮一次选完，公历农历可切）、能量卡揭晓、引导和加到主屏，`account.js` 登录注册与资料等页面，`pay.js` 支付，`share.js` 分享图（跟随白色 / 深色），`growth.js` 邀请好友和日历订阅，`day.js` 当日详情，`data.js` 展示用常量，`core.js` 公共工具 |
| `public/sw.js`、`manifest.webmanifest`、`icons/` | 可安装到主屏、离线时显示上一次的今天 |
| `public/admin.*` | 管理后台 |
| `public/us/` | **美国版「Flow Day」**：流日历的英文版，不是另一个产品。只在 `us-mvp` 分支（定期合并 master，不合回 master）；线上 https://mindflow.zone/sixty/ ，服务器上单独一份代码 `/root/apps/bazi-us`、服务 `bazi-us`（3201、`BASE_PATH=/sixty`、自己的数据库），Caddy 只转发 `deploy/Caddyfile.sixty` 列的路径，发布用 `scripts/deploy-us.sh`。**后端和中文版共用**（账号、今天、本周、月历、挑日子、收画、邀请和朋友、会员），美国版服务的开关：`US_EDITION=1`（访客接口 `/api/us/guest/{today,week,calendar,pick}`：不注册按生日当场算、不保存；分享链接预览页 `/s/<日柱>`、`/i/<邀请码>`，邮件重设密码，不满 13 岁不能注册，都在 `server/us-site.js` 和 `app.js` 里 `US_EDITION` 那段；发信配 `RESEND_API_KEY`、`MAIL_FROM`，没配时重设链接写进日志）、`DAY_TZ`（按美国时区切天；浏览器每次请求带 `X-TZ`，按用户自己的时区算「今天」）、`MEMBER_FOR_ALL`（测试期人人是会员）、`GENDER_OPTIONAL`（性别可不填）；用户名可以是邮箱；`server/cities.json` 并进了英文城市。**前端**（`public/us/`）：页签 Today / Calendar / Oracle / Friends，右上角头像进 You 和 Settings；**不注册也能用**（生日存在这台手机上，`S.guest`），收画、心情、自评、计划、签、邀请、锁屏这些要保存的动作才弹注册（`onboard.js` 的 `needAccount`）。`us.js` 路由；`js/` 下：core（接口、访客和登录共用的取数 `data`、日期和文案工具）、pickers（生日和出生时间的滚轮、出生地搜索，滚轮和中文版同一套）、onboard（落地页、约 4 秒的排盘动画、一屏揭晓加「今天对你」和补出生时间、注册登录、邀请落地）、today（一周条、可滑的日卡片：今天的日柱遇上你的日柱、档位和本周排名、Why、最好和要缓的时段、幸运色、24 小时色带和表盘、宜忌；撕掉昨天是顶上一张可以不理的纸；Tonight 自评、心情、你的朋友今天、每天最多一条提示）、calendar（热力图月历带分数、点一天在下面看详情；选一件事就在月历上标出最好的 3 天，可存计划；和挑日子合成一页，`#/calendar?t=面试`）、oracle（Daily Oracle：按住默念、摇签、抛 moon blocks、解签先给你问的那类事，最后给出「哪天去做」）、friends（朋友和今天找谁、两人的画、邀请）、me（You：四柱、五行图、十年大运时间轴和这十年的意思；收藏墙、60 张图鉴、日柱页、月度回顾、锁屏、How it works、条款隐私）、settings（出生信息都用选择器改、名字、外观、声音、手机日历订阅、反馈、账号）、share。**会自己换的锁屏**：`/api/us/wallpaper/<token>.jpg?tz=` 用 `@napi-rs/canvas` 在服务端出图（字体 `server/fonts/`），iPhone 快捷指令每天 7 点来拿并设为壁纸；**朋友的今天**：美国版 `/api/friends` 多给两人今天的档位；**活的画**：好时段画面变暖发光、差时段偏冷；音效在浏览器里合成。中文版接口返回的干支、十神、档位、时辰在前端翻成英文，英文文案在 `content.json`（含签文、十年大运一句话、常见问题），可以直接改；走查 `test/e2e/us.mjs`（第 5 个参数 `wide` 走电脑尺寸）；后台看板「美国版 Flow Day」看漏斗（含「不注册看了今天」）和功能使用 |
| `scripts/backup.mjs` | SQLite 一致性备份，保留 14 份 |
| `deploy/` | systemd 服务与每日备份定时器 |

日历由服务端算好再返回，没有免费次数也没有会员时接口返回 402（今天页仍带着“大家的今天”），页面拿不到个人数据。

页面结构：底部三个页签「今天 / 日历 / 我的」。今天页从上往下：本周 7 天（能量趋势线、你记的心情、大家的这一天）→ 每天的卡片（左右滑看前后一天，滑出本周取 `/api/week`；主题下面一行是这一天的幸运色，卡片的光晕和能量环也用这两个颜色，点开看为什么和配饰）→ 每日一签（全屏深色仪式，点缀色是今天的幸运色：按住三秒默念 → 摇手机摇签 → 星盘的天干地支停在今天、最外一圈停在这一支 → 按住筊杯往上抛 → 签名和签诗逐字浮现；签号和掷筊结果都由服务端定，`jiao.json`；解签先回答问的那一类，其余几类收成小格点开看，每类星数 + 说明 + 建议，`lot-topics.json`）、问一件事、转运御守 → 记录此刻 → 明天寄语（`daily-line.json` 的 `tomorrow`）。访客先看示例的今天，点“测测我的”填出生信息就能看到能量卡（不用注册），点“保存并看我的今天”才注册。

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
PLAYWRIGHT_MODULE=... CHROME=... node test/e2e/lot.mjs http://127.0.0.1:3210/bazi /tmp/lrl/dev.db /tmp/lrl/shots   # 每日一签：按住默念、摇签、起签、往上抛筊、解签（服务端要 JIAO_FAKE=xiao,sheng）
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
- Gumroad（海外付款）：商品 https://mjscjjb.gumroad.com/l/mindflow ，会员一档，月付 $4.99、年付 $29.99，自动续费。下单建一张 `LRG` 开头的待支付订单，订单号放进结账链接的 `ref` 参数；Gumroad 每扣一次款往 `https://mindflow.zone/bazi/api/pay/gumroad/ping` 发一个签名的 Ping，首单按 `ref` 开通，续费按 `subscription_id` 找到用户再加一期（月 30 天、年 365 天），退款或争议自动扣回。用户取消续费不用处理，到期自然停。Gumroad 退款在它的后台操作。Gumroad 禁止卖“在 Gumroad 之外交付的 AI 服务订阅”，所以海外只卖日历会员，问事和御守不走 Gumroad。美国版 Flow Day 用同一个商品收款，订单号 `SXT` 开头，Ping 由这里转发给它（见 `GUMROAD_FORWARD_URL`）。
- 服务器上的代码目录就是这个 GitHub 仓库的 clone（`origin` = `git@github.com:mjscjj/bazi-calendar.git`，分支 `master`）。`data/`、`node_modules/` 不进仓库。
- 推送权限：仓库公开，谁都能 clone；推送用服务器上的仓库专用钥匙 `/root/.ssh/bazi_calendar_deploy`（GitHub 上的 Deploy key，只能推这一个仓库），已经配在服务器这份 clone 的 `core.sshCommand` 里，在服务器上直接 `git push` 就行。想在自己电脑上推，把这把钥匙拷下来，用 `GIT_SSH_COMMAND='ssh -i <钥匙路径> -o IdentitiesOnly=yes' git push`。钥匙泄露了就到仓库 Settings → Deploy keys 删掉重配。
- 发布：`scripts/deploy.sh` 会先备份数据库，再拉 master（依赖有变就 `npm ci`），然后重启服务、做健康检查。
  - 本地改：改完 push 到 GitHub，再执行 `ssh root@150.109.21.115 'cd /root/apps/bazi-calendar && ./scripts/deploy.sh'`。
  - 服务器上改：直接在 `/root/apps/bazi-calendar` 里改，`./scripts/deploy.sh --local` 先上线看效果，确认后 `git commit` 再 `git push`。别把没提交的改动长期留在服务器上，否则下次有人从本地发布时会拉不下来。
- 日志：`journalctl -u bazi-calendar -f`。回滚：`git reset --hard <上一个提交> && ./scripts/deploy.sh --local`；数据库回滚用 `/root/backups/bazi-calendar/` 里的备份（先停服务再替换 `data/app.db`）。

配置项：`PORT` `HOST` `BASE_PATH`（默认 `/bazi`）`DB_PATH` `COOKIE_SECURE`（本地 http 设 0）`ADMIN_USER` `ADMIN_PASSWORD` `ALIPAY_APPID` `ALIPAY_PRIVATE_KEY` `ALIPAY_PUBLIC_KEY` `ALIPAY_NOTIFY_URL` `ALIPAY_FAKE` `GUMROAD_PRODUCT_ID` `GUMROAD_PRODUCT_URL` `GUMROAD_PING_SECRET`（三项都填才显示海外付款）`GUMROAD_ACCESS_TOKEN`（回查订单用）`GUMROAD_FORWARD_URL`（美国版 Flow Day 的 Ping 地址；订单号 SXT 开头、或续费/退款在这里查不到的 Ping 原样转过去，不设就不转）`GUMROAD_MONTH_CENTS` `GUMROAD_YEAR_CENTS`（页面显示的美元价格，默认 499 / 2999，要和 Gumroad 后台一致）`CONTENT_DIR`（默认仓库里的 `content/`）`PUBLIC_URL`（日历订阅链接用的对外地址，默认按请求头推出来）`ASK_AI`（问事解读：`codex` / `fake` / 不填为关闭）`ASK_MODEL`（默认 gpt-6.2-sol）`ASK_EFFORT`（默认 xhigh）`ASK_CONCURRENCY`（默认 2）`ASK_TIMEOUT_MS`（默认 120000）`ASK_WORKDIR`、`JIAO_FAKE`（只在本地和走查用：掷筊按这个顺序出结果，比如 `xiao,sheng` 第 1 次笑杯、第 2 次圣杯；线上不要设，线上按真实概率圣杯 1/2、笑杯和阴杯各 1/4）。
