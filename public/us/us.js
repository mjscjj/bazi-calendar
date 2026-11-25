// Sixty — entry and routing. Same backend and features as the Chinese edition (流日历), in English.
import { $, $$, S, api, track, closeSheet, pillarOf, byGz, signName, art, esc, localDay } from './js/core.js';
import { pageLanding, pageReveal, pageSignin, pageInvite, pageReset, pageNeedBirth } from './js/onboard.js';
import { pageToday } from './js/today.js';
import { pageCalendar, pagePick } from './js/calendar.js';
import { pageMe, pageCollection, pageFriends, pagePair, pageSign, applyTheme, pageLegal, pageRecap } from './js/me.js';
import { pageOracle } from './js/oracle.js';

applyTheme();
const view = $('#view');

// who is signed in. Called after content.json is loaded; clears the previous person's cached day.
async function loadMe() {
  S.today = null; S.noBirth = false;
  try {
    const m = await api('GET', 'me');
    const date = m.user?.birth?.date;
    if (m.user && !date) { S.me = null; S.noBirth = true; return; }
    S.me = date ? { ...m, p: pillarOf(date) } : null;
    // the real day pillar can differ from the date when birth time and place move it past midnight (true solar time)
    if (S.me && m.user.birth.time) { try { const { card } = await api('GET', 'me/card'); S.me.p = byGz(card.pillar.gz) || S.me.p; } catch {} }
  } catch { S.me = null; }
}

function pageSixty() {
  const t = pillarOf(localDay());
  view.innerHTML = `<div class="page" style="max-width:1080px"><h1 class="display" style="margin-top:6px">All 60 signs</h1>
    <p class="lede">One for every day in the cycle — and one for everyone. ${S.me ? 'Yours is outlined.' : 'Which one is yours?'}</p>
    <div class="grid">${S.C.pillars.map((x) => `<a href="#/sign/${x.slug}"${S.me?.p.slug === x.slug ? ' class="mine"' : ''}><img src="${art(x)}" alt="" loading="lazy" width="180" height="180">
      <div class="nm">${signName(x)}</div><div class="sub">${x.slug === t.slug ? 'Today' : S.me?.p.slug === x.slug ? 'You' : esc(x.name)}</div></a>`).join('')}</div></div>`;
}

const TABBED = ['today', 'calendar', 'pick', 'oracle', 'friends', 'me', 'collection', 'recap'];
let lastPath = '';
function render() {
  const h = location.hash.replace(/^#/, '') || '/', [path, qs] = h.split('?'), parts = path.split('/').filter(Boolean), q = new URLSearchParams(qs || '');
  closeSheet();
  document.querySelectorAll('.tear, .theater').forEach((x) => x.remove());
  const reveal = q.get('r') === '1' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let page = parts[0] || (S.me ? 'today' : 'home');
  if (S.noBirth && !['terms', 'privacy'].includes(page)) page = 'needbirth';
  else if (TABBED.includes(page) && !S.me) page = 'home';
  let code = parts[1] || '';
  try { code = decodeURIComponent(code); } catch {}
  if (page === 'today') pageToday(q.get('d'));
  else if (page === 'calendar') pageCalendar();
  else if (page === 'pick') pagePick();
  else if (page === 'friends') pageFriends();
  else if (page === 'oracle') pageOracle();
  else if (page === 'recap') pageRecap(q.get('m'));
  else if (page === 'me') pageMe();
  else if (page === 'collection') pageCollection();
  else if (page === 'reveal') pageReveal();
  else if (page === 'signin') pageSignin();
  else if (page === 'reset' && parts[1]) pageReset(parts[1]);
  else if (page === 'terms' || page === 'privacy') pageLegal(page);
  else if (page === 'i' && parts[1]) pageInvite(parts[1]);
  else if (page === 'pair' && parts[1]) pagePair(code, reveal);
  else if (page === 'needbirth') pageNeedBirth();
  else if (page === 'sign' && parts[1]) pageSign(parts[1], reveal);
  else if (page === 'sixty') pageSixty();
  else { page = 'home'; pageLanding(); }
  document.body.classList.toggle('has-tabs', !!S.me && !['reveal', 'signin', 'i', 'reset', 'terms', 'privacy'].includes(page));
  $('#signinLink').hidden = !!S.me || ['signin', 'reveal'].includes(page);
  const tab = page === 'pick' ? 'calendar' : ['collection', 'friends', 'recap'].includes(page) ? 'me' : page;
  $$('.tabs a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (path !== lastPath) { scrollTo(0, 0); lastPath = path; track('us_visit', { page }); }
  if (q.get('r') === '1') { q.delete('r'); const rest = q.toString(); history.replaceState(null, '', `#/${path}${rest ? '?' + rest : ''}`); }
}
addEventListener('hashchange', render);
// tapping the tab you're already on refreshes it (back to today on Today)
$$('.tabs a').forEach((a) => a.addEventListener('click', () => { if (location.hash === a.getAttribute('href')) render(); }));
// coming back to an app left open overnight: move to the new day
let openedOn = localDay();
addEventListener('visibilitychange', () => { if (document.hidden || localDay() === openedOn) return; openedOn = localDay(); if (S.me) { S.today = null; render(); } });
// signing in or out, or changing birth details: reload who I am, then redraw
addEventListener('sixty:auth', async () => { await loadMe(); render(); });

fetch('content.json').then((r) => r.json())
  .then(async (c) => { S.C = c; await loadMe(); render(); })
  .catch((e) => { console.error(e); view.innerHTML = '<div class="page"><p class="intro">Sixty could not load. Please refresh.</p></div>'; });
