// 滚轮选择：几列并排一起转，停下时取正中那一项（手指滑、鼠标滚轮、点某一项都行）。
// 出生日期（年、月、日）和出生时间（时、分）用。
import { $$, esc } from './core.js';

const ROW = 40;
const itemsHtml = (items) => '<div class="wpad"></div>' + items.map((it) => `<div class="witem" data-v="${esc(it.v)}">${esc(it.label)}</div>`).join('') + '<div class="wpad"></div>';

export function wheelsHtml(cols) {
  return `<div class="wheels">${cols.map((c, i) => `<div class="wcol" data-wcol="${i}" style="flex:${c.flex || 1}" role="listbox" aria-label="${esc(c.name || '')}">${itemsHtml(c.items)}</div>`).join('')}<i class="wband" aria-hidden="true"></i></div>`;
}

// cols: [{ items: [{v, label}], index }]；onChange(列号, 选中序号)
export function mountWheels(root, cols, onChange) {
  const els = $$('.wcol', root);
  const mark = (el, k) => el.querySelectorAll('.witem').forEach((it, i) => it.classList.toggle('on', i === k));
  const count = (el) => el.querySelectorAll('.witem').length;
  els.forEach((el, i) => {
    el.scrollTop = cols[i].index * ROW;
    mark(el, cols[i].index);
    let timer;
    el.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const k = Math.max(0, Math.min(count(el) - 1, Math.round(el.scrollTop / ROW)));
        mark(el, k);
        onChange(i, k);
      }, 90);
    }, { passive: true });
    el.addEventListener('click', (e) => {
      const it = e.target.closest('.witem');
      if (!it) return;
      const k = [...el.querySelectorAll('.witem')].indexOf(it);
      el.scrollTo({ top: k * ROW, behavior: 'smooth' });
    });
  });
  return {
    // 换掉某一列的选项（比如换了月份后天数变了），保持在给定序号
    setItems(i, items, index) {
      const el = els[i];
      el.innerHTML = itemsHtml(items);
      const k = Math.max(0, Math.min(items.length - 1, index));
      el.scrollTop = k * ROW;
      mark(el, k);
      return k;
    },
  };
}
