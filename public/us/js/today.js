// Today: a week strip, a swipeable card for the selected day (with "Why?"), a draggable 24-hour dial,
// do / skip, lucky colors, tomorrow — and, on the first open of a day, pull down to tear off yesterday.
import { shareImage, drawCardPublic } from './share.js';
import { $, $$, esc, S, api, sfx, store, track, toast, buzz, reduced, countUp, localDay, addDays, fmt, parse, WEEK, MONTHS, byGz, signName, art, elStyle, elOf,
  level, theme, toneOf, tenName, pillarOf, whyList, hourRange, hourNow, ring, loading, failed, ymd } from './core.js';

const view = () => $('#view');
let strip = null, sel = null;

export async function pageToday(want) {
  const me = S.me.p;
  sel = want && Math.abs(parse(want) - parse(localDay())) < 864e5 * 300 ? want : localDay(); // without ?d= Today always opens on today
  view().innerHTML = `<div class="page today" style="${elStyle(elOf(me))}">
    <div class="tdhead"><div><p class="label" id="tdKicker">Today</p><h1 class="h2" id="tdTitle">${fmt(sel, 'full')}</h1></div>
      <a class="collect" href="#/collection" aria-label="Your collection"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--soft)" stroke-width="4"/><circle id="colArc" cx="18" cy="18" r="15" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 95" transform="rotate(-90 18 18)"/></svg><b id="colN">·</b><span>/60</span></a></div>
    <div class="week" id="week">${loading(64)}</div>
    <div class="daywrap"><article class="daycard" id="daycard">${loading(420)}</article></div>
    <div id="below" class="stack-gap"></div>
  </div>`;
  try {
    const t = await api('GET', 'today?date=' + localDay());
    if (!$('#daycard')) return; // left the page while loading
    S.today = t; strip = t.strip;
    S.me.p = byGz(t.chart.pillars[2]) || S.me.p; // 真太阳时可能把出生日挪到前后一天
    if (!dayOf(sel)) { try { strip = await api('GET', 'week?date=' + sel); } catch { sel = localDay(); strip = t.strip; } }
    renderCollect(t.jiazi);
    renderWeek(); renderDay(false);
    accuracyChip(t.rate?.summary); peopleToday();
    const firstDay = new Date(S.me.user.createdAt).toDateString() === new Date().toDateString(); // 注册当天没有「昨天」可撕
    if (t.jiazi?.fresh && t.prev && !firstDay && store.get('torn') !== t.date && !reduced()) tearOff(t);
    else if (t.jiazi?.fresh) { toast(`Collected today's painting · ${t.jiazi.n} / 60`); setTimeout(() => flyIn(t.jiazi.n), 500); }
  } catch (e) {
    if (e.status === 401) { location.hash = '#/signin'; return; }
    $('#daycard').innerHTML = failed(e.message);
  }
}

function renderCollect(j) {
  if (!j) return;
  countUp($('#colN'), j.n, 700);
  requestAnimationFrame(() => { const c = 2 * Math.PI * 15; $('#colArc')?.setAttribute('stroke-dasharray', `${(c * Math.min(60, j.n)) / 60} ${c}`); });
}

const dayOf = (date) => strip?.days.find((x) => x.date === date);
function renderWeek() {
  if (!$('#week')) return;
  const today = localDay();
  $('#week').innerHTML = strip.days.map((x) => { const t = parse(x.date); return `<button data-d="${x.date}" class="lv${x.day.level.k}${x.date === sel ? ' on' : ''}${x.date === today ? ' today' : ''}" aria-label="${fmt(x.date)}">
    <span>${WEEK[t.getDay()][0]}</span><b>${t.getDate()}</b><i></i></button>`; }).join('');
  $$('#week button').forEach((b) => b.addEventListener('click', () => go(b.dataset.d, b.dataset.d > sel ? 1 : -1)));
}

async function go(date, dir) {
  if (date === sel) return;
  sel = date; buzz(6);
  if (!dayOf(date)) {
    try { const w = await api('GET', 'week?date=' + date); strip = w; } catch (e) { toast(e.message); return; }
  }
  renderWeek(); renderDay(true, dir);
}

