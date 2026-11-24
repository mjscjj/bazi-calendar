// 签谱：抽过的每日一签都收在这里，按日期往回看；点开看整支签和当时想着的事。
import { $, esc, api, onClick, openSheet, currentPath } from './core.js';
import { S } from './state.js';
import { footHtml, lotHtml } from './today.js';

const phead = (title) => `<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>${title}</h1></div>`;
const dayText = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${m}月${dd}日 周${'日一二三四五六'[new Date(y, m - 1, dd).getDay()]}`; };

export function pageLots() {
  const v = $('#view');
  v.innerHTML = phead('我的签谱') + '<div class="sk" style="height:240px"></div>';
  api('GET', 'draws').then((d) => {
    if (currentPath() !== '/lots') return;
    S.lots = d.list;
    const up = d.list.filter((x) => /上/.test(x.grade)).length;
    v.innerHTML = phead('我的签谱')
      + (d.list.length ? `<p class="lead">抽过 ${d.list.length} 支签${up ? `，其中上签 ${up} 支` : ''}。</p><section class="mlist lotlist">${d.list.map((x, i) => `<button type="button" class="lrow" data-lot-i="${i}"><span class="ln2">${x.no}</span><span class="lt"><b>${esc(x.title)}<em>${esc(x.grade)}</em></b><small>${dayText(x.day)}${x.question ? ' · 所问：' + esc(x.question) : ''}</small></span><i aria-hidden="true">›</i></button>`).join('')}</section>`
        : '<div class="empty">还没有抽过签。每天在「今天」里摇一支，都会收在这里。</div>') + footHtml();
  }, (e) => { v.innerHTML = phead('我的签谱') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
onClick('[data-lot-i]', (el) => {
  const x = (S.lots || [])[+el.getAttribute('data-lot-i')];
  if (x) openSheet(dayText(x.day) + ' 的签', lotHtml(x, true));
});
