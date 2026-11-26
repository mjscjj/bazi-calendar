// 今天页：本周趋势 → 每日卡片（公共与个人宜忌、时辰）→ 记录与工具。
import { $, esc, guestAsk, api, toast, openSheet, onClick, localToday, mdText, price, seen, mark, readLocal, IS_STANDALONE, installKind, IS_MOBILE, track, currentPath, ymd } from './core.js';
import { pillarArtSrc, THEME, setGlow, gwx, actOf, weekday, dosDonts, bestHours, hhShort, luckVars, GRADE_CLS } from './data.js';
import { S, isDemo } from './state.js';
import { openHours, openDay, timelineHtml } from './day.js';
import { recordHtml, onMoodChange, cellStickers } from './mood.js';
import { cardArt, cardTitle } from './onboard.js';
import { shouldTear, showTear } from './tear.js';
import { openRite } from './rite.js';

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

const footHtml = () => '<footer class="foot"><span>仅供娱乐参考，不构成任何决策依据</span><span><a href="#/about?s=terms">用户协议</a> · <a href="#/about?s=privacy">隐私政策</a> · <a href="#/about">关于 flowday</a></span></footer>';
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
    return h;
  }
  // 系统提示同时只放一条，按重要程度：邀请到账 > 体验最后一天 / 会员快到期 > 补出生城市 > 加到主屏
  const today = localToday(), news = (t && t.news) || [], dn = dayN();
  h += firstDayHtml(t, dn);
  if (news.length) h += `<div class="notice good"><p>${news.map((n) => esc(n.text)).join('；')}</p><button type="button" class="x" data-close-notice aria-label="关闭提示">×</button></div>`;
  else if (recapNotice(today)) h += recapNotice(today);
  else if (a && a.mode === 'free' && a.remaining === 0 && !seen('lastfree-' + today)) {
    h += `<div class="notice" data-notice="lastfree-${today}"><p>今天是最后一次免费体验，之后 ¥${price(S.priceCents)}/月。</p><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>`;
  } else if (a && a.mode === 'member' && !a.beta && a.daysLeft <= 3 && !seen('expiring-' + today)) {
    h += `<div class="notice" data-notice="expiring-${today}"><p>会员还有 ${a.daysLeft} 天到期（${mdText(a.memberUntil)}）。</p><a class="btn sm primary" href="#/member">续费</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>`;
  } else if (dn === 2 && !seen('drip-pick')) {
    h += '<div class="notice" data-notice="drip-pick"><p>这周有要做的事吗？写下来，帮你挑出合适的日子和时段。</p><a class="btn sm ghost" href="#/calendar" data-dismiss-go>去挑日子</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>';
  } else if (dn === 4 && S.me && S.me.birth && !S.me.birth.time && !seen('drip-time')) {
    h += '<div class="notice" data-notice="drip-time"><p>补上出生时间，时辰和每天的分数会算得更准。</p><a class="btn sm ghost" href="#/profile" data-dismiss-go>去补上</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>';
  } else if (dn === 6 && !seen('drip-week')) {
    h += '<div class="notice" data-notice="drip-week"><p>第一周过完了，看看这个月你收了几张画、哪天最顺。</p><a class="btn sm ghost" href="#/recap" data-dismiss-go>看看</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>';
  } else if (a && a.beta && !seen('beta-member')) { // 排在第一周提示后面：没关掉它也不会挡住第 3/5/7 天那条
    h += '<div class="notice good" data-notice="beta-member"><p><b>你很幸运</b>：现在是体验版，会员免费送你，会员功能随便用。</p><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>';
  } else if (S.me && S.me.birth && S.me.birth.time && !S.me.birth.city && !seen('city-tip')) {
    h += '<div class="notice" data-notice="city-tip"><p>补上出生城市，按真太阳时排盘，时辰更准。</p><a class="btn sm ghost" href="#/profile" data-dismiss-go>去补上</a><button type="button" class="x" data-dismiss aria-label="关闭提示">×</button></div>';
  } else if (!IS_STANDALONE() && installKind() !== 'no' && !seen('a2hs-done') && (Date.now() - (readLocal('a2hs-later') || 0)) > 7 * 86400000 && seen('guide') && (dn >= 1 || t?.draw?.status === 'done')) {
    h += `<div class="notice" data-notice="a2hs"><p>${IS_MOBILE ? '加到主屏，像 App 一样一点就开。' : '安装到电脑，以后从桌面一点就开。'}</p><button type="button" class="btn sm ghost" data-install>${IS_MOBILE ? '怎么加' : '怎么装'}</button><button type="button" class="x" data-a2hs-later aria-label="以后再说">×</button></div>`;
  }
  return h;
}

