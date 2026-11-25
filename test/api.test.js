// 接口端到端：注册登录、免费 2 次、付费墙、下单开通（模拟支付宝）、反馈、后台。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createServer, bjDay } from '../server/app.js';
import { loadContent } from '../server/content.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let server, base, db;
const paid = new Set();
const fake = {
  appId: 'fake', fake: { paid },
  async precreate({ outTradeNo }) { return `https://qr.alipay.com/fake-${outTradeNo}`; },
  async query(no) { return paid.has(no) ? { exists: true, status: 'TRADE_SUCCESS', tradeNo: 'T' + no, amount: (db.get('SELECT amount_cents a FROM orders WHERE out_trade_no = ?', no).a / 100).toFixed(2), buyer: 'a***' } : { exists: false }; },
  async cancel() { return true; },
  verifyNotify: () => false,
};
const quiet = { info() {}, error() {} };

before(async () => {
  db = openDb(':memory:');
  server = createServer({ db, alipay: fake, env: { BASE_PATH: '/bazi', COOKIE_SECURE: '0', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'adminpass123', ASK_AI: 'fake' }, log: quiet });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/bazi`;
});
after(() => server.close());

// 每个客户端模拟一个不同的来源 IP，避免触发注册频率限制
let ipSeq = 0;
function client() {
  let cookie = '';
  const ip = `10.0.0.${++ipSeq}`;
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': ip },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.getSetCookie();
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ') || cookie;
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}
const birth = { date: '1990-10-19', time: '10:00', gender: '女' };
const month = '/api/calendar?y=2026&m=11&today=2026-11-23';

test('静态页面和示例日历', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /流日历/);
  const c = client();
  const d = await c('GET', '/api/demo/calendar?y=2026&m=11&today=2026-11-23');
  assert.equal(d.status, 200);
  assert.equal(d.data.days.length, 30);
  assert.equal(d.data.demo, true);
});

test('注册、资料、免费次数与付费墙', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', { username: 'ab', password: '12345678', agree: true })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { username: 'alice', password: '123', agree: true })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { username: 'alice', password: '12345678' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { username: 'alice', password: '12345678', agree: true })).status, 200);
  assert.equal((await client()('POST', '/api/auth/register', { username: 'ALICE', password: '12345678', agree: true })).status, 400, '用户名不区分大小写');

  assert.equal((await c('GET', month)).status, 409, '没填生日先要求填');
  const p = await c('PUT', '/api/me/profile', { nickname: '爱丽丝', bio: '你好', birth });
  assert.equal(p.status, 200);
  assert.equal(p.data.user.birth.date, '1990-10-19');

  const r1 = await c('GET', month);
  assert.equal(r1.status, 200);
  assert.equal(r1.data.access.mode, 'free');
  assert.equal(r1.data.access.freeUsed, 1);
  const r1b = await c('GET', '/api/calendar?y=2026&m=12&today=2026-11-23');
  assert.equal(r1b.data.access.freeUsed, 1, '同一天不重复扣');

  const uid = db.get("SELECT id FROM users WHERE username='alice'").id;
  // 把今天的使用记录挪到昨天，模拟第二天来用
  db.run('UPDATE usage_days SET day = ? WHERE user_id = ?', '2000-01-01', uid);
  const r2 = await c('GET', month);
  assert.equal(r2.data.access.freeUsed, 2);
  assert.equal(r2.data.access.remaining, 0);
  db.run('UPDATE usage_days SET day = ? WHERE user_id = ? AND day = ?', '2000-01-02', uid, bjDay());
  const r3 = await c('GET', month);
  assert.equal(r3.status, 402);
  assert.equal(r3.data.error, 'paywall');
  assert.equal(r3.data.priceCents, 290);

  // 下单 → 模拟付款 → 查单开通
  const o = await c('POST', '/api/pay/orders', {});
  assert.equal(o.status, 200);
  assert.match(o.data.order.qrSvg, /<svg/);
  const o2 = await c('POST', '/api/pay/orders', {});
  assert.equal(o2.data.order.outTradeNo, o.data.order.outTradeNo, '未过期的待付款订单复用');
  const no = o.data.order.outTradeNo;
  let s = await c('GET', `/api/pay/orders/${no}?force=1`);
  assert.equal(s.data.order.status, 'pending');
  paid.add(no);
  s = await c('GET', `/api/pay/orders/${no}?force=1`);
  assert.equal(s.data.order.status, 'paid');
  assert.equal(s.data.access.mode, 'member');
  assert.equal(s.data.access.daysLeft, 30);
  s = await c('GET', `/api/pay/orders/${no}?force=1`);
  const until1 = db.get('SELECT member_until FROM users WHERE id = ?', uid).member_until;
  assert.equal((await c('GET', month)).status, 200, '开通后可用');
  // 续费顺延
  const o3 = await c('POST', '/api/pay/orders', {});
  assert.notEqual(o3.data.order.outTradeNo, no);
  paid.add(o3.data.order.outTradeNo);
  await c('GET', `/api/pay/orders/${o3.data.order.outTradeNo}?force=1`);
  const until2 = db.get('SELECT member_until FROM users WHERE id = ?', uid).member_until;
  assert.equal(Math.round((new Date(until2) - new Date(until1)) / 86400000), 30);
  const ms = await c('GET', '/api/membership');
  assert.equal(ms.data.orders.length, 2);
});

test('计划与设置', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: '小明同学', password: 'abcdefgh', agree: true });
  await c('PUT', '/api/me/profile', { nickname: '', bio: '', birth: { date: '1988-03-01', time: null, gender: '男' } });
  const p = await c('POST', '/api/plans', { name: '季度汇报', type: '汇报' });
  assert.equal(p.status, 200);
  assert.equal((await c('PUT', `/api/plans/${p.data.plan.id}`, { date: '2026-11-25' })).status, 200);
  const cal = await c('GET', month);
  assert.equal(cal.data.plans[0].date, '2026-11-25');
  assert.equal(cal.data.chart.pillars.length, 3, '时辰不详只排三柱');
  const s = await c('PUT', '/api/me/settings', { proMode: true, xiOverride: { xi: [0, 1], ji: [3] } });
  assert.equal(s.data.user.proMode, true);
  const cal2 = await c('GET', month);
  assert.deepEqual(cal2.data.chart.xi, [0, 1]);
  // 别人的计划删不掉
  const other = client();
  await other('POST', '/api/auth/register', { username: 'mallory', password: 'abcdefgh', agree: true });
  await other('DELETE', `/api/plans/${p.data.plan.id}`);
  assert.equal(db.get('SELECT COUNT(*) n FROM plans WHERE id = ?', p.data.plan.id).n, 1);
});

test('登录锁定与改密码', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'bob_1', password: 'goodpass1', agree: true });
  const anon = client();
  for (let i = 0; i < 4; i++) assert.equal((await anon('POST', '/api/auth/login', { username: 'bob_1', password: 'wrong' })).status, 400);
  const fifth = await anon('POST', '/api/auth/login', { username: 'bob_1', password: 'wrong' });
  assert.match(fifth.data.message, /锁定 15 分钟/);
  const locked = await anon('POST', '/api/auth/login', { username: 'bob_1', password: 'goodpass1' });
  assert.match(locked.data.message, /分钟后再试/);
  db.run("UPDATE users SET locked_until = NULL WHERE username = 'bob_1'");
  assert.equal((await anon('POST', '/api/auth/login', { username: 'bob_1', password: 'goodpass1' })).status, 200);
  assert.equal((await c('POST', '/api/auth/password', { old: 'bad', password: 'newpass12' })).status, 400);
  assert.equal((await c('POST', '/api/auth/password', { old: 'goodpass1', password: 'newpass12' })).status, 200);
  assert.equal((await anon('GET', '/api/me')).data.user, null, '改密码后其他会话失效');
  assert.equal((await c('GET', '/api/me')).data.user.username, 'bob_1', '当前会话保留');
});

test('反馈、找回密码与后台', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'carol', password: 'carolpass', agree: true });
  assert.equal((await c('POST', '/api/feedback', { type: '建议', content: '希望加英文版', contact: 'wx:carol' })).status, 200);
  assert.equal((await client()('POST', '/api/auth/forgot', { username: 'carol', contact: '13800000000' })).status, 200);
  assert.equal((await client()('POST', '/api/auth/forgot', { username: 'carol', contact: '' })).status, 400);

  const a = client();
  assert.equal((await a('GET', '/api/admin/overview')).status, 401);
  assert.equal((await a('POST', '/api/admin/login', { username: 'admin', password: 'x' })).status, 400);
  assert.equal((await a('POST', '/api/admin/login', { username: 'admin', password: 'adminpass123' })).status, 200);
  const ov = await a('GET', '/api/admin/overview');
  assert.equal(ov.status, 200);
  assert.ok(ov.data.totals.users >= 4);
  assert.equal(ov.data.series.length, 30);
  assert.ok(ov.data.totals.revenueCents >= 580);

  const fb = await a('GET', '/api/admin/feedback?status=open');
  const sugg = fb.data.list.find((x) => x.type === '建议');
  const forgot = fb.data.list.find((x) => x.type === '找回密码');
  assert.ok(sugg && forgot);
  await a('POST', `/api/admin/feedback/${sugg.id}`, { reply: '收到，已排期' });
  const me = await c('GET', '/api/me');
  assert.equal(me.data.unread, 1);
  const mine = await c('GET', '/api/feedback');
  assert.equal(mine.data.list.find((x) => x.type === '建议').reply, '收到，已排期');
  assert.equal((await c('GET', '/api/me')).data.unread, 0);

  const users = await a('GET', '/api/admin/users?q=carol');
  const carol = users.data.list[0];
  const rp = await a('POST', `/api/admin/users/${carol.id}/reset-password`, {});
  assert.equal(rp.data.password.length, 10);
  assert.equal((await c('GET', '/api/me')).data.user, null, '重置密码后旧会话失效');
  assert.equal((await c('POST', '/api/auth/login', { username: 'carol', password: rp.data.password })).status, 200);
  assert.equal((await a('POST', `/api/admin/users/${carol.id}/adjust-days`, { days: 7 })).status, 400, '必须填原因');
  const adj = await a('POST', `/api/admin/users/${carol.id}/adjust-days`, { days: 7, reason: '补偿' });
  assert.ok(adj.data.memberUntil);
  assert.equal((await c('GET', '/api/me')).data.access.mode, 'member');

  const orders = await a('GET', '/api/admin/orders?status=paid');
  assert.ok(orders.data.list.length >= 2);
  const ref = await a('POST', `/api/admin/orders/${orders.data.list[0].out_trade_no}/refund`, { reason: '用户误购' });
  assert.equal(ref.status, 200);

  const st = await a('PUT', '/api/admin/settings', { price_cents: 1290, free_uses: 3 });
  assert.equal(st.data.settings.price_cents, '1290');
  assert.equal((await c('GET', '/api/legal')).data.priceCents, 1290);
  await a('PUT', '/api/admin/settings', { price_cents: 290, free_uses: 2 });

  const logs = await a('GET', '/api/admin/logs');
  const actions = logs.data.list.map((x) => x.action);
  for (const k of ['重置密码', '调整会员天数', '登记退款', '修改设置']) assert.ok(actions.includes(k), k);

  await a('POST', `/api/admin/users/${carol.id}/status`, { status: 'disabled' });
  assert.equal((await c('GET', '/api/me')).data.user, null, '停用后立即下线');
});

test('非 JSON 的写请求被拒绝（防跨站表单）', async () => {
  const r = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=zzz&password=12345678&agree=1' });
  assert.equal(r.status, 415);
});

test('访客看能量卡、注册时带上出生信息', async () => {
  const c = client();
  const bad1 = await c('POST', '/api/preview/card', { birth: { date: '2030-01-01', gender: '女' } });
  assert.equal(bad1.status, 400);
  const pv = await c('POST', '/api/preview/card', { birth, nickname: '阿满' });
  assert.equal(pv.status, 200);
  assert.equal(pv.data.card.dm, '丁');
  assert.equal(pv.data.card.image, '烛光');
  assert.equal(pv.data.card.traits.length, 3);
  assert.equal(pv.data.card.force.length, 5);
  const r = await c('POST', '/api/auth/register', { username: 'dora_1', password: 'dorapass1', agree: true, birth, nickname: '阿满' });
  assert.equal(r.status, 200);
  const me = await c('GET', '/api/me');
  assert.equal(me.data.user.birth.date, '1990-10-19');
  assert.equal(me.data.user.nickname, '阿满');
  const card = await c('GET', '/api/me/card');
  assert.equal(card.data.card.symbol, '烛');
});

test('今天页：大家的今天、今日一句、穿搭、签当天固定', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'erin_1', password: 'erinpass1', agree: true, birth });
  const today = bjDay();
  const t = await c('GET', '/api/today?date=' + today);
  assert.equal(t.status, 200);
  assert.ok(t.data.almanac.yi.length > 0);
  assert.match(t.data.line.why, /^今天是.+当家，对你这团烛光来说，.+。$/);
  assert.ok(t.data.line.head && t.data.line.text.startsWith(t.data.line.head), '先一句行动话');
  assert.ok(t.data.tomorrow && t.data.tomorrow.head && t.data.tomorrow.hours.length, '带着明天');
  assert.equal(t.data.outfit.colors.length, 2);
  assert.equal(t.data.day.hours.length, 12);
  assert.equal(t.data.week.length, 7);
  assert.equal(t.data.draw, null);
  assert.equal(t.data.access.freeUsed, 1);
  const d1 = await c('POST', '/api/draws/today', { date: today });
  const d2 = await c('POST', '/api/draws/today', { date: today });
  assert.equal(d1.status, 200);
  assert.equal(d1.data.draw.no, d2.data.draw.no);
  assert.equal(d1.data.draw.status, 'pending', '摇出来先要掷筊确认');
  assert.equal(d1.data.draw.poem, undefined, '没掷出圣杯前看不到签文');
  // 掷到圣杯为止（测试里把这一天的记录重置成 pending，直到掷出圣杯）
  const uid0 = db.get("SELECT user_id FROM draws WHERE day = ? ORDER BY created_at DESC LIMIT 1", today).user_id;
  let tz;
  for (let i = 0; i < 60; i++) {
    tz = await c('POST', '/api/draws/today/toss', { date: today });
    assert.ok(['sheng', 'xiao', 'yin'].includes(tz.data.toss));
    if (tz.data.toss === 'sheng') break;
    assert.equal(tz.data.draw.poem, undefined);
    db.run("UPDATE draws SET status = 'pending', tosses = '[]' WHERE user_id = ? AND day = ?", uid0, today);
  }
  assert.equal(tz.data.draw.status, 'done');
  assert.equal(tz.data.draw.poem.length, 4);
  assert.ok(tz.data.draw.hint);
  assert.equal((await c('POST', '/api/draws/today/toss', { date: today })).data.toss, null, '确认过就不再掷');
  const t2 = await c('GET', '/api/today?date=' + today);
  assert.equal(t2.data.draw.no, d1.data.draw.no);
  assert.equal((await c('GET', '/api/today?date=1999-01-01')).status, 400, '只接受前后两天');
  const demo = await client()('GET', '/api/demo/today?date=' + today);
  assert.equal(demo.status, 200);
  assert.equal(demo.data.demo, true);
  assert.equal(demo.data.name, '小满');
  // 用完免费次数：今天页返回 402，但带着大家的今天
  const uid = db.get("SELECT id FROM users WHERE username='erin_1'").id;
  db.run("UPDATE usage_days SET day = '2000-01-01' WHERE user_id = ?", uid);
  db.run("INSERT INTO usage_days(user_id, day, created_at) VALUES(?, '2000-01-02', '')", uid);
  const locked = await c('GET', '/api/today?date=' + today);
  assert.equal(locked.status, 402);
  assert.ok(locked.data.almanac.ji.length > 0);
  assert.equal((await c('POST', '/api/draws/today', { date: today })).status, 402);
});

test('埋点批量写入，非法事件名丢弃', async () => {
  const c = client();
  const r = await c('POST', '/api/events', { anonId: 'abc', events: [{ name: 'today_open', props: { level: 4 } }, { name: 'Bad Name!' }, { name: 'share_create', props: { kind: 'lot' } }] });
  assert.equal(r.status, 200);
  const rows = db.all("SELECT name FROM events WHERE anon_id = 'abc' ORDER BY id");
  assert.deepEqual(rows.map((x) => x.name), ['today_open', 'share_create']);
});

test('内容文件缺字段时启动失败', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrl-content-'));
  for (const f of ['energy-cards.json', 'daily-line.json', 'outfit.json', 'lots.json', 'pick.json', 'ask.json', 'ask-prompt.md', 'ask-follow-prompt.md', 'amulets.json', 'moods.json', 'day-pillars.json', 'pairs.json', 'luck.json', 'jiao.json', 'lot-topics.json', 'terms.json']) fs.copyFileSync(new URL('../content/' + f, import.meta.url), path.join(dir, f));
  assert.doesNotThrow(() => loadContent(dir));
  const cards = JSON.parse(fs.readFileSync(path.join(dir, 'energy-cards.json'), 'utf8'));
  delete cards.cards['癸'];
  fs.writeFileSync(path.join(dir, 'energy-cards.json'), JSON.stringify(cards));
  assert.throws(() => loadContent(dir), /癸/);
  fs.copyFileSync(new URL('../content/energy-cards.json', import.meta.url), path.join(dir, 'energy-cards.json'));
  const pl = JSON.parse(fs.readFileSync(path.join(dir, 'day-pillars.json'), 'utf8'));
  delete pl.pillars['癸亥'];
  fs.writeFileSync(path.join(dir, 'day-pillars.json'), JSON.stringify(pl));
  assert.throws(() => loadContent(dir), /癸亥/);
  fs.copyFileSync(new URL('../content/day-pillars.json', import.meta.url), path.join(dir, 'day-pillars.json'));
  const lt = JSON.parse(fs.readFileSync(path.join(dir, 'lot-topics.json'), 'utf8'));
  delete lt.words['守旧'];
  fs.writeFileSync(path.join(dir, 'lot-topics.json'), JSON.stringify(lt));
  assert.throws(() => loadContent(dir), /守旧/, '签里用到的断语都要收录');
});

test('能量卡带日柱图鉴：插画、称号和按身强身弱的一句', async () => {
  const r = await client()('POST', '/api/preview/card', { birth });
  assert.equal(r.status, 200);
  const p = r.data.card.pillar;
  assert.match(p.gz, /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
  assert.ok(p.name && p.intro && p.line && p.tag);
  assert.match(p.art, /^art\/pillars\/\d{2}-[a-z]+\.webp$/);
  const img = await fetch(base + '/' + p.art);
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-type'), /image\/webp/);
});

test('出生信息：农历、出生城市换算真太阳时、时辰交界', async () => {
  const c = client();
  // 农历一九九二年五月初八 = 公历 1992-06-08；广州 09:20 → 真太阳时 08:54，靠近辰巳交界
  let r = await c('POST', '/api/birth/preview', { birth: { cal: 'lunar', lunar: { y: 1992, m: 5, d: 8 }, time: '09:20', city: '广州' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.date, '1992-06-08');
  assert.equal(r.data.solar.time, '08:54');
  assert.deepEqual([r.data.edge.before, r.data.edge.after, r.data.edge.current], ['辰', '巳', '辰']);
  r = await c('POST', '/api/birth/preview', { birth: { cal: 'lunar', lunar: { y: 1992, m: 5, d: 8, leap: true } } });
  assert.equal(r.status, 400);
  assert.match(r.data.message, /没有闰五月/);
  // 1988 年 7 月北京出生，自动扣掉夏令时
  r = await c('POST', '/api/birth/preview', { birth: { date: '1988-07-01', time: '09:20', city: '北京' } });
  assert.equal(r.data.solar.dstMinutes, 60);
  assert.equal(r.data.solar.time, '08:02');
  assert.equal((await c('POST', '/api/birth/preview', { birth: { date: '1990-01-01', city: '火星' } })).status, 400);
  assert.equal((await c('GET', '/api/cities?q=广')).data.list[0].name, '广州');

  // 保存后：按另一侧时辰排盘，能量卡写明依据
  assert.equal((await c('POST', '/api/auth/register', { username: 'solar1', password: '12345678', agree: true, birth: { date: '1992-06-08', time: '09:20', gender: '男', city: '广州' } })).status, 200);
  let card = (await c('GET', '/api/me/card')).data.card;
  assert.deepEqual(card.basis, { time: '08:54', zhi: '辰', city: '广州', solar: true });
  const me = await c('GET', '/api/me');
  await c('PUT', '/api/me/profile', { nickname: '', bio: '', birth: { ...me.data.user.birth, zhi: '巳' } });
  card = (await c('GET', '/api/me/card')).data.card;
  assert.equal(card.basis.zhi, '巳');
  assert.equal((await c('GET', '/api/me')).data.user.birth.city, '广州');
});

test('挑日子：排除黄历忌、给出理由和时段，定下后进计划', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'picker', password: '12345678', agree: true, birth });
  const r = await c('POST', '/api/pick', { type: '签约', range: '3m', today: bjDay() });
  assert.equal(r.status, 200);
  assert.equal(r.data.picks.length, 3);
  assert.equal(r.data.days, 90);
  for (const p of r.data.picks) {
    assert.ok(p.hours.length && p.hours.every((h) => h >= 4 && h <= 10), '时段在 7–21 点');
    assert.ok(!['劫财', '伤官'].includes(p.ssG) || r.data.candidates < 10);
  }
  assert.ok(r.data.excluded.ji + r.data.excluded.po + r.data.excluded.chong > 0);
  assert.equal((await c('POST', '/api/pick', { type: '算命', range: '1m', today: bjDay() })).status, 400);
  const p = r.data.picks[0];
  const made = await c('POST', '/api/plans', { name: '', type: '签约', date: p.date, hour: p.hours[0], reason: '测试理由' });
  assert.equal(made.status, 200);
  assert.equal(made.data.plan.name, '签约', '没写名字就用事项名');
  const cal = await c('GET', `/api/calendar?y=${p.y}&m=${p.m}&today=${bjDay()}`);
  const pl = cal.data.plans.find((x) => x.id === made.data.plan.id);
  assert.equal(pl.hour, p.hours[0]);
  assert.ok(pl.ssG && pl.level);
  assert.equal((await c('PUT', '/api/plans/' + pl.id, { hour: 99 })).status, 400);
});

test('邀请：第二天再打开才生效，双方各加天数，同设备不发', async () => {
  const a = client();
  await a('POST', '/api/auth/register', { username: 'inviter', password: '12345678', agree: true, birth });
  const code = (await a('GET', '/api/me/invite')).data.code;
  assert.match(code, /^[A-Z0-9]{5}$/);
  const land = await client()('GET', '/api/invite/' + code);
  assert.equal(land.status, 200);
  assert.ok(land.data.card.symbol && !JSON.stringify(land.data).includes('1990'), '落地页不带生日');

  const b = client();
  await b('POST', '/api/auth/register', { username: 'invitee', password: '12345678', agree: true, birth, invite: code, anonId: 'dev-1' });
  const bid = db.get("SELECT id FROM users WHERE username='invitee'").id;
  await b('GET', '/api/today?date=' + bjDay());
  assert.equal(db.get('SELECT status FROM invites WHERE invitee_id = ?', bid).status, 'pending', '第一天不生效');
  db.run('UPDATE usage_days SET day = ? WHERE user_id = ?', '2000-01-01', bid);
  const t = await b('GET', '/api/today?date=' + bjDay());
  assert.equal(t.data.access.mode, 'member');
  assert.match(t.data.news[0].text, /各得 7 天/);
  const inv = await a('GET', '/api/today?date=' + bjDay());
  assert.match(inv.data.news[0].text, /加入了/);
  assert.equal((await a('GET', '/api/me/invite')).data.stats.done, 1);
  assert.equal((await a('GET', '/api/today?date=' + bjDay())).data.news.length, 0, '消息只出现一次');

  const c2 = client();
  await c2('POST', '/api/auth/register', { username: 'invitee2', password: '12345678', agree: true, birth, invite: code, anonId: 'dev-1' });
  assert.equal(db.get("SELECT i.status FROM invites i JOIN users u ON u.id = i.invitee_id WHERE u.username='invitee2'").status, 'blocked');
});

test('每晚自评、手机日历订阅、注销账号', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'rater', password: '12345678', agree: true, birth });
  const day = bjDay();
  const r = await c('POST', '/api/ratings', { day, score: 4 });
  assert.equal(r.status, 200);
  assert.equal(r.data.summary.rated, 1);
  assert.equal((await c('POST', '/api/ratings', { day, score: 9 })).status, 400);
  assert.equal((await c('GET', '/api/today?date=' + day)).data.rate.today, 4);

  await c('POST', '/api/plans', { name: '搬家', type: '搬家', date: day, hour: 5, reason: '充电日' });
  const feed = await c('GET', '/api/me/calendar-feed');
  assert.equal(feed.status, 200);
  assert.equal(feed.data.preview.length, 3);
  const path = new URL(feed.data.url).pathname;
  const ics = await (await fetch(`http://127.0.0.1:${server.address().port}${path}`)).text();
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 61, '60 天 + 1 个计划');
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), '每行不超过 75 字节');
  assert.match(ics, /SUMMARY:📌 搬家/);
  await c('POST', '/api/me/calendar-feed/reset', {});
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}${path}`)).status, 404, '重置后旧链接失效');

  const uid = db.get("SELECT id FROM users WHERE username='rater'").id;
  assert.equal((await c('POST', '/api/me/delete', { password: 'wrong' })).status, 400);
  assert.equal((await c('POST', '/api/me/delete', { password: '12345678' })).status, 200);
  assert.equal(db.get('SELECT COUNT(*) n FROM users WHERE id = ?', uid).n, 0);
  for (const t of ['plans', 'ratings', 'usage_days', 'sessions']) assert.equal(db.get(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`, uid).n, 0, t);
  assert.equal((await c('GET', '/api/me')).data.user, null);
  assert.equal((await client()('POST', '/api/auth/register', { username: 'rater', password: '12345678', agree: true })).status, 200, '同名可以重新注册');
});

