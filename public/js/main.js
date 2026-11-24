// 入口：路由、顶栏、底部页签、全局点击、离线缓存与“加到主屏”。
import { $, esc, api, closeSheet, dismissSheet, dispatchClick, onClick, mdText, mark, track, localToday, isDarkNow, setTheme, applyTheme, toast } from './core.js';
import { S } from './state.js';
import { pageToday } from './today.js';
import { pageCalendar } from './calendar.js';
import { pageMe, pageEnergy } from './me.js';
import { pageStart, pageCard, pageWelcome, openGuide } from './onboard.js';
import { pageAuth, pageForgot, pageProfile, pageMember, pageFeedback, pageAbout } from './account.js';
import { openPay } from './pay.js';
import { pageInvite, pageIcs, catchInvite } from './growth.js';
import { pageAsk, pageAskResult, pageAsks } from './ask.js';
import { pageWish, pageAmulets } from './wish.js';
import { pageLots } from './lots.js';
import './share.js';

const PAGES = {
  '/': pageToday, '/calendar': pageCalendar, '/me': pageMe, '/energy': pageEnergy,
  '/start': pageStart, '/card': pageCard, '/welcome': pageWelcome,
  '/login': pageAuth, '/register': pageAuth, '/forgot': pageForgot,
  '/profile': pageProfile, '/member': pageMember, '/feedback': pageFeedback, '/about': pageAbout,
  '/invite': pageInvite, '/ics': pageIcs, '/ask': pageAsk, '/ask/result': pageAskResult, '/asks': pageAsks, '/wish': pageWish, '/amulets': pageAmulets, '/lots': pageLots,
};
const TABS = [['/', '今天', 'sun'], ['/calendar', '日历', 'cal'], ['/me', '我的', 'me']];
const NEED_LOGIN = ['/me', '/energy', '/welcome', '/profile', '/member', '/feedback', '/invite', '/ics', '/ask', '/ask/result', '/asks', '/wish', '/amulets', '/lots'];
const GUEST_ONLY = ['/login', '/register', '/forgot', '/start'];
const ICON = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
};

export function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const i = h.indexOf('?');
  return { path: i >= 0 ? h.slice(0, i) : h, q: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
}
const go = (p) => { if (location.hash === '#' + p) renderPage(); else location.hash = '#' + p; };

function renderTop(r) {
  const tab = TABS.find((t) => t[0] === r.path) ? r.path : (['/energy', '/profile', '/member', '/feedback', '/about', '/card', '/invite', '/ics', '/asks', '/ask', '/ask/result', '/wish', '/amulets', '/lots'].includes(r.path) && S.me ? '/me' : '');
  let h = '<button class="brand" type="button" data-go="/" aria-label="流日历首页"><span class="mk">流</span><b>流日历</b></button>'
    + `<nav class="topnav" aria-label="主导航">${TABS.map(([p, label]) => `<a href="#${p}" class="${tab === p ? 'on' : ''}" aria-current="${tab === p ? 'page' : 'false'}">${label}${p === '/me' && S.unread ? '<i class="badge"></i>' : ''}</a>`).join('')}</nav><div class="sp-r">`
    + `<button type="button" class="themebtn" data-theme-toggle aria-label="${isDarkNow() ? '切换到白色' : '切换到深色'}" title="${isDarkNow() ? '切换到白色' : '切换到深色'}">${isDarkNow() ? ICON.light : ICON.dark}</button>`;
  if (S.me) {
    const a = S.access || {};
    let st = '', cls = '';
    if (a.mode === 'member') { cls = a.daysLeft <= 3 ? 'warn' : 'member'; st = '会员 · 至 ' + mdText(a.memberUntil); }
    else if (a.mode === 'free') st = '免费体验 · 剩 ' + a.remaining + ' 次';
    else if (a.mode === 'blocked') { cls = 'blocked'; st = '开通会员'; }
    if (st) h += `<button type="button" class="status ${cls}" data-go="/member">${st}</button>`;
  } else if (!['/login', '/register'].includes(r.path)) {
    h += '<a class="btn sm ghost" href="#/login">登录</a>';
  }
  $('#top').innerHTML = h + '</div>';
}
function renderTabbar(r) {
  const show = TABS.some((t) => t[0] === r.path);
  document.body.classList.toggle('has-tabs', show);
  $('#tabbar').hidden = !show;
  if (!show) return;
  $('#tabbar').innerHTML = TABS.map(([p, label, ic]) => `<a href="#${p}" class="${r.path === p ? 'on' : ''}" aria-current="${r.path === p ? 'page' : 'false'}">${ICON[ic]}<span>${label}</span>${p === '/me' && S.unread ? '<i class="badge"></i>' : ''}</a>`).join('');
}

