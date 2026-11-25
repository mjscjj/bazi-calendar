// 公共工具：选择器、转义、接口请求、提示、底部弹层、点击分发、埋点。
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
export function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export const pad = (n) => String(n).padStart(2, '0');
export function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export const localToday = () => ymd(new Date());
// 桌面版（宽屏）还是手机版
export const isDesk = () => matchMedia('(min-width: 960px)').matches;
// 当前所在页面（异步数据回来时用来确认用户还在这一页）
export const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
export const mdText = (iso) => { const d = new Date(iso); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
export const ymdText = (iso) => { const d = new Date(iso); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
export const dtText = (iso) => { const d = new Date(iso); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const price = (cents) => (cents / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');

const UA = navigator.userAgent || '';
export const IS_WECHAT = /MicroMessenger/i.test(UA);
export const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(UA));
export const IS_MOBILE = IS_IOS || /Android|Mobile|HarmonyOS/i.test(UA);
export const IS_STANDALONE = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function api(method, path, body) {
  return fetch('api/' + path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => r.text().then((t) => {
    let data; try { data = t ? JSON.parse(t) : {}; } catch { data = { message: '服务器返回异常' }; }
    if (!r.ok) { const e = new Error(data.message || '出错了，请稍后再试'); e.status = r.status; e.data = data; throw e; }
    if (r.headers.get('X-From-Cache') === '1') data.__offline = true;
    return data;
  }), () => { const e = new Error('网络连接失败，请检查网络后重试'); e.status = 0; throw e; });
}

let toastTimer;
export function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// 访客点了要先测能量卡才能用的功能：说一句，再给一个去测（或去保存已经测好的卡）的按钮，不只闪一下提示
export function guestAsk(what) {
  const tested = !!readLocal('pending');
  openSheet(tested ? '保存你的能量卡' : '先测测你的能量卡', `<div class="guestask"><p>${tested ? '你的能量卡已经测好了。保存' : '测测你的能量卡并注册'}后，就能${esc(what)}。${tested ? '' : '不用先注册，测完再决定要不要保存。'}</p>`
    + `<a class="btn primary block" href="#/${tested ? 'card' : 'start'}" data-close-sheet>${tested ? '保存我的能量卡' : '测测我的能量卡'}</a></div>`);
}

// 本地记一笔，用于“只提示一次”“今天关过了”这类状态
export function seen(key) { try { return !!localStorage.getItem('lrl:' + key); } catch { return false; } }
export function mark(key, v = '1') { try { localStorage.setItem('lrl:' + key, v); } catch { /* 无痕模式 */ } }
export function readLocal(key) { try { return JSON.parse(localStorage.getItem('lrl:' + key) || 'null'); } catch { return null; } }
export function writeLocal(key, v) { try { if (v == null) localStorage.removeItem('lrl:' + key); else localStorage.setItem('lrl:' + key, JSON.stringify(v)); } catch { /* 无痕模式 */ } }

// 外观：浅色（白色）/ 深色 / 跟随系统。选择存在本地，index.html 头部会在页面绘制前先套上，避免闪一下
export const getTheme = () => readLocal('theme') || 'auto';
export const isDarkNow = () => { const t = getTheme(); return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
export function applyTheme() {
  const t = getTheme(), root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', isDarkNow() ? '#111114' : '#FFFFFF'));
}
export function setTheme(t) { writeLocal('theme', t === 'auto' ? null : t); applyTheme(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// 底部弹层
// 手机上的习惯：可以下拉关闭；按返回键或侧滑返回是关掉弹层，而不是离开页面；弹层打开时背后的页面不跟着滚。
let sheetCleanup = null, sheetHistory = false, lockedY = 0;
function lockScroll() {
  if (document.body.style.position === 'fixed') return;
  lockedY = window.scrollY;
  Object.assign(document.body.style, { position: 'fixed', top: `-${lockedY}px`, left: '0', right: '0' });
}
function unlockScroll() {
  if (document.body.style.position !== 'fixed') return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '' });
  window.scrollTo(0, lockedY);
}
function removeSheet(keepLock) {
  const s = $('#sheet');
  if (s) s.remove();
  if (!keepLock) unlockScroll();
  if (sheetCleanup) { const f = sheetCleanup; sheetCleanup = null; f(); }
}
export function openSheet(title, html, opts = {}) {
  const replacing = !!$('#sheet');
  removeSheet(true);
  const el = document.createElement('div');
  el.className = 'sheet-bg'; el.id = 'sheet';
  el.innerHTML = `<div class="sheet${opts.dark ? ' dark' : ''}${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab" aria-hidden="true"></div><div class="sh"><b>${esc(title)}</b><button type="button" class="close" data-close-sheet aria-label="关闭">✕</button></div><div class="sbody">${html}</div></div>`;
  el.addEventListener('click', (e) => { if (e.target === el) dismissSheet(); });
  $('#layer').appendChild(el);
  enableDrag(el);
  if (!replacing) lockScroll();
  if (!sheetHistory) { history.pushState({ lrlSheet: 1 }, ''); sheetHistory = true; }
  sheetCleanup = opts.onClose || null;
  return $('.sbody', el);
}
// 换页等程序动作：立刻关掉
export function closeSheet() { sheetHistory = false; removeSheet(false); }
// 用户关闭（点 ✕、点背景、下拉、Esc、返回键）：退回打开弹层前的那条历史，再带动画关掉
export function dismissSheet() {
  if (!$('#sheet')) return;
  if (sheetHistory) {
    const el = $('#sheet');
    history.back();
    // 兜底：万一没收到返回事件，只关当时这一个弹层（用户可能已经打开了新的）
    setTimeout(() => { if (el.isConnected && $('#sheet') === el && !el.classList.contains('closing')) { sheetHistory = false; animateClose(); } }, 450);
    return;
  }
  animateClose();
}
function animateClose() {
  const s = $('#sheet');
  if (!s || s.classList.contains('closing')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { removeSheet(false); return; }
  s.classList.add('closing');
  setTimeout(() => { if (s.isConnected) removeSheet(false); }, 200);
}
addEventListener('popstate', () => { if (sheetHistory && $('#sheet')) { sheetHistory = false; animateClose(); } });

// 下拉关闭：从顶部把手、标题栏拖，或者内容已经滚到顶时往下拖
function enableDrag(bg) {
  const sheet = $('.sheet', bg);
  let y0 = null, dy = 0, t0 = 0;
  sheet.addEventListener('touchstart', (e) => {
    // 滚轮自己上下滚；分享图要长按保存，手指一动就拖弹层会把长按打断
    if (e.target.closest('.wheels, .sharepv img')) return;
    if (!e.target.closest('.grab,.sh') && sheet.scrollTop > 0) return;
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0 || sheet.scrollTop > 0) { sheet.style.transform = ''; if (dy < -8) y0 = null; return; }
    sheet.style.transform = `translateY(${dy}px)`;
    bg.style.background = `rgba(8,10,16,${Math.max(0.1, 0.42 - dy / 900)})`;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    sheet.style.transition = 'transform .2s cubic-bezier(.23,1,.32,1)';
    if (dy > 110 || (dy > 40 && Date.now() - t0 < 260)) {
      sheet.style.transform = 'translateY(105%)';
      bg.dataset.dragged = '1';
      setTimeout(dismissSheet, 160);
    } else { sheet.style.transform = ''; bg.style.background = ''; }
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

// 点击分发：各模块用 onClick 注册自己的按钮，main.js 统一监听
const clickHandlers = [];
export function onClick(selector, fn) { clickHandlers.push([selector, fn]); }
export function dispatchClick(e) {
  for (const [sel, fn] of clickHandlers) {
    const el = e.target.closest(sel);
    if (el) { fn(el, e); return true; }
  }
  return false;
}

// 埋点：攒一批再发，失败直接丢
const queue = [];
let flushTimer;
export function anonId() {
  let id = readLocal('aid');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); writeLocal('aid', id); }
  return id;
}
export function track(name, props) {
  queue.push({ name, props: props || {} });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1500);
}
function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ anonId: anonId(), events: queue.splice(0, 30) });
  if (navigator.sendBeacon) navigator.sendBeacon('api/events', new Blob([body], { type: 'application/json' }));
  else fetch('api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
addEventListener('pagehide', flush);
