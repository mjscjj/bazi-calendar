// 祈愿与御守：选心愿、方式（点香 / 颂钵）、时长和款式 → 全屏静坐（倒计时、呼吸引导，切出去自动暂停）
// → 揭晓一枚这个月的御守（用幸运色织成）→ 收进「我的御守」，可以分享。中途结束不发御守。
import { $, $$, esc, api, toast, onClick, currentPath, openSheet, price, track } from './core.js';
import { S } from './state.js';
import { footHtml, memberLockHtml } from './today.js';
import { openPay } from './pay.js';
import { share } from './share.js';

const phead = (title) => `<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>${title}</h1></div>`;
const STYLE_NAME = { basic: '基础款', term: '节气款', birthday: '生日款' };
const WAY_NAME = { incense: '点一炷香', bowl: '敲颂钵' };
const SERIF = 'Songti SC,STSong,Noto Serif CJK SC,Source Han Serif SC,serif';

// ---------- 御守的样子（SVG） ----------
const MOTIF = {
  snow: '<g stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".24" transform="translate(13 13)"><path d="M0 -5V5M-4.3 -2.5L4.3 2.5M-4.3 2.5L4.3 -2.5"/></g>',
  blossom: '<g fill="#fff" opacity=".2" transform="translate(13 13)"><circle cx="0" cy="-3" r="2"/><circle cx="2.9" cy="-.9" r="2"/><circle cx="1.8" cy="2.4" r="2"/><circle cx="-1.8" cy="2.4" r="2"/><circle cx="-2.9" cy="-.9" r="2"/></g>',
  wave: '<path d="M0 17q6.5-8 13 0t13 0" fill="none" stroke="#fff" stroke-width="1.2" opacity=".22"/>',
  leaf: '<ellipse cx="13" cy="13" rx="5.5" ry="2.4" transform="rotate(-35 13 13)" fill="#fff" opacity=".2"/>',
  star: '<path d="M13 6.5l1.4 5.1 5.1 1.4-5.1 1.4-1.4 5.1-1.4-5.1-5.1-1.4 5.1-1.4z" fill="#B8862E" opacity=".3"/>',
};
export function omamoriSvg(a, key = 'x') {
  const L = a.look, [c1, c2] = L.colors, bd = a.style === 'birthday';
  const ink = bd ? L.ink : '#F6EFDC', gold = bd ? '#A8781F' : '#E9D9A8', g = 'om' + key;
  const text = (a.wish || '').split('');
  const seal = a.style === 'term' ? L.term : bd ? '生辰' : '';
  return `<svg viewBox="0 0 180 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(L.monthCn)}${esc(a.wish)}御守"><defs><linearGradient id="${g}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`
    + (L.motif ? `<pattern id="${g}p" width="26" height="26" patternUnits="userSpaceOnUse">${MOTIF[L.motif]}</pattern>` : '') + '</defs>'
    + `<path d="M90 6C110 6 118 18 118 30v4H62v-4C62 18 70 6 90 6Z" fill="none" stroke="${gold}" stroke-width="3"/>`
    + `<rect x="20" y="30" width="140" height="232" rx="22" fill="url(#${g}g)"/>`
    + (L.motif ? `<rect x="20" y="30" width="140" height="232" rx="22" fill="url(#${g}p)"/>` : '')
    + `<rect x="30" y="40" width="120" height="212" rx="16" fill="none" stroke="${gold}" stroke-width="${bd ? 2.5 : 1.5}" opacity=".85"/>`
    + `<circle cx="90" cy="34" r="5" fill="${gold}"/>`
    + text.map((ch, i) => `<text x="90" y="${118 + i * 52}" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="44" fill="${ink}">${esc(ch)}</text>`).join('')
    + `<text x="90" y="${118 + text.length * 52 - 8}" text-anchor="middle" font-family="${SERIF}" font-size="13" fill="${gold}">守 · ${esc(L.monthCn)}</text>`
    + `<text x="90" y="240" text-anchor="middle" font-family="sans-serif" font-size="10" fill="${gold}" opacity=".8">流日历</text>`
    + (seal ? `<g transform="translate(132 58) rotate(5)"><rect x="-13" y="-14" width="26" height="28" rx="3" fill="#C2412D"/><text x="0" y="-2" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="10.5" fill="#FFF4EC">${esc(seal[0])}</text><text x="0" y="10" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="10.5" fill="#FFF4EC">${esc(seal[1] || '')}</text></g>` : '')
    + '</svg>';
}
// 分享图要用图片：把 SVG 转成图片再画到画布上
function svgImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img); img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
function shareAmulet(a) {
  svgImage(omamoriSvg(a, 's' + a.id)).then((img) => share('amulet', { img, a }), () => toast('图片生成失败，再试一次'));
}