test('后台数据看板', async () => {
  const c = client();
  await c('POST', '/api/admin/login', { username: 'admin', password: 'adminpass123' });
  const s = await c('GET', '/api/admin/stats');
  assert.equal(s.status, 200);
  assert.equal(s.data.funnel7.length, 5);
  assert.equal(s.data.cohorts.length, 14);
  assert.ok(s.data.features.some((f) => f.key === 'rate'));
  assert.equal(s.data.ratings.length, 6);
});

test('问事：起卦、体验期 1 次、拒答、同一件事不重复扣、单次付费', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'asker', password: '12345678', agree: true, birth });
  let q = await c('GET', '/api/asks/quota');
  assert.equal(q.data.free, 1);
  assert.equal(q.data.ready, true);
  const refused = await c('POST', '/api/asks', { question: '我这个手术能成功吗', category: '其他' });
  assert.equal(refused.status, 400);
  assert.equal(refused.data.error, 'refused');
  assert.equal((await c('GET', '/api/asks/quota')).data.free, 1, '拒答不扣次数');

  const r = await c('POST', '/api/asks', { question: '这周找老板谈加薪合适吗？', category: '事业' });
  assert.equal(r.status, 200);
  const g = r.data.ask.gua;
  assert.ok(g.ben.name && g.bian.name && g.hu.name && ['顺', '先阻后顺', '宜缓', '有阻'].includes(g.tendency));
  assert.equal(r.data.ask.days.length, 2, '事业类给两个适合的日子');
  let a;
  for (let i = 0; i < 30; i++) { a = (await c('GET', '/api/asks/' + r.data.ask.id)).data.ask; if (a.status !== 'pending') break; await new Promise((x) => setTimeout(x, 100)); }
  assert.equal(a.status, 'done');
  assert.ok(a.reading.headline && a.reading.body.length === 2);

  const again = await c('POST', '/api/asks', { question: '这周找老板谈加薪合适吗', category: '事业' });
  assert.equal(again.data.repeat, true, '同一件事 24 小时内直接给上次的结果');
  const n = await c('POST', '/api/asks', { question: '下个月去成都出差顺利吗', category: '出行', method: 'nums', nums: [3, 8, 21] });
  assert.equal(n.status, 402);
  assert.equal(n.data.error, 'need_pay');

  const o = await c('POST', '/api/pay/orders', { product: 'ask' });
  assert.equal(o.data.order.amountCents, 190);
  assert.equal(o.data.order.product, 'ask');
  assert.match(db.get('SELECT subject FROM orders WHERE out_trade_no = ?', o.data.order.outTradeNo).subject, /^MindFlow 问事/);
  paid.add(o.data.order.outTradeNo);
  const s2 = await c('GET', `/api/pay/orders/${o.data.order.outTradeNo}?force=1`);
  assert.equal(s2.data.credits.ask, 1);
  assert.equal(s2.data.access.mode, 'free', '买问事不改变会员状态');
  const n2 = await c('POST', '/api/asks', { question: '下个月去成都出差顺利吗', category: '出行', method: 'nums', nums: [3, 8, 21] });
  assert.equal(n2.status, 200);
  assert.deepEqual(n2.data.ask.gua.cast.nums, [3, 8, 21]);
  q = await c('GET', '/api/asks/quota');
  assert.equal(q.data.credits, 0);
  assert.equal((await c('GET', '/api/asks')).data.list.length, 2);
  assert.equal((await c('GET', '/api/membership')).data.orders[0].productName, '问事 1 次');
});

