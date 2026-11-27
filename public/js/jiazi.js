// 我的一甲子：每一天也有自己的日柱，60 天一轮。每天打开 flowday，就收下当天那张画；集满 60 张送一枚御守（转运页直接领）。
import { pillarArtSrc } from './data.js';
import { $, esc, api, toast, openSheet, onClick, localToday, ymd, track, currentPath, EN, MON } from './core.js';
import { footHtml } from './today.js';
import { tm } from './i18n.js';
const t = tm('rite'); // 先查 i18n/en/rite.json

const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
const JIAZI = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);
let J = null;
const md = (iso) => { const [, m, d] = iso.split('-').map(Number); return EN ? `${MON[m - 1]} ${d}` : `${m}月${d}日`; };
// 英文界面：干支写拼音（辛亥 → Xin Hai）
const PY_G = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui'], PY_Z = ['Zi', 'Chou', 'Yin', 'Mao', 'Chen', 'Si', 'Wu', 'Wei', 'Shen', 'You', 'Xu', 'Hai'];
const gzText = (gz) => (EN ? `${PY_G[GAN.indexOf(gz[0])]} ${PY_Z[ZHI.indexOf(gz[1])]}` : gz);
// 某个日柱下一次是哪天（今天之后）
function nextDay(gz) {
  const k = (JIAZI.indexOf(gz) - JIAZI.indexOf(J.today) + 60) % 60;
  const [y, m, d] = localToday().split('-').map(Number);
  return ymd(new Date(y, m - 1, d + k));
}

export function pageJiazi() {
  const v = $('#view');
  const head = `<div class="phead"><button type="button" class="back" data-back aria-label="${t('返回')}">‹</button><h1>${t('我的一甲子')}</h1></div>`;
  v.innerHTML = head + '<div class="sk" style="height:520px"></div>';
  api('GET', 'jiazi').then((d) => {
    if (currentPath() !== '/jiazi') return;
    J = { ...d, got: new Map(d.list.map((x) => [x.gz, x.day])) };
    track('jiazi_open', { n: d.n });
    const cells = JIAZI.map((gz) => {
      const day = J.got.get(gz), a = d.arts[gz], now = gz === d.today ? ' now' : '';
      return day
        ? `<button type="button" class="jz got${now}" data-jz="${gz}" aria-label="${t('{gz}日 {name}，{day}收下', { gz: gzText(gz), name: esc(a.name), day: md(day) })}"><img src="${esc(pillarArtSrc(a.art))}" alt="" loading="lazy" width="600" height="600"><i>${gzText(gz)}</i></button>`
        : `<button type="button" class="jz${now}" data-jz="${gz}" aria-label="${t('{gz}日，还没收到', { gz: gzText(gz) })}"><span>${gzText(gz)}</span></button>`;
    }).join('');
    v.innerHTML = head + `<section class="card jzhead"><div class="jzn"><b>${d.n}</b><span>/ 60</span></div>`
      + `<div class="jzbar" aria-hidden="true"><i style="width:${Math.round((d.n / 60) * 100)}%"></i></div>`
      + `<p>${d.done ? (d.member ? t('已经集满一轮。送你一枚御守，在「转运」的「直接买一枚」里免费领。') : t('已经集满一轮。送你一枚御守，开通会员后在「转运」的「直接买一枚」里免费领。')) : t('每一天也有自己的天干地支，60 天一轮。每天打开 flowday，就收下当天的那张画；集满 60 张，送你一枚御守。')}</p></section>`
      + `<div class="jzgrid">${cells}</div>` + footHtml();
  }, (e) => { v.innerHTML = head + `<div class="errbox"><p>${esc(e.message)}</p></div>`; });
}

onClick('[data-jz]', (el) => {
  if (!J) return;
  const gz = el.getAttribute('data-jz'), day = J.got.get(gz), a = J.arts[gz];
  if (!day) {
    const nx = nextDay(gz);
    toast(gz === J.today ? t('今天这张还没收：回到今天页打开一下就收下了') : t('还没收到。下一个{gz}日是 {day}，那天打开就能收下', { gz: gzText(gz), day: md(nx) }));
    return;
  }
  openSheet(`${t('{gz}日', { gz: gzText(gz) })} · ${a.name}`, `<div class="artsheet"><img class="big" src="${esc(pillarArtSrc(a.art))}" alt=""><p class="note" style="margin:0;text-align:center">${t('{day}收下', { day: md(day) })}</p></div>`);
});
