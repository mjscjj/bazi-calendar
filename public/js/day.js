// 某一天的详情弹层：大家的这一天、你的这一天、宜忌、为什么、十二时辰。今天页和日历页共用。
import { $$, esc, openSheet, onClick, localToday, ymd } from './core.js';
import { EN } from './i18n.js';
import { ADVICE, THEME, THEME_DESC, HOUR_TIP, gzHtml, specials, dosDonts, bestHours, hhmm, wkName, ymdLabel, mdLabel, lunarText, themeShort } from './data.js';
import { S, isPro } from './state.js';
import { stickerHtml, kitOf } from './mood.js';
import { tm } from './i18n.js';
const t = tm('calendar'); // 先查 i18n/en/calendar.json

// 那天你自己打的分（日历这个月的，或者今天的）
const RATE_WORD = ['', t('很糟'), t('不太顺'), t('一般'), t('挺顺'), t('很好')];
function ratingOf(x) {
  if (S.cal && S.cal.y === x.y && S.cal.m === x.m && S.cal.ratings) { const r = S.cal.ratings.find((z) => z.d === x.d); if (r) return r; }
  const td = S.today;
  if (td && td.day.y === x.y && td.day.m === x.m && td.day.d === x.d && td.rate && td.rate.today) return { score: td.rate.today, note: td.rate.note };
  return null;
}

// 那天贴的心情便签
function moodsOf(x) {
  const td = S.today;
  if (td && td.day.y === x.y && td.day.m === x.m && td.day.d === x.d && td.moods) return td.moods;
  if (S.cal && S.cal.y === x.y && S.cal.m === x.m && S.cal.moods) return S.cal.moods.filter((m) => m.d === x.d);
  return [];
}

// 2026年11月26日 周四 / Thu, Nov 26, 2026（左边那列很窄：英文的「忌」也用 Skip）
const wkOf = (x) => wkName(new Date(x.y, x.m - 1, x.d).getDay());
export const dayLabel = x => t('{date} {w}', { date: ymdLabel(x.y, x.m, x.d), w: wkOf(x) });

