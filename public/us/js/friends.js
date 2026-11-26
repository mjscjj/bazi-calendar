// Friends: your people, how each of you is doing today, and who to reach; the painting each pair makes;
// inviting; and the pair page after opening a friend's link.
import { $, $$, esc, S, api, store, track, toast, buzz, fmt, byGz, signName, aSign, stemOf, elOf, art, elStyle, level, loading, failed, openSheet, closeSheet, shareBase, ageOf, you } from './core.js';
import { sharePair } from './share.js';
import { needAccount } from './onboard.js';

const view = () => $('#view');
const KIND = { 合: 'match', 同: 'same', 我生: 'lift', 生我: 'lifted', 我克: 'push', 克我: 'pushed' };
const nameOf = (f) => (!f.name || /[一-鿿*]/.test(f.name) ? 'Friend' : f.name); // no first name yet: the server shows a masked email
const bestDate = (b) => b.date || `${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}`;
// a pair from the server, in English
export function pairEn(pr, meImage, youImage) {
  const file = String(pr.art || '').split('/').pop(), en = Object.values(S.C.pairs).find((x) => x.art === file);
  const k = S.C.pairKinds[KIND[pr.kind]] || S.C.pairKinds.same;
  return { name: en?.name || '', tag: k.tag, text: k.text.replace('{me}', meImage).replace('{you}', youImage), art: `../art/pairs/${file}` };
}

