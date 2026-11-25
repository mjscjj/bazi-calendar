// 后台数据看板：转化漏斗、留存、北极星、功能使用、分享与邀请、自评吻合度。都按北京时间的日期算。
const DAY_MS = 86400000;
const bjDay = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
const dayStart = (d) => new Date(Date.parse(d + 'T00:00:00+08:00')).toISOString();
const addDays = (d, n) => bjDay(Date.parse(d + 'T12:00:00+08:00') + n * DAY_MS);

// 功能使用：埋点名 → 看板上的名字
const FEATURES = [
  ['draw', '每日一签'], ['outfit_open', '幸运色'], ['pick_pin', '挑日子定下'], ['share_create', '生成分享图'],
  ['ask_done', '问事'], ['ask_follow', '问事追问'], ['ask_review', '问事回看'], ['rate', '每晚自评'], ['mood_stick', '记一笔'], ['deed_add', '记善行'], ['deed_exchange', '善行换御守'], ['practice_meditate', '冥想练习'], ['practice_release', '释放练习'], ['draw_toss', '掷筊'], ['energy_exchange', '冥想换御守'], ['amulet_buy', '直接买御守'], ['wish_done', '祈愿（旧版）'], ['ics_open', '打开日历订阅页'],
];

export function adminStats(db, now = Date.now()) {
  const today = bjDay(now);
  const one = (sql, ...a) => db.get(sql, ...a).n;

  const funnel = (days) => {
    const from = addDays(today, -(days - 1)), fromIso = dayStart(from);
    const regs = `SELECT id FROM users WHERE created_at >= '${fromIso}'`;
    return [
      ['打开', one("SELECT COUNT(DISTINCT anon_id) n FROM events WHERE name = 'visit' AND created_at >= ?", fromIso)],
      ['测能量卡', one("SELECT COUNT(DISTINCT anon_id) n FROM events WHERE name = 'card_preview' AND created_at >= ?", fromIso)],
      ['注册', one(`SELECT COUNT(*) n FROM (${regs})`)],
      ['第 2 天再来', one(`SELECT COUNT(*) n FROM (${regs}) r WHERE (SELECT COUNT(*) FROM usage_days d WHERE d.user_id = r.id) >= 2`)],
      ['付费', one(`SELECT COUNT(*) n FROM (${regs}) r WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = r.id AND o.status = 'paid')`)],
    ].map(([label, n]) => ({ label, n }));
  };

  // 留存：按注册日，看第 1、3、7、14 天是否还在用（当天有使用记录）
  const cohorts = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const ids = db.all('SELECT id FROM users WHERE created_at >= ? AND created_at < ?', dayStart(d), dayStart(addDays(d, 1))).map((r) => r.id);
    const row = { day: d, size: ids.length };
    for (const k of [1, 3, 7, 14]) {
      const target = addDays(d, k);
      row['d' + k] = !ids.length || target > today ? null
        : ids.filter((id) => db.get('SELECT 1 x FROM usage_days WHERE user_id = ? AND day = ?', id, target)).length / ids.length;
    }
    cohorts.push(row);
  }

  // 北极星：有效付费会员近 7 天打开天数的中位数
  const from7 = addDays(today, -6);
  const members = db.all(`SELECT u.id, (SELECT COUNT(*) FROM usage_days d WHERE d.user_id = u.id AND d.day >= ?) days
    FROM users u WHERE u.member_until > ? AND EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'paid')`, from7, new Date(now).toISOString()).map((r) => r.days).sort((a, b) => a - b);
  const median = members.length ? (members.length % 2 ? members[(members.length - 1) / 2] : (members[members.length / 2 - 1] + members[members.length / 2]) / 2) : null;

  const from7Iso = dayStart(from7);
  const actors = (name) => one("SELECT COUNT(DISTINCT COALESCE(CAST(user_id AS TEXT), 'a:' || anon_id)) n FROM events WHERE name = ? AND created_at >= ?", name, from7Iso);
  const features = FEATURES.map(([k, label]) => ({ key: k, label, users: actors(k) }));
  features.push({ key: 'ics_fetch', label: '日历订阅在用', users: one('SELECT COUNT(*) n FROM users WHERE cal_fetched_at >= ?', from7Iso) });

  const share = {
    makers: actors('share_create'),
    opens: one("SELECT COUNT(*) n FROM events WHERE name = 'landing' AND props LIKE '%share%' AND created_at >= ?", from7Iso),
    invitedSignups: one('SELECT COUNT(*) n FROM invites WHERE created_at >= ?', from7Iso),
    invitesDone: one("SELECT COUNT(*) n FROM invites WHERE status IN ('done','capped') AND done_at >= ?", from7Iso),
  };

  // 自评吻合度：按周（周一开始）
  const weeks = [];
  const dow = (new Date(Date.parse(today + 'T12:00:00+08:00')).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  for (let i = 5; i >= 0; i--) {
    const a = addDays(monday, -7 * i), b = addDays(a, 7);
    const rows = db.all('SELECT score, sys_level FROM ratings WHERE day >= ? AND day < ?', a, b);
    const band = (v) => (v <= 2 ? 0 : v === 3 ? 1 : 2);
    weeks.push({ week: a, n: rows.length, match: rows.length ? rows.filter((r) => band(r.score) === band(r.sys_level)).length / rows.length : null });
  }

  // 美国版（/us/）：只有匿名事件和候补名单
  const usFrom = dayStart(addDays(today, -29));
  const usN = (name) => one('SELECT COUNT(DISTINCT anon_id) n FROM events WHERE name = ? AND created_at >= ?', name, usFrom);
  const us = [['打开', usN('us_visit')], ['测日柱', usN('us_reveal')], ['分享图', usN('us_share')], ['发邀请', usN('us_invite')],
    ['朋友测出两人的画', usN('us_pair')], ['留邮箱', one('SELECT COUNT(*) n FROM us_waitlist WHERE created_at >= ?', usFrom)]].map(([label, n]) => ({ label, n }));
  return { us, funnel7: funnel(7), funnel30: funnel(30), cohorts, northStar: { members: members.length, median }, features, share, ratings: weeks };
}
