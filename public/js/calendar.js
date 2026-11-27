// 日历页：月历、本月一句、我的计划（挑日子）、本月精选。点某一天打开当日详情。
import { $, $$, esc, api, toast, openSheet, dismissSheet, onClick, track, currentPath, isDesk, localToday, seen, mark } from './core.js';
import { EN } from './i18n.js';
import { THEME, THEME_DESC, WX, setGlow, gwx, gzHtml, shishen, SHORT, actOf, lunarLabel, specials, hhShort, wkName, MON_EN, mdLabel, ymLabel, themeMonth, lunarText } from './data.js';
import { S, isPro, isDemo } from './state.js';
import { openDay, dayDetailHtml, dayLabel } from './day.js';
import { footHtml } from './today.js';
import { cellStickers, moodWords } from './mood.js';
import { tm } from './i18n.js';
const t = tm('calendar'); // 先查 i18n/en/calendar.json

const isCurMonth = () => { const t = new Date(); return t.getFullYear() === S.y && t.getMonth() + 1 === S.m; };

export function loadMonth() {
  S.calErr = null;
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

// 某个月里的某一天：中文「7日」，英文「Nov 7」
const dOf = (x) => (EN ? mdLabel(x.m, x.d) : t('{d}日', { d: x.d }));
const wkOf = (y, m, d) => wkName(new Date(y, m - 1, d).getDay());
const sep = t('、');
// 挑日子的事项名（汇报、面试…）是逻辑键，会存进计划；显示时用服务端给的 label（英文），没有再查对照表
const typeLabel = (name) => ((S.planTypes || []).find((x) => x.name === name) || {}).label || t(name);
// 计划名：用户自己写的照原样；没写时存的是事项名，显示成 label
const planName = (n) => typeLabel(n);
// 英文：放在句中时首字母小写；数量带单复数（1 day / 3 days）
const lc = (str) => (EN ? str.charAt(0).toLowerCase() + str.slice(1) : str);
const days = (n, pre = '') => (EN ? `${n} ${pre}day${n === 1 ? '' : 's'}` : n);
function summaryHtml(days, C) {
  const jq = days.filter((x) => x.lunar.jieqi).map((x) => `${dOf(x)}${EN ? ' ' : ''}${t(x.lunar.jieqi)}`);
  if (isPro()) {
    const mgzs = [...new Set(days.map((x) => x.mgz))];
    return `<div class="msum"><span>${t('流年')} <b>${gzHtml(days[0].ygz)}</b> ${t(shishen(C.dm, days[0].ygz[0]))}</span><span>${t('流月')} ${mgzs.map((g) => `<b>${gzHtml(g)}</b> ${t(shishen(C.dm, g[0]))}`).join(' → ')}</span><span>${t('节气')} ${jq.join(sep) || t('无')}</span></div>`;
  }
  const mid = days[Math.min(14, days.length - 1)], title = themeMonth(shishen(C.dm, mid.mgz[0]));
  const good = days.filter((x) => x.level.k >= 4).length, low = days.filter((x) => x.level.k <= 2).length;
  const a = EN ? `<b>${good}</b> good day${good === 1 ? '' : 's'}` : `<b>${good}</b>`, b = EN ? `<b>${low}</b> careful day${low === 1 ? '' : 's'}` : `<b>${low}</b>`;
  return `<div class="msum"><span>${t('本月是你的「{t}」', { t: `<b>${title}</b>` })}</span><span>${t('{a} 天顺利 · {b} 天留神', { a, b })}</span><button type="button" class="tbtn" data-opening>${t('本月解读')}</button></div>`;
}

// 月历格子里的黄历：取第一个不超过两个字的「宜」
const firstYi = (x) => { const w = (x.lunar.yi || []).find((v) => v.length <= 2) || (x.lunar.yi || [])[0] || ''; return w ? t(w.slice(0, 2)) : ''; };
const yiOn = () => seen('cal-yi');
function gridHtml(days, C, plans) {
  const now = new Date(), cur = isCurMonth(), first = (new Date(S.y, S.m - 1, 1).getDay() + 6) % 7;
  const rated = Object.fromEntries(((S.cal && S.cal.ratings) || []).map((r) => [r.d, r]));
  const kit = S.cal && S.cal.moodKit, stuck = {};
  for (const m of (S.cal && S.cal.moods) || []) (stuck[m.d] = stuck[m.d] || []).push(m);
  const heads = EN ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['一', '二', '三', '四', '五', '六', '日'];
  let h = `<div class="grid${yiOn() ? ' withyi' : ''}" role="grid" aria-label="${ymLabel(S.y, S.m)}">` + heads.map((w) => `<div class="wk">${w}</div>`).join('') + '<div class="cell pad"></div>'.repeat(first);
  for (const x of days) {
    const isToday = cur && x.d === now.getDate();
    if (isPro()) {
      const j = x.lunar.jieqi, ld = lunarLabel({ lunar: { ...x.lunar, festival: '', jieqi: '' } }).t;
      h += `<button type="button" class="cell lv${x.level.k}${isToday ? ' today' : ''}${x.d === S.sel ? ' sel' : ''}" data-d="${x.d}" aria-label="${mdLabel(S.m, x.d)} ${x.gz} ${t(x.level.n)}"><span class="dn">${x.d}</span><span class="ln${j ? ' jq' : ''}">${j ? t(j) : ld}</span><span class="gz">${gzHtml(x.gz)}</span><span class="ss">${SHORT[x.ssG]}·${t(x.level.n)}</span></button>`;
      continue;
    }
    const ll = lunarLabel(x), sp = specials(x, C), pl = plans.filter((p) => p.date === `${x.y}-${x.m}-${x.d}`);
    const ms = stuck[x.d], rt = ms ? null : rated[x.d];
    const main = sp.find((z) => z.k === 'bd' || z.k === 'me');
    const dots = sp.filter((z) => z.k === 'gr' || z.k === 'cg').map((z) => `<i class="dot ${z.k}"></i>`).join('');
    const label = [mdLabel(S.m, x.d), lunarText(x.lunar), ...sp.map((z) => z.t), actOf(x), t(x.level.p)].join(' ')
      + (pl.length ? t('，计划：{p}', { p: esc(planName(pl[0].name)) }) : '') + (rt ? t('，你打了 {s} 分', { s: rt.score }) : '') + (ms && kit ? t('，心情：{m}', { m: moodWords(ms, kit) }) : '');
    h += `<button type="button" class="c2 k${x.level.k}${isToday ? ' today' : ''}${x.d === S.sel ? ' sel' : ''}${main ? ' sp-' + main.k : ''}" data-d="${x.d}" aria-label="${label}">`
      + (dots ? `<span class="dots">${dots}</span>` : '') + (rt ? `<i class="rmark r${rt.score >= 4 ? 'hi' : rt.score === 3 ? 'mid' : 'lo'}" aria-hidden="true"></i>` : '') + `<span class="dn">${x.d}</span><span class="ln ${main ? 'spl' : ll.c}">${main ? main.t : ll.t}</span>`
      + (pl.length ? `<span class="act plan">${t('计划')}</span>` : `<span class="act">${actOf(x)}</span>`)
      + (yiOn() ? `<span class="yi">${firstYi(x) ? t('宜{w}', { w: firstYi(x) }) : ''}</span>` : '') + cellStickers(ms, kit) + '</button>';
  }
  return h + '</div>';
}

// ---------- 我的计划 ----------
const daysTo = (date) => { const [y, m, d] = date.split('-').map(Number); const [a, b, c] = localToday().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(a, b - 1, c)) / 86400000); };
const cdText = (n) => (n === 0 ? t('今天') : n === 1 ? t('明天') : n > 1 ? t('还有 {n} 天', { n }) : '');
const planSub = (p) => {
  if (!p.date) return t('还没定日子');
  const [y, m, d] = p.date.split('-').map(Number);
  return [wkOf(y, m, d), p.hour != null ? hhShort(p.hour) : '', p.ssG ? THEME[p.ssG][0] : ''].filter(Boolean).join(' · ');
};
function planRow(p) {
  const n = p.date ? daysTo(p.date) : null, [, m, d] = (p.date || '').split('-');
  return `<button type="button" class="prow${n != null && n < 0 ? ' past' : ''}" data-plan="${p.id}"><span class="d">${p.date ? `<b>${+d}</b><small>${EN ? MON_EN[m - 1] : t('{m}月', { m: +m })}</small>` : '<b>—</b>'}</span>`
    + `<span class="n">${esc(planName(p.name))}<small>${planSub(p)}</small></span><span class="cd${n === 0 ? ' now' : ''}">${p.date ? cdText(n) : t('去挑')}</span></button>`;
}
function plansHtml(plans) {
  const ahead = plans.filter((p) => !p.date || daysTo(p.date) >= 0).sort((a, b) => (a.date ? daysTo(a.date) : 9999) - (b.date ? daysTo(b.date) : 9999));
  const past = plans.filter((p) => p.date && daysTo(p.date) < 0).sort((a, b) => daysTo(b.date) - daysTo(a.date));
  return `<section class="card plans"><div class="sectitle"><h3>${t('我的计划')}</h3><button type="button" class="btn sm primary" data-pick-open>${t('＋ 挑个日子')}</button></div>`
    + (ahead.length ? `<div class="plist">${ahead.map(planRow).join('')}</div>` : `<p class="pempty">${t('要汇报、面试、搬家、谈合作？写下这件事，帮你在未来几个月里挑出合适的日子和时段。')}</p>`)
    + (past.length ? `<details class="pdone"><summary>${t('已经过去的 {n} 件', { n: past.length })}</summary><div class="plist">${past.map(planRow).join('')}</div></details>` : '')
    + (ahead.some((p) => p.date) ? `<p class="note" style="margin:0">${t('定下的日子会出现在月历和那天的「今天」里；订阅了手机日历的，也会同步过去。')}</p>` : '') + '</section>';
}
// 访客：示例的计划，让人知道可以挑日子
function demoPlansHtml(days) {
  const now = new Date(), cur = isCurMonth();
  const ahead = days.filter((x) => !(cur && x.d <= now.getDate()) && x.level.k >= 3);
  // 挑接下来最顺的两天，按那天的主题配一件合适的事
  const EXAMPLE = { 正官: t('季度汇报'), 正印: t('准备考试'), 正财: t('和客户谈续约'), 偏财: t('见新的合作方'), 食神: t('发布新作品'), 伤官: t('做一次分享'), 比肩: t('和朋友约饭'), 劫财: t('团队一起冲刺'), 七杀: t('攻坚项目收尾'), 偏印: t('安静复盘') };
  const sample = ahead.slice().sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.d - b.d)
    .map((x) => ({ id: 0, name: EXAMPLE[x.ssG], date: `${x.y}-${x.m}-${x.d}`, ssG: x.ssG, hour: null }));
  return `<section class="card plans"><div class="sectitle"><h3>${t('我的计划 · 示例')}</h3><button type="button" class="btn sm primary" data-pick-open>${t('＋ 挑个日子')}</button></div>`
    + `<p class="pempty">${t('要汇报、面试、搬家、谈合作？写下这件事，按你的出生信息在未来 3 个月里挑出合适的日子和时段，定下后会出现在月历和那天的「今天」里。')}</p>`
    + (sample.length ? `<div class="plist demo">${sample.map((p) => planRow(p).replace('data-plan="0"', `data-demo-tip="${t('为自己挑日子')}"`).replace(/<span class="cd[^"]*">[^<]*<\/span>/, `<span class="cd">${t('示例')}</span>`)).join('')}</div>` : '') + '</section>';
}
function picksHtml(days) {
  const cats = [
    [t('汇报·见领导'), (x) => (x.ssG === '正官' || x.ssG === '正印') && x.level.k >= 4],
    [t('谈钱·谈合作'), (x) => (x.ssG === '正财' || x.ssG === '偏财') && x.level.k >= 4],
    [t('表达·创作'), (x) => (x.ssG === '食神' || x.ssG === '伤官') && x.level.k >= 4],
    [t('整体最顺'), (x) => x.level.k === 5],
    [t('适合休息'), (x) => x.level.k <= 1 || x.chongDay],
  ];
  // 只看今天以后的日子，每类最多 3 个；整个月都过去了就不显示
  const now = new Date(), past = (x) => new Date(x.y, x.m - 1, x.d) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ahead = days.filter((x) => !past(x));
  if (!ahead.length) return '';
  const rows = cats.map(([k, f]) => [k, ahead.filter(f).slice(0, 3)]).filter(([, hit]) => hit.length);
  if (!rows.length) return '';
  return `<section class="card"><div class="sectitle"><h3>${isCurMonth() ? t('本月接下来') : t('本月精选')}</h3></div><div class="picks">`
    + rows.map(([k, hit]) => `<div class="pick"><span class="k">${k}</span><span class="chips">${hit.map((x) => `<button type="button" class="chip" data-d="${x.d}">${dOf(x)} ${isPro() ? x.gz : wkOf(x.y, x.m, x.d)}</button>`).join('')}</span></div>`).join('') + '</div></section>';
}

