// You (from the avatar): your sign and numbers, the four pillars, your elements and what fuels you, the ten-year cycles
// with what this one means. Also the collection of 60, all 60 signs, a sign's page, your month, the living lock screen,
// how Flow Day works, and the terms.
import { $, $$, esc, S, api, store, track, toast, reduced, localDay, fmt, byGz, bySlug, pillarOf, signName, fullName, stemOf, elOf, art, elStyle, chipEl,
  WX, EL, GAN, ZHI, ANIMAL, loading, failed, countUp, you, data, shishen, tenName, toneOf } from './core.js';
import { shareSign, sharePair, shareImage } from './share.js';
import { needAccount } from './onboard.js';
import { editBirth } from './settings.js';

const view = () => $('#view');
const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';

// ---------- You ----------
export async function pageMe() {
  const p = you(), u = S.me?.user;
  view().innerHTML = `<div class="page split" style="${elStyle(elOf(p))}">
    <div class="cols"><div>
      <div class="card">
        <div class="profile"><img src="${art(p)}" alt=""><div><p class="label">${esc(u?.nickname || 'Your sign')}</p><div class="name">${signName(p)}</div><p>${esc(p.name)}</p></div><a class="iconbtn" href="#/settings" aria-label="Settings">${GEAR}</a></div>
        ${S.me ? `<div class="div stats"><a href="#/collection"><b id="meCol">·</b><span>of 60 collected</span></a><a href="#/friends"><b id="meFr">·</b><span>friends</span></a><a href="#/recap"><b>✦</b><span>your month</span></a></div>`
          : `<div class="div"><p class="small" style="margin:0 0 10px">You're using Flow Day without an account — your birthday stays on this phone.</p><div class="btnrow"><button class="btn sm" id="meSave">Create a free account</button><a class="btn sm ghost" href="#/signin">Sign in</a></div></div>`}
      </div>
      <div class="sec"><div class="sec-h"><h2 class="h3">Your four pillars</h2><a href="#/how">What's this?</a></div><div id="pillars">${loading(84)}</div></div>
      <div class="sec" id="decadesSec"></div>
    </div>
    <div>
      <div class="sec-h"><h2 class="h3">Your elements</h2></div>
      <div class="card" id="elemsCard">${loading(220)}</div>
      <div class="card linklist" style="margin-top:12px">
        <a href="#/sign/${p.slug}">Your sign page <small>›</small></a>
        ${S.me ? '<a href="#/collection">Your 60 paintings <small>›</small></a>' : ''}
        <a href="#/sixty">All 60 signs <small>›</small></a>
        ${S.me ? '<a href="#/lockscreen">Living lock screen <small>›</small></a>' : ''}
        <a href="#/how">How Flow Day works <small>›</small></a>
        <a href="#/settings">Settings <small>›</small></a>
      </div>
    </div></div></div>`;
  $('#meSave')?.addEventListener('click', () => needAccount());
  if (S.me) {
    api('GET', 'jiazi').then((j) => countUp($('#meCol'), j.n, 600)).catch(() => {});
    api('GET', 'friends').then((f) => countUp($('#meFr'), f.list.length, 600)).catch(() => {});
  }
  try {
    const t = S.today && S.today.date === localDay() ? S.today : await data.today(localDay());
    if (!$('#pillars')) return;
    S.today = t;
    const ch = t.chart, card = t.card, names = ['Year', 'Month', 'Day', 'Hour'];
    const cell = (gz, i) => { const g = GAN.indexOf(gz[0]), z = ZHI.indexOf(gz[1]); return `<button class="pillar${i === 2 ? ' day' : ''}" data-gz="${gz}"><p class="label">${i === 2 ? 'Day · you' : names[i]}</p><b>${EL[g >> 1]} ${ANIMAL[z]}</b><span>${g % 2 ? 'Yin' : 'Yang'}</span><div class="cjk">${gz}</div></button>`; };
    $('#pillars').innerHTML = `<div class="pillars">${ch.pillars.map(cell).join('')}${ch.pillars.length < 4 ? `<button class="pillar" data-add="time"><p class="label">Hour</p><b>?</b><span>Add time</span></button>` : ''}</div>
      <p class="hint">Year, month, day and hour of your birth each have a sign. Your day sign is you; the others color it.${card.basis?.solar ? ` Calculated at local solar time, ${card.basis.time}.` : ''}</p>`;
    $$('#pillars [data-gz]').forEach((x) => x.addEventListener('click', () => { location.hash = `#/sign/${byGz(x.dataset.gz).slug}`; }));
    $('#pillars [data-add]')?.addEventListener('click', () => editBirth('time'));
    const force = card.force || [];
    $('#elemsCard').innerHTML = `<div class="elems"><div class="penta-wrap">${pentagon(force)}</div>
      <div><h3 class="h3">${card.strong ? 'You run strong' : 'You run gentle'}</h3><p class="small" style="margin:4px 0 12px;color:var(--ink-2)">${esc((card.strong ? S.C.strength.strong : S.C.strength.weak).replace(/^You run (strong|gentle): (.)/, (m, w, c) => c.toUpperCase()))}</p>
        <p class="label" style="margin-bottom:8px">What fuels you</p><div class="fuels">${(card.lucky || []).map((x) => { const e = S.C.elements[WX[x]]; return `<div class="fuel"><i style="background:${e.color}"></i><div><b>${WX[x]}</b><p>${e.fuels}</p></div></div>`; }).join('')}</div></div></div>`;
    if (!reduced()) requestAnimationFrame(() => $('#elemsCard .penta-wrap')?.classList.add('go'));
    else $('#elemsCard .penta-wrap')?.classList.add('go');
    decades(ch);
  } catch (e) { $('#pillars') && ($('#pillars').innerHTML = failed(e.message)); }
}
// the ten-year cycles: a row to scroll, this one in the middle, and a line on what it means
function decades(ch) {
  const box = $('#decadesSec'); if (!box) return;
  const birthYear = +(S.me?.user.birth?.date || S.guest?.birth?.date || '').slice(0, 4), year = new Date().getFullYear();
  if (!ch.gender || !ch.dayuns?.length) {
    box.innerHTML = `<div class="sec-h"><h2 class="h3">Your ten-year cycles</h2></div><div class="card row-link" style="grid-template-columns:1fr auto"><p class="small" style="margin:0;color:var(--ink-2)">Every ten years the backdrop of your life shifts to a new sign. Add your sex at birth to see yours — it sets the direction of the cycles.</p><button class="btn sm ghost" id="addSex">Add</button></div>`;
    $('#addSex').addEventListener('click', () => editBirth('sex'));
    return;
  }
  const list = ch.dayuns.slice(0, 8), now = list.find((c) => year >= c.startYear && year <= c.endYear) || list[0], np = byGz(now.gz);
  const ten = shishen(ch.dm, now.gz[0]), tone = toneOf(ch, now.gz);
  box.innerHTML = `<div class="sec-h"><h2 class="h3">Your ten-year cycles</h2></div>
    <div class="decades" id="decs">${list.map((c) => { const cp = byGz(c.gz), on = c === now; return `<a class="decade${on ? ' now' : ''}" href="#/sign/${cp.slug}"><img src="${art(cp)}" alt="" loading="lazy"><b>Age ${c.startYear - birthYear}–${c.endYear - birthYear}</b><span${on ? ' class="tag2"' : ''}>${on ? 'Now · ' : ''}${signName(cp)}</span><span>${c.startYear}–${c.endYear}</span></a>`; }).join('')}</div>
    <p class="nowline"><b>Now: ${signName(np)}, ${now.startYear}–${now.endYear}.</b> ${esc(S.C.decades[ten] || '')} <span class="small">${tenName(ten)} · ${tone === 'xi' ? 'a tailwind for you' : tone === 'ji' ? 'asks more of you' : 'neutral for you'}.</span></p>`;
  const el = $('#decs .now'); if (el) $('#decs').scrollLeft = el.offsetLeft - ($('#decs').clientWidth - el.clientWidth) / 2;
}
// the five elements as a pentagon: each point pulled out by its share
function pentagon(force) {
  const pct = Object.fromEntries(force.map((f) => [WX[f.el], f.pct])), max = Math.max(40, ...Object.values(pct));
  const P = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [150 + r * Math.cos(a), 132 + r * Math.sin(a)]; };
  const outer = EL.map((_, i) => P(i, 92)), shape = EL.map((e, i) => P(i, 16 + 76 * (pct[e] || 0) / max));
  return `<svg viewBox="0 0 300 262" class="penta-me">
    <polygon points="${outer.map((x) => x.join(',')).join(' ')}" class="frame"/>
    ${EL.map((_, i) => `<line x1="150" y1="132" x2="${outer[i][0]}" y2="${outer[i][1]}" class="spoke"/>`).join('')}
    <polygon points="${shape.map((x) => x.join(',')).join(' ')}" class="shape"/>
    ${EL.map((e, i) => { const [x, y] = P(i, 114); return `<circle cx="${shape[i][0]}" cy="${shape[i][1]}" r="5" fill="${S.C.elements[e].color}"/><text x="${x}" y="${y + 4}">${e} <tspan>${pct[e] ?? 0}%</tspan></text>`; }).join('')}
  </svg>`;
}

