// 日历页：月历、本月一句、我的计划（挑日子）、本月精选。点某一天打开当日详情。
import { $, $$, esc, api, toast, openSheet, dismissSheet, onClick, track, currentPath, isDesk, localToday, seen, mark } from './core.js';
import { THEME, THEME_DESC, WX, setGlow, gwx, gzHtml, shishen, SHORT, actOf, weekday, lunarLabel, specials, hhShort, WEEK } from './data.js';
import { S, isPro, isDemo } from './state.js';
import { openDay, dayDetailHtml } from './day.js';
import { footHtml } from './today.js';
import { cellStickers, moodWords } from './mood.js';

const isCurMonth = () => { const t = new Date(); return t.getFullYear() === S.y && t.getMonth() + 1 === S.m; };

export function loadMonth() {
  S.calErr = null;
  const t = new Date(), today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  return api('GET', `${isDemo() ? 'demo/calendar' : 'calendar'}?y=${S.y}&m=${S.m}&today=${today}`).then((d) => {
    S.cal = d; S.calLocked = null;
    if (d.access) S.access = d.access;
    setGlow(gwx(d.chart.dm));
    if (S.sel > d.days.length) S.sel = d.days.length;
  }, (e) => {
    if (e.status === 402) { S.calLocked = e.data; S.access = e.data.access; S.cal = null; return; }
    if (e.status === 409) { location.hash = '#/welcome'; return; }
    S.calErr = e.message;
  });
}

function summaryHtml(days, C) {
  const jq = days.filter((x) => x.lunar.jieqi).map((x) => x.d + '日' + x.lunar.jieqi);
  if (isPro()) {
    const mgzs = [...new Set(days.map((x) => x.mgz))];
    return `<div class="msum"><span>流年 <b>${gzHtml(days[0].ygz)}</b> ${shishen(C.dm, days[0].ygz[0])}</span><span>流月 ${mgzs.map((g) => `<b>${gzHtml(g)}</b> ${shishen(C.dm, g[0])}`).join(' → ')}</span><span>节气 ${jq.join('、') || '无'}</span></div>`;
  }
  const mid = days[Math.min(14, days.length - 1)], title = THEME[shishen(C.dm, mid.mgz[0])][0].replace('日', '月');
  const good = days.filter((x) => x.level.k >= 4).length, low = days.filter((x) => x.level.k <= 2).length;
  return `<div class="msum"><span>本月是你的「<b>${title}</b>」</span><span><b>${good}</b> 天顺利 · <b>${low}</b> 天留神</span><button type="button" class="tbtn" data-opening>本月解读</button></div>`;
}