// 节气那天可以点开看大图和这个节气对你意味着什么，也可以存成海报
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
  return `<a class="dart lockart" href="#/jiazi" aria-label="${L.art.gz}日的画：${esc(L.art.name)}，去我的一甲子"><img src="${esc(pillarArtSrc(L.art.art))}" alt="" width="600" height="600" decoding="async">`
    + `<span class="cap"><b>${L.art.gz}日</b>${esc(L.art.name)}</span>${j && j.has ? `<i class="seal${fresh ? ' fresh' : ''}" aria-hidden="true">收</i>` : ''}</a>`;
}
function lockHtml(L) {
  const a = L.access || {};
  return almanacLine(L.almanac) + termHtml(L) + lockArtHtml(L) + '<div class="lock2"><div class="pw">'
    + '<span class="lockmark" aria-hidden="true"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="13.5" r="5.2" fill="currentColor"/><path d="M5 21.5q2.75-2.6 5.5 0t5.5 0t5.5 0t5.5 0" fill="none" stroke="#F6EDE3" stroke-width="2.3" stroke-linecap="round"/><path d="M8.5 26.5q1.9-1.8 3.8 0t3.8 0t3.8 0t3.8 0" fill="none" stroke="#F6EDE3" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></svg></span>'
    + `<h2>${a.expired ? '会员已到期' : '免费体验已用完'}</h2>`
    + `<p>${a.expired ? '续费后，继续看每天的你、好时段、每日一签和挑日子。' : `你已经体验了 ${a.freeLimit} 次。开通会员后，今天、日历、挑日子、每日一签都能继续用。`}</p>`
    + `<div class="price"><b>¥${price(L.priceCents || S.priceCents)}</b><span>/ ${L.memberDays || S.memberDays} 天 · 不自动续费</span></div>`
    + `<button type="button" class="btn primary block" data-pay>${a.expired ? '续费会员' : '开通月度会员'}</button>`
    + '<p class="fine">你的资料、计划和签都会保留。</p></div></div>';
}

// 到期或体验用完时，问事、祈愿这些子页也显示同一张开通卡，价格只说会员的
export function memberLockHtml(what) {
  const a = S.access || {};
  return '<div class="lock2"><div class="pw"><span class="lockmark"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="13.5" r="5.2" fill="currentColor"/><path d="M5 21.5q2.75-2.6 5.5 0t5.5 0t5.5 0t5.5 0" fill="none" stroke="#F6EDE3" stroke-width="2.3" stroke-linecap="round"/><path d="M8.5 26.5q1.9-1.8 3.8 0t3.8 0t3.8 0t3.8 0" fill="none" stroke="#F6EDE3" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></svg></span>'
    + `<h2>${a.expired ? '会员已到期' : '免费体验已用完'}</h2><p>${a.expired ? '续费' : '开通会员'}后可以${what}，每天的你、日历和挑日子也都能继续用。</p>`
    + `<div class="price"><b>¥${price(S.priceCents)}</b><span>/ ${S.memberDays} 天 · 不自动续费</span></div>`
    + `<button type="button" class="btn primary block" data-pay>${a.expired ? '续费会员' : '开通月度会员'}</button></div></div>`;
}

