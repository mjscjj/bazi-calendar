// 今天页，从上往下：本周 7 天（能量趋势和你记的心情、大家的这一天）→ 每天的卡片（左右滑看前后一天）
// → 每日一签、穿搭色、问一件事、本月御守 → 记录此刻 → 明天寄语。
import { $, $$, esc, api, toast, openSheet, onClick, localToday, mdText, price, seen, mark, readLocal, IS_STANDALONE, IS_MOBILE, track, currentPath } from './core.js';
import { THEME, setGlow, gwx, actOf, weekday, dosDonts, bestHours, hhShort } from './data.js';
import { S, isDemo } from './state.js';
import { openDay } from './day.js';
import { recordHtml, onMoodChange, moodScore, cellStickers } from './mood.js';
import { cardArt, cardTitle } from './onboard.js';

export function loadToday() {
  S.todayErr = null;
  const path = (isDemo() ? 'demo/today' : 'today') + '?date=' + localToday();
  return api('GET', path).then((d) => {
    S.today = d; S.todayLocked = null;
    if (d.access) S.access = d.access;
    setGlow(gwx(d.chart.dm));
  }, (e) => {
    if (e.status === 402) { S.todayLocked = e.data; S.access = e.data.access; S.today = null; return; }
    if (e.status === 409) { location.hash = '#/welcome'; return; }
    if (e.status === 401) { location.reload(); return; }
    S.todayErr = e.message;
  });
}

const footHtml = () => '<footer class="foot"><span>仅供娱乐参考，不构成任何决策依据</span><span><a href="#/about?s=terms">用户协议</a> · <a href="#/about?s=privacy">隐私政策</a> · <a href="#/about">关于流日历</a></span></footer>';
export { footHtml };

function almanacLine(a) {
  const tag = a.lunar.festival || a.lunar.jieqi;
  return `<button type="button" class="alm" data-almanac aria-label="大家的今天：查看通用黄历"><span class="seal" aria-hidden="true">${a.gz[0]}<br>${a.gz[1]}</span>`
    + `<span class="am"><span class="who">大家的今天 · ${a.m}月${a.d}日 周${'日一二三四五六'[a.week]} · 农历${a.lunar.monthCn}月${a.lunar.dayCn}${tag ? ' · ' + tag : ''}</span>`
    + `<span class="yj"><b>宜</b>${a.yi.slice(0, 3).join(' ')}<b>忌</b>${a.ji.slice(0, 2).join(' ')}</span></span><span class="go" aria-hidden="true">›</span></button>`;
}

function noticesHtml() {
  const t = S.today, a = S.access;
  let h = '';
  if (t && t.__offline) h += '<div class="notice"><p>现在离线，显示的是上一次打开时的内容。</p></div>';
  if (isDemo()) {
    const p = readLocal('pending'), inv = readLocal('invite');
    if (p) h += `<div class="notice demo"><p>你的能量卡（${esc(cardTitle(p.card))}）已经测好了。保存后，每天给你算今天${inv && inv.name ? `；注册后你和${esc(inv.name)}各得 ${inv.days || 7} 天会员` : ''}。</p><a class="btn sm primary" href="#/card">去保存</a></div>`;
    else if (inv && inv.name) h += inviteBanner(inv);
    else h += `<div class="notice demo"><p>这是示例（${esc(t ? t.name : '小满')}）的今天。测测你自己的能量卡，不用注册。</p><a class="btn sm primary" href="#/start">测测我的</a></div>`;
    return h;
  }
  // 系统提示同时只放一条，按重要程度：邀请到账 > 体验最后一天 / 会员快到期 > 补出生城市 > 加到主屏
  const today = localToday(), news = (t && t.news) || [];
  if (news.length) h += `<div class="notice good"><p>${news.map((n) => esc(n.text)).join('；')}</p><button type="button" class="x" data-close-notice aria-label="关闭提示">×</button></div>`;
  else if (a && a.mode === 'free' && a.remaining === 0 && !seen('lastfree-' + today)) {
    h += `<div class="notice" data-notice="lastfree-${today}"><p>今天是最后一次免费体验，之后 ¥${price(S.priceCents)}/月。</p><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>`;
  } else if (a && a.mode === 'member' && a.daysLeft <= 3 && !seen('expiring-' + today)) {
    h += `<div class="notice" data-notice="expiring-${today}"><p>会员还有 ${a.daysLeft} 天到期（${mdText(a.memberUntil)}）。</p><a class="btn sm primary" href="#/member">续费</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>`;
  } else if (S.me && S.me.birth && S.me.birth.time && !S.me.birth.city && !seen('city-tip')) {
    h += '<div class="notice" data-notice="city-tip"><p>补上出生城市，按真太阳时排盘，时辰更准。</p><a class="btn sm ghost" href="#/profile" data-dismiss-go>去补上</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>';
  } else if (!IS_STANDALONE() && !seen('a2hs-done') && (Date.now() - (readLocal('a2hs-later') || 0)) > 7 * 86400000 && seen('guide')) {
    h += `<div class="notice" data-notice="a2hs"><p>${IS_MOBILE ? '加到主屏，像 App 一样一点就开。' : '安装到电脑，以后从桌面一点就开。'}</p><button type="button" class="btn sm ghost" data-install>${IS_MOBILE ? '怎么加' : '怎么装'}</button><button type="button" class="x" data-a2hs-later aria-label="以后再说">×</button></div>`;
  }
  return h;
}