// 月历格子里的黄历：取第一个不超过两个字的「宜」
const firstYi = (x) => { const w = (x.lunar.yi || []).find((v) => v.length <= 2) || (x.lunar.yi || [])[0] || ''; return w.slice(0, 2); };
const yiOn = () => seen('cal-yi');
function gridHtml(days, C, plans) {
  const t = new Date(), cur = isCurMonth(), first = (new Date(S.y, S.m - 1, 1).getDay() + 6) % 7;
  const rated = Object.fromEntries(((S.cal && S.cal.ratings) || []).map((r) => [r.d, r]));
  const kit = S.cal && S.cal.moodKit, stuck = {};
  for (const m of (S.cal && S.cal.moods) || []) (stuck[m.d] = stuck[m.d] || []).push(m);
  let h = `<div class="grid${yiOn() ? ' withyi' : ''}" role="grid" aria-label="${S.y}年${S.m}月">` + ['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div class="wk">${w}</div>`).join('') + '<div class="cell pad"></div>'.repeat(first);
  for (const x of days) {
    const isToday = cur && x.d === t.getDate();
    if (isPro()) {
      const j = x.lunar.jieqi, ld = x.lunar.day === 1 ? x.lunar.monthCn + '月' : x.lunar.dayCn;
      h += `<button type="button" class="cell lv${x.level.k}${isToday ? ' today' : ''}${x.d === S.sel ? ' sel' : ''}" data-d="${x.d}" aria-label="${S.m}月${x.d}日 ${x.gz} ${x.level.n}"><span class="dn">${x.d}</span><span class="ln${j ? ' jq' : ''}">${j || ld}</span><span class="gz">${gzHtml(x.gz)}</span><span class="ss">${SHORT[x.ssG]}·${x.level.n}</span></button>`;
      continue;
    }
    const ll = lunarLabel(x), sp = specials(x, C), pl = plans.filter((p) => p.date === `${x.y}-${x.m}-${x.d}`);
    const ms = stuck[x.d], rt = ms ? null : rated[x.d];
    const main = sp.find((z) => z.k === 'bd' || z.k === 'me');
    const dots = sp.filter((z) => z.k === 'gr' || z.k === 'cg').map((z) => `<i class="dot ${z.k}"></i>`).join('');
    h += `<button type="button" class="c2 k${x.level.k}${isToday ? ' today' : ''}${x.d === S.sel ? ' sel' : ''}${main ? ' sp-' + main.k : ''}" data-d="${x.d}" aria-label="${S.m}月${x.d}日 农历${x.lunar.dayCn} ${sp.map((z) => z.t).join(' ')} ${actOf(x)} ${x.level.p}${pl.length ? ' 计划：' + esc(pl[0].name) : ''}${rt ? ' 你打了' + rt.score + '分' : ''}${ms && kit ? ' 心情：' + moodWords(ms, kit) : ''}">`
      + (dots ? `<span class="dots">${dots}</span>` : '') + (rt ? `<i class="rmark r${rt.score >= 4 ? 'hi' : rt.score === 3 ? 'mid' : 'lo'}" aria-hidden="true"></i>` : '') + `<span class="dn">${x.d}</span><span class="ln ${main ? 'spl' : ll.c}">${main ? main.t : ll.t}</span>`
      + (pl.length ? '<span class="act plan">计划</span>' : `<span class="act">${actOf(x)}</span>`)
      + (yiOn() ? `<span class="yi">${firstYi(x) ? '宜' + firstYi(x) : ''}</span>` : '') + cellStickers(ms, kit) + '</button>';
  }
  return h + '</div>';
}

// ---------- 我的计划 ----------
const daysTo = (date) => { const [y, m, d] = date.split('-').map(Number); const [a, b, c] = localToday().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(a, b - 1, c)) / 86400000); };
const cdText = (n) => (n === 0 ? '今天' : n === 1 ? '明天' : n > 1 ? `还有 ${n} 天` : '');
const planSub = (p) => {
  if (!p.date) return '还没定日子';
  const [y, m, d] = p.date.split('-').map(Number);
  return [`周${WEEK[new Date(y, m - 1, d).getDay()]}`, p.hour != null ? hhShort(p.hour) : '', p.ssG ? THEME[p.ssG][0] : ''].filter(Boolean).join(' · ');
};
function planRow(p) {
  const n = p.date ? daysTo(p.date) : null, [, m, d] = (p.date || '').split('-');
  return `<button type="button" class="prow${n != null && n < 0 ? ' past' : ''}" data-plan="${p.id}"><span class="d">${p.date ? `<b>${+d}</b><small>${+m}月</small>` : '<b>—</b>'}</span>`
    + `<span class="n">${esc(p.name)}<small>${planSub(p)}</small></span><span class="cd${n === 0 ? ' now' : ''}">${p.date ? cdText(n) : '去挑'}</span></button>`;
}
function plansHtml(plans) {
  const ahead = plans.filter((p) => !p.date || daysTo(p.date) >= 0).sort((a, b) => (a.date ? daysTo(a.date) : 9999) - (b.date ? daysTo(b.date) : 9999));
  const past = plans.filter((p) => p.date && daysTo(p.date) < 0).sort((a, b) => daysTo(b.date) - daysTo(a.date));
  return '<section class="card plans"><div class="sectitle"><h3>我的计划</h3><button type="button" class="btn sm primary" data-pick-open>＋ 挑个日子</button></div>'
    + (ahead.length ? `<div class="plist">${ahead.map(planRow).join('')}</div>` : '<p class="pempty">要汇报、面试、搬家、谈合作？写下这件事，帮你在未来几个月里挑出合适的日子和时段。</p>')
    + (past.length ? `<details class="pdone"><summary>已经过去的 ${past.length} 件</summary><div class="plist">${past.map(planRow).join('')}</div></details>` : '')
    + (ahead.some((p) => p.date) ? '<p class="note" style="margin:0">定下的日子会出现在月历和那天的「今天」里；订阅了手机日历的，也会同步过去。</p>' : '') + '</section>';
}
// 访客：示例的计划，让人知道可以挑日子
function demoPlansHtml(days) {
  const t = new Date(), cur = isCurMonth();
  const ahead = days.filter((x) => !(cur && x.d <= t.getDate()) && x.level.k >= 3);
  // 挑接下来最顺的两天，按那天的主题配一件合适的事
  const EXAMPLE = { 正官: '季度汇报', 正印: '准备考试', 正财: '和客户谈续约', 偏财: '见新的合作方', 食神: '发布新作品', 伤官: '做一次分享', 比肩: '和朋友约饭', 劫财: '团队一起冲刺', 七杀: '攻坚项目收尾', 偏印: '安静复盘' };
  const sample = ahead.slice().sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.d - b.d)
    .map((x) => ({ id: 0, name: EXAMPLE[x.ssG], date: `${x.y}-${x.m}-${x.d}`, ssG: x.ssG, hour: null }));
  return '<section class="card plans"><div class="sectitle"><h3>我的计划 · 示例</h3><button type="button" class="btn sm primary" data-pick-open>＋ 挑个日子</button></div>'
    + '<p class="pempty">要汇报、面试、搬家、谈合作？写下这件事，按你的出生信息在未来 3 个月里挑出合适的日子和时段，定下后会出现在月历和那天的「今天」里。</p>'
    + (sample.length ? `<div class="plist demo">${sample.map((p) => planRow(p).replace('data-plan="0"', 'data-demo-tip="为自己挑日子"').replace(/<span class="cd[^"]*">[^<]*<\/span>/, '<span class="cd">示例</span>')).join('')}</div>` : '') + '</section>';
}
function picksHtml(days) {
  const cats = [
    ['汇报·见领导', (x) => (x.ssG === '正官' || x.ssG === '正印') && x.level.k >= 4],
    ['谈钱·谈合作', (x) => (x.ssG === '正财' || x.ssG === '偏财') && x.level.k >= 4],
    ['表达·创作', (x) => (x.ssG === '食神' || x.ssG === '伤官') && x.level.k >= 4],
    ['整体最顺', (x) => x.level.k === 5],
    ['适合休息', (x) => x.level.k <= 1 || x.chongDay],
  ];
  // 只看今天以后的日子，每类最多 3 个；整个月都过去了就不显示
  const t = new Date(), past = (x) => new Date(x.y, x.m - 1, x.d) < new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const ahead = days.filter((x) => !past(x));
  if (!ahead.length) return '';
  const rows = cats.map(([k, f]) => [k, ahead.filter(f).slice(0, 3)]).filter(([, hit]) => hit.length);
  if (!rows.length) return '';
  return `<section class="card"><div class="sectitle"><h3>${isCurMonth() ? '本月接下来' : '本月精选'}</h3></div><div class="picks">`
    + rows.map(([k, hit]) => `<div class="pick"><span class="k">${k}</span><span class="chips">${hit.map((x) => `<button type="button" class="chip" data-d="${x.d}">${x.d}日 ${isPro() ? x.gz : '周' + weekday(x)}</button>`).join('')}</span></div>`).join('') + '</div></section>';
}