export function renderCalendar() {
  const v = $('#view');
  document.body.classList.toggle('pro', isPro());
  let h = '';
  if (isDemo()) h += `<div class="notice demo"><p>${t('这是示例（小满）的日历。')}</p><a class="btn sm primary" href="#/start">${t('测测我的')}</a></div>`;
  const bar = `<div class="monthbar"><button class="nav" type="button" data-month="-1" aria-label="${t('上个月')}">‹</button><h2>${EN ? `${MON_EN[S.m - 1]} ${S.y}` : ymLabel(S.y, S.m)} <button type="button" class="legendq" data-legend aria-label="${t('图例说明')}">?</button></h2><button type="button" class="yitog" data-cal-yi aria-pressed="${yiOn()}" title="${t('在格子里显示黄历的宜')}">${t('黄历')}</button><button class="nav" type="button" data-month="1" aria-label="${t('下个月')}">›</button></div>`;
  if (S.calLocked) h += `<section class="card">${bar}<div class="lock" style="min-height:360px"><div class="ghost" aria-hidden="true">${'<i></i>'.repeat(35)}</div><div class="pw"><h2>${S.calLocked.access.expired ? t('会员已到期') : t('免费体验已用完')}</h2><p>${t('开通会员后可以看整月日历、挑日子。')}</p><button type="button" class="btn primary block" data-pay>${t('开通 ¥{p}/月', { p: (S.priceCents / 100).toFixed(1) })}</button></div></div></section>`;
  else if (S.calErr) h += `<div class="errbox"><p>${esc(S.calErr)}</p><button class="btn ghost" type="button" data-reload>${t('重新加载')}</button></div>`;
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
  return `<div class="ph2"><span>${dayLabel(x)}</span></div>` + dayDetailHtml(x, S.cal.chart, S.cal.name, S.cal.plans);
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
  const title = themeMonth(ss);
  const good = days.filter((x) => x.level.k >= 4), low = days.filter((x) => x.level.k <= 2);
  const mw = gwx(mg[0]), helps = C.xi.includes(mw);
  const cnt = {}; good.forEach((x) => { const a = actOf(x); cnt[a] = (cnt[a] || 0) + 1; });
  const topAct = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2);
  const best = days.slice().sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.d - b.d);
  const sps = []; days.forEach((x) => specials(x, C).forEach((z) => { if (z.k !== 'gr') sps.push(`${dOf(x)}${EN ? ' ' : ''}${z.t}`); }));
  const grs = days.filter((x) => specials(x, C).some((z) => z.k === 'gr')).map(dOf);
  const head = EN ? MON_EN[S.m - 1] : t('{m} 月开篇', { m: S.m });
  return `<section class="opening"><span class="ok">${head} · ${THEME[ss][1]}</span><h2>${nm ? t('{n}，这是你的「{t}」', { n: esc(nm), t: title }) : t('这是你的「{t}」', { t: title })}</h2>`
    + `<p>${t('这个月的大环境是{wx}能量，', { wx: t(WX[mw]) })}${helps ? t('正好补你所需，整体顺风') : t('对你偏消耗，节奏放慢一点更好')}${t('。你有 {n} 天顺利日', { n: EN ? `<b>${good.length}</b> good day${good.length === 1 ? '' : 's'}` : `<b>${good.length}</b>` })}${topAct.length ? t('，最适合{a}', { a: topAct.map((a) => t('「{a}」', { a })).join(t('和')) }) : ''}${t('；有 {n} 天要留神，重要的事尽量别排在那几天。', { n: EN ? `<b>${low.length}</b> day${low.length === 1 ? '' : 's'}` : `<b>${low.length}</b>` })}</p>`
    + `<div class="ogrid"><div><span>${t('本月你的高光日')}</span>${best.map((x) => `<button type="button" class="chip" data-d="${x.d}">${dOf(x)} ${actOf(x)}</button>`).join('')}</div>`
    + (grs.length ? `<div><span>${t('贵人日 · 适合求助和见人')}</span><b>${grs.join(sep)}</b></div>` : '')
    + (sps.length ? `<div><span>${t('你的特殊日子')}</span><b>${sps.join(sep)}</b></div>` : '') + '</div></section>';
}
function legendHtml() {
  const pro = isPro(), lv = pro ? [t('大吉'), t('吉'), t('平'), t('小心'), t('凶')] : [t('很顺'), t('顺利'), t('平稳'), t('留神'), t('低调')];
  return `<div class="legend" style="font-size:13px;gap:10px 16px">${[5, 4, 3, 2, 1].map((k, i) => `<span><i style="background:var(--l${k}bg)${k === 5 ? ';outline:1px solid var(--l5)' : ''}"></i>${lv[i]}</span>`).join('')}</div>`
    + (pro ? `<p class="note" style="margin:0">${t('格内依次是：日期、农历或节气、日柱、日干十神·吉凶。')}</p>`
      : `<div class="legend" style="font-size:13px;gap:10px 16px"><span><i class="dot gr"></i>${t('贵人日')}</span><span><i class="dot cg"></i>${t('本命冲')}</span><span><i style="background:var(--glow)"></i>${t('生日 · 本命日 · 你的计划')}</span></div><div class="legend" style="font-size:13px;gap:10px 16px"><span><span class="mstk lg" aria-hidden="true"><i style="--pl:#F6E4C8;--pd:#4A3C2A;--r:-6deg;--k:0"></i></span>${t('右上角的小纸片是那天贴的心情，点开那天能看到')}</span></div><p class="note" style="margin:0">${t('格内依次是：阳历日期、农历 / 节气 / 节日、这天适合的行动。')}</p>`)
    + `<p class="note" style="margin:0">${t('颜色越暖，这一天对你越顺。')}<a href="#/about?s=algo" data-close-sheet>${t('了解怎么算的')}</a></p>`;
}