function lockHtml(L) {
  const a = L.access || {};
  return almanacLine(L.almanac) + '<div class="lock2"><div class="pw">'
    + '<span class="lockmark" aria-hidden="true">流</span>'
    + `<h2>${a.expired ? '会员已到期' : '免费体验已用完'}</h2>`
    + `<p>${a.expired ? '续费后，继续看每天的你、好时段、每日一签和挑日子。' : `你已经体验了 ${a.freeLimit} 次。开通会员后，今天、日历、挑日子、每日一签都能继续用。`}</p>`
    + `<div class="price"><b>¥${price(L.priceCents || S.priceCents)}</b><span>/ ${L.memberDays || S.memberDays} 天 · 不自动续费</span></div>`
    + `<button type="button" class="btn primary block" data-pay>${a.expired ? '续费会员' : '开通月度会员'}</button>`
    + '<p class="fine">你的资料、计划和签都会保留。</p></div></div>';
}

// 到期或体验用完时，问事、祈愿这些子页也显示同一张开通卡，价格只说会员的
export function memberLockHtml(what) {
  const a = S.access || {};
  return '<div class="lock2"><div class="pw"><span class="lockmark">流</span>'
    + `<h2>${a.expired ? '会员已到期' : '免费体验已用完'}</h2><p>${a.expired ? '续费' : '开通会员'}后可以${what}，每天的你、日历和挑日子也都能继续用。</p>`
    + `<div class="price"><b>¥${price(S.priceCents)}</b><span>/ ${S.memberDays} 天 · 不自动续费</span></div>`
    + `<button type="button" class="btn primary block" data-pay>${a.expired ? '续费会员' : '开通月度会员'}</button></div></div>`;
}

// 此刻：现在是哪个时辰、对你怎么样、还剩多久，下一个好时段在几点
function nowText(x) {
  const t = new Date(), mins = t.getHours() * 60 + t.getMinutes();
  if (!x.hours || mins < 5 * 60) return '<i class="dot"></i><span>夜深了，好好休息</span>';
  const i = Math.floor(((mins + 60) % 1440) / 120), h = x.hours[i];
  const end = ((i * 2 + 1) % 24) * 60, left = (end - mins + 1440) % 1440 || 120;
  const { top, worst } = bestHours(x);
  const label = top[0] && top[0].i === i ? '最佳时段' : top[1] && top[1].i === i ? '次佳时段' : worst && worst.i === i ? '尽量避开' : h.level.p;
  const next = top.filter((u) => ((u.i * 2 + 23) % 24) * 60 > mins).sort((a, b) => a.i - b.i)[0];
  const tail = next ? `；下一个好时段 ${hhShort(next.i)}` : mins >= 21 * 60 ? '；今天的好时段过去了，早点休息' : '';
  const cls = /最佳|次佳/.test(label) ? 'good' : label === '尽量避开' ? 'bad' : '';
  return `<i class="dot ${cls}"></i><span>此刻${h.name} · <b>${label}</b>，还剩 ${left} 分钟${tail}</span>`;
}
setInterval(() => { const el = document.getElementById('nowline'); if (el && S.today && S.today.date === localToday()) el.innerHTML = nowText(S.today.day); }, 60000);

const short = (items) => items.map((x) => x.split(/[、，]/)[0]).join(' · ');
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}
const REL = { '-2': '前天', '-1': '昨天', 1: '明天', 2: '后天' };
function youHtml(t) {
  const x = t.day, isToday = t.date === localToday();
  const { dos, donts } = dosDonts(x, false);
  const { top, worst } = bestHours(x);
  const [ty, tm, td] = localToday().split('-').map(Number);
  const diff = Math.round((new Date(x.y, x.m - 1, x.d) - new Date(ty, tm - 1, td)) / 86400000);
  const dname = `${x.m}月${x.d}日 周${weekday(x)}`;
  const who = isToday ? (t.demo ? `${esc(t.name)}的今天（示例）` : `${greeting()}${t.name ? '，' + esc(t.name) : ''}`) : `${REL[diff] ? REL[diff] + ' · ' : ''}${dname}${t.demo ? '（示例）' : ''}`;
  // 今日一句写的是「今天…」，看别的日子时换成明天、昨天或这天
  const fix = (txt) => (isToday ? txt : txt.replace(/今天/g, REL[diff] || '这天'));
  const nav = `<button type="button" class="ic nav" data-day-step="-1" aria-label="前一天">‹</button><button type="button" class="ic nav" data-day-step="1" aria-label="后一天">›</button>`;
  return `<section class="tcard k${x.level.k}" aria-label="${isToday ? '你的今天' : dname}">`
    + `<div class="th"><span class="eyebrow">${who}</span><span class="thr">${isToday ? '<button type="button" class="ic" data-share="today" aria-label="分享你的今天">分享</button>' : '<button type="button" class="ic" data-day-go="today">回到今天</button>'}${nav}</span></div>`
    + `<div class="hero3"><div class="theme"><small>${isToday ? '今天' : REL[diff] || '这天'}是你的</small><b>${THEME[x.ssG][0]}</b></div>`
    + `<div class="ring" style="--p:${x.score}" role="img" aria-label="能量 ${x.score}，${x.level.p}"><b>${x.score}</b><small>${x.level.p}</small></div></div>`
    + `<p class="line"><b>${esc(fix(t.line.head))}</b>${esc(fix(t.line.why))}</p>`
    + `<dl class="yj2"><div><dt>宜</dt><dd>${short(dos.slice(0, 3))}</dd></div><div><dt>忌</dt><dd>${short(donts.slice(0, 2))}</dd></div></dl>`
    + (isToday ? `<div class="nowline" id="nowline">${nowText(x)}</div>` : '')
    + `<div class="times">${top.map((u, i) => `<div><small>${i ? '次佳' : '最佳时段'}</small><b>${hhShort(u.i)}</b></div>`).join('')}`
    + (worst ? `<div class="bad"><small>尽量避开</small><b>${hhShort(worst.i)}</b></div>` : '') + '</div>'
    + '<button type="button" class="more" data-today-detail>看十二时辰和理由 ›</button></section>';
}