function renderDay(animate, dir = 1) {
  if (!$('#daycard')) return; // left the page while loading
  const x = dayOf(sel), d = x.day, k = d.level.k, th = theme(d.ssG, x.line?.tone || toneOf(S.today?.chart, d.gz), sel), lv = level(k), dp = byGz(d.gz), today = localDay();
  $('#tdKicker').textContent = sel === today ? 'Today' : sel === addDays(today, 1) ? 'Tomorrow' : sel === addDays(today, -1) ? 'Yesterday' : fmt(sel, 'md');
  $('#tdTitle').textContent = fmt(sel, 'full');
  const card = $('#daycard');
  const why = whyList(d.why);
  // the living painting: warm and glowing in a good hour, cooler in a weak one (today only)
  const now = sel === today ? d.hours.find((h) => h.i === hourNow()) : null;
  const glow = now ? (now.level.k >= 4 ? ' glow' : now.level.k <= 2 ? ' dim' : '') : '';
  card.innerHTML = `
    <div class="dc-art${glow}"><img src="${art(dp)}" alt="" width="720" height="720"><div class="tag"><span class="chip">${signName(dp)} · ${esc(dp.name)}</span></div>${now ? `<span class="nowchip lv${now.level.k}"><i></i>Now · ${level(now.level.k).word} hour</span>` : ''}</div>
    <div class="dc-body">
      <div class="score lv${k}">${ring(d.score)}<div><div class="word">${lv.word}</div><p>${th.title}</p></div></div>
      <p class="dc-line">${th.line}</p>
      <button class="share-day" id="shareDay" aria-label="Share this day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>
      <button class="why-btn" aria-expanded="false"><span>Why?</span><small>${tenName(d.ssG)} · ${why.length} signals</small></button>
      <div class="why" hidden>${why.map((w) => `<div class="wrow"><b class="${w.v >= 0 ? 'up' : 'down'}">${w.v >= 0 ? '+' : '−'}${Math.abs(w.v)}</b><div><p>${esc(w.en)}</p><small>${esc(w.t)}</small></div></div>`).join('')}
        <p class="hint">Scored from how the day's stem and branch meet your four pillars — the classical Ten Gods method.</p></div>
    </div>`;
  if (animate && !reduced()) { card.classList.remove('in-l', 'in-r'); void card.offsetWidth; card.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
  countUp(card.querySelector('[data-count]'), d.score, 800);
  card.querySelector('.why-btn').addEventListener('click', (e) => {
    const b = e.currentTarget, open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open)); card.querySelector('.why').hidden = !open; buzz(5);
    if (open) track('us_why');
  });
  swipe(card);
  card.querySelector('#shareDay').addEventListener('click', () => shareDay(x, th, lv));
  renderBelow(x);
}

