// Flow Day — entry and routing. Same backend and features as the Chinese edition (流日历), in English.
// Tabs: Today / Calendar / Oracle / Friends; You and Settings open from the avatar. Without an account the app still
// works on a birthday kept on this phone; saving things asks for a free account.
import { $, $$, S, api, track, closeSheet, pillarOf, byGz, art, store, you } from './js/core.js';
import { pageLanding, pageReveal, pageSignin, pageInvite, pageReset, pageNeedBirth } from './js/onboard.js';
import { pageToday } from './js/today.js';
import { pageCalendar } from './js/calendar.js';
import { pageMe, pageCollection, pageSign, pageSixty, applyTheme, pageLegal, pageHow, pageRecap, pageLockscreen } from './js/me.js';
import { pageFriends, pagePair } from './js/friends.js';
import { pageSettings } from './js/settings.js';
import { pageOracle } from './js/oracle.js';

applyTheme();
const view = $('#view');

// who is looking. Called after content.json is loaded; clears the previous person's cached day.
async function loadMe() {
  S.today = null; S.noBirth = false; S.guest = null;
  try {
    const m = await api('GET', 'me');
    const date = m.user?.birth?.date;
    if (m.user && !date) { S.me = null; S.noBirth = true; return; }
    S.me = date ? { ...m, p: pillarOf(date) } : null;
    // the real day pillar can differ from the date when birth time and place move it past midnight (true solar time)
    if (S.me && m.user.birth.time) { try { const { card } = await api('GET', 'me/card'); S.me.p = byGz(card.pillar.gz) || S.me.p; } catch {} }
  } catch { S.me = null; }
  if (!S.me) { const g = store.get('guest'); if (g?.gz && byGz(g.gz)) S.guest = { ...g, p: byGz(g.gz) }; }
}

const APP = ['today', 'calendar', 'pick', 'oracle', 'friends', 'me', 'settings']; // a birthday is enough
const ACCOUNT = ['collection', 'recap', 'lockscreen']; // these keep things, so they need an account
const NO_TABS = ['home', 'reveal', 'signin', 'i', 'reset', 'needbirth'];
const WITH_FOOT = ['home', 'terms', 'privacy', 'sign', 'sixty', 'how'];
let lastPath = '';
function render() {
  const h = location.hash.replace(/^#/, '') || '/', [path, qs] = h.split('?'), parts = path.split('/').filter(Boolean), q = new URLSearchParams(qs || '');
  closeSheet();
  document.querySelectorAll('.theater').forEach((x) => x.remove());
  const reveal = q.get('r') === '1' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let page = parts[0] || (you() ? 'today' : 'home');
  if (S.noBirth && !['terms', 'privacy'].includes(page)) page = 'needbirth';
  else if (APP.includes(page) && !you()) page = 'home';
  else if (ACCOUNT.includes(page) && !S.me) page = you() ? 'me' : 'home';
  let code = parts[1] || '';
  try { code = decodeURIComponent(code); } catch {}
  if (page === 'today') pageToday(q.get('d'));
  else if (page === 'calendar' || page === 'pick') { page = 'calendar'; pageCalendar(q.get('t')); }
  else if (page === 'friends') pageFriends();
  else if (page === 'oracle') pageOracle();
  else if (page === 'recap') pageRecap(q.get('m'));
  else if (page === 'lockscreen') pageLockscreen();
  else if (page === 'me') pageMe();
  else if (page === 'settings') pageSettings();
  else if (page === 'collection') pageCollection();
  else if (page === 'reveal') pageReveal();
  else if (page === 'signin') pageSignin();
  else if (page === 'reset' && parts[1]) pageReset(parts[1]);
  else if (page === 'terms' || page === 'privacy') pageLegal(page);
  else if (page === 'how') pageHow();
  else if (page === 'i' && parts[1]) pageInvite(parts[1]);
  else if (page === 'pair' && parts[1]) pagePair(code, reveal);
  else if (page === 'needbirth') pageNeedBirth();
  else if (page === 'sign' && parts[1]) pageSign(parts[1], reveal);
  else if (page === 'sixty') pageSixty();
  else { page = 'home'; pageLanding(); }
  document.body.classList.toggle('has-tabs', !!you() && !NO_TABS.includes(page));
  document.body.classList.toggle('with-foot', WITH_FOOT.includes(page));
  topRight(page);
  const tab = page === 'pair' ? 'friends' : page;
  $$('.tabs a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (path !== lastPath) { scrollTo(0, 0); lastPath = path; track('us_visit', { page, guest: !S.me && !!S.guest }); }
  if (q.get('r') === '1') { q.delete('r'); const rest = q.toString(); history.replaceState(null, '', `#${path}${rest ? '?' + rest : ''}`); }
}
// top right: your avatar (opens You); "Sign in" for anyone without an account
function topRight(page) {
  const p = you(), mine = ['me', 'settings', 'collection', 'recap', 'lockscreen'].includes(page);
  $('#topRight').innerHTML = `${!S.me && !['signin', 'reveal'].includes(page) ? '<a class="toplink" href="#/signin">Sign in</a>' : ''}
    ${p && !['reveal', 'signin'].includes(page) ? `<a class="avatar" href="#/me" aria-label="You"${mine ? ' aria-current="page"' : ''}><img src="${art(p)}" alt=""></a>` : ''}`;
}
addEventListener('hashchange', render);
// tapping the tab you're already on refreshes it (back to today on Today)
$$('.tabs a').forEach((a) => a.addEventListener('click', () => { if (location.hash === a.getAttribute('href')) render(); }));
// coming back to an app left open overnight: move to the new day
let openedOn = new Date().toDateString();
addEventListener('visibilitychange', () => { if (document.hidden || new Date().toDateString() === openedOn) return; openedOn = new Date().toDateString(); if (you()) { S.today = null; render(); } });
// signing in or out, or changing birth details: reload who is looking, then redraw
addEventListener('sixty:auth', async () => { await loadMe(); render(); });

fetch('content.json').then((r) => r.json())
  .then(async (c) => { S.C = c; await loadMe(); render(); })
  .catch((e) => { console.error(e); view.innerHTML = '<div class="page"><p class="intro">Flow Day could not load. Please refresh.</p></div>'; });
