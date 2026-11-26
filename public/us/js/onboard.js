// First visit: landing → birthday (on a wheel) → the short "reading your chart" sequence → one reveal screen with
// today for you → use the app as a guest. An account is asked for only when something needs saving.
// Also sign in, password reset, a friend's invite link, and the "add your birthday" step.
import { $, esc, S, api, pillarOf, ageOf, store, track, toast, buzz, reduced, localDay, fmt, byGz, signName, aSign, fullName, stemOf, elOf, art, elStyle, chipEl,
  openSheet, closeSheet, WX, EL, anonId, countUp, data, level, theme, toneOf, bestHour, hourRange, ring } from './core.js';
import { dateField, wireDateField, pickTime, pickCity, timeLabel } from './pickers.js';
import { shareSign } from './share.js';

const view = () => $('#view');
const FEATURES = [
  ['Your sign', 'One of 60, with its own painting and character.', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="2" fill="currentColor"/>'],
  ['Your day, read', 'Your energy, best hours and why — every day.', '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'],
  ['Your best days', 'Interview, first date, launch: see when.', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 14l2 2 4-4"/>'],
  ['You & your people', 'Every pair of signs makes its own painting.', '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>'],
];

// ---------- landing ----------
export function pageLanding() {
  const t = pillarOf(localDay());
  view().innerHTML = `
    <div class="page landing split">
      <div>
        <span class="chip kicker"><span class="dot" style="background:var(--fire)"></span>60 signs · one for every day</span>
        <h1 class="display">There are 60 kinds of days. <em>And 60 kinds of people.</em></h1>
        <p class="lede">An ancient calendar gives every day — and everyone — one of 60 signs. Find yours, then plan your days around it.</p>
        <form class="card ask" id="birthForm"><label class="label" for="bday" style="display:block;margin-bottom:8px">Your birthday</label>
          <div class="row">${dateField('bday')}<button class="btn" type="submit">Find my sign</button></div>
          <p class="err"></p><p class="hint">Free · no sign-up needed · <a href="#/signin">I have an account</a></p></form>
      </div>
      <div class="art hero"><img src="${art(t)}" alt="" width="720" height="720"><div class="tag"><span class="tagchip">Today · ${signName(t)}</span></div></div>
      <div class="more">
        <div class="sec features">${FEATURES.map(([h, p, ic]) => `<div class="feature"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${ic}</svg></span><h3 class="h3">${h}</h3><p>${p}</p></div>`).join('')}</div>
        <div class="sec"><div class="sec-h"><h2 class="h3">All 60 signs</h2><a href="#/sixty">See all ›</a></div>
          <div class="strip"><div class="track">${[...S.C.pillars, ...S.C.pillars].map((x, i) => `<a href="#/sign/${x.slug}"${i >= 60 ? ' aria-hidden="true" tabindex="-1"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="104" height="104"><span>${signName(x)}</span></a>`).join('')}</div></div></div>
      </div>
    </div>`;
  const f = $('#birthForm'), field = $('#bday'), err = f.querySelector('.err');
  const go = async () => {
    if (!field.dataset.v) { field.click(); return; }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; err.textContent = '';
    try { await startReveal({ date: field.dataset.v }); } catch (x) { err.textContent = x.message; btn.disabled = false; }
  };
  wireDateField(field, () => { buzz(6); go(); }); // picking the date is enough to go on
  f.addEventListener('submit', (e) => { e.preventDefault(); go(); });
}

// ---------- the reading sequence (about 4 seconds; tap to skip) ----------
// Sun's ecliptic longitude (low-precision formula, good to ~0.01°) and Julian Day for noon of the birth date
function sky(date) {
  const ms = Date.parse(date + 'T12:00:00Z'), jd = ms / 864e5 + 2440587.5, n = jd - 2451545;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
  const lam = ((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360 + 360) % 360;
  const SIGNS = 'Aries Taurus Gemini Cancer Leo Virgo Libra Scorpio Sagittarius Capricorn Aquarius Pisces'.split(' ');
  return { jd, lam, west: SIGNS[Math.floor(lam / 30)] };
}
// birth: { date, time?, city?, gender? }; opts.invite: the friend's code when coming from an invite
export async function startReveal(birth, opts = {}) {
  const { card } = await api('POST', 'preview/card', { birth });
  const p = byGz(card.pillar.gz);
  store.set('reveal', { birth, gz: card.pillar.gz, invite: opts.invite || null });
  if (ageOf(birth.date) >= 13) setGuest({ birth, gz: card.pillar.gz, invite: opts.invite || null });
  track('us_reveal', { sign: p.slug, from: opts.invite ? 'invite' : 'home' });
  if (!reduced() && !opts.quick) await theater(birth, card, p);
  if (!opts.stay) location.hash = '#/reveal';
}
// the guest: a birthday kept on this phone; the app works without an account
export function setGuest(g) { store.set('guest', g); S.guest = { ...g, p: byGz(g.gz) }; }
function theater(birth, card, p) {
  return new Promise((done) => {
    const s = sky(birth.date), idx = p.no - 1, C = S.C, born = card.born || {};
    const lines = [
      ['Julian Day', s.jd.toFixed(1)],
      ['Day in the 60-day cycle', `No. ${p.no} · ${p.cn}`],
      ['Sun', `${s.lam.toFixed(1)}° ecliptic · ${s.west}`],
      ['Solar term', born.term ? `${C.seasons[born.term] || born.term} + ${born.days} day${born.days === 1 ? '' : 's'}` : '—'],
      ['Moon', C.moons[born.moon] || '—'],
      ...(card.basis?.solar ? [['Local solar time', `${card.basis.time} · ${card.basis.city}`]] : []),
    ];
    const pct = Object.fromEntries((card.force || []).map((f) => [WX[f.el], f.pct]));
    const pts = EL.map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [150 + 108 * Math.cos(a), 150 + 108 * Math.sin(a)]; });
    const ticks = Array.from({ length: 60 }, (_, i) => { const a = i * 6 * Math.PI / 180, r1 = i % 5 ? 128 : 120; return `<line x1="${150 + r1 * Math.sin(a)}" y1="${150 - r1 * Math.cos(a)}" x2="${150 + 136 * Math.sin(a)}" y2="${150 - 136 * Math.cos(a)}"${i === idx ? ' class="hit"' : ''}/>`; }).join('');
    const el = document.createElement('div');
    el.className = 'theater'; el.setAttribute('role', 'status');
    el.innerHTML = `<button class="skip">Skip</button>
      <div class="th-stage">
        <svg class="wheel" viewBox="0 0 300 300"><g class="spin" style="--to:${-(idx * 6) - 720}deg">${ticks}</g><circle cx="150" cy="150" r="142" fill="none" stroke="currentColor" stroke-opacity=".15"/><path d="M150 4 l6 10 h-12z" class="pin"/></svg>
        <svg class="penta" viewBox="0 0 300 300">${pts.map((a, i) => { const b = pts[(i + 1) % 5], c = pts[(i + 2) % 5]; return `<line class="gen" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="--d:${i * 0.08}s"/><line class="ctl" x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}" style="--d:${0.4 + i * 0.08}s"/>`; }).join('')}
          ${pts.map((a, i) => `<g class="node" style="--d:${0.1 + i * 0.07}s"><circle cx="${a[0]}" cy="${a[1]}" r="${10 + (pct[EL[i]] || 0) * 0.5}" fill="${C.elements[EL[i]].color}"/><text x="${a[0]}" y="${a[1] + (i === 0 ? -26 : 34)}">${EL[i]} ${pct[EL[i]] ?? 0}%</text></g>`).join('')}</svg>
        <div class="th-center"><b id="thNum">0</b><span id="thSub">Julian Day</span></div>
      </div>
      <p class="th-cap" id="thCap">Finding your day in the 60-day cycle</p>
      <div class="th-lines" id="thLines"></div>`;
    document.body.appendChild(el);
    let over = false;
    const finish = () => { if (over) return; over = true; el.classList.add('out'); setTimeout(() => { el.remove(); done(); }, 380); };
    el.addEventListener('click', finish);
    requestAnimationFrame(() => el.classList.add('go'));
    countUp($('#thNum', el), Math.floor(s.jd), 1300);
    const at = (ms, fn) => setTimeout(() => !over && fn(), ms);
    at(1400, () => { buzz(10); $('#thNum', el).textContent = `No. ${p.no}`; $('#thSub', el).textContent = p.cn + ' · ' + signName(p); });
    at(1700, () => { $('#thCap', el).textContent = 'Reading the sky on the day you were born'; });
    lines.forEach(([k, v], i) => at(1800 + i * 170, () => { $('#thLines', el).insertAdjacentHTML('beforeend', `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`); buzz(4); }));
    at(3000, () => { $('#thCap', el).textContent = 'Balancing your five elements'; el.classList.add('five'); });
    at(4100, finish);
  });
}

// ---------- reveal: your sign, and today for you, on one screen ----------
export function pageReveal() {
  const r = store.get('reveal');
  if (!r) { location.hash = '#/'; return; }
  const p = byGz(r.gz), s = stemOf(p), young = ageOf(r.birth.date) < 13;
  view().innerHTML = `<div class="page revealpage split reveal" style="${elStyle(elOf(p))}">
    <div class="art"><img src="${art(p)}" alt="${esc(p.name)}" width="720" height="720"></div>
    <div class="after">
      <div class="who"><p class="label">Your sign · born ${fmt(r.birth.date, 'long')}</p><h1 class="display">${signName(p)}</h1><p class="poetic">${esc(p.name)}</p></div>
      <p class="intro">${esc(p.intro)}</p>
      <div class="chips">${chipEl(elOf(p), `${s.polarity} ${elOf(p)}`)}${s.traits.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
      ${young ? `<div class="card foryou"><p class="muted" style="margin:0">Flow Day accounts and daily readings are for ages 13 and up. You can still explore all 60 signs.</p></div>
        <div class="btns"><a class="btn block" href="#/sixty">See all 60 signs</a><button class="btn ghost block" id="shareMine">Share my sign</button></div>`
      : `<div class="card foryou" id="forYou">${'<div class="skeleton" style="height:92px"></div>'}</div>
        <button class="addtime" id="addTime">${r.birth.time ? `<span>Born at <b>${timeLabel(r.birth.time)}</b>${r.birth.city ? ` in <b>${esc(r.birth.city)}</b>` : ''}</span><span>Edit</span>` : '<span><b>Add your birth time</b> for a sharper reading — optional</span><span class="go">›</span>'}</button>
        <div class="btns"><a class="btn block" href="#/today" id="toToday">See my full day</a><button class="btn ghost block" id="shareMine">Share my sign</button></div>
        <p class="hint" style="text-align:center">Already have an account? <a href="#/signin">Sign in</a></p>`}
    </div></div>`;
  $('#shareMine').addEventListener('click', () => shareSign(p));
  if (young) return;
  $('#toToday').addEventListener('click', () => track('us_reveal_today'));
  $('#addTime').addEventListener('click', async () => {
    const t = await pickTime(r.birth.time || null);
    if (t === null) return;
    const birth = { date: r.birth.date };
    if (t) { birth.time = t; const c = await pickCity(r.birth.city || ''); if (c) birth.city = c; }
    try { await startReveal(birth, { quick: true, stay: true, invite: r.invite }); if (!location.hash.startsWith('#/reveal')) return; pageReveal(); toast(t ? 'Updated with your birth time' : 'Birth time removed'); track('us_reveal_time', { place: !!birth.city }); }
    catch (x) { toast(x.message); }
  });
  forYou(p);
}
async function forYou(p) {
  try {
    const t = await data.today(localDay()), d = t.day, th = theme(d.ssG, t.line?.tone || toneOf(t.chart, d.gz), localDay()), b = bestHour(d), dp = byGz(d.gz);
    if (!$('#forYou')) return;
    $('#forYou').innerHTML = `<p class="label">Today for you · ${fmt(localDay(), 'md')}</p>
      <div class="top2 lv${d.level.k}" style="margin-top:10px">${ring(d.score, 56, 5)}<div><div class="word">${level(d.level.k).word}</div><p>${esc(th.title)}</p></div></div>
      <div class="div row-link" style="grid-template-columns:auto 1fr"><img class="thumb round" src="${art(dp)}" alt="" style="width:36px;height:36px"><p class="small" style="margin:0">Today is ${aSign(dp)} day. Best hours for you: <b style="color:var(--ink)">${hourRange(b.i)}</b></p></div>`;
    countUp($('#forYou [data-count]'), d.score, 800);
  } catch (x) { $('#forYou') && ($('#forYou').innerHTML = `<p class="muted" style="margin:0">${esc(x.message)}</p>`); }
}

// ---------- accounts ----------
// Anything that needs saving asks for an account first. Returns true when it asked (the caller stops there).
export function needAccount(why) {
  if (S.me) return false;
  signupSheet(why);
  return true;
}
export function signupSheet(note) {
  const g = store.get('guest');
  if (!g?.birth) { location.hash = '#/'; return; }
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Save your Flow Day</h2>
    <p class="muted" style="margin:0 0 14px">${esc(note || 'Free. Keep your readings, collection and friends on any device.')}</p>
    <form id="signup">
      <label class="field"><span class="label">Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span class="label">Password</span><input class="input" name="pw" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>
      <label class="check"><input type="checkbox" name="agree" required> <span>I agree to the <a href="#/terms" target="_blank">Terms</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>, and understand Flow Day is for reflection and fun, not advice.</span></label>
      <p class="err"></p><button class="btn block" type="submit" style="margin-top:12px">Create my free account</button>
    </form><p class="hint" style="text-align:center">Have an account? <a href="#/signin" id="suIn">Sign in</a></p>`);
  track('us_signup_open', { why: note ? note.slice(0, 40) : 'save' });
  $('#suIn').addEventListener('click', closeSheet);
  $('#signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.err'), btn = f.querySelector('button[type=submit]');
    btn.disabled = true; err.textContent = '';
    try {
      await api('POST', 'auth/register', { username: f.email.value.trim(), password: f.pw.value, agree: true, birth: g.birth, invite: g.invite || undefined, anonId: anonId() });
      track('us_signup', { invite: !!g.invite });
      store.del('guest'); store.del('reveal'); S.guest = null; closeSheet(); toast('Welcome to Flow Day');
      window.dispatchEvent(new Event('sixty:auth'));
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
}
export function pageSignin() {
  view().innerHTML = `<div class="page"><h1 class="display" style="margin-top:8px">Welcome back</h1>
    <form class="card" id="signin" style="margin-top:18px">
      <label class="field"><span class="label">Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span class="label">Password</span><input class="input" name="pw" type="password" autocomplete="current-password" required></label>
      <p class="err"></p><button class="btn block" type="submit" style="margin-top:12px">Sign in</button>
      <button class="linkbtn" type="button" id="forgot" style="display:block;margin:6px auto 0">Forgot your password?</button>
    </form><p class="hint" style="text-align:center">New here? <a href="#/">Find your sign</a></p></div>`;
  $('#signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.err');
    try { await api('POST', 'auth/login', { username: f.email.value.trim(), password: f.pw.value }); track('us_signin'); store.del('guest'); S.guest = null; location.hash = '#/today'; window.dispatchEvent(new Event('sixty:auth')); }
    catch (x) { err.textContent = x.message; }
  });
  $('#forgot').addEventListener('click', () => {
    openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Reset your password</h2><p class="muted" style="margin:0 0 14px">Enter your account email and we'll send you a link to choose a new password.</p>
      <form id="forgotForm"><input class="input" name="email" type="email" required placeholder="you@example.com" value="${esc($('#signin [name=email]').value)}"><p class="err"></p><button class="btn block" type="submit" style="margin-top:10px">Send the link</button></form>`);
    $('#forgotForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('POST', 'auth/reset-request', { email: e.target.email.value.trim() }); closeSheet(); toast('Check your email for the link'); track('us_reset_request'); }
      catch (x) { e.target.querySelector('.err').textContent = x.message; }
    });
  });
}
// the link from the reset email: #/reset/TOKEN
export function pageReset(token) {
  view().innerHTML = `<div class="page"><h1 class="display" style="margin-top:8px">New password</h1>
    <form class="card" id="resetForm" style="margin-top:18px"><label class="field"><span class="label">New password</span><input class="input" name="pw" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>
      <p class="err"></p><button class="btn block" type="submit" style="margin-top:12px">Save and sign in</button></form></div>`;
  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = e.target.querySelector('.err');
    try { await api('POST', 'auth/reset', { token, password: e.target.pw.value }); toast('Password updated — please sign in'); location.hash = '#/signin'; }
    catch (x) { err.textContent = x.message; }
  });
}

// ---------- a friend's invite link: #/i/CODE ----------
export async function pageInvite(code) {
  view().innerHTML = `<div class="page"><div class="skeleton" style="height:320px;margin-top:20px"></div></div>`;
  let inv;
  try { inv = await api('GET', 'invite/' + encodeURIComponent(code)); } catch (x) { view().innerHTML = `<div class="page"><h1 class="h1" style="margin-top:20px">${esc(x.message)}</h1><a class="btn block" href="#/" style="margin-top:20px">Find your sign</a></div>`; return; }
  const them = inv.card?.pillar ? byGz(inv.card.pillar.gz) : null, who = inv.name && !/[一-鿿]/.test(inv.name) ? inv.name : 'Your friend';
  if (S.me) {
    // already signed in: connect, then show the painting
    try { const r = await api('POST', 'friends/link', { code }); store.set('pairPreview', { code, who: r.name && !/[一-鿿]/.test(r.name) ? r.name : who, pair: r.pair, best: r.best, them: them?.cn }); track('us_pair', { from: 'link' }); location.hash = `#/pair/${encodeURIComponent(code)}?r=1`; return; } catch (x) { toast(x.message); location.hash = '#/friends'; return; }
  }
  track('us_invite_open', { sign: them?.slug });
  const known = S.guest?.birth?.date || '';
  view().innerHTML = `<div class="page">
    <span class="chip" style="margin-top:6px">An invitation</span>
    <h1 class="display" style="margin-top:12px;font-size:clamp(36px,10vw,54px)">${esc(who)} is ${them ? aSign(them) : 'on Flow Day'}. <em>What do you two make?</em></h1>
    ${them ? `<div class="duo"><div><img src="${art(them)}" alt=""><div><b>${esc(who)}</b>${esc(them.name)}</div></div><div><img src="${art(S.guest?.p || S.C.pillars[0])}" alt=""${S.guest ? '' : ' style="filter:grayscale(1) opacity(.35)"'}><div><b>You</b>${S.guest ? esc(S.guest.p.name) : 'Add your birthday'}</div></div></div>` : ''}
    <form class="card" id="pairForm" style="margin-top:14px"><label class="label" for="pday" style="display:block;margin-bottom:8px">Your birthday</label>
      <div class="row">${dateField('pday', known)}<button class="btn" type="submit">Reveal</button></div>
      <p class="err"></p><p class="hint">${esc(who)} won't see your birthday — only the painting.</p></form>
  </div>`;
  const f = $('#pairForm'), field = $('#pday');
  const go = async () => {
    if (!field.dataset.v) { field.click(); return; }
    try {
      const date = field.dataset.v, birth = S.guest?.birth?.date === date ? S.guest.birth : { date };
      const pr = await api('POST', 'pair', { code, birth: { date } });
      await startReveal(birth, { invite: code, quick: true, stay: true });
      store.set('pairPreview', { code, who, pair: pr.pair, best: pr.best, them: them?.cn });
      track('us_pair', { from: 'invite' });
      location.hash = `#/pair/${encodeURIComponent(code)}?r=1`;
    } catch (x) { f.querySelector('.err').textContent = x.message; }
  };
  wireDateField(field, go);
  f.addEventListener('submit', (e) => { e.preventDefault(); go(); });
}

// signed in, but no birthday on the account yet (e.g. an account made without one): ask for it before anything else
export function pageNeedBirth() {
  view().innerHTML = `<div class="page"><h1 class="display" style="margin-top:8px">One more thing</h1><p class="lede">Your sign comes from your birthday. Add it to see your days.</p>
    <form class="card" id="nbForm" style="margin-top:16px"><label class="label" for="nbday" style="display:block;margin-bottom:8px">Your birthday</label>
      <div class="row">${dateField('nbday')}<button class="btn" type="submit">Continue</button></div><p class="err"></p></form>
    <p class="hint" style="text-align:center"><a href="#/" id="nbOut">Sign out</a></p></div>`;
  const f = $('#nbForm'), field = $('#nbday');
  const go = async () => {
    if (!field.dataset.v) { field.click(); return; }
    try { await api('PUT', 'me/profile', { nickname: '', bio: '', birth: { date: field.dataset.v } }); location.hash = '#/today'; window.dispatchEvent(new Event('sixty:auth')); }
    catch (x) { f.querySelector('.err').textContent = x.message; }
  };
  wireDateField(field);
  f.addEventListener('submit', (e) => { e.preventDefault(); go(); });
  $('#nbOut').addEventListener('click', async (e) => { e.preventDefault(); await api('POST', 'auth/logout').catch(() => {}); location.hash = '#/'; window.dispatchEvent(new Event('sixty:auth')); });
}