// 定下的计划：今天和明天的合成一条，点了去日历看
function planHtml(t) {
  const x = t.day, key = `${x.y}-${x.m}-${x.d}`;
  const nx = new Date(x.y, x.m - 1, x.d + 1), tmr = `${nx.getFullYear()}-${nx.getMonth() + 1}-${nx.getDate()}`;
  const { top } = bestHours(x);
  const at = (p) => (p.hour != null ? hhShort(p.hour) : top[0] ? hhShort(top[0].i) : '白天');
  const rows = (t.plans || []).filter((p) => p.date === key).map((p) => `<p><b>今天</b><span>${esc(p.name)} · 最好 ${at(p)}</span></p>`)
    .concat((t.plans || []).filter((p) => p.date === tmr).map((p) => `<p class="tmr"><b>明天</b><span>${esc(p.name)}${p.hour != null ? ' · ' + hhShort(p.hour) : ''}，今晚早点休息</span></p>`));
  return rows.length ? `<a class="notice plan" href="#/calendar" aria-label="你定下的计划">${rows.join('')}</a>` : '';
}

// 邀请落地：朋友看到的第一屏
function inviteBanner(inv) {
  const c = inv.card;
  return `<div class="invban">${c ? cardArt(c) : ''}<div><b>${esc(inv.name)} 邀请你测测能量卡</b>`
    + (c ? `<small>${esc(inv.name)}是「${esc(cardTitle(c))}」：${c.traits.map(esc).join('、')}</small>` : '')
    + `<small>注册后，你们俩各得 ${inv.days || 7} 天会员</small></div></div><a class="btn primary block" href="#/start">测测我是什么型</a>`;
}

