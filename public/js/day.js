// 某一天的详情弹层：大家的这一天、你的这一天、宜忌、为什么、十二时辰。今天页和日历页共用。
import { esc, openSheet } from './core.js';
import { ADVICE, THEME, THEME_DESC, HOUR_TIP, gzHtml, actOf, weekday, specials, dosDonts, bestHours, hhmm } from './data.js';
import { S, isPro } from './state.js';
import { stickerHtml, kitOf } from './mood.js';

// 那天你自己打的分（日历这个月的，或者今天的）
const RATE_WORD = ['', '很糟', '不太顺', '一般', '挺顺', '很好'];
function ratingOf(x) {
  if (S.cal && S.cal.y === x.y && S.cal.m === x.m && S.cal.ratings) { const r = S.cal.ratings.find((z) => z.d === x.d); if (r) return r; }
  const t = S.today;
  if (t && t.day.y === x.y && t.day.m === x.m && t.day.d === x.d && t.rate && t.rate.today) return { score: t.rate.today, note: t.rate.note };
  return null;
}

// 那天贴的心情便签
function moodsOf(x) {
  const t = S.today;
  if (t && t.day.y === x.y && t.day.m === x.m && t.day.d === x.d && t.moods) return t.moods;
  if (S.cal && S.cal.y === x.y && S.cal.m === x.m && S.cal.moods) return S.cal.moods.filter((m) => m.d === x.d);
  return [];
}