export function renderCalendar() {
  const v = $('#view');
  document.body.classList.toggle('pro', isPro());
  let h = '';
  if (isDemo()) h += '<div class="notice demo"><p>这是示例（小满）的日历。</p><a class="btn sm primary" href="#/start">测测我的</a></div>';
  const bar = `<div class="monthbar"><button class="nav" type="button" data-month="-1" aria-label="上个月">‹</button><h2>${S.y}年${S.m}月 <button type="button" class="legendq" data-legend aria-label="图例说明">?</button></h2><button type="button" class="yitog" data-cal-yi aria-pressed="${yiOn()}" title="在格子里显示黄历的宜">黄历</button><button class="nav" type="button" data-month="1" aria-label="下个月">›</button></div>`;
  if (S.calLocked) h += `<section class="card">${bar}<div class="lock" style="min-height:360px"><div class="ghost" aria-hidden="true">${'<i></i>'.repeat(35)}</div><div class="pw"><h2>${S.calLocked.access.expired ? '会员已到期' : '免费体验已用完'}</h2><p>开通会员后可以看整月日历、挑日子。</p><button type="button" class="btn primary block" data-pay>开通 ¥${(S.priceCents / 100).toFixed(1)}/月</button></div></div></section>`;
  else if (S.calErr) h += `<div class="errbox"><p>${esc(S.calErr)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`;
  else if (!S.cal) h += `<section class="card"><div class="mhead">${bar}<div class="msum"><span class="sk" style="display:block;width:60%;height:18px"></span></div></div><div class="sk" style="height:380px"></div></section><div class="sk" style="height:200px"></div>`;
  else {
    const { days, chart: C } = S.cal, plans = S.cal.plans || [];
    h += `<div class="cgrid"><div class="cmain"><section class="card"><div class="mhead">${bar}${summaryHtml(days, C)}</div>${gridHtml(days, C, plans)}</section>${isDemo() ? demoPlansHtml(days) : plansHtml(plans)}${picksHtml(days)}</div>`
      + `<aside class="cside"><div class="card daypanel" id="dayPanel">${isDesk() ? panelHtml() : ''}</div></aside></div>`;
  }
  v.innerHTML = h + footHtml();
  const g = $('.grid');
  if (g) bindSwipe(g.closest('.card'));
}

