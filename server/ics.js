// 手机日历订阅（iCalendar）：未来 60 天每天一条全天日程，定了时段的计划是一条带时间的日程。
// 手机日历按自己的节奏来拉，所以每次请求现算。
import { dayOut } from './engine.js';
import { ACT, hhShort, bestHours, dosDonts } from '../public/js/data.js';

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const dateVal = (y, m, d) => `${y}${pad(m)}${pad(d)}`;
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const escText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// 每行不超过 75 个字节，续行以空格开头（按 UTF-8 字节切，不切断汉字）
function fold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const act = (x) => (x.level.k <= 1 ? '休整' : ACT[x.ssG]);
const short = (items) => items.map((s) => s.split(/[、，（]/)[0]).join('、');

// 一天的日程标题和备注（订阅页的预览也用它）
export function dayEvent(c, C, y, m, d) {
  const x = dayOut(c, y, m, d, true);
  const { top } = bestHours(x);
  const { dos, donts } = dosDonts(x, false);
  return {
    y, m, d, level: x.level.k,
    summary: `${x.level.p} · ${act(x)}${top[0] ? ' · ' + hhShort(top[0].i) : ''}`,
    desc: `${C.dailyLine(c, x).head}\n${C.dailyLine(c, x).why}\n宜 ${short(dos.slice(0, 3))}\n忌 ${short(donts.slice(0, 2))}`,
  };
}

export function buildIcs({ c, C, userId, name, today, plans, expired, url, days = 60 }) {
  const now = stamp(Date.now());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MindFlow//流日历//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escText('流日历' + (name ? ' · ' + name : ''))}`, 'X-WR-TIMEZONE:Asia/Shanghai',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  const allDay = (uid, y, m, d, summary, desc) => {
    const next = new Date(Date.UTC(y, m - 1, d) + DAY_MS);
    L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${dateVal(y, m, d)}`,
      `DTEND;VALUE=DATE:${dateVal(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())}`,
      `SUMMARY:${escText(summary)}`, `DESCRIPTION:${escText(desc)}`, 'TRANSP:TRANSPARENT', `URL:${url}`, 'END:VEVENT');
  };
  const [ty, tm, td] = today.split('-').map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  if (expired) {
    allDay(`expired-${userId}@mindflow.zone`, ty, tm, td, '流日历会员已到期', '续费后，这里会恢复每天的安排。\n' + url);
  } else {
    for (let k = 0; k < days; k++) {
      const dt = new Date(t0 + k * DAY_MS), y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
      const e = dayEvent(c, C, y, m, d);
      allDay(`day-${dateVal(y, m, d)}-${userId}@mindflow.zone`, y, m, d, e.summary, e.desc + '\n\n仅供娱乐参考');
    }
    for (const p of plans) {
      if (!p.date) continue;
      const [y, m, d] = p.date.split('-').map(Number);
      if (Date.UTC(y, m - 1, d) < t0) continue;
      if (p.hour == null) { allDay(`plan-${p.id}@mindflow.zone`, y, m, d, '📌 ' + p.name, p.reason || ''); continue; }
      // 时辰按北京时间：第 i 个时辰从 (2i+23)%24 点开始，子时跨到前一天晚上
      const startH = (p.hour * 2 + 23) % 24;
      const start = Date.UTC(y, m - 1, d, startH, 0) - 8 * 3600000 - (p.hour === 0 ? DAY_MS : 0);
      L.push('BEGIN:VEVENT', `UID:plan-${p.id}@mindflow.zone`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + 2 * 3600000)}`,
        `SUMMARY:${escText('📌 ' + p.name)}`, `DESCRIPTION:${escText(p.reason || '')}`, `URL:${url}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(p.name)}`, 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT');
    }
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