// ---------- 心情便签（原来的每晚自评） ----------
// ---------- 本周 7 天 ----------
// 选中的日子（默认今天）和正在看的那一周；滑出这一周时去取另一周
const selDate = () => S.tsel || (S.today && S.today.date);
// 取过的周都留着（今天这一周 + 滑到过的、预取的），前后一天在别的周时也能马上画出来
const weeks = () => [S.today && S.today.strip, ...Object.values(S.wcache || {})].filter(Boolean);
const weekWith = (date) => weeks().find((w) => w.days.some((x) => x.date === date));
const stripOf = () => weekWith(selDate()) || (S.today && S.today.strip);
const entryOf = (date) => { const w = weekWith(date); return w && w.days.find((x) => x.date === date); };
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (date, n) => { const [y, m, d] = date.split('-').map(Number); return ymdOf(new Date(y, m - 1, d + n)); };
function stripSummary(days) {
  const good = days.filter((x) => x.day.level.k >= 4).length, mid = days.filter((x) => x.day.level.k === 3).length, low = days.length - good - mid;
  return good >= mid && good >= low ? '顺利居多' : mid >= low ? '平稳居多' : '留神的日子多';
}
function stripHtml() {
  const st = stripOf(), sel = selDate(), today = localToday(), kit = S.today.moodKit;
  if (!st) return '';
  const d0 = st.days[0].day, d6 = st.days[6].day;
  const isThis = st.days.some((x) => x.date === today);
  const n = st.days.reduce((a, x) => a + ((x.moods || []).length), 0);
  // 趋势：一条线是系统给的能量（0–100），纸片是你记的心情（1–5 换到同一高度）
  const pts = st.days.map((x, i) => [i * 100 + 50, 50 - x.day.score * 0.44]);
  const mood = st.days.map((x) => moodScore(x.moods, kit));
  const cols = st.days.map((x) => {
    const y = x.day, on = x.date === sel;
    return `<button type="button" class="wc${on ? ' on' : ''}${x.date === today ? ' today' : ''}" data-sel-day="${x.date}" aria-pressed="${on}" aria-label="${y.m}月${y.d}日 ${actOf(y)} ${y.level.p}">`
      + `<span class="w">${x.date === today ? '今天' : '周' + weekday(y)}</span><span class="d">${y.d}</span><span class="a k${y.level.k}">${actOf(y)}</span></button>`;
  }).join('');
  const trend = `<div class="wtrend" aria-hidden="true"><svg viewBox="0 0 700 52" preserveAspectRatio="none"><polyline points="${pts.map((p) => p.join(',')).join(' ')}"/></svg>`
    + st.days.map((x, i) => `<i class="ed k${x.day.level.k}${x.date === sel ? ' on' : ''}" style="left:${(i + 0.5) / 7 * 100}%;top:${(50 - x.day.score * 0.44) / 52 * 100}%"></i>`).join('')
    + mood.map((v, i) => (v == null ? '' : `<span class="mdot" style="left:${(i + 0.5) / 7 * 100}%;top:${(50 - (v * 20) * 0.44) / 52 * 100}%">${cellStickers(st.days[i].moods.filter((m) => m.mood).slice(-1), kit)}</span>`)).join('') + '</div>';
  const e = entryOf(sel), a = e && e.almanac;
  const alm = a ? `<button type="button" class="walm" data-almanac><span class="seal" aria-hidden="true">${a.gz[0]}${a.gz[1]}</span><span>大家的${sel === today ? '今天' : '这一天'} · 农历${a.lunar.monthCn}月${a.lunar.dayCn}${a.lunar.festival || a.lunar.jieqi ? ' · ' + (a.lunar.festival || a.lunar.jieqi) : ''}<em><b>宜</b>${a.yi.slice(0, 3).join(' ')} <b>忌</b>${a.ji.slice(0, 2).join(' ')}</em></span><i aria-hidden="true">›</i></button>` : '';
  return `<section class="wstrip" aria-label="本周"><div class="wh"><button type="button" class="ic nav" data-week-step="-1" aria-label="上一周">‹</button>`
    + `<div class="wt"><b>${isThis ? '本周' : `${d0.m}月${d0.d}日–${d6.m === d0.m ? '' : d6.m + '月'}${d6.d}日`} · ${stripSummary(st.days)}</b><small>${n ? `这周记了 ${n} 条` : '线是能量，纸片是你记的心情'}</small></div>`
    + `<button type="button" class="ic nav" data-week-step="1" aria-label="下一周">›</button><a class="tbtn" href="#/calendar">日历</a></div>`
    + `<div class="wcols">${cols}</div>${trend}${alm}</section>`;
}
// 明天寄语：结合明天的吉凶，给一句今晚就能做的准备
function tomorrowHtml(t) {
  const m = t.tomorrow;
  if (!m) return '';
  const key = `${m.y}-${m.m}-${m.d}`, pl = (t.plans || []).filter((p) => p.date === key);
  return `<section class="tmrw" aria-label="明天寄语"><div class="tq"><b>明天寄语</b><small>${m.m}月${m.d}日 · ${THEME[m.ssG][0]} · ${m.level.p} ${m.score}</small></div>`
    + `<p class="th2">${esc(m.prep || m.head)}</p>`
    + `<div class="tm2">${m.hours[0] != null ? `明天最好 <b>${hhShort(m.hours[0])}</b>` : ''}${m.hours[1] != null ? `，其次 ${hhShort(m.hours[1])}` : ''}</div>`
    + pl.map((p) => `<div class="tp">明天要做「${esc(p.name)}」${p.hour != null ? '，' + hhShort(p.hour) : ''}，今晚早点睡</div>`).join('') + '</section>';
}
// 卡片：今天用今天的完整数据，别的日子用那一周里那天的数据
function viewOf(date) {
  const t = S.today;
  if (date === t.date) return t;
  const e = entryOf(date);
  return e ? { ...t, date: e.date, day: e.day, line: e.line } : null;
}
const dayView = () => viewOf(selDate());
const cardOf = (date) => { const v = viewOf(date); return v ? youHtml(v) : '<div class="sk dsk"></div>'; };
// 三张卡并排：前一天、这一天、后一天；拖动时整排跟着手指走。两边的卡等开始拖或点 ‹ › 时才画
function dayCardHtml(anim) {
  return `<div class="dayswipe${anim ? ' ' + anim : ''}" id="dayswipe"><div class="dtrack" id="dtrack"><div class="dslot prev" aria-hidden="true" inert></div>`
    + `<div class="dslot cur">${cardOf(selDate())}</div><div class="dslot next" aria-hidden="true" inert></div></div></div>`;
}
function fillSides() {
  const sel = selDate();
  for (const [cls, n] of [['prev', -1], ['next', 1]]) { const el = document.querySelector('#dtrack .' + cls); if (el && !el.firstChild) el.innerHTML = cardOf(shift(sel, n)); }
}
let slide = '';
const tooFar = (date) => { const [y, m, d] = date.split('-').map(Number); return Math.abs(new Date(y, m - 1, d) - new Date()) > 380 * 86400000; };
function fetchWeek(date) {
  if (weekWith(date) || tooFar(date)) return Promise.resolve(weekWith(date));
  S.wcache = S.wcache || {};
  const key = 'f:' + date;
  if (S.wcache[key]) return S.wcache[key];
  const p = api('GET', `${isDemo() ? 'demo/week' : 'week'}?date=${date}`).then((w) => { delete S.wcache[key]; S.wcache[w.start] = w; return w; }, (e) => { delete S.wcache[key]; throw e; });
  Object.defineProperty(S.wcache, key, { value: p, enumerable: false, configurable: true });
  return p;
}
// 停在一周的头尾时，把相邻那一周先取回来，滑过去不用等
function prefetch() {
  const sel = selDate();
  for (const n of [-1, 1]) { const d = shift(sel, n); if (!weekWith(d) && !tooFar(d)) fetchWeek(d).then(() => { if (currentPath() === '/' && selDate() === sel) renderToday(); }, () => {}); }
}
function selectDay(date, dir) {
  const t = S.today;
  if (!t) return;
  if (tooFar(date)) { toast('再往后就翻不动了'); return; }
  S.tsel = date === t.date ? null : date;
  slide = dir > 0 ? 'in-r' : dir < 0 ? 'in-l' : '';
  renderToday();
  if (!entryOf(date)) {
    fetchWeek(date).then(() => { if (selDate() === date && currentPath() === '/') { slide = ''; renderToday(); prefetch(); } }, (e) => { toast(e.message); S.tsel = null; renderToday(); });
  } else prefetch();
}
// 换到前一天/后一天：先把整排滑过去，滑完再换数据（点 ‹ › 和松手都走这里）
let moving = false;
function slideTo(n) {
  const tr = document.getElementById('dtrack');
  const target = shift(selDate(), n);
  if (!tr || tooFar(target) || matchMedia('(prefers-reduced-motion: reduce)').matches) { selectDay(target, n); return; }
  moving = true;
  fillSides();
  void tr.offsetWidth;
  tr.style.transition = 'transform .26s cubic-bezier(.2,.8,.2,1)';
  tr.style.transform = `translateX(calc(${-n} * (100% + var(--dgap))))`;
  let done = false;
  const finish = () => { if (done) return; done = true; moving = false; selectDay(target, 0); };
  tr.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 400);
}
onClick('[data-sel-day]', (el) => { const d = el.getAttribute('data-sel-day'), sel = selDate(); if (d === shift(sel, 1)) slideTo(1); else if (d === shift(sel, -1)) slideTo(-1); else selectDay(d, d > sel ? 1 : d < sel ? -1 : 0); });
onClick('[data-day-step]', (el) => { if (!moving) slideTo(+el.getAttribute('data-day-step')); });
onClick('[data-week-step]', (el) => { const n = +el.getAttribute('data-week-step'); selectDay(shift(selDate(), n * 7), n); });
onClick('[data-day-go]', () => selectDay(S.today.date, selDate() > S.today.date ? -1 : 1));
// 手指拖卡片：横向拖动时整排跟手；松手时拖过四分之一或甩得够快就翻过去，否则弹回
let drag = null;
document.addEventListener('touchstart', (e) => {
  const box = e.target.closest('#dayswipe');
  if (!box || moving || e.touches.length > 1) return;
  drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dx: 0, lock: null, w: box.clientWidth, tr: document.getElementById('dtrack') };
  fillSides();
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
  if (!drag.lock && Math.abs(dx) + Math.abs(dy) > 8) drag.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (drag.lock !== 'x') return;
  const far = (n) => tooFar(shift(selDate(), n));
  drag.dx = (dx > 0 && far(-1)) || (dx < 0 && far(1)) ? dx / 4 : dx; // 翻到头了，拖起来发涩
  drag.tr.style.transition = 'none';
  drag.tr.style.transform = `translateX(${drag.dx}px)`;
}, { passive: true });
const endDrag = () => {
  const d = drag;
  drag = null;
  if (!d || d.lock !== 'x') return;
  const v = d.dx / Math.max(1, Date.now() - d.t), n = d.dx < 0 ? 1 : -1;
  if ((Math.abs(d.dx) > d.w * 0.25 || Math.abs(v) > 0.45) && !tooFar(shift(selDate(), n))) { track('today_swipe', { dir: n }); slideTo(n); return; }
  d.tr.style.transition = 'transform .22s ease-out';
  d.tr.style.transform = 'translateX(0)';
};
document.addEventListener('touchend', endDrag, { passive: true });
document.addEventListener('touchcancel', endDrag, { passive: true });
onMoodChange(() => { if (currentPath() === '/') renderToday(); }, selDate);

