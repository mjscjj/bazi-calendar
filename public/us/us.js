// Sixty — entry and routing. Same backend and features as the Chinese edition (流日历), in English.
import { $, $$, S, api, track, closeSheet, pillarOf, signName, art, esc, localDay } from './js/core.js';
import { pageLanding, pageReveal, pageSignin, pageInvite } from './js/onboard.js';
import { pageToday } from './js/today.js';
import { pageCalendar, pagePick } from './js/calendar.js';
import { pageMe, pageCollection, pageFriends, pagePair, pageSign, applyTheme } from './js/me.js';

applyTheme();
const view = $('#view');

async function loadMe() {
  try {
    const m = await api('GET', 'me');
    const date = m.user?.birth?.date;
    S.me = date ? { ...m, p: S.C ? pillarOf(date) : null } : null;
  } catch { S.me = null; }
}

function pageSixty() {
  const t = pillarOf(localDay());
  view.innerHTML = `<div class="page" style="max-width:1080px"><h1 class="display" style="margin-top:6px">All 60 signs</h1>
    <p class="lede">One for every day in the cycle — and one for everyone. ${S.me ? 'Yours is outlined.' : 'Which one is yours?'}</p>
    <div class="grid">${S.C.pillars.map((x) => `<a href="#/sign/${x.slug}"${S.me?.p.slug === x.slug ? ' class="mine"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="180" height="180">
      <div class="nm">${signName(x)}</div><div class="sub">${x.slug === t.slug ? 'Today' : S.me?.p.slug === x.slug ? 'You' : esc(x.name)}</div></a>`).join('')}</div></div>`;
}

const TABBED = ['today', 'calendar', 'pick', 'friends', 'me', 'collection'];
let lastPath = '';
function render() {
  const h = location.hash.replace(/^#/, '') || '/', [path, qs] = h.split('?'), parts = path.split('/').filter(Boolean), q = new URLSearchParams(qs || '');
  closeSheet();
  document.querySelectorAll('.tear, .theater').forEach((x) => x.remove());
  const reveal = q.get('r') === '1' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let page = parts[0] || (S.me ? 'today' : 'home');
  if (TABBED.includes(page) && !S.me) page = 'home';
  if (page === 'today') pageToday(q.get('d'));
  else if (page === 'calendar') pageCalendar();
  else if (page === 'pick') pagePick();
  else if (page === 'friends') pageFriends();
  else if (page === 'me') pageMe();
  else if (page === 'collection') pageCollection();
  else if (page === 'reveal') pageReveal();
  else if (page === 'signin') pageSignin();
  else if (page === 'i' && parts[1]) pageInvite(parts[1]);
  else if (page === 'pair' && parts[1]) pagePair(decodeURIComponent(parts[1]), reveal);
  else if (page === 'sign' && parts[1]) pageSign(parts[1], reveal);
  else if (page === 'sixty') pageSixty();
  else { page = 'home'; pageLanding(); }
  document.body.classList.toggle('has-tabs', !!S.me && !['reveal', 'signin', 'i'].includes(page));
  const tab = page === 'pick' ? 'calendar' : page === 'collection' ? 'me' : page;
  $$('.tabs a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (path !== lastPath) { scrollTo(0, 0); lastPath = path; track('us_visit', { page }); }
  if (q.get('r') === '1') { q.delete('r'); const rest = q.toString(); history.replaceState(null, '', `#/${path}${rest ? '?' + rest : ''}`); }
}
addEventListener('hashchange', render);
// signing in or out, or changing birth details: reload who I am, then redraw
addEventListener('sixty:auth', async () => { await loadMe(); render(); });

Promise.all([fetch('content.json').then((r) => r.json()), loadMe()])
  .then(([c]) => { S.C = c; if (S.me) S.me.p = pillarOf(S.me.user.birth.date); render(); })
  .catch((e) => { console.error(e); view.innerHTML = '<div class="page"><p class="intro">Sixty could not load. Please refresh.</p></div>'; });
