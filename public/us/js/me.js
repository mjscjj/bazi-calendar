// Me (chart, elements, cycles, settings), your collection of 60, friends and pair paintings, and the public sign page.
import { $, $$, esc, S, api, store, track, toast, buzz, reduced, localDay, fmt, byGz, bySlug, pillarOf, signName, aSign, fullName, stemOf, elOf, art, elStyle, chipEl,
  WX, EL, GAN, ZHI, ANIMAL, gzName, shareBase, ageOf, loading, failed, openSheet, closeSheet, readBirthday, maskBirthday, birthdayValue, countUp } from './core.js';
import { shareSign, sharePair, shareImage } from './share.js';

const view = () => $('#view');
const FB_TYPE = '建议'; // 中文版的反馈分类，美国版一律记成「建议」
const KIND = { 合: 'match', 同: 'same', 我生: 'lift', 生我: 'lifted', 我克: 'push', 克我: 'pushed' };
// a pair from the server, in English
export function pairEn(pr, meImage, youImage) {
  const file = String(pr.art || '').split('/').pop(), en = Object.values(S.C.pairs).find((x) => x.art === file);
  const k = S.C.pairKinds[KIND[pr.kind]] || S.C.pairKinds.same;
  return { name: en?.name || '', tag: k.tag, text: k.text.replace('{me}', meImage).replace('{you}', youImage), art: `../art/pairs/${file}` };
}