export function renderPage() {
  closeSheet();
  const r = route();
  if (!S.me && NEED_LOGIN.includes(r.path)) return go('/login');
  if (S.me && GUEST_ONLY.includes(r.path)) return go(S.me.birth ? '/' : '/welcome');
  if (S.me && !S.me.birth && !['/welcome', '/about', '/card'].includes(r.path)) return go('/welcome');
  renderTop(r);
  renderTabbar(r);
  $('#view').dataset.page = (r.path.slice(1) || 'today');
  window.scrollTo(0, 0);
  (PAGES[r.path] || pageToday)(r);
  if (S.justRegistered && r.path === '/') { S.justRegistered = false; setTimeout(openGuide, 900); }
}

// 会员状态变了以后刷新顶栏（今天页、支付成功后会调）
export function refreshTop() { renderTop(route()); renderTabbar(route()); }

document.addEventListener('click', (e) => {
  if (dispatchClick(e)) { refreshTopSoon(); return; }
  const el = e.target.closest('[data-go],[data-back],[data-close-sheet],[data-reload],[data-pay],[data-dismiss]');
  if (!el) return;
  if (el.hasAttribute('data-close-sheet')) { if (el.tagName !== 'A') { dismissSheet(); return; } closeSheet(); }
  if (el.hasAttribute('data-go')) { go(el.getAttribute('data-go')); return; }
  if (el.hasAttribute('data-back')) { if (history.length > 1) history.back(); else go('/me'); return; }
  if (el.hasAttribute('data-reload')) { S.today = null; S.cal = null; renderPage(); return; }
  if (el.hasAttribute('data-pay')) { openPay(() => { refreshTop(); renderPage(); }); return; }
  if (el.hasAttribute('data-dismiss')) { const n = el.closest('[data-notice]'); mark(n.getAttribute('data-notice')); n.remove(); }
});
let topTimer;
function refreshTopSoon() { clearTimeout(topTimer); topTimer = setTimeout(refreshTop, 400); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dismissSheet(); });
window.addEventListener('hashchange', renderPage);
matchMedia('(min-width: 960px)').addEventListener('change', () => { if (!$('#sheet')) renderPage(); });
window.addEventListener('scroll', () => { $('#top').classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });

// 加到主屏：安卓 Chrome 会给安装事件，存下来等用户点按钮再弹
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installPrompt = e; });
window.addEventListener('appinstalled', () => { mark('a2hs-done'); track('a2hs_installed'); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// 从主屏或后台切回来：过了零点就换成新的一天；在支付宝付完款回来，会员状态也跟着更新
let lastActive = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { lastActive = Date.now(); return; }
  if ($('#sheet')) return;
  const r = route();
  const day = S.today && S.today.date;
  const stale = day && day !== localToday();
  const before = S.access && S.access.mode;
  const after = () => {
    const changed = S.access && S.access.mode !== before;
    if (stale || changed) { S.today = null; S.todayLocked = null; S.cal = null; S.calLocked = null; renderPage(); } else refreshTop();
  };
  if (!S.me) { if (stale) after(); return; }
  if (Date.now() - lastActive < 15000 && !stale) return;
  api('GET', 'me').then((d) => { S.me = d.user; S.access = d.access || null; S.unread = d.unread || 0; after(); }, () => {});
});

// 键盘弹出时收起底部页签，免得挡住输入框
document.addEventListener('focusin', (e) => { if (e.target.matches('input,textarea,select')) document.body.classList.add('typing'); });
document.addEventListener('focusout', () => { setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input,textarea,select')) document.body.classList.remove('typing'); }, 60); });

// 「我的 · 外观」改了以后刷新顶栏的图标
window.addEventListener('lrl-theme', () => refreshTop());

// 顶栏的太阳 / 月亮：在白色和深色之间切换
onClick('[data-theme-toggle]', () => {
  const next = isDarkNow() ? 'light' : 'dark';
  setTheme(next);
  refreshTop();
  toast(next === 'dark' ? '已切换到深色' : '已切换到白色');
  track('theme', { to: next });
});

function boot() {
  applyTheme();
  const from = new URLSearchParams(location.search).get('from');
  if (from) track('landing', { from });
  // 每次打开记一次（转化漏斗的第一步）
  try { if (!sessionStorage.getItem('lrl:visit')) { sessionStorage.setItem('lrl:visit', '1'); track('visit', { standalone: matchMedia('(display-mode: standalone)').matches }); } } catch { /* 无痕模式 */ }
  return api('GET', 'me').then((d) => {
    S.me = d.user; S.access = d.access || null; S.unread = d.unread || 0;
    S.priceCents = d.priceCents; S.memberDays = d.memberDays; S.inviteDays = d.inviteDays; S.planTypes = d.planTypes;
    return catchInvite().then(renderPage);
  }, (e) => {
    $('#view').innerHTML = `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" onclick="location.reload()">重新加载</button></div>`;
  });
}
boot();
