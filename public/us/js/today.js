// Today: the week strip and a swipeable card for the selected day. The first screen answers "how is today for me":
// today's sign meeting yours, the level and score (and where it sits in the week), best and easy hours, lucky colors,
// a 24-hour band (tap for the full dial), do and skip. Below: tonight's check-in, mood, your people, one tip, what's ahead.
// Yesterday's page waits at the top to be torn off — or ignored.
import { shareImage, drawCardPublic } from './share.js';
import { $, $$, esc, S, api, data, sfx, store, track, toast, buzz, reduced, countUp, localDay, addDays, fmt, parse, WEEK, MONTHS, byGz, signName, art, elStyle, elOf,
  level, theme, toneOf, toneWord, tenName, pillarOf, whyList, hourRange, hourNow, ring, loading, failed, ymd, you, bestHour, worstHour, weekRank, openSheet } from './core.js';
import { needAccount } from './onboard.js';

const view = () => $('#view');
let strip = null, sel = null;

export async function pageToday(want) {
  const me = you();
  sel = want && Math.abs(parse(want) - parse(localDay())) < 864e5 * 300 ? want : localDay(); // without ?d= Today always opens on today
  extrasHtml = null; extrasRun++;
  view().innerHTML = `<div class="page split today" style="${elStyle(elOf(me))}">
    <div class="cols"><div class="sticky">
      <div class="tdhead"><div><p class="label" id="tdKicker">Today</p><h1 class="h1" id="tdTitle">${fmt(sel, 'full')}</h1></div>
        <button class="collect" id="collect" aria-label="Your collection"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--soft)" stroke-width="3.5"/><circle id="colArc" cx="18" cy="18" r="15" fill="none" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="0 95" transform="rotate(-90 18 18)"/></svg><b id="colN">${S.me ? '·' : '0'}</b><span>/60</span></button></div>
      <div id="leafSlot"></div>
      <div class="week" id="week">${loading(56)}</div>
      <div class="daywrap"><article class="daycard" id="daycard">${loading(460)}</article></div>
    </div>
    <div id="below" class="stack"></div></div>
  </div>`;
  if (!S.me) $('#colArc').remove(); // nothing collected without an account
  $('#collect').addEventListener('click', () => { if (!needAccount("Create a free account to collect today's painting — there are 60 to find, one a day.")) location.hash = '#/collection'; });
  try {
    const t = await data.today(localDay());
    if (!$('#daycard')) return; // left the page while loading
    S.today = t; strip = t.strip;
    if (S.me) S.me.p = byGz(t.chart.pillars[2]) || S.me.p; // local solar time can move the birth day across midnight
    if (!dayOf(sel)) { try { strip = await data.week(sel); } catch { sel = localDay(); strip = t.strip; } }
    renderWeek(); renderDay(false);
    if (S.me) {
      renderCollect(t.jiazi); accuracyChip(t.rate?.summary);
      const firstDay = new Date(S.me.user.createdAt).toDateString() === new Date().toDateString(); // nothing to tear on the day you joined
      if (t.jiazi?.fresh && t.prev && !firstDay && store.get('torn') !== t.date && !reduced()) leaf(t);
      else if (t.jiazi?.fresh) setTimeout(() => flyIn(t.jiazi.n), 500);
    } else if (store.get('guestSeen') !== localDay()) { store.set('guestSeen', localDay()); track('us_guest_today'); }
    extras();
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
  $('#week').innerHTML = strip.days.map((x) => { const t = parse(x.date); return `<button data-d="${x.date}" class="lv${x.day.level.k}${x.date === sel ? ' on' : ''}${x.date === today ? ' today' : ''}" aria-label="${fmt(x.date)}: ${level(x.day.level.k).word}">
    <span>${WEEK[t.getDay()][0]}</span><b>${t.getDate()}</b><i></i></button>`; }).join('');
  $$('#week button').forEach((b) => b.addEventListener('click', () => go(b.dataset.d, b.dataset.d > sel ? 1 : -1)));
}

let goId = 0;
async function go(date, dir) {
  const id = ++goId; // a newer move cancels a week still loading
  if (date === sel) return;
  buzz(6);
  if (!dayOf(date)) {
    let w;
    try { w = await data.week(date); } catch (e) { if (id === goId) toast(e.message); return; }
    if (id !== goId || !$('#daycard')) return;
    strip = w;
  }
  sel = date;
  renderWeek(); renderDay(true, dir);
}

function renderDay(animate, dir = 1) {
  if (!$('#daycard')) return; // left the page while loading
  const me = you(), today = localDay(), isToday = sel === today;
  const x = dayOf(sel), d = x.day, k = d.level.k, tone = x.line?.tone || toneOf(S.today?.chart, d.gz), th = theme(d.ssG, tone, sel), lv = level(k), dp = byGz(d.gz);
  $('#tdKicker').textContent = isToday ? 'Today' : sel === addDays(today, 1) ? 'Tomorrow' : sel === addDays(today, -1) ? 'Yesterday' : fmt(sel, 'md');
  $('#tdTitle').textContent = fmt(sel, 'full');
  const why = whyList(d.why), b = bestHour(d), w = worstHour(d);
  // the living painting: warm and glowing in a good hour, cooler in a weak one (today only)
  const now = isToday ? nowHour(d) : null;
  const glow = now ? (now.level.k >= 4 ? ' glow' : now.level.k <= 2 ? ' dim' : '') : '';
  const card = $('#daycard');
  card.innerHTML = `
    <div class="dc-art${glow}"><img src="${art(dp)}" alt="" width="720" height="720"><div class="tag"><span class="tagchip">${isToday ? 'Today' : fmt(sel, 'md')} · ${signName(dp)}</span></div>
      ${now ? `<span class="tagchip nowchip lv${now.level.k}"><i class="lvdot"></i>Now · ${level(now.level.k).word.toLowerCase()} hour</span>` : ''}</div>
    <div class="dc-body">
      <div class="scoreline lv${k}">${ring(d.score)}<div><div class="word">${lv.word}</div><div class="title">${esc(th.title)}</div><div class="rank">${weekRank(strip.days, sel)}</div></div></div>
      <button class="iconbtn share-day" id="shareDay" aria-label="Share this day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>
      <p class="dc-line">${esc(th.line)}</p>
      <div class="div meet"><div class="pair"><img src="${art(dp)}" alt=""><img src="${art(me)}" alt=""></div>
        <p><b>${signName(dp)}</b> meets your <b>${signName(me)}</b>: ${tenName(d.ssG)}, ${toneWord(tone)}.</p>
        <button class="why-btn" aria-expanded="false">Why</button></div>
      <div class="why" hidden>${why.map((y) => `<div class="wrow"><b class="${y.v >= 0 ? 'up' : 'down'}">${y.v >= 0 ? '+' : '−'}${Math.abs(y.v)}</b><div><p>${esc(y.en)}</p><small>${esc(y.t)}</small></div></div>`).join('')}
        <p class="hint">Scored from how the day's stem and branch meet your four pillars — the classical Ten Gods method. <a href="#/how">How Flow Day works</a></p></div>
      <div class="div glance">
        <button data-h="${b.i}"><span class="label">Best hours</span><b>${hourRange(b.i)}</b></button>
        <button data-h="${w.i}"><span class="label">Go easy</span><b>${hourRange(w.i)}</b></button>
        <button data-luck><span class="label">Lucky colors</span><span class="swatches">${(x.luck || []).map((c) => `<i style="background:${c.hex}"></i>`).join('')}</span></button>
      </div>
      ${bandHtml(d.hours, isToday)}
      <div class="div dodont"><div><p class="label">Do</p><ul>${th.do.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div>
        <div class="no"><p class="label">Skip</p><ul>${th.dont.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div></div>
    </div>`;
  if (animate && !reduced()) { card.classList.remove('in-l', 'in-r'); void card.offsetWidth; card.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
  countUp(card.querySelector('[data-count]'), d.score, 800);
  card.querySelector('.why-btn').addEventListener('click', (e) => {
    const btn = e.currentTarget, open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open)); card.querySelector('.why').hidden = !open; buzz(5);
    if (open) track('us_why');
  });
  $$('[data-h]', card).forEach((x2) => x2.addEventListener('click', () => dialSheet(d.hours, isToday, +x2.dataset.h)));
  card.querySelector('[data-luck]').addEventListener('click', () => toast('Wear or carry one of these colors to tune the day in your favor.'));
  card.querySelector('.band').addEventListener('click', () => dialSheet(d.hours, isToday));
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
// on a computer: the arrow keys move between days
addEventListener('keydown', (e) => {
  if (!$('#daycard') || !strip || !$('#sheet').hidden || /input|textarea/i.test(document.activeElement?.tagName || '')) return;
  if (e.key === 'ArrowRight') go(addDays(sel, 1), 1); else if (e.key === 'ArrowLeft') go(addDays(sel, -1), -1);
});

// ---------- the hour band: 12 two-hour blocks from 5 AM, a marker at now ----------
const ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
function bandHtml(hours, isToday) {
  const by = Object.fromEntries(hours.map((h) => [h.i, h]));
  const n = new Date(), frac = ((n.getHours() + n.getMinutes() / 60 - 5 + 24) % 24) / 24;
  const nowH = isToday ? by[hourNow()] : null;
  return `<button class="band" aria-label="Your hours — open the dial"><div class="bhead"><span>Your hours</span><span>${nowH ? `Now: <b>${level(nowH.level.k).word.toLowerCase()}</b>` : 'Tap to explore'}</span></div>
    <div class="segs">${ORDER.map((i) => `<i class="lv${by[i].level.k}${by[i].night ? ' night' : ''}"></i>`).join('')}${isToday ? `<span class="now" style="left:${(frac * 100).toFixed(2)}%"></span>` : ''}</div>
    <div class="ticks"><span>5 AM</span><span>11 AM</span><span>5 PM</span><span>11 PM</span></div></button>`;
}

// ---------- the full 24-hour dial, in a sheet ----------
const R1 = 118, R0 = 86, CX = 130;
const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [CX + r * Math.cos(a), CX + r * Math.sin(a)]; };
function arc(a0, a1) {
  const [x1, y1] = pt(a0, R1), [x2, y2] = pt(a1, R1), [x3, y3] = pt(a1, R0), [x4, y4] = pt(a0, R0);
  return `M${x1} ${y1} A${R1} ${R1} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${R0} ${R0} 0 0 0 ${x4} ${y4}Z`;
}
function dialSheet(hours, isToday, start) {
  const segs = hours.map((h) => { const a = ((h.i * 2 - 1 + 24) % 24) * 15; return `<path class="seg lv${h.level.k}${h.night ? ' night' : ''}" data-i="${h.i}" d="${arc(a + 1, a + 29)}"/>`; }).join('');
  const labels = [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p']].map(([h, l]) => { const [x, y] = pt(h * 15, 74); return `<text x="${x}" y="${y + 4}">${l}</text>`; }).join('');
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Your hours</h2><p class="muted" style="margin:0">Drag the hand around the day.</p>
    <div class="dial" id="dial"><svg viewBox="0 0 260 260">${segs}${labels}<g id="hand"><line x1="${CX}" y1="${CX}" x2="${CX}" y2="${CX - R1 - 4}"/><circle cx="${CX}" cy="${CX - R1 - 4}" r="9"/></g><circle cx="${CX}" cy="${CX}" r="4" class="pivot"/></svg></div>
    <div class="dial-read" id="dialRead"></div>`);
  track('us_dial');
  const svg = $('#dial svg'), hand = $('#hand');
  let cur = -1;
  const setAngle = (deg, fromUser) => {
    if (!document.contains(svg)) return;
    hand.setAttribute('transform', `rotate(${deg} ${CX} ${CX})`);
    const h = (deg / 15 + 24) % 24, i = Math.floor(((h + 1) % 24) / 2);
    if (i === cur) return; cur = i;
    const x = hours.find((y) => y.i === i), w = (x.why || []).find((y) => /^时干/.test(y.t || '')) || null;
    $('#dialRead').innerHTML = `<b>${hourRange(i)}</b><span class="lv${x.level.k}" style="color:var(--lv)">${level(x.level.k).word} hour</span>${x.ss ? `<p>${tenName(x.ss)} · ${w && w.v >= 0 ? 'fuels you' : 'drains you a little'}</p>` : ''}`;
    $$('#dial .seg').forEach((s) => s.classList.toggle('on', +s.dataset.i === i));
    if (fromUser) buzz(4);
  };
  const n = new Date(), deg0 = start != null ? ((start * 2 - 1 + 24) % 24) * 15 + 15 : isToday ? (n.getHours() + n.getMinutes() / 60) * 15 : 10 * 15;
  if (!reduced()) { const a = deg0 - 90, t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); setAngle(a + 90 * e); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  else setAngle(deg0);
  const angleOf = (e) => { const r = svg.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return ((Math.atan2(y, x) * 180 / Math.PI + 90) + 360) % 360; };
  let drag = false;
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); setAngle(angleOf(e), true); });
  svg.addEventListener('pointermove', (e) => { if (drag) setAngle(angleOf(e), true); });
  svg.addEventListener('pointerup', () => { drag = false; });
}

// ---------- below the card ----------
function renderBelow(x) {
  if (!$('#below')) return;
  const t = S.today, today = localDay(), isToday = sel === today;
  const night = isToday && (new Date().getHours() >= 18 || t?.rate?.today);
  const tm = t?.tomorrow, tmP = tm ? pillarOf(ymd(tm)) : null;
  $('#below').innerHTML = `
    ${night ? tonightHtml(t) : ''}
    ${isToday ? moodHtml(t) : ''}
    <div id="peopleSlot"></div><div id="promoSlot"></div>
    <div class="ahead">
      ${isToday && tm ? `<button class="card" id="tmr"><p class="label">Tomorrow</p><h3 class="h3"><span class="lvdot lv${tm.level.k}"></span> ${level(tm.level.k).word} · ${tm.score}</h3><p>${esc(theme(tm.ssG, toneOf(t.chart, tmP.cn), ymd(tm)).title)}</p></button>`
        : `<button class="card" id="backToday"><p class="label">Back to</p><h3 class="h3">Today</h3><p>${fmt(today, 'md')}</p></button>`}
      <a class="card" href="#/calendar"><p class="label">Plan something</p><h3 class="h3">Find your best day</h3><p>Interview, date, launch…</p></a>
    </div>`;
  if (isToday) { wireTonight(); wireMoods(); }
  $('#tmr')?.addEventListener('click', () => { go(addDays(today, 1), 1); scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#backToday')?.addEventListener('click', () => { go(today, -1); scrollTo({ top: 0, behavior: 'smooth' }); });
  if (extrasHtml != null) { $('#peopleSlot').innerHTML = extrasHtml.people; $('#promoSlot').innerHTML = extrasHtml.promo; wireExtras(); }
}

// ---------- tonight: how did today go? ----------
function tonightHtml(t) {
  const r = t.rate || {}, sm = r.summary || {}, acc = sm.rated >= 3 ? Math.round(sm.match / sm.rated * 100) : null;
  return `<div class="card tonight"><p class="label">Tonight</p>
    ${r.today ? `<h3 class="h3" style="margin-top:4px">You rated today ${S.C.ratings[r.today - 1].toLowerCase()}.</h3>
      <p class="muted" style="margin:4px 0 0;font-size:14px">${acc != null ? `This month Flow Day matched your days <b>${acc}%</b> of the time (${sm.match} of ${sm.rated}).` : `Rate a few more evenings and we'll show how often Flow Day matches your days.`}</p>`
    : `<h3 class="h3" style="margin-top:4px">How did today go?</h3><div class="rate" role="radiogroup">${S.C.ratings.map((w, i) => `<button data-s="${i + 1}" class="lv${i + 1}" aria-label="${w}"><i></i>${w}</button>`).join('')}</div>
      <p class="hint">Your ratings show how often Flow Day gets your days right.</p>`}</div>`;
}
function wireTonight() {
  $$('.rate button').forEach((b) => b.addEventListener('click', async () => {
    if (needAccount('Create a free account to rate your days — over time you see how often Flow Day gets them right.')) return;
    buzz(10); b.classList.add('on');
    try { const r = await api('POST', 'ratings', { day: localDay(), score: +b.dataset.s, note: '' }); S.today.rate = { ...(S.today.rate || {}), today: +b.dataset.s, summary: r.summary }; track('us_rate', { s: +b.dataset.s }); renderBelow(dayOf(sel)); }
    catch (e) { toast(e.message); }
  }));
}

// ---------- mood check-in ----------
function moodHtml(t) {
  const kit = t.moodKit, mine = (t.moods || []).filter((m) => m.day === localDay());
  if (!kit) return '';
  const colorOf = (k) => { const c = kit.colors.find((x) => x.key === k); return document.documentElement.dataset.theme === 'dark' ? c?.dark : c?.light; };
  const last = mine[mine.length - 1];
  return `<div class="card moods"><div class="sec-h" style="margin:0"><h3 class="h3">How do you feel?</h3><span class="small">${mine.length ? `Logged ${mine.length}× today` : 'Tap one'}</span></div>
    <div class="moodrow">${kit.moods.map((m) => `<button data-m="${m.key}" data-c="${m.color}" style="--mc:${colorOf(m.color)}"${last?.mood === m.key ? ' class="on"' : ''}><i></i>${S.C.moods[m.key] || m.key}</button>`).join('')}</div></div>`;
}
function wireMoods() {
  $$('.moodrow button').forEach((b) => b.addEventListener('click', async () => {
    if (needAccount('Create a free account to keep a mood log — it shows up on your calendar.')) return;
    buzz(8); b.classList.add('pick');
    try {
      const r = await api('POST', 'moods', { day: localDay(), mood: b.dataset.m, color: b.dataset.c, note: '' });
      S.today.moods = r.moods; track('us_mood', { m: b.dataset.m }); toast(`Noted: ${S.C.moods[b.dataset.m]}`); renderBelow(dayOf(sel));
    } catch (e) { toast(e.message); }
  }));
}

// ---------- share my day ----------
function shareDay(x, th, lv) {
  const d = x.day, dp = byGz(d.gz), best = bestHour(d);
  shareImage(() => drawCardPublic({ art: art(dp), el: elOf(you()), kicker: sel === localDay() ? 'My day' : fmt(sel, 'md'), title: `${lv.word} · ${d.score}`, sub: th.title,
    meta: `${fmt(sel, 'full')} · best ${hourRange(best.i)}`, body: th.line }), `flowday-${sel}.jpg`, 'day');
}

// ---------- yesterday's page: pull it down (or tap) to tear it off ----------
function leaf(t) {
  const p = t.prev, date = ymd(p), dp = byGz(p.gz);
  $('#leafSlot').innerHTML = `<div class="leaf" id="leaf" role="button" tabindex="0" aria-label="Tear off yesterday's page">
    <div class="n">${p.d}</div><div><p><b>Yesterday</b> · ${WEEK[parse(date).getDay()]}</p><p>${MONTHS[p.m - 1]} · ${signName(dp)}</p></div>
    <div class="pull"><img src="${art(dp)}" alt="" style="margin:0 0 4px auto"><span>↓</span> Tear off</div></div>`;
  const el = $('#leaf');
  let y0 = null, dy = 0;
  const tear = () => {
    store.set('torn', t.date); sfx('tear'); buzz(25); el.classList.add('gone'); track('us_tear');
    setTimeout(() => { $('#leafSlot') && ($('#leafSlot').innerHTML = ''); flyIn(t.jiazi.n); }, 550);
  };
  el.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
  el.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${dy * 0.6}px) rotate(${dy / 40}deg)`; });
  el.addEventListener('pointerup', () => { if (y0 == null) return; y0 = null; el.style.transition = ''; if (dy > 50 || dy < 4) tear(); else el.style.transform = ''; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tear(); });
}