// ---------- Me ----------
export async function pageMe() {
  const p = S.me.p, u = S.me.user, b = u.birth || {};
  view().innerHTML = `<div class="page" style="${elStyle(elOf(p))}">
    <a class="card daymini" href="#/sign/${p.slug}" style="grid-template-columns:72px 1fr auto"><img src="${art(p)}" alt="" style="width:72px;height:72px">
      <div><p class="label">${esc(u.nickname || 'Your sign')}</p><b style="font:400 26px/1.1 var(--serif)">${signName(p)}</b><p class="small" style="margin:2px 0 0">${esc(p.name)}</p></div><span class="go">›</span></a>
    <div class="tiles3">
      <a class="card tile" href="#/collection"><b id="meCol">·</b><span>of 60 collected</span></a>
      <a class="card tile" href="#/friends"><b id="meFr">·</b><span>friends</span></a>
      <a class="card tile" href="#/recap"><b>✦</b><span>your month</span></a>
    </div>
    <div id="chartBody">${loading(160)}</div>
    <div class="sec"><p class="label">Settings</p>
      <div class="card settings">
        <button data-act="birth"><span>Birth details</span><small>${fmt(b.date, 'long')}${b.time ? ' · ' + b.time : ''}${b.city ? ' · ' + esc(b.city) : ''}</small></button>
        <div class="setrow"><span>Appearance</span><div class="seg mini">${['light', 'dark', 'auto'].map((t) => `<button data-theme="${t}" aria-pressed="${(store.get('theme') || 'auto') === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
        <button data-act="fb"><span>Send feedback</span><small>Ideas, bugs, anything</small></button>
        <button data-act="out"><span>Sign out</span></button>
        <button data-act="del" class="danger"><span>Delete my account</span></button>
      </div>
      <p class="hint">${S.me.access?.beta ? 'Sixty Plus is free for everyone during the beta.' : ''}</p></div>
  </div>`;
  $$('[data-theme]').forEach((x) => x.addEventListener('click', () => { store.set('theme', x.dataset.theme); applyTheme(); $$('[data-theme]').forEach((y) => y.setAttribute('aria-pressed', String(y === x))); }));
  $('[data-act=birth]').addEventListener('click', birthSheet);
  $('[data-act=fb]').addEventListener('click', () => {
    openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Send feedback</h2><p class="muted" style="margin:0 0 14px">We read every note. Thank you for helping shape Sixty.</p>
      <form id="fbForm"><textarea class="input" name="t" rows="5" maxlength="500" required style="height:auto;padding:12px 14px" placeholder="What should we know?"></textarea><p class="err"></p><button class="btn block" type="submit">Send</button></form>`);
    $('#fbForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('POST', 'feedback', { type: FB_TYPE, content: e.target.t.value.trim(), contact: S.me.user.username }); closeSheet(); toast('Thank you!'); }
      catch (x) { e.target.querySelector('.err').textContent = x.message; }
    });
  });
  $('[data-act=out]').addEventListener('click', async () => { await api('POST', 'auth/logout').catch(() => {}); S.me = null; location.hash = '#/'; window.dispatchEvent(new Event('sixty:auth')); });
  $('[data-act=del]').addEventListener('click', () => {
    openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Delete your account</h2>
      <p class="muted" style="margin:0 0 14px">This permanently deletes your account, birth details, collection, friends and history. It can't be undone.</p>
      <form id="delForm"><label class="field"><span class="label">Type your password to confirm</span><input class="input" name="pw" type="password" autocomplete="current-password" required></label>
      <p class="err"></p><button class="btn block danger-btn" type="submit">Delete everything</button></form>`);
    $('#delForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('POST', 'me/delete', { password: e.target.pw.value }); closeSheet(); S.me = null; toast('Your account has been deleted'); location.hash = '#/'; window.dispatchEvent(new Event('sixty:auth')); }
      catch (x) { e.target.querySelector('.err').textContent = x.message; }
    });
  });
  api('GET', 'jiazi').then((j) => countUp($('#meCol'), j.n, 600)).catch(() => {});
  api('GET', 'friends').then((f) => countUp($('#meFr'), f.list.length, 600)).catch(() => {});
  try {
    const t = S.today || await api('GET', 'today?date=' + localDay()), ch = t.chart, card = t.card;
    if (!$('#chartBody')) return;
    const names = ['Year', 'Month', 'Day', 'Hour'], by = +b.date.slice(0, 4), year = new Date().getFullYear();
    const cell = (gz, i) => { const g = GAN.indexOf(gz[0]), z = ZHI.indexOf(gz[1]); return `<button class="pillar${i === 2 ? ' day' : ''}" data-gz="${gz}" style="--i:${i}"><p class="label">${names[i]}</p><b>${EL[g >> 1]} ${ANIMAL[z]}</b><span>${g % 2 ? 'Yin' : 'Yang'}</span><div class="cjk">${gz}</div></button>`; };
    const force = card.force || [];
    $('#chartBody').innerHTML = `
      <div class="sec"><p class="label">Your four pillars</p><div class="pillars">${ch.pillars.map(cell).join('')}${ch.pillars.length < 4 ? `<button class="pillar add" data-act="birth"><p class="label">Hour</p><b>?</b><span>Add time</span></button>` : ''}</div>
        <p class="hint">Each part of your birth — year, month, day, hour — has a sign. The day is you; tap any pillar to see it.${card.basis?.solar ? ` Calculated at local solar time, ${card.basis.time}.` : ''}</p></div>
      <div class="sec"><p class="label">Your elements</p><div class="card">
        <div class="penta-wrap">${pentagon(force)}</div>
        <p class="hint" style="margin-top:4px">${card.strong ? S.C.strength.strong : S.C.strength.weak}</p></div></div>
      <div class="sec"><p class="label">What fuels you</p><div class="stack-gap">${(card.lucky || []).map((x) => { const e = S.C.elements[WX[x]]; return `<div class="card fuel"><i style="background:${e.color}"></i><div><h3 class="h3">${WX[x]}</h3><p>${e.fuels}</p></div></div>`; }).join('')}</div></div>
      <div class="sec"><p class="label">Your 10-year cycles</p>${ch.gender && ch.dayuns?.length ? `<div class="timeline">${ch.dayuns.slice(0, 8).map((c) => { const cp = byGz(c.gz); return `<div class="cycle${year >= c.startYear && year <= c.endYear ? ' now' : ''}"><b>Age ${c.startYear - by}–${c.endYear - by}</b><span>${signName(cp)} · ${esc(cp.name)}<span class="small"> · ${c.startYear}–${c.endYear}</span></span></div>`; }).join('')}</div>
        <p class="hint">Every ten years the backdrop of your life shifts to a new sign. The highlighted one is now.</p>`
        : `<div class="card"><p class="muted" style="margin:0">Add your sex at birth in Birth details to see the ten-year cycles of your life.</p></div>`}</div>`;
    $$('#chartBody .pillar[data-gz]').forEach((x) => x.addEventListener('click', () => { const gp = byGz(x.dataset.gz); location.hash = `#/sign/${gp.slug}`; }));
    $('#chartBody [data-act=birth]')?.addEventListener('click', birthSheet);
    if (!reduced()) requestAnimationFrame(() => $('#chartBody .penta-wrap')?.classList.add('go'));
  } catch (e) { $('#chartBody') && ($('#chartBody').innerHTML = failed(e.message)); }
}
// the five elements as a pentagon: each point pulled out by its share; generating cycle around the edge
function pentagon(force) {
  const pct = Object.fromEntries(force.map((f) => [WX[f.el], f.pct])), max = Math.max(40, ...Object.values(pct));
  const P = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [140 + r * Math.cos(a), 128 + r * Math.sin(a)]; };
  const outer = EL.map((_, i) => P(i, 96)), shape = EL.map((e, i) => P(i, 18 + 78 * (pct[e] || 0) / max));
  return `<svg viewBox="0 0 280 260" class="penta-me">
    <polygon points="${outer.map((x) => x.join(',')).join(' ')}" class="frame"/>
    ${EL.map((_, i) => `<line x1="140" y1="128" x2="${outer[i][0]}" y2="${outer[i][1]}" class="spoke"/>`).join('')}
    <polygon points="${shape.map((x) => x.join(',')).join(' ')}" class="shape"/>
    ${EL.map((e, i) => { const [x, y] = P(i, 118); return `<circle cx="${shape[i][0]}" cy="${shape[i][1]}" r="5" fill="${S.C.elements[e].color}"/><text x="${x}" y="${y + 4}">${e} <tspan>${pct[e] ?? 0}%</tspan></text>`; }).join('')}
  </svg>`;
}

