// Sixty — the US edition. The sign of a date is plain arithmetic on the 60-day cycle and is computed
// here; readings, calendars and best days come from /api/us/*, which calculates and stores nothing.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
const EL = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
const ZHI_ANIMAL = 'Rat Ox Tiger Rabbit Dragon Snake Horse Goat Monkey Rooster Dog Pig'.split(' ');
const MONTHS = 'January February March April May June July August September October November December'.split(' ');
const WEEK = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ');
const WEEK_LONG = 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday'.split(' ');
const SITE = 'mindflow.zone/sixty';
const view = $('#view');
let C, CITIES = null;

// ---------- dates and the cycle ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const t = parse(s); t.setDate(t.getDate() + n); return iso(t); };
const localDay = (n = 0) => addDays(iso(new Date()), n);
const fmt = (s, style = 'short') => {
  const t = parse(s), m = MONTHS[t.getMonth()];
  if (style === 'long') return `${m} ${t.getDate()}, ${t.getFullYear()}`;
  if (style === 'full') return `${WEEK_LONG[t.getDay()]}, ${m} ${t.getDate()}`;
  return `${WEEK[t.getDay()]}, ${m.slice(0, 3)} ${t.getDate()}`;
};
// 0 = 甲子. Same arithmetic as the engine; the API test checks it day by day.
const cycleIndex = (s) => { const [y, m, d] = s.split('-').map(Number); return ((Math.floor(Date.UTC(y, m - 1, d) / 864e5) + 17) % 60 + 60) % 60; };
const pillarOf = (s) => C.pillars[cycleIndex(s)];
const byGz = (gz) => C.pillars.find((p) => p.cn === gz);
const bySlug = (slug) => C.pillars.find((p) => p.slug === slug);
const stemIdx = (p) => (p.no - 1) % 10;
const stemOf = (p) => C.stems[p.stem];
const elOf = (p) => stemOf(p).element;
const signName = (p) => `${elOf(p)} ${p.animal}`;
const aSign = (p) => `${/^[AEIOU]/.test(elOf(p)) ? 'an' : 'a'} ${signName(p)}`;
const fullName = (p) => `${stemOf(p).polarity} ${elOf(p)} ${p.animal}`;
const elStyle = (el) => `--el:${C.elements[el].color};--el-tint:${C.elements[el].tint}`;
const art = (p) => `../art/pillars/${p.art}`;
// the 12 two-hour blocks: block 0 is 11 PM – 1 AM
const clock = (h) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
const hourRange = (i) => { const a = (i * 2 + 23) % 24, b = (a + 2) % 24; return (a < 12) === (b < 12) && b !== 0 ? `${a % 12 || 12}–${clock(b)}` : `${clock(a)}–${clock(b)}`; };

// Today's (or any day's) sign against yours, through the five elements: used for friends' best days.
function dayKind(day, mine) {
  const t = stemIdx(day) >> 1, m = stemIdx(mine) >> 1;
  return t === m ? 'same' : (t + 1) % 5 === m ? 'feeds' : (m + 1) % 5 === t ? 'draws' : (m + 2) % 5 === t ? 'yields' : 'tests';
}
const HE = ['0-5', '1-6', '2-7', '3-8', '4-9'], STEMS = 'jia yi bing ding wu ji geng xin ren gui'.split(' ');
function pairOf(me, you) {
  const a = stemIdx(me), b = stemIdx(you), lo = Math.min(a, b), hi = Math.max(a, b), ea = a >> 1, eb = b >> 1;
  const kind = HE.includes(`${lo}-${hi}`) ? 'match' : ea === eb ? 'same' : (ea + 1) % 5 === eb ? 'lift' : (eb + 1) % 5 === ea ? 'lifted' : (ea + 2) % 5 === eb ? 'push' : 'pushed';
  const k = C.pairKinds[kind], p = C.pairs[`${STEMS[lo]}-${STEMS[hi]}`];
  return { name: p.name, kind, tag: k.tag, text: k.text.replace('{me}', stemOf(me).image).replace('{you}', stemOf(you).image), art: `../art/pairs/${p.art}` };
}

// ---------- the visitor (stored on this device only) ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('sixty.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('sixty.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('sixty.' + k); } catch {} },
};
function me() {
  let m = store.get('me');
  if (m && m.date && !m.birth) m = { birth: { date: m.date }, slug: m.slug }; // first version stored only the date
  return m && m.birth?.date && bySlug(m.slug) ? { ...m, p: bySlug(m.slug) } : null;
}
const saveMe = (birth, slug) => { store.set('me', { birth, slug: slug || pillarOf(birth.date).slug }); api.clear(); };
const friends = () => store.get('friends') || [];
function addFriend(slug, name) {
  const list = friends().filter((f) => !(f.slug === slug && f.name === name));
  list.unshift({ slug, name, at: Date.now() });
  store.set('friends', list.slice(0, 50));
}