export async function pageFriends() {
  const p = you();
  view().innerHTML = `<div class="page split" style="${elStyle(elOf(p))}">
    <div class="cols"><div>
      <h1 class="h1" style="margin-top:4px">Your people</h1>
      <p class="muted" style="margin:4px 0 14px">Every pair of signs makes a painting of its own. Send your link — when a friend opens it, you both see yours.</p>
      <button class="btn block" id="invite">Invite a friend</button>
      <div id="reach"></div>
    </div>
    <div id="flist">${S.me ? loading(160) : ''}</div></div></div>`;
  $('#invite').addEventListener('click', inviteSheet);
  if (!S.me) { $('#flist').innerHTML = emptyHtml(); return; }
  try {
    const { list } = await api('GET', 'friends');
    const ok = list.filter((f) => f.pair);
    if (!$('#flist')) return;
    if (!ok.length) { $('#flist').innerHTML = emptyHtml(); return; }
    // who to reach today: both of you strong first, then whoever is strongest
    const ranked = ok.filter((f) => f.today).sort((a, b) => (b.today.them.k + b.today.me.k) - (a.today.them.k + a.today.me.k));
    const top = ranked[0];
    if (top && top.today.them.k >= 4) {
      const e = pairEn(top.pair, stemOf(p).image, '…');
      $('#reach').innerHTML = `<button class="card row-link" style="margin-top:12px" data-f="${list.indexOf(top)}"><img class="thumb" src="${e.art}" alt=""><div><p class="label">Reach out today</p><h3 class="h3" style="margin-top:2px">${esc(nameOf(top))} is having a ${level(top.today.them.k).word.toLowerCase()} day</h3><p class="small" style="margin:2px 0 0">${top.today.me.k >= 4 ? 'So are you — do something together.' : 'A good day to ask them for help.'}</p></div><span class="go">›</span></button>`;
    }
    $('#flist').innerHTML = `<div class="card"><div class="sec-h"><h2 class="h3">${ok.length} ${ok.length === 1 ? 'friend' : 'friends'}</h2><span class="small">Today</span></div>${ok.map((f) => { const e = pairEn(f.pair, stemOf(p).image, '…'); return `
      <button class="friend" data-f="${list.indexOf(f)}" style="width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left;cursor:pointer;font:inherit;color:inherit;padding-left:0;padding-right:0${f === ok[0] ? ';border-top:0' : ''}">
        <img src="${e.art}" alt="" width="56" height="56"><div><h3>${esc(nameOf(f))}</h3><p>${esc(e.name)} · ${e.tag}</p>
        ${f.today ? `<p class="today2"><span class="lv${f.today.me.k}"><i class="lvdot"></i>You: ${level(f.today.me.k).word}</span><span class="lv${f.today.them.k}"><i class="lvdot"></i>${esc(nameOf(f))}: ${level(f.today.them.k).word}</span></p>` : ''}</div><span class="go">›</span></button>`; }).join('')}</div>`;
    $$('[data-f]').forEach((b) => b.addEventListener('click', () => friendSheet(list[+b.dataset.f])));
  } catch (e) { $('#flist').innerHTML = failed(e.message); }
}
// no friends yet: show what a pair painting looks like, and what you get
function emptyHtml() {
  const p = you(), pair = Object.values(S.C.pairs)[7];
  return `<div class="card empty"><h2 class="h2">See what you make together</h2>
    <div class="sample"><img src="${art(p)}" alt=""><img src="../art/pairs/${pair.art}" alt=""><img src="${art(S.C.pillars[(p.no + 22) % 60])}" alt=""></div>
    <ul class="perks"><li>The painting the two of you make, and what it says about you</li><li>Each friend's day next to yours — who to reach today</li><li>The best day in the next two weeks to do something together</li></ul>
    <p class="hint">Friends see your sign and your painting — never your birthday.</p></div>`;
}
export async function inviteSheet() {
  if (needAccount('Create a free account to invite friends — you both see the painting your signs make.')) return;
  if (!S.me.user.nickname && !(await askName())) return;
  let code;
  try { code = (await api('GET', 'me/invite')).code; } catch (e) { toast(e.message); return; }
  const p = you(), url = `${shareBase()}i/${code}`;
  const text = `I'm ${aSign(p)} — ${p.name}. What painting do we make together?`;
  track('us_invite', { sign: p.slug });
  if (navigator.share) { try { await navigator.share({ text, url }); return; } catch (x) { if (x.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied — paste it to a friend'); } catch { prompt('Copy this link', url); }
}

// friends see your first name next to the painting: ask once, before the first invite
function askName() {
  return new Promise((done) => {
    openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">What should friends call you?</h2><p class="muted" style="margin:0 0 12px">They'll see it next to the painting you make together.</p>
      <form id="anForm"><input class="input" name="n" maxlength="12" autocomplete="given-name" placeholder="Your first name" required><p class="err"></p><button class="btn block" type="submit" style="margin-top:10px">Continue</button></form>`, '', () => done(false));
    $('#anForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('PUT', 'me/profile', { nickname: e.target.n.value.trim(), bio: S.me.user.bio || '', birth: S.me.user.birth }); S.me.user.nickname = e.target.n.value.trim(); done(true); closeSheet(); }
      catch (x) { e.target.querySelector('.err').textContent = x.message; }
    });
  });
}
function friendSheet(f) {
  // the pair painting's file name holds both stems (jia-yi.webp); the one that isn't mine is my friend's
  const p = you(), stems = String(f.pair.art || '').split('/').pop().replace('.webp', '').split('-'), mine = p.stem;
  const theirs = stems[0] === mine ? stems[1] : stems[0], e = pairEn(f.pair, stemOf(p).image, S.C.stems[theirs]?.image || 'them'), name = nameOf(f);
  buzz(5); track('us_friend_open');
  openSheet(`<button class="x" aria-label="Close">×</button><p class="label">You & ${esc(name)}</p><h2 class="h1">${esc(e.name)}</h2>
    <div class="art" style="margin-top:12px;aspect-ratio:4/3"><img src="${e.art}" alt="" width="720" height="720"><div class="tag"><span class="tagchip">${e.tag}</span></div></div>
    <p class="intro" style="font-size:19px">${esc(e.text)}</p>
    <div class="card" style="margin-top:12px">${f.today ? `<p class="today2" style="margin:0 0 10px"><span class="lv${f.today.me.k}"><i class="lvdot"></i>You today: ${level(f.today.me.k).word}</span><span class="lv${f.today.them.k}"><i class="lvdot"></i>${esc(name)}: ${level(f.today.them.k).word}</span></p>` : ''}
      ${f.pair.best ? `<p class="label">Best day to do something together</p><h3 class="h3" style="margin-top:2px">${fmt(bestDate(f.pair.best), 'full')}</h3><p class="small" style="margin:2px 0 0">The day in the next two weeks that is strongest for both of you.</p>` : ''}</div>
    <button class="btn ghost block" id="fShare" style="margin-top:12px">Share our painting</button>`);
  $('#fShare').addEventListener('click', () => sharePair({ art: e.art, el: elOf(p), kicker: `Me & ${name}`, title: e.name, sub: e.tag, meta: signName(p), body: 'Every pair of signs makes a painting of its own. What do you make with your people?' }));
}

// ---------- a pair painting: #/pair/CODE (after opening an invite) ----------
export function pagePair(code, reveal) {
  const pv = store.get('pairPreview');
  if (!pv || pv.code !== code) { location.hash = S.me ? '#/friends' : '#/'; return; }
  const r = store.get('reveal');
  if (!S.me && !S.guest && !r) { location.hash = `#/i/${encodeURIComponent(code)}`; return; } // no birthday yet: start from the invite
  const mineGz = you()?.cn || r?.gz, mine = mineGz ? byGz(mineGz) : null, them = pv.them ? byGz(pv.them) : null;
  const e = pairEn(pv.pair, mine ? stemOf(mine).image : 'you', them ? stemOf(them).image : 'them'), who = esc(pv.who || 'Your friend');
  const young = !S.me && r && ageOf(r.birth.date) < 13;
  view().innerHTML = `<div class="page wide pair${reveal ? ' reveal merge' : ''}">
    <div class="left"><div class="mergebox">${mine && them ? `<img class="m1" src="${art(mine)}" alt=""><img class="m2" src="${art(them)}" alt="">` : ''}<div class="art"><img src="${e.art}" alt="" width="720" height="720"><div class="tag"><span class="tagchip">${e.tag}</span></div></div></div></div>
    <div class="right after"><div class="sign-name" style="margin-top:16px"><p class="label">You & ${who}</p><h1 class="display" style="font-size:clamp(38px,10.5vw,56px)">${esc(e.name)}</h1><p class="poetic">${e.tag}</p></div>
      <p class="intro">${esc(e.text)}</p>
      ${pv.best ? `<div class="card" style="margin-top:14px"><p class="label">Best day to do something together</p><h3 class="h3" style="margin-top:4px">${fmt(bestDate(pv.best), 'full')}</h3></div>` : ''}
      <div class="btns">${S.me ? '<a class="btn block" href="#/friends">See all my friends</a>' : young ? '<p class="hint">Flow Day accounts are for ages 13 and up.</p>'
        : '<a class="btn block" href="#/today">See my day today</a><button class="btn ghost block" id="pairSignup">Save this painting — free account</button>'}
        <button class="btn ghost block" id="pairShare">Share our painting</button></div></div></div>`;
  $('#pairSignup')?.addEventListener('click', () => needAccount(`Save your sign and your painting with ${pv.who || 'your friend'} — and see their day next to yours.`));
  $('#pairShare').addEventListener('click', () => sharePair({ art: e.art, el: mine ? elOf(mine) : 'Earth', kicker: `Me & ${pv.who || 'a friend'}`, title: e.name, sub: e.tag, meta: mine && them ? `${signName(mine)} & ${signName(them)}` : 'Flow Day', body: 'Every pair of signs makes a painting of its own. What do you make with your people?' }));
  if (reveal) setTimeout(() => buzz(16), 1200);
}