test('问事：追问最多 2 次、拒答、过期；7 天后回看和今天页提醒', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'follower', password: '12345678', agree: true, birth });
  const r = await c('POST', '/api/asks', { question: '要不要接下新部门的邀请', category: '事业' });
  const id = r.data.ask.id;
  assert.equal(r.data.ask.follow.left, 0, '解读没写好前不能追问');
  const early = await c('POST', `/api/asks/${id}/follows`, { question: '什么时候答复比较好' });
  assert.equal(early.status, 409);
  let a;
  for (let i = 0; i < 30; i++) { a = (await c('GET', '/api/asks/' + id)).data; if (a.ask.status !== 'pending') break; await new Promise((x) => setTimeout(x, 100)); }
  assert.equal(a.ask.follow.left, 2);
  assert.equal(a.outcomes.length, 5);
  assert.equal(a.ask.review.due, false, '当天还没到回看的日子');

  const refused = await c('POST', `/api/asks/${id}/follows`, { question: '压力大到要去医院吗' });
  assert.equal(refused.data.error, 'refused');
  const waitFollow = async () => { let x; for (let i = 0; i < 30; i++) { x = (await c('GET', '/api/asks/' + id)).data.ask; if (x.follows.every((f) => f.status !== 'pending')) break; await new Promise((z) => setTimeout(z, 100)); } return x; };
  const f1 = await c('POST', `/api/asks/${id}/follows`, { question: '什么时候答复比较好' });
  assert.equal(f1.status, 200);
  assert.equal(f1.data.ask.follows[0].status, 'pending');
  const busy = await c('POST', `/api/asks/${id}/follows`, { question: '要先和现在的老板说吗' });
  assert.equal(busy.status, 409, '上一个还在写时不能连着追问');
  a = await waitFollow();
  assert.equal(a.follows[0].status, 'done');
  assert.ok(a.follows[0].reading.answer && a.follows[0].reading.advice);
  assert.equal(a.follow.left, 1);
  await c('POST', `/api/asks/${id}/follows`, { question: '要先和现在的老板说吗' });
  a = await waitFollow();
  assert.equal(a.follow.left, 0);
  const third = await c('POST', `/api/asks/${id}/follows`, { question: '薪水怎么谈' });
  assert.equal(third.data.error, 'follow_used');
  const q = await c('GET', '/api/asks/quota');
  assert.equal(q.data.free, 0, '追问不额外扣次数（体验期那 1 次被起卦用掉了）');
  assert.equal(q.data.credits, 0);

  // 回看：把起卦时间挪到 8 天前
  const uid = db.get("SELECT id FROM users WHERE username = 'follower'").id;
  const t0 = new Date(Date.now() - 8 * 86400000).toISOString();
  db.run('UPDATE asks SET created_at = ? WHERE id = ?', t0, id);
  a = (await c('GET', '/api/asks/' + id)).data.ask;
  assert.equal(a.review.due, true);
  assert.equal(a.review.remind, true);
  assert.equal(a.follow.open, false, '过了 7 天不能再追问');
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  let t = (await c('GET', '/api/today?date=' + today)).data;
  assert.equal('askReview' in t, false, '今天页不再放回看卡');
  assert.equal((await c('GET', '/api/asks')).data.list[0].remind, true);
  const badOutcome = await c('POST', `/api/asks/${id}/review`, { outcome: 'great' });
  assert.equal(badOutcome.status, 400);
  const rv = await c('POST', `/api/asks/${id}/review`, { outcome: 'progress', note: '谈了一次，下周再定' });
  assert.equal(rv.data.ask.review.outcome.text, '有进展');
  assert.equal(rv.data.ask.review.note, '谈了一次，下周再定');
  assert.equal(rv.data.ask.review.remind, false);
  const dis = await c('POST', `/api/asks/${id}/review`, { outcome: 'dismiss' });
  assert.equal(dis.data.ask.review.outcome.key, 'progress', '已经回看过，点“不用了”不覆盖');
  assert.equal((await c('GET', '/api/asks')).data.list[0].outcome.text, '有进展');

  // 别人的问事碰不到
  const other = client();
  await other('POST', '/api/auth/register', { username: 'nosy', password: '12345678', agree: true, birth });
  assert.equal((await other('POST', `/api/asks/${id}/review`, { outcome: 'good' })).status, 404);
  assert.equal((await other('POST', `/api/asks/${id}/follows`, { question: '能看看吗' })).status, 404);
  assert.equal(db.get('SELECT COUNT(*) n FROM ask_follows WHERE user_id = ?', uid).n, 2);
});