// ---------- 选择 ----------
let W = null; // 当前这次祈愿的选择
export function pageWish() {
  const v = $('#view');
  v.innerHTML = phead('本月祈愿') + '<div class="sk" style="height:420px"></div>';
  api('GET', 'amulets').then((d) => {
    if (currentPath() !== '/wish') return;
    S.amu = d;
    if (d.mode === 'blocked') { $('#view').innerHTML = phead('本月祈愿') + memberLockHtml('祈愿、每月领一枚御守') + (d.list.length ? '<p style="margin:0;text-align:center"><a class="tbtn" href="#/amulets">看我的御守 ›</a></p>' : '') + footHtml(); return; }
    W = W || { wish: d.wishes[1] ? d.wishes[1].name : d.wishes[0].name, way: 'incense', minutes: d.minutes.includes(3) ? 3 : d.minutes[0] };
    if (!W.style || (W.style === 'basic' && d.basicTaken) || (W.style === 'birthday' && !d.birthdayMonth)) W.style = d.basicTaken ? 'term' : 'basic';
    renderWish();
  }, (e) => { v.innerHTML = phead('本月祈愿') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
function styleCard(key) {
  const d = S.amu, a = { wish: W.wish, style: key, look: d.looks[key] };
  const sub = key === 'basic' ? `幸运色 · ${d.element}<br>${d.basicTaken ? '本月已领' : '本月免费'}`
    : `${key === 'term' ? d.term + '时节' : '只在生日月'}<br>${d.credits ? `还有 ${d.credits} 次` : '¥' + price(d.priceCents)}`;
  const off = key === 'basic' && d.basicTaken;
  return `<button type="button" class="stycard" data-wstyle="${key}" aria-pressed="${W.style === key}"${off ? ' disabled' : ''}><span class="pv">${omamoriSvg(a, 'pv' + key)}</span><b>${STYLE_NAME[key]}</b><small>${sub}</small></button>`;
}
function renderWish() {
  const d = S.amu, seg = (k, opts) => `<span class="segs" role="group">${opts.map(([v, l]) => `<button type="button" data-w${k}="${v}" aria-pressed="${String(W[k]) === String(v)}">${l}</button>`).join('')}</span>`;
  const special = W.style !== 'basic' && !d.credits;
  $('#view').innerHTML = phead('本月祈愿')
    + '<p class="lead">静下来几分钟，许一个心愿，领一枚这个月的御守。</p>'
    + `<div class="field"><span>心愿</span><div class="wishes">${d.wishes.map((w) => `<button type="button" data-wwish="${esc(w.name)}" aria-pressed="${w.name === W.wish}"><i>${esc(w.char)}</i>${esc(w.name)}</button>`).join('')}</div></div>`
    + `<div class="field"><span>方式</span>${seg('way', [['incense', '点一炷香'], ['bowl', '敲颂钵']])}</div>`
    + `<div class="field"><span>时长</span>${seg('minutes', d.minutes.map((m) => [m, m + ' 分钟']))}</div>`
    + `<div class="field"><span>款式</span><div class="stys">${['basic', 'term'].concat(d.birthdayMonth ? ['birthday'] : []).map(styleCard).join('')}</div></div>`
    + `<button type="button" class="btn primary block" data-wish-start>${special ? `¥${price(d.priceCents)} 开始` : '开始'}</button>`
    + `<p class="note" style="margin:0">每月一枚基础款免费；节气款、生日款 ¥${price(d.priceCents)}。建议戴上耳机，找个安静的地方；中途结束不发御守。</p>`
    + (d.list.length ? '<p style="margin:0;text-align:center"><a class="tbtn" href="#/amulets">我的御守 ›</a></p>' : '') + footHtml();
}
onClick('[data-wwish]', (el) => { W.wish = el.getAttribute('data-wwish'); renderWish(); });
onClick('[data-wway]', (el) => { W.way = el.getAttribute('data-wway'); renderWish(); });
onClick('[data-wminutes]', (el) => { W.minutes = +el.getAttribute('data-wminutes'); renderWish(); });
onClick('[data-wstyle]', (el) => { if (el.disabled) return; W.style = el.getAttribute('data-wstyle'); renderWish(); });
onClick('[data-wish-start]', () => {
  const d = S.amu;
  if (d.mode === 'blocked') { openPay(() => pageWish()); return; }
  const cfg = { ...W, breath: d.breath };
  if (W.style !== 'basic' && !d.credits) { openPay(() => { d.credits = (d.credits || 0) + 1; startRitual(cfg); }, { product: 'amulet' }); return; }
  startRitual(cfg);
});

// ---------- 静坐 ----------
let R = null;
function audio() {
  if (!R.ctx) { try { R.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (R.ctx.state === 'suspended') R.ctx.resume();
  return R.ctx;
}
// 颂钵：几个不成整数倍的泛音，高的散得快，再加一点点失谐，听起来有“嗡——”的拍频
function strike(soft) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime, base = 196;
  [[1, 0.5, 7], [2.76, 0.22, 4.5], [5.4, 0.1, 2.6], [8.93, 0.05, 1.6]].forEach(([r, g, dur]) => {
    for (const det of [0, 1.3]) {
      const o = ctx.createOscillator(), v = ctx.createGain();
      o.type = 'sine'; o.frequency.value = base * r + det;
      v.gain.setValueAtTime(0.0001, t);
      v.gain.exponentialRampToValueAtTime(g * (soft ? 0.5 : 1) / 2, t + 0.015);
      v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(v).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.1);
    }
  });
  const rp = $('#ritual .ripples');
  if (rp) { const i = document.createElement('i'); rp.appendChild(i); setTimeout(() => i.remove(), 2600); }
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function startRitual(cfg) {
  track('wish_start', { way: cfg.way, minutes: cfg.minutes, style: cfg.style });
  const total = cfg.minutes * 60;
  R = { cfg, total, elapsed: 0, last: performance.now(), paused: false, step: 0 };
  const el = document.createElement('div');
  el.id = 'ritual'; el.className = `ritual way-${cfg.way}`;
  el.style.setProperty('--dur', total + 's');
  el.innerHTML = `<div class="rtop"><span class="guide2" id="rGuide">${esc(cfg.breath[0])}</span></div>`
    + (cfg.way === 'incense'
      ? '<div class="stage"><div class="incense"><div class="burn"><span class="smoke s1"></span><span class="smoke s2"></span><span class="smoke s3"></span><span class="ember"></span><span class="stick"></span></div><span class="censer"></span></div></div>'
      : '<div class="stage"><button type="button" class="sbowl" data-strike aria-label="敲一下颂钵"><span class="ripples"></span><span class="bw"></span></button><p class="btip">点一下颂钵，听它慢慢散开</p></div>')
    + `<div class="rbottom"><div class="timer" id="rTimer">${mmss(total)}</div><span class="rwish">心愿 · ${esc(cfg.wish)}</span><button type="button" class="rend" data-ritual-end>提前结束</button></div>`
    + '<div class="rpause" hidden><p>已暂停</p><button type="button" class="btn primary" data-ritual-resume>继续</button></div>';
  document.body.appendChild(el);
  document.body.classList.add('in-ritual');
  history.pushState({ lrlRitual: 1 }, '');
  if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { if (R) R.lock = l; }, () => {});
  if (cfg.way === 'bowl') setTimeout(() => R && strike(), 400);
  R.tick = setInterval(tick, 250);
  R.guide = setInterval(() => { if (!R || R.paused) return; R.step = (R.step + 1) % cfg.breath.length; const g = $('#rGuide'); if (g) { g.classList.remove('in'); void g.offsetWidth; g.textContent = cfg.breath[R.step]; g.classList.add('in'); } }, 4000);
}
function tick() {
  if (!R || R.paused) return;
  const now = performance.now();
  R.elapsed += (now - R.last) / 1000; R.last = now;
  const left = Math.max(0, R.total - R.elapsed);
  const t = $('#rTimer'); if (t) t.textContent = mmss(Math.ceil(left));
  if (left <= 0) finishRitual();
}
function pause(on) {
  if (!R) return;
  R.paused = on; R.last = performance.now();
  const el = $('#ritual');
  el.classList.toggle('paused', on);
  $('.rpause', el).hidden = !on;
}
document.addEventListener('visibilitychange', () => {
  if (!R || R.done) return;
  if (document.visibilityState === 'hidden') pause(true);
  else if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { if (R) R.lock = l; }, () => {});
});
function closeRitual(fromPop) {
  if (!R) return;
  clearInterval(R.tick); clearInterval(R.guide);
  if (R.lock) R.lock.release().catch(() => {});
  if (R.ctx) setTimeout(((c) => () => c.close().catch(() => {}))(R.ctx), 8000);
  R = null;
  const el = $('#ritual'); if (el) el.remove();
  document.body.classList.remove('in-ritual');
  if (!fromPop) history.back();
}
// 返回键：退回到静坐之前就结束（关掉分享弹层时退回的是静坐这一条，不算）
addEventListener('popstate', () => {
  if (!R || (history.state && history.state.lrlRitual)) return;
  const done = R.done;
  closeRitual(true);
  if (!done) toast('已结束，这次没有领御守');
});
onClick('[data-strike]', () => strike());
onClick('[data-ritual-resume]', () => { audio(); pause(false); });
onClick('[data-ritual-end]', () => { if (confirm('提前结束就不发御守了，确定结束吗？')) { track('wish_quit'); closeRitual(); toast('已结束，这次没有领御守'); } });

function finishRitual() {
  if (R.done) return;
  R.done = true;
  clearInterval(R.tick); clearInterval(R.guide);
  strike(true);
  const el = $('#ritual'), cfg = R.cfg;
  el.classList.add('ending');
  api('POST', 'amulets', { wish: cfg.wish, way: cfg.way, minutes: cfg.minutes, style: cfg.style }).then((d) => {
    track('wish_done', { style: cfg.style, minutes: cfg.minutes });
    W = null; S.amu = null; if (S.today) S.today.amulet = { taken: true };
    const a = d.amulet;
    R.amulet = a;
    setTimeout(() => {
      el.classList.add('revealed');
      el.innerHTML = `<div class="reveal2"><p class="sub">${esc(a.look.monthCn)} · ${esc(a.wish)}</p><h1>收下你的御守</h1><div class="omamori">${omamoriSvg(a, 'rv' + a.id)}</div>`
        + `<p class="sub">${a.style === 'basic' ? `用你的幸运色（${esc(a.look.element)}）织成` : a.style === 'term' ? `${esc(a.look.term)}时节的特别款` : '生日月的特别款'}。收在「我的御守」里。</p>`
        + '<div class="acts"><button type="button" class="btn ghost" data-om-share>分享</button><button type="button" class="btn primary" data-om-keep>收下</button></div></div>';
    }, 900);
  }, (e) => {
    el.innerHTML = `<div class="reveal2"><p class="sub">${esc(e.message)}</p><div class="acts"><button type="button" class="btn ghost" data-ritual-close>先回去</button><button type="button" class="btn primary" data-ritual-retry>再试一次</button></div></div>`;
  });
}
onClick('[data-ritual-retry]', () => { if (R) { R.done = false; finishRitual(); } });
onClick('[data-ritual-close]', () => closeRitual());
onClick('[data-om-share]', () => { if (R && R.amulet) shareAmulet(R.amulet); });
onClick('[data-om-keep]', () => { closeRitual(); setTimeout(() => { location.hash = '#/amulets'; }, 50); });

// ---------- 我的御守 ----------
export function pageAmulets() {
  const v = $('#view');
  v.innerHTML = phead('我的御守') + '<div class="sk" style="height:300px"></div>';
  api('GET', 'amulets').then((d) => {
    if (currentPath() !== '/amulets') return;
    S.amuList = d.list;
    v.innerHTML = phead('我的御守')
      + (d.basicTaken ? '' : `<a class="omnew" href="#/wish"><span>${esc(d.monthCn)}的御守还没领</span><small>静坐几分钟，领一枚 ›</small></a>`)
      + (d.list.length ? `<div class="omgrid">${d.list.map((a) => `<button type="button" class="omcard" data-om="${a.id}"><span class="pv">${omamoriSvg(a, 'g' + a.id)}</span><b>${esc(a.look.monthCn)} · ${esc(a.wish)}</b><small>${STYLE_NAME[a.style]} · ${WAY_NAME[a.way]} ${a.minutes} 分钟</small></button>`).join('')}</div>`
        : '<div class="empty">还没有御守。每个月静坐几分钟，就能领一枚。</div>')
      + (d.basicTaken ? '<p style="margin:0;text-align:center"><a class="tbtn" href="#/wish">再领一枚特别款 ›</a></p>' : '') + footHtml();
  }, (e) => { v.innerHTML = phead('我的御守') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
onClick('[data-om]', (el) => {
  const a = (S.amuList || []).find((x) => x.id === +el.getAttribute('data-om'));
  if (!a) return;
  openSheet(`${a.look.monthCn} · ${a.wish}`, `<div class="omview"><div class="omamori">${omamoriSvg(a, 'v' + a.id)}</div><p class="note" style="margin:0;text-align:center">${STYLE_NAME[a.style]} · ${WAY_NAME[a.way]} ${a.minutes} 分钟 · ${esc(a.createdAt.slice(0, 10))}</p><button type="button" class="btn ghost block" data-om-share2="${a.id}">分享</button></div>`);
});
onClick('[data-om-share2]', (el) => { const a = (S.amuList || []).find((x) => x.id === +el.getAttribute('data-om-share2')); if (a) shareAmulet(a); });
