// Settings: birth details (all picked, none typed), name, appearance, sounds, lock screen, calendar app, help and account.
// Works for guests too: their birth details stay on this phone.
import { $, $$, esc, S, api, store, track, toast, closeSheet, openSheet, soundOn, sfx, fmt } from './core.js';
import { pickDate, pickTime, pickCity, timeLabel } from './pickers.js';
import { needAccount, setGuest } from './onboard.js';
import { applyTheme } from './me.js';

const view = () => $('#view');
const FB_TYPE = '建议'; // the Chinese edition's feedback category; the US edition files everything as a suggestion
const birthNow = () => ({ ...(S.me ? S.me.user.birth : S.guest?.birth) });

export function pageSettings() {
  const b = birthNow(), u = S.me?.user;
  const seg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button ${attr}="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  view().innerHTML = `<div class="page">
    <h1 class="h1" style="margin-top:4px">Settings</h1>
    <div class="sec"><div class="sec-h"><h2 class="h3">Your birth details</h2></div>
      <div class="card linklist">
        <button data-e="date"><span>Birthday</span><small>${b.date ? fmt(b.date, 'long') : 'Add'} ›</small></button>
        <button data-e="time"><span>Birth time</span><small>${b.time ? timeLabel(b.time) : 'Add'} ›</small></button>
        <button data-e="city"${b.time ? '' : ' disabled style="opacity:.55;cursor:default"'}><span>Birth place</span><small>${b.city ? esc(b.city) : b.time ? 'Add' : 'Add a birth time first'} ›</small></button>
        <div class="setrow"><span>Sex at birth</span>${seg('data-sex', [['女', 'Female'], ['男', 'Male'], ['', 'Not set']], b.gender || '')}</div>
      </div><p class="hint">Time and place sharpen your hour sign. Sex at birth sets the direction of your ten-year cycles.${S.me ? '' : ' Without an account these stay on this phone.'}</p></div>
    ${S.me ? `<div class="sec"><div class="sec-h"><h2 class="h3">Account</h2></div><div class="card linklist">
        <button data-a="name"><span>First name</span><small>${esc(u.nickname || 'Add')} ›</small></button>
        <div class="setrow"><span>Email</span><small>${esc(u.username)}</small></div></div></div>`
      : `<div class="sec"><div class="card"><h3 class="h3">Keep your days on any device</h3><p class="small" style="margin:4px 0 12px;color:var(--ink-2)">A free account keeps your collection, moods, plans, oracle journal and friends.</p><div class="btnrow"><button class="btn sm" id="stSave">Create a free account</button><a class="btn sm ghost" href="#/signin">Sign in</a></div></div></div>`}
    <div class="sec"><div class="sec-h"><h2 class="h3">App</h2></div><div class="card linklist">
      <div class="setrow"><span>Appearance</span>${seg('data-theme', [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']], store.get('theme') || 'auto')}</div>
      <div class="setrow"><span>Sounds</span>${seg('data-sound', [['1', 'On'], ['0', 'Off']], soundOn() ? '1' : '0')}</div>
      ${S.me ? `<a href="#/lockscreen"><span>Living lock screen</span><small>Repainted every morning ›</small></a>
      <div class="setrow"><span>Phone calendar</span><div class="btnrow"><button class="btn sm ghost" data-feed="apple">Apple</button><button class="btn sm ghost" data-feed="google">Google</button></div></div>` : ''}
    </div>${S.me ? '<p class="hint">The calendar feed adds a daily line with your level and best hours, plus your saved plans.</p>' : ''}</div>
    <div class="sec"><div class="sec-h"><h2 class="h3">Help</h2></div><div class="card linklist">
      <a href="#/how"><span>How Flow Day works</span><small>›</small></a>
      <button data-a="fb"><span>Send feedback</span><small>Ideas, bugs, anything ›</small></button>
      <a href="#/terms"><span>Terms of Use</span><small>›</small></a><a href="#/privacy"><span>Privacy Policy</span><small>›</small></a></div></div>
    <div class="sec"><div class="card linklist">${S.me ? '<button data-a="out"><span>Sign out</span></button><button data-a="del" class="danger"><span>Delete my account</span></button>'
      : '<button data-a="restart" class="danger"><span>Start over with a different birthday</span></button>'}</div>
      ${S.me?.access?.beta ? '<p class="hint">Flow Day Plus is free for everyone during the beta.</p>' : ''}</div>
  </div>`;
  $$('[data-e]').forEach((x) => x.addEventListener('click', () => { if (!x.disabled) editBirth(x.dataset.e); }));
  $$('[data-sex]').forEach((x) => x.addEventListener('click', () => saveBirth({ ...birthNow(), gender: x.dataset.sex || null })));
  $$('[data-theme]').forEach((x) => x.addEventListener('click', () => { store.set('theme', x.dataset.theme); applyTheme(); $$('[data-theme]').forEach((y) => y.setAttribute('aria-pressed', String(y === x))); }));
  $$('[data-sound]').forEach((x) => x.addEventListener('click', () => { store.set('sound', +x.dataset.sound); $$('[data-sound]').forEach((y) => y.setAttribute('aria-pressed', String(y === x))); if (+x.dataset.sound) sfx('chime'); }));
  $$('[data-feed]').forEach((x) => x.addEventListener('click', () => addFeed(x.dataset.feed)));
  $('#stSave')?.addEventListener('click', () => needAccount());
  $('[data-a=name]')?.addEventListener('click', nameSheet);
  $('[data-a=fb]').addEventListener('click', feedbackSheet);
  $('[data-a=out]')?.addEventListener('click', async () => { await api('POST', 'auth/logout').catch(() => {}); S.me = null; location.hash = '#/'; window.dispatchEvent(new Event('sixty:auth')); });
  $('[data-a=del]')?.addEventListener('click', deleteSheet);
  $('[data-a=restart]')?.addEventListener('click', () => { if (!confirm('Forget your birthday on this phone and start over?')) return; store.del('guest'); store.del('reveal'); S.guest = null; location.hash = '#/'; window.dispatchEvent(new Event('sixty:auth')); });
}

// open one picker and save; also used from You (add birth time, add sex at birth)
export async function editBirth(field) {
  const b = birthNow();
  if (field === 'sex') { location.hash = '#/settings'; return; }
  if (field === 'date') { const v = await pickDate(b.date); if (v) saveBirth({ ...b, date: v }); return; }
  if (field === 'time') {
    const v = await pickTime(b.time || null);
    if (v === null) return;
    if (!v) return saveBirth({ ...b, time: null, city: null });
    const next = { ...b, time: v };
    if (!b.city) { const c = await pickCity(''); if (c) next.city = c; }
    return saveBirth(next);
  }
  if (field === 'city') { const v = await pickCity(b.city || ''); if (v !== null) saveBirth({ ...b, city: v || null }); }
}
async function saveBirth(b) {
  const birth = { date: b.date, time: b.time || null, city: b.time && b.city ? b.city : null, gender: b.gender || null };
  try {
    if (S.me) {
      await api('PUT', 'me/profile', { nickname: S.me.user.nickname || '', bio: S.me.user.bio || '', birth });
      track('us_profile', { time: !!birth.time, place: !!birth.city, sex: !!birth.gender });
    } else {
      const { card } = await api('POST', 'preview/card', { birth });
      setGuest({ ...store.get('guest'), birth, gz: card.pillar.gz });
    }
    S.today = null; toast('Saved');
    window.dispatchEvent(new Event('sixty:auth'));
  } catch (x) { toast(x.message); }
}
function nameSheet() {
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Your first name</h2><p class="muted" style="margin:0 0 12px">Friends see it next to the painting you make together.</p>
    <form id="nmForm"><input class="input" name="n" maxlength="12" autocomplete="given-name" value="${esc(S.me.user.nickname || '')}"><p class="err"></p><button class="btn block" type="submit" style="margin-top:10px">Save</button></form>`);
  $('#nmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('PUT', 'me/profile', { nickname: e.target.n.value.trim(), bio: S.me.user.bio || '', birth: S.me.user.birth }); closeSheet(); toast('Saved'); window.dispatchEvent(new Event('sixty:auth')); }
    catch (x) { e.target.querySelector('.err').textContent = x.message; }
  });
}
function feedbackSheet() {
  if (needAccount('Create a free account to send feedback — so we can write back.')) return;
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Send feedback</h2><p class="muted" style="margin:0 0 12px">We read every note. Thank you for helping shape Flow Day.</p>
    <form id="fbForm"><textarea class="input" name="t" rows="5" maxlength="500" required placeholder="What should we know?"></textarea>
<p class="err"></p><button class="btn block" type="submit" style="margin-top:10px">Send</button></form>`);
  $('#fbForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', 'feedback', { type: FB_TYPE, content: e.target.t.value.trim(), contact: S.me.user.username }); closeSheet(); toast('Thank you!'); }
    catch (x) { e.target.querySelector('.err').textContent = x.message; }
  });
}
function deleteSheet() {
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Delete your account</h2>
    <p class="muted" style="margin:0 0 12px">This permanently deletes your account, birth details, collection, friends and history. It can't be undone.</p>
    <form id="delForm"><label class="field"><span class="label">Type your password to confirm</span><input class="input" name="pw" type="password" autocomplete="current-password" required></label>
    <p class="err"></p><button class="btn block danger-btn" type="submit" style="margin-top:10px">Delete everything</button></form>`);
  $('#delForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', 'me/delete', { password: e.target.pw.value }); closeSheet(); S.me = null; toast('Your account has been deleted'); location.hash = '#/'; window.dispatchEvent(new Event('sixty:auth')); }
    catch (x) { e.target.querySelector('.err').textContent = x.message; }
  });
}
async function addFeed(kind) {
  try {
    const f = await api('GET', 'me/calendar-feed');
    track('us_feed', { kind });
    if (kind === 'google') window.open('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(f.webcal), '_blank');
    else location.href = f.webcal;
  } catch (e) { toast(e.message); }
}