const short = (item) => item.split(/[、，]/)[0];
const REL = { '-2': '前天', '-1': '昨天', 1: '明天', 2: '后天' };
// 日柱画作为卡片底图，详情和收画状态留在看画入口。
function dayArtButtonHtml(t, art, isToday) {
  const fresh = isToday && t.jiazi && t.jiazi.fresh && !seen('stamp:' + t.date);
  if (fresh) setTimeout(() => mark('stamp:' + t.date), 1500);
  const collected = isToday && t.jiazi?.has;
  const seal = collected ? `<i class="seal${fresh ? ' fresh' : ''}" aria-hidden="true">收</i>` : '';
  return `<button type="button" class="more day-art-link" data-day-art="${t.day.gz}" data-day-date="${t.date}" aria-label="看画 · ${esc(art.name)}${collected ? '（已收录）' : ''}">${seal}看画 <span aria-hidden="true">›</span></button>`;
}
function yjHtml(yi, ji) {
  return `<dl class="yj2"><div><dt>宜</dt><dd>${esc(yi.join(' · '))}</dd></div><div><dt>忌</dt><dd>${esc(ji.join(' · '))}</dd></div></dl>`;
}

function comparisonHtml(t, dos, donts) {
  const a = t.almanac;
  const generic = a ? `<section class="day-public"><div class="day-yj-head"><h2>公共黄历</h2><button type="button" data-almanac aria-label="查看公共黄历详情">详情 <span aria-hidden="true">›</span></button></div>`
    + yjHtml(a.yi.slice(0, 2), a.ji.slice(0, 2)) + '</section>' : '';
  const showStart = t.demo && !readLocal('pending') && !readLocal('invite')?.name;
  return `<div class="day-compare">${generic}<section class="day-personal"><div class="day-yj-head"><h2>我的日历</h2>`
    + (t.demo ? `<span>${esc(t.name || '小满')}示例</span>` : '')
    + (showStart ? '<a class="day-start" href="#/start">测测我的 <span aria-hidden="true">›</span></a>' : '')
    + '</div>' + yjHtml(dos.slice(0, 3).map(short), donts.slice(0, 2).map(short)) + '</section></div>';
}
function luckFields(o) {
  const colors = o.colors.map((c) => `<span class="luck-color"><i style="--c:${c.hex}" aria-hidden="true"></i>${esc(c.name)}</span>`).join(' ');
  return `<span class="luck-field"><small>幸运色</small><b class="luck-colors">${colors}</b></span>`
    + (o.accessory ? `<span class="luck-field"><small>幸运配饰</small><b>${esc(o.accessory)}</b></span>` : '');
}
function luckyHtml(t, isToday) {
  const o = t.outfit;
  if (!o?.colors?.length) return '';
  const fields = luckFields(o);
  return isToday ? `<button type="button" class="tluck" data-outfit>${fields}<i class="go" aria-hidden="true">›</i></button>`
    : `<div class="tluck">${fields}</div>`;
}
function youHtml(t) {
  const x = t.day, isToday = t.date === localToday();
  const { dos, donts } = dosDonts(x, false);
  const [ty, tm, td] = localToday().split('-').map(Number);
  const diff = Math.round((new Date(x.y, x.m - 1, x.d) - new Date(ty, tm - 1, td)) / 86400000);
  const dname = `${x.m}月${x.d}日 周${weekday(x)}`;
  const context = isToday ? '' : REL[diff];
  // 今日一句写的是「今天…」，看别的日子时换成明天、昨天或这天
  const fix = (txt) => (isToday ? txt : txt.replace(/今天/g, REL[diff] || '这天'));
  const nav = `<button type="button" class="ic nav" data-day-step="-1" aria-label="前一天">‹</button><button type="button" class="ic nav" data-day-step="1" aria-label="后一天">›</button>`;
  // 卡片的光晕和能量环跟着这一天的幸运色走
  const lk = luckVars(t.outfit && t.outfit.colors);
  const art = t.arts?.[x.gz];
  const theme = THEME[x.ssG][0], action = actOf(x);
  return `<section class="tcard k${x.level.k}${lk ? ' luck' : ''}"${lk ? ` style="${lk}"` : ''} aria-label="${isToday ? '你的今天' : dname}">`
    + (art ? `<img class="today-art-bg" src="${esc(pillarArtSrc(art.art))}" alt="" width="600" height="600" decoding="async" draggable="false">` : '')
    + `<div class="th"><div class="today-date"><time datetime="${t.date}">${dname}</time>${context ? `<span>${context}</span>` : ''}${art ? dayArtButtonHtml(t, art, isToday) : ''}</div><span class="thr">${isToday ? '<button type="button" class="ic" data-share="today" aria-label="分享你的今天">分享</button>' : '<button type="button" class="ic" data-day-go="today">回到今天</button>'}${nav}</span></div>`
    + `<div class="hero3"><div class="day-theme"><h1 tabindex="-1">${theme}</h1>${theme === action + '日' ? '' : `<small>宜${action}</small>`}</div>`
    + `<button type="button" class="ring" style="--p:${x.score}" data-day-why aria-label="能量 ${x.score}，${x.level.p}，看为什么"><b>${x.score}</b><small>${x.level.p}</small></button></div>`
    + `<p class="line"><b>${esc(fix(t.line.head))}</b>${esc(fix(t.line.why))}</p>`
    + comparisonHtml(t, dos, donts)
    + timelineHtml(x, isToday)
    + (isToday ? planHtml(t) : '')
    + luckyHtml(t, isToday)
    + '</section>';
}

