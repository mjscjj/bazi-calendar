// 我的一甲子：每一天也有自己的日柱，60 天一轮。每天打开流日历，就收下当天那张画；集满 60 张送一枚御守（转运页直接领）。
import { pillarArtSrc } from './data.js';
import { $, esc, api, toast, openSheet, onClick, localToday, ymd, track, currentPath } from './core.js';
import { footHtml } from './today.js';

const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
const JIAZI = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);
let J = null;
const md = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${m}月${d}日`; };
// 某个日柱下一次是哪天（今天之后）
function nextDay(gz) {
  const k = (JIAZI.indexOf(gz) - JIAZI.indexOf(J.today) + 60) % 60;
  const [y, m, d] = localToday().split('-').map(Number);
  return ymd(new Date(y, m - 1, d + k));
}

export function pageJiazi() {
  const v = $('#view');
  const head = '<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>我的一甲子</h1></div>';
  v.innerHTML = head + '<div class="sk" style="height:520px"></div>';
  api('GET', 'jiazi').then((d) => {
    if (currentPath() !== '/jiazi') return;
    J = { ...d, got: new Map(d.list.map((x) => [x.gz, x.day])) };
    track('jiazi_open', { n: d.n });
    const cells = JIAZI.map((gz) => {
      const day = J.got.get(gz), a = d.arts[gz], now = gz === d.today ? ' now' : '';
      return day
        ? `<button type="button" class="jz got${now}" data-jz="${gz}" aria-label="${gz}日 ${esc(a.name)}，${md(day)}收下"><img src="${esc(pillarArtSrc(a.art))}" alt="" loading="lazy" width="600" height="600"><i>${gz}</i></button>`
        : `<button type="button" class="jz${now}" data-jz="${gz}" aria-label="${gz}日，还没收到"><span>${gz}</span></button>`;
    }).join('');
    v.innerHTML = head + `<section class="card jzhead"><div class="jzn"><b>${d.n}</b><span>/ 60</span></div>`
      + `<div class="jzbar" aria-hidden="true"><i style="width:${Math.round((d.n / 60) * 100)}%"></i></div>`
      + `<p>${d.done ? `已经集满一轮。送你一枚御守，${d.member ? '' : '开通会员后'}在「转运」的「直接买一枚」里免费领。` : '每一天也有自己的天干地支，60 天一轮。每天打开流日历，就收下当天的那张画；集满 60 张，送你一枚御守。'}</p></section>`
      + `<div class="jzgrid">${cells}</div>` + footHtml();
  }, (e) => { v.innerHTML = head + `<div class="errbox"><p>${esc(e.message)}</p></div>`; });
}

onClick('[data-jz]', (el) => {
  if (!J) return;
  const gz = el.getAttribute('data-jz'), day = J.got.get(gz), a = J.arts[gz];
  if (!day) {
    const nx = nextDay(gz);
    toast(gz === J.today ? '今天这张还没收：回到今天页打开一下就收下了' : `还没收到。下一个${gz}日是 ${md(nx)}，那天打开就能收下`);
    return;
  }
  openSheet(`${gz}日 · ${a.name}`, `<div class="artsheet"><img class="big" src="${esc(pillarArtSrc(a.art))}" alt=""><p class="note" style="margin:0;text-align:center">${md(day)}收下</p></div>`);
});