export function dayDetailHtml(x, chart, name, plans) {
  const pro = isPro(), lun = x.lunar, wk = weekday(x);
  const { dos, donts } = dosDonts(x, pro);
  const { top, worst, worstWhy } = bestHours(x);
  let h = '';
  if (!pro) {
    h += `<div class="calrow"><div class="bigd">${x.d}</div><div class="daymeta"><span class="t">${x.y}年${x.m}月${x.d}日 星期${wk}</span><span class="muted">农历${lun.monthCn}月${lun.dayCn}${lun.jieqi ? ' · ' + lun.jieqi : ''}${lun.festival ? ' · ' + lun.festival : ''}</span><span class="muted" style="font-size:12px">通用黄历 宜 ${(lun.yi || []).slice(0, 4).join(' ')} ｜ 忌 ${(lun.ji || []).slice(0, 3).join(' ')}</span></div></div>`;
    const sp = specials(x, chart), pl = (plans || []).filter((p) => p.date === `${x.y}-${x.m}-${x.d}`);
    if (sp.length || pl.length) h += `<div class="spbar">${sp.map((z) => `<span class="sp ${z.k}">${z.t}</span>`).join('')}${pl.map((p) => `<span class="sp pl">计划：${esc(p.name)}</span>`).join('')}</div>`;
    const ms = moodsOf(x), kit = kitOf();
    const rt = ms.length ? null : ratingOf(x);
    if (ms.length && kit) h += `<div class="mymoods"><b>那天的记录</b><div class="board sm">${ms.map((m) => stickerHtml(m, kit)).join('')}</div></div>`;
    if (rt) h += `<div class="myrate"><i class="rmark r${rt.score >= 4 ? 'hi' : rt.score === 3 ? 'mid' : 'lo'}"></i>你那天打了 <b>${rt.score} 分 · ${RATE_WORD[rt.score]}</b>${rt.note ? `：「${esc(rt.note)}」` : ''}</div>`;
    h += `<div class="mylayer k${x.level.k}"><div class="mlhead"><span class="mltitle">${name ? esc(name) + '，' : ''}这天${actOf(x)}</span><span class="lvpill k${x.level.k}">${x.level.p} · 能量 ${x.score}</span></div><span class="muted" style="font-size:12.5px">${THEME[x.ssG][0]}（${THEME[x.ssG][1]}）：${THEME_DESC[x.ssG]}</span>`
      + `<div class="slots">${top.map((t, i) => `<div class="slot"><b>${i === 0 ? '最佳时段' : '次佳时段'}</b><span class="tt">${hhmm(t.i)}</span><span>${HOUR_TIP[t.ss]}</span></div>`).join('')}`
      + (worst && worst.level.k <= 3 ? `<div class="slot bad"><b>尽量避开</b><span class="tt">${hhmm(worst.i)}</span><span>${worstWhy}</span></div>` : '') + '</div></div>';
  } else {
    h += `<div class="dayhead"><div class="daygz">${gzHtml(x.gz)}</div><div class="daymeta"><span class="t">${x.m}月${x.d}日 周${wk}</span><span class="muted" style="font-size:12px">农历${lun.monthCn}月${lun.dayCn} · ${x.mgz}月 · ${x.ssG}日（支藏${x.ssZ}）</span><span class="lvpill k${x.level.k}">${x.level.n} · ${x.score}分</span></div></div>`;
  }
  h += `<div class="headline">${x.chongDay ? (pro ? '日支冲自身，' : '这天和你的本命能量相冲，') + '情绪和关系易起波动。' : ''}${ADVICE[x.ssG].h}</div>`;
  if (x.tags.length) h += `<div>${x.tags.map((t) => `<span class="tag">${pro ? t : { 桃花: '人缘旺', 驿马: '利出行' }[t]}</span>`).join('')}</div>`;
  h += `<div class="dos"><div><b style="color:var(--l5)">适合</b><ul>${dos.map((s) => `<li>${s}</li>`).join('')}</ul></div><div><b style="color:var(--l2)">少做</b><ul>${donts.map((s) => `<li>${s}</li>`).join('')}</ul></div></div>`;
  h += (pro ? '<div>' : '<details><summary>为什么这么建议</summary><div style="margin-top:6px">')
    + `<ul class="why"><li><span class="v">60</span><span class="muted">${pro ? '基础分' : '每天的起点'}</span></li>${x.why.map((w) => `<li><span class="v ${w.v > 0 ? 'p' : 'n'}">${w.v > 0 ? '+' : '−'}${Math.abs(w.v)}</span><span>${w.p}${pro ? `<span class="tech">${w.t}</span>` : ''}</span></li>`).join('')}</ul></div>${pro ? '' : '</details>'}`;
  if (pro) h += `<details><summary>当天通用黄历宜忌（与个人无关）</summary><p><b>宜</b> ${(lun.yi || []).join(' ')}</p><p><b>忌</b> ${(lun.ji || []).join(' ')}</p></details>`;
  const t = new Date(), isToday = t.getFullYear() === x.y && t.getMonth() + 1 === x.m && t.getDate() === x.d;
  const curIdx = Math.floor(((t.getHours() + 1) % 24) / 2);
  h += `<section class="card"><h3>${pro ? '十二时辰' : '行动时间表'}</h3><div class="hours${pro ? '' : ' simple'}">${(x.hours || []).map((u) => {
    let tip = u.night ? '休息为主' : HOUR_TIP[u.ss];
    if (!u.night && u.level.k <= 2) tip = '能量偏低，安排例行小事';
    const bad = u.why.filter((w) => w.v <= -10 && /冲/.test(w.t)).map((w) => (pro ? w.t : w.p))[0];
    const now = isToday && u.i === curIdx ? ' now' : '';
    const bar = `<span class="bar"><i class="k${u.level.k}" style="width:${u.score}%"></i></span>`;
    if (!pro) return `<div class="hr${now}"><span class="tm2">${hhmm(u.i).replace('–', '<small>至 ')}</small></span><span class="bd">${bar}<span class="tx"><em style="color:var(--l${u.level.k})">${u.level.p}</em>${THEME[u.ss][0].replace('日', '')} · ${tip}${bad ? ` <span class="muted">（${bad}）</span>` : ''}</span></span></div>`;
    return `<div class="hr${now}"><span class="tm"><b>${u.name}</b>${u.range}</span><span class="hz">${gzHtml(u.gz)}</span><span class="bd">${bar}<span class="tx"><em style="color:var(--l${u.level.k})">${u.level.n}</em>${u.ss} · ${tip}${bad ? ` <span class="muted">（${bad}）</span>` : ''}</span></span></div>`;
  }).join('')}</div></section>`;
  return h;
}

export function openDay(x, chart, name, plans) {
  openSheet(`${x.m}月${x.d}日`, dayDetailHtml(x, chart, name, plans));
}