// 桌面版右侧面板：选中那天的详情
function panelHtml() {
  const x = S.cal && S.cal.days[S.sel - 1];
  if (!x) return '';
  return `<div class="ph2"><span>${x.m}月${x.d}日 · 这一天</span></div>` + dayDetailHtml(x, S.cal.chart, S.cal.name, S.cal.plans);
}
function selectDay(d) {
  S.sel = d;
  $$('.grid [data-d]').forEach((b) => b.classList.toggle('sel', +b.getAttribute('data-d') === d));
  if (isDesk() && $('#dayPanel')) { $('#dayPanel').innerHTML = panelHtml(); $('#dayPanel').scrollTop = 0; return; }
  openDay(S.cal.days[d - 1], S.cal.chart, S.cal.name, S.cal.plans);
}

// 在月历上左右滑动换月
function bindSwipe(el) {
  let x0 = null, y0 = 0;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) changeMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
}
function changeMonth(step) {
  S.m += step;
  if (S.m < 1) { S.m = 12; S.y--; } if (S.m > 12) { S.m = 1; S.y++; }
  S.sel = isCurMonth() ? new Date().getDate() : 1;
  S.cal = null; renderCalendar(); reload();
}

export function pageCalendar(r) {
  const d = r.q.get('d');
  let open = null;
  if (d) { const [y, m, dd] = d.split('-').map(Number); if (y && m && dd) { if (y !== S.y || m !== S.m) S.cal = null; S.y = y; S.m = m; S.sel = dd; open = dd; } }
  const after = () => { if (currentPath() !== '/calendar') return; renderCalendar(); if (open && S.cal && !isDesk()) openDay(S.cal.days[open - 1], S.cal.chart, S.cal.name, S.cal.plans); };
  if (!S.cal || !!S.cal.demo !== isDemo()) { S.cal = null; renderCalendar(); loadMonth().then(after); } else after();
}

