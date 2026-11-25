// Calendar: the month colored by how each day treats you (tap a day for the short read), and the best-day finder,
// which shows its work — every day ahead flips past, the ones set aside fade, the best three rise.
import { $, $$, esc, S, api, track, toast, buzz, reduced, localDay, fmt, parse, ymd, WEEK, MONTHS, byGz, pillarOf, signName, art, elStyle, elOf,
  level, theme, toneOf, tenName, whyList, hourRange, ring, loading, failed, openSheet, closeSheet, countUp } from './core.js';

const view = () => $('#view');
let month = null;

export async function pageCalendar() {
  const today = localDay();
  month = month || today.slice(0, 7);
  const [y, m] = month.split('-').map(Number), first = `${month}-01`, n = new Date(y, m, 0).getDate(), lead = parse(first).getDay();
  view().innerHTML = `<div class="page" style="${elStyle(elOf(S.me.p))}">
    <div class="monthbar"><button aria-label="Previous month" data-mv="-1">‹</button><h1 class="h2">${MONTHS[m - 1]} ${y}</h1><button aria-label="Next month" data-mv="1">›</button></div>
    <div class="cal" id="cal">${WEEK.map((w) => `<span class="wd">${w[0]}</span>`).join('')}${'<span class="blank"></span>'.repeat(lead)}
      ${Array.from({ length: n }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, '0')}`; return `<button data-d="${d}" class="${d === today ? 'today' : d < today ? 'past' : ''}" style="--i:${i}"><span>${i + 1}</span><i></i></button>`; }).join('')}</div>
    <div class="legend">${[5, 4, 3, 2, 1].map((k) => `<span class="lv${k}"><i></i>${level(k).word}</span>`).join('')}</div>
    <div class="card" id="monthSum" style="margin-top:16px">${loading(60)}</div>
    <div class="sec"><a class="btn block" href="#/pick">Find your best day for…</a></div>
  </div>`;
  $$('[data-mv]').forEach((b) => b.addEventListener('click', () => { const t = new Date(y, m - 1 + +b.dataset.mv, 1); month = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; buzz(5); pageCalendar(); }));
  let data;
  try { data = await api('GET', `calendar?y=${y}&m=${m}`); } catch (e) { $('#monthSum').innerHTML = failed(e.message); return; }
  const byDate = Object.fromEntries(data.days.map((d) => [ymd(d), d]));
  for (const [d, x] of Object.entries(byDate)) {
    const b = $(`#cal button[data-d="${d}"]`); if (!b) continue;
    b.classList.add('lv' + x.level.k);
    if (x.lunar?.jieqi) b.classList.add('term');
    b.setAttribute('aria-label', `${fmt(d)}: ${level(x.level.k).word}`);
    b.addEventListener('click', () => openDay(x, data.chart));
  }
  if (!reduced()) $('#cal').classList.add('paint');
  // the month in one line: how many strong days, and the best one
  const good = data.days.filter((d) => d.level.k >= 4), best = data.days.slice().sort((a, b) => b.score - a.score)[0];
  $('#monthSum').innerHTML = `<div class="msum"><div><b data-n="${good.length}">0</b><span>strong days</span></div><div><b>${fmt(ymd(best), 'md')}</b><span>best day</span></div>
    <div><b class="sm">${(() => { const t = data.days.filter((d) => d.lunar?.jieqi); return t.length ? `${S.C.seasons[t[0].lunar.jieqi]}${t.length > 1 ? ` +${t.length - 1}` : ''}` : '—'; })()}</b><span>new micro-season</span></div></div>`;
  countUp($('[data-n]'), good.length, 700);
}

function openDay(x, chart) {
  const d = ymd(x), dp = byGz(x.gz), th = theme(x.ssG, toneOf(chart, x.gz)), lv = level(x.level.k);
  buzz(5);
  openSheet(`<button class="x" aria-label="Close">×</button><p class="label">${d === localDay() ? 'Today' : fmt(d, 'md')}</p><h2 class="h2">${fmt(d, 'full')}</h2>
    <div class="stack-gap" style="margin-top:14px">
      <div class="card score lv${x.level.k}">${ring(x.score)}<div><div class="word">${lv.word}</div><p>${th.title}</p></div></div>
      ${x.lunar?.jieqi ? `<div class="card"><p class="label">Micro-season begins</p><h3 class="h3" style="margin-top:6px">${S.C.seasons[x.lunar.jieqi]}</h3></div>` : ''}
      <div class="card"><p class="label">Why</p>${whyList(x.why, 4).map((w) => `<div class="wrow"><b class="${w.v >= 0 ? 'up' : 'down'}">${w.v >= 0 ? '+' : '−'}${Math.abs(w.v)}</b><div><p>${esc(w.en)}</p><small>${esc(w.t)}</small></div></div>`).join('')}</div>
      <a class="card daymini" href="#/today?d=${d}"><img src="${art(dp)}" alt="" width="56" height="56"><div><p class="label">The day's sign</p><b>${signName(dp)} · ${esc(dp.name)}</b><p class="small" style="margin:2px 0 0">Open the full day — hours, do & skip</p></div><span class="go">›</span></a>
    </div>`);
  countUp($('#sheet [data-count]'), x.score, 700);
  $('#sheet a.daymini').addEventListener('click', closeSheet);
}

