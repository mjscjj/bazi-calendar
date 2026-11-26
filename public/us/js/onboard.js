// First visit: landing → birthday → the "reading your chart" sequence → three reveal cards → save (sign up).
// Also sign in, and the landing page for a friend's invite link.
import { $, $$, esc, S, api, pillarOf, ageOf, store, track, toast, buzz, reduced, localDay, fmt, byGz, signName, aSign, fullName, stemOf, elOf, art, elStyle, chipEl,
  readBirthday, maskBirthday, openSheet, closeSheet, WX, EL, anonId, countUp } from './core.js';
import { shareSign } from './share.js';

const view = () => $('#view');

// ---------- landing ----------
export function pageLanding() {
  const t = pillarOf(localDay());
  view().innerHTML = `
    <div class="page landing">
      <span class="chip"><span class="dot" style="background:var(--fire)"></span>Your day sign</span>
      <h1 class="display">There are 60 kinds of days. <em>And 60 kinds of people.</em></h1>
      <div class="art"><img src="${art(t)}" alt="" width="720" height="720"><div class="tag"><span class="chip">Today · ${signName(t)}</span></div></div>
      <form class="card ask" id="birthForm"><label class="label" for="bday" style="display:block;margin-bottom:8px">Your birthday</label>
        <div class="row"><input class="input" id="bday" type="text" inputmode="numeric" autocomplete="bday" placeholder="MM / DD / YYYY" maxlength="14"><button class="btn" type="submit">Find my sign</button></div>
        <p class="err"></p><p class="hint">Free. Takes 5 seconds. <a href="#/signin">I have an account</a></p></form>
      <p class="lede">An ancient calendar gives every day — and everyone — one of 60 signs. Find yours, then plan your days around it.</p>
      <div class="sec"><p class="label">What you get</p><div class="card features">
        ${[['Your sign', 'One of 60, with its own painting, element and character.', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="2" fill="currentColor"/>'],
          ['Every day, read for you', 'Your energy, best hours, lucky colors — and why.', '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'],
          ['Your best days', 'Interview, first date, launch? See the best days ahead.', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 14l2 2 4-4"/>'],
          ['Collect all 60', 'Each day has a painting. Open Flow Day to collect it.', '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>']]
          .map(([h, p, ic]) => `<div class="feature"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${ic}</svg></span><div><h3 class="h3">${h}</h3><p>${p}</p></div></div>`).join('')}
      </div></div>
      <div class="sec"><p class="label">All 60 signs</p>
        <div class="strip"><div class="track">${[...S.C.pillars, ...S.C.pillars].map((x, i) => `<a href="#/sign/${x.slug}"${i >= 60 ? ' aria-hidden="true" tabindex="-1"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="120" height="120"><span>${signName(x)}</span></a>`).join('')}</div></div>
      </div>
    </div>`;
  const f = $('#birthForm'), input = $('#bday'), err = f.querySelector('.err');
  maskBirthday(input);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = readBirthday(input.value);
    if (r.err) { err.textContent = r.err; input.focus(); return; }
    const btn = f.querySelector('button'); btn.disabled = true;
    try { await startReveal({ date: r.date }); } catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
}

// ---------- the reading sequence ----------
// Sun's ecliptic longitude (low-precision formula, good to ~0.01°) and Julian Day for noon of the birth date
function sky(date) {
  const ms = Date.parse(date + 'T12:00:00Z'), jd = ms / 864e5 + 2440587.5, n = jd - 2451545;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
  const lam = ((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360 + 360) % 360;
  const SIGNS = 'Aries Taurus Gemini Cancer Leo Virgo Libra Scorpio Sagittarius Capricorn Aquarius Pisces'.split(' ');
  return { jd, lam, west: SIGNS[Math.floor(lam / 30)] };
}
export async function startReveal(birth, opts = {}) {
  const r = await api('POST', 'preview/card', { birth });
  const card = r.card, p = byGz(card.pillar.gz);
  store.set('pending', { birth, gz: card.pillar.gz, at: Date.now(), invite: opts.invite || null });
  track('us_reveal', { sign: p.slug, from: opts.invite ? 'invite' : 'home' });
  if (!reduced() && !opts.quick) await theater(birth, card, p);
  location.hash = '#/reveal';
}
function theater(birth, card, p) {
  return new Promise((done) => {
    const s = sky(birth.date), idx = p.no - 1, C = S.C;
    const born = card.born || {};
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
    const ticks = Array.from({ length: 60 }, (_, i) => { const a = i * 6 * Math.PI / 180; const r1 = i % 5 ? 128 : 120; return `<line x1="${150 + r1 * Math.sin(a)}" y1="${150 - r1 * Math.cos(a)}" x2="${150 + 136 * Math.sin(a)}" y2="${150 - 136 * Math.cos(a)}"${i === idx ? ' class="hit"' : ''}/>`; }).join('');
    const el = document.createElement('div');
    el.className = 'theater'; el.setAttribute('role', 'status');
    el.innerHTML = `<button class="skip">Skip</button>
      <div class="th-stage">
        <svg class="wheel" viewBox="0 0 300 300"><g class="spin" style="--to:${-(idx * 6) - 1080}deg">${ticks}</g><circle cx="150" cy="150" r="142" fill="none" stroke="currentColor" stroke-opacity=".15"/><path d="M150 4 l6 10 h-12z" class="pin"/></svg>
        <svg class="penta" viewBox="0 0 300 300">${pts.map((a, i) => { const b = pts[(i + 1) % 5], c = pts[(i + 2) % 5]; return `<line class="gen" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="--d:${i * 0.12}s"/><line class="ctl" x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}" style="--d:${0.6 + i * 0.12}s"/>`; }).join('')}
          ${pts.map((a, i) => `<g class="node" style="--d:${0.2 + i * 0.1}s"><circle cx="${a[0]}" cy="${a[1]}" r="${10 + (pct[EL[i]] || 0) * 0.5}" fill="${C.elements[EL[i]].color}"/><text x="${a[0]}" y="${a[1] + (i === 0 ? -26 : 34)}">${EL[i]} ${pct[EL[i]] ?? 0}%</text></g>`).join('')}</svg>
        <div class="th-center"><b id="thNum">0</b><span id="thSub">Julian Day</span></div>
      </div>
      <p class="th-cap" id="thCap">Finding your day in the 60-day cycle</p>
      <div class="th-lines" id="thLines"></div>`;
    document.body.appendChild(el);
    let over = false;
    const finish = () => { if (over) return; over = true; el.classList.add('out'); setTimeout(() => { el.remove(); done(); }, 450); };
    el.querySelector('.skip').addEventListener('click', finish);
    requestAnimationFrame(() => el.classList.add('go'));
    countUp($('#thNum', el), Math.floor(s.jd), 2000);
    const at = (ms, fn) => setTimeout(() => !over && fn(), ms);
    at(2150, () => { buzz(10); $('#thNum', el).textContent = `No. ${p.no}`; $('#thSub', el).textContent = p.cn + ' · ' + signName(p); });
    at(2700, () => { $('#thCap', el).textContent = 'Reading the sky on the day you were born'; el.classList.add('sky'); });
    lines.forEach(([k, v], i) => at(2900 + i * 330, () => { $('#thLines', el).insertAdjacentHTML('beforeend', `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`); buzz(4); }));
    at(5100, () => { $('#thCap', el).textContent = 'Balancing your five elements'; el.classList.add('five'); });
    at(7300, finish);
  });
}

// ---------- three reveal cards ----------
export function pageReveal() {
  const pend = store.get('pending');
  if (!pend) { location.hash = '#/'; return; }
  const p = byGz(pend.gz), s = stemOf(p);
  view().innerHTML = `<div class="page reveal-steps" style="${elStyle(elOf(p))}">
    <div class="dots" role="tablist">${[0, 1, 2].map((i) => `<i data-i="${i}"></i>`).join('')}</div>
    <div class="steps" id="steps">
      <section class="step reveal">
        <div class="art"><img src="${art(p)}" alt="${esc(p.name)}" width="720" height="720"></div>
        <div class="after"><p class="label" style="margin-top:18px">Your sign · Born ${fmt(pend.birth.date, 'long')}</p>
          <h1 class="display">${signName(p)}</h1><p class="poetic">${esc(p.name)}</p>
          <p class="intro">${esc(p.intro)}</p>
          <div class="chips" style="margin-top:14px">${chipEl(elOf(p), `${s.polarity} ${elOf(p)}`)}<span class="chip">${p.animal}</span><span class="chip">No. ${p.no} of 60</span></div></div>
      </section>
      <section class="step" id="stepEl"><p class="label">Your five elements</p><h2 class="h2" style="margin-top:6px">What you're made of</h2><div id="elBody" style="margin-top:16px"></div></section>
      <section class="step"><p class="label">Your card</p><h2 class="h2" style="margin-top:6px">Keep your card</h2>
        <div class="card mini-sign" style="margin-top:16px"><img src="${art(p)}" alt="" width="72" height="72"><div><b>${signName(p)}</b><span>${esc(p.name)}</span><span class="small">${s.traits.join(' · ')}</span></div></div>
        <ul class="perks" style="margin-top:18px"><li>A reading every day — energy, best hours, lucky colors</li><li>Your month at a glance and your best days ahead</li><li>Collect all 60 paintings, one each day</li><li>The painting you make with each friend</li></ul>
        ${ageOf(pend.birth.date) < 13 ? '<div class="card"><p class="muted" style="margin:0">Flow Day accounts are for ages 13 and up. You can still explore all 60 signs.</p></div><a class="btn block" href="#/sixty" style="margin-top:10px">See all 60 signs</a>' : `<button class="btn block" id="toSignup">Save my Flow Day — it's free</button>`}
        <button class="btn ghost block" id="shareMine" style="margin-top:10px">Share my sign</button>
        <p class="hint" style="text-align:center">Already have an account? <a href="#/signin">Sign in</a></p>
      </section>
    </div>
    <div class="stepnav"><button class="btn ghost" id="prevStep">Back</button><button class="btn" id="nextStep">Next</button></div>
  </div>`;
  let i = 0;
  const steps = $$('.step'), show = (n) => {
    i = Math.max(0, Math.min(2, n));
    steps.forEach((x, k) => x.classList.toggle('on', k === i));
    $$('.dots i').forEach((x, k) => x.classList.toggle('on', k === i));
    $('#prevStep').style.visibility = i ? 'visible' : 'hidden';
    $('#nextStep').style.display = i === 2 ? 'none' : '';
    if (i === 1) drawElements();
    buzz(6);
  };
  const drawElements = async () => {
    if ($('#elBody').dataset.done) return; $('#elBody').dataset.done = 1;
    try {
      const { card } = await api('POST', 'preview/card', { birth: pend.birth });
      $('#elBody').innerHTML = `<div class="card"><div class="bars">${card.force.map((f) => { const e = WX[f.el]; return `<div class="bar"><span>${e}</span><span class="t"><i style="--w:${f.pct}%;background:${S.C.elements[e].color}"></i></span><b>${f.pct}%</b></div>`; }).join('')}</div>
        <p class="hint" style="margin-top:14px">${card.strong ? S.C.strength.strong : S.C.strength.weak}</p></div>
        <p class="label" style="margin:20px 0 10px">What fuels you</p><div class="chips">${card.lucky.map((x) => chipEl(WX[x])).join('')}</div>
        <p class="hint">${card.lucky.map((x) => S.C.elements[WX[x]].fuels).join(' ')}</p>`;
      requestAnimationFrame(() => $$('#elBody .bar i').forEach((x) => x.classList.add('grow')));
    } catch (x) { $('#elBody').innerHTML = `<p class="err">${esc(x.message)}</p>`; }
  };
  $('#nextStep').addEventListener('click', () => show(i + 1));
  $('#prevStep').addEventListener('click', () => show(i - 1));
  $$('.dots i').forEach((d) => d.addEventListener('click', () => show(+d.dataset.i)));
  let x0 = null;
  $('#steps').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $('#steps').addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
  $('#toSignup')?.addEventListener('click', () => signupSheet());
  $('#shareMine').addEventListener('click', () => shareSign(p));
  show(0);
}

// ---------- accounts ----------
export function signupSheet(note) {
  const pend = store.get('pending');
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Save your Flow Day</h2>
    <p class="muted" style="margin:0 0 16px">${esc(note || 'Free. Your readings, collection and friends stay with you on any device.')}</p>
    <form id="signup">
      <label class="field"><span class="label">Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span class="label">Password</span><input class="input" name="pw" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>
      <label class="field"><span class="label">First name (optional)</span><input class="input" name="name" autocomplete="given-name" maxlength="12"></label>
      <label class="check"><input type="checkbox" name="agree" required> <span>I agree to the <a href="#/terms" target="_blank">Terms</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>, and understand Flow Day is for reflection and fun, not advice.</span></label>
      <p class="err"></p><button class="btn block" type="submit">Create my account</button>
    </form>`);
  $('#signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.err'), btn = f.querySelector('button[type=submit]');
    btn.disabled = true; err.textContent = '';
    try {
      await api('POST', 'auth/register', { username: f.email.value.trim(), password: f.pw.value, nickname: f.name.value.trim() || undefined, agree: true,
        birth: pend?.birth, invite: pend?.invite || undefined, anonId: anonId() });
      track('us_signup', { invite: !!pend?.invite });
      store.del('pending'); store.del('pairPreview'); closeSheet(); toast('Welcome to Flow Day'); location.hash = '#/today'; window.dispatchEvent(new Event('sixty:auth'));
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
}
export function pageSignin() {
  view().innerHTML = `<div class="page"><h1 class="display" style="margin-top:10px">Welcome back</h1>
    <form class="card" id="signin" style="margin-top:20px">
      <label class="field"><span class="label">Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span class="label">Password</span><input class="input" name="pw" type="password" autocomplete="current-password" required></label>
      <p class="err"></p><button class="btn block" type="submit">Sign in</button>
      <button class="linkbtn" type="button" id="forgot">Forgot your password?</button>
    </form><p class="hint" style="text-align:center">New here? <a href="#/">Find your sign</a></p></div>`;
  $('#signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.err');
    try { await api('POST', 'auth/login', { username: f.email.value.trim(), password: f.pw.value }); track('us_signin'); location.hash = '#/today'; window.dispatchEvent(new Event('sixty:auth')); }
    catch (x) { err.textContent = x.message; }
  });
  $('#forgot').addEventListener('click', () => {
    openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Reset your password</h2><p class="muted" style="margin:0 0 14px">Enter your account email and we'll send you a link to choose a new password.</p>
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
  view().innerHTML = `<div class="page"><h1 class="display" style="margin-top:10px">New password</h1>
    <form class="card" id="resetForm" style="margin-top:20px"><label class="field"><span class="label">New password</span><input class="input" name="pw" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>
      <p class="err"></p><button class="btn block" type="submit">Save and sign in</button></form></div>`;
  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = e.target.querySelector('.err');
    try { await api('POST', 'auth/reset', { token, password: e.target.pw.value }); toast('Password updated — please sign in'); location.hash = '#/signin'; }
    catch (x) { err.textContent = x.message; }
  });
}