test('心情便签：一天贴几张、平均成当天的分数、撕掉后跟着变、日历里能看到', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'moody', password: '12345678', agree: true, birth });
  const day = bjDay();
  let t = (await c('GET', '/api/today?date=' + day)).data;
  assert.equal(t.moods.length, 0);
  assert.equal(t.moodKit.moods.length, 6);
  assert.equal((await c('POST', '/api/moods', { day, mood: 'nope', color: 'sky' })).status, 400);
  assert.equal((await c('POST', '/api/moods', { day, mood: 'happy', color: 'nope' })).status, 400);
  const a = await c('POST', '/api/moods', { day, mood: 'happy', color: 'apricot', note: '早上跑了步' });
  assert.equal(a.status, 200);
  assert.equal(a.data.summary.rated, 1);
  const b = await c('POST', '/api/moods', { day, mood: 'tired', color: 'sky' });
  assert.equal(b.data.moods.length, 2);
  const uid = db.get("SELECT id FROM users WHERE username='moody'").id;
  const rating = () => db.get('SELECT score, src FROM ratings WHERE user_id = ? AND day = ?', uid, day);
  assert.deepEqual({ ...rating() }, { score: 4, src: 'mood' }, '开心 5 + 累 2 → 平均 3.5 取整为 4');
  t = (await c('GET', '/api/today?date=' + day)).data;
  assert.equal(t.moods[0].note, '早上跑了步');
  assert.equal(t.rate.today, 4);
  const [y, m, d] = day.split('-').map(Number);
  const cal = (await c('GET', `/api/calendar?y=${y}&m=${m}`)).data;
  assert.equal(cal.moods.filter((x) => x.d === d).length, 2);
  assert.ok(cal.moodKit.colors.every((x) => x.light && x.dark));

  await c('DELETE', '/api/moods/' + a.data.moods[0].id);
  assert.equal(rating().score, 2, '撕掉开心，只剩累');
  await c('DELETE', '/api/moods/' + b.data.moods[1].id);
  assert.equal(rating(), undefined, '撕光了就不算这天打过分');
  const ev = await c('POST', '/api/moods', { day, color: 'paper', note: '下午和设计过了一遍首页' });
  assert.equal(ev.status, 200, '只记事情也可以');
  assert.equal(ev.data.moods[0].mood, '');
  assert.equal(rating(), undefined, '只记事情不算分');
  assert.equal((await c('POST', '/api/moods', { day, color: 'paper' })).status, 400, '什么都没写不行');
  assert.equal((await c('POST', '/api/moods', { day, color: 'paper', note: '字'.repeat(81) })).status, 400, '最多 80 个字');
  await c('DELETE', '/api/moods/' + ev.data.moods[0].id);
  for (let i = 0; i < 6; i++) await c('POST', '/api/moods', { day, mood: 'calm', color: 'paper' });
  assert.equal((await c('POST', '/api/moods', { day, mood: 'calm', color: 'paper' })).status, 409, '一天最多 6 张');
  assert.equal((await c('POST', '/api/moods', { day: '2020-01-01', mood: 'calm', color: 'paper' })).status, 400, '太早的日子不能贴');

  const other = client();
  await other('POST', '/api/auth/register', { username: 'moody2', password: '12345678', agree: true, birth });
  const mine = db.get('SELECT id FROM moods WHERE user_id = ?', uid).id;
  assert.equal((await other('DELETE', '/api/moods/' + mine)).status, 404, '撕不了别人的');
});