// ---------- collecting: today's painting flies into the ring ----------
function flyIn(n) {
  const from = $('#daycard .dc-art img'), to = $('#collect');
  if (!from || !to) return;
  toast(`Collected today's painting · ${n} / 60`);
  if (reduced()) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), img = from.cloneNode();
  img.className = 'flyer'; Object.assign(img.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.appendChild(img);
  requestAnimationFrame(() => { Object.assign(img.style, { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(${36 / a.width})`, opacity: '.2', borderRadius: '50%' }); });
  setTimeout(() => { img.remove(); to.classList.remove('pop'); void to.offsetWidth; to.classList.add('pop'); buzz(12); sfx('chime'); if (n % 10 === 0) toast(n === 60 ? 'All 60 collected — the full cycle!' : `${n} of 60 — a milestone!`); }, 800);
}

// ---------- trust: how often Flow Day matched your days (after 3 rated evenings) ----------
function accuracyChip(sm) {
  if (!sm || sm.rated < 3 || $('.acc')) return;
  const pct = Math.round(sm.match / sm.rated * 100);
  $('#tdKicker').insertAdjacentHTML('afterend', `<button class="chip acc" title="From your evening ratings" style="margin:2px 0 4px">${pct}% match</button>`);
  $('.acc').addEventListener('click', () => toast(`Flow Day matched ${sm.match} of the ${sm.rated} evenings you rated this month`));
}

// ---------- your people today, and at most one tip a day ----------
// tips, in order: save your day (guests) → add to Home Screen (2nd day) → lock screen (3rd day) → invite a friend
let extrasHtml = null, extrasRun = 0, installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
async function extras() {
  const run = ++extrasRun; extrasHtml = null;
  let list = [];
  if (S.me) { try { list = (await api('GET', 'friends?brief=1')).list.filter((f) => f.today && f.pair); } catch {} }
  if (run !== extrasRun || !$('#daycard')) return;
  const name = (f) => (/[一-鿿]/.test(f.name) ? 'A friend' : f.name);
  let people = '';
  if (list.length) {
    const strong = list.filter((f) => f.today.them.k >= 4), both = list.filter((f) => f.today.them.k >= 4 && f.today.me.k >= 4);
    const line = both.length ? `A strong day for you and ${esc(name(both[0]))} — do something together.` : strong.length ? `${esc(name(strong[0]))} is having a strong day — lean on them.` : 'A quiet day all round. Check in on someone.';
    people = `<a class="card people" href="#/friends"><div class="sec-h" style="margin:0"><h3 class="h3">Your people today</h3><span class="go">›</span></div>
      <div class="faces">${list.slice(0, 6).map((f) => `<span class="face lv${f.today.them.k}"><img src="../${f.pair.art}" alt=""><i></i><em>${esc(name(f).slice(0, 8))}</em></span>`).join('')}</div><p class="small" style="margin:8px 0 0">${line}</p></a>`;
  }
  const days = new Set(store.get('days') || []); days.add(localDay()); store.set('days', [...days].slice(-30));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone, ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const off = store.get('tipOff') || {};
  const tips = [
    [!S.me, 'save', `<div class="card promo dark" data-tip="save"><button class="x" aria-label="Dismiss">×</button><h3 class="h3">Keep your days</h3><p class="muted" style="margin:4px 0 12px;font-size:14px">Create a free account to collect today's painting, log your mood and come back to your plans on any device.</p><button class="btn sm" id="tipSave" style="background:#F2F1EE;color:#16151A;border-color:#F2F1EE">Create a free account</button></div>`],
    [S.me && !standalone && days.size >= 2, 'a2hs', `<div class="card promo" data-tip="a2hs"><button class="x" aria-label="Dismiss">×</button><h3 class="h3">Add Flow Day to your Home Screen</h3><p class="muted" style="margin:4px 0 0;font-size:14px">Open your day in one tap, like an app.</p>
      ${installEvt ? '<button class="btn sm" id="doInstall" style="margin-top:10px">Add to Home Screen</button>' : ios ? '<ol class="steps"><li>Tap <b>Share</b> in Safari</li><li>Choose <b>Add to Home Screen</b></li></ol>' : '<p class="small" style="margin:6px 0 0">Browser menu → <b>Install app</b> or <b>Add to Home screen</b>.</p>'}</div>`],
    [S.me && days.size >= 3 && !store.get('lsPromo'), 'lock', `<a class="card promo dark" data-tip="lock" href="#/lockscreen"><button class="x" aria-label="Dismiss">×</button><h3 class="h3">Your lock screen, repainted every morning</h3><p class="muted" style="margin:4px 0 0;font-size:14px">Set it once — your phone wakes up to the day's painting and your best hours.</p></a>`],
    [S.me && !list.length, 'invite', `<div class="card promo" data-tip="invite"><button class="x" aria-label="Dismiss">×</button><h3 class="h3">See the painting you make with a friend</h3><p class="muted" style="margin:4px 0 10px;font-size:14px">Every pair of signs has its own. Send your link — you both see yours.</p><a class="btn sm ghost" href="#/friends">Invite a friend</a></div>`],
  ].filter(([ok, key]) => ok && off[key] !== localDay() && !(key !== 'save' && off[key] === 'never'));
  extrasHtml = { people, promo: tips[0]?.[2] || '' };
  if ($('#peopleSlot')) { $('#peopleSlot').innerHTML = extrasHtml.people; $('#promoSlot').innerHTML = extrasHtml.promo; wireExtras(); }
}
function wireExtras() {
  const tip = $('#promoSlot [data-tip]'); if (!tip) return;
  const key = tip.dataset.tip;
  tip.querySelector('.x').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const off = store.get('tipOff') || {}; off[key] = key === 'save' ? localDay() : 'never'; store.set('tipOff', off); if (key === 'lock') store.set('lsPromo', 1); tip.remove(); });
  $('#tipSave')?.addEventListener('click', () => needAccount());
  $('#doInstall')?.addEventListener('click', async () => { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); track('us_install', { r: r?.outcome }); tip.remove(); });
  track('us_tip', { key });
}

// the two-hour slot happening now; after 11 PM that's tomorrow's first slot
function nowHour(d) {
  if (new Date().getHours() === 23) { const t = dayOf(addDays(localDay(), 1)); if (t) return t.day.hours.find((h) => h.i === 0); }
  return d.hours.find((h) => h.i === hourNow());
}
// keep the living painting and the band in step with the clock while Today is open
let lastSlot = hourNow();
setInterval(() => {
  const s = new Date().getHours() === 23 ? 'late' : hourNow();
  if (s === lastSlot) return; lastSlot = s;
  if ($('#daycard') && sel === localDay() && dayOf(sel)) renderDay(false);
}, 60000);