// 今日计划跟着建议显示，明天的计划放在明天寄语里。
function planHtml(t) {
  const x = t.day, key = `${x.y}-${x.m}-${x.d}`;
  const plans = (t.plans || []).filter((p) => p.date === key);
  if (!plans.length) return '';
  const { top } = bestHours(x);
  const at = (p) => (p.hour != null ? hhShort(p.hour) : top[0] ? hhShort(top[0].i) : '白天');
  return `<a class="today-plan" href="#/calendar"><b>今日计划</b><span>${plans.map((p) => `<span>${esc(p.name)} · 最好 ${at(p)}</span>`).join('')}</span><i aria-hidden="true">›</i></a>`;
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
  // 七列共用 0–100 的纵轴，上方给选中点的文字预留空间。
  const ys = st.days.map(({ day }) => 90 - day.score * 0.55);
  const points = ys.map((y, i) => `${i * 100 + 50},${y}`).join(' ');
  const cols = st.days.map((x, i) => {
    const y = x.day, on = x.date === sel, isToday = x.date === today;
    const sticker = cellStickers((x.moods || []).filter((m) => m.mood).slice(-1), kit);
    return `<button type="button" class="wc${on ? ' on' : ''}${isToday ? ' today' : ''}" data-sel-day="${x.date}" aria-pressed="${on}" aria-controls="dayswipe" aria-label="${isToday ? '今天，' : ''}${y.m}月${y.d}日，${y.score}分，${y.level.p}${sticker ? '，有心情记录' : ''}">`
      + `<span class="wplot" aria-hidden="true" style="--point-y:${ys[i]}%"><i class="ed"></i>${on ? `<span class="wscore">${y.score} · ${y.level.p}</span>` : ''}</span>`
      + `<span class="wdate"><span class="w">${isToday ? '今天' : '周' + weekday(y)}</span><span class="d">${y.d}</span>${sticker}</span></button>`;
  }).join('');
  const trend = `<div class="wtrend"><svg aria-hidden="true" viewBox="0 0 700 100" preserveAspectRatio="none"><polyline points="${points}"/></svg>${cols}</div>`;
  return `<section class="wstrip" aria-label="本周"><div class="wh"><button type="button" class="ic nav" data-week-step="-1" aria-label="上一周">‹</button>`
    + `<div class="wt"><b>${isThis ? '本周运势' : `${d0.m}月${d0.d}日–${d6.m === d0.m ? '' : d6.m + '月'}${d6.d}日`} · ${stripSummary(st.days)}</b>${n ? `<small>已记 ${n} 条</small>` : ''}</div>`
    + `<button type="button" class="ic nav" data-week-step="1" aria-label="下一周">›</button><a class="tbtn" href="#/calendar">日历</a></div>`
    + `${trend}</section>`;
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
  return e ? { ...t, date: e.date, day: e.day, line: e.line, almanac: e.almanac, outfit: e.luck ? { colors: e.luck, accessory: e.accessory } : null } : null;
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
  for (const [cls, n] of [['prev', -1], ['next', 1]]) {
    const el = $('#dtrack > .dslot.' + cls), date = shift(sel, n);
    if (el && (!el.firstChild || (el.firstElementChild.classList.contains('dsk') && weekWith(date)))) el.innerHTML = cardOf(date);
  }
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
  for (const n of [-1, 1]) { const d = shift(sel, n); if (!weekWith(d) && !tooFar(d)) fetchWeek(d).catch(() => {}); }
}
function selectDay(date, dir, reveal = false) {
  const t = S.today;
  if (!t) return;
  if (tooFar(date)) { toast('再往后就翻不动了'); return; }
  S.tsel = date === t.date ? null : date;
  if (date !== t.date && dayN() === 0 && !seen('fd-swipe')) { mark('fd-swipe'); track('fd_task', { k: 'swipe' }); }
  slide = dir > 0 ? 'in-r' : dir < 0 ? 'in-l' : '';
  renderToday();
  if (reveal) {
    const card = $('#dayswipe .cur .tcard');
    card?.querySelector('h1').focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'start' });
  }
  if (!entryOf(date)) {
    fetchWeek(date).then(() => { if (selDate() === date && currentPath() === '/') { slide = ''; renderToday(); prefetch(); } }, (e) => { toast(e.message); S.tsel = null; renderToday(); });
  } else prefetch();
}
// 换到前一天/后一天：先把整排滑过去，滑完再换数据（点 ‹ › 和松手都走这里）
let moving = false;
function slideTo(n, reveal = false) {
  const tr = document.getElementById('dtrack');
  const target = shift(selDate(), n);
  if (!tr || tooFar(target) || matchMedia('(prefers-reduced-motion: reduce)').matches) { selectDay(target, n, reveal); return; }
  moving = true;
  fillSides();
  void tr.offsetWidth;
  tr.style.transition = 'transform .26s cubic-bezier(.2,.8,.2,1)';
  tr.style.transform = `translateX(calc(${-n} * (100% + var(--dgap))))`;
  let done = false;
  const finish = () => { if (done) return; done = true; moving = false; selectDay(target, 0, reveal); };
  tr.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 400);
}
onClick('[data-sel-day]', (el, e) => {
  if (moving) return;
  const d = el.getAttribute('data-sel-day'), sel = selDate();
  if (e.target.closest('.wplot')) {
    selectDay(d, 0);
    $('.wstrip .wc.on')?.focus({ preventScroll: true });
    return;
  }
  if (d === shift(sel, 1)) slideTo(1, true);
  else if (d === shift(sel, -1)) slideTo(-1, true);
  else selectDay(d, d > sel ? 1 : d < sel ? -1 : 0, true);
});
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
        : '<button type="button" class="mini" data-draw><span class="mk lot">签</span><span class="mt"><b>每日一签</b><small>观音灵签 · 每日一支</small></span></button>';
  const ask = `<a class="mini askmini" href="#/ask"${t.demo ? ' data-demo-tip="问事"' : ''}><span class="mk ask">问</span><span class="mt"><b>问一件事</b><small>起卦、解读、挑日子</small></span></a>`;
  return `<div class="minis">${draw}${ask}</div>`;
}