function openingHtml(days, C) {
  const nm = S.cal.name || '', mid = days[Math.min(14, days.length - 1)], mg = mid.mgz, ss = shishen(C.dm, mg[0]);
  const title = THEME[ss][0].replace('日', '月');
  const good = days.filter((x) => x.level.k >= 4), low = days.filter((x) => x.level.k <= 2);
  const mw = gwx(mg[0]), helps = C.xi.includes(mw);
  const cnt = {}; good.forEach((x) => { const a = actOf(x); cnt[a] = (cnt[a] || 0) + 1; });
  const topAct = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2);
  const best = days.slice().sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.d - b.d);
  const sps = []; days.forEach((x) => specials(x, C).forEach((z) => { if (z.k !== 'gr') sps.push(x.d + '日' + z.t); }));
  const grs = days.filter((x) => specials(x, C).some((z) => z.k === 'gr')).map((x) => x.d + '日');
  return `<section class="opening"><span class="ok">${S.m} 月开篇 · ${THEME[ss][1]}</span><h2>${nm ? esc(nm) + '，' : ''}这是你的「${title}」</h2>`
    + `<p>这个月的大环境是${WX[mw]}能量，${helps ? '正好补你所需，整体顺风' : '对你偏消耗，节奏放慢一点更好'}。你有 <b>${good.length}</b> 天顺利日${topAct.length ? '，最适合' + topAct.map((a) => '「' + a + '」').join('和') : ''}；有 <b>${low.length}</b> 天要留神，重要的事尽量别排在那几天。</p>`
    + `<div class="ogrid"><div><span>本月你的高光日</span>${best.map((x) => `<button type="button" class="chip" data-d="${x.d}">${x.d}日 ${actOf(x)}</button>`).join('')}</div>`
    + (grs.length ? `<div><span>贵人日 · 适合求助和见人</span><b>${grs.join('、')}</b></div>` : '')
    + (sps.length ? `<div><span>你的特殊日子</span><b>${sps.join('、')}</b></div>` : '') + '</div></section>';
}
function legendHtml() {
  const pro = isPro(), lv = pro ? ['大吉', '吉', '平', '小心', '凶'] : ['很顺', '顺利', '平稳', '留神', '低调'];
  return `<div class="legend" style="font-size:13px;gap:10px 16px">${[5, 4, 3, 2, 1].map((k, i) => `<span><i style="background:var(--l${k}bg)${k === 5 ? ';outline:1px solid var(--l5)' : ''}"></i>${lv[i]}</span>`).join('')}</div>`
    + (pro ? '<p class="note" style="margin:0">格内依次是：日期、农历或节气、日柱、日干十神·吉凶。</p>'
      : '<div class="legend" style="font-size:13px;gap:10px 16px"><span><i class="dot gr"></i>贵人日</span><span><i class="dot cg"></i>本命冲</span><span><i style="background:var(--glow)"></i>生日 · 本命日 · 你的计划</span></div><div class="legend" style="font-size:13px;gap:10px 16px"><span><span class="mstk lg" aria-hidden="true"><i style="--pl:#F6E4C8;--pd:#4A3C2A;--r:-6deg;--k:0"></i></span>右上角的小纸片是那天贴的心情，点开那天能看到</span></div><p class="note" style="margin:0">格内依次是：阳历日期、农历 / 节气 / 节日、这天适合的行动。</p>')
    + '<p class="note" style="margin:0">颜色越暖，这一天对你越顺。<a href="#/about?s=algo" data-close-sheet>了解怎么算的</a></p>';
}