function swipe(card) {
  let x0 = null, y0 = null, dx = 0, lock = null;
  card.ontouchstart = (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null; card.style.transition = 'none'; };
  card.ontouchmove = (e) => {
    if (x0 == null) return;
    const ddx = e.touches[0].clientX - x0, ddy = e.touches[0].clientY - y0;
    if (!lock) lock = Math.abs(ddx) > Math.abs(ddy) + 4 ? 'x' : Math.abs(ddy) > 6 ? 'y' : null;
    if (lock !== 'x') return;
    dx = ddx; card.style.transform = `translateX(${dx * 0.9}px) rotate(${dx / 60}deg)`;
  };
  card.ontouchend = () => {
    if (x0 == null) return;
    card.style.transition = ''; card.style.transform = '';
    if (lock === 'x' && Math.abs(dx) > 70) go(addDays(sel, dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    x0 = null;
  };
}

function renderBelow(x) {
  if (!$('#below')) return;
  const d = x.day, th = theme(d.ssG, x.line?.tone || toneOf(S.today?.chart, d.gz), sel), today = localDay();
  const best = d.hours.filter((h) => h.i >= 4 && h.i <= 10).sort((a, b) => b.score - a.score).slice(0, 2);
  const t = S.today, isToday = sel === today;
  const night = isToday && (new Date().getHours() >= 18 || t?.rate?.today);
  $('#below').innerHTML = `
    ${night ? tonightHtml(t) : ''}
    <div class="card dial-card"><div class="dial-head"><p class="label">Your hours</p><span class="small">Drag the hand</span></div>
      <div class="dial" id="dial">${dialSvg(d.hours)}<div class="dial-center"><b id="dhRange"></b><span id="dhWord"></span><small id="dhWhy"></small></div></div>
      <div class="hours">${best.map((h) => `<span class="chip good">Best ${hourRange(h.i)}</span>`).join('')}</div></div>
    <div class="card dodont"><div><p class="label">Do</p><ul>${th.do.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div>
      <div class="no"><p class="label">Skip</p><ul>${th.dont.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div></div>
    ${isToday ? moodHtml(t) : ''}
    ${x.luck?.length ? `<div class="card"><p class="label">Lucky colors</p><div class="swatches">${x.luck.map((c) => `<span class="sw big"><i style="background:${c.hex}"></i></span>`).join('')}</div><p class="hint">Wear one of these to tune the day in your favor.</p></div>` : ''}
    ${isToday && t?.tomorrow ? `<button class="card daymini" id="tmr"><img src="${art(pillarOf(ymd(t.tomorrow)))}" alt="" width="56" height="56"><div><p class="label">Tomorrow</p><b>${level(t.tomorrow.level.k).word} · ${theme(t.tomorrow.ssG, toneOf(t.chart, pillarOf(ymd(t.tomorrow)).cn), ymd(t.tomorrow)).title}</b><p class="small" style="margin:2px 0 0">Best ${hourRange(t.tomorrow.hours[0])}</p></div><span class="go">›</span></button>` : ''}
    <a class="btn ghost block" href="#/pick">Find your best day for…</a>`;
  wireDial(d.hours, isToday);
  if (isToday) { wireTonight(); wireMoods(); installCard(); }
  $('#tmr')?.addEventListener('click', () => go(addDays(today, 1), 1));
}

// ---------- the 24-hour dial ----------
const R1 = 118, R0 = 86, CX = 130;
const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [CX + r * Math.cos(a), CX + r * Math.sin(a)]; };
function arc(a0, a1) {
  const [x1, y1] = pt(a0, R1), [x2, y2] = pt(a1, R1), [x3, y3] = pt(a1, R0), [x4, y4] = pt(a0, R0);
  return `M${x1} ${y1} A${R1} ${R1} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${R0} ${R0} 0 0 0 ${x4} ${y4}Z`;
}
function dialSvg(hours) {
  const segs = hours.map((h) => { const a = ((h.i * 2 - 1 + 24) % 24) * 15; return `<path class="seg lv${h.level.k}${h.night ? ' night' : ''}" data-i="${h.i}" d="${arc(a + 1, a + 29)}"/>`; }).join('');
  const labels = [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p']].map(([h, l]) => { const [x, y] = pt(h * 15, 76); return `<text x="${x}" y="${y + 4}">${l}</text>`; }).join('');
  return `<svg viewBox="0 0 260 260">${segs}${labels}<g id="hand"><line x1="${CX}" y1="${CX}" x2="${CX}" y2="${CX - R1 - 4}"/><circle cx="${CX}" cy="${CX - R1 - 4}" r="9"/></g><circle cx="${CX}" cy="${CX}" r="4" class="pivot"/></svg>`;
}
function wireDial(hours, isToday) {
  const svg = $('#dial svg'), hand = $('#hand');
  let cur = -1;
  const setAngle = (deg, fromUser) => {
    if (!document.contains(svg)) return;
    hand.setAttribute('transform', `rotate(${deg} ${CX} ${CX})`);
    const h = (deg / 15 + 24) % 24, i = Math.floor(((h + 1) % 24) / 2);
    if (i === cur) return; cur = i;
    const x = hours.find((y) => y.i === i), w = (x.why || []).find((y) => /^时干/.test(y.t || '')) || null;
    $('#dhRange').textContent = hourRange(i); $('#dhWord').textContent = level(x.level.k).word; $('#dhWord').className = 'lv' + x.level.k;
    // short line in the middle of the dial: the hour's Ten God, and whether it fuels you; the full story is in "Why?"
    $('#dhWhy').textContent = x.ss ? `${tenName(x.ss)} · ${w && w.v >= 0 ? 'fuels you' : 'drains you'}` : '';
    $$('#dial .seg').forEach((s) => s.classList.toggle('on', +s.dataset.i === i));
    if (fromUser) buzz(4);
  };
  const now = new Date(), deg0 = isToday ? (now.getHours() + now.getMinutes() / 60) * 15 : 10 * 15;
  if (!reduced()) { let a = deg0 - 120; const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); setAngle(a + 120 * e); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  else setAngle(deg0);
  const angleOf = (e) => { const r = svg.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return ((Math.atan2(y, x) * 180 / Math.PI + 90) + 360) % 360; };
  let drag = false;
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); setAngle(angleOf(e), true); track('us_dial'); });
  svg.addEventListener('pointermove', (e) => { if (drag) setAngle(angleOf(e), true); });
  svg.addEventListener('pointerup', () => { drag = false; });
  svg.style.touchAction = 'none';
  if (isToday) $('#dial').classList.add('live');
  void hourNow;
}