// 问事回看：起卦 7 天后，问一句那件事后来怎样了
function askReviewHtml(t) {
  const r = t.askReview;
  if (!r) return '';
  if (r.done) {
    return `<section class="rate areview done" aria-live="polite"><div class="q"><b>记下了：${esc(r.done)}</b></div>`
      + `<form class="arnote" data-arnote="${r.id}" data-arnote-outcome="${r.doneKey}"><input name="note" maxlength="60" placeholder="加一句发生了什么（选填）" enterkeyhint="done"><button type="submit" class="btn sm ghost">记下</button></form>`
      + `<a class="tbtn" href="#/ask/result?id=${r.id}">看当时的解读和回看 ›</a></section>`;
  }
  const days = Math.max(1, Math.round((Date.now() - Date.parse(r.createdAt)) / 86400000));
  return `<section class="rate areview" data-areview-id="${r.id}"><div class="q"><b>${days} 天前问过的事，后来怎样了？</b><button type="button" class="x" data-areview-skip aria-label="不用回看了">×</button></div>`
    + `<a class="arq" href="#/ask/result?id=${r.id}"><span>${esc(r.question)}</span><small>当时的倾向 · ${esc(r.tendency)} ›</small></a>`
    + `<div class="pills opills" role="group" aria-label="后来怎样了">${r.outcomes.map((o) => `<button type="button" data-areview="${o.key}">${esc(o.text)}</button>`).join('')}</div></section>`;
}
onClick('[data-areview]', (el) => {
  const t = S.today, r = t && t.askReview, key = el.getAttribute('data-areview');
  if (!r) return;
  el.setAttribute('aria-pressed', 'true');
  api('POST', `asks/${r.id}/review`, { outcome: key }).then((d) => {
    track('ask_review', { outcome: key, from: 'today' });
    r.done = d.ask.review.outcome.text; r.doneKey = key;
    renderToday();
  }, (e) => { el.setAttribute('aria-pressed', 'false'); toast(e.message); });
});
onClick('[data-areview-skip]', (el) => {
  const t = S.today, r = t && t.askReview;
  if (!r) return;
  el.closest('.areview').remove();
  t.askReview = null;
  api('POST', `asks/${r.id}/review`, { outcome: 'dismiss' }).catch(() => {});
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('.arnote');
  if (!f) return;
  e.preventDefault();
  const note = f.elements.note.value.trim();
  if (!note) return;
  api('POST', `asks/${f.getAttribute('data-arnote')}/review`, { outcome: f.getAttribute('data-arnote-outcome'), note }).then(() => {
    f.outerHTML = `<p class="rsaid">「${esc(note)}」</p>`;
    if (S.today) S.today.askReview = null;
  }, (err) => toast(err.message));
});
onClick('[data-close-notice]', (el) => el.closest('.notice').remove());
onClick('[data-demo-tip]', (el, e) => { e.preventDefault(); toast(`测测你的能量卡并注册后，就能${el.getAttribute('data-demo-tip')}`); });
onClick('[data-dismiss-go]', (el) => { const n = el.closest('[data-notice]'); if (n) mark(n.getAttribute('data-notice')); });

