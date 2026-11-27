// 出生时间换算：出生地钟表时间 → 世界时 → 当地真太阳时；再看是否落在两个时辰的交界附近。
// 时区库自带历史偏移和夏令时（如中国 1986–1991 年），所以修正拆成三部分：夏令时、经度时差、均时差。
// 时区和夏令时用系统自带的时区库（Intl），均时差用 Meeus 公式。
import fs from 'node:fs';
import { isEn } from './i18n.js';

const MINUTE = 60000;
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
export const EDGE_MINUTES = 15;

export const CITIES = JSON.parse(fs.readFileSync(new URL('./cities.json', import.meta.url), 'utf8'));
const BY_NAME = new Map(CITIES.map((c) => [c.name, c]));
export const cityByName = (name) => BY_NAME.get(String(name || '').trim()) || null;
// 给人看的城市名和省份：英文界面用英文名（存的仍是 name）
export const cityLabel = (name) => { const c = cityByName(name); return c && isEn() ? c.en : (c ? c.name : name || null); };
export const cityView = (c) => ({ name: c.name, label: isEn() ? c.en : c.name, province: isEn() ? c.province_en : c.province, lng: c.lng });

// 城市联想：名字开头匹配的排前面，其次是名字或省份里包含
export function searchCities(q, limit = 8) {
  const s = String(q || '').trim();
  if (!s) return [];
  // 输入的是英文（拼音或英文名）就按英文名找，不分大小写
  const L = (x) => String(x || '').toLowerCase(), en = /[a-z]/i.test(s);
  const nm = (c) => (en ? L(c.en) : c.name), pv = (c) => (en ? L(c.province_en) : c.province), key = en ? L(s) : s;
  const head = CITIES.filter((c) => nm(c).startsWith(key));
  const rest = CITIES.filter((c) => !nm(c).startsWith(key) && (nm(c).includes(key) || pv(c).includes(key)));
  return head.concat(rest).slice(0, limit);
}

// 某时区在某个世界时刻的偏移（分钟），如 Asia/Shanghai → 480
export function zoneOffset(timeZone, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(utcMs));
  const name = (parts.find((p) => p.type === 'timeZoneName') || {}).value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// 时区里的钟表时间 → 世界时毫秒。偏移取决于时刻本身，所以迭代几次；跳过的夏令时小时取后一个偏移。
function wallToUtc({ year, month, day, hour, minute }, timeZone) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let utc = naive - zoneOffset(timeZone, naive) * MINUTE;
  for (let i = 0; i < 3; i++) {
    const next = naive - zoneOffset(timeZone, utc) * MINUTE;
    if (next === utc) break;
    utc = next;
  }
  return utc;
}

// 标准（非夏令时）偏移：一月和七月里较小的那个
function standardOffset(timeZone, year) {
  return Math.min(zoneOffset(timeZone, Date.UTC(year, 0, 15)), zoneOffset(timeZone, Date.UTC(year, 6, 15)));
}

// 均时差（真太阳时 − 平太阳时，分钟），Meeus 公式 28.3，误差几秒
function equationOfTime(utcMs) {
  const jd = utcMs / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const rad = Math.PI / 180;
  const l0 = ((280.46646 + 36000.76983 * t + 0.0003032 * t * t) % 360) * rad;
  const m = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * rad;
  const e = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t;
  const eps = (23.439291 - 0.0130042 * t) * rad;
  const y = Math.tan(eps / 2) ** 2;
  const E = y * Math.sin(2 * l0) - 2 * e * Math.sin(m) + 4 * e * y * Math.sin(m) * Math.cos(2 * l0)
    - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * e * e * Math.sin(2 * m);
  return (E / rad) * 4;
}

const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hmOf = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
const round1 = (n) => Math.round(n * 10) / 10;
// 时辰序号：子 0（23–01 点）… 亥 11
const zhiIndex = (mins) => Math.floor(((mins + 60) % 1440) / 120);
const RANGE = (i) => `${pad((i * 2 + 23) % 24)}–${pad((i * 2 + 1) % 24)}`;

// 换算出生时间。birth: { date, time, lng?, tz?, zhi? }
// 返回排盘真正用的日期和时间，以及给用户看的换算说明和时辰交界提示。
export function resolveBirth(birth) {
  const out = { date: birth.date, time: birth.time || null, solar: null, edge: null };
  if (!birth.time) return out;
  const [year, month, day] = birth.date.split('-').map(Number);
  const [hour, minute] = birth.time.split(':').map(Number);
  let base = Date.UTC(year, month - 1, day, hour, minute); // 用来排盘的“当地时间”，按 UTC 字段读写
  if (typeof birth.lng === 'number' && Number.isFinite(birth.lng)) {
    const tz = birth.tz || 'Asia/Shanghai';
    const utc = wallToUtc({ year, month, day, hour, minute }, tz);
    const offset = zoneOffset(tz, utc);
    const dst = offset - standardOffset(tz, year);
    const eot = equationOfTime(utc);
    base = Math.round((utc + (birth.lng * 4 + eot) * MINUTE) / MINUTE) * MINUTE;
    const t = new Date(base);
    out.solar = {
      time: hmOf(t), date: ymdOf(t), clock: birth.time,
      dstMinutes: dst, lngMinutes: round1(birth.lng * 4 - offset + dst), eotMinutes: round1(eot),
    };
  }
  // 时辰交界：离最近的奇数整点（时辰分界）不到 15 分钟
  const t = new Date(base), mins = t.getUTCHours() * 60 + t.getUTCMinutes();
  const boundary = Math.round((mins - 60) / 120) * 120 + 60; // 最近的分界点（分钟，可能是 -60 或 1500）
  const dist = Math.abs(mins - boundary);
  if (dist <= EDGE_MINUTES) {
    const a = zhiIndex(boundary - 1), b = zhiIndex(boundary + 1), cur = zhiIndex(mins);
    out.edge = { before: ZHI[a], after: ZHI[b], beforeRange: RANGE(a), afterRange: RANGE(b), current: ZHI[cur], minutes: dist };
    // 用户选了另一边：把时间挪到分界线的另一侧 1 分钟，只改时柱
    const pick = birth.zhi && ZHI.indexOf(birth.zhi);
    if (pick === a && cur !== a) base += (boundary - 1 - mins) * MINUTE;
    if (pick === b && cur !== b) base += (boundary + 1 - mins) * MINUTE;
    out.edge.picked = ZHI[zhiIndex(new Date(base).getUTCHours() * 60 + new Date(base).getUTCMinutes())];
  }
  const e = new Date(base);
  out.date = ymdOf(e); out.time = hmOf(e);
  return out;
}