// ---------- tear off yesterday ----------
function tearOff(t) {
  const p = t.prev, date = ymd(p), gz = p.gz, dp = byGz(gz);
  const el = document.createElement('div');
  el.className = 'tear';
  el.innerHTML = `<div class="tpage"><div class="rings">${'<i></i>'.repeat(7)}</div>
      <p class="label">Yesterday</p><div class="tnum">${p.d}</div><p class="tmon">${MONTHS[p.m - 1]} · ${WEEK[parse(date).getDay()]}</p>
      <img src="${art(dp)}" alt="" width="200" height="200"><p class="small">${signName(dp)} · ${esc(dp.name)}</p>
      <p class="thint"><span>↓</span> Pull down to tear it off</p></div><button class="skip">Skip</button>`;
  document.body.appendChild(el);
  const page = el.querySelector('.tpage');
  let y0 = null, dy = 0;
  const done = (torn) => {
    store.set('torn', t.date);
    if (torn) { sfx('tear'); buzz(25); page.classList.add('gone'); track('us_tear'); }
    el.classList.add('out');
    setTimeout(() => { el.remove(); toast(`Collected today's painting · ${t.jiazi.n} / 60`); flyIn(t.jiazi.n); }, torn ? 650 : 250);
  };
  el.querySelector('.skip').addEventListener('click', () => done(false));
  page.addEventListener('pointerdown', (e) => { y0 = e.clientY; page.setPointerCapture(e.pointerId); page.style.transition = 'none'; });
  page.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); page.style.transform = `translateY(${dy}px) rotate(${dy / 30}deg)`; if (dy > 60) page.classList.add('ripping'); });
  page.addEventListener('pointerup', () => { if (y0 == null) return; y0 = null; page.style.transition = ''; if (dy > 110) done(true); else { page.style.transform = ''; page.classList.remove('ripping'); } });
  page.style.touchAction = 'none';
}