export function renderToday() {
  const v = $('#view');
  fdGift();
  let h = noticesHtml();
  if (S.todayLocked) h += lockHtml(S.todayLocked);
  else if (S.todayErr) h += `<div class="errbox"><p>${esc(S.todayErr)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`;
  else if (!S.today) h += '<div class="sk" style="height:44px"></div><div class="sk" style="height:420px"></div><div class="sk" style="height:84px"></div>';
  else {
    const e = entryOf(selDate());
    h += `<div class="dgrid">${stripHtml()}<div class="dmain">${dayCardHtml(slide)}${firstNightHtml(S.today, dayN())}${recordHtml(e, S.today.moodKit)}</div>`
      + `<aside class="dside">${tomorrowHtml(S.today)}${minisHtml(S.today)}${termHtml(S.today)}</aside></div>`;
    slide = '';
  }
  v.innerHTML = h + footHtml();
  fdHints();
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
  const el = $('#view .dslot.cur .day-art-link .seal, #view .lockart .seal');
  if (!el) return;
  el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh');
}
function jiaziNews(j, name, date, locked, stampNew = !seen('stamp:' + date)) {
  if (!j) return;
  if (j.reward) { toast(`集齐一甲子！送你一枚御守，${locked ? '开通会员后' : ''}在「转运」里直接领`); return; }
  // 新用户的引导、点朋友链接弹出的画还在时不弹，免得压在弹层上（印照样盖）
  if (j.fresh && stampNew && seen('guide') && !S.linking) toast(`收下了今天的画「${name}」· 已收 ${j.n} / 60`);
}

