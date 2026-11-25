// 美国版（/us/）的计算接口：不存任何东西，请求里带出生信息，算完就返回。
// 文字由前台用 public/us/content.json 翻成英文，这里只给结构化结果（干支、十神、分数、时辰）。
import { chart, dayOut } from './engine.js';
import { pickDays } from './pick.js';
import { bestHours } from '../public/js/data.js';
import crypto from 'node:crypto';
import { makeGumroad } from './gumroad.js';

// 前台的事项 key → content/pick.json 里的事项名
export const US_PICK = { present: '汇报', interview: '面试', negotiate: '谈判', sign: '签约', open: '开业', move: '搬家', travel: '出行', date: '约会', launch: '发布', rest: '休息' };

const DAY_MS = 86400000;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

// Sixty Plus 每期给的天数：比计费周期多两天，Gumroad 续费的 Ping 晚到一点也不会断
const PLAN_DAYS = { monthly: 32, yearly: 367 };
const nowIso = () => new Date().toISOString();
const addDaysIso = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

export function registerUs({ route, limit, bad, HttpError, content: C, db, env = process.env, log = console }) {
  const gumroad = makeGumroad(env);
  // 测试期：US_PLUS_FOR_ALL=1 时所有人都是 Plus，付款入口不出现；关掉开关重启就恢复收费
  const plusForAll = env.US_PLUS_FOR_ALL === '1';
  // 有没有 Plus：浏览器带着 token 来，订单已付且没过期
  const plusOf = (token) => {
    if (plusForAll) return { plan: 'beta', paid_until: null, email: null };
    if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) return null;
    return db.get("SELECT * FROM us_orders WHERE token = ? AND status = 'paid' AND paid_until > ?", token, nowIso()) || null;
  };
  const needPlus = (body) => { if (!plusOf(body.plus)) throw new HttpError(402, 'This is part of Sixty Plus.', { error: 'plus' }); };
  // 免费：今天前后几天的详解（朋友一起做事的日子看 14 天）；整月、任意日子、挑日子、深度排盘要 Plus
  const freeRange = (from, n) => {
    const t = Date.parse(from + 'T00:00:00Z'), now = Date.now();
    return n <= 14 && t >= now - 2 * DAY_MS && t <= now + 2 * DAY_MS;
  };
  // 出生信息：日期必填；时间、出生地（经度 + 时区）、性别（只用来定大运方向）都可选
  function birthOf(b) {
    b = b && typeof b === 'object' ? b : {};
    if (!isDate(b.date) || b.date < '1900-01-01' || b.date > '2100-12-31') throw bad('Please enter a valid birthday.');
    const out = { date: b.date, gender: b.sex === 'f' ? '女' : '男' };
    if (b.time != null && b.time !== '') {
      if (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) throw bad('Please enter a valid birth time.');
      out.time = b.time;
      if (b.lng != null) {
        const lng = Number(b.lng);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw bad('Unknown birth place.');
        try { new Intl.DateTimeFormat('en-US', { timeZone: String(b.tz) }); } catch { throw bad('Unknown birth place.'); }
        out.lng = lng; out.tz = String(b.tz);
      }
    }
    return { birth: out, hasSex: b.sex === 'f' || b.sex === 'm' };
  }
  const gate = (ip) => { if (!limit('us:' + ip, 600, 3600000)) throw new HttpError(429, 'Too many requests. Please try again later.'); };
  const dayRow = (c, t, withHours) => {
    const dt = new Date(t), x = dayOut(c, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), withHours);
    const row = { date: ymd(t), gz: x.gz, ssG: x.ssG, ssZ: x.ssZ, score: x.score, k: x.level.k, chong: x.chongDay };
    if (withHours) {
      const b = bestHours(x);
      row.hours = x.hours.map((h) => ({ i: h.i, score: h.score }));
      row.best = b.top.map((h) => h.i); row.worst = b.worst ? b.worst.i : null;
    }
    return row;
  };

  // 排盘：四柱（没填时间就三柱）、五行力量、身强身弱、喜忌、大运（填了性别才给）
  route('POST', '/api/us/chart', async ({ body, ip }) => {
    gate(ip);
    const { birth, hasSex } = birthOf(body.birth);
    const c = chart(birth);
    const out = { pillars: c.pillars, dm: c.dm, xi: c.xi, solar: c.birth?.solar || null, plus: !!plusOf(body.plus) };
    if (!out.plus) return out;
    return {
      ...out, strong: c.strong, selfPct: Math.round(c.selfPct * 100),
      force: c.force.map((v) => Math.round(v * 10) / 10), ji: c.ji,
      luck: hasSex ? { startAge: c.startAge, cycles: c.dayuns.slice(0, 8).map((d) => ({ gz: d.gz, from: d.startYear, to: d.endYear })) } : null,
    };
  });

  // 一段日子的每日详解（最多 42 天，月历一屏）：分数、档位、十神；hours=1 时带十二时辰和最好的时段
  route('POST', '/api/us/days', async ({ body, ip }) => {
    gate(ip);
    const { birth } = birthOf(body.birth);
    if (!isDate(body.from)) throw bad('Bad date.');
    const n = Math.min(42, Math.max(1, parseInt(body.n, 10) || 1));
    if (!freeRange(body.from, n)) needPlus(body);
    const c = chart(birth), start = Date.parse(body.from + 'T00:00:00Z');
    const days = [];
    for (let k = 0; k < n; k++) days.push(dayRow(c, start + k * DAY_MS, !!body.hours));
    return { days };
  });

  // 挑日子：从 today 的第二天起，在 2 周 / 1 个月 / 3 个月里挑 3 天
  route('POST', '/api/us/pick', async ({ body, ip }) => {
    gate(ip);
    const { birth } = birthOf(body.birth);
    needPlus(body);
    const type = C.pickType(US_PICK[body.type]);
    if (!type) throw bad('Pick something to plan.');
    if (!isDate(body.today)) throw bad('Bad date.');
    const range = ['2w', '1m', '3m'].includes(body.range) ? body.range : '1m';
    const r = pickDays(chart(birth), type, C.pick.all_ji, body.today, range);
    return {
      picks: r.picks.map((p) => ({ date: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`, ssG: p.ssG, k: p.level.k, score: p.score, fit: p.fit, hours: p.hours })),
      best: r.best, days: r.days, candidates: r.candidates,
    };
  });

  // ----- Sixty Plus：Gumroad 付款（同一个商品，订单号 SXT 开头；Ping 由中文版服务按 ref 转发过来）-----
  const prices = () => (gumroad ? { monthly: gumroad.plans.monthly.cents, yearly: gumroad.plans.yearly.cents } : null);
  const statusOut = (o) => (o ? { plus: true, plan: o.plan, until: o.paid_until, email: o.email || null, beta: plusForAll } : { plus: false });

  route('GET', '/api/us/pay/status', async ({ q }) => {
    const token = q.get('token') || '';
    const o = plusOf(token);
    const pending = !o && /^[a-f0-9]{48}$/.test(token) ? db.get('SELECT status FROM us_orders WHERE token = ?', token) : null;
    return { ...statusOut(o), pending: pending?.status === 'pending', prices: prices() };
  });

  route('POST', '/api/us/pay/start', async ({ body, ip }) => {
    if (!gumroad) throw new HttpError(503, 'Payments are not available right now.');
    if (!limit('usp:' + ip, 20, 3600000)) throw new HttpError(429, 'Too many tries. Please try again later.');
    const plan = body.plan === 'yearly' ? 'yearly' : 'monthly';
    const t = nowIso(), ref = 'SXT' + t.replace(/\D/g, '').slice(0, 14) + crypto.randomBytes(3).toString('hex');
    const token = crypto.randomBytes(24).toString('hex');
    db.run('INSERT INTO us_orders(ref, token, plan, created_at) VALUES(?,?,?,?)', ref, token, plan, t);
    return { ref, token, url: gumroad.checkoutUrl({ ref, plan }) };
  });

  // 换设备：用 Gumroad 收据里的 license key 找回
  route('POST', '/api/us/pay/restore', async ({ body, ip }) => {
    if (!limit('usr:' + ip, 10, 3600000)) throw new HttpError(429, 'Too many tries. Please try again later.');
    const key = String(body.key || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{16,64}$/.test(key)) throw bad('Please paste the license key from your receipt.');
    const o = db.get("SELECT * FROM us_orders WHERE license_key = ? AND status = 'paid' ORDER BY paid_at DESC LIMIT 1", key);
    if (!o) throw new HttpError(404, 'We could not find that key. Check your Gumroad receipt and try again.');
    if (!(o.paid_until > nowIso())) throw new HttpError(410, 'That subscription has ended.');
    return { token: o.token, ...statusOut(o) };
  });

  async function onPing(p, raw) {
    const saleId = p.get('sale_id'), resource = p.get('resource_name') || 'sale';
    if (!saleId || p.get('product_id') !== gumroad.productId) { log.info(`[us-pay] 忽略 ${saleId || '无 sale_id'}`); return; }
    const sale = await gumroad.sale(saleId).catch((e) => { log.error(`[us-pay] ${e.message}`); return null; });
    if (sale && sale.missing) { log.error(`[us-pay] 回查不到订单 ${saleId}`); return; }
    if (resource === 'refund' || resource === 'dispute') {
      const o = db.get('SELECT * FROM us_orders WHERE sale_id = ?', saleId);
      if (!o) { log.error(`[us-pay] ${resource} ${saleId} 没有对应订单`); return; }
      db.run("UPDATE us_orders SET status = 'refunded', paid_until = ? WHERE ref = ?", nowIso(), o.ref);
      log.info(`[us-pay] ${resource} ${saleId} 已收回 ${o.ref}`);
      return;
    }
    if (resource !== 'sale' || db.get('SELECT 1 x FROM us_orders WHERE sale_id = ?', saleId)) return;
    const ref = p.get('url_params[ref]') || '', subId = p.get('subscription_id') || null;
    const plan = p.get('recurrence') === 'yearly' ? 'yearly' : 'monthly', until = addDaysIso(PLAN_DAYS[plan]);
    const fields = [saleId, subId, p.get('email') || null, (p.get('license_key') || '').toUpperCase() || null, until, nowIso(), raw.slice(0, 4000)];
    const first = ref.startsWith('SXT') && db.get("SELECT * FROM us_orders WHERE ref = ? AND status = 'pending'", ref);
    if (first) {
      db.run("UPDATE us_orders SET status = 'paid', sale_id = ?, sub_id = ?, email = ?, license_key = ?, paid_until = ?, paid_at = ?, raw = ? WHERE ref = ?", ...fields, ref);
      log.info(`[us-pay] 已开通 ${ref} sale=${saleId} ${plan}${p.get('test') === 'true' ? ' 测试单' : ''}`);
      return;
    }
    // 续费：同一个订阅，延长原来那张订单（浏览器里的 token 不变）
    const prev = subId && db.get("SELECT * FROM us_orders WHERE sub_id = ? AND status = 'paid' ORDER BY paid_at DESC LIMIT 1", subId);
    if (!prev) { log.error(`[us-pay] 订单 ${saleId} 找不到对应的 Sixty 订单（ref=${ref || '无'} 订阅 ${subId || '无'}），需人工处理`); return; }
    db.run('UPDATE us_orders SET sale_id = ?, paid_until = ?, paid_at = ?, raw = ? WHERE ref = ?', saleId, until, nowIso(), raw.slice(0, 4000), prev.ref);
    log.info(`[us-pay] 已续费 ${prev.ref} sale=${saleId} 到 ${until.slice(0, 10)}`);
  }
  route('POST', '/api/us/pay/ping', async ({ req, rawBody }) => {
    if (!gumroad) throw new HttpError(404, 'Not found');
    if (!gumroad.verify(rawBody, req.headers['x-gumroad-signature'])) { log.error('[us-pay] Ping 验签失败'); throw new HttpError(400, 'bad signature'); }
    const p = new URLSearchParams(rawBody);
    setImmediate(() => onPing(p, rawBody).catch((e) => log.error(`[us-pay] 处理 Ping 出错 ${p.get('sale_id')}: ${e.message}`)));
    return { __text: 'ok' };
  });
}