// ---------- best-day finder ----------
let pick = { type: null, range: '1m' };
export function pagePick() {
  const types = S.me.planTypes?.map((t) => t.name) || Object.keys(S.C.pickTypes);
  view().innerHTML = `<div class="page" style="${elStyle(elOf(S.me.p))}">
    <h1 class="h2" style="margin-top:6px">Find your best day</h1>
    <p class="muted" style="margin:8px 0 18px">Pick what you're planning. We check every day ahead against your chart, set aside the ones that clash, and rank the rest.</p>
    <div class="picks">${types.filter((t) => S.C.pickTypes[t]).map((t) => `<button data-t="${t}" aria-pressed="${pick.type === t}">${S.C.pickTypes[t]}</button>`).join('')}</div>
    <p class="label" style="margin:20px 0 8px">Within</p>
    <div class="seg">${[['month', 'This month'], ['1m', '30 days'], ['3m', '3 months']].map(([k, v]) => `<button data-r="${k}" aria-pressed="${pick.range === k}">${v}</button>`).join('')}</div>
    <div id="pickOut" class="sec"></div>
  </div>`;
  $$('[data-t]').forEach((b) => b.addEventListener('click', () => { pick.type = b.dataset.t; $$('[data-t]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); buzz(5); run(); }));
  $$('[data-r]').forEach((b) => b.addEventListener('click', () => { pick.range = b.dataset.r; $$('[data-r]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); if (pick.type) run(); }));
  if (pick.type) run();
}
async function run() {
  const out = $('#pickOut'), label = S.C.pickTypes[pick.type];
  out.innerHTML = `<div class="scan"><div class="scan-grid" id="scanGrid"></div><p class="small" id="scanTxt">Scanning your days…</p></div>`;
  const t0 = performance.now();
  let r;
  let chart = S.today?.chart;
  try { r = await api('POST', 'pick', { type: pick.type, range: pick.range }); if (!chart) chart = (await api('GET', 'today?date=' + localDay())).chart; } catch (e) { out.innerHTML = failed(e.message); return; }
  track('us_pick', { type: pick.type, range: pick.range });
  // show the scan: one tile per day; set-aside days fade, picks light up
  const n = r.days, picks = r.picks.map((p) => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`);
  const start = new Date(); start.setDate(start.getDate() + 1);
  const tiles = Array.from({ length: n }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  const set = r.excluded ? (r.excluded.ji + r.excluded.po + r.excluded.chong) : Math.max(0, n - (r.candidates || n));
  const grid = $('#scanGrid');
  grid.innerHTML = tiles.map((d, i) => `<i style="--i:${i}" class="${picks.includes(d) ? 'pick' : ''}" title="${d}"><span>${parse(d).getDate()}</span></i>`).join('');
  const dur = reduced() ? 0 : Math.min(1600, 40 * n), wait = Math.max(0, dur - (performance.now() - t0));
  if (!reduced()) {
    grid.classList.add('go');
    // fade a share of the days to show what was set aside (the engine skips clashes and almanac taboos)
    const others = [...grid.children].filter((x) => !x.classList.contains('pick'));
    others.sort(() => Math.random() - 0.5).slice(0, set).forEach((x) => x.classList.add('out'));
  }
  setTimeout(() => {
    if (!$('#scanTxt')) return;
    $('#scanTxt').innerHTML = `<b>${n}</b> days scanned · <b>${set}</b> set aside · <b>${r.picks.length}</b> picked`;
    buzz(12);
    out.insertAdjacentHTML('beforeend', `<p class="label" style="margin:22px 0 10px">Your best days for ${esc(label.charAt(0).toLowerCase() + label.slice(1))}</p>
      <div class="stack-gap">${r.picks.map((p, i) => { const d = picks[i], t = parse(d), th = theme(p.ssG, toneOf(chart, pillarOf(d).cn)); return `
        <a class="card result lv${p.level.k} rise" style="--i:${i}" href="#/today?d=${d}"><div class="d"><span>${WEEK[t.getDay()]}</span><b>${t.getDate()}</b><span>${MONTHS[t.getMonth()].slice(0, 3)}</span></div>
          <div><p class="rank">${i === 0 ? (r.best ? 'Best pick' : 'Top pick') : `Option ${i + 1}`}</p><h3 class="h3" style="margin-top:6px">${fmt(d, 'full')}</h3>
          <p class="muted" style="margin:4px 0 0;font-size:15px">${level(p.level.k).word} · ${th.title}${p.fit ? ` · <span class="fit">${tenName(p.ssG)} days suit this</span>` : ''}</p>
          <div class="hours">${p.hours.map((h) => `<span class="chip good">${hourRange(h)}</span>`).join('')}</div></div></a>`; }).join('')}</div>
      <p class="hint">Days that clash with your birth month or year, or that the old almanac marks as unsuitable for this, are set aside first.</p>`);
  }, wait);
}