test('今天页：本周 7 天、明天寄语、翻到别的周', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'weeker', password: '12345678', agree: true, birth });
  const day = bjDay();
  await c('POST', '/api/moods', { day, mood: 'calm', color: 'sky' });
  const t = (await c('GET', '/api/today?date=' + day)).data;
  assert.equal(t.strip.days.length, 7);
  assert.ok(t.strip.days.every((x) => x.luck.length === 2 && x.luck.every((k) => /^#[0-9A-F]{6}$/i.test(k.hex))), '本周每天带幸运色，卡片按它配色');
  assert.deepEqual(t.strip.days.find((x) => x.date === t.date).luck, t.outfit.colors);
  assert.equal(new Date(t.strip.start + 'T12:00:00Z').getUTCDay(), 1, '从周一开始');
  const me = t.strip.days.find((x) => x.date === day);
  assert.ok(me && me.line.head && me.almanac.yi);
  assert.equal(me.moods.length, 1, '本周的心情带在每一天上');
  assert.equal(me.day.score, t.day.score, '和今天卡片的分数一致');
  assert.ok(t.tomorrow.prep && !/\{/.test(t.tomorrow.prep), '明天寄语已经填好占位');
  assert.equal(t.moodKit.moods[0].color, 'apricot');
  const next = new Date(Date.parse(t.strip.start + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
  const w = await c('GET', '/api/week?date=' + next);
  assert.equal(w.data.start, next);
  assert.equal((await c('GET', '/api/week?date=1990-01-01')).status, 400, '太远的不给');
  const demo = await client()('GET', '/api/demo/week?date=' + next);
  assert.equal(demo.data.days.length, 7);
  assert.equal((await client()('GET', '/api/demo/today?date=' + day)).data.strip.days.length, 7);
});

test('每日一签：掷筊最多三次，圣杯就停；三次都是阴杯换个问题重新求；三次没圣杯不再掷', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'jiaoer', password: '12345678', agree: true, birth });
  const day = bjDay();
  assert.equal((await c('POST', '/api/draws/today/toss', { date: day })).status, 400, '先摇签');
  const first = await c('POST', '/api/draws/today', { date: day, question: '换工作' });
  const uid = db.get("SELECT id FROM users WHERE username = 'jiaoer'").id;
  const set = (status, tosses, rounds = 1) => db.run('UPDATE draws SET status = ?, tosses = ?, rounds = ? WHERE user_id = ? AND day = ?', status, JSON.stringify(tosses), rounds, uid, day);
  const n = { sheng: 0, xiao: 0, yin: 0 };
  for (let i = 0; i < 400; i++) {
    set('pending', []);
    const r = await c('POST', '/api/draws/today/toss', { date: day });
    n[r.data.toss]++;
    if (r.data.toss !== 'sheng') assert.equal(r.data.draw.status, 'pending', '第一次没圣杯还能接着掷');
  }
  assert.ok(n.sheng > 150 && n.sheng < 250 && n.xiao > 60 && n.yin > 60, '圣杯大约一半：' + JSON.stringify(n));
  // 第三次：前两次阴杯，再掷出阴杯 → 换个问题；掷出笑杯 → 今天不再掷
  let reask, closed;
  for (let i = 0; i < 60 && !(reask && closed); i++) {
    set('pending', ['yin', 'yin']);
    const r = await c('POST', '/api/draws/today/toss', { date: day, question: '要不要换工作' });
    if (r.data.toss === 'yin') reask = r.data.draw;
    if (r.data.toss === 'xiao') closed = r.data.draw;
  }
  assert.equal(reask.status, 'reask', '三次都是阴杯：换个问题');
  assert.equal(reask.roundsLeft, 2);
  assert.equal(closed.status, 'closed', '三次没圣杯又不全是阴杯：不勉强');
  assert.equal(closed.question, '要不要换工作', '笑杯后可以把问题说清楚些');
  // 换个问题重新摇
  set('reask', ['yin', 'yin', 'yin']);
  assert.equal((await c('POST', '/api/draws/today', { date: day, question: '要不要换工作' })).status, 400, '要换一个问题');
  const again = await c('POST', '/api/draws/today', { date: day, question: '这周要不要找老板谈' });
  assert.equal(again.data.draw.status, 'pending');
  assert.equal(again.data.draw.round, 2);
  assert.equal(again.data.draw.tosses.length, 0);
  assert.equal(first.data.draw.no >= 1, true);
  set('reask', ['yin', 'yin', 'yin'], 3);
  assert.equal((await c('POST', '/api/draws/today', { date: day, question: '别的事' })).status, 409, '一天最多三轮');
  for (let i = 0; i < 60; i++) {
    set('pending', ['yin', 'yin'], 3);
    const r = await c('POST', '/api/draws/today/toss', { date: day });
    if (r.data.toss === 'yin') { assert.equal(r.data.draw.status, 'closed', '最后一轮三次阴杯就不再换'); break; }
  }
  assert.equal((await c('GET', '/api/draws')).data.list.length, 0, '没确认的签不进签谱');
  const t = await c('GET', '/api/today?date=' + day);
  assert.equal(t.data.jiao.maxTries, 3);
});

test('解签逐项运势：每类给星数、说明和建议；从问题认出的那类排第一；签谱缺项按签等', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'jieqian', password: '12345678', agree: true, birth });
  const day = bjDay();
  const uid = db.get("SELECT id FROM users WHERE username = 'jieqian'").id;
  await c('POST', '/api/draws/today', { date: day, question: '这周的面试能过吗' });
  const done = (no, q) => db.run(`UPDATE draws SET status = 'done', tosses = '["sheng"]', lot_no = ?, question = ? WHERE user_id = ? AND day = ?`, no, q, uid, day);
  done(57, '这周的面试能过吗');
  let d = (await c('GET', '/api/today?date=' + day)).data.draw;
  assert.deepEqual(d.jieqian, ['所用谋望', '皆大欢喜', '从公用力', '如子逢娘']);
  assert.equal(d.topics.length, 9);
  assert.equal(d.topics[0].key, 'work', '面试 → 事业工作排第一');
  assert.equal(d.topics[0].asked, true);
  assert.deepEqual(d.topics[0].items.map((x) => [x.k, x.v]), [['交易', '成']]);
  assert.equal(d.topics[0].stars, 4);
  assert.ok(d.topics[0].say && d.topics[0].tips.length >= 2, '每类有说明和建议');
  assert.ok(d.topics.every((t) => t.stars >= 1 && t.stars <= 5));
  assert.equal(d.topics.find((x) => x.key === 'move').stars, 3, '移徙守旧(3)、行人阻(2) 取平均');
  assert.match(d.topics.find((x) => x.key === 'health').note, /就医/);
  assert.equal(d.xianji.length, 15);
  done(57, '');
  d = (await c('GET', '/api/today?date=' + day)).data.draw;
  assert.ok(d.topics.every((t) => !t.asked) && d.topics[0].key === 'self', '没写问题就按默认顺序');
  done(78, '');
  d = (await c('GET', '/api/today?date=' + day)).data.draw;
  assert.equal(d.topics.find((x) => x.key === 'move').stars, 5, '移徙大吉');
  // 第86签签谱没有仙机：按签等（上签 → 4 星）
  done(86, '');
  d = (await c('GET', '/api/today?date=' + day)).data.draw;
  assert.ok(d.topics.every((x) => !x.items.length && x.stars === 4 && x.say.startsWith('签谱没有单列')));
  const list = (await c('GET', '/api/draws')).data.list;
  assert.equal(list[0].topics.length, 9);
});