const reload = () => loadMonth().then(() => { if (currentPath() === '/calendar') renderCalendar(); });
onClick('[data-legend]', () => openSheet(t('图例'), legendHtml()));
onClick('[data-opening]', () => openSheet(EN ? t('{m} at a glance', { m: MON_EN[S.m - 1] }) : t('{m} 月解读', { m: S.m }), openingHtml(S.cal.days, S.cal.chart)));
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
const RANGES = [['month', t('本月')], ['1m', t('未来 1 个月')], ['3m', t('3 个月')]];
export function openPicker(init = {}) {
  pick = { name: init.name || '', type: init.type || '', range: init.range || '1m', editId: init.editId || null, result: null };
  track('pick_open', { from: init.from || 'calendar' });
  openSheet(pick.editId ? t('改个日子') : t('挑个日子'), '', { wide: true, onClose: () => { pick = null; } });
  renderPickForm();
}
function pickBody() { return $('#sheet .sbody'); }
function renderPickForm() {
  const types = S.planTypes || [];
  pickBody().innerHTML = '<form class="form pickf" id="pickForm" novalidate>'
    + `<label class="field"><span>${t('要做什么')}</span><input name="name" maxlength="20" placeholder="${t('比如：和客户谈续约（可以不写）')}" value="${esc(pick.name)}" enterkeyhint="done"></label>`
    + `<div class="field"><span>${t('是哪类事')}</span><div class="types" role="group" aria-label="${t('事情类型')}">${types.map((ty) => `<button type="button" data-ptype="${esc(ty.name)}" aria-pressed="${ty.name === pick.type}"><i>${esc(EN ? (ty.label || t(ty.name)).replace(/^(A|An|The) /, '')[0].toUpperCase() : ty.char)}</i>${esc(ty.label || t(ty.name))}</button>`).join('')}</div></div>`
    + `<div class="field"><span>${t('在什么时间范围')}</span><span class="segs" role="group" aria-label="${t('时间范围')}">${RANGES.map(([k, l]) => `<button type="button" data-prange="${k}" aria-pressed="${k === pick.range}">${l}</button>`).join('')}</span></div>`
    + `<div class="err" id="pickErr"></div><button class="btn primary block" type="submit">${t('帮我挑')}</button></form>`;
}
function reasonOf(p, type) {
  const pro = isPro(), parts = [];
  const name = pro ? t('{ss}日', { ss: t(p.ssG) }) : THEME[p.ssG][0];
  parts.push(p.fit ? t('{name}，{desc}', { name, desc: THEME_DESC[p.ssG] }) + (type ? t('，正适合{type}', { type: lc(typeLabel(type)) }) : '') : t('{name}，整体{lv}', { name, lv: t(p.level.p) }));
  if (p.yiHits.length) parts.push(t('黄历宜「{w}」', { w: p.yiHits.slice(0, 2).map((w) => t(w)).join(EN ? ', ' : ' ') }));
  if (p.tag) parts.push(pro ? t('逢{tag}', { tag: t(p.tag) }) : { 桃花: t('人缘旺'), 驿马: t('利出行') }[p.tag]);
  if (p.guiren) parts.push(pro ? t('天乙贵人') : t('贵人日，容易得到帮助'));
  return parts.join(t('；'));
}
const RANGE_TEXT = { month: t('本月剩下的日子'), '1m': t('未来 1 个月'), '3m': t('未来 3 个月') };
function exclText(e) {
  const parts = [];
  const words = e.jiWords.filter((w) => w !== '诸事不宜').slice(0, 2).map((w) => t(w));
  if (e.ji) parts.push(words.length ? t('{n} 个黄历不宜「{w}」的日子', { n: days(e.ji), w: words.join(EN ? ', ' : ' ') }) : t('{n} 个黄历「诸事不宜」的日子', { n: days(e.ji) }));
  if (e.po) parts.push(t('{n} 个月破或岁破日', { n: days(e.po, 'month- or year-breaker ') }));
  if (e.chong) parts.push(t('{n} 个和你本命相冲的日子', { n: days(e.chong) }));
  return parts.length ? t('已经帮你排除了{x}。', { x: parts.join(sep) }) : '';
}
function renderPickResult() {
  const r = pick.result, nm = pick.name || typeLabel(pick.type);
  let h = `<div class="pickhead"><button type="button" class="tbtn" data-pick-back="form">${t('‹ 改条件')}</button><b>${t('为「{n}」挑了 {k} 天', { n: esc(nm), k: days(r.picks.length) })}</b><small>${RANGE_TEXT[r.range]} · ${t('{type}类', { type: esc(typeLabel(r.type)) })} · ${t('按适不适合这件事排')}</small></div>`;
  if (!r.picks.length) {
    h += `<div class="pempty">${t('{r}里没有合适的日子。', { r: lc(RANGE_TEXT[r.range]) })}${exclText(r.excluded)}</div>`
      + (r.range !== '3m' ? `<button type="button" class="btn primary block" data-pick-wider>${t('放宽到 3 个月')}</button>` : '');
  } else {
    h += '<div class="pick3">' + r.picks.map((p, i) => {
      const [y, m, d] = [p.y, p.m, p.d];
      return `<div class="pc"><div class="dt"><b>${d}</b><small>${EN ? `${MON_EN[m - 1]} · ${wkOf(y, m, d)}` : t('{m}月 {w}', { m, w: wkOf(y, m, d) })}</small></div><div class="bd">`
        + `<div class="ttl">${THEME[p.ssG][0]} · ${t(p.level.p)}${i === 0 ? ` <span class="rk">${t('最合适')}</span>` : p.fit ? ` <span class="rk soft">${t('也合适')}</span>` : ''}</div>`
        + `<div class="rs">${esc(reasonOf(p, r.type))}</div>`
        + (p.hours.length ? `<div class="tm">${t('最好 {h}', { h: `<b>${hhShort(p.hours[0])}</b>` })}${p.hours[1] != null ? t('，其次 {h}', { h: hhShort(p.hours[1]) }) : ''}</div>` : '')
        + `<div class="ac"><button type="button" class="btn ${i === 0 ? 'primary' : 'ghost'}" data-pick-pin="${i}">${t('定这天')}</button><button type="button" class="btn ghost" data-pick-day="${i}">${t('看详情')}</button></div></div></div>`;
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
    body.innerHTML = `<div class="pickcta"><b>${t('挑日子要按你的出生信息算')}</b><p>${t('先测测你的能量卡，不用注册，一分钟就好。保存之后就能为「{n}」挑日子了。', { n: esc(pick.name || typeLabel(pick.type)) })}</p><a class="btn primary block" href="#/start" data-close-sheet>${t('测测我的')}</a></div>`;
    return;
  }
  body.innerHTML = '<div class="pickwait"><div class="sk" style="height:96px"></div><div class="sk" style="height:96px"></div><div class="sk" style="height:96px"></div></div>';
  api('POST', 'pick', { type: pick.type, range: pick.range, today: localToday() }).then((d) => {
    if (!pick) return;
    pick.result = d;
    track('pick_create', { type: pick.type, range: pick.range, n: d.picks.length });
    renderPickResult();
  }, (e) => { if (!pick) return; if (e.status === 402) { dismissSheet(); toast(t('开通会员后就能挑日子')); return; } renderPickForm(); $('#pickErr').textContent = e.message; });
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'pickForm') return;
  e.preventDefault();
  pick.name = e.target.elements.name.value.trim();
  if (!pick.type) { $('#pickErr').textContent = t('选一下是哪类事'); return; }
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
    toast(t('定下了：{d}', { d: mdLabel(p.m, p.d) + (p.hours[0] != null ? ' ' + hhShort(p.hours[0]) : '') }));
    S.today = null; S.cal = null;
    dismissSheet();
    if (currentPath() === '/calendar') { renderCalendar(); reload(); }
  }, (e) => { el.disabled = false; toast(e.message); });
});
// 看详情：在同一个弹层里看那天，可以再回到推荐结果
function reopenResult() { $('#sheet .sh b').textContent = pick.editId ? t('改个日子') : t('挑个日子'); renderPickResult(); }
function monthData(y, m) {
  if (S.cal && S.cal.y === y && S.cal.m === m) return Promise.resolve(S.cal);
  return api('GET', `calendar?y=${y}&m=${m}&today=${localToday()}`);
}
onClick('[data-pick-day]', (el) => {
  const p = pick.result.picks[+el.getAttribute('data-pick-day')];
  if (isDesk() && currentPath() === '/calendar' && S.cal && S.cal.y === p.y && S.cal.m === p.m) { dismissSheet(); selectDay(p.d); return; }
  monthData(p.y, p.m).then((c) => {
    if (!pick || !$('#sheet')) return;
    $('#sheet .sh b').textContent = dayLabel(c.days[p.d - 1]);
    pickBody().innerHTML = `<button type="button" class="tbtn backres" data-pick-back="result">${t('‹ 回到推荐的日子')}</button>` + dayDetailHtml(c.days[p.d - 1], c.chart, c.name, c.plans);
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
  openSheet(planName(p.name), `<div class="plandet"><div class="pdate"><b>${mdLabel(m, d)} ${wkOf(y, m, d)}</b><span>${[p.hour != null ? hhShort(p.hour) : '', p.ssG ? `${THEME[p.ssG][0]} · ${t(p.level.p)} ${p.score}` : '', cdText(n)].filter(Boolean).join(' · ')}</span></div>`
    + `<p class="pwhy">${esc(p.reason || (p.ssG ? t('{name}，整体{lv}', { name: THEME[p.ssG][0], lv: t(p.level.p) }) : ''))}</p>`
    + `<div class="acts3"><button type="button" class="btn ghost" data-plan-day="${p.id}">${t('看那天')}</button><button type="button" class="btn ghost" data-plan-repick="${p.id}">${t('改日子')}</button><button type="button" class="btn ghost danger" data-plan-del="${p.id}">${t('删除')}</button></div></div>`);
});
onClick('[data-plan-day]', (el) => {
  const p = planById(+el.getAttribute('data-plan-day')), [y, m, d] = p.date.split('-').map(Number);
  monthData(y, m).then((c) => openDay(c.days[d - 1], c.chart, c.name, c.plans), (e) => toast(e.message));
});
onClick('[data-plan-repick]', (el) => { const p = planById(+el.getAttribute('data-plan-repick')); openPicker({ name: p.name, type: p.type, editId: p.id, from: 'plan' }); });
onClick('[data-plan-del]', (el) => {
  if (!confirm(t('删除这个计划？'))) return;
  api('DELETE', 'plans/' + el.getAttribute('data-plan-del'), {}).then(() => { S.today = null; dismissSheet(); reload(); }, (e) => toast(e.message));
});