let CITIES = null;
async function birthSheet() {
  const b = S.me.user.birth || {};
  CITIES = CITIES || await fetch('cities.json').then((r) => r.json()).catch(() => []);
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h2">Birth details</h2>
    <form id="birthEdit">
      <label class="field"><span class="label">Birthday</span><input class="input" name="date" inputmode="numeric" value="${birthdayValue(b.date)}"></label>
      <label class="field"><span class="label">Birth time (optional)</span><input class="input" name="time" type="time" value="${b.time || ''}"></label>
      <label class="field"><span class="label">Birth place (optional, for the exact hour)</span><select class="input" name="city"><option value="">Not sure</option>${CITIES.map((c) => `<option${b.city === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Sex at birth (optional, sets your 10-year cycles)</span><select class="input" name="sex"><option value="">Prefer not to say</option><option value="女"${b.gender === '女' ? ' selected' : ''}>Female</option><option value="男"${b.gender === '男' ? ' selected' : ''}>Male</option></select></label>
      <p class="err"></p><button class="btn block" type="submit">Save</button></form>`);
  maskBirthday($('#birthEdit [name=date]'));
  $('#birthEdit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, r = readBirthday(f.date.value), err = f.querySelector('.err');
    if (r.err) { err.textContent = r.err; return; }
    try {
      await api('PUT', 'me/profile', { nickname: S.me.user.nickname || '', bio: S.me.user.bio || '', birth: { date: r.date, time: f.time.value || null, city: f.time.value && f.city.value ? f.city.value : null, gender: f.sex.value || null } });
      track('us_profile', { time: !!f.time.value, place: !!f.city.value, sex: !!f.sex.value });
      closeSheet(); toast('Saved'); S.today = null; window.dispatchEvent(new Event('sixty:auth'));
    } catch (x) { err.textContent = x.message; }
  });
}