test('规则对比', async () => {
  const c = client();
  await c('POST', '/api/admin/login', { username: 'admin', password: 'adminpass123' });
  const r = await c('GET', '/api/admin/compare?date=1992-06-08&time=09:20&gender=男&city=广州&y=2026&m=12');
  assert.equal(r.status, 200);
  assert.equal(r.data.days.length, 31);
  assert.equal(r.data.levels.v2.reduce((a, b) => a + b, 0), 31);
  assert.equal(r.data.current, 'v1');
  assert.equal((await c('GET', '/api/admin/compare?username=asker&y=2026&m=12')).data.who, 'asker');
});

test('转运御守：5 件善行换一枚；冥想累计 20 分钟换一枚；也可以直接买', async () => {
  const c = client();
  const bmonth = String((new Date(Date.now() + 8 * 3600000).getUTCMonth() + 1) % 12 + 1).padStart(2, '0'); // 下个月生日
  await c('POST', '/api/auth/register', { username: 'wisher', password: '12345678', agree: true, birth: { date: `1991-${bmonth}-15`, time: '08:00', gender: '女' } });
  const g = await c('GET', '/api/luck');
  assert.equal(g.status, 200);
  assert.equal(g.data.deeds.per, 5);
  assert.equal(g.data.deeds.unused, 0);
  assert.ok(g.data.release.steps.length >= 3 && g.data.meditate.minutes.length);
  assert.ok(g.data.amulets.looks.term.motif && g.data.amulets.looks.deed.colors.length === 2);
  assert.equal((await c('POST', '/api/deeds', { text: '' })).status, 400);
  for (const text of ['给爸妈打了个电话', '帮同事看了代码', '给外卖员说了谢谢']) assert.equal((await c('POST', '/api/deeds', { text })).status, 200);
  const four = await c('POST', '/api/deeds', { text: '让座' });
  assert.equal(four.status, 409, '一天最多 3 件');
  assert.equal((await c('POST', '/api/amulets/exchange', { wish: '事业' })).status, 409, '不够 5 件');
  // 挪两件到昨天，再记两件，凑满 5 件
  const uid = db.get("SELECT id FROM users WHERE username = 'wisher'").id;
  db.run("UPDATE deeds SET day = '2000-01-01' WHERE user_id = ?", uid);
  await c('POST', '/api/deeds', { text: '捐了一点钱' });
  const d5 = await c('POST', '/api/deeds', { text: '耐心听朋友说完' });
  assert.equal(d5.data.deeds.unused, 5);
  assert.equal((await c('GET', '/api/today?date=' + bjDay())).data.luck.unused, 5);
  const x = await c('POST', '/api/amulets/exchange', { wish: '事业' });
  assert.equal(x.status, 200);
  assert.equal(x.data.amulet.style, 'deed');
  assert.equal(x.data.deeds.unused, 0);
  assert.ok(x.data.deeds.list.every((r) => r.used));
  assert.equal((await c('DELETE', '/api/deeds/' + x.data.deeds.list[0].id)).status, 400, '换过的不能删');
  // 以前的玩法：静坐领基础款不行了（旧客户端会带 way）
  assert.equal((await c('POST', '/api/amulets', { wish: '平安', way: 'bowl', minutes: 1, style: 'basic' })).status, 400);
  assert.equal((await c('POST', '/api/amulets', { wish: '平安', style: 'birthday' })).status, 400, '不是生日月');
  const t = await c('POST', '/api/amulets', { wish: '平安', style: 'term' });
  assert.equal(t.status, 402);
  assert.equal(t.data.product, 'amulet');
  const o = await c('POST', '/api/pay/orders', { product: 'amulet' });
  assert.equal(o.data.order.amountCents, 390);
  paid.add(o.data.order.outTradeNo);
  assert.equal((await c('GET', `/api/pay/orders/${o.data.order.outTradeNo}?force=1`)).data.credits.amulet, 1);
  const t2 = await c('POST', '/api/amulets', { wish: '平安', style: 'term' });
  assert.equal(t2.status, 200);
  assert.equal(t2.data.amulet.look.term, g.data.amulets.term);
  assert.equal((await c('GET', '/api/amulets')).data.list.length, 2);
  // 提能量：冥想累计 20 分钟换一枚，释放练习每次算 3 分钟，多出来的留到下一枚
  assert.equal((await c('POST', '/api/practices', { kind: 'meditate', minutes: 10, way: 'bowl' })).status, 200);
  assert.equal((await c('POST', '/api/practices', { kind: 'meditate', minutes: 7 })).status, 400);
  const r = await c('POST', '/api/practices', { kind: 'release', before: 8, after: 3, rounds: 2 });
  assert.deepEqual(r.data.practice.week, { meditate: 1, release: 1 });
  assert.equal(r.data.practice.have, 13);
  assert.equal((await c('POST', '/api/practices', { kind: 'release', before: 11, after: 3 })).status, 400);
  assert.equal((await c('POST', '/api/amulets/exchange', { wish: '平安', by: 'energy' })).status, 409, '还差 7 分钟');
  await c('POST', '/api/practices', { kind: 'meditate', minutes: 10, way: 'incense' });
  const e = await c('POST', '/api/amulets/exchange', { wish: '平安', by: 'energy' });
  assert.equal(e.status, 200);
  assert.equal(e.data.amulet.style, 'energy');
  assert.equal(e.data.practice.have, 3, '23 分钟换掉 20，剩 3 分钟');
  assert.equal((await c('GET', '/api/today?date=' + bjDay())).data.luck.energy, 3);
  // 直接买一枚转运款
  const o2 = await c('POST', '/api/pay/orders', { product: 'amulet' });
  paid.add(o2.data.order.outTradeNo);
  await c('GET', `/api/pay/orders/${o2.data.order.outTradeNo}?force=1`);
  const b = await c('POST', '/api/amulets', { wish: '财运', style: 'basic' });
  assert.equal(b.status, 200);
  assert.equal(b.data.amulet.way, 'buy');
  assert.equal((await c('GET', '/api/amulets')).data.list.length, 4);
});