export function dayDetailHtml(x, chart, name, plans) {
  const pro = isPro(), lun = x.lunar;
  const { dos, donts } = dosDonts(x, pro);
  const date = ymd(new Date(x.y, x.m - 1, x.d));
  const dayPlans = (plans || []).filter(p => p.date === date || p.date === `${x.y}-${x.m}-${x.d}`);
  const special = specials(x, chart);
  const birthdays = special.filter(z => z.k === 'bd').map(z => z.t);
  const lunar = [lunarText(lun), lun.jieqi && t(lun.jieqi), lun.festival && t(lun.festival), ...birthdays].filter(Boolean).join(' · ');
  const ms = moodsOf(x), kit = kitOf(), rt = ms.length ? null : ratingOf(x);
  const rest = x.level.k <= 1; // 低调日：这天宜休整
  const [theme, englishTheme] = THEME[x.ssG];
  const why = `<ul class="why"><li><span class="v">60</span><span>${t('基础分')}</span></li>${x.why.map(w => `<li><span class="v ${w.v > 0 ? 'p' : 'n'}">${w.v > 0 ? '+' : '−'}${Math.abs(w.v)}</span><span>${esc(w.p)}${pro ? `<span class="tech">${esc(w.t)}</span>` : ''}</span></li>`).join('')}</ul>`;
  const reasons = [...special.filter(z => z.k !== 'bd').map(z => z.t), ...x.tags.map(g => (pro ? t(g) : ({ 桃花: t('人缘旺'), 驿马: t('利出行') }[g] || t(g))))];
  const rows = (yes, no, y, n) => `<dl class="detail-rows"><div><dt>${y}</dt><dd>${yes.map(esc).join(' · ') || '—'}</dd></div><div><dt>${n}</dt><dd>${no.map(esc).join(' · ') || '—'}</dd></div></dl>`;
  const schedule = `<details class="day-fold"><summary>${t('查看完整时段')}</summary>${hourHighlightsHtml(x)}${hourTableHtml(x, pro)}</details>`;
  return `<article class="calendar-day"><header class="detail-intro"><span class="detail-meta">${esc(lunar)}${pro ? ` · ${t('{gz}日', { gz: gzHtml(x.gz) })} · ${t('{gz}月', { gz: esc(x.mgz) })} · ${t('{a}（支藏{b}）', { a: esc(t(x.ssG)), b: esc(t(x.ssZ)) })}` : ''}</span>`
    + `<div class="detail-theme"><h2>${theme}</h2><span class="detail-score"><i class="lv k${x.level.k}" aria-hidden="true"></i>${t('{lv} · 能量 {s}', { lv: t(pro ? x.level.n : x.level.p), s: x.score })}</span></div>`
    + `<p>${rest ? t('这天宜休整。') : ''}${esc(ADVICE[x.ssG].h)}</p></header>`
    + `<section class="detail-advice"><h3>${name ? t('{n}的日历建议', { n: esc(name) }) : t('我的日历建议')}</h3>${rows(dos, donts, t('适合'), t('少做'))}</section>`
    + timelineHtml(x, date === localToday(), schedule)
    + (dayPlans.length ? `<section class="detail-plans"><h3>${t('当天计划')}</h3>${dayPlans.map(p => `<p>${esc(((S.planTypes || []).find((x) => x.name === p.name) || {}).label || t(p.name))}</p>`).join('')}</section>` : '')
    + (ms.length && kit ? `<section class="mymoods"><h3>${t('当天记录')}</h3><div class="board sm">${ms.map(m => stickerHtml(m, kit)).join('')}</div></section>` : '')
    + (rt ? `<p class="myrate">${t('我的评分 · {s} 分 · {w}', { s: rt.score, w: RATE_WORD[rt.score] })}${rt.note ? ' · ' + esc(rt.note) : ''}</p>` : '')
    + `<div class="detail-reference"><details class="day-fold"><summary>${t('为什么这么建议')}</summary><p>${EN ? theme : `${theme}（${englishTheme}）`} · ${THEME_DESC[x.ssG]}</p>${reasons.length ? `<p>${reasons.map(esc).join(' · ')}</p>` : ''}${x.chongDay ? `<p>${t('这天和你的本命能量相冲，情绪和关系易起波动。')}</p>` : ''}${why}</details>`
    + `<details class="day-fold"><summary>${t('公共黄历')}</summary>${rows((lun.yi || []).map((w) => t(w)), (lun.ji || []).map((w) => t(w)), t('宜'), EN ? t('少做') : t('忌'))}</details></div></article>`;
}

// 白天用两小时一格的横轴，全天时段在详情里。
const HOUR_START = 7 * 60, HOUR_END = 23 * 60;
const hourStart = (u) => (u.i * 2 + 23) % 24 * 60;
const inDaylight = (mins) => mins >= HOUR_START && mins < HOUR_END;
const hourPosition = (mins) => `${(mins - HOUR_START) / (HOUR_END - HOUR_START) * 100}%`;
const clockMinutes = () => { const t = new Date(); return t.getHours() * 60 + t.getMinutes(); };
const hourCap = (u) => `<b>${hhmm(u.i)}</b> · ${HOUR_TIP[u.ss] || t(u.level.p)} · ${t(u.level.p)} ${u.score}`;
setInterval(() => {
  const markers = $$('.hour-now');
  if (!markers.length) return;
  const mins = clockMinutes();
  for (const marker of markers) {
    marker.hidden = !inDaylight(mins);
    marker.style.setProperty('--now', hourPosition(mins));
  }
}, 60000);

