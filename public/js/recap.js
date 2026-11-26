// 月度回顾：这个月打开了几天、收了哪些画、记了什么心情、最顺的一天、最好的一支签、做了几件好事，可以生成一张分享图。
// 每月 1–7 号默认看上个月，之后看这个月（到今天为止）；可以往前翻到注册那个月。
import { pillarArtSrc } from './data.js';
import { $, esc, api, onClick, currentPath, isDarkNow, track, localToday } from './core.js';
import { S } from './state.js';
import { footHtml } from './today.js';
import { share } from './share.js';

const MCN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
export const monthCn = (m) => MCN[m - 1] + '月';
const shift = (month, k) => { const [y, m] = month.split('-').map(Number), t = new Date(y, m - 1 + k, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };

function statsHtml(d) {
  const items = [['打开', d.opened, '天'], ['收了', d.arts.length, '张画'], ['记了', d.notes, '条'], ['求成', d.lots, '支签'], ['做了', d.deeds, '件好事'], ['换了', d.amulets, '枚御守']];
  return `<div class="rcstats">${items.map(([a, n, b]) => `<div><small>${a}</small><b>${n}</b><small>${b}</small></div>`).join('')}</div>`;
}

export function pageRecap() {
  const v = $('#view'), q = new URLSearchParams(location.hash.split('?')[1] || '');
  const head = '<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>月度回顾</h1></div>';
  v.innerHTML = head + '<div class="sk" style="height:520px"></div>';
  api('GET', 'recap' + (q.get('month') ? '?month=' + q.get('month') : '')).then((d) => {
    if (currentPath() !== '/recap') return;
    S.recap = d;
    track('recap_open', { month: d.month, opened: d.opened });
    const dark = isDarkNow(), first = (S.me && S.me.createdAt || '').slice(0, 7);
    const prev = shift(d.month, -1), next = shift(d.month, 1), cur = localToday().slice(0, 7);
    const nav = `<div class="rcnav">${prev >= first ? `<a href="#/recap?month=${prev}">‹ ${monthCn(+prev.slice(5))}</a>` : '<span></span>'}`
      + `${next <= cur ? `<a href="#/recap?month=${next}">${monthCn(+next.slice(5))} ›</a>` : '<span></span>'}</div>`;
    const me = d.card && d.card.pillar;
    const hero = `<section class="rchero">${me ? `<img src="${esc(pillarArtSrc(me.art))}" alt="">` : ''}<div><small>${d.y} · ${d.inProgress ? '到今天为止' : '整月'}</small>`
      + `<b>${esc(d.name || '你')}的${monthCn(d.m)}</b><span>${d.opened ? `这个月打开了 ${d.opened} 天` : '这个月还没打开过'}</span></div></section>`;
    const wall = d.arts.length
      ? `<div class="rcwall">${d.arts.map((a) => `<figure><img src="${esc(pillarArtSrc(a.art))}" alt="" loading="lazy"><figcaption>${esc(a.gz)}</figcaption></figure>`).join('')}</div>`
      : '<p class="note" style="margin:0">这个月还没收到画。每天打开流日历，就收下当天的那张。</p>';
    const moods = d.moods.length
      ? `<div class="rcmoods">${d.moods.map((m) => `<span><i style="background:${dark ? m.dark : m.light}">${esc(m.char)}</i>${esc(m.word)} <b>× ${m.n}</b></span>`).join('')}</div>`
        + (d.match && d.match.rated ? `<p class="note" style="margin:0">有 ${d.match.rated} 天记了心情，其中 ${d.match.match} 天和系统的判断差不多。</p>` : '')
      : '<p class="note" style="margin:0">这个月还没记心情。今天页的「记一笔」可以随手记。</p>';
    const best = d.best ? `<div class="rcrow"><small>最顺的一天</small><b>${d.best.m}月${d.best.d}日 · ${esc(d.best.theme)}</b><span>${esc(d.best.level)} · 能量 ${d.best.score}</span></div>` : '';
    const lot = d.bestLot ? `<div class="rcrow"><small>最好的一支签</small><b>第 ${d.bestLot.no} 签 · ${esc(d.bestLot.title)}</b><span>${esc(d.bestLot.grade)} · ${esc(d.bestLot.keyword)}</span></div>` : '';
    v.innerHTML = head + nav + hero + statsHtml(d)
      + `<section class="card"><h3>这个月收的画</h3>${wall}</section>`
      + `<section class="card"><h3>这个月的心情</h3>${moods}</section>`
      + (best || lot ? `<section class="card rcbest">${best}${lot}</section>` : '')
      + (d.opened ? '<button type="button" class="btn primary block" data-recap-share>生成分享图</button>' : '') + footHtml();
  }, (e) => { v.innerHTML = head + `<div class="errbox"><p>${esc(e.message)}</p></div>`; });
}

onClick('[data-recap-share]', () => { if (S.recap) share('recap', S.recap); });