// ---------- api ----------
const api = {
  cache: new Map(),
  clear() { this.cache.clear(); },
  async post(path, body) {
    body = { ...body, plus: plusToken() };
    const key = path + JSON.stringify(body);
    if (!this.cache.has(key)) {
      this.cache.set(key, fetch('../api/us/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.message || 'Something went wrong.'), { code: d.error }); return d; })
        .catch((e) => { this.cache.delete(key); throw e; }));
    }
    return this.cache.get(key);
  },
};
const birthOf = (m) => m.birth;
const getChart = (m) => api.post('chart', { birth: birthOf(m) });
const getDays = (m, from, n, hours) => api.post('days', { birth: birthOf(m), from, n, hours: hours ? 1 : 0 });

// ---------- Sixty Plus ----------
const plusToken = () => store.get('plus')?.token || undefined;
let PLUS = { plus: false, prices: null };
async function loadPlus() {
  const t = plusToken();
  try { PLUS = await fetch('../api/us/pay/status' + (t ? `?token=${t}` : '')).then((r) => r.json()); } catch { PLUS = { plus: false, prices: null }; }
  if (!PLUS.plus && t && !PLUS.pending) store.del('plus'); // ended or never paid
  return PLUS;
}
const money = (c) => `$${(c / 100).toFixed(2)}`;
const PERKS = ['Your full calendar — every day, every month', 'Best-day finder for interviews, dates, launches and more', 'Your elements, what fuels you and your 10-year cycles', 'New features first'];
function lockCard(title, line) {
  const pr = PLUS.prices;
  return `<div class="card lock"><span class="chip el" style="--el:#16151A;--el-tint:#EFEDE7"><span class="dot" style="background:#E0573E"></span>Sixty Plus</span>
    <h3 class="h2" style="font-size:26px;margin-top:12px">${title}</h3><p class="muted" style="margin:6px 0 16px">${line}</p>
    <button class="btn block" data-paywall>Unlock Sixty Plus</button>${pr ? `<p class="hint" style="text-align:center">From ${money(Math.round(pr.yearly / 12))}/month, billed yearly</p>` : ''}</div>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-paywall]')) { e.preventDefault(); openPaywall(e.target.closest('[data-paywall]').dataset.paywall || ''); } });
function openPaywall(from) {
  const pr = PLUS.prices;
  track('us_paywall', { from });
  if (!pr) { toast('Payments are not available right now.'); return; }
  const save = Math.round((1 - pr.yearly / (pr.monthly * 12)) * 100);
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Sixty Plus</h2><p class="muted" style="margin:0 0 14px">Plan your days, not just today.</p>
    <ul class="perks">${PERKS.map((x) => `<li>${x}</li>`).join('')}</ul>
    <div class="plans" role="radiogroup">
      <button role="radio" aria-checked="true" data-plan="yearly"><b>Yearly</b><span>${money(pr.yearly)} / year</span><em>${money(Math.round(pr.yearly / 12))}/mo · Save ${save}%</em></button>
      <button role="radio" aria-checked="false" data-plan="monthly"><b>Monthly</b><span>${money(pr.monthly)} / month</span><em>Cancel anytime</em></button>
    </div>
    <button class="btn block" id="goPay" style="margin-top:14px">Continue to checkout</button>
    <p class="hint" style="text-align:center">Secure checkout by Gumroad. Renews automatically; cancel anytime from your receipt email.</p>
    <button class="linkbtn" id="toRestore">Already have Plus? Restore it</button>`);
  let plan = 'yearly';
  $$('[data-plan]').forEach((b) => b.addEventListener('click', () => { plan = b.dataset.plan; $$('[data-plan]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }));
  $('#toRestore').addEventListener('click', restoreSheet);
  $('#goPay').addEventListener('click', async () => {
    const btn = $('#goPay'); btn.disabled = true; btn.textContent = 'Opening checkout…';
    const tab = window.open('', '_blank');
    try {
      const r = await fetch('../api/us/pay/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) }).then(async (x) => { const d = await x.json(); if (!x.ok) throw new Error(d.message); return d; });
      store.set('plus', { token: r.token, ref: r.ref }); track('us_checkout', { plan, from });
      if (tab) tab.location.href = r.url; else location.href = r.url;
      waitSheet();
    } catch (x) { tab?.close(); btn.disabled = false; btn.textContent = 'Continue to checkout'; toast(x.message || 'Could not open checkout.'); }
  });
}
let waitTimer = null;
function waitSheet() {
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Finish in the Gumroad tab</h2>
    <p class="muted" style="margin:0">Once your payment goes through, Sixty Plus unlocks here automatically.</p>
    <div class="skeleton" style="height:6px;margin:22px 0"></div><button class="btn ghost block" id="checkPay">I've paid — check now</button>`);
  const check = async () => { await loadPlus(); if (PLUS.plus) { clearInterval(waitTimer); track('us_plus', { plan: PLUS.plan }); closeSheet(); api.clear(); toast('Welcome to Sixty Plus'); render(); } };
  clearInterval(waitTimer); let n = 0;
  waitTimer = setInterval(() => { if (++n > 200 || $('#sheet').hidden) return clearInterval(waitTimer); if (!document.hidden) check(); }, 3000);
  $('#checkPay').addEventListener('click', check);
}
function restoreSheet() {
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Restore Sixty Plus</h2>
    <p class="muted" style="margin:0 0 14px">Paste the license key from your Gumroad receipt email.</p>
    <form id="restoreForm"><div class="row"><input class="input" name="key" autocomplete="off" autocapitalize="characters" placeholder="XXXXXXXX-XXXXXXXX-…" required><button class="btn" type="submit">Restore</button></div><p class="err"></p></form>`);
  $('#restoreForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, err = f.querySelector('.err');
    try {
      const r = await fetch('../api/us/pay/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: f.key.value }) }).then(async (x) => { const d = await x.json(); if (!x.ok) throw new Error(d.message); return d; });
      store.set('plus', { token: r.token }); await loadPlus(); api.clear(); track('us_restore'); closeSheet(); toast('Sixty Plus restored'); render();
    } catch (x) { err.textContent = x.message; }
  });
}
addEventListener('visibilitychange', () => { if (!document.hidden && store.get('plus') && !PLUS.plus) loadPlus().then(() => { if (PLUS.plus) { api.clear(); render(); } }); });

// ---------- analytics ----------
const anon = () => { let a = store.get('anon'); if (!a) { a = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('anon', a); } return a; };
const SRC = (new URLSearchParams(location.search).get('src') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
let queue = [], timer;
function track(name, props = {}) { queue.push({ name, props: { ...props, src: SRC || undefined } }); clearTimeout(timer); timer = setTimeout(flush, 1200); }
function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ anonId: anon(), events: queue.splice(0, 30) });
  if (navigator.sendBeacon) navigator.sendBeacon('../api/events', new Blob([body], { type: 'application/json' }));
  else fetch('../api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
addEventListener('pagehide', flush);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }

// ---------- birthday field: types as MM / DD / YYYY, accepts autofill ----------
function birthdayHtml(id, label, button = 'Find my sign') {
  return `<label class="label" for="${id}" style="display:block;margin-bottom:8px">${label}</label>
    <div class="row"><input class="input" id="${id}" type="text" inputmode="numeric" autocomplete="bday" placeholder="MM / DD / YYYY" maxlength="14">
    <button class="btn" type="submit">${button}</button></div><p class="err"></p>`;
}
function readBirthday(v) {
  let y, m, d;
  v = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) [y, m, d] = v.split('-').map(Number);
  else { const n = v.replace(/\D/g, ''); if (n.length === 8) { m = +n.slice(0, 2); d = +n.slice(2, 4); y = +n.slice(4); } }
  const t = y && new Date(y, m - 1, d);
  if (!t || t.getMonth() !== m - 1 || t.getDate() !== d) return { err: 'Please enter a real date, like 03 / 14 / 1992.' };
  const s = iso(t);
  if (y < 1900 || s > localDay()) return { err: 'Please enter a birthday between 1900 and today.' };
  return { date: s };
}
function wireBirthday(form, onDate) {
  const input = form.querySelector('input'), err = form.querySelector('.err');
  input.addEventListener('input', () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
    const d = input.value.replace(/\D/g, '').slice(0, 8);
    input.value = d.length > 4 ? `${d.slice(0, 2)} / ${d.slice(2, 4)} / ${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
    err.textContent = '';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = readBirthday(input.value);
    if (r.err) { err.textContent = r.err; input.focus(); return; }
    onDate(r.date);
  });
}

// ---------- shared pieces ----------
const artHtml = (src, tag = '', alt = '') => `<div class="art"><img src="${src}" alt="${esc(alt)}" width="720" height="720">${tag ? `<div class="tag">${tag}</div>` : ''}</div>`;
const elChip = (p) => `<span class="chip el"><span class="dot"></span>${stemOf(p).polarity} ${elOf(p)}</span>`;
const loading = (h = 120) => `<div class="skeleton" style="height:${h}px"></div>`;
const failed = (msg) => `<div class="card"><p class="muted" style="margin:0">${esc(msg)}</p><button class="btn ghost block" style="margin-top:12px" onclick="location.reload()">Try again</button></div>`;
function ring(score) {
  const r = 34, c = 2 * Math.PI * r, f = Math.max(0.04, Math.min(1, score / 100));
  return `<div class="ring"><svg viewBox="0 0 78 78"><circle cx="39" cy="39" r="${r}" fill="none" stroke="var(--soft)" stroke-width="7"/><circle cx="39" cy="39" r="${r}" fill="none" stroke="var(--lv)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c * f} ${c}"/></svg><b>${score}</b></div>`;
}
// Lucky colors: if the day's element is one that fuels you, wear it; otherwise wear your first fuel.
function luckyOf(chart, day) {
  const dayEl = GAN.indexOf(day.gz[0]) >> 1;
  const el = chart.xi.includes(dayEl) ? dayEl : chart.xi[0];
  return { el: EL[el], follow: el === dayEl, colors: C.elements[EL[el]].lucky };
}
function dayDetailHtml(day, chart, label = 'Today') {
  const lv = C.levels[day.k], th = C.themes[day.ssG], dp = byGz(day.gz), lucky = luckyOf(chart, day);
  return `
    <div class="card score lv${day.k}">${ring(day.score)}<div><div class="word">${lv.word}</div><p>${lv.line}</p></div></div>
    <div class="card theme"><p class="label">${label}'s theme</p><h2 class="h2">${th.title}</h2><p>${th.line}</p></div>
    <div class="card dodont"><div><p class="label">Do</p><ul>${th.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="no"><p class="label">Skip</p><ul>${th.dont.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
    <div class="card"><p class="label">Best hours</p><div class="hours">${day.best.map((i) => `<span class="chip good">${hourRange(i)}</span>`).join('')}${day.worst != null ? `<span class="chip bad">Avoid ${hourRange(day.worst)}</span>` : ''}</div></div>
    <div class="card"><p class="label">Lucky colors</p><div class="swatches">${lucky.colors.map(([n, h]) => `<span class="sw"><i style="background:${h}"></i>${n}</span>`).join('')}</div>
      <p class="hint">${lucky.follow ? `${label} runs on ${lucky.el}, one of your fuel elements — lean into it.` : `${lucky.el} is one of your fuel elements. Wear it to balance the day.`}</p></div>
    <a class="card daymini" href="#/sign/${dp.slug}"><img src="${art(dp)}" alt="" width="56" height="56"><div><p class="label">${label}'s sign</p><b>${signName(dp)} · ${esc(dp.name)}</b></div><span class="go">›</span></a>`;
}

// ---------- pages ----------
function pageLanding() {
  const t = pillarOf(localDay());
  view.innerHTML = `
    <div class="page landing">
      <span class="chip"><span class="dot" style="background:var(--fire)"></span>Your day sign</span>
      <h1 class="display">There are 60 kinds of days. <em>And 60 kinds of people.</em></h1>
      ${artHtml(art(t), `<span class="chip">Today · ${signName(t)}</span>`, t.name)}
      <form class="card ask" id="birthForm">${birthdayHtml('bday', 'Your birthday')}<p class="hint">No sign-up. Takes 5 seconds.</p></form>
      <p class="lede">An ancient calendar gives every day — and everyone — one of 60 signs. Find yours, then plan your days around it.</p>
      <div class="sec"><p class="label">What you get</p><div class="card features">
        ${[['Your sign', 'One of 60, with its own painting, element and character.', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="2" fill="currentColor"/>'],
          ['A daily reading', 'Your energy, theme, best hours and lucky colors — every day.', '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'],
          ['Your best days', 'Interview, first date, launch? See the best 3 days ahead.', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 14l2 2 4-4"/>'],
          ['You & your people', 'Send a link and see the painting you make together.', '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>']]
          .map(([h, p, ic]) => `<div class="feature"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${ic}</svg></span><div><h3 class="h3">${h}</h3><p>${p}</p></div></div>`).join('')}
      </div></div>
      <div class="sec"><p class="label">All 60 signs</p>
        <div class="strip"><div class="track">${[...C.pillars, ...C.pillars].map((x, i) => `<a href="#/sign/${x.slug}"${i >= 60 ? ' aria-hidden="true" tabindex="-1"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="120" height="120"><span>${signName(x)}</span></a>`).join('')}</div></div>
      </div>
    </div>`;
  wireBirthday($('#birthForm'), (d) => {
    saveMe({ date: d }); const m = me(); track('us_reveal', { sign: m.slug, from: 'home' });
    location.hash = `#/sign/${m.slug}?r=1`;
  });
}

function pageSign(slug, reveal) {
  const p = bySlug(slug); if (!p) { location.hash = '#/'; return; }
  const m = me(), mine = m && m.slug === slug, s = stemOf(p), today = pillarOf(localDay());
  view.innerHTML = `
    <div class="page wide${reveal ? ' reveal' : ''}" style="${elStyle(elOf(p))}">
      <div class="left">${artHtml(art(p), '', p.name)}</div>
      <div class="right after">
        <div class="sign-name">
          <p class="label">${mine ? `Your sign · Born ${fmt(m.birth.date, 'long')}` : today.slug === slug ? 'Today’s sign' : `Sign ${p.no} of 60`}</p>
          <h1 class="display">${signName(p)}</h1><p class="poetic">${esc(p.name)}</p>
          <div class="chips">${elChip(p)}<span class="chip">${p.animal}</span><span class="chip">No. ${p.no} of 60</span></div>
        </div>
        <p class="intro">${esc(p.intro)}</p>
        <div class="chips" style="margin-top:16px">${s.traits.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
        <p class="cn-note">${mine ? 'Your sign comes from the day you were born. ' : ''}In the Chinese calendar this sign is <span class="cjk">${p.cn}</span> (${p.py}) — ${fullName(p)}.</p>
        <div class="btns">${mine
          ? `<a class="btn block" href="#/today">See today’s reading</a><button class="btn ghost block" id="shareSign">Share my sign</button><button class="btn ghost block" id="invite">See the painting you make with a friend</button>`
          : `<a class="btn block" href="${m ? '#/today' : '#/'}">${m ? 'Back to my day' : 'Find your sign'}</a>`}</div>
      </div>
    </div>`;
  if (mine) {
    $('#shareSign').addEventListener('click', () => shareImage(() => drawCard({ art: art(p), el: elOf(p), kicker: 'My sign', title: signName(p), sub: p.name, meta: `${fullName(p)} · No. ${p.no} of 60`, body: p.intro }), `sixty-${p.slug}.jpg`, p.slug));
    $('#invite').addEventListener('click', () => inviteSheet(p));
  }
}

async function pageToday() {
  const m = me(), today = localDay();
  view.innerHTML = `<div class="page" style="${elStyle(elOf(m.p))}">
    <div class="dateline"><h1 class="h2">Today</h1><span class="small">${fmt(today, 'full')}</span></div>
    <div id="dayBody" class="stack-gap" style="margin-top:14px">${loading(110)}${loading(150)}${loading(140)}</div>
    <div class="sec" id="tmr"></div>
    <div class="sec"><a class="btn ghost block" href="#/pick">Find your best day for…</a></div>
  </div>`;
  try {
    const [chart, { days }] = await Promise.all([getChart(m), getDays(m, today, 2, true)]);
    if (!$('#dayBody')) return;
    $('#dayBody').innerHTML = dayDetailHtml(days[0], chart);
    const t = days[1], tp = byGz(t.gz);
    $('#tmr').innerHTML = `<p class="label">Tomorrow</p><a class="card daymini lv${t.k}" href="#/calendar?d=${t.date}"><img src="${art(tp)}" alt="" width="56" height="56">
      <div><b>${C.levels[t.k].word} · ${C.themes[t.ssG].title}</b><p class="small" style="margin:2px 0 0">${fmt(t.date)} · Best ${hourRange(t.best[0])}</p></div><span class="go">›</span></a>`;
  } catch (e) { $('#dayBody') && ($('#dayBody').innerHTML = failed(e.message)); }
}

let calMonth = null;
async function pageCalendar(q) {
  const m = me(), today = localDay();
  if (q.get('d')) calMonth = q.get('d').slice(0, 7);
  if (!calMonth) calMonth = today.slice(0, 7);
  const [y, mo] = calMonth.split('-').map(Number), first = `${calMonth}-01`, n = new Date(y, mo, 0).getDate(), lead = parse(first).getDay();
  view.innerHTML = `<div class="page" style="${elStyle(elOf(m.p))}">
    <div class="monthbar"><button aria-label="Previous month" data-mv="-1">‹</button><h1 class="h2">${MONTHS[mo - 1]} ${y}</h1><button aria-label="Next month" data-mv="1">›</button></div>
    <div class="cal">${WEEK.map((w) => `<span class="wd">${w[0]}</span>`).join('')}${'<span class="blank"></span>'.repeat(lead)}
      ${Array.from({ length: n }, (_, i) => { const d = `${calMonth}-${String(i + 1).padStart(2, '0')}`; return `<button data-d="${d}" class="${d === today ? 'today' : d < today ? 'past' : ''}"><span>${i + 1}</span><i></i></button>`; }).join('')}</div>
    <div class="legend">${[5, 4, 3, 2, 1].map((k) => `<span class="lv${k}"><i></i>${C.levels[k].word}</span>`).join('')}</div>
    <div class="sec">${PLUS.plus ? '<a class="btn block" href="#/pick">Find your best day for…</a>' : lockCard('See every day ahead', 'Your whole month at a glance — tap any day for its full reading.')}</div>
  </div>`;
  if (!PLUS.plus) $('.cal').classList.add('locked');
  $$('[data-mv]').forEach((b) => b.addEventListener('click', () => {
    const t = new Date(y, mo - 1 + +b.dataset.mv, 1); calMonth = iso(t).slice(0, 7);
    if (location.hash.includes('?')) history.replaceState(null, '', '#/calendar');
    pageCalendar(new URLSearchParams());
  }));
  $$('.cal button').forEach((b) => b.addEventListener('click', () => openDay(b.dataset.d)));
  if (!PLUS.plus) {
    // free: today and tomorrow only
    try { const { days } = await getDays(m, today, 2, false); for (const d of days) { const b = $(`.cal button[data-d="${d.date}"]`); if (b) b.classList.add('lv' + d.k, 'open'); } } catch {}
    if (q.get('d')) openDay(q.get('d'));
    return;
  }
  try {
    const { days } = await getDays(m, first, n, false);
    for (const d of days) { const b = $(`.cal button[data-d="${d.date}"]`); if (b) b.classList.add('lv' + d.k), b.setAttribute('aria-label', `${fmt(d.date)}: ${C.levels[d.k].word}`); }
  } catch (e) { toast(e.message); }
  if (q.get('d')) openDay(q.get('d'));
}
async function openDay(d) {
  const m = me();
  openSheet(`<button class="x" aria-label="Close">×</button><p class="label">${d === localDay() ? 'Today' : ''}</p><h2 class="h2">${fmt(d, 'full')}</h2><div id="sheetDay" class="stack-gap" style="margin-top:14px">${loading(110)}${loading(150)}</div>`);
  try {
    const [chart, { days }] = await Promise.all([getChart(m), getDays(m, d, 1, true)]);
    $('#sheetDay') && ($('#sheetDay').innerHTML = dayDetailHtml(days[0], chart, d === localDay() ? 'Today' : 'The day'));
  } catch (e) { $('#sheetDay') && ($('#sheetDay').innerHTML = e.code === 'plus' ? lockCard('Read any day', 'Sixty Plus opens the full reading for every day in your calendar.') : failed(e.message)); }
}

let pickState = { type: null, range: '1m' };
function pagePick() {
  const m = me();
  view.innerHTML = `<div class="page" style="${elStyle(elOf(m.p))}">
    <h1 class="h2" style="margin-top:6px">Find your best day</h1>
    <p class="muted" style="margin:8px 0 18px">Pick what you're planning. We'll check every day ahead against your sign and suggest the best three — with the best hours.</p>
    <div class="picks">${Object.entries(C.picks).map(([k, v]) => `<button data-t="${k}" aria-pressed="${pickState.type === k}">${v}</button>`).join('')}</div>
    <p class="label" style="margin:20px 0 8px">Within</p>
    <div class="seg">${[['2w', '2 weeks'], ['1m', '1 month'], ['3m', '3 months']].map(([k, v]) => `<button data-r="${k}" aria-pressed="${pickState.range === k}">${v}</button>`).join('')}</div>
    <div id="pickOut" class="sec stack-gap"></div>
  </div>`;
  const run = async () => {
    const out = $('#pickOut');
    if (!pickState.type) { out.innerHTML = ''; return; }
    out.innerHTML = loading(96) + loading(96) + loading(96);
    try {
      const r = await api.post('pick', { birth: m.birth, type: pickState.type, today: localDay(), range: pickState.range });
      track('us_pick', { type: pickState.type, range: pickState.range });
      if (!r.picks.length) { out.innerHTML = `<div class="card"><p class="muted" style="margin:0">No good days in this window. Try a longer one.</p></div>`; return; }
      out.innerHTML = `<p class="label">Your best days for ${esc(C.picks[pickState.type].charAt(0).toLowerCase() + C.picks[pickState.type].slice(1))}</p>` + r.picks.map((p, i) => { const t = parse(p.date); return `
        <div class="card result lv${p.k}"><div class="d"><span>${WEEK[t.getDay()]}</span><b>${t.getDate()}</b><span>${MONTHS[t.getMonth()].slice(0, 3)}</span></div>
          <div><p class="rank">${i === 0 ? (r.best ? 'Best pick' : 'Top pick') : `Option ${i + 1}`}</p><h3 class="h3" style="margin-top:6px">${fmt(p.date, 'full')}</h3>
          <p class="muted" style="margin:4px 0 0;font-size:15px">${C.levels[p.k].word} · ${C.themes[p.ssG].title}</p>
          <div class="hours">${p.hours.map((h) => `<span class="chip good">${hourRange(h)}</span>`).join('')}</div></div></div>`; }).join('')
        + `<p class="hint">We looked at ${r.days} days and set aside the ones that clash with this kind of plan.</p>`;
    } catch (e) { out.innerHTML = e.code === 'plus' ? lockCard('Your best days, picked for you', 'We check every day ahead against your sign and suggest the best three — with the best hours.') : failed(e.message); }
  };
  $$('[data-t]').forEach((b) => b.addEventListener('click', () => { pickState.type = b.dataset.t; $$('[data-t]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); run(); }));
  $$('[data-r]').forEach((b) => b.addEventListener('click', () => { pickState.range = b.dataset.r; $$('[data-r]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); run(); }));
  run();
}

async function pageFriends() {
  const m = me(), list = friends();
  view.innerHTML = `<div class="page" style="${elStyle(elOf(m.p))}">
    <h1 class="h2" style="margin-top:6px">You & your people</h1>
    <p class="muted" style="margin:8px 0 18px">Every pair of signs makes a painting of its own. Send a link — when a friend adds their birthday, you both see yours.</p>
    <button class="btn block" id="invite">Invite a friend</button>
    <div class="sec stack-gap" id="flist">${list.length ? list.map((f) => { const fp = bySlug(f.slug); if (!fp) return ''; const pr = pairOf(m.p, fp); return `
      <a class="card friend" href="#/with/${f.slug}?n=${encodeURIComponent(f.name)}"><img src="${pr.art}" alt="" width="64" height="64">
        <div><h3 class="h3">${esc(f.name)} · ${signName(fp)}</h3><p>${pr.name} · ${pr.tag}</p><p class="small" data-best="${f.slug}"></p></div><span class="go">›</span></a>`; }).join('')
      : `<div class="card empty"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--ink-3)" stroke-width="1.5" style="margin:0 auto"><circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/></svg>
         <h3 class="h3" style="margin-top:10px">No one here yet</h3><p>Friends show up here once you open each other's links.</p></div>`}</div>
  </div>`;
  $('#invite').addEventListener('click', () => inviteSheet(m.p));
  if (!list.length) return;
  // best day together in the next two weeks: your own score, plus how the day treats their sign
  try {
    const { days } = await getDays(m, localDay(1), 14, false);
    const W = { feeds: 12, same: 8, yields: 6, draws: 0, tests: -12 };
    for (const el of $$('[data-best]')) {
      const fp = bySlug(el.dataset.best);
      const best = days.reduce((a, d) => { const s = d.score + W[dayKind(byGz(d.gz), fp)]; return !a || s > a.s ? { s, d } : a; }, null);
      el.textContent = `Best day together: ${fmt(best.d.date)}`;
    }
  } catch {}
}

async function pageMe() {
  const m = me(), p = m.p, b = m.birth;
  view.innerHTML = `<div class="page" style="${elStyle(elOf(p))}">
    <a class="card daymini" href="#/sign/${p.slug}" style="grid-template-columns:72px 1fr auto"><img src="${art(p)}" alt="" style="width:72px;height:72px">
      <div><p class="label">Your sign</p><b style="font:400 26px/1.1 var(--serif)">${signName(p)}</b><p class="small" style="margin:2px 0 0">${esc(p.name)}</p></div><span class="go">›</span></a>
    <div class="sec">${PLUS.plus ? `<div class="card"><span class="chip el" style="--el:#16151A;--el-tint:#EFEDE7"><span class="dot" style="background:#E0573E"></span>Sixty Plus</span>
      <p style="margin:10px 0 0">Active until ${fmt(PLUS.until.slice(0, 10), 'long')} · ${PLUS.plan === 'yearly' ? 'Yearly' : 'Monthly'}</p><p class="hint">Manage or cancel any time from your Gumroad receipt email.</p></div>` : ''}</div>
    <div id="chartBody">${loading(120)}</div>
    <div class="sec"><p class="label">Birth details</p>
      <form class="card" id="birthEdit">
        <label class="field"><span class="label">Birthday</span><input class="input" name="date" type="text" inputmode="numeric" autocomplete="bday" value="${b.date.slice(5, 7)} / ${b.date.slice(8)} / ${b.date.slice(0, 4)}"></label>
        <label class="field"><span class="label">Birth time (optional)</span><input class="input" name="time" type="time" value="${b.time || ''}"></label>
        <label class="field"><span class="label">Birth place (optional, for the exact hour)</span><select class="input" name="city"><option value="">Not sure</option></select></label>
        <label class="field"><span class="label">Sex at birth (optional, sets your 10-year cycles)</span><select class="input" name="sex">
          <option value="">Prefer not to say</option><option value="f"${b.sex === 'f' ? ' selected' : ''}>Female</option><option value="m"${b.sex === 'm' ? ' selected' : ''}>Male</option></select></label>
        <p class="err"></p><button class="btn block" type="submit">Save</button>
        <p class="hint">Used only to calculate your readings. Stored on this device, never on our servers.</p>
      </form></div>
    <div class="sec">${waitlistHtml(p.slug)}</div>
    <div class="sec"><button class="btn ghost block" id="forget">Clear my data from this device</button></div>
  </div>`;
  wireWaitlist();
  // birth place list
  CITIES = CITIES || await fetch('cities.json').then((r) => r.json()).catch(() => []);
  const sel = $('select[name=city]');
  if (sel) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    sel.insertAdjacentHTML('beforeend', CITIES.map((c, i) => `<option value="${i}"${b.city === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('') + `<option value="tz"${b.city === 'tz' ? ' selected' : ''}>Somewhere else (use my time zone: ${esc(tz)})</option>`);
  }
  $('#birthEdit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.err'), r = readBirthday(f.date.value);
    if (r.err) { err.textContent = r.err; return; }
    const nb = { date: r.date };
    if (f.time.value) {
      nb.time = f.time.value;
      if (f.city.value === 'tz') { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; Object.assign(nb, { city: 'tz', tz, lng: tzLng(tz) }); }
      else if (f.city.value !== '') { const c = CITIES[+f.city.value]; Object.assign(nb, { city: c.name, tz: c.tz, lng: c.lng }); }
    }
    if (f.sex.value) nb.sex = f.sex.value;
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const ch = await api.post('chart', { birth: nb });
      saveMe(nb, byGz(ch.pillars[2]).slug); track('us_profile', { time: !!nb.time, place: !!nb.lng, sex: !!nb.sex });
      toast('Saved'); render();
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
  $('#forget').addEventListener('click', () => {
    if (!confirm('Clear your birthday, friends and settings from this device?')) return;
    ['me', 'friends', 'name', 'wait'].forEach((k) => store.del(k)); api.clear(); location.hash = '#/';
  });
  try {
    const ch = await getChart(m);
    if (!$('#chartBody')) return;
    const total = (ch.force || []).reduce((a, x) => a + x, 0) || 1, year = new Date().getFullYear(), by = +b.date.slice(0, 4);
    const names = ['Year', 'Month', 'Day', 'Hour'];
    const cell = (gz, i) => { const g = GAN.indexOf(gz[0]), z = ZHI.indexOf(gz[1]); return `<div class="pillar${i === 2 ? ' day' : ''}"><p class="label">${names[i]}</p><b>${EL[g >> 1]} ${ZHI_ANIMAL[z]}</b><span>${g % 2 ? 'Yin' : 'Yang'}</span><div class="cjk">${gz}</div></div>`; };
    $('#chartBody').innerHTML = `
      <div class="sec"><p class="label">Your four pillars</p><div class="pillars">${ch.pillars.map(cell).join('')}${ch.pillars.length < 4 ? `<div class="pillar"><p class="label">Hour</p><b>?</b><span>Add time</span></div>` : ''}</div>
        <p class="hint">Year, month, day and hour of your birth each have a sign. The day is you; the others shape how you show up.${ch.solar ? ` Calculated at local solar time (${ch.solar.time}).` : ''}</p></div>
      ${!ch.force ? `<div class="sec">${lockCard('Your elements and life cycles', 'See your five-element balance, what fuels you and the ten-year cycles of your life.')}</div>` : `<div class="sec"><p class="label">Your elements</p><div class="card"><div class="bars">${EL.map((e, i) => `<div class="bar"><span>${e}</span><span class="t"><i style="width:${Math.round(ch.force[i] / total * 100)}%;background:${C.elements[e].color}"></i></span><b>${Math.round(ch.force[i] / total * 100)}%</b></div>`).join('')}</div>
        <p class="hint" style="margin-top:14px">${ch.strong ? `You run strong: ${ch.selfPct}% of your chart backs your own element. You do best when you spend that energy — create, earn, take on structure.` : `You run gentle: ${ch.selfPct}% of your chart backs your own element. You do best with support — rest, learning and people who have your back.`}</p></div></div>
      <div class="sec"><p class="label">What fuels you</p><div class="stack-gap">${ch.xi.map((i) => { const e = C.elements[EL[i]]; return `<div class="card fuel"><i style="background:${e.color}"></i><div><h3 class="h3">${EL[i]}</h3><p>${e.fuels}</p><div class="swatches">${e.lucky.map(([n, h]) => `<span class="sw"><i style="background:${h}"></i>${n}</span>`).join('')}</div></div></div>`; }).join('')}</div></div>
      <div class="sec"><p class="label">Your 10-year cycles</p>${ch.luck ? `<div class="timeline">${ch.luck.cycles.map((c) => { const cp = byGz(c.gz); return `<div class="cycle${year >= c.from && year <= c.to ? ' now' : ''}"><b>Age ${c.from - by}–${c.to - by}</b><span>${signName(cp)} · ${esc(cp.name)}<span class="small"> · ${c.from}–${c.to}</span></span></div>`; }).join('')}</div>
        <p class="hint">Every ten years the backdrop of your life shifts to a new sign. The highlighted one is now.</p>`
        : `<div class="card"><p class="muted" style="margin:0">Add your sex at birth below to see the ten-year cycles of your life. (The traditional calculation runs them in different directions.)</p></div>`}</div>`}`;
  } catch (e) { $('#chartBody') && ($('#chartBody').innerHTML = failed(e.message)); }
}
// rough longitude for a time zone when the birth city isn't in the list: its standard offset × 15°
function tzLng(tz) {
  const jan = new Date(Date.UTC(2024, 0, 1)), f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
  const m = (f.formatToParts(jan).find((x) => x.type === 'timeZoneName')?.value || '').match(/GMT([+-]\d+)(?::(\d+))?/);
  const off = m ? +m[1] + Math.sign(+m[1]) * (+m[2] || 0) / 60 : 0;
  return Math.max(-180, Math.min(180, off * 15));
}

function waitlistHtml(sign) {
  if (store.get('wait')) return `<div class="card wait"><h3 class="h3">You're on the list.</h3><p class="muted" style="margin:4px 0 0">We'll write when the app is ready.</p></div>`;
  return `<form class="card wait" id="waitForm" data-sign="${esc(sign || '')}"><h3 class="h2" style="font-size:26px">Get the app first</h3>
    <p class="muted" style="margin:6px 0 14px">Morning notifications with your reading, widgets and more. Join the waitlist.</p>
    <div class="row"><input class="input" type="email" autocomplete="email" placeholder="you@example.com" required aria-label="Email"><button class="btn" type="submit">Join</button></div><p class="err"></p></form>`;
}
function wireWaitlist() {
  const f = $('#waitForm'); if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button'), err = f.querySelector('.err');
    btn.disabled = true; err.textContent = '';
    try {
      const r = await fetch('../api/us/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.querySelector('input').value.trim(), sign: f.dataset.sign, ref: SRC }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Something went wrong. Please try again.');
      store.set('wait', 1); track('us_waitlist', { sign: f.dataset.sign });
      f.outerHTML = waitlistHtml();
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
}

function inviteSheet(p, backTo) {
  openSheet(`<button class="x" aria-label="Close">×</button>
    <h2 class="h2">${backTo ? `Send it back to ${esc(backTo)}` : 'What do you two make?'}</h2>
    <p class="muted" style="margin:0 0 16px">${backTo ? `${esc(backTo)} will see your painting together when they open the link.` : 'Send a link. When they add their birthday, they see the painting you make together — and can send it right back.'} Nobody sees anyone's birthday.</p>
    <form id="invForm"><label class="field"><span class="label">Your first name, so they know it's you</span><div class="row"><input class="input" id="invName" type="text" autocomplete="given-name" maxlength="24" placeholder="Optional"><button class="btn" type="submit">Send link</button></div></label></form>`);
  const saved = store.get('name'); if (saved) $('#invName').value = saved;
  $('#invForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#invName').value.trim().slice(0, 24); store.set('name', name);
    const url = `${location.origin}${location.pathname}#/with/${p.slug}${name ? `?n=${encodeURIComponent(name)}` : ''}`;
    const text = `I'm ${aSign(p)} — ${p.name}. What painting do we make together?`;
    track('us_invite', { sign: p.slug, back: !!backTo });
    if (navigator.share) { try { await navigator.share({ text, url }); closeSheet(); return; } catch (x) { if (x.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(`${text} ${url}`); closeSheet(); toast('Link copied — paste it to a friend'); } catch { prompt('Copy this link', url); }
  });
}

function pageWith(slug, name, reveal) {
  const them = bySlug(slug); if (!them) { location.hash = '#/'; return; }
  const who = (name || '').replace(/[\u0000-\u001f]/g, '').slice(0, 24) || 'Your friend';
  const m = me();
  if (!m) {
    track('us_invite_open', { sign: slug });
    view.innerHTML = `<div class="page">
      <span class="chip" style="margin-top:6px">An invitation</span>
      <h1 class="display" style="margin-top:14px;font-size:clamp(38px,10vw,56px)">${esc(who)} is ${aSign(them)}. <em>What do you two make?</em></h1>
      <div class="duo"><div><img src="${art(them)}" alt=""><div><b>${esc(who)}</b>${esc(them.name)}</div></div><div><img src="${art(bySlug('jiazi'))}" alt="" style="filter:grayscale(1) opacity(.35)"><div><b>You</b>Add your birthday</div></div></div>
      <form class="card" id="pairForm" style="margin-top:16px">${birthdayHtml('pday', 'Your birthday', 'Reveal')}<p class="hint">${esc(who)} won't see your birthday — only the painting.</p></form>
      <p class="lede">An ancient calendar gives everyone one of 60 signs. Put two together and they make a painting of their own.</p>
    </div>`;
    wireBirthday($('#pairForm'), (d) => {
      saveMe({ date: d }); track('us_reveal', { sign: me().slug, from: 'invite' });
      location.hash = `#/with/${slug}?${name ? `n=${encodeURIComponent(name)}&` : ''}r=1`;
    });
    return;
  }
  const own = m.slug === slug && !name;
  if (!own) addFriend(slug, who);
  const pr = pairOf(m.p, them);
  if (reveal) track('us_pair', { a: m.slug, b: slug, kind: pr.kind });
  view.innerHTML = `
    <div class="page wide${reveal ? ' reveal' : ''}" style="${elStyle(elOf(m.p))}">
      <div class="left">${artHtml(pr.art, `<span class="chip">${pr.tag}</span>`, pr.name)}</div>
      <div class="right after">
        <div class="sign-name"><p class="label">${own ? 'Your own link' : `You & ${esc(who)}`}</p><h1 class="display" style="font-size:clamp(40px,11vw,58px)">${esc(pr.name)}</h1><p class="poetic">${pr.tag}</p></div>
        <p class="intro">${esc(pr.text)}</p>
        <div class="duo"><div><img src="${art(m.p)}" alt=""><div><b>You</b>${signName(m.p)}</div></div><div><img src="${art(them)}" alt=""><div><b>${esc(who)}</b>${signName(them)}</div></div></div>
        ${own ? `<p class="hint">This is your own invite link. Send it to someone — when they open it, they'll see the painting you make together.</p>` : ''}
        <div class="btns">
          ${own ? '' : `<button class="btn block" id="sendBack">Send it back to ${esc(who)}</button>`}
          <button class="btn ${own ? '' : 'ghost '}block" id="shareDuo">Share our painting</button>
          <a class="btn ghost block" href="#/today">Go to my day</a>
        </div>
      </div>
    </div>`;
  $('#sendBack')?.addEventListener('click', () => inviteSheet(m.p, who));
  $('#shareDuo').addEventListener('click', () => shareImage(() => drawCard({
    art: pr.art, el: elOf(m.p), kicker: own ? 'Two signs, one painting' : `Me & ${who}`, title: pr.name, sub: pr.tag,
    meta: `${signName(m.p)} & ${signName(them)}`, body: `The ${stemOf(m.p).image} and the ${stemOf(them).image}. What do you make with your people?`,
  }), `sixty-${pr.kind}.jpg`, `${m.slug}+${slug}`));
}

function pageSixty() {
  const t = pillarOf(localDay()), m = me();
  view.innerHTML = `<div class="page" style="max-width:1080px"><h1 class="display" style="margin-top:6px">All 60 signs</h1>
    <p class="lede">One for every day in the cycle — and one for everyone. ${m ? 'Yours is outlined.' : 'Which one is yours?'}</p>
    <div class="grid">${C.pillars.map((x) => `<a href="#/sign/${x.slug}"${m && m.slug === x.slug ? ' class="mine"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="180" height="180">
      <div class="nm">${signName(x)}</div><div class="sub">${x.slug === t.slug ? 'Today' : m && m.slug === x.slug ? 'You' : esc(x.name)}</div></a>`).join('')}</div></div>`;
}

// ---------- share image: a 1080 × 1920 story card ----------
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
function wrapLines(ctx, text, max) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
async function drawCard(o) {
  await Promise.all(["400 120px 'Instrument Serif'", "italic 400 64px 'Instrument Serif'", "600 28px Inter", "500 28px Inter"].map((f) => document.fonts.load(f)));
  const W = 1080, H = 1920, X = 90, IW = 900, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = await loadImg(o.art), E = C.elements[o.el];
  ctx.fillStyle = '#F6F5F1'; ctx.fillRect(0, 0, W, H);
  // logo + wordmark
  ctx.strokeStyle = '#16151A'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(X + 26, 138, 23, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#E0573E'; ctx.beginPath(); ctx.arc(X + 26, 112, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#16151A'; ctx.font = "400 64px 'Instrument Serif'"; ctx.fillText('Sixty', X + 66, 160);
  ctx.save(); ctx.shadowColor = 'rgba(20,18,14,.25)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 26; rrect(ctx, X, 230, IW, IW, 44); ctx.fillStyle = '#EFEDE7'; ctx.fill(); ctx.restore();
  ctx.save(); rrect(ctx, X, 230, IW, IW, 44); ctx.clip(); ctx.drawImage(img, X, 230, IW, IW); ctx.restore();
  // kicker chip
  ctx.font = "600 28px Inter"; const kt = o.kicker.toUpperCase(), kw = ctx.measureText(kt).width + 56;
  rrect(ctx, X, 1196, kw, 56, 28); ctx.fillStyle = E.tint; ctx.fill();
  ctx.fillStyle = E.color; ctx.beginPath(); ctx.arc(X + 26, 1224, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillText(kt, X + 44, 1234);
  let size = 128; ctx.font = `400 ${size}px 'Instrument Serif'`;
  while (ctx.measureText(o.title).width > IW && size > 72) { size -= 4; ctx.font = `400 ${size}px 'Instrument Serif'`; }
  ctx.fillStyle = '#16151A'; ctx.fillText(o.title, X - 4, 1290 + size * .95);
  const y2 = 1290 + size * .95 + 80;
  ctx.fillStyle = '#57545A'; ctx.font = "italic 400 64px 'Instrument Serif'"; ctx.fillText(o.sub, X, y2);
  ctx.fillStyle = '#96928C'; ctx.font = "500 28px Inter"; ctx.fillText(o.meta, X, y2 + 60);
  ctx.fillStyle = '#16151A'; ctx.font = "400 46px 'Instrument Serif'";
  wrapLines(ctx, o.body, IW).slice(0, 3).forEach((l, i) => ctx.fillText(l, X, y2 + 140 + i * 58));
  ctx.fillStyle = '#E9E6DF'; ctx.fillRect(X, 1784, IW, 2);
  ctx.fillStyle = '#16151A'; ctx.font = "italic 400 48px 'Instrument Serif'"; ctx.fillText("What's your sign?", X, 1856);
  ctx.font = "600 28px Inter"; ctx.textAlign = 'right'; ctx.fillText(SITE, W - X, 1850); ctx.textAlign = 'left';
  return cv;
}
async function shareImage(make, filename, sign) {
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Your card</h2><p class="tip">Getting it ready…</p>`);
  let cv;
  try { cv = await make(); } catch { closeSheet(); toast('Could not make the image. Please try again.'); return; }
  const url = cv.toDataURL('image/jpeg', .9);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', .9));
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const canFiles = navigator.canShare && navigator.canShare({ files: [file] });
  const touch = matchMedia('(pointer: coarse)').matches;
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Your card</h2><p class="muted" style="margin:0">Sized for Stories and TikTok.</p>
    <img class="shot" src="${url}" alt="Your Sixty card">
    ${touch ? '<p class="tip">Press and hold the image to save it to Photos.</p>' : ''}
    <div class="btns">${canFiles ? '<button class="btn block" id="doShare">Share image</button>' : ''}
    ${!touch || !canFiles ? `<a class="btn ${canFiles ? 'ghost ' : ''}block" id="doSave" href="${url}" download="${filename}">Download image</a>` : ''}</div>`);
  track('us_share', { sign, step: 'open' });
  $('#doShare')?.addEventListener('click', async () => { try { await navigator.share({ files: [file] }); track('us_share', { sign, step: 'shared' }); } catch {} });
  $('#doSave')?.addEventListener('click', () => track('us_share', { sign, step: 'saved' }));
}

// ---------- sheet ----------
function openSheet(html) {
  const s = $('#sheet'); s.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`; s.hidden = false;
  document.body.style.overflow = 'hidden';
  s.querySelector('.x')?.addEventListener('click', closeSheet);
}
function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; document.body.style.overflow = ''; }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// ---------- routing ----------
function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}
const TABBED = ['today', 'calendar', 'pick', 'friends', 'me'];
let lastPath = '';
function render() {
  const { parts, q } = route(), m = me();
  closeSheet();
  const reveal = q.get('r') === '1' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let page = parts[0] || (m ? 'today' : 'home');
  if (TABBED.includes(page) && !m) page = 'home';
  if (page === 'sign' && parts[1]) pageSign(parts[1], reveal);
  else if (page === 'with' && parts[1]) pageWith(parts[1], q.get('n'), reveal);
  else if (page === 'sixty') pageSixty();
  else if (page === 'today') pageToday();
  else if (page === 'calendar') pageCalendar(q);
  else if (page === 'pick') pagePick();
  else if (page === 'friends') pageFriends();
  else if (page === 'me') pageMe();
  else { page = 'home'; pageLanding(); }
  document.body.classList.toggle('has-tabs', !!me());
  const tab = page === 'pick' ? 'calendar' : page === 'sign' && m && parts[1] === m.slug ? 'me' : page;
  $$('.tabs a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const path = parts.join('/');
  if (path !== lastPath) { scrollTo(0, 0); lastPath = path; track('us_visit', { page }); }
  if (q.get('r') === '1') { q.delete('r'); const rest = q.toString(); history.replaceState(null, '', `#/${path}${rest ? '?' + rest : ''}`); }
}
addEventListener('hashchange', render);

Promise.all([fetch('content.json').then((r) => r.json()), loadPlus()]).then(([c]) => { C = c; render(); })
  .catch((e) => { console.error(e); view.innerHTML = '<div class="page"><p class="intro">Sixty could not load. Please refresh.</p></div>'; });