const reload = () => loadMonth().then(() => { if (currentPath() === '/calendar') renderCalendar(); });
onClick('[data-legend]', () => openSheet('图例', legendHtml()));
onClick('[data-opening]', () => openSheet(S.m + ' 月解读', openingHtml(S.cal.days, S.cal.chart)));
onClick('[data-month]', (el) => changeMonth(+el.getAttribute('data-month')));
onClick('[data-d]', (el) => {
  if (!S.cal) return;
  if (isDesk() && el.closest('#sheet')) dismissSheet();
  selectDay(+el.getAttribute('data-d'));
});
onClick('[data-cal-yi]', () => {
  if (yiOn()) localStorage.removeItem('lrl:cal-yi'); else mark('cal-yi');
  renderCalendar(); track('cal_yi', { on: yiOn() });
});

// ---------- 挑日子 ----------
// 一个弹层两步：填「做什么、哪类事、多大范围」→ 看 3 个推荐的日子，点「定这天」就进了我的计划。
let pick = null; // { name, type, range, editId, result }
const RANGES = [['month', '本月'], ['1m', '未来 1 个月'], ['3m', '3 个月']];
export function openPicker(init = {}) {
  pick = { name: init.name || '', type: init.type || '', range: init.range || '1m', editId: init.editId || null, result: null };
  track('pick_open', { from: init.from || 'calendar' });
  openSheet(pick.editId ? '改个日子' : '挑个日子', '', { wide: true, onClose: () => { pick = null; } });
  renderPickForm();
}
function pickBody() { return $('#sheet .sbody'); }
function renderPickForm() {
  const types = S.planTypes || [];
  pickBody().innerHTML = '<form class="form pickf" id="pickForm" novalidate>'
    + `<label class="field"><span>要做什么</span><input name="name" maxlength="20" placeholder="比如：和客户谈续约（可以不写）" value="${esc(pick.name)}" enterkeyhint="done"></label>`
    + `<div class="field"><span>是哪类事</span><div class="types" role="group" aria-label="事情类型">${types.map((t) => `<button type="button" data-ptype="${esc(t.name)}" aria-pressed="${t.name === pick.type}"><i>${esc(t.char)}</i>${esc(t.name)}</button>`).join('')}</div></div>`
    + `<div class="field"><span>在什么时间范围</span><span class="segs" role="group" aria-label="时间范围">${RANGES.map(([k, l]) => `<button type="button" data-prange="${k}" aria-pressed="${k === pick.range}">${l}</button>`).join('')}</span></div>`
    + '<div class="err" id="pickErr"></div><button class="btn primary block" type="submit">帮我挑</button></form>';
}
function reasonOf(p, type) {
  const pro = isPro(), parts = [];
  const name = pro ? `${p.ssG}日` : THEME[p.ssG][0];
  parts.push(p.fit ? `${name}，${THEME_DESC[p.ssG]}${type ? `，正适合${type}` : ''}` : `${name}，整体${p.level.p}`);
  if (p.yiHits.length) parts.push(`黄历宜「${p.yiHits.slice(0, 2).join(' ')}」`);
  if (p.tag) parts.push(pro ? `逢${p.tag}` : { 桃花: '人缘旺', 驿马: '利出行' }[p.tag]);
  if (p.guiren) parts.push(pro ? '天乙贵人' : '贵人日，容易得到帮助');
  return parts.join('；');
}
const RANGE_TEXT = { month: '本月剩下的日子', '1m': '未来 1 个月', '3m': '未来 3 个月' };
function exclText(e) {
  const parts = [];
  const words = e.jiWords.filter((w) => w !== '诸事不宜').slice(0, 2);
  if (e.ji) parts.push(words.length ? `${e.ji} 个黄历不宜「${words.join(' ')}」的日子` : `${e.ji} 个黄历「诸事不宜」的日子`);
  if (e.po) parts.push(`${e.po} 个月破或岁破日`);
  if (e.chong) parts.push(`${e.chong} 个和你本命相冲的日子`);
  return parts.length ? `已经帮你排除了${parts.join('、')}。` : '';
}
function renderPickResult() {
  const r = pick.result, nm = pick.name || pick.type;
  let h = `<div class="pickhead"><button type="button" class="tbtn" data-pick-back="form">‹ 改条件</button><b>为「${esc(nm)}」挑了 ${r.picks.length} 天</b><small>${RANGE_TEXT[r.range]} · ${esc(r.type)}类 · 按适不适合这件事排</small></div>`;
  if (!r.picks.length) {
    h += `<div class="pempty">${RANGE_TEXT[r.range]}里没有合适的日子。${exclText(r.excluded)}</div>`
      + (r.range !== '3m' ? '<button type="button" class="btn primary block" data-pick-wider>放宽到 3 个月</button>' : '');
  } else {
    h += '<div class="pick3">' + r.picks.map((p, i) => {
      const [y, m, d] = [p.y, p.m, p.d], wk = WEEK[new Date(y, m - 1, d).getDay()];
      return `<div class="pc"><div class="dt"><b>${d}</b><small>${m}月 周${wk}</small></div><div class="bd">`
        + `<div class="ttl">${THEME[p.ssG][0]} · ${p.level.p}${i === 0 ? ' <span class="rk">最合适</span>' : p.fit ? ' <span class="rk soft">也合适</span>' : ''}</div>`
        + `<div class="rs">${esc(reasonOf(p, r.type))}</div>`
        + (p.hours.length ? `<div class="tm">最好 <b>${hhShort(p.hours[0])}</b>${p.hours[1] != null ? `，其次 ${hhShort(p.hours[1])}` : ''}</div>` : '')
        + `<div class="ac"><button type="button" class="btn ${i === 0 ? 'primary' : 'ghost'}" data-pick-pin="${i}">定这天</button><button type="button" class="btn ghost" data-pick-day="${i}">看详情</button></div></div></div>`;
    }).join('') + '</div>';
    const ex = exclText(r.excluded);
    if (ex) h += `<div class="excl">${ex}</div>`;
  }
  pickBody().innerHTML = h;
  $('#sheet .sheet').scrollTop = 0;
}
function runPick() {
  const body = pickBody();
  if (isDemo()) {
    body.innerHTML = '<div class="pickcta"><b>挑日子要按你的出生信息算</b><p>先测测你的能量卡，不用注册，一分钟就好。保存之后就能为「' + esc(pick.name || pick.type) + '」挑日子了。</p><a class="btn primary block" href="#/start" data-close-sheet>测测我的</a></div>';
    return;
  }
  body.innerHTML = '<div class="pickwait"><div class="sk" style="height:96px"></div><div class="sk" style="height:96px"></div><div class="sk" style="height:96px"></div></div>';
  api('POST', 'pick', { type: pick.type, range: pick.range, today: localToday() }).then((d) => {
    if (!pick) return;
    pick.result = d;
    track('pick_create', { type: pick.type, range: pick.range, n: d.picks.length });
    renderPickResult();
  }, (e) => { if (!pick) return; if (e.status === 402) { dismissSheet(); toast('开通会员后就能挑日子'); return; } renderPickForm(); $('#pickErr').textContent = e.message; });
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'pickForm') return;
  e.preventDefault();
  pick.name = e.target.elements.name.value.trim();
  if (!pick.type) { $('#pickErr').textContent = '选一下是哪类事'; return; }
  runPick();
});
onClick('[data-pick-open]', () => openPicker());
onClick('[data-ptype]', (el) => { pick.type = el.getAttribute('data-ptype'); $$('[data-ptype]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false')); $('#pickErr').textContent = ''; });
onClick('[data-prange]', (el) => { pick.range = el.getAttribute('data-prange'); $$('[data-prange]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false')); });
onClick('[data-pick-back]', (el) => { if (!pick) return; if (el.getAttribute('data-pick-back') === 'result') reopenResult(); else renderPickForm(); });
onClick('[data-pick-wider]', () => { pick.range = '3m'; runPick(); });
onClick('[data-pick-pin]', (el) => {
  const p = pick.result.picks[+el.getAttribute('data-pick-pin')];
  const body = { date: p.date, hour: p.hours[0] ?? null, reason: reasonOf(p, pick.result.type) };
  const req = pick.editId ? api('PUT', 'plans/' + pick.editId, body) : api('POST', 'plans', { name: pick.name || pick.type, type: pick.type, ...body });
  el.disabled = true;
  req.then(() => {
    track('pick_pin', { type: pick.type });
    toast(`定下了：${p.m}月${p.d}日${p.hours[0] != null ? ' ' + hhShort(p.hours[0]) : ''}`);
    S.today = null; S.cal = null;
    dismissSheet();
    if (currentPath() === '/calendar') { renderCalendar(); reload(); }
  }, (e) => { el.disabled = false; toast(e.message); });
});
// 看详情：在同一个弹层里看那天，可以再回到推荐结果
function reopenResult() { $('#sheet .sh b').textContent = pick.editId ? '改个日子' : '挑个日子'; renderPickResult(); }
function monthData(y, m) {
  if (S.cal && S.cal.y === y && S.cal.m === m) return Promise.resolve(S.cal);
  return api('GET', `calendar?y=${y}&m=${m}&today=${localToday()}`);
}
onClick('[data-pick-day]', (el) => {
  const p = pick.result.picks[+el.getAttribute('data-pick-day')];
  if (isDesk() && currentPath() === '/calendar' && S.cal && S.cal.y === p.y && S.cal.m === p.m) { dismissSheet(); selectDay(p.d); return; }
  monthData(p.y, p.m).then((c) => {
    if (!pick || !$('#sheet')) return;
    $('#sheet .sh b').textContent = `${p.m}月${p.d}日`;
    pickBody().innerHTML = '<button type="button" class="tbtn backres" data-pick-back="result">‹ 回到推荐的日子</button>' + dayDetailHtml(c.days[p.d - 1], c.chart, c.name, c.plans);
    $('#sheet .sheet').scrollTop = 0;
  }, (e) => toast(e.message));
});

