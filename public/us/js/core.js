// Shared pieces for Sixty (US). The backend is the same as the Chinese edition; this file turns its
// structured answers (stems, ten gods, levels, hours) into English using content.json.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
export const EL = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
export const WX = { 木: 'Wood', 火: 'Fire', 土: 'Earth', 金: 'Metal', 水: 'Water' };
export const ZHI_EL = ['Water', 'Earth', 'Wood', 'Wood', 'Earth', 'Fire', 'Fire', 'Earth', 'Metal', 'Metal', 'Earth', 'Water'];
export const ANIMAL = 'Rat Ox Tiger Rabbit Dragon Snake Horse Goat Monkey Rooster Dog Pig'.split(' ');
export const STEM_PY = 'Jiǎ Yǐ Bǐng Dīng Wù Jǐ Gēng Xīn Rén Guǐ'.split(' ');
export const MONTHS = 'January February March April May June July August September October November December'.split(' ');
export const WEEK = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ');
export const WEEK_LONG = 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday'.split(' ');
export const SITE = 'mindflow.zone/sixty';
export const S = { C: null, me: null, today: null }; // content, /api/me, last /api/today

// ---------- dates ----------
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const t = parse(s); t.setDate(t.getDate() + n); return iso(t); };
export const localDay = (n = 0) => addDays(iso(new Date()), n);
export const ymd = (o) => `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
export function fmt(s, style = 'short') {
  const t = parse(s), m = MONTHS[t.getMonth()];
  if (style === 'long') return `${m} ${t.getDate()}, ${t.getFullYear()}`;
  if (style === 'full') return `${WEEK_LONG[t.getDay()]}, ${m} ${t.getDate()}`;
  if (style === 'md') return `${m.slice(0, 3)} ${t.getDate()}`;
  return `${WEEK[t.getDay()]}, ${m.slice(0, 3)} ${t.getDate()}`;
}
const clock = (h) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
// the 12 two-hour blocks: block 0 is 11 PM – 1 AM
export const hourRange = (i) => { const a = (i * 2 + 23) % 24, b = (a + 2) % 24; return (a < 12) === (b < 12) && b !== 0 ? `${a % 12 || 12}–${clock(b)}` : `${clock(a)}–${clock(b)}`; };
export const hourNow = () => Math.floor(((new Date().getHours() + 1) % 24) / 2);

// ---------- signs ----------
export const cycleIndex = (s) => { const [y, m, d] = s.split('-').map(Number); return ((Math.floor(Date.UTC(y, m - 1, d) / 864e5) + 17) % 60 + 60) % 60; };
export const pillarOf = (s) => S.C.pillars[cycleIndex(s)];
export const byGz = (gz) => S.C.pillars.find((p) => p.cn === gz);
export const bySlug = (slug) => S.C.pillars.find((p) => p.slug === slug);
export const stemOf = (p) => S.C.stems[p.stem];
export const elOf = (p) => stemOf(p).element;
export const signName = (p) => `${elOf(p)} ${p.animal}`;
export const aSign = (p) => `${/^[AEIOU]/.test(elOf(p)) ? 'an' : 'a'} ${signName(p)}`;
export const fullName = (p) => `${stemOf(p).polarity} ${elOf(p)} ${p.animal}`;
export const gzName = (gz) => { const g = GAN.indexOf(gz[0]), z = ZHI.indexOf(gz[1]); return `${g % 2 ? 'Yin' : 'Yang'} ${EL[g >> 1]} ${ANIMAL[z]}`; };
export const art = (p) => `../art/pillars/${p.art}`;
export const artOf = (gz) => art(byGz(gz));
export const elStyle = (el) => `--el:${S.C.elements[el].color};--el-tint:${S.C.elements[el].tint}`;
export const level = (k) => S.C.levels[k];
// a day's theme depends on its Ten God and whether the day's element fuels you (xi) or drains you (ji)
// three wordings each, rotated by date so the same day always reads the same (the calendar feed uses the same rule)
export const theme = (ten, tone, date) => { const a = S.C.themes[ten][tone === 'ji' ? 'ji' : 'xi']; return a[date ? cycleIndex(date) % a.length : 0]; };
export const toneOf = (chart, gz) => { const e = GAN.indexOf(gz[0]) >> 1; return chart?.xi?.includes(e) ? 'xi' : chart?.ji?.includes(e) ? 'ji' : 'neutral'; };
export const tenName = (ten) => S.C.tenGods[ten]?.[0] || ten;
export const tenFull = (ten) => (S.C.tenGods[ten] ? `${S.C.tenGods[ten][0]} (${S.C.tenGods[ten][1]} · ${ten})` : ten);

// One reason from the engine, in English. The engine's own note ("t") stays as the small print.
const SLOT = { 年: 'birth year', 月: 'birth month', 日: 'birth day', 时: 'birth hour' };
export function whyEn(w) {
  const t = w.t || '';
  let m = t.match(/^(日|时)([干支])(.)（(.)）为(.{2})，属(喜用|忌神)/) || t.match(/^(日|时)([干支])(.)·(.{2})/);
  if (m && m.length === 7) {
    const part = m[2] === '干' ? 'main' : 'underlying', what = m[1] === '日' ? "Today's" : "This hour's";
    return `${what} ${part} energy is ${WX[m[4]]} — ${tenFull(m[5])} for you. ${m[6] === '喜用' ? 'It fuels you.' : 'It drains you a little.'}`;
  }
  if (m) return `${m[1] === '时' ? "This hour's" : "Today's"} ${m[2] === '干' ? 'main' : 'underlying'} energy: ${tenFull(m[4])}.`;
  if (/合日主/.test(t)) return 'Today’s energy pairs with yours — rapport and help come easily.';
  const slot = (t.match(/原局(.)支/) || [])[1];
  const where = slot ? ` with your ${SLOT[slot]}` : '';
  if (/六合|半合|三合/.test(t)) return `In harmony${where || ' with your chart'}.`;
  if (/冲/.test(t)) return `Clashes${where} — expect a jolt.`;
  if (/刑/.test(t)) return `Some tension${where}.`;
  if (/害|破/.test(t)) return `A little friction${where}.`;
  if (/贵人/.test(t)) return 'A helper day: support shows up when you ask.';
  if (/黑道/.test(t)) return 'A traditionally quiet hour in the old almanac.';
  if (/黄道/.test(t)) return 'A traditionally lucky hour in the old almanac.';
  return null;
}
export const whyList = (why, n = 6) => why.map((w) => ({ v: w.v, en: whyEn(w), t: w.t })).filter((x) => x.en).slice(0, n);
// lucky colors from the engine's pick (an element), in English
export const luckyEl = (outfit) => WX[outfit?.element] || 'Earth';

// ---------- storage, api ----------
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('sixty.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('sixty.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('sixty.' + k); } catch {} },
};
// The server speaks Chinese in its error messages; the common ones get an English line here.
const ERR = [[/用户名或密码/, 'Wrong email or password.'], [/已经被用了/, 'That email already has an account. Try signing in.'], [/密码至少/, 'Use at least 8 characters for your password.'],
  [/用户名需/, 'Please enter a valid email.'], [/出生日期/, 'Please enter a valid birthday.'], [/城市/, 'Pick a birth place from the list.'], [/太频繁|稍后/, 'Too many tries. Please wait a moment.'],
  [/登录/, 'Please sign in again.'], [/邀请链接已失效|链接已失效/, 'This link has expired.'], [/称呼/, 'Please use a shorter name (12 characters or fewer).'],
  [/连得有点多|提交得有点多|今天.*多了/, "That's a lot for one day — please try again tomorrow."], [/先摇一支签/, 'Draw a lot first.'], [/日期不对/, 'That date is out of range.']];
// the server works out "today" in your own time zone
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
// public links (with link previews): /sixty/s/<sign>, /sixty/i/<invite code>
export const shareBase = () => location.origin + location.pathname.replace(/us\/(index\.html)?$/, '');
export const ageOf = (date) => { const [y, m, d] = date.split('-').map(Number), n = new Date(); return n.getFullYear() - y - (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d) ? 1 : 0); };
export class ApiError extends Error { constructor(status, data) { super(ERR.find(([r]) => r.test(data?.message || ''))?.[1] || (status >= 500 ? 'Something went wrong. Please try again.' : data?.message && !/[一-鿿]/.test(data.message) ? data.message : 'Something went wrong.')); this.status = status; this.code = data?.error; } }
export async function api(method, path, body) {
  const headers = { 'X-TZ': TZ, ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const r = await fetch('../api/' + path, { method, credentials: 'same-origin', headers, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, d);
  return d;
}

// ---------- analytics ----------
const anon = () => { let a = store.get('anon'); if (!a) { a = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('anon', a); } return a; };
export const anonId = anon;
export const SRC = (new URLSearchParams(location.search).get('src') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
let queue = [], timer;
export function track(name, props = {}) { queue.push({ name, props: { ...props, src: SRC || undefined } }); clearTimeout(timer); timer = setTimeout(flush, 1200); }
function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ anonId: anon(), events: queue.splice(0, 30) });
  if (navigator.sendBeacon) navigator.sendBeacon('../api/events', new Blob([body], { type: 'application/json' }));
  else fetch('../api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
addEventListener('pagehide', flush);

// ---------- feedback ----------
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch {} };
export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }
// count a number up (for scores and stats)
export function countUp(el, to, ms = 900) {
  if (!el) return;
  if (reduced()) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- sheet ----------
export function openSheet(html, cls = '') {
  const s = $('#sheet'); s.innerHTML = `<div class="panel ${cls}" role="dialog" aria-modal="true">${html}</div>`; s.hidden = false;
  document.body.style.overflow = 'hidden';
  s.querySelector('.x')?.addEventListener('click', closeSheet);
  return s.querySelector('.panel');
}
export function closeSheet() { const s = $('#sheet'); if (s.hidden) return; s.hidden = true; s.innerHTML = ''; document.body.style.overflow = ''; }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// ---------- small html helpers ----------
export const loading = (h = 120) => `<div class="skeleton" style="height:${h}px"></div>`;
export const failed = (msg) => `<div class="card"><p class="muted" style="margin:0">${esc(msg)}</p><button class="btn ghost block" style="margin-top:12px" onclick="location.reload()">Try again</button></div>`;
export const chipEl = (el, text) => `<span class="chip el" style="${elStyle(el)}"><span class="dot"></span>${esc(text || el)}</span>`;
export function ring(score, size = 78) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, f = Math.max(0.04, Math.min(1, score / 100));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--soft)" stroke-width="7"/>
    <circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--lv)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" style="--c:${c}"/></svg><b data-count="${score}">${score}</b></div>`;
}
// birthday input that formats as MM / DD / YYYY and accepts autofill
export function readBirthday(v) {
  let y, m, d;
  v = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) [y, m, d] = v.split('-').map(Number);
  else { const n = v.replace(/\D/g, ''); if (n.length === 8) { m = +n.slice(0, 2); d = +n.slice(2, 4); y = +n.slice(4); } }
  const t = y && new Date(y, m - 1, d);
  if (!t || t.getMonth() !== m - 1 || t.getDate() !== d) return { err: 'Please enter a real date, like 03 / 14 / 1992.' };
  const s = iso(t);
  if (y < 1902 || s > localDay()) return { err: 'Please enter a birthday between 1902 and today.' };
  return { date: s };
}
export function maskBirthday(input) {
  input.addEventListener('input', () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
    const d = input.value.replace(/\D/g, '').slice(0, 8);
    input.value = d.length > 4 ? `${d.slice(0, 2)} / ${d.slice(2, 4)} / ${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
  });
}
export const birthdayValue = (date) => (date ? `${date.slice(5, 7)} / ${date.slice(8)} / ${date.slice(0, 4)}` : '');

// ---------- sound: tiny sounds made on the fly (no audio files); off in Me → Settings ----------
let AC = null;
const ac = () => (AC = AC || new (window.AudioContext || window.webkitAudioContext)());
export const soundOn = () => store.get('sound') !== 0;
// browsers only allow sound after a tap: unlock the audio on the first touch
addEventListener('pointerdown', () => { try { if (soundOn()) { const a = ac(); if (a.state === 'suspended') a.resume(); } } catch {} }, { passive: true });
function noise(sec, shape) {
  const a = ac(), n = Math.floor(a.sampleRate * sec), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * shape(i / n);
  const src = a.createBufferSource(); src.buffer = buf; return src;
}
export function sfx(name) {
  if (!soundOn() || reduced()) return;
  try {
    const a = ac(), out = a.createGain(); out.connect(a.destination);
    if (a.state === 'suspended') a.resume().catch(() => {});
    if (name === 'tear') { // paper ripping: crackly filtered noise
      const s = noise(0.35, (k) => Math.pow(1 - k, 1.6) * (Math.random() < 0.3 ? 1 : 0.35)), f = a.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.7; out.gain.value = 0.45; s.connect(f).connect(out); s.start();
    } else if (name === 'clack') { // two wooden blocks landing
      [0, 0.09].forEach((t, i) => { const s = noise(0.07, (k) => Math.pow(1 - k, 4)), f = a.createBiquadFilter(), g = a.createGain();
        f.type = 'bandpass'; f.frequency.value = 900 + i * 260; f.Q.value = 6; g.gain.value = 0.9; s.connect(f).connect(g).connect(out); s.start(a.currentTime + t); });
    } else if (name === 'chime') { // a soft bell for collecting and readings
      [[880, 0.22], [1320, 0.12], [1760, 0.06]].forEach(([hz, v]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = hz; o.type = 'sine';
        g.gain.setValueAtTime(v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.2); o.connect(g).connect(out); o.start(); o.stop(a.currentTime + 1.25); });
    }
  } catch {}
}