// ---------- a friend's invite link: #/i/CODE ----------
export async function pageInvite(code) {
  view().innerHTML = `<div class="page">${'<div class="skeleton" style="height:320px;margin-top:20px"></div>'}</div>`;
  let inv;
  try { inv = await api('GET', 'invite/' + encodeURIComponent(code)); } catch (x) { view().innerHTML = `<div class="page"><h1 class="h2" style="margin-top:20px">${esc(x.message)}</h1><a class="btn block" href="#/" style="margin-top:20px">Find your sign</a></div>`; return; }
  const them = inv.card?.pillar ? byGz(inv.card.pillar.gz) : null, who = inv.name && !/[一-鿿]/.test(inv.name) ? inv.name : 'Your friend';
  if (S.me) {
    // already signed in: connect, then show the painting
    try { const r = await api('POST', 'friends/link', { code }); store.set('pairPreview', { code, who: r.name && !/[\u4e00-\u9fff]/.test(r.name) ? r.name : who, pair: r.pair, best: r.best, them: them?.cn }); track('us_pair', { from: 'link' }); location.hash = `#/pair/${encodeURIComponent(code)}?r=1`; return; } catch (x) { toast(x.message); location.hash = '#/friends'; return; }
  }
  track('us_invite_open', { sign: them?.slug });
  view().innerHTML = `<div class="page">
    <span class="chip" style="margin-top:6px">An invitation</span>
    <h1 class="display" style="margin-top:14px;font-size:clamp(38px,10vw,56px)">${esc(who)} is ${them ? aSign(them) : 'on Flow Day'}. <em>What do you two make?</em></h1>
    ${them ? `<div class="duo"><div><img src="${art(them)}" alt=""><div><b>${esc(who)}</b>${esc(them.name)}</div></div><div><img src="${art(S.C.pillars[0])}" alt="" style="filter:grayscale(1) opacity(.35)"><div><b>You</b>Add your birthday</div></div></div>` : ''}
    <form class="card" id="pairForm" style="margin-top:16px"><label class="label" for="pday" style="display:block;margin-bottom:8px">Your birthday</label>
      <div class="row"><input class="input" id="pday" type="text" inputmode="numeric" autocomplete="bday" placeholder="MM / DD / YYYY" maxlength="14"><button class="btn" type="submit">Reveal</button></div>
      <p class="err"></p><p class="hint">${esc(who)} won't see your birthday — only the painting.</p></form>
  </div>`;
  const f = $('#pairForm'), input = $('#pday'); maskBirthday(input);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = readBirthday(input.value); if (r.err) { f.querySelector('.err').textContent = r.err; return; }
    try {
      const pr = await api('POST', 'pair', { code, birth: { date: r.date } });
      store.set('pending', { birth: { date: r.date }, gz: null, invite: code, at: Date.now() });
      const { card } = await api('POST', 'preview/card', { birth: { date: r.date } });
      store.set('pending', { birth: { date: r.date }, gz: card.pillar.gz, invite: code, at: Date.now() });
      store.set('pairPreview', { code, who, pair: pr.pair, best: pr.best, them: them?.cn });
      track('us_pair', { from: 'invite' });
      location.hash = `#/pair/${encodeURIComponent(code)}?r=1`;
    } catch (x) { f.querySelector('.err').textContent = x.message; }
  });
}