test('农历月份表：闰月和每月天数（出生日期滚轮用）', async () => {
  const lm = await client()('GET', '/api/lunar/months?y=2023');
  assert.equal(lm.data.months.length, 13);
  assert.deepEqual(lm.data.months[2], { m: 2, leap: true, days: 29 });
});

test('一甲子：每天打开收下当天日柱的画，集满 60 张送一枚特别款御守（只送一次）', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'jiazi', password: '12345678', agree: true, birth });
  const today = bjDay();
  let r = await c('GET', '/api/today?date=' + today);
  assert.equal(r.status, 200);
  assert.ok(r.data.arts && Object.keys(r.data.arts).length === 60, '今天的数据带 60 张画的对照表');
  assert.equal(r.data.arts[r.data.day.gz].art.startsWith('art/pillars/'), true);
  assert.deepEqual(r.data.jiazi, { n: 1, has: true, fresh: true, reward: false });
  r = await c('GET', '/api/today?date=' + today);
  assert.equal(r.data.jiazi.fresh, false, '同一天再打开不算新收');
  // 往前补 59 天的打开记录（收画按每天打开算）：连续 60 天正好是一整轮日柱
  const uid = db.get("SELECT id FROM users WHERE username='jiazi'").id;
  const base = Date.parse(today + 'T12:00:00Z');
  for (let k = 1; k < 60; k++) db.run('INSERT INTO open_days(user_id, day, created_at) VALUES(?,?,?)', uid, new Date(base - k * 86400000).toISOString().slice(0, 10), new Date().toISOString());
  const credits = db.get('SELECT amulet_credits n FROM users WHERE id = ?', uid).n;
  r = await c('GET', '/api/today?date=' + today);
  assert.equal(r.data.jiazi.n, 60);
  assert.equal(r.data.jiazi.reward, true, '第一次集满送御守');
  assert.equal(db.get('SELECT amulet_credits n FROM users WHERE id = ?', uid).n, credits + 1);
  r = await c('GET', '/api/today?date=' + today);
  assert.equal(r.data.jiazi.reward, false, '只送一次');
  const j = await c('GET', '/api/jiazi');
  assert.equal(j.data.list.length, 60);
  assert.equal(j.data.done, true);
  assert.ok(j.data.list.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day)));
  // 能量卡：出生那天的农历、月相、节气
  const card = (await client()('POST', '/api/preview/card', { birth: { date: '1992-06-08', time: '08:30', gender: '男' } })).data.card;
  assert.deepEqual(card.born, { lunar: '五月初八', moon: '上弦月', term: '芒种', days: 3 });
});

