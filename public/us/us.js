// Sixty — the US edition. Everything is computed in the browser: the Day Pillar of a date is
// pure arithmetic on the sixty-day cycle, so birthdays never leave the device.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const STEMS = 'jia yi bing ding wu ji geng xin ren gui'.split(' ');
const BRANCHES = 'zi chou yin mao chen si wu wei shen you xu hai'.split(' ');
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const WEEK = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ');
const HE = ['0-5', '1-6', '2-7', '3-8', '4-9'];
const SITE = 'mindflow.zone/sixty';
const view = $('#view');
let C; // content.json

// ---------- dates and the cycle ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };
// 0 = 甲子. Checked against the Chinese edition's engine for every date 1836–2164.
const cycleIndex = (s) => { const [y, m, d] = s.split('-').map(Number); return ((Math.floor(Date.UTC(y, m - 1, d) / 864e5) + 17) % 60 + 60) % 60; };
const pillarOf = (s) => C.pillars[cycleIndex(s)];
const bySlug = (slug) => C.pillars.find((p) => p.slug === slug);
const stemIdx = (p) => (p.no - 1) % 10;
const titleOf = (p) => `${cap(STEMS[(p.no - 1) % 10])} ${cap(BRANCHES[(p.no - 1) % 12])}`;
const stemOf = (p) => C.stems[p.stem];
const fmt = (s, long) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d); return long ? `${MONTHS[m - 1]} ${d}, ${y}` : `${WEEK[t.getDay()]}, ${MONTHS[m - 1]} ${d}`; };
const art = (p) => `../art/pillars/${p.art}`;
const sealHtml = (chars, size = 'md') => `<span class="seal ${size}" aria-hidden="true">${[...chars].map((c) => `<i>${c}</i>`).join('')}</span>`;

// What a day means for you: today's stem against yours, through the five elements.
function dayKind(today, mine) {
  const t = stemIdx(today) >> 1, m = stemIdx(mine) >> 1;
  if (t === m) return 'same';
  if ((t + 1) % 5 === m) return 'feeds';
  if ((m + 1) % 5 === t) return 'draws';
  if ((m + 2) % 5 === t) return 'yields';
  return 'tests';
}
// The painting two people make, told from "me" to "you" (same rules as the Chinese edition).
function pairOf(me, you) {
  const a = stemIdx(me), b = stemIdx(you), lo = Math.min(a, b), hi = Math.max(a, b);
  const ea = a >> 1, eb = b >> 1;
  const kind = HE.includes(`${lo}-${hi}`) ? 'match' : ea === eb ? 'same' : (ea + 1) % 5 === eb ? 'lift' : (eb + 1) % 5 === ea ? 'lifted' : (ea + 2) % 5 === eb ? 'push' : 'pushed';
  const k = C.pairKinds[kind], p = C.pairs[`${STEMS[lo]}-${STEMS[hi]}`];
  return { ...p, kind, tag: k.tag, text: k.text.replace('{me}', stemOf(me).image).replace('{you}', stemOf(you).image), seal: C.stems[STEMS[lo]].cn + C.stems[STEMS[hi]].cn, art: `../art/pairs/${p.art}` };
}

// ---------- the visitor ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('sixty.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('sixty.' + k, JSON.stringify(v)); } catch {} },
};
const me = () => { const m = store.get('me'); return m && m.date && bySlug(m.slug) ? { ...m, p: bySlug(m.slug) } : null; };
const anon = () => { let a = store.get('anon'); if (!a) { a = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('anon', a); } return a; };
const SRC = (new URLSearchParams(location.search).get('src') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
let queue = [], timer;
function track(name, props = {}) {
  queue.push({ name, props: { ...props, src: SRC || undefined } });
  clearTimeout(timer); timer = setTimeout(flush, 1200);
}
function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ anonId: anon(), events: queue.splice(0, 30) });
  if (navigator.sendBeacon) navigator.sendBeacon('../api/events', new Blob([body], { type: 'application/json' }));
  else fetch('../api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
addEventListener('pagehide', flush);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400);
}