export function applyTheme() {
  const t = store.get('theme') || 'auto', dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#111114' : '#F6F5F1');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- all 60 signs ----------
export function pageSixty() {
  const t = pillarOf(localDay()), mine = you();
  view().innerHTML = `<div class="page wide"><h1 class="display" style="margin-top:6px;font-size:clamp(36px,9vw,52px)">All 60 signs</h1>
    <p class="lede">One for every day in the cycle — and one for everyone. ${mine ? 'Yours is outlined.' : 'Which one is yours?'}</p>
    <div class="grid">${S.C.pillars.map((x) => `<a href="#/sign/${x.slug}"${mine?.slug === x.slug ? ' class="mine"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="180" height="180">
      <div class="nm">${signName(x)}</div><div class="sub">${x.slug === t.slug ? 'Today' : mine?.slug === x.slug ? 'You' : esc(x.name)}</div></a>`).join('')}</div></div>`;
}

// ---------- your collection of 60 ----------
export async function pageCollection() {
  view().innerHTML = `<div class="page wide"><p class="label" style="margin-top:6px">Your 60</p><h1 class="display" id="colTitle" style="font-size:clamp(36px,9vw,52px)">·</h1>
    <p class="lede">Every day has one of 60 paintings. Open Flow Day on a day to collect its painting — the whole cycle takes 60 days.</p><div id="colBar"></div><div class="grid wall" id="wall">${loading(300)}</div></div>`;
  try {
    const j = await api('GET', 'jiazi'), got = new Map(j.list.map((x) => [x.gz, x.day])), today = pillarOf(localDay());
    $('#colTitle').innerHTML = `<span data-n>0</span> <em>of 60</em>`; countUp($('[data-n]'), j.n, 800);
    $('#colBar').innerHTML = `<div class="card" style="margin-top:14px"><div class="progress"><i style="--w:${Math.round(j.n / 60 * 100)}%"></i></div>
      ${j.n >= 60 ? '<button class="btn block" id="poster" style="margin-top:12px">Download your full-cycle poster</button>' : `<p class="small" style="margin:8px 0 0">Collect all 60 to unlock your full-cycle poster — ${60 - j.n} to go.</p>`}</div>`;
    requestAnimationFrame(() => $('.progress i')?.classList.add('grow'));
    $('#poster')?.addEventListener('click', () => shareImage(posterOf, 'flowday-full-cycle.jpg', 'poster'));
    $('#wall').innerHTML = S.C.pillars.map((x, i) => { const has = got.has(x.cn); return `<a href="#/sign/${x.slug}" class="${has ? 'has' : 'empty'}${x.slug === today.slug ? ' now' : ''}" style="--i:${i}">
      ${has ? `<img src="${art(x)}" alt="" loading="lazy" width="180" height="180">` : `<span class="ph">${x.no}</span>`}<div class="nm">${signName(x)}</div><div class="sub">${has ? fmt(got.get(x.cn), 'md') : x.slug === today.slug ? 'Today' : 'Not yet'}</div></a>`; }).join('');
  } catch (e) { $('#wall').innerHTML = failed(e.message); }
}

// ---------- a sign, for anyone: #/sign/slug ----------
export function pageSign(slug, reveal) {
  const p = bySlug(slug); if (!p) { location.hash = '#/'; return; }
  const mine = you()?.slug === slug, s = stemOf(p), today = pillarOf(localDay()), has = !!you();
  view().innerHTML = `<div class="page wide sign${reveal ? ' reveal' : ''}" style="${elStyle(elOf(p))}">
    <div class="left"><div class="art"><img src="${art(p)}" alt="${esc(p.name)}" width="720" height="720"></div></div>
    <div class="right after"><div class="sign-name" style="margin-top:16px"><p class="label">${mine ? 'Your sign' : today.slug === slug ? 'Today’s sign' : `Sign ${p.no} of 60`}</p>
        <h1 class="display">${signName(p)}</h1><p class="poetic">${esc(p.name)}</p>
        <div class="chips">${chipEl(elOf(p), `${s.polarity} ${elOf(p)}`)}<span class="chip">${p.animal}</span><span class="chip">No. ${p.no} of 60</span></div></div>
      <p class="intro">${esc(p.intro)}</p>
      <div class="chips" style="margin-top:14px">${s.traits.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
      <p class="cn-note">In the Chinese calendar this sign is <span class="cjk">${p.cn}</span> (${p.py}) — ${fullName(p)}.</p>
      <div class="btns">${mine ? '<button class="btn block" id="shareSign">Share my sign</button><a class="btn ghost block" href="#/today">Back to my day</a>' : `<a class="btn block" href="${has ? '#/today' : '#/'}">${has ? 'Back to my day' : 'Find your sign'}</a>`}</div></div></div>`;
  $('#shareSign')?.addEventListener('click', () => shareSign(p));
}

// ---------- how Flow Day works ----------
export function pageHow() {
  view().innerHTML = `<div class="page how"><p class="label" style="margin-top:6px">How Flow Day works</p><h1 class="display" style="font-size:clamp(36px,9vw,50px)">An old calendar, <em>read for you.</em></h1>
    <h3 class="h3">60 signs, one for every day</h3><p>For over 3,000 years the Chinese calendar has named every day with one of 60 signs. Each sign joins one of ten "stems" (Wood, Fire, Earth, Metal or Water, in a Yang and a Yin form) with one of twelve animals. After 60 days the cycle starts again.</p>
    <h3 class="h3">Your sign</h3><p>Your sign is the sign of the day you were born. Your year, month and hour of birth have signs too — together they are your four pillars, and they decide how much of each element you carry.</p>
    <h3 class="h3">How a day treats you</h3><p>Each day's sign meets yours. The classical "Ten Gods" name the ten ways two stems can meet — Structure, Support, Opportunity, Competition and so on — and whether the day's element fuels you or drains you. Harmonies and clashes with your other pillars add or take away points. That gives the score, the level (Excellent to Low-key), and the theme.</p>
    <h3 class="h3">Hours, months and best days</h3><p>Every two-hour block has its own sign, scored the same way — that's your best hours. The best-day finder scores the days ahead for what you're planning and sets aside days that clash with your chart or that the old almanac marks as wrong for it.</p>
    <h3 class="h3">Ten-year cycles</h3><p>Your life also moves through signs, one every ten years, counted from your month of birth. Their direction depends on your sex at birth and your year sign.</p>
    <h3 class="h3">The Daily Oracle</h3><p>The oracle follows the temple ritual: draw one of 100 lots, then toss two moon blocks — one up and one down means yes. Its verses are rewritten in English for today.</p>
    <h3 class="h3">What it is and isn't</h3><p>Flow Day is for reflection and fun. It's a way to notice your days, not a prediction and not advice. Every evening you can rate how the day really went; over time you'll see how often it matches.</p>
    <div class="btns"><a class="btn block" href="${you() ? '#/today' : '#/'}">${you() ? 'Back to my day' : 'Find your sign'}</a></div></div>`;
}

// ---------- terms and privacy ----------
const LEGAL = {
  terms: ['Terms of Use', `
    <p>Flow Day is a daily calendar and reflection app based on the traditional Chinese sexagenary calendar. By creating an account you agree to these terms.</p>
    <h3 class="h3">For reflection and fun</h3><p>Readings, scores, best days and pairings are generated from calendar rules. They are not predictions and not medical, legal, financial or professional advice. Please make important decisions with your own judgment.</p>
    <h3 class="h3">Your account</h3><p>You must be 13 or older. Keep your password private. You can delete your account at any time in Settings.</p>
    <h3 class="h3">Fair use</h3><p>Don't misuse the service, try to break it, or scrape it. We may suspend accounts that do.</p>
    <h3 class="h3">Flow Day Plus</h3><p>Paid features, when offered, are billed by Gumroad as the merchant of record. Subscriptions renew automatically until you cancel from your Gumroad receipt. During the beta, everything is free.</p>
    <h3 class="h3">Changes</h3><p>We may update the service and these terms. If the changes are significant we will tell you in the app.</p>`],
  privacy: ['Privacy Policy', `
    <p>We keep this short and plain.</p>
    <h3 class="h3">Without an account</h3><p>Your birth details stay on your phone. They are sent to our server only to calculate your readings, and we don't store them.</p>
    <h3 class="h3">With an account</h3><p>Your email and password (stored hashed), your birth date and optionally birth time, birth place and sex at birth, the first name you choose, and what you do in the app (like which days you open it). We also record anonymous usage events to understand which features help.</p>
    <h3 class="h3">Why</h3><p>Only to calculate your readings, remember your collection and friends, and improve Flow Day. We don't sell your data or use it for advertising.</p>
    <h3 class="h3">Friends</h3><p>When you connect with a friend, each of you sees your sign and the painting you make together — never each other's birthday.</p>
    <h3 class="h3">Deleting</h3><p>Delete your account any time in Settings; we remove your data from our database right away (backups roll over within 14 days).</p>
    <h3 class="h3">Children</h3><p>Flow Day is not for children under 13, and we don't knowingly collect their information.</p>
    <h3 class="h3">Contact</h3><p>Questions or requests: use the feedback option in Settings.</p>`],
};
export function pageLegal(kind) {
  const [title, body] = LEGAL[kind] || LEGAL.terms;
  view().innerHTML = `<div class="page legal"><p class="label" style="margin-top:6px">Last updated November 26, 2026</p><h1 class="display" style="font-size:clamp(36px,9vw,50px)">${title}</h1>${body}</div>`;
}

// ---------- your month: #/recap ----------
export async function pageRecap(month) {
  view().innerHTML = `<div class="page">${loading(420)}</div>`;
  let r;
  try { r = await api('GET', 'recap' + (month ? `?month=${month}` : '')); } catch (e) { view().innerHTML = `<div class="page">${failed(e.message)}</div>`; return; }
  const name = new Date(r.y, r.m - 1, 1).toLocaleString('en-US', { month: 'long' });
  const counts = {}; (r.moods || []).forEach((m) => { const k = m.key || m.mood; counts[k] = (counts[k] || 0) + (m.n || 1); });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const best = r.best && r.best.day ? r.best : null, prev = new Date(r.y, r.m - 2, 1), next = new Date(r.y, r.m, 1);
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  view().innerHTML = `<div class="page recap" style="${elStyle(elOf(you()))}">
    <div class="monthbar"><a class="navbtn" href="#/recap?m=${ym(prev)}" aria-label="Previous month">‹</a><p class="label">${r.inProgress ? 'So far this month' : 'Your month'}</p>${r.inProgress ? '<span class="navbtn ghostspace"></span>' : `<a class="navbtn" href="#/recap?m=${ym(next)}" aria-label="Next month">›</a>`}</div>
    <h1 class="display">Your ${name}</h1>
    <div class="card stats" style="margin-top:16px"><a><b data-n="${r.opened}">0</b><span>days opened</span></a><a><b data-n="${r.arts.length}">0</b><span>paintings</span></a><a><b data-n="${r.lots}">0</b><span>oracle lots</span></a></div>
    ${r.arts.length ? `<div class="sec"><div class="sec-h"><h2 class="h3">Collected in ${name}</h2></div><div class="miniwall">${r.arts.map((a, i) => `<img src="${art(byGz(a.gz))}" alt="" style="--i:${i}" loading="lazy">`).join('')}</div></div>` : ''}
    <div class="card linklist" style="margin-top:16px">
      ${best ? `<a href="#/today?d=${best.day}"><span>Strongest day</span><small>${fmt(best.day, 'md')} · ${best.score} ›</small></a>` : ''}
      ${top ? `<div class="setrow"><span>Most-felt mood</span><small>${S.C.moods[top[0]] || top[0]} · ${top[1]}×</small></div>` : ''}
      ${r.match?.rated >= 3 ? `<div class="setrow"><span>How often Flow Day matched</span><small>${Math.round(r.match.match / r.match.rated * 100)}% · ${r.match.match} of ${r.match.rated}</small></div>` : ''}
    </div>
    <button class="btn block" id="recapShare" style="margin-top:18px">Share my ${name}</button></div>`;
  $$('[data-n]').forEach((x) => countUp(x, +x.dataset.n, 800));
  $('#recapShare').addEventListener('click', () => sharePair({ art: art(best ? pillarOf(best.day) : you()), el: elOf(you()), kicker: `My ${name}`, title: `${r.opened} days · ${r.arts.length} paintings`, sub: `${signName(you())} on Flow Day`, meta: best ? `Strongest day: ${fmt(best.day, 'md')}` : 'Flow Day', body: 'Every day has one of 60 paintings. Collect them all — one a day.' }));
  track('us_recap');
}

// ---------- the full-cycle poster (unlocks at 60 / 60) ----------
async function posterOf() {
  const W = 1200, cols = 6, cell = 180, gap = 12, top = 190, cv = document.createElement('canvas');
  cv.width = W; cv.height = top + 10 * (cell + gap) + 150;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#F6F5F1'; ctx.fillRect(0, 0, cv.width, cv.height);
  await document.fonts.load("400 80px 'Instrument Serif'");
  ctx.fillStyle = '#16151A'; ctx.font = "400 84px 'Instrument Serif'"; ctx.fillText('My 60', 60, 120);
  ctx.font = "italic 400 40px 'Instrument Serif'"; ctx.fillStyle = '#57545A'; ctx.fillText('The full cycle, one painting a day', 420, 118);
  const x0 = (W - cols * cell - (cols - 1) * gap) / 2;
  await Promise.all(S.C.pillars.map((p, i) => new Promise((ok) => { const im = new Image(); im.onload = () => { const x = x0 + (i % cols) * (cell + gap), y = top + Math.floor(i / cols) * (cell + gap); ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cell, cell, 14); ctx.clip(); ctx.drawImage(im, x, y, cell, cell); ctx.restore(); ok(); }; im.onerror = ok; im.src = art(p); })));
  ctx.fillStyle = '#16151A'; ctx.font = '600 26px Inter'; ctx.fillText('mindflow.zone/sixty', 60, cv.height - 60);
  return cv;
}

// ---------- the living lock screen: #/lockscreen ----------
export async function pageLockscreen() {
  view().innerHTML = `<div class="page lockscreen">${loading(420)}</div>`;
  let token;
  try { token = (await api('GET', 'us/wallpaper-link')).token; } catch (e) { view().innerHTML = `<div class="page">${failed(e.message)}</div>`; return; }
  store.set('lsPromo', 1);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const url = `${location.origin}${location.pathname.replace(/us\/(index\.html)?$/, '')}api/us/wallpaper/${token}.jpg?tz=${encodeURIComponent(tz)}&w=${Math.round(screen.width * (devicePixelRatio || 1))}&h=${Math.round(screen.height * (devicePixelRatio || 1))}`; // sized to this phone's screen
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  view().innerHTML = `<div class="page lockscreen" style="${elStyle(elOf(you()))}">
    <p class="label" style="margin-top:6px">Living lock screen</p><h1 class="display" style="font-size:clamp(34px,9vw,48px)">Wake up to <em>your day.</em></h1>
    <p class="lede">Every morning your lock screen becomes the day's painting, with your level and best hours. Set it up once.</p>
    <div class="phone"><img src="${url}&v=${Date.now()}" alt="Today's lock screen"><div class="clock"><b>9:41</b><span>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span></div></div>
    <div class="sec"><div class="sec-h"><h2 class="h3">${ios ? 'On your iPhone (one minute)' : 'On iPhone'}</h2></div>
      <ol class="steps">
        <li>Copy your personal link<button class="btn block" id="copyWall" style="margin-top:8px">Copy my lock screen link</button></li>
        <li>Open the <b>Shortcuts</b> app → <b>Automation</b> → <b>+</b> → <b>Time of Day</b>: 7:00 AM, <b>Daily</b>, and choose <b>Run Immediately</b>.</li>
        <li>Add the action <b>Get Contents of URL</b> and paste your link.</li>
        <li>Add the action <b>Set Wallpaper</b> (or <b>Set Wallpaper Photo</b>), choose <b>Lock Screen</b>, and turn off <b>Show Preview</b>.</li>
        <li>Tap <b>Done</b>. Tomorrow at 7 your lock screen repaints itself.</li>
      </ol></div>
    <div class="sec"><div class="sec-h"><h2 class="h3">Android, or just today</h2></div><a class="btn ghost block" href="${url}" download="flowday-today.jpg" id="dlWall">Download today's lock screen</a>
      <p class="hint">Your link only opens this daily image — never your birthday, calendar or plans. It's set to your time zone (${esc(tz)}); if you move or travel for a while, copy it again.</p>
      <button class="linkbtn" id="resetWall">Reset my link</button></div></div>`;
  $('#copyWall').addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link', url); } track('us_lock_copy'); });
  $('#dlWall').addEventListener('click', () => track('us_lock_download'));
  $('#resetWall').addEventListener('click', async () => {
    if (!confirm('Make a new link? The old one stops working, so you will need to update your Shortcut.')) return;
    try { await api('POST', 'us/wallpaper-link/reset'); toast('New link ready — copy it into your Shortcut'); pageLockscreen(); } catch (e) { toast(e.message); }
  });
  track('us_lock_view');
}
