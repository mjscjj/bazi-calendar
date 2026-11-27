// 签谱：抽过的每日一签都收在这里，按日期往回看；点开看整支签和当时想着的事。
import { $, esc, api, onClick, openSheet, currentPath, EN, MON } from './core.js';
import { S } from './state.js';
import { footHtml, lotHtml } from './today.js';
import { tm } from './i18n.js';
const t = tm('rite'); // 先查 i18n/en/rite.json

const phead = (title) => `<div class="phead"><button type="button" class="back" data-back aria-label="${t('返回')}">‹</button><h1>${title}</h1></div>`;
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayText = (d) => { const [y, m, dd] = d.split('-').map(Number), w = new Date(y, m - 1, dd).getDay(); return EN ? `${WD_EN[w]}, ${MON[m - 1]} ${dd}` : `${m}月${dd}日 周${'日一二三四五六'[w]}`; };

export function pageLots() {
  const v = $('#view');
  v.innerHTML = phead(t('我的签谱')) + '<div class="sk" style="height:240px"></div>';
  api('GET', 'draws').then((d) => {
    if (currentPath() !== '/lots') return;
    S.lots = d.list;
    const up = d.list.filter((x) => /上|great/i.test(x.grade)).length;
    v.innerHTML = phead(t('我的签谱'))
      + (d.list.length ? `<p class="lead">${up ? t('抽过 {n} 支签，其中上签 {up} 支。', { n: d.list.length, up }) : t('抽过 {n} 支签。', { n: d.list.length })}</p><section class="mlist lotlist">${d.list.map((x, i) => `<button type="button" class="lrow" data-lot-i="${i}"><span class="ln2">${x.no}</span><span class="lt"><b>${esc(x.title)}<em>${esc(t(x.grade))}</em></b><small>${dayText(x.day)}${x.question ? ' · ' + t('所问：') + esc(x.question) : ''}</small></span><i aria-hidden="true">›</i></button>`).join('')}</section>`
        : `<div class="empty">${t('还没有抽过签。每天在「今天」里摇一支，都会收在这里。')}</div>`) + footHtml();
  }, (e) => { v.innerHTML = phead(t('我的签谱')) + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>${t('重新加载')}</button></div>`; });
}
onClick('[data-lot-i]', (el) => {
  const x = (S.lots || [])[+el.getAttribute('data-lot-i')];
  if (x) openSheet(t('{day} 的签', { day: dayText(x.day) }), lotHtml(x, true));
});