// ---------- birthday field: types as MM / DD / YYYY, accepts autofill ----------
function birthdayField(id, label) {
  return `<label class="kicker" for="${id}">${label}</label>
    <div class="row"><input id="${id}" type="text" inputmode="numeric" autocomplete="bday" placeholder="MM / DD / YYYY" maxlength="14" aria-describedby="${id}-err">
    <button class="btn" type="submit">Reveal</button></div>
    <p class="err" id="${id}-err"></p>`;
}
function wireBirthday(form, onDate) {
  const input = form.querySelector('input'), err = form.querySelector('.err');
  input.addEventListener('input', () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return; // autofill gives ISO
    const d = input.value.replace(/\D/g, '').slice(0, 8);
    input.value = d.length > 4 ? `${d.slice(0, 2)} / ${d.slice(2, 4)} / ${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
    err.textContent = '';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let y, m, d;
    const v = input.value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) [y, m, d] = v.split('-').map(Number);
    else { const n = v.replace(/\D/g, ''); if (n.length === 8) { m = +n.slice(0, 2); d = +n.slice(2, 4); y = +n.slice(4); } }
    const t = y && new Date(y, m - 1, d);
    if (!t || t.getMonth() !== m - 1 || t.getDate() !== d) { err.textContent = 'Please enter a real date, like 03 / 14 / 1992.'; input.focus(); return; }
    const s = iso(t);
    if (y < 1900 || s > localDay()) { err.textContent = 'Please enter a birthday between 1900 and today.'; input.focus(); return; }
    onDate(s);
  });
}
const saveMe = (date) => { const p = pillarOf(date); store.set('me', { date, slug: p.slug }); return p; };

// ---------- pieces ----------
function plate(p, { reveal, seal = p.cn, src = art(p), left = `No. ${p.no} of 60`, right = p.py, alt = '' } = {}) {
  return `<figure class="plate${reveal ? ' unroll' : ''}"><div class="wrap"><div class="frame"><img src="${src}" alt="${esc(alt)}" width="720" height="720">${sealHtml(seal)}</div><div class="rods"></div></div>
    <figcaption><span class="kicker">${left}</span><span class="kicker">${right}</span></figcaption></figure>`;
}
function waitlistHtml(sign) {
  if (store.get('wait')) return `<section class="wait"><h3>You're on the list.</h3><p>We'll write when the first painting is ready for you.</p></section>`;
  return `<section class="wait"><h3>A new painting <em>every morning.</em></h3>
    <p>Sixty is becoming an app: each day's painting, and what it means for you. Join the waitlist and be first in.</p>
    <form class="ask" id="waitForm" data-sign="${esc(sign || '')}"><label class="kicker" for="wmail">Email</label>
    <div class="row"><input id="wmail" type="email" autocomplete="email" placeholder="you@example.com" required><button class="btn" type="submit">Join</button></div><p class="err"></p></form></section>`;
}
function wireWaitlist() {
  const f = $('#waitForm'); if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button'), err = f.querySelector('.err'), email = f.querySelector('input').value.trim();
    btn.disabled = true; err.textContent = '';
    try {
      const r = await fetch('../api/us/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, sign: f.dataset.sign, ref: SRC }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Something went wrong. Please try again.');
      store.set('wait', 1); track('us_waitlist', { sign: f.dataset.sign });
      f.closest('.wait').outerHTML = waitlistHtml();
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
}

// ---------- pages ----------
function pageHome() {
  const today = localDay(), p = pillarOf(today), m = me();
  view.innerHTML = `
    <div class="page home">
      <div class="h-head hero">
        <p class="kicker">The Chinese calendar of sixty</p>
        <h1>There are sixty kinds of days. <em>And sixty kinds of people.</em></h1>
      </div>
      <div class="h-plate">
        ${plate(p, { left: `Today · ${fmt(today)}`, right: `No. ${p.no} of 60`, alt: `Today's painting: ${p.name}` })}
        <div class="today-cap"><p class="name">${titleOf(p)} <em>— ${esc(p.name)}</em></p></div>
      </div>
      <div class="h-form hero">
        ${m ? `<div class="stack"><a class="btn block" href="#/sign/${m.p.slug}">See my sign · ${titleOf(m.p)}</a></div>` : ''}
        <form class="ask" id="birthForm">${birthdayField('bday', m ? 'Someone else? Their birthday' : 'Your birthday')}
          <p class="fine">No account needed. Your birthday stays on this device.</p></form>
        <p class="lede">For over three thousand years, the Chinese calendar has given every day one of sixty signs. The day you were born gives you yours — its own painting, element and character.</p>
      </div>
    </div>
    <div class="page">
      <hr class="rule">
      <h2 class="sec-title">How it <em>works</em></h2>
      <ol class="how">
        <li><span class="n">i.</span><div><h3>Your sign</h3><p>The day you were born is one of sixty. Each has its own painting, element and animal — and says something true about how you move through the world.</p></div></li>
        <li><span class="n">ii.</span><div><h3>Your days</h3><p>Every day has a sign too. See whether today nourishes you, tests you, or is yours to harvest — and plan around it.</p></div></li>
        <li><span class="n">iii.</span><div><h3>Your people</h3><p>Send a link to someone. When they add their birthday, you'll see the painting the two of you make.</p></div></li>
      </ol>
      <hr class="rule">
      <h2 class="sec-title">The <em>Sixty</em></h2>
      <div class="strip"><div class="track">${[...C.pillars, ...C.pillars].map((x, i) => `<a href="#/sign/${x.slug}"${i >= 60 ? ' aria-hidden="true" tabindex="-1"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="116" height="116"><span>No. ${x.no} · ${titleOf(x)}</span></a>`).join('')}</div></div>
      <a class="more" href="#/sixty">See all sixty</a>
    </div>`;
  wireBirthday($('#birthForm'), (d) => {
    const x = saveMe(d); track('us_reveal', { sign: x.slug, from: 'home' });
    location.hash = `#/sign/${x.slug}?r=1`;
  });
  if (route().q.get('focus')) $('#bday').focus();
}

