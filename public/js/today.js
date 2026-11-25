// 今天页，从上往下：本周 7 天（能量趋势和你记的心情、大家的这一天）→ 每天的卡片（左右滑看前后一天）
// → 每日一签（默念所求、摇签、掷筊、解签）、问一件事、转运御守 → 记录此刻 → 明天寄语。
import { $, esc, guestAsk, api, toast, openSheet, onClick, localToday, mdText, price, seen, mark, readLocal, IS_STANDALONE, IS_MOBILE, track, currentPath } from './core.js';
import { THEME, setGlow, gwx, actOf, weekday, dosDonts, bestHours, hhShort, luckVars, HOUR_TIP } from './data.js';
import { S, isDemo } from './state.js';
import { openDay } from './day.js';
import { recordHtml, onMoodChange, moodScore, cellStickers } from './mood.js';
import { cardArt, cardTitle } from './onboard.js';
import { shouldTear, showTear } from './tear.js';

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

// 每月 1–7 号：上个月的回顾生成好了（注册在上个月或更早的人才有）
function recapNotice(today) {
  const [y, m, d] = today.split('-').map(Number);
  if (d > 7 || !S.me || !S.me.createdAt) return '';
  const pm = m === 1 ? 12 : m - 1, key = `recap-${m === 1 ? y - 1 : y}-${String(pm).padStart(2, '0')}`;
  if (seen(key) || S.me.createdAt.slice(0, 7) > key.slice(6)) return '';
  return `<div class="notice good" data-notice="${key}"><p>你的${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][pm - 1]}月回顾生成好了：打开了几天、收了几张画、最顺的是哪天。</p><a class="btn sm primary" href="#/recap" data-dismiss-go>去看看</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>`;
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
  else if (recapNotice(today)) h += recapNotice(today);
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

// 节气那天：今天页最上面一张节气卡，点开看大图和这个节气对你意味着什么，可以存成海报
function termHtml(t) {
  const x = t && t.term;
  if (!x) return '';
  return `<button type="button" class="termc" data-term><img src="${esc(x.art)}" alt="" width="600" height="600" decoding="async">`
    + `<span><small>今日节气</small><b>${esc(x.name)}</b><span>${esc(x.line)}</span></span><i aria-hidden="true">›</i></button>`;
}
onClick('[data-term]', () => {
  const t = S.today || S.todayLocked, x = t && t.term;
  if (!x) return;
  track('term_open', { name: x.name });
  openSheet(`今日${x.name}`, `<div class="artsheet termsheet"><img class="big" src="${esc(x.art)}" alt=""><b class="tn">${esc(x.name)}</b>`
    + `<p>${esc(x.line)}</p><p class="mine">${esc(x.mine)}</p>`
    + `<button type="button" class="btn primary block" data-share="term">存成节气海报</button></div>`);
});
// 体验用完、会员到期：今天页锁住，但今天的画照样收下（收画和会员无关），点画去「我的一甲子」
function lockArtHtml(L) {
  if (!L.art) return '';
  const j = L.jiazi, day = localToday(), fresh = j && j.fresh && !seen('stamp:' + day);
  if (fresh) setTimeout(() => mark('stamp:' + day), 1500);
  return `<a class="dart lockart" href="#/jiazi" aria-label="${L.art.gz}日的画：${esc(L.art.name)}，去我的一甲子"><img src="${L.art.art}" alt="" width="600" height="600" decoding="async">`
    + `<span class="cap"><b>${L.art.gz}日</b>${esc(L.art.name)}</span>${j && j.has ? `<i class="seal${fresh ? ' fresh' : ''}" aria-hidden="true">收</i>` : ''}</a>`;
}
function lockHtml(L) {
  const a = L.access || {};
  return almanacLine(L.almanac) + termHtml(L) + lockArtHtml(L) + '<div class="lock2"><div class="pw">'
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
// 这一天的画：每一天也有自己的日柱，60 天一轮，大家看到的是同一张；右下角是你自己的那张小画。
// 今天这张收进了「我的一甲子」时盖一枚「收」字小印，当天第一次打开时印是盖下去的。
// 放在主题和分数下面：小屏上先看到今天是什么日子
function dayArtHtml(t, isToday) {
  const a = t.arts && t.arts[t.day.gz], me = t.card && t.card.pillar;
  if (!a) return '';
  const fresh = isToday && t.jiazi && t.jiazi.fresh && !seen('stamp:' + t.date);
  if (fresh) setTimeout(() => mark('stamp:' + t.date), 1500);
  const seal = isToday && t.jiazi && t.jiazi.has ? `<i class="seal${fresh ? ' fresh' : ''}" aria-hidden="true">收</i>` : '';
  return `<button type="button" class="dart" data-day-art="${t.day.gz}" data-day-date="${t.date}" aria-label="${t.day.gz}日的画：${esc(a.name)}"><img src="${a.art}" alt="" width="600" height="600" decoding="async">`
    + `<span class="cap"><b>${t.day.gz}日</b>${esc(a.name)}</span>${seal}${me ? `<span class="me"><img src="${me.art}" alt=""></span>` : ''}</button>`;
}
// 十二时辰盘：一圈 24 小时，子时在最上面；十二格按好坏上色，夜里的几格淡一些；
// 今天有一根指针指着现在，现在正是好时辰时那一格微微发亮；点哪一格，下面说那个时辰适合做什么
const nowZhi = () => { const d = new Date(); return Math.floor((d.getHours() + 1) / 2) % 12; };
const hourCap = (u, isNow) => (u ? `<b>${isNow ? '此刻 · ' : ''}${u.name} ${u.range.replace('-', '–')} 点</b> · ${HOUR_TIP[u.ss] || ''} · ${u.level.p} ${u.score}` : '');
function dialHtml(x, isToday, top, worst) {
  if (!x.hours || x.hours.length < 12) return '';
  const R1 = 54, R0 = 38, pt = (r, a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
  const best = new Set(top.map((u) => u.i)), now = nowZhi();
  const segs = x.hours.map((u) => {
    const a0 = ((2 * u.i - 1) / 24) * 2 * Math.PI + 0.018, a1 = ((2 * u.i + 1) / 24) * 2 * Math.PI - 0.018;
    const d = `M${pt(R1, a0)} A${R1} ${R1} 0 0 1 ${pt(R1, a1)} L${pt(R0, a1)} A${R0} ${R0} 0 0 0 ${pt(R0, a0)}Z`;
    const cls = `hs k${u.level.k}${u.night ? ' night' : ''}${best.has(u.i) ? ' best' : ''}${worst && worst.i === u.i ? ' worst' : ''}${isToday && u.i === now ? ' now' : ''}${isToday && u.i === now && best.has(u.i) ? ' glow' : ''}`;
    const lab = ((2 * u.i) / 24) * 2 * Math.PI;
    return `<path class="${cls}" d="${d}" data-hour="${u.i}" data-cap="${esc(hourCap(u, isToday && u.i === now))}"><title>${u.name} ${u.range} 点</title></path>`
      + `<text x="${(64 * Math.sin(lab)).toFixed(1)}" y="${(-64 * Math.cos(lab) + 3.5).toFixed(1)}">${u.name[0]}</text>`;
  }).join('');
  let hand = '';
  if (isToday) {
    const d = new Date(), a = ((d.getHours() + d.getMinutes() / 60) / 24) * 2 * Math.PI;
    // 指针只画在圆环上那一截，不挡中间的字
    hand = `<line class="hand" x1="${(30 * Math.sin(a)).toFixed(2)}" y1="${(-30 * Math.cos(a)).toFixed(2)}" x2="${(58 * Math.sin(a)).toFixed(2)}" y2="${(-58 * Math.cos(a)).toFixed(2)}"/>`;
  }
  const c = isToday ? x.hours[now] : top[0];
  const center = c ? `<text class="cn" y="-2">${c.name}</text><text class="cs" y="13">${isToday ? '此刻' : '最佳'} · ${c.level.p}</text>` : '';
  return `<svg class="hring" viewBox="-74 -74 148 148" role="img" aria-label="十二时辰：${top.map((u) => u.name).join('、')}最好">${segs}${hand}${center}</svg>`;
}
// 今日幸运色：卡片的光晕和能量环就是这两个颜色，这一行把它说出来；
// 今天的可以点开看为什么、配什么，别的日子只说是哪两个颜色（配饰和理由只算了今天的）
function luckyHtml(t, isToday) {
  const o = t.outfit;
  if (!o || !o.colors || o.colors.length < 2) return '';
  const [a, b] = o.colors;
  const beads = `<span class="beads" aria-hidden="true"><i style="--c:${a.hex}"></i><i style="--c:${b.hex}"></i></span>`;
  const names = `<b>${esc(a.name)} · ${esc(b.name)}</b>`;
  if (!isToday) return `<div class="tluck">${beads}<small>幸运色</small>${names}</div>`;
  return `<button type="button" class="tluck" data-outfit>${beads}<small>今日幸运色</small>${names}<em>配${esc(o.accessory)}</em>`
    + `<i class="go" aria-hidden="true">›</i><span class="why">${esc(o.text)}</span></button>`;
}
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
  // 卡片的光晕和能量环跟着这一天的幸运色走
  const lk = luckVars(t.outfit && t.outfit.colors);
  return `<section class="tcard k${x.level.k}${lk ? ' luck' : ''}"${lk ? ` style="${lk}"` : ''} aria-label="${isToday ? '你的今天' : dname}">`
    + `<div class="th"><span class="eyebrow">${who}</span><span class="thr">${isToday ? '<button type="button" class="ic" data-share="today" aria-label="分享你的今天">分享</button>' : '<button type="button" class="ic" data-day-go="today">回到今天</button>'}${nav}</span></div>`
    + `<div class="hero3"><div class="theme"><small>${isToday ? '今天' : REL[diff] || '这天'}是你的</small><b>${THEME[x.ssG][0]}</b></div>`
    + `<div class="ring" style="--p:${x.score}" role="img" aria-label="能量 ${x.score}，${x.level.p}"><b>${x.score}</b><small>${x.level.p}</small></div></div>`
    + luckyHtml(t, isToday)
    + dayArtHtml(t, isToday)
    + `<p class="line"><b>${esc(fix(t.line.head))}</b>${esc(fix(t.line.why))}</p>`
    + `<dl class="yj2"><div><dt>宜</dt><dd>${short(dos.slice(0, 3))}</dd></div><div><dt>忌</dt><dd>${short(donts.slice(0, 2))}</dd></div></dl>`
    + (isToday ? `<div class="nowline" id="nowline">${nowText(x)}</div>` : '')
    + `<div class="hdial">${dialHtml(x, isToday, top, worst)}<div class="times">${top.map((u, i) => `<div><small>${i ? '次佳' : '最佳时段'}</small><b>${hhShort(u.i)}</b></div>`).join('')}`
    + (worst ? `<div class="bad"><small>尽量避开</small><b>${hhShort(worst.i)}</b></div>` : '') + '</div></div>'
    + `<p class="hcap" aria-live="polite">${hourCap(x.hours.find((u) => u.i === (isToday ? nowZhi() : (top[0] || {}).i)) || top[0], isToday)}</p>`
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
  return e ? { ...t, date: e.date, day: e.day, line: e.line, outfit: e.luck ? { ...t.outfit, colors: e.luck } : null } : null;
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

onClick('[data-close-notice]', (el) => el.closest('.notice').remove());
onClick('[data-demo-tip]', (el, e) => { e.preventDefault(); guestAsk(el.getAttribute('data-demo-tip')); });
onClick('[data-dismiss-go]', (el) => { const n = el.closest('[data-notice]'); if (n) mark(n.getAttribute('data-notice')); });

function minisHtml(t) {
  const d = t.draw;
  const draw = d && d.status === 'done'
    ? `<button type="button" class="mini" data-draw><span class="mk lot">${d.no}</span><span class="mt"><b>${esc(d.keyword)}</b><small>${esc(d.title)}</small><span class="mx">${esc(d.poem[0])}，${esc(d.poem[1])}</span></span></button>`
    : d && d.status === 'pending'
      ? `<button type="button" class="mini" data-draw><span class="mk lot">${d.no}</span><span class="mt"><b>第 ${d.no} 签</b><small>还没掷筊确认</small><span class="mx">掷出圣杯，才能看签文</span></span></button>`
      : d && d.status === 'reask'
        ? `<button type="button" class="mini" data-draw><span class="mk lot">签</span><span class="mt"><b>每日一签</b><small>三次阴杯 · 换个问题</small><span class="mx">这件事现在不宜问，换个问题再求一支</span></span></button>`
      : d && d.status === 'closed'
        ? '<button type="button" class="mini" data-draw><span class="mk lot">签</span><span class="mt"><b>每日一签</b><small>今天时机未到</small><span class="mx">改日再来，明天再摇一支</span></span></button>'
        : '<button type="button" class="mini" data-draw><span class="mk lot">签</span><span class="mt"><b>每日一签</b><small>摇签、掷筊、解签</small><span class="mx">观音灵签 · 每人每天一支</span></span></button>';
  // 问一件事、转运御守：访客点了提示先测能量卡
  const demo = t.demo, lk = t.luck || { unused: 0, per: 5 }, n = Math.min(lk.unused, lk.per);
  const ask = `<a class="mini askmini" href="#/ask"${demo ? ' data-demo-tip="问事"' : ''}><span class="mk ask">问</span><span class="mt"><b>问一件事</b><small>拿不准就起一卦</small><span class="mx">梅花易数起卦，白话解读，再帮你挑两个适合去做的日子</span></span></a>`;
  const ready = lk.unused >= lk.per || (lk.energy || 0) >= (lk.energyPer || 20);
  const om = `<a class="mini ommini" href="#/luck"${demo ? ' data-demo-tip="做好事换御守"' : ''}><span class="mk om">守</span><span class="mt"><b>转运御守</b><small>${ready ? '可以换一枚了' : `善行 ${n}/${lk.per} · 冥想 ${Math.min(lk.energy || 0, lk.energyPer || 20)}/${lk.energyPer || 20} 分钟`}</small><span class="mx">做好事、提能量都能换一枚御守，也可以直接买</span></span></a>`;
  return `<div class="minis">${draw}${ask}${om}</div>`;
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
    h += `<div class="dgrid"><div class="dmain">${termHtml(S.today)}${planHtml(S.today)}${stripHtml()}${dayCardHtml(slide)}</div>`
      + `<aside class="dside">${minisHtml(S.today)}${recordHtml(e, S.today.moodKit)}${tomorrowHtml(S.today)}</aside></div>`;
    slide = '';
  }
  v.innerHTML = h + footHtml();
}

export function pageToday() {
  renderToday();
  if (!S.today || S.today.date !== localToday() || !!S.today.demo !== isDemo()) {
    S.today = null; S.tsel = null; S.wcache = {}; renderToday();
    loadToday().then(() => {
      if (currentPath() !== '/') return;
      const stampNew = !seen('stamp:' + localToday());
      renderToday();
      if (S.today) prefetch();
      const t = S.today && !S.today.demo ? S.today : null, L = !t && S.todayLocked && S.todayLocked.art ? S.todayLocked : null;
      if (t) track('today_open', { level: t.day.level.k });
      if (!t && !L) return;
      const art = t ? { ...t.arts[t.day.gz], gz: t.day.gz } : L.art;
      const news = () => jiaziNews((t || L).jiazi, art.name, localToday(), !t, stampNew);
      // 每天第一次打开：先撕掉昨天那页日历，撕完再盖「收」字印、说收下了今天的画
      if (shouldTear(t || L)) showTear(t || L, art, () => { if (currentPath() !== '/') return; replaySeal(); news(); });
      else news();
    });
  }
}

// 收下今天的画：当天第一次打开时说一句；第一次集满一甲子时说送了什么
// 盖「收」字印的动画再放一遍（撕日历时它在撕页下面放过了）
function replaySeal() {
  const el = $('#view .dslot.cur .dart .seal, #view .lockart .seal');
  if (!el) return;
  el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh');
}
function jiaziNews(j, name, date, locked, stampNew = !seen('stamp:' + date)) {
  if (!j) return;
  if (j.reward) { toast(`集齐一甲子！送你一枚御守，${locked ? '开通会员后' : ''}在「转运御守」里直接领`); return; }
  // 新用户的引导、点朋友链接弹出的画还在时不弹，免得压在弹层上（印照样盖）
  if (j.fresh && stampNew && seen('guide') && !S.linking) toast(`收下了今天的画「${name}」· 已收 ${j.n} / 60`);
}

// ---------- 弹层 ----------
function almanacSheet(a, isToday = true) {
  openSheet(isToday ? '大家的今天' : '大家的这一天', `<div class="almbig"><div class="d">${a.d}</div><div><b>${a.y}年${a.m}月${a.d}日 星期${'日一二三四五六'[a.week]}</b><span>农历${a.lunar.monthCn}月${a.lunar.dayCn} · ${a.gz}日${a.lunar.jieqi ? ' · ' + a.lunar.jieqi : ''}${a.lunar.festival ? ' · ' + a.lunar.festival : ''}</span></div></div>`
    + `<div class="dos"><div><b style="color:var(--l5)">宜</b><p>${a.yi.join('、')}</p></div><div><b style="color:var(--l2)">忌</b><p>${a.ji.join('、')}</p></div></div>`
    + '<p class="note" style="margin:0">这是所有人都一样的通用黄历。你的今天，按你的出生信息单独算。</p>');
}

const GRADE_CLS = (g) => (/上上|大吉/.test(g) ? 'g5' : /上|吉/.test(g) ? 'g4' : /中/.test(g) ? 'g3' : 'g2');
// 解签：签诗 → 解曰 → 白话 → 逐项运势（星数 + 断语 + 说明 + 建议；问的那类排第一）→ 签谱原文仙机
const starsHtml = (n) => `<span class="lstars" role="img" aria-label="${n} 颗星">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
function lotTopicsHtml(d) {
  if (!d.topics) return '';
  const T = d.titles || {};
  return `<div class="ltlist"><h3>${esc(T.list || '逐项运势')}</h3>${d.topics.map((t) => `<div class="ltrow${t.asked ? ' asked' : ''}">`
      + `<div class="lthead"><b>${esc(t.name)}</b>${t.asked ? `<em>${esc(T.asked || '你问的')}</em>` : ''}${starsHtml(t.stars)}</div>`
      + (t.items.length ? `<p class="ltitems">${t.items.map((x) => `${esc(x.k)}「${esc(x.v)}」${x.gloss && x.gloss !== x.v ? `<small>${esc(x.gloss)}</small>` : ''}`).join('<i>·</i>')}</p>` : '')
      + `<p class="lttext">${esc(t.say)}</p>`
      + `<p class="ltadv"><span>${esc(T.advice || '建议')}</span>${t.tips.map(esc).join('；')}。</p>`
      + (t.note ? `<p class="ltnote">${esc(t.note)}</p>` : '') + '</div>').join('')}</div>`
    + (d.xianji && d.xianji.some((x) => x.v) ? `<details class="xianji"><summary>${esc(T.table || '签谱原文 · 仙机')}</summary><div class="xjgrid">${d.xianji.map((x) => `<span><small>${esc(x.k)}</small>${esc(x.v || '—')}</span>`).join('')}</div></details>` : '');
}
export function lotHtml(d, hist) {
  return `<div class="lot"><div class="lothead"><span class="no">第 ${d.no} 签</span><span class="grade ${GRADE_CLS(d.grade)}">${esc(d.grade)}</span></div>`
    + (d.question ? `<p class="lotq">所问 · ${esc(d.question)}</p>` : '')
    + `<h2>${esc(d.title)}</h2><div class="poem">${d.poem.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`
    + (d.jieqian ? `<p class="jieyue"><small>解曰</small>${d.jieqian.map(esc).join('　')}</p>` : '')
    + `<p class="plain">${esc(d.plain)}</p>${d.hint ? `<p class="hint">${esc(d.hint)}</p>` : ''}`
    + lotTopicsHtml(d)
    + `<div class="kw">${hist ? '关键词' : '今天的关键词'} · <b>${esc(d.keyword)}</b></div>`
    + (hist ? '' : '<button type="button" class="btn ghost block" data-share="lot">分享这支签</button>'
      + '<p class="note" style="margin:0;text-align:center">观音灵签 · 每人每天一支，当天不变 · <a href="#/lots" data-close-sheet>我的签谱</a></p>'
      + '<a class="askentry" href="#/ask" data-close-sheet><span><b>想问一件具体的事？</b><small>心里拿不准的事，用梅花易数起一卦</small></span><i aria-hidden="true">›</i></a>')
    + '</div>';
}
// ---------- 每日一签：默念所求 → 摇签 → 掷筊 → 解签 ----------
// 摇出来先只知道签号；掷筊（服务器定结果）：圣杯看签文，笑杯可以把问题说清楚些再掷，阴杯或三次没圣杯今天就到这里。
const JFACE = { sheng: [1, 0], xiao: [1, 1], yin: [0, 0] };
const jsteps = (k) => { const st = (S.today.jiao || {}).steps || ['默念所求', '摇签', '掷筊', '解签']; return `<ol class="jsteps">${st.map((x, i) => `<li class="${i < k ? 'done' : i === k ? 'on' : ''}"><i>${i + 1}</i><span>${esc(x)}</span></li>`).join('')}</ol>`; };
// 一块筊杯：月牙形，正面（平的一面）浅，反面（鼓的一面）深
const jblock = (up, flip) => `<span class="jb${up ? ' up' : ''}${flip ? ' flip' : ''}"><svg viewBox="0 0 64 100" aria-hidden="true"><path class="body" d="M18 4C60 14 64 86 18 96C34 74 36 26 18 4Z"/>${up ? '<path class="face" d="M21 12C33 32 33 68 21 88"/>' : '<path class="shine" d="M28 14C46 28 48 70 30 86"/>'}</svg><em>${up ? '正' : '反'}</em></span>`;
const jpair = (faces, cls = '') => `<div class="jpair ${cls}">${jblock(faces[0], false)}${jblock(faces[1], true)}</div>`;
const stickHtml = (no) => `<div class="jstick" aria-hidden="true"><span>${no}</span></div>`;
function drawStage(t) {
  const d = t.draw, J = t.jiao, R = J.results;
  if (!d) {
    return '<form class="drawf" id="drawForm">' + jsteps(0) + '<div class="tube still"><i></i><i></i><i></i><i></i><i></i></div>'
      + `<p class="tip">${esc(J.intro)}</p><input name="q" maxlength="30" placeholder="想问哪件事？比如：这周的面试（可以不写）" enterkeyhint="go">`
      + '<button type="submit" class="btn primary block">摇签筒</button><p class="note" style="margin:0;text-align:center">观音灵签 · 每人每天一支，当天不变</p></form>';
  }
  if (d.status === 'done') return jsteps(3) + lotHtml(d);
  const last = d.tosses[d.tosses.length - 1];
  const history = d.tosses.length ? `<div class="jhist">${d.tosses.map((x, i) => `<span class="${x}">第 ${i + 1} 次 · ${esc(R[x].name)}</span>`).join('')}</div>` : '';
  if (d.status === 'reask') {
    // 三次都是阴杯：换个问题，重新摇一支
    return jsteps(2) + `<div class="jdone">${jpair(JFACE.yin, 'land')}${history}<p class="tip">${esc(J.reask)}</p>`
      + `<form class="drawf" id="reaskForm"><input name="q" maxlength="30" placeholder="换一个想问的事" aria-label="换一个想问的事" required>`
      + `<button type="submit" class="btn primary block">换个问题，重新摇签</button></form>`
      + `<p class="note" style="margin:0;text-align:center">今天还能换 ${d.roundsLeft} 次问题</p></div>`;
  }
  if (d.status === 'closed') {
    const allYin = d.tosses.every((x) => x === 'yin');
    return jsteps(2) + `<div class="jdone">${jpair(JFACE[last] || JFACE.yin, 'land')}${history}`
      + `<p class="tip">${esc(allYin ? J.roundsOut : J.giveUp)}</p><p class="note" style="margin:0;text-align:center">第 ${d.no} 签今天没有求成。明天再来摇一支。</p><button type="button" class="btn ghost block" data-close-sheet>好的，改日再来</button></div>`;
  }
  // pending：摇出了签，等掷筊
  const tried = d.tosses.length, left = J.maxTries - tried;
  return jsteps(2) + `<div class="jdrawn">${stickHtml(d.no)}<div class="jside"><p class="jno">你摇到 <b>第 ${d.no} 签</b></p>${d.question ? `<p class="lotq">所问 · ${esc(d.question)}</p>` : ''}`
    + (last ? `<p class="jres ${last}"><b>${esc(R[last].name)}</b><small>${esc(R[last].face)}</small></p><p class="tip">${esc(R[last].text)}</p>` : `<p class="tip">${esc(J.drawn)}</p>`)
    + '</div></div>'
    + `<div class="jstage" id="jStage">${jpair(last ? JFACE[last] : [1, 0], last ? 'land' : 'rest')}${history}</div>`
    + (last === 'xiao' ? `<input class="jqin" id="jQuestion" maxlength="30" value="${esc(d.question)}" placeholder="把问题说得更清楚些（可以不改）" aria-label="所问之事">` : '')
    + `<button type="button" class="btn primary block" data-toss>${last ? `再掷一次（第 ${tried + 1}/${J.maxTries} 次）` : '掷筊'}</button>`
    + `<p class="note jrules" style="margin:0">${esc(J.rules)}${tried ? ` 还能掷 ${left} 次。` : ''}</p>`;
}
function drawSheet() {
  const t = S.today;
  openSheet('每日一签', `<div class="jiao" id="jiaoBox">${drawStage(t)}</div>`);
}
const jbox = () => $('#jiaoBox');
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'drawForm' && e.target.id !== 'reaskForm') return;
  e.preventDefault();
  const q = e.target.elements.q.value.trim();
  if (e.target.id === 'reaskForm') {
    if (!q || q === S.today.draw.question) { toast('换一个想问的事'); return; }
    track('draw_reask', { round: S.today.draw.round + 1 });
  }
  shakeLot(q);
});
function shakeLot(question) {
  const t = S.today, box = jbox();
  box.innerHTML = jsteps(1) + `<div class="shake"><div class="tube"><i></i><i></i><i></i><i></i><i></i></div><p class="tip">${question ? esc('默念着「' + question + '」……') : '诚心想着那件事……'}</p></div>`;
  const started = Date.now();
  api('POST', 'draws/today', { date: t.date, question }).then((d) => {
    t.draw = d.draw;
    track('draw_shake', { no: d.draw.no, q: !!question });
    if (navigator.vibrate) navigator.vibrate(18);
    setTimeout(() => { if (jbox() && $('.shake', jbox())) { jbox().innerHTML = drawStage(t); renderToday(); } }, Math.max(0, 1300 - (Date.now() - started)));
  }, (e) => { box.innerHTML = `<p class="tip">${esc(e.message)}</p>`; });
}
onClick('[data-toss]', (el) => {
  const t = S.today, stage = $('#jStage'), q = $('#jQuestion');
  el.disabled = true;
  if (stage) stage.innerHTML = jpair([1, 0], 'tossing');
  const started = Date.now();
  api('POST', 'draws/today/toss', { date: t.date, ...(q ? { question: q.value.trim() } : {}) }).then((d) => {
    const show = () => {
      if (!jbox()) return;
      t.draw = d.draw;
      track('draw_toss', { toss: d.toss, n: d.draw.tosses.length });
      if (d.draw.status === 'done') track('draw', { no: d.draw.no, tries: d.draw.tosses.length });
      if (navigator.vibrate) navigator.vibrate(d.toss === 'sheng' ? [20, 60, 20] : 15);
      const R = t.jiao.results;
      if (d.toss === 'sheng') {
        // 先停在圣杯上，再进解签
        jbox().innerHTML = jsteps(2) + `<div class="jdrawn">${stickHtml(d.draw.no)}<div class="jside"><p class="jno">你摇到 <b>第 ${d.draw.no} 签</b></p>${d.draw.question ? `<p class="lotq">所问 · ${esc(d.draw.question)}</p>` : ''}</div></div>`
          + `<div class="jstage">${jpair(JFACE.sheng, 'land')}<p class="jres sheng"><b>${esc(R.sheng.name)}</b><small>${esc(R.sheng.face)} · ${esc(R.sheng.text)}</small></p></div>`
          + '<button type="button" class="btn primary block" data-jiao-read>解签</button>';
      } else jbox().innerHTML = drawStage(t);
      renderToday();
    };
    setTimeout(show, Math.max(0, 1300 - (Date.now() - started)));
  }, (e) => { el.disabled = false; toast(e.message); if (stage) stage.innerHTML = jpair([1, 0], 'rest'); });
});
onClick('[data-jiao-read]', () => { const b = jbox(); if (b) { b.innerHTML = drawStage(S.today); b.scrollIntoView({ block: 'start' }); } });
function outfitSheet() {
  const o = S.today.outfit;
  track('outfit_open');
  openSheet('今日幸运色', `<div class="outfit"><div class="sws">${o.colors.map((c) => `<div><i style="--c:${c.hex}"></i><b>${esc(c.name)}</b></div>`).join('')}</div>`
    + `<p>${esc(o.text)}</p><p class="acc">配饰：<b>${esc(o.accessory)}</b></p>`
    + '<button type="button" class="btn ghost block" data-share="outfit">分享幸运色</button>'
    + `<p class="note" style="margin:0">按你的幸运元素（${o.element}）和今天当家的五行选的，穿的、戴的、随身用的都算。</p></div>`);
}

onClick('[data-almanac]', () => {
  const e = S.today && entryOf(selDate());
  const a = e ? e.almanac : S.today ? S.today.almanac : S.todayLocked && S.todayLocked.almanac;
  if (a) almanacSheet(a, !S.today || selDate() === S.today.date);
});
onClick('[data-draw]', () => {
  if (isDemo()) { guestAsk('每天抽一支属于你的签'); return; }
  drawSheet();
});
onClick('[data-outfit]', outfitSheet);
onClick('[data-day-art]', (el) => {
  const t = S.today, gz = el.getAttribute('data-day-art'), a = t.arts[gz], me = t.card && t.card.pillar, j = t.jiazi;
  const isToday = el.getAttribute('data-day-date') === t.date;
  track('day_art_open', { today: isToday });
  openSheet(`${gz}日 · ${a.name}`, `<div class="artsheet"><img class="big" src="${a.art}" alt="">`
    + `<p class="note" style="margin:0">每一天也有自己的天干地支，60 天一轮。${gz}日是「${esc(a.name)}」，这一天大家看到的都是这张画。</p>`
    + (me && !t.demo ? `<a class="artme" href="#/card" data-close-sheet><img src="${me.art}" alt=""><span><small>你的日柱</small><b>${me.gz} · ${esc(me.name)}</b></span><i aria-hidden="true">›</i></a>` : '')
    + (t.demo ? '<a class="btn primary block" href="#/start" data-close-sheet>测测我的日柱</a>'
      : `<div class="acts">${isToday ? '<button type="button" class="btn ghost" data-share="wall">存成今天的锁屏</button>' : ''}<a class="btn primary" href="#/jiazi" data-close-sheet>我的一甲子 · ${j ? j.n : 0}/60</a></div>`)
    + '</div>');
});
onClick('[data-hour]', (el) => {
  const cap = el.closest('.tcard') && el.closest('.tcard').querySelector('.hcap');
  if (cap) cap.innerHTML = el.getAttribute('data-cap');
  el.closest('svg').querySelectorAll('.hs.pick').forEach((x) => x.classList.remove('pick'));
  el.classList.add('pick');
});
onClick('[data-today-detail]', () => { const t = S.today, v = dayView() || t; openDay(v.day, t.chart, t.name, t.plans); });
onClick('[data-a2hs-later]', (el) => { localStorage.setItem('lrl:a2hs-later', String(Date.now())); el.closest('.notice').remove(); });