// ---------- 计划详情 ----------
const planById = (id) => ((S.cal && S.cal.plans) || []).find((p) => p.id === id);
onClick('[data-plan]', (el) => {
  const p = planById(+el.getAttribute('data-plan'));
  if (!p) return;
  if (!p.date) { openPicker({ name: p.name, type: p.type, editId: p.id, from: 'plan' }); return; }
  const [y, m, d] = p.date.split('-').map(Number), n = daysTo(p.date);
  openSheet(p.name, `<div class="plandet"><div class="pdate"><b>${m}月${d}日 周${WEEK[new Date(y, m - 1, d).getDay()]}</b><span>${[p.hour != null ? hhShort(p.hour) : '', p.ssG ? `${THEME[p.ssG][0]} · ${p.level.p} ${p.score}` : '', cdText(n)].filter(Boolean).join(' · ')}</span></div>`
    + `<p class="pwhy">${esc(p.reason || (p.ssG ? `${THEME[p.ssG][0]}，整体${p.level.p}` : ''))}</p>`
    + `<div class="acts3"><button type="button" class="btn ghost" data-plan-day="${p.id}">看那天</button><button type="button" class="btn ghost" data-plan-repick="${p.id}">改日子</button><button type="button" class="btn ghost danger" data-plan-del="${p.id}">删除</button></div></div>`);
});
onClick('[data-plan-day]', (el) => {
  const p = planById(+el.getAttribute('data-plan-day')), [y, m, d] = p.date.split('-').map(Number);
  monthData(y, m).then((c) => openDay(c.days[d - 1], c.chart, c.name, c.plans), (e) => toast(e.message));
});
onClick('[data-plan-repick]', (el) => { const p = planById(+el.getAttribute('data-plan-repick')); openPicker({ name: p.name, type: p.type, editId: p.id, from: 'plan' }); });
onClick('[data-plan-del]', (el) => {
  if (!confirm('删除这个计划？')) return;
  api('DELETE', 'plans/' + el.getAttribute('data-plan-del'), {}).then(() => { S.today = null; dismissSheet(); reload(); }, (e) => toast(e.message));
});