// ---------- tonight: how did today go? ----------
function tonightHtml(t) {
  const r = t.rate || {}, sm = r.summary || {}, acc = sm.rated >= 3 ? Math.round(sm.match / sm.rated * 100) : null;
  return `<div class="card tonight"><p class="label">Tonight</p>
    ${r.today ? `<h3 class="h3" style="margin-top:6px">You rated today ${S.C.ratings[r.today - 1].toLowerCase()}.</h3>
      <p class="muted" style="margin:4px 0 0">${acc != null ? `This month Sixty matched your days <b>${acc}%</b> of the time (${sm.match} of ${sm.rated}).` : `Rate a few more evenings and we'll show how often Sixty matches your days.`}</p>`
    : `<h3 class="h3" style="margin-top:6px">How did today go?</h3><div class="rate" role="radiogroup">${S.C.ratings.map((w, i) => `<button data-s="${i + 1}" aria-label="${w}"><i>${['😣', '😕', '😐', '🙂', '😄'][i]}</i><span>${w}</span></button>`).join('')}</div>
      <p class="hint">Your ratings show how often Sixty gets your days right.</p>`}</div>`;
}
function wireTonight() {
  $$('.rate button').forEach((b) => b.addEventListener('click', async () => {
    buzz(10); b.classList.add('on');
    try { const r = await api('POST', 'ratings', { day: localDay(), score: +b.dataset.s, note: '' }); S.today.rate = { ...(S.today.rate || {}), today: +b.dataset.s, summary: r.summary }; track('us_rate', { s: +b.dataset.s }); renderBelow(dayOf(sel)); }
    catch (e) { toast(e.message); }
  }));
}

// ---------- mood check-in ----------
const MOOD_EMOJI = { happy: '😊', full: '💪', calm: '🌿', tired: '😴', upset: '😤', low: '🌧️' };
function moodHtml(t) {
  const kit = t.moodKit, mine = (t.moods || []).filter((m) => m.day === localDay());
  if (!kit) return '';
  const colorOf = (k) => { const c = kit.colors.find((x) => x.key === k); return document.documentElement.dataset.theme === 'dark' ? c?.dark : c?.light; };
  return `<div class="card moods"><div class="dial-head"><p class="label">How do you feel?</p><span class="small">${mine.length ? `${mine.length} today` : 'Tap one'}</span></div>
    <div class="moodrow">${kit.moods.map((m) => `<button data-m="${m.key}" data-c="${m.color}" style="--mc:${colorOf(m.color)}"><i>${MOOD_EMOJI[m.key] || '•'}</i><span>${S.C.moods[m.key] || m.key}</span></button>`).join('')}</div>
    ${mine.length ? `<div class="moodlog">${mine.map((m) => `<span class="chip" style="background:${colorOf(m.color)};border-color:transparent">${MOOD_EMOJI[m.mood] || ''} ${S.C.moods[m.mood] || m.mood}${m.note ? ` · ${esc(m.note)}` : ''}</span>`).join('')}</div>` : ''}</div>`;
}
function wireMoods() {
  $$('.moodrow button').forEach((b) => b.addEventListener('click', async () => {
    buzz(8); b.classList.add('pick');
    try {
      const r = await api('POST', 'moods', { day: localDay(), mood: b.dataset.m, color: b.dataset.c, note: '' });
      S.today.moods = r.moods; track('us_mood', { m: b.dataset.m }); toast(`Noted: ${S.C.moods[b.dataset.m]}`); renderBelow(dayOf(sel));
    } catch (e) { toast(e.message); }
  }));
}

// ---------- share my day ----------
function shareDay(x, th, lv) {
  const d = x.day, dp = byGz(d.gz), best = d.hours.filter((h) => h.i >= 4 && h.i <= 10).sort((a, b) => b.score - a.score)[0];
  shareImage(() => drawCardPublic({ art: art(dp), el: elOf(S.me.p), kicker: sel === localDay() ? 'My day' : fmt(sel, 'md'), title: `${lv.word} · ${d.score}`, sub: th.title,
    meta: `${fmt(sel, 'full')} · best ${hourRange(best.i)}`, body: th.line }), `sixty-day-${sel}.jpg`, 'day');
}