test('两个人的画：被邀请的朋友测完就能看；邀请人在邀请列表里看到每个朋友和自己的画', async () => {
  const a = client();
  await a('POST', '/api/auth/register', { username: 'pairer', password: '12345678', agree: true, birth });
  const code = (await a('GET', '/api/me/invite')).data.code;
  const friend = { date: '1992-06-08', time: '08:30', gender: '男' };
  const r = await client()('POST', '/api/pair', { birth: friend, code });
  assert.equal(r.status, 200);
  const p = r.data.pair;
  assert.ok(p.name && p.tag && p.line.startsWith('你是') && ['合', '同', '我生', '生我', '我克', '克我'].includes(p.kind));
  assert.equal((await fetch(base + '/' + p.art)).status, 200);
  const days = (Date.parse(r.data.best.date) - Date.parse(bjDay())) / 86400000;
  assert.ok(days >= 1 && days <= 14, '一起做事的日子在未来两周里');
  assert.equal((await client()('POST', '/api/pair', { birth: friend, code: 'XXXXX' })).status, 404);
  // 朋友注册后，两边都在「朋友的画」里看到同一张画，关系从各自的角度说
  const e = client();
  await e('POST', '/api/auth/register', { username: 'pairee', password: '12345678', agree: true, birth: friend, invite: code });
  const row = (await a('GET', '/api/friends')).data.list[0];
  assert.equal(row.src, 'invited');
  assert.equal(row.pair.name, p.name);
  assert.equal(row.pair.art, p.art);
  assert.equal(row.pair.best.date, r.data.best.date);
  const flip = { 我生: '生我', 生我: '我生', 我克: '克我', 克我: '我克', 合: '合', 同: '同' };
  assert.equal(row.pair.kind, flip[p.kind], '两边的关系方向相反');
  const back = (await e('GET', '/api/friends')).data.list[0];
  assert.equal(back.src, 'inviter', '被邀请的朋友也看得到');
  assert.equal(back.pair.kind, p.kind);
  // 已经注册的人点开朋友的链接：两人连上，互相看到（不重复、不算邀请）
  const g = client();
  await g('POST', '/api/auth/register', { username: 'pairlink', password: '12345678', agree: true, birth: { date: '1985-03-02', time: '14:00', gender: '女' } });
  const l = await g('POST', '/api/friends/link', { code });
  assert.equal(l.status, 200);
  assert.ok(l.data.pair && l.data.best);
  await g('POST', '/api/friends/link', { code });
  assert.equal((await g('GET', '/api/friends')).data.list.filter((x) => x.src === 'link').length, 1, '点两次只连一次');
  assert.equal((await a('GET', '/api/friends')).data.list.length, 2, '邀请人那边多了一位朋友');
  assert.equal((await a('GET', '/api/me/invite')).data.stats.invited, 1, '点链接连上的不算邀请');
  const selfCode = (await g('GET', '/api/me/invite')).data.code;
  assert.equal((await g('POST', '/api/friends/link', { code: selfCode })).status, 404, '不能和自己连');
});

test('收画和会员无关：免费体验用完也照样收下今天的画', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'freegone', password: '12345678', agree: true, birth });
  const uid = db.get("SELECT id FROM users WHERE username='freegone'").id;
  for (const k of [3, 4, 5]) db.run('INSERT INTO usage_days(user_id, day, created_at) VALUES(?,?,?)', uid, new Date(Date.parse(bjDay() + 'T12:00:00Z') - k * 86400000).toISOString().slice(0, 10), new Date().toISOString());
  const r = await c('GET', '/api/today?date=' + bjDay());
  assert.equal(r.status, 402, '体验用完，今天页锁住');
  assert.ok(r.data.art && r.data.art.art.startsWith('art/pillars/'), '锁住的页面也有今天的画');
  assert.equal(r.data.jiazi.has, true);
  assert.equal(r.data.jiazi.fresh, true);
  assert.equal((await c('GET', '/api/jiazi')).data.member, false);
});

test('月度回顾：这个月打开了几天、收了哪些画、心情、最顺的一天、最好的签、好事', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'recap', password: '12345678', agree: true, birth });
  const today = bjDay(), month = today.slice(0, 7);
  await c('GET', '/api/today?date=' + today);
  const uid = db.get("SELECT id FROM users WHERE username='recap'").id;
  db.run("UPDATE users SET created_at = ? WHERE id = ?", month + '-01T00:00:00.000Z', uid);
  const day1 = month + '-01';
  db.run('INSERT OR IGNORE INTO open_days(user_id, day, created_at) VALUES(?,?,?)', uid, day1, new Date().toISOString());
  db.run("INSERT INTO moods(user_id, day, mood, color, note, created_at) VALUES(?,?,?,?,?,?)", uid, day1, 'happy', 'apricot', '', new Date().toISOString());
  db.run("INSERT INTO draws(user_id, day, lot_no, question, status, tosses, created_at) VALUES(?,?,?,?,?,?,?)", uid, day1, 1, '', 'done', '["sheng"]', new Date().toISOString());
  db.run('INSERT INTO deeds(user_id, day, text, created_at) VALUES(?,?,?,?)', uid, day1, '帮同事搬东西', new Date().toISOString());
  const r = await c('GET', '/api/recap?month=' + month);
  assert.equal(r.status, 200);
  assert.equal(r.data.month, month);
  assert.equal(r.data.inProgress, true);
  assert.equal(r.data.opened, today === day1 ? 1 : 2);
  assert.ok(r.data.arts.length >= 1 && r.data.arts.every((x) => x.art.startsWith('art/pillars/')));
  assert.equal(r.data.lots, 1);
  assert.equal(r.data.bestLot.no, 1);
  assert.equal(r.data.deeds, 1);
  assert.ok(r.data.best && r.data.best.theme);
  assert.equal(r.data.moods[0].key, 'happy');
  // 注册之前的月份、以后的月份都回到这个月
  assert.equal((await c('GET', '/api/recap?month=2000-01')).data.month, month);
  assert.equal((await c('GET', '/api/recap?month=2999-01')).data.month, month);
});

test('节气：节气那天有一张节气卡，按五行说对你意味着什么', async () => {
  const { makeContent } = await import('../server/content.js');
  const { chart, jieqiOn } = await import('../server/engine.js');
  const C = makeContent(loadContent());
  assert.equal(jieqiOn('2026-12-07'), '大雪');
  assert.equal(jieqiOn('2026-11-25'), '');
  const c = chart({ date: '1990-10-19', time: '10:00', gender: '女' });
  const t = C.termCard('大雪', c);
  assert.equal(t.element, '水');
  assert.ok(t.line && t.mine.startsWith('大雪起，水当令'));
  assert.equal(t.kind, c.xi.includes(4) ? 'xi' : c.ji.includes(4) ? 'ji' : 'neutral');
  assert.equal((await fetch(base + '/' + t.art)).status, 200);
});

test('美国版（/us/）：页面能打开；英文内容和插画齐全；网页里的日柱算法和排盘一致；候补名单只收合法邮箱、不重复', async () => {
  const r = await fetch(base + '/us', { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/bazi/us/');
  const html = await (await fetch(base + '/us/')).text();
  assert.ok(html.includes('<title>Sixty'));
  const us = JSON.parse(fs.readFileSync(new URL('../public/us/content.json', import.meta.url)));
  assert.equal(us.pillars.length, 60);
  const art = (dir, f) => fs.existsSync(new URL(`../public/art/${dir}/${f}`, import.meta.url));
  for (const p of us.pillars) assert.ok(p.name && p.intro && art('pillars', p.art), p.cn);
  assert.equal(Object.keys(us.pairs).length, 55);
  for (const [k, p] of Object.entries(us.pairs)) assert.ok(p.name && art('pairs', p.art), k);
  for (const k of ['same', 'feeds', 'draws', 'yields', 'tests']) assert.ok(us.days[k]?.title, k);
  // 和 public/us/us.js 的 cycleIndex 同一个算法
  const { dayGz } = await import('../server/engine.js');
  const idx = (s) => { const [y, m, d] = s.split('-').map(Number); return ((Math.floor(Date.UTC(y, m - 1, d) / 864e5) + 17) % 60 + 60) % 60; };
  for (let k = -40000; k < 40000; k += 37) {
    const s = new Date(Date.UTC(2000, 0, 1) + k * 864e5).toISOString().slice(0, 10);
    assert.equal(us.pillars[idx(s)].cn, dayGz(s), s);
  }
  const c = client();
  assert.equal((await c('POST', '/api/us/waitlist', { email: 'not-an-email' })).status, 400);
  assert.equal((await c('POST', '/api/us/waitlist', { email: ' Amy@Example.com ', sign: 'guimao', ref: 'tiktok' })).status, 200);
  assert.equal((await c('POST', '/api/us/waitlist', { email: 'amy@example.com' })).status, 200);
  const rows = db.all('SELECT * FROM us_waitlist');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'amy@example.com');
  assert.equal(rows[0].sign, 'guimao');
});
