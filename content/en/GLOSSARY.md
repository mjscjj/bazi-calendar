# flowday 英文版：术语表和写法

英文版和中文版是同一个产品、同一套功能，只是换了语言。翻译以「英语母语用户读着自然」为准，不逐字直译。
语气：温暖、简洁、现代，像一个懂行的朋友；不要神神叨叨，也不要客服腔。句子短，主动语态，第二人称 you。

## 怎么放英文

- 界面文案：代码里写 `t('中文原文')`，英文放在 `public/i18n/en/<模块>.json`，键是中文原文，值是英文。带变量写 `t('还剩 {n} 次', { n })`，英文里保留同样的 `{n}`。
- 服务端提示（报错、消息）：`T('中文')`，英文放在 `server/i18n/en.json`。
- 内容库：`content/en/<同名文件>.json`，结构和中文文件一样，只写要翻的字段（叠在中文上，数组整个替换）。
- 检查：`node scripts/i18n-check.mjs [文件…]` 列出没翻的和没包起来的中文。

## 品牌和产品词

| 中文 | 英文 |
|---|---|
| flowday | flowday（小写，不翻） |
| 今天 / 日历 / 转运 / 我的（底部页签） | Today / Calendar / Luck / Me |
| 能量卡 | Energy Card |
| 日柱 | Day Pillar |
| 一甲子（60 个日柱） | the Sixty（collection of 60 day pillars）；「集齐一甲子」= complete the Sixty |
| 收画 / 收下今天的画 | collect today's painting |
| 撕日历 | tear off a page |
| 每日一签 | Daily Oracle |
| 签 / 第 N 签 | lot / Lot No. N |
| 求签 | draw a lot |
| 签诗 | verse |
| 解签 | reading |
| 掷筊 / 筊杯 | toss the moon blocks / moon blocks |
| 圣杯 / 笑杯 / 阴杯 | Yes（one up, one down）/ Ask again（both flat up, "laughing"）/ Not yet（both down） |
| 上签 / 中签 / 下签 | Great lot / Fair lot / Challenging lot |
| 问事 / 问一件事 | Ask / Ask about something |
| 起卦 | cast a reading |
| 挑日子 | Pick a Day |
| 宜 / 忌 | Do / Avoid |
| 公共黄历 | Almanac（traditional almanac） |
| 我的日历（个人宜忌） | Just for you |
| 时段 / 时辰 | hours / two-hour period（时辰 = double-hour） |
| 最佳时段 | best hours |
| 幸运色 / 幸运配饰 | lucky colors / lucky accessory |
| 明天寄语 | A note for tomorrow |
| 节气 | solar term |
| 御守 | omamori（charm）；首次出现可写 omamori charm |
| 善行 | good deed |
| 静心 / 冥想 / 释放练习 | stillness / meditation / release practice |
| 心愿 | wish |
| 心情 / 记一笔 | mood / jot something down |
| 待办 | to-do |
| 会员 / 体验版 | membership / beta（「你很幸运，现在是体验版，会员免费送」= Lucky you — it's the beta, so membership is free） |
| 免费体验 | free trial |
| 邀请好友 | Invite friends |
| 本月回顾 | Monthly recap |
| 专业模式 | Pro mode |

## 档位（每天的能量）

| k | 中文 p | 中文 n | 英文 |
|---|---|---|---|
| 5 | 很顺 | 大吉 | Excellent |
| 4 | 顺利 | 吉 | Good |
| 3 | 平稳 | 平 | Steady |
| 2 | 留神 | 小心 | Careful |
| 1 | 低调 | 凶 | Low-key |

时段图例：顺利 Good / 平稳 Steady / 留意 Careful。

## 五行、天干、地支

- 五行：木 Wood、火 Fire、土 Earth、金 Metal、水 Water。
- 天干（拼音不带声调）：甲 Jia、乙 Yi、丙 Bing、丁 Ding、戊 Wu、己 Ji、庚 Geng、辛 Xin、壬 Ren、癸 Gui；阳 Yang / 阴 Yin。
- 地支和生肖：子 Zi Rat、丑 Chou Ox、寅 Yin Tiger、卯 Mao Rabbit、辰 Chen Dragon、巳 Si Snake、午 Wu Horse、未 Wei Goat、申 Shen Monkey、酉 You Rooster、戌 Xu Dog、亥 Hai Pig。
- 干支写法：「辛亥」→ Xin Hai（需要解释时加 Metal Pig）。日柱称号用英文意译（如「冬湖里的珍珠」→ Pearl in a Winter Lake）。
- 时辰：英文统一写钟点，如 7–9 AM、1–3 PM，不写「辰时」。

## 十神（白话名 / 术语名）

| 中文 | 白话 | 术语 |
|---|---|---|
| 正官 | Structure | Direct Officer |
| 七杀 | Pressure | Seven Killings |
| 正印 | Support | Direct Resource |
| 偏印 | Insight | Indirect Resource |
| 比肩 | Allies | Friend |
| 劫财 | Competition | Rob Wealth |
| 食神 | Ease | Eating God |
| 伤官 | Expression | Hurting Officer |
| 正财 | Earnings | Direct Wealth |
| 偏财 | Opportunity | Indirect Wealth |

界面默认用白话名；专业模式里可以「白话（术语）」。

## 二十四节气

立春 Start of Spring、雨水 Rain Water、惊蛰 Awakening of Insects、春分 Spring Equinox、清明 Clear and Bright、谷雨 Grain Rain、立夏 Start of Summer、小满 Grain Buds、芒种 Grain in Ear、夏至 Summer Solstice、小暑 Minor Heat、大暑 Major Heat、立秋 Start of Autumn、处暑 End of Heat、白露 White Dew、秋分 Autumn Equinox、寒露 Cold Dew、霜降 Frost's Descent、立冬 Start of Winter、小雪 Minor Snow、大雪 Major Snow、冬至 Winter Solstice、小寒 Minor Cold、大寒 Major Cold。

## 日期和数字

- 日期：Nov 26；带年份 Nov 26, 2026；星期 Mon/Tue…；周的起止写 Oct 26 – Nov 1。
- 农历：Lunar 10/18（月/日），闰月写 Lunar leap 6/3。
- 价格：¥2.9 / 30 days（人民币照写 ¥）。
- 次数和单位要处理单复数：1 lot / 2 lots；能用 `{n}` 拼的尽量把单复数写在同一条英文里（如 "{n} left"）。

## 写法规则

- 按钮用动词开头、首字母大写的短语：Save, Draw a lot, Pick a day。标题用 Sentence case。
- 不出现「八字」「算命」「fortune telling」这类字样，用 "Chinese calendar wisdom"、"your day pillar" 这类说法。
- 内容声明：仅供娱乐和参考，不构成任何决策依据 → For fun and reflection only — not advice for any decision.
- 不要中英混排；英文里不夹汉字（专业模式的干支除外）。