// ---------- 弹层 ----------
function almanacSheet(a, isToday = true) {
  openSheet(isToday ? '大家的今天' : '大家的这一天', `<div class="almbig"><div class="d">${a.d}</div><div><b>${a.y}年${a.m}月${a.d}日 星期${'日一二三四五六'[a.week]}</b><span>农历${a.lunar.monthCn}月${a.lunar.dayCn} · ${a.gz}日${a.lunar.jieqi ? ' · ' + a.lunar.jieqi : ''}${a.lunar.festival ? ' · ' + a.lunar.festival : ''}</span></div></div>`
    + `<div class="dos"><div><b style="color:var(--l5)">宜</b><p>${a.yi.join('、')}</p></div><div><b style="color:var(--l2)">忌</b><p>${a.ji.join('、')}</p></div></div>`
    + '<p class="note" style="margin:0">这是所有人都一样的通用黄历。你的今天，按你的出生信息单独算。</p>');
}

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
function outfitSheet() {
  const o = S.today.outfit;
  track('outfit_open');
  openSheet('今日幸运指南', `<div class="outfit"><div class="luck-list">${luckFields(o)}</div>`
    + `<p>${esc(o.text)}</p>`
    + '<button type="button" class="btn ghost block" data-share="outfit">分享今日幸运指南</button></div>');
}

onClick('[data-almanac]', () => {
  const a = S.today ? dayView()?.almanac : S.todayLocked?.almanac;
  if (a) almanacSheet(a, !S.today || selDate() === S.today.date);
});
onClick('[data-draw]', () => {
  if (isDemo()) { guestAsk('每天抽一支属于你的签'); return; }
  openRite(renderToday);
});
onClick('[data-outfit]', outfitSheet);
onClick('[data-day-art]', (el) => {
  const t = S.today, gz = el.getAttribute('data-day-art'), a = t.arts[gz], me = t.card && t.card.pillar, j = t.jiazi;
  const isToday = el.getAttribute('data-day-date') === t.date;
  track('day_art_open', { today: isToday });
  openSheet(`${gz}日 · ${a.name}`, `<div class="artsheet"><img class="big" src="${esc(pillarArtSrc(a.art))}" alt="">`
    + `<p class="note" style="margin:0">每一天也有自己的天干地支，60 天一轮。${gz}日是「${esc(a.name)}」，这一天大家看到的都是这张画。</p>`
    + (me && !t.demo ? `<a class="artme" href="#/card" data-close-sheet><img src="${me.art}" alt=""><span><small>你的日柱</small><b>${me.gz} · ${esc(me.name)}</b></span><i aria-hidden="true">›</i></a>` : '')
    + (t.demo ? '<a class="btn primary block" href="#/start" data-close-sheet>测测我的日柱</a>'
      : `<div class="acts">${isToday ? '<button type="button" class="btn ghost" data-share="wall">存成今天的锁屏</button>' : ''}<a class="btn primary" href="#/jiazi" data-close-sheet>我的一甲子 · ${j ? j.n : 0}/60</a></div>`)
    + '</div>');
});
onClick('[data-today-detail]', () => { const t = dayView(); if (t) openHours(t.day); });
onClick('[data-a2hs-later]', (el) => { localStorage.setItem('lrl:a2hs-later', String(Date.now())); el.closest('.notice').remove(); });