// ---------- collecting: today's painting flies into the ring ----------
function flyIn(n) {
  const from = $('#daycard .dc-art img'), to = $('.collect');
  if (!from || !to || reduced()) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), img = from.cloneNode();
  img.className = 'flyer'; Object.assign(img.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.appendChild(img);
  requestAnimationFrame(() => { Object.assign(img.style, { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(${36 / a.width})`, opacity: '.2', borderRadius: '50%' }); });
  setTimeout(() => { img.remove(); to.classList.remove('pop'); void to.offsetWidth; to.classList.add('pop'); buzz(12); sfx('chime'); if (n % 10 === 0) toast(n === 60 ? 'All 60 collected — the full cycle!' : `${n} of 60 — a milestone!`); }, 800);
}

// ---------- add to home screen: from the second day you visit ----------
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
function installCard() {
  const days = new Set(store.get('days') || []); days.add(localDay()); store.set('days', [...days].slice(-30));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || days.size < 2 || store.get('a2hs') || $('#a2hs')) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#below').insertAdjacentHTML('beforeend', `<div class="card a2hs" id="a2hs"><button class="x" aria-label="Dismiss">×</button>
    <p class="label">Make it a habit</p><h3 class="h3" style="margin-top:6px">Add Sixty to your Home Screen</h3>
    <p class="muted" style="margin:4px 0 12px;font-size:15px">Open your day in one tap, like an app.</p>
    ${installEvt ? '<button class="btn block" id="doInstall">Add to Home Screen</button>' : ios ? '<ol class="steps"><li>Tap the <b>Share</b> button in Safari</li><li>Choose <b>Add to Home Screen</b></li></ol>' : '<p class="small">Use your browser menu → <b>Install app</b> or <b>Add to Home screen</b>.</p>'}</div>`);
  $('#a2hs .x').addEventListener('click', () => { store.set('a2hs', 1); $('#a2hs').remove(); });
  $('#doInstall')?.addEventListener('click', async () => { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); track('us_install', { r: r?.outcome }); store.set('a2hs', 1); $('#a2hs')?.remove(); });
  track('us_install_card');
}

// ---------- trust: how often Sixty matched your days (after 3 rated evenings) ----------
function accuracyChip(sm) {
  if (!sm || sm.rated < 3 || $('.acc')) return;
  const pct = Math.round(sm.match / sm.rated * 100);
  $('.tdhead > div').insertAdjacentHTML('beforeend', `<button class="chip acc" title="From your evening ratings">${pct}% match</button>`);
  $('.acc').addEventListener('click', () => toast(`Sixty matched ${sm.match} of the ${sm.rated} evenings you rated this month`));
}

// ---------- your people today, and the living lock screen invite ----------
async function peopleToday() {
  let list = [];
  try { list = (await api('GET', 'friends')).list.filter((f) => f.today && f.sign); } catch {}
  const anchor = $('.daywrap');
  if (!anchor || !$('#daycard')) return;
  let html = '';
  if (list.length) {
    const strong = list.filter((f) => f.today.them.k >= 4), both = list.filter((f) => f.today.them.k >= 4 && f.today.me.k >= 4);
    const name = (f) => (/[\u4e00-\u9fff]/.test(f.name) ? 'A friend' : f.name);
    const line = both.length ? `A strong day for you and ${esc(name(both[0]))} — do something together.` : strong.length ? `${esc(name(strong[0]))} is having a strong day — lean on them.` : 'A quiet day all round. Check in on someone.';
    html += `<a class="card people" href="#/friends"><div class="dial-head"><p class="label">Your people today</p><span class="go">›</span></div>
      <div class="faces">${list.slice(0, 6).map((f) => { const p = byGz(f.sign); return `<span class="face lv${f.today.them.k}"><img src="${art(p)}" alt=""><i></i><em>${esc(name(f)).slice(0, 8)}</em></span>`; }).join('')}</div><p class="small" style="margin:10px 0 0">${line}</p></a>`;
  }
  if (!store.get('lsPromo')) html += `<a class="card lspromo" href="#/lockscreen"><button class="x" aria-label="Dismiss">×</button><p class="label">New</p><h3 class="h3" style="margin-top:6px">Your lock screen, repainted every morning</h3><p class="small" style="margin:4px 0 0">Set it once — each day your iPhone wakes up to the day's painting and your best hours.</p></a>`;
  anchor.insertAdjacentHTML('afterend', `<div class="stack-gap" id="peopleWrap" style="margin-top:12px">${html}</div>`);
  $('.lspromo .x')?.addEventListener('click', (e) => { e.preventDefault(); store.set('lsPromo', 1); $('.lspromo').remove(); });
}