function minisHtml(t) {
  const d = t.draw, o = t.outfit;
  const draw = d
    ? `<button type="button" class="mini" data-draw><span class="mk lot">${d.no}</span><span class="mt"><b>${esc(d.keyword)}</b><small>${esc(d.title)}</small><span class="mx">${esc(d.poem[0])}，${esc(d.poem[1])}</span></span></button>`
    : '<button type="button" class="mini" data-draw><span class="mk lot">签</span><span class="mt"><b>每日一签</b><small>摇一支今天的签</small><span class="mx">观音灵签 · 每人每天一支</span></span></button>';
  const outfit = `<button type="button" class="mini" data-outfit><span class="mk sw2"><i style="background:${o.colors[0].hex}"></i><i style="background:${o.colors[1].hex}"></i></span><span class="mt"><b>今日穿搭色</b><small>${o.colors[0].name} · ${o.colors[1].name}</small><span class="mx">配饰：${esc(o.accessory)}</span></span></button>`;
  // 问一件事、本月御守：访客点了提示先测能量卡
  const demo = t.demo, taken = t.amulet && t.amulet.taken;
  const ask = `<a class="mini askmini" href="#/ask"${demo ? ' data-demo-tip="问事"' : ''}><span class="mk ask">问</span><span class="mt"><b>问一件事</b><small>拿不准就起一卦</small><span class="mx">梅花易数起卦，白话解读，再帮你挑两个适合去做的日子</span></span></a>`;
  const om = `<a class="mini ommini" href="#/${taken ? 'amulets' : 'wish'}"${demo ? ' data-demo-tip="祈愿"' : ''}><span class="mk om">守</span><span class="mt"><b>本月御守</b><small>${taken ? '已经领了' : '静坐几分钟领一枚'}</small><span class="mx">${taken ? '收在「我的御守」里，点开看看' : '点一炷香或敲颂钵，许一个心愿，领这个月的御守'}</span></span></a>`;
  return `<div class="minis">${draw}${outfit}${ask}${om}</div>`;
}

export function renderToday() {
  const v = $('#view');
  let h = noticesHtml();
  if (S.todayLocked) h += lockHtml(S.todayLocked);
  else if (S.todayErr) h += `<div class="errbox"><p>${esc(S.todayErr)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`;
  else if (!S.today) h += '<div class="sk" style="height:44px"></div><div class="sk" style="height:420px"></div><div class="sk" style="height:84px"></div>';
  else {
    const e = selDate() === S.today.date ? { date: S.today.date, moods: S.today.moods } : entryOf(selDate());
    // 手机上一列：本周、卡片、四张小卡、记录此刻、明天寄语；电脑上右栏放小卡、记录此刻、明天寄语
    h += `<div class="dgrid"><div class="dmain">${planHtml(S.today)}${stripHtml()}${dayCardHtml(slide)}</div>`
      + `<aside class="dside">${minisHtml(S.today)}${recordHtml(e, S.today.moodKit)}${askReviewHtml(S.today)}${tomorrowHtml(S.today)}</aside></div>`;
    slide = '';
  }
  v.innerHTML = h + footHtml();
}

export function pageToday() {
  renderToday();
  if (!S.today || S.today.date !== localToday() || !!S.today.demo !== isDemo()) {
    S.today = null; S.tsel = null; S.wcache = {}; renderToday();
    loadToday().then(() => { if (currentPath() !== '/') return; renderToday(); if (S.today) prefetch(); if (S.today && !S.today.demo) track('today_open', { level: S.today.day.level.k }); });
  }
}

// ---------- 弹层 ----------
function almanacSheet(a, isToday = true) {
  openSheet(isToday ? '大家的今天' : '大家的这一天', `<div class="almbig"><div class="d">${a.d}</div><div><b>${a.y}年${a.m}月${a.d}日 星期${'日一二三四五六'[a.week]}</b><span>农历${a.lunar.monthCn}月${a.lunar.dayCn} · ${a.gz}日${a.lunar.jieqi ? ' · ' + a.lunar.jieqi : ''}${a.lunar.festival ? ' · ' + a.lunar.festival : ''}</span></div></div>`
    + `<div class="dos"><div><b style="color:var(--l5)">宜</b><p>${a.yi.join('、')}</p></div><div><b style="color:var(--l2)">忌</b><p>${a.ji.join('、')}</p></div></div>`
    + '<p class="note" style="margin:0">这是所有人都一样的通用黄历。你的今天，按你的出生信息单独算。</p>');
}