// signed in, but no birthday on the account yet (e.g. an account made without one): ask for it before anything else
export function pageNeedBirth() {
  view().innerHTML = `<div class="page"><h1 class="display" style="margin-top:10px">One more thing</h1><p class="lede">Your sign comes from your birthday. Add it to see your days.</p>
    <form class="card" id="nbForm" style="margin-top:18px"><label class="label" for="nbday" style="display:block;margin-bottom:8px">Your birthday</label>
      <div class="row"><input class="input" id="nbday" type="text" inputmode="numeric" autocomplete="bday" placeholder="MM / DD / YYYY" maxlength="14"><button class="btn" type="submit">Continue</button></div><p class="err"></p></form>
    <p class="hint" style="text-align:center"><a href="#/" id="nbOut">Sign out</a></p></div>`;
  const f = $('#nbForm'), input = $('#nbday'); maskBirthday(input);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = readBirthday(input.value); if (r.err) { f.querySelector('.err').textContent = r.err; return; }
    try { await api('PUT', 'me/profile', { nickname: '', bio: '', birth: { date: r.date } }); location.hash = '#/today'; window.dispatchEvent(new Event('sixty:auth')); }
    catch (x) { f.querySelector('.err').textContent = x.message; }
  });
  $('#nbOut').addEventListener('click', async (e) => { e.preventDefault(); await api('POST', 'auth/logout').catch(() => {}); location.hash = '#/'; window.dispatchEvent(new Event('sixty:auth')); });
}