export function timelineHtml(x, isToday, fullSchedule = '') {
  const hours = (x.hours || []).filter((u) => inDaylight(hourStart(u)));
  if (!hours.length) return '';
  const [best] = bestHours(x).top;
  const mins = clockMinutes();
  const segments = hours.map((u) => {
    const isBest = u.i === best?.i;
    return `<button type="button" class="hour-seg k${u.level.k}${isBest ? ' best' : ''}" data-hour="${u.i}" data-cap="${esc(hourCap(u))}" aria-pressed="false" aria-label="${hhmm(u.i)}${t('，')}${isBest ? t('最佳时段，') : ''}${t(u.level.p)}"></button>`;
  }).join('');
  return `<section class="today-hours" aria-label="${t('时段时间轴')}"><div class="hour-heading"><h2>${t('时段')}</h2>`
    + `<div class="hour-key"><span class="good">${t('顺利')}</span><span class="steady">${t('平稳')}</span><span class="caution">${t('留意')}</span></div></div>`
    + `<div class="hour-axis"><div class="hour-track" role="group" aria-label="${t('选择时段')}">${segments}</div>`
    + (isToday ? `<i class="hour-now" style="--now:${hourPosition(mins)}"${inDaylight(mins) ? '' : ' hidden'} aria-hidden="true"></i>` : '')
    + '</div><div class="hour-ticks" aria-hidden="true"><span>07:00</span><span>11:00</span><span>15:00</span><span>19:00</span><span>23:00</span></div>'
    + '<div class="hour-summary">'
    + (best ? `<span class="hour-best">${t('最佳时段')} <b>${hhmm(best.i)}</b></span>` : '')
    + (fullSchedule ? (best ? `<span>${HOUR_TIP[best.ss]}</span>` : '') : `<button type="button" class="more" data-today-detail>${t('查看时段详情')} <span aria-hidden="true">›</span></button>`) + '</div>'
    + '<p class="hcap" aria-live="polite"></p>' + fullSchedule + '</section>';
}

onClick('[data-hour]', (el) => {
  const timeline = el.closest('.today-hours');
  timeline.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  el.setAttribute('aria-pressed', 'true');
  timeline.querySelector('.hcap').innerHTML = el.dataset.cap;
});

function hourHighlightsHtml(x) {
  const { top, worst, worstWhy } = bestHours(x);
  return `<div class="slots">${top.map((h, i) => `<div class="slot"><b>${i === 0 ? t('最佳时段') : t('次佳时段')}</b><span class="tt">${hhmm(h.i)}</span><span>${HOUR_TIP[h.ss]}</span></div>`).join('')}`
    + (worst && worst.level.k <= 3 ? `<div class="slot bad"><b>${t('尽量避开')}</b><span class="tt">${hhmm(worst.i)}</span><span>${worstWhy}</span></div>` : '') + '</div>';
}

function hourTableHtml(x, pro) {
  const now = new Date(), isToday = now.getFullYear() === x.y && now.getMonth() + 1 === x.m && now.getDate() === x.d;
  const curIdx = Math.floor(((now.getHours() + 1) % 24) / 2);
  return `<section class="card"><h3>${pro ? t('十二时辰') : t('行动时间表')}</h3><div class="hours${pro ? '' : ' simple'}">${(x.hours || []).map((u) => {
    let tip = u.night ? t('休息为主') : HOUR_TIP[u.ss];
    if (!u.night && u.level.k <= 2) tip = t('能量偏低，安排例行小事');
    const bad = u.why.filter((w) => w.v <= -10 && w.chong).map((w) => (pro ? w.t : w.p))[0];
    const cur = isToday && u.i === curIdx ? ' now' : '';
    const bar = `<span class="bar"><i class="k${u.level.k}" style="width:${u.score}%"></i></span>`;
    const badHtml = bad ? ` <span class="muted">${t('（{b}）', { b: bad })}</span>` : '';
    if (!pro) return `<div class="hr${cur}"><span class="tm2">${hhmm(u.i).replace('–', `<small>${t('至')} `)}</small></span><span class="bd">${bar}<span class="tx"><em style="color:var(--l${u.level.k})">${t(u.level.p)}</em>${themeShort(u.ss)} · ${tip}${badHtml}</span></span></div>`;
    return `<div class="hr${cur}"><span class="tm"><b>${t(u.name)}</b>${u.range}</span><span class="hz">${gzHtml(u.gz)}</span><span class="bd">${bar}<span class="tx"><em style="color:var(--l${u.level.k})">${t(u.level.n)}</em>${t(u.ss)} · ${tip}${badHtml}</span></span></div>`;
  }).join('')}</div></section>`;
}

export function openHours(x) {
  openSheet(t('{md} · 时段详情', { md: mdLabel(x.m, x.d) }), `<div class="hour-details">${hourHighlightsHtml(x)}${hourTableHtml(x, false)}</div>`);
}

export function openDay(x, chart, name, plans) {
  openSheet(dayLabel(x), dayDetailHtml(x, chart, name, plans));
}