const GRADE_CLS = (g) => (/上上|大吉/.test(g) ? 'g5' : /上|吉/.test(g) ? 'g4' : /中/.test(g) ? 'g3' : 'g2');
export function lotHtml(d, hist) {
  return `<div class="lot"><div class="lothead"><span class="no">第 ${d.no} 签</span><span class="grade ${GRADE_CLS(d.grade)}">${esc(d.grade)}</span></div>`
    + (d.question ? `<p class="lotq">所问 · ${esc(d.question)}</p>` : '')
    + `<h2>${esc(d.title)}</h2><div class="poem">${d.poem.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`
    + `<p class="plain">${esc(d.plain)}</p>${d.hint ? `<p class="hint">${esc(d.hint)}</p>` : ''}`
    + `<div class="kw">${hist ? '关键词' : '今天的关键词'} · <b>${esc(d.keyword)}</b></div>`
    + (hist ? '' : '<button type="button" class="btn ghost block" data-share="lot">分享这支签</button>'
      + '<p class="note" style="margin:0;text-align:center">观音灵签 · 每人每天一支，当天不变 · <a href="#/lots" data-close-sheet>我的签谱</a></p>'
      + '<a class="askentry" href="#/ask" data-close-sheet><span><b>想问一件具体的事？</b><small>心里拿不准的事，用梅花易数起一卦</small></span><i aria-hidden="true">›</i></a>')
    + '</div>';
}
// 每日一签：照庙里求签的步骤走一遍——默念、上香、掷筊请示、摇签、掷筊确认，再看签诗。
// 签号由服务端按人按天定好，仪式只是把这件事做得郑重；当天抽过再点，直接看签。随时可以跳过仪式。
const RITE = ['默念', '上香', '请示', '摇签', '确认'];
const BEI = {
  sheng: ['圣杯', '一平一凸'],
  xiao: ['笑杯', '两面皆平，神明笑而不答。再诚心想一想，重新掷一次。'],
  yin: ['阴杯', '两面皆凸，心还不够静。缓一缓，重新掷一次。'],
};
const FACES = { sheng: ['flat', 'round'], xiao: ['flat', 'flat'], yin: ['round', 'round'] };
const JB = '<svg class="jb" viewBox="0 0 60 34" aria-hidden="true"><path d="M3 31C3 12 16 3 30 3s27 9 27 28c-9-9-17-12-27-12S12 22 3 31Z"/><path class="hl" d="M13 16c5-6 11-9 18-9"/></svg>';
const JBL = '<div class="jbl" aria-live="polite"><span></span><span></span></div>';
let rite = null;
const buzz = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };
const later = (r, ms, fn) => setTimeout(() => { if (rite === r && $('#sheet .rite')) fn(); }, ms);
function birthWords() {
  const b = S.me && S.me.birth;
  if (!b) return '';
  const [y, m, d] = b.date.split('-').map(Number);
  const h = b.time ? +b.time.slice(0, 2) : null;
  return (b.cal === 'lunar' && b.lunar ? `农历${b.lunar.text}` : `${y}年${m}月${d}日`)
    + (h == null ? '' : ` ${'子丑寅卯辰巳午未申酉戌亥'[Math.floor((h + 1) / 2) % 12]}时`);
}
function riteBody(k) {
  const q = rite.q;
  if (k === 0) {
    return '<p class="tip">双手合十，心里默念自己的名字、生辰，和想问的那件事。</p>'
      + `<div class="prayc"><p><span>信众</span><b>${esc(S.today.name || (S.me && S.me.nickname) || '')}</b></p>${birthWords() ? `<p><span>生辰</span><b>${esc(birthWords())}</b></p>` : ''}`
      + `<label><span>所问</span><input name="q" maxlength="30" value="${esc(q)}" placeholder="想问哪件事（可以不写）" enterkeyhint="next"></label></div>`
      + '<button type="button" class="btn primary block" data-rite-next>默念好了</button>';
  }
  if (k === 1) {
    return '<div class="riteinc"><div class="sticks"><i></i><i></i><i></i></div><div class="burner"></div></div>'
      + '<p class="tip">点上三炷香，敬上。</p><button type="button" class="btn primary block" data-rite-light>点香</button>';
  }
  if (k === 2) {
    return `<div class="jiao">${JB}${JB}</div>${JBL}<p class="tip" data-bei>掷一次筊，请示今天能不能求签。<br>一平一凸是「圣杯」，表示可以。</p>`
      + '<button type="button" class="btn primary block" data-rite-toss>掷筊</button>';
  }
  if (k === 3) {
    return `<div class="tubewrap"><div class="tube still"><i></i><i></i><i></i><i></i><i></i></div></div>`
      + `<p class="tip">${q ? esc(`想着「${q}」，`) : ''}摇动签筒，直到一支签落下来。</p>`
      + '<button type="button" class="btn primary block" data-rite-shake>摇签</button>';
  }
  return `<div class="jiao">${JB}${JB}</div>${JBL}<div class="cups" aria-label="已掷出的圣杯"><i>圣</i><i>圣</i><i>圣</i></div>`
    + `<p class="tip" data-bei>第 ${rite.draw.no} 签。连掷三次圣杯，这支签才算是你的。</p>`
    + '<button type="button" class="btn primary block" data-rite-confirm>掷筊确认</button>';
}
function riteShow(k) {
  rite.k = k;
  const body = $('#sheet .sbody');
  if (!body) return;
  body.innerHTML = `<div class="rite"><ol class="ritesteps">${RITE.map((s, i) => `<li class="${i < k ? 'done' : i === k ? 'on' : ''}">${s}</li>`).join('')}</ol>`
    + `<div class="ritebody">${riteBody(k)}</div><button type="button" class="riteskip" data-rite-skip>跳过仪式，直接看签</button></div>`;
  const inp = $('#sheet .prayc input');
  if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); riteNext(); } });
}
function riteDone() {
  const body = $('#sheet .sbody');
  if (body && rite && rite.draw) body.innerHTML = lotHtml(rite.draw);
  rite = null;
}
// 向服务端要今天这支签（每人每天固定一支）
function fetchLot() {
  const r = rite, t = S.today;
  return api('POST', 'draws/today', { date: t.date, question: r.q }).then((d) => {
    t.draw = d.draw; r.draw = d.draw;
    track('draw', { no: d.draw.no, q: !!r.q, skip: r.k < 3 });
    renderToday();
    return d.draw;
  });
}
function readQ() { const inp = $('#sheet .prayc input'); if (inp) rite.q = inp.value.trim(); }
function riteNext() {
  if (!rite) return;
  if (rite.k === 0) readQ();
  if (rite.k >= 4) { riteDone(); return; }
  riteShow(rite.k + 1);
}
function drawSheet() {
  const t = S.today;
  if (t.draw) { openSheet('每日一签', lotHtml(t.draw)); return; }
  rite = { k: 0, q: '', failed: false, draw: null };
  openSheet('每日一签', '', { onClose: () => { rite = null; } });
  riteShow(0);
}
// 掷一次筊：两块落地，按结果翻成平面或凸面
function toss(r, kind, done) {
  const box = $('#sheet .jiao');
  const labels = $$('#sheet .jbl span');
  labels.forEach((s) => { s.textContent = ''; });
  box.classList.remove('toss'); void box.offsetWidth; box.classList.add('toss');
  later(r, 720, () => {
    box.classList.remove('toss');
    box.querySelectorAll('.jb').forEach((el, i) => { el.classList.remove('flat', 'round'); el.classList.add(FACES[kind][i]); });
    labels.forEach((s, i) => { s.textContent = FACES[kind][i] === 'flat' ? '平' : '凸'; });
    buzz(kind === 'sheng' ? 16 : [10, 40, 10]);
    done();
  });
}
onClick('[data-rite-next]', riteNext);
onClick('[data-rite-light]', (btn) => {
  const r = rite;
  btn.disabled = true;
  $$('#sheet .sticks i').forEach((el, i) => later(r, 380 * i, () => { el.classList.add('lit'); buzz(8); }));
  later(r, 1300, () => { btn.disabled = false; btn.textContent = '敬好了，去请示'; btn.removeAttribute('data-rite-light'); btn.setAttribute('data-rite-next', ''); });
});
onClick('[data-rite-toss]', (btn) => {
  const r = rite;
  // 最多一次不成，第二次一定是圣杯
  const kind = r.failed || Math.random() < 0.65 ? 'sheng' : Math.random() < 0.5 ? 'xiao' : 'yin';
  btn.disabled = true;
  toss(r, kind, () => {
    const tip = $('#sheet [data-bei]');
    btn.disabled = false;
    if (kind === 'sheng') {
      tip.innerHTML = '<b class="bei ok">圣杯</b>一平一凸，可以求签了。';
      btn.textContent = '去摇签'; btn.removeAttribute('data-rite-toss'); btn.setAttribute('data-rite-next', '');
    } else {
      r.failed = true;
      tip.innerHTML = `<b class="bei">${BEI[kind][0]}</b>${BEI[kind][1]}`;
      btn.textContent = '再掷一次';
    }
  });
});
onClick('[data-rite-shake]', (btn) => {
  const r = rite, tube = $('#sheet .tube'), tip = $('#sheet .ritebody .tip');
  btn.disabled = true;
  tube.classList.remove('still');
  const started = Date.now();
  fetchLot().then((d) => later(r, Math.max(0, 1500 - (Date.now() - started)), () => {
    tube.classList.add('still');
    $('#sheet .tubewrap').insertAdjacentHTML('beforeend', `<div class="fallen"><b>第${d.no}签</b></div>`);
    buzz(24);
    tip.textContent = `落下一支：第 ${d.no} 签。`;
    btn.disabled = false; btn.textContent = '掷筊确认'; btn.removeAttribute('data-rite-shake'); btn.setAttribute('data-rite-next', '');
  }), (e) => later(r, 0, () => { tube.classList.add('still'); tip.textContent = e.message; btn.disabled = false; btn.textContent = '再摇一次'; }));
});
onClick('[data-rite-confirm]', (btn) => {
  const r = rite, cups = $$('#sheet .cups i');
  btn.disabled = true;
  const one = (i) => toss(r, 'sheng', () => {
    cups[i].classList.add('on');
    if (i < 2) { later(r, 260, () => one(i + 1)); return; }
    $('#sheet [data-bei]').innerHTML = `<b class="bei ok">三次圣杯</b>第 ${r.draw.no} 签是你的。`;
    btn.disabled = false; btn.textContent = '请出签诗'; btn.removeAttribute('data-rite-confirm'); btn.setAttribute('data-rite-next', '');
  });
  one(0);
});
onClick('[data-rite-skip]', (btn) => {
  const r = rite;
  if (!r) return;
  if (r.k === 0) readQ();
  track('draw_skip', { step: r.k });
  if (r.draw) { riteDone(); return; }
  btn.disabled = true;
  fetchLot().then(() => later(r, 0, riteDone), (e) => later(r, 0, () => { btn.disabled = false; toast(e.message); }));
});
function outfitSheet() {
  const o = S.today.outfit;
  track('outfit_open');
  openSheet('今日穿搭色', `<div class="outfit"><div class="sws">${o.colors.map((c) => `<div style="background:${c.hex}"><span>${c.name}</span></div>`).join('')}</div>`
    + `<p>${esc(o.text)}</p><p class="acc">配饰：<b>${esc(o.accessory)}</b></p>`
    + '<button type="button" class="btn ghost block" data-share="outfit">分享穿搭色</button>'
    + `<p class="note" style="margin:0">按你的幸运元素（${o.element}）和今天的能量搭配。</p></div>`);
}

onClick('[data-almanac]', () => {
  const e = S.today && entryOf(selDate());
  const a = e ? e.almanac : S.today ? S.today.almanac : S.todayLocked && S.todayLocked.almanac;
  if (a) almanacSheet(a, !S.today || selDate() === S.today.date);
});
onClick('[data-draw]', () => {
  if (isDemo()) { toast('注册后，每天给你抽一支属于你的签'); return; }
  drawSheet();
});
onClick('[data-outfit]', outfitSheet);
onClick('[data-today-detail]', () => { const t = S.today, v = dayView() || t; openDay(v.day, t.chart, t.name, t.plans); });
onClick('[data-a2hs-later]', (el) => { localStorage.setItem('lrl:a2hs-later', String(Date.now())); el.closest('.notice').remove(); });

