// 美国版（/us/）的计算接口：不存任何东西，请求里带出生信息，算完就返回。
// 文字由前台用 public/us/content.json 翻成英文，这里只给结构化结果（干支、十神、分数、时辰）。
import { chart, dayOut } from './engine.js';
import { pickDays } from './pick.js';
import { bestHours } from '../public/js/data.js';

// 前台的事项 key → content/pick.json 里的事项名
export const US_PICK = { present: '汇报', interview: '面试', negotiate: '谈判', sign: '签约', open: '开业', move: '搬家', travel: '出行', date: '约会', launch: '发布', rest: '休息' };

const DAY_MS = 86400000;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

export function registerUs({ route, limit, bad, HttpError, content: C }) {
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
    return {
      pillars: c.pillars, dm: c.dm, strong: c.strong, selfPct: Math.round(c.selfPct * 100),
      force: c.force.map((v) => Math.round(v * 10) / 10), xi: c.xi, ji: c.ji,
      solar: c.birth?.solar || null,
      luck: hasSex ? { startAge: c.startAge, cycles: c.dayuns.slice(0, 8).map((d) => ({ gz: d.gz, from: d.startYear, to: d.endYear })) } : null,
    };
  });

  // 一段日子的每日详解（最多 42 天，月历一屏）：分数、档位、十神；hours=1 时带十二时辰和最好的时段
  route('POST', '/api/us/days', async ({ body, ip }) => {
    gate(ip);
    const { birth } = birthOf(body.birth);
    if (!isDate(body.from)) throw bad('Bad date.');
    const n = Math.min(42, Math.max(1, parseInt(body.n, 10) || 1));
    const c = chart(birth), start = Date.parse(body.from + 'T00:00:00Z');
    const days = [];
    for (let k = 0; k < n; k++) days.push(dayRow(c, start + k * DAY_MS, !!body.hours));
    return { days };
  });

  // 挑日子：从 today 的第二天起，在 2 周 / 1 个月 / 3 个月里挑 3 天
  route('POST', '/api/us/pick', async ({ body, ip }) => {
    gate(ip);
    const { birth } = birthOf(body.birth);
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
}