function dayCardHtml(mine, offset) {
  const d = localDay(offset), t = pillarOf(d), k = C.days[dayKind(t, mine)];
  return `<div class="body"><img src="${art(t)}" alt="" width="84" height="84"><div>
    <p class="kicker">${fmt(d)} · ${esc(t.name)}</p><h3>${k.title}</h3><p>${k.line}</p></div></div>`;
}

function pageSign(slug, reveal) {
  const p = bySlug(slug); if (!p) { location.hash = '#/'; return; }
  const m = me(), mine = m && m.slug === slug, s = stemOf(p), today = pillarOf(localDay());
  view.innerHTML = `
    <div class="page wide sign">
      <div class="left">${plate(p, { reveal, alt: p.name })}</div>
      <div class="right${reveal ? ' unroll' : ''}"><div class="after">
        <div class="sign-head">
          <p class="kicker">${mine ? `Your sign · Born ${fmt(m.date, true)}` : today.slug === slug ? `Today's sign · ${fmt(localDay())}` : `Sign no. ${p.no} of 60`}</p>
          <h1>${titleOf(p)}</h1><h2>${esc(p.name)}</h2>
          <p class="meta">${s.polarity} ${s.element}<span class="dot">·</span>${p.animal}<span class="dot">·</span>The ${s.image}</p>
        </div>
        <p class="intro">${esc(p.intro)}</p>
        <div class="traits">${s.traits.map((t) => `<span>${t}</span>`).join('')}</div>
        <p class="explain">${mine ? 'Your sign is your' : 'A sign is a'} <b>Day Pillar</b>: the two characters for ${mine ? 'the day you were born' : 'a day in the sixty-day cycle'}. The top one, <span class="cjk">${p.cn[0]}</span> ${s.py}, is the element — ${s.polarity} ${s.element}, the ${s.image}. The bottom one, <span class="cjk">${p.cn[1]}</span> ${p.py.split(' ')[1]}, is its animal, the ${p.animal}.</p>
        ${mine ? `
          <section class="daycard" aria-label="What the day means for you">
            <div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-off="0">Today, for you</button><button role="tab" aria-selected="false" data-off="1">Tomorrow</button></div>
            <div id="dayBody">${dayCardHtml(p, 0)}</div>
          </section>
          <div class="stack"><button class="btn block" id="shareSign">Share my sign</button><button class="btn ghost block" id="invite">See the painting you make with a friend</button></div>`
        : `<div class="stack"><a class="btn block" href="${m ? `#/sign/${m.slug}` : '#/?focus=1'}">${m ? `Back to my sign · ${titleOf(m.p)}` : 'Find your sign'}</a></div>`}
        <hr class="rule">
        ${waitlistHtml(mine ? slug : m?.slug)}
      </div></div>
    </div>`;
  if (reveal && !matchMedia('(prefers-reduced-motion: reduce)').matches) setTimeout(() => navigator.vibrate?.(14), 1600);
  if (mine) {
    view.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
      view.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $('#dayBody').innerHTML = dayCardHtml(p, +b.dataset.off);
    }));
    $('#shareSign').addEventListener('click', () => shareImage(() => drawCard({
      art: art(p), seal: p.cn, cap: [`No. ${p.no} of 60`, p.py], kicker: 'My sign', title: titleOf(p), sub: p.name,
      meta: `${s.polarity} ${s.element} · ${p.animal} · The ${s.image}`, body: p.intro,
    }), `sixty-${p.slug}.jpg`, p.slug));
    $('#invite').addEventListener('click', () => inviteSheet(p));
  }
  wireWaitlist();
}

function inviteSheet(p, backTo) {
  openSheet(`<button class="x" aria-label="Close">×</button>
    <h3>${backTo ? `Send it back to ${esc(backTo)}` : 'What do you two make?'}</h3>
    <p>${backTo ? `${esc(backTo)} will see your painting together when they open the link.` : 'Send a link. When they add their birthday, they see the painting you make together — and can send it right back.'} Neither of you sees the other's birthday.</p>
    <form class="ask" id="invForm"><label class="kicker" for="invName">Your first name, so they know it's you</label>
      <div class="row"><input id="invName" type="text" autocomplete="given-name" maxlength="24" placeholder="Optional"><button class="btn" type="submit">Send link</button></div></form>`);
  const saved = store.get('name'); if (saved) $('#invName').value = saved;
  $('#invForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#invName').value.trim().slice(0, 24); store.set('name', name);
    const url = `${location.origin}${location.pathname}#/with/${p.slug}${name ? `?n=${encodeURIComponent(name)}` : ''}`;
    const text = `I'm a ${titleOf(p)} — ${p.name}. What painting do we make together?`;
    track('us_invite', { sign: p.slug, back: !!backTo });
    if (navigator.share) { try { await navigator.share({ text, url }); closeSheet(); return; } catch (x) { if (x.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(`${text} ${url}`); closeSheet(); toast('Link copied — paste it to a friend'); }
    catch { prompt('Copy this link', url); }
  });
}

function pageWith(slug, name, reveal) {
  const them = bySlug(slug); if (!them) { location.hash = '#/'; return; }
  const who = (name || '').replace(/[\u0000-\u001f]/g, '').slice(0, 24) || 'Your friend';
  const m = me();
  if (!m) {
    track('us_invite_open', { sign: slug });
    view.innerHTML = `<div class="page">
      <p class="kicker" style="margin-top:18px">An invitation</p>
      <div class="duo"><img src="${art(them)}" alt="" width="64" height="64"><div class="who"><b>${esc(who)}</b>is a ${titleOf(them)} — ${esc(them.name)}</div></div>
      <p class="invite-q">Add your birthday to see the painting <em>the two of you make.</em></p>
      <form class="ask" id="pairForm">${birthdayField('pday', 'Your birthday')}
        <p class="fine">Your birthday stays on this device. ${esc(who)} won't see it — only the painting.</p></form>
      <hr class="rule">
      <ol class="how"><li><span class="n">i.</span><div><h3>Sixty kinds of people</h3><p>The Chinese calendar gives every day one of sixty signs. The day you were born gives you yours.</p></div></li>
      <li><span class="n">ii.</span><div><h3>Two signs, one painting</h3><p>Put two signs together and they make a scene of their own: rain on a mountain, a lantern by the river.</p></div></li></ol>
    </div>`;
    wireBirthday($('#pairForm'), (d) => {
      const x = saveMe(d); track('us_reveal', { sign: x.slug, from: 'invite' });
      location.hash = `#/with/${slug}?${name ? `n=${encodeURIComponent(name)}&` : ''}r=1`;
    });
    return;
  }
  const own = m.slug === slug && !name;
  const pr = pairOf(m.p, them);
  if (reveal) track('us_pair', { a: m.slug, b: slug, kind: pr.kind });
  view.innerHTML = `
    <div class="page wide sign">
      <div class="left">${plate(m.p, { reveal, seal: pr.seal, src: pr.art, left: 'Your painting together', right: pr.tag, alt: pr.name })}</div>
      <div class="right${reveal ? ' unroll' : ''}"><div class="after">
        <div class="sign-head"><p class="kicker">${own ? 'Your own link' : `You & ${esc(who)}`}</p><h1 style="font-size:clamp(40px,11vw,58px)">${esc(pr.name)}</h1><h2>${pr.tag}</h2></div>
        <p class="intro">${esc(pr.text)}</p>
        <div class="duo"><img src="${art(m.p)}" alt="" width="64" height="64"><div class="who"><b>You</b>${titleOf(m.p)} — ${esc(m.p.name)}</div></div>
        <div class="duo"><img src="${art(them)}" alt="" width="64" height="64"><div class="who"><b>${esc(who)}</b>${titleOf(them)} — ${esc(them.name)}</div></div>
        ${own ? `<p class="explain">This is your own invite link. Send it to someone — when they open it, they'll see the painting you make together.</p>` : ''}
        <div class="stack">
          ${own ? '' : `<button class="btn block" id="sendBack">Send it back to ${esc(who)}</button>`}
          <button class="btn ${own ? '' : 'ghost '}block" id="shareDuo">Share our painting</button>
          <a class="btn ghost block" href="#/sign/${m.slug}">See my sign</a>
        </div>
        <hr class="rule">${waitlistHtml(m.slug)}
      </div></div>
    </div>`;
  if (reveal) setTimeout(() => navigator.vibrate?.(14), 1600);
  $('#sendBack')?.addEventListener('click', () => inviteSheet(m.p, who));
  $('#shareDuo').addEventListener('click', () => shareImage(() => drawCard({
    art: pr.art, seal: pr.seal, cap: ['Our painting', pr.tag], kicker: own ? 'Two signs, one painting' : `Me & ${who}`, title: pr.name, sub: pr.tag,
    meta: `${titleOf(m.p)} & ${titleOf(them)}`, body: `The ${stemOf(m.p).image} and the ${stemOf(them).image}. What do you make with your people?`,
  }), `sixty-${pr.kind}.jpg`, `${m.slug}+${slug}`));
  wireWaitlist();
}

function pageSixty() {
  const t = pillarOf(localDay()), m = me();
  view.innerHTML = `<div class="gal-head"><p class="kicker">The complete cycle</p><h1>The Sixty</h1>
    <p>Sixty signs, in the order the calendar turns through them: one a day, round and round, for three thousand years. ${m ? 'Yours is outlined.' : 'One of them is yours.'}</p></div>
    <div class="grid">${C.pillars.map((x) => `<a href="#/sign/${x.slug}"${m && m.slug === x.slug ? ' class="mine"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="180" height="180">
      <div class="no"><span>No. ${x.no}</span>${x.slug === t.slug ? '<span class="today">Today</span>' : m && m.slug === x.slug ? '<span>You</span>' : ''}</div><div class="nm">${titleOf(x)}</div></a>`).join('')}</div>`;
}

// ---------- share image: a 1080 × 1920 story card ----------
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
function spaced(ctx, text, x, y, track, align = 'left') {
  const w = [...text].reduce((a, c) => a + ctx.measureText(c).width + track, -track);
  let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  for (const c of text) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + track; }
}
function wrapLines(ctx, text, max) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function drawSeal(ctx, chars, x, y, s) {
  ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate(-2 * Math.PI / 180);
  ctx.fillStyle = '#B0362A'; ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, s * .06); ctx.fill();
  ctx.strokeStyle = 'rgba(248,239,230,.85)'; ctx.lineWidth = s * .03; ctx.strokeRect(-s / 2 + s * .07, -s / 2 + s * .07, s * .86, s * .86);
  ctx.fillStyle = '#F8EFE6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${s * .34}px 'Songti SC','STSong','Noto Serif CJK SC','Noto Serif SC',serif`;
  ctx.fillText(chars[0], 0, -s * .19); ctx.fillText(chars[1], 0, s * .2);
  ctx.restore();
}
async function drawCard(o) {
  await Promise.all(["500 130px Cormorant", "italic 500 72px Cormorant", "500 26px Inter"].map((f) => document.fonts.load(f)));
  const W = 1080, H = 1920, X = 100, IW = 880, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = await loadImg(o.art);
  ctx.fillStyle = '#F3EEE4'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  drawSeal(ctx, '甲子', X, 112, 58);
  ctx.fillStyle = '#1C1A17'; ctx.font = "600 52px Cormorant"; ctx.fillText('Sixty', X + 78, 158);
  ctx.fillStyle = '#8A8377'; ctx.font = "500 24px Inter"; spaced(ctx, 'CHINESE DAY SIGNS', W - X, 152, 4, 'right');
  ctx.save(); ctx.shadowColor = 'rgba(60,45,25,.28)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24; ctx.fillStyle = '#ECE5D8'; ctx.fillRect(X, 240, IW, IW); ctx.restore();
  ctx.drawImage(img, X, 240, IW, IW);
  drawSeal(ctx, o.seal, X + IW - 62 - 104, 240 + IW - 62 - 104, 104);
  ctx.fillStyle = '#8A8377'; ctx.font = "500 24px Inter";
  spaced(ctx, o.cap[0].toUpperCase(), X, 1168, 4); spaced(ctx, o.cap[1].toUpperCase(), W - X, 1168, 4, 'right');
  ctx.fillStyle = '#8A8377'; spaced(ctx, o.kicker.toUpperCase(), X, 1290, 5);
  let size = 130; ctx.font = `500 ${size}px Cormorant`;
  while (ctx.measureText(o.title).width > IW && size > 70) { size -= 4; ctx.font = `500 ${size}px Cormorant`; }
  ctx.fillStyle = '#1C1A17'; ctx.fillText(o.title, X - 4, 1290 + size * .92);
  const yS = 1290 + size * .92 + 84;
  ctx.fillStyle = '#4F4A42'; ctx.font = "italic 500 68px Cormorant"; ctx.fillText(o.sub, X, yS);
  ctx.fillStyle = '#8A8377'; ctx.font = "500 24px Inter"; spaced(ctx, o.meta.toUpperCase(), X, yS + 62, 4);
  ctx.fillStyle = '#1C1A17'; ctx.font = "500 44px Cormorant";
  wrapLines(ctx, o.body, IW).slice(0, 3).forEach((l, i) => ctx.fillText(l, X, yS + 140 + i * 58));
  ctx.fillStyle = '#D9D0C0'; ctx.fillRect(X, 1782, IW, 2);
  ctx.fillStyle = '#1C1A17'; ctx.font = "italic 500 44px Cormorant"; ctx.fillText("What's your sign?", X, 1852);
  ctx.font = "500 26px Inter"; ctx.textAlign = 'right'; ctx.fillText(SITE, W - X, 1848); ctx.textAlign = 'left';
  return cv;
}
async function shareImage(make, filename, sign) {
  openSheet(`<button class="x" aria-label="Close">×</button><h3>Your card</h3><p>Made for Stories and TikTok.</p><p class="tip">Getting it ready…</p>`);
  let cv;
  try { cv = await make(); } catch { closeSheet(); toast('Could not make the image. Please try again.'); return; }
  const url = cv.toDataURL('image/jpeg', .9);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', .9));
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const canFiles = navigator.canShare && navigator.canShare({ files: [file] });
  const touch = matchMedia('(pointer: coarse)').matches;
  openSheet(`<button class="x" aria-label="Close">×</button><h3>Your card</h3>
    <img class="shot" src="${url}" alt="Your Sixty card">
    ${touch ? '<p class="tip">Press and hold the image to save it to Photos.</p>' : ''}
    <div class="stack">${canFiles ? '<button class="btn block" id="doShare">Share image</button>' : ''}
    ${!touch || !canFiles ? `<a class="btn ${canFiles ? 'ghost ' : ''}block" id="doSave" href="${url}" download="${filename}">Download image</a>` : ''}</div>`);
  track('us_share', { sign, step: 'open' });
  $('#doShare')?.addEventListener('click', async () => {
    try { await navigator.share({ files: [file] }); track('us_share', { sign, step: 'shared' }); } catch {}
  });
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
let lastPath = '';
function render() {
  const { parts, q } = route();
  closeSheet();
  const reveal = q.get('r') === '1' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (parts[0] === 'sign' && parts[1]) pageSign(parts[1], reveal);
  else if (parts[0] === 'with' && parts[1]) pageWith(parts[1], q.get('n'), reveal);
  else if (parts[0] === 'sixty') pageSixty();
  else pageHome();
  const path = parts.join('/');
  if (path !== lastPath) { scrollTo(0, 0); lastPath = path; track('us_visit', { page: parts[0] || 'home' }); }
  // the reveal plays once: drop ?r=1 so a reload or a shared URL doesn't replay it
  if (q.get('r') === '1') { q.delete('r'); const rest = q.toString(); history.replaceState(null, '', `#/${path}${rest ? '?' + rest : ''}`); }
}
addEventListener('hashchange', render);

fetch('content.json').then((r) => r.json()).then((c) => { C = c; render(); })
  .catch((e) => { console.error(e); view.innerHTML = '<div class="page"><p class="intro">Sixty could not load. Please refresh.</p></div>'; });