// ---------- 新用户的第一周：第一天的细带、第一晚、每天一条提示（只看本机的标记和注册日期） ----------
// 注册当天是第 0 天
function dayN() {
  if (!S.me || !S.me.createdAt || isDemo()) return -1;
  const a = new Date(ymd(new Date(S.me.createdAt)) + 'T00:00:00'), b = new Date(localToday() + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
// 三件事按顺序一件件来：细带上只说下一件，对应的地方在原位发光
const FD = [['why', (t) => `今天为什么是「${esc(t.day.level.p)}」？`], ['swipe', () => '滑到明天看看'], ['draw', () => '求今天的第一支签']];
// 求签不论结果（圣杯、换个问题、时机未到），求过就算
const fdOk = (k, t) => seen('fd-' + k) || (k === 'draw' && !!t?.draw && t.draw.status !== 'pending');
const fdNext = (t) => FD.find(([k]) => !fdOk(k, t));
function firstDayHtml(t, dn) {
  if (dn !== 0 || !t || t.demo || seen('fd-done')) return '';
  const next = fdNext(t);
  if (!next) return '';
  return `<button type="button" class="fdbar" data-fd-go><b>第一天</b><span class="fddots" role="img" aria-label="做完 ${FD.filter(([k]) => fdOk(k, t)).length} / 3">${FD.map(([k]) => `<i class="${fdOk(k, t) ? 'on' : ''}"></i>`).join('')}</span>`
    + `<span class="fdnext">${next[1](t)}</span><small>送御守</small><i class="go" aria-hidden="true">›</i></button>`;
}
// 当前这件事的位置发光；滑动那件用小手
function fdHints() {
  const t = S.today;
  if (!t || t.demo || dayN() !== 0 || seen('fd-done') || selDate() !== t.date) return;
  const k = fdNext(t)?.[0];
  if (k === 'why') $('#dayswipe .cur .ring')?.classList.add('fdglow');
  else if (k === 'draw') document.querySelector('.minis [data-draw]')?.classList.add('fdglow');
  else if (k === 'swipe') ghostHand();
}
function fdDo(k, t) {
  if (k === 'why') { mark('fd-why'); track('fd_task', { k }); openDay(t.day, t.chart, t.name, t.plans); setTimeout(firstDayCheck, 0); }
  else if (k === 'swipe') { // 日卡可能在下面：先滚到眼前，再滑到明天
    $('#dayswipe')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => { if (currentPath() === '/' && !moving) slideTo(1); }, 450);
  } else if (k === 'draw') document.querySelector('.minis [data-draw]')?.click();
}
onClick('[data-fd-go]', () => { const t = S.today, n = t && fdNext(t); if (n) fdDo(n[0], t); });
// 点能量环：看这一天为什么是这个档位
onClick('[data-day-why]', () => {
  const t = S.today, v = dayView();
  if (!t || !v) return;
  if (v.date === t.date && dayN() === 0 && !seen('fd-why')) return fdDo('why', t);
  openDay(v.day, t.chart, t.name, t.plans);
});
// 第一天晚上：记录区上面一行，五个由冷到暖的点，过得顺不顺（和今天的档位对照，记进准确率）
const RATE = ['很不顺', '有点难', '一般', '挺好', '很顺'];
function firstNightHtml(t, dn) {
  if (dn !== 0 || !t || t.demo || selDate() !== t.date || new Date().getHours() < 18 || seen('fd-rate')) return '';
  return `<div class="fdnight" role="group" aria-label="第一天过得顺吗"><span>第一天过得顺吗？</span><span class="fdrate"><small>不顺</small>${RATE.map((w, i) => `<button type="button" class="r${i + 1}" data-fd-rate="${i + 1}" aria-label="${w}" title="${w}"></button>`).join('')}<small>很顺</small></span></div>`;
}
// 按今天的档位回一句：对上了就说对上了，没对上就记下
function rateReply(lv, score) {
  const k = lv.k, p = `「${lv.p}」`;
  if (score >= 4) return k >= 4 ? `${p}的日子你也觉得顺，我们对上了。` : k <= 2 ? `今天本是${p}日，你却过得不错——说明你稳住了。` : '平稳的一天被你过成了好日子。';
  if (score <= 2) return k <= 2 ? `今天本就是${p}日，辛苦了，明天会不一样。` : '今天比预想的难一些，我记下了，会慢慢更懂你。';
  return k === 3 ? '不好不坏，正是平稳的样子，对上了。' : '记下了，明天再看准不准。';
}
onClick('[data-fd-rate]', (el) => {
  const score = +el.getAttribute('data-fd-rate');
  mark('fd-rate'); track('fd_rate', { score });
  api('POST', 'ratings', { day: localToday(), score }).catch(() => {}); // 不带 note，免得清掉用户在记录里写的话
  toast(rateReply(S.today.day.level, score));
  renderToday();
});
// 三件都做完：送一次御守（每次画今天页时检查，求签做完回来也会走到），一枚小御守飞进「转运」
// 服务器确认了才记 fd-done，请求失败下次画今天页再送（服务器只送一次）
let gifting = false;
function fdGift() {
  const t = S.today;
  if (gifting || !t || t.demo || dayN() !== 0 || seen('fd-done') || fdNext(t)) return;
  gifting = true;
  const from = document.querySelector('.fdbar')?.getBoundingClientRect();
  api('POST', 'onboard/gift', {}).then((r) => {
    gifting = false;
    mark('fd-done'); track('fd_done', { given: !!r.given });
    if (!r.given) return;
    mark('fd-gift');
    afterSheet(() => { toast('送你一枚御守，在「转运」'); flyGift(from); });
  }, () => { gifting = false; });
}
// 求签的弹层还开着时，等它关了再飞，不然飞在弹层后面看不见
function afterSheet(fn, n = 0) { if (document.getElementById('sheet') && n < 600) setTimeout(() => afterSheet(fn, n + 1), 300); else fn(); }
function flyGift(from) {
  const to = [...document.querySelectorAll('.tabbar a[href="#/luck"], .topnav a[href="#/luck"]')].find((x) => x.offsetParent);
  const dot = () => to && !to.querySelector('.badge') && to.insertAdjacentHTML('beforeend', '<i class="badge"></i>');
  if (!to || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) { dot(); return; }
  const b = to.getBoundingClientRect(), g = document.createElement('i');
  g.className = 'fdfly'; g.setAttribute('aria-hidden', 'true');
  g.style.left = from.left + from.width / 2 - 11 + 'px'; g.style.top = from.top + from.height / 2 - 15 + 'px';
  document.body.appendChild(g);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    g.style.transform = `translate(${b.left + b.width / 2 - from.left - from.width / 2}px, ${b.top + b.height / 2 - from.top - from.height / 2}px) scale(.55)`;
  }));
  setTimeout(() => { g.remove(); dot(); }, 900);
}
function firstDayCheck() { if (currentPath() === '/') renderToday(); }
// 第一天还没滑过时，日卡上一只小手左右划一下（等注册后的全屏画退场再播）
let handTimer = 0;
function ghostHand() {
  if (handTimer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const play = () => {
    if (document.querySelector('.welcome')) { handTimer = setTimeout(play, 500); return; }
    handTimer = 0;
    const card = document.querySelector('#dayswipe .cur .tcard');
    if (!card || currentPath() !== '/' || selDate() !== S.today?.date || seen('fd-swipe') || card.querySelector('.ghost-hand')) return;
    const g = document.createElement('i'); g.className = 'ghost-hand'; g.setAttribute('aria-hidden', 'true'); card.appendChild(g); setTimeout(() => g.remove(), 3200);
  };
  handTimer = setTimeout(play, 1200);
}