export function applyTheme() {
  const t = store.get('theme') || 'auto', dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#111114' : '#F6F5F1');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- your collection of 60 ----------
export async function pageCollection() {
  view().innerHTML = `<div class="page" style="max-width:1080px"><p class="label" style="margin-top:6px">Your Sixty</p><h1 class="display" id="colTitle">·</h1>
    <p class="lede">Every day has one of 60 paintings. Open Sixty on a day to collect its painting — the whole cycle takes 60 days.</p><div class="grid wall" id="wall">${loading(300)}</div></div>`;
  try {
    const j = await api('GET', 'jiazi'), got = new Map(j.list.map((x) => [x.gz, x.day])), today = pillarOf(localDay());
    $('#colTitle').innerHTML = `<span data-n>0</span> <em>of 60</em>`; countUp($('[data-n]'), j.n, 800);
    $('#wall').insertAdjacentHTML('beforebegin', `<div class="card reward"><div class="bar"><span class="t"><i style="--w:${Math.round(j.n / 60 * 100)}%"></i></span></div>
      ${j.n >= 60 ? '<button class="btn block" id="poster" style="margin-top:12px">Download your full-cycle poster</button>' : `<p class="small" style="margin:8px 0 0">Collect all 60 to unlock your full-cycle poster — ${60 - j.n} to go.</p>`}</div>`);
    requestAnimationFrame(() => $('.reward .t i')?.classList.add('grow'));
    $('#poster')?.addEventListener('click', () => shareImage(posterOf, 'sixty-full-cycle.jpg', 'poster'));
    $('#wall').innerHTML = S.C.pillars.map((x, i) => { const has = got.has(x.cn); return `<a href="#/sign/${x.slug}" class="${has ? 'has' : 'empty'}${x.slug === today.slug ? ' now' : ''}" style="--i:${i}">
      ${has ? `<img src="${art(x)}" alt="" loading="lazy" width="180" height="180">` : `<span class="ph">${x.no}</span>`}<div class="nm">${signName(x)}</div><div class="sub">${has ? fmt(got.get(x.cn), 'md') : x.slug === today.slug ? 'Today' : 'Not yet'}</div></a>`; }).join('');
  } catch (e) { $('#wall').innerHTML = failed(e.message); }
}

// ---------- friends ----------
export async function pageFriends() {
  const p = S.me.p;
  view().innerHTML = `<div class="page" style="${elStyle(elOf(p))}">
    <h1 class="h2" style="margin-top:6px">You & your people</h1>
    <p class="muted" style="margin:8px 0 18px">Every pair of signs makes a painting of its own. Send your link — when a friend opens it, you both see yours.</p>
    <button class="btn block" id="invite">Invite a friend</button>
    <div class="sec stack-gap" id="flist">${loading(84)}</div></div>`;
  $('#invite').addEventListener('click', inviteSheet);
  try {
    const { list } = await api('GET', 'friends');
    $('#flist').innerHTML = list.length ? list.map((f) => { if (!f.pair) return ''; const e = pairEn(f.pair, stemOf(p).image, '…'); return `
      <button class="card friend" data-f="${list.indexOf(f)}"><img src="${e.art}" alt="" width="64" height="64"><div><h3 class="h3">${esc(/[一-鿿]/.test(f.name) ? 'Friend' : f.name)}</h3><p>${esc(e.name)} · ${e.tag}</p>${f.pair.best ? `<p class="small">Best day together: ${fmt(bestDate(f.pair.best))}</p>` : ''}</div><span class="go">›</span></button>`; }).join('')
      : `<div class="card empty"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--ink-3)" stroke-width="1.5" style="margin:0 auto"><circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/></svg><h3 class="h3" style="margin-top:10px">No one here yet</h3><p>Friends show up here once they open your link.</p></div>`;
    $$('[data-f]').forEach((b) => b.addEventListener('click', () => friendSheet(list[+b.dataset.f])));
  } catch (e) { $('#flist').innerHTML = failed(e.message); }
}
async function inviteSheet() {
  let code;
  try { code = (await api('GET', 'me/invite')).code; } catch (e) { toast(e.message); return; }
  const p = S.me.p, url = `${shareBase()}i/${code}`;
  const text = `I'm ${aSign(p)} — ${p.name}. What painting do we make together?`;
  track('us_invite', { sign: p.slug });
  if (navigator.share) { try { await navigator.share({ text, url }); return; } catch (x) { if (x.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied — paste it to a friend'); } catch { prompt('Copy this link', url); }
}

// ---------- a pair painting: #/pair/CODE (after opening an invite) ----------
export function pagePair(code, reveal) {
  const pv = store.get('pairPreview');
  if (!pv || pv.code !== code) { location.hash = S.me ? '#/friends' : '#/'; return; }
  if (!S.me && !store.get('pending')?.birth) { location.hash = `#/i/${encodeURIComponent(code)}`; return; } // no birthday to sign up with: start from the invite
  const mineGz = S.me?.p?.cn || store.get('pending')?.gz, mine = mineGz ? byGz(mineGz) : null, them = pv.them ? byGz(pv.them) : null;
  const e = pairEn(pv.pair, mine ? stemOf(mine).image : 'you', them ? stemOf(them).image : 'them'), who = esc(pv.who || 'Your friend');
  view().innerHTML = `<div class="page wide${reveal ? ' reveal merge' : ''}">
    <div class="left"><div class="mergebox">${mine && them ? `<img class="m1" src="${art(mine)}" alt=""><img class="m2" src="${art(them)}" alt="">` : ''}<div class="art"><img src="${e.art}" alt="" width="720" height="720"><div class="tag"><span class="chip">${e.tag}</span></div></div></div></div>
    <div class="right after"><div class="sign-name"><p class="label">You & ${who}</p><h1 class="display" style="font-size:clamp(40px,11vw,58px)">${esc(e.name)}</h1><p class="poetic">${e.tag}</p></div>
      <p class="intro">${esc(e.text)}</p>
      ${pv.best ? `<div class="card" style="margin-top:16px"><p class="label">Best day to do something together</p><h3 class="h3" style="margin-top:6px">${fmt(pv.best.date || `${pv.best.y}-${String(pv.best.m).padStart(2, '0')}-${String(pv.best.d).padStart(2, '0')}`, 'full')}</h3></div>` : ''}
      <div class="btns">${S.me ? '<a class="btn block" href="#/friends">See all my friends</a>' : store.get('pending')?.birth && ageOf(store.get('pending').birth.date) < 13 ? '<p class="hint">Sixty accounts are for ages 13 and up.</p>' : '<button class="btn block" id="pairSignup">Save this — create your free account</button>'}
        <button class="btn ghost block" id="pairShare">Share our painting</button></div></div></div>`;
  $('#pairSignup')?.addEventListener('click', () => import('./onboard.js').then((m) => m.signupSheet(`Save your sign and your painting with ${pv.who || 'your friend'}.`)));
  $('#pairShare').addEventListener('click', () => sharePair({ art: e.art, el: mine ? elOf(mine) : 'Earth', kicker: `Me & ${pv.who || 'a friend'}`, title: e.name, sub: e.tag, meta: mine && them ? `${signName(mine)} & ${signName(them)}` : 'Sixty', body: 'Every pair of signs makes a painting of its own. What do you make with your people?' }));
  if (reveal) setTimeout(() => buzz(16), 1200);
}

// ---------- a sign, for anyone: #/sign/slug ----------
export function pageSign(slug, reveal) {
  const p = bySlug(slug); if (!p) { location.hash = '#/'; return; }
  const mine = S.me && S.me.p.slug === slug, s = stemOf(p), today = pillarOf(localDay());
  view().innerHTML = `<div class="page wide${reveal ? ' reveal' : ''}" style="${elStyle(elOf(p))}">
    <div class="left"><div class="art"><img src="${art(p)}" alt="${esc(p.name)}" width="720" height="720"></div></div>
    <div class="right after"><div class="sign-name"><p class="label">${mine ? 'Your sign' : today.slug === slug ? 'Today’s sign' : `Sign ${p.no} of 60`}</p>
        <h1 class="display">${signName(p)}</h1><p class="poetic">${esc(p.name)}</p>
        <div class="chips">${chipEl(elOf(p), `${s.polarity} ${elOf(p)}`)}<span class="chip">${p.animal}</span><span class="chip">No. ${p.no} of 60</span></div></div>
      <p class="intro">${esc(p.intro)}</p>
      <div class="chips" style="margin-top:16px">${s.traits.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
      <p class="cn-note">In the Chinese calendar this sign is <span class="cjk">${p.cn}</span> (${p.py}) — ${fullName(p)}.</p>
      <div class="btns">${mine ? '<button class="btn block" id="shareSign">Share my sign</button><a class="btn ghost block" href="#/today">Back to my day</a>' : `<a class="btn block" href="${S.me ? '#/today' : '#/'}">${S.me ? 'Back to my day' : 'Find your sign'}</a>`}</div></div></div>`;
  $('#shareSign')?.addEventListener('click', () => shareSign(p));
}

// ---------- terms and privacy ----------
const LEGAL = {
  terms: ['Terms of Use', `
    <p>Sixty is a daily calendar and reflection app based on the traditional Chinese sexagenary calendar. By creating an account you agree to these terms.</p>
    <h3 class="h3">For reflection and fun</h3><p>Readings, scores, best days and pairings are generated from calendar rules. They are not predictions and not medical, legal, financial or professional advice. Please make important decisions with your own judgment.</p>
    <h3 class="h3">Your account</h3><p>You must be 13 or older. Keep your password private. You can delete your account at any time in Me → Settings.</p>
    <h3 class="h3">Fair use</h3><p>Don't misuse the service, try to break it, or scrape it. We may suspend accounts that do.</p>
    <h3 class="h3">Sixty Plus</h3><p>Paid features, when offered, are billed by Gumroad as the merchant of record. Subscriptions renew automatically until you cancel from your Gumroad receipt. During the beta, everything is free.</p>
    <h3 class="h3">Changes</h3><p>We may update the service and these terms. If the changes are significant we will tell you in the app.</p>`],
  privacy: ['Privacy Policy', `
    <p>We keep this short and plain.</p>
    <h3 class="h3">What we collect</h3><p>Your email and password (stored hashed), your birth date and optionally birth time, birth place and sex at birth, the first name you choose, and what you do in the app (like which days you open it). We also record anonymous usage events to understand which features help.</p>
    <h3 class="h3">Why</h3><p>Only to calculate your readings, remember your collection and friends, and improve Sixty. We don't sell your data or use it for advertising.</p>
    <h3 class="h3">Friends</h3><p>When you connect with a friend, each of you sees your sign and the painting you make together — never each other's birthday.</p>
    <h3 class="h3">Deleting</h3><p>Delete your account any time in Me → Settings; we remove your data from our database right away (backups roll over within 14 days).</p>
    <h3 class="h3">Children</h3><p>Sixty is not for children under 13, and we don't knowingly collect their information.</p>
    <h3 class="h3">Contact</h3><p>Questions or requests: use the feedback option in the app.</p>`],
};
export function pageLegal(kind) {
  const [title, body] = LEGAL[kind] || LEGAL.terms;
  view().innerHTML = `<div class="page legal"><p class="label" style="margin-top:6px">Last updated November 26, 2026</p><h1 class="display">${title}</h1>${body}</div>`;
}

const bestDate = (b) => b.date || `${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}`;
function friendSheet(f) {
  // the pair painting's file name holds both stems (jia-yi.webp); the one that isn't mine is my friend's
  const p = S.me.p, stems = String(f.pair.art || '').split('/').pop().replace('.webp', '').split('-'), mine = p.stem;
  const theirs = stems[0] === mine ? stems[1] : stems[0], e = pairEn(f.pair, stemOf(p).image, S.C.stems[theirs]?.image || 'them'), name = /[一-鿿]/.test(f.name) ? 'Your friend' : f.name;
  buzz(5); track('us_friend_open');
  openSheet(`<button class="x" aria-label="Close">×</button><p class="label">You & ${esc(name)}</p><h2 class="h2">${esc(e.name)}</h2>
    <div class="art" style="margin-top:14px"><img src="${e.art}" alt="" width="720" height="720"><div class="tag"><span class="chip">${e.tag}</span></div></div>
    <p class="intro" style="font-size:22px">${esc(e.text)}</p>
    ${f.pair.best ? `<div class="card" style="margin-top:14px"><p class="label">Best day to do something together</p><h3 class="h3" style="margin-top:6px">${fmt(bestDate(f.pair.best), 'full')}</h3><p class="small" style="margin:4px 0 0">The day in the next two weeks that is strongest for both of you.</p></div>` : ''}
    <button class="btn ghost block" id="fShare" style="margin-top:14px">Share our painting</button>`);
  $('#fShare').addEventListener('click', () => sharePair({ art: e.art, el: elOf(p), kicker: `Me & ${name}`, title: e.name, sub: e.tag, meta: signName(p), body: 'Every pair of signs makes a painting of its own. What do you make with your people?' }));
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
  view().innerHTML = `<div class="page recap" style="${elStyle(elOf(S.me.p))}">
    <div class="monthbar"><a class="navbtn" href="#/recap?m=${ym(prev)}" aria-label="Previous month">‹</a><p class="label">${r.inProgress ? 'So far this month' : 'Your month'}</p>${r.inProgress ? '<span class="navbtn ghostspace"></span>' : `<a class="navbtn" href="#/recap?m=${ym(next)}" aria-label="Next month">›</a>`}</div>
    <h1 class="display">Your ${name}</h1>
    <div class="tiles3" style="margin-top:18px"><div class="card tile"><b data-n="${r.opened}">0</b><span>days opened</span></div><div class="card tile"><b data-n="${r.arts.length}">0</b><span>paintings</span></div><div class="card tile"><b data-n="${r.lots}">0</b><span>oracle lots</span></div></div>
    ${r.arts.length ? `<div class="sec"><p class="label">Collected in ${name}</p><div class="miniwall">${r.arts.map((a, i) => `<img src="${art(byGz(a.gz))}" alt="" style="--i:${i}" loading="lazy">`).join('')}</div></div>` : ''}
    ${best ? `<div class="sec"><p class="label">Your strongest day</p><a class="card daymini" href="#/today?d=${best.day}"><img src="${art(pillarOf(best.day))}" alt="" width="56" height="56"><div><b>${fmt(best.day, 'full')}</b><p class="small" style="margin:2px 0 0">Scored ${best.score}</p></div><span class="go">›</span></a></div>` : ''}
    ${top ? `<div class="sec"><p class="label">Most-felt mood</p><div class="card"><h3 class="h2" style="font-size:28px">${S.C.moods[top[0]] || top[0]}</h3><p class="small" style="margin:4px 0 0">${top[1]} time${top[1] === 1 ? '' : 's'} this month</p></div></div>` : ''}
    ${r.match?.rated >= 3 ? `<div class="sec"><p class="label">How often Sixty matched your days</p><div class="card"><h3 class="h2" style="font-size:36px">${Math.round(r.match.match / r.match.rated * 100)}%</h3><p class="small" style="margin:4px 0 0">${r.match.match} of ${r.match.rated} evenings you rated</p></div></div>` : ''}
    <button class="btn block" id="recapShare" style="margin-top:22px">Share my ${name}</button></div>`;
  $$('[data-n]').forEach((x) => countUp(x, +x.dataset.n, 800));
  $('#recapShare').addEventListener('click', () => sharePair({ art: art(best ? pillarOf(best.day) : S.me.p), el: elOf(S.me.p), kicker: `My ${name}`, title: `${r.opened} days · ${r.arts.length} paintings`, sub: `${signName(S.me.p)} on Sixty`, meta: best ? `Strongest day: ${fmt(best.day, 'md')}` : 'Sixty', body: 'Every day has one of 60 paintings. Collect them all — one a day.' }));
  track('us_recap');
}

// ---------- the full-cycle poster (unlocks at 60 / 60) ----------
async function posterOf() {
  const W = 1200, cols = 6, cell = 180, gap = 12, top = 190, cv = document.createElement('canvas');
  cv.width = W; cv.height = top + 10 * (cell + gap) + 150;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#F6F5F1'; ctx.fillRect(0, 0, cv.width, cv.height);
  await document.fonts.load("400 80px 'Instrument Serif'");
  ctx.fillStyle = '#16151A'; ctx.font = "400 84px 'Instrument Serif'"; ctx.fillText('My Sixty', 60, 120);
  ctx.font = "italic 400 40px 'Instrument Serif'"; ctx.fillStyle = '#57545A'; ctx.fillText('The full cycle, one painting a day', 420, 118);
  const x0 = (W - cols * cell - (cols - 1) * gap) / 2;
  await Promise.all(S.C.pillars.map((p, i) => new Promise((ok) => { const im = new Image(); im.onload = () => { const x = x0 + (i % cols) * (cell + gap), y = top + Math.floor(i / cols) * (cell + gap); ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cell, cell, 14); ctx.clip(); ctx.drawImage(im, x, y, cell, cell); ctx.restore(); ok(); }; im.onerror = ok; im.src = art(p); })));
  ctx.fillStyle = '#16151A'; ctx.font = '600 26px Inter'; ctx.fillText('mindflow.zone/sixty', 60, cv.height - 60);
  return cv;
}
