// 今天的记录：可以记心情，也可以单纯记一件事，两样都有也行；记下的以便签形式排在下面。月历格子上的小纸片、当日详情里的便签也在这里。
// 心情词、默认纸色、分数都在 content/moods.json。
import { $, esc, api, toast, onClick, track, localToday, openSheet, dismissSheet, guestAsk, EN, mdOf } from './core.js';
import { S, isDemo } from './state.js';
import { todosHtml } from './todos.js';
import { tm } from './i18n.js';
const T = tm('today'); // 先查 i18n/en/today.json

export const kitOf = () => (S.today && S.today.moodKit) || (S.cal && S.cal.moodKit) || null;
const moodOf = (kit, key) => kit.moods.find((m) => m.key === key) || null;
const colorOf = (kit, key) => kit.colors.find((c) => c.key === key) || kit.colors[0];
// 每张便签一个固定的小角度，看上去像随手贴的
const tilt = (id) => (((id * 37) % 7) - 3) * 0.9;
const hm = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const paper = (c) => `--pl:${c.light};--pd:${c.dark}`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
// 心情的平均分（1–5），给趋势图用
export const moodScore = (list, kit) => {
  const ss = (list || []).map((m) => kit && moodOf(kit, m.mood)).filter(Boolean).map((x) => x.score);
  return ss.length ? ss.reduce((a, b) => a + b, 0) / ss.length : null;
};

// 一条记录画成一张便签：有心情的上面写心情的字；只记了事情的，便签上就是那件事。点开看全文
export function stickerHtml(m, kit, { remove = false, open = true } = {}) {
  const md = moodOf(kit, m.mood), c = colorOf(kit, m.color), both = md && md.word !== md.char;
  return `<div class="stk${md ? '' : ' ev'}" style="${paper(c)};--r:${tilt(m.id)}deg"${open && m.id ? ` data-stk-open="${m.id}" role="button" tabindex="0" aria-label="${T('看这条记录')}"` : ''}>`
    + (md ? `<b${both ? ' aria-hidden="true"' : ''}>${esc(md.char)}</b>${both ? `<span class="w">${esc(md.word)}</span>` : ''}` : '')
    + (m.note ? `<p>${esc(m.note)}</p>` : '') + `<time>${hm(m.createdAt)}</time>`
    + (remove ? `<button type="button" class="x" data-unstick="${m.id}" data-unstick-day="${m.day}" aria-label="${md ? T('撕掉这张「{w}」', { w: esc(md.word) }) : T('撕掉这张记录')}">×</button>` : '') + '</div>';
}
// 日历格子：最下面排一行小纸片（最多三张，最近贴的在前）；电脑上每张写一个字
export function cellStickers(list, kit) {
  if (!list || !list.length || !kit) return '';
  const top = list.slice(-3).reverse();
  return `<span class="mstk" aria-hidden="true">${top.map((m) => `<i style="${paper(colorOf(kit, m.color))};--r:${tilt(m.id)}deg">${esc((moodOf(kit, m.mood) || { char: T('记') }).char)}</i>`).join('')}</span>`;
}
export const moodWords = (list, kit) => list.map((m) => (moodOf(kit, m.mood) || { word: T('记事') }).word).join(EN ? ', ' : '、');

// ---------- 今天页：记录此刻 ----------
// 今天和前两天可以记；更早的只看；以后的日子不显示
const canRecord = (date) => { const t = localToday(); return date <= t && date >= addDays(t, -2); };
const chip = (kit, m, attr, on) => `<button type="button" class="mchip" style="${paper(colorOf(kit, m.color))}" ${attr}="${m.key}"${on == null ? '' : ` aria-pressed="${on}"`}><i class="mood-dot" aria-hidden="true"></i>${esc(m.word)}</button>`;

function moodRow(m, kit, remove) {
  const mood = moodOf(kit, m.mood), note = m.note?.trim();
  return `<li class="mood-entry${mood ? '' : ' ev'}" style="${paper(colorOf(kit, m.color))}"><button type="button" class="mood-read" data-stk-open="${m.id}"><time datetime="${esc(m.createdAt)}">${hm(m.createdAt)}</time><i class="mood-dot" aria-hidden="true"></i><span class="mood-copy">`
    + `<span>${esc(mood?.word || note || T('记事'))}</span>`
    + (mood && note && note !== mood.word ? `<small>${esc(note)}</small>` : '')
    + '</span></button>'
    + (remove ? `<button type="button" class="x" data-unstick="${m.id}" data-unstick-day="${m.day}" aria-label="${T('删除 {t} 的记录', { t: hm(m.createdAt) })}">×</button>` : '') + '</li>';
}
export function recordHtml(entry, kit) {
  if (!kit || !entry) return '';
  const list = entry.moods || [], can = canRecord(entry.date);
  const isToday = entry.date === localToday();
  const [, month, day] = entry.date.split('-').map(Number);
  const sm = S.today && S.today.rate && S.today.rate.summary;
  const title = isToday ? T('今日待办和心情') : can || list.length ? T('{d}待办和心情', { d: mdOf(month, day) }) : T('{d}待办', { d: mdOf(month, day) });
  return `<section class="moodbox" aria-label="${title}">`
    + todosHtml(entry.date, entry.todos, title)
    + (can || list.length ? `<div class="mood-heading"><h3>${T('心情记录')}</h3>${can ? `<button type="button" class="mwrite" data-mood-rec>${isToday ? T('写一笔') : T('补记一笔')} ›</button>` : ''}</div>` : '')
    + (can ? `<div class="mchips" role="group" aria-label="${T('记个心情')}">${kit.moods.map((m) => chip(kit, m, 'data-mood-quick')).join('')}</div>` : '')
    + (list.length ? `<ul class="mood-log" aria-label="${T('当天的心情记录')}">${[...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).map(m => moodRow(m, kit, can && !isDemo())).join('')}</ul>` : '')
    + (isToday && sm && sm.rated ? `<p class="mfoot">${T('这个月有 {n} 天记了心情，其中 <b>{m} 天</b>和系统的判断差不多。只用来帮你观察自己，不代表准不准。', { n: sm.rated, m: sm.match })}</p>` : '')
    + '</section>';
}

// 记一笔的弹层：日期和时间、写点什么、心情（可不选）、便签颜色
const ui = { day: null, mood: null, color: null, colorSet: false, note: '' };
const period = (h) => (h < 5 ? T('凌晨') : h < 11 ? T('早上') : h < 13 ? T('中午') : h < 18 ? T('下午') : T('晚上'));
const ready = () => !!(ui.mood || ui.note.trim());
function sheetBody() {
  const kit = kitOf(), [, m, d] = ui.day.split('-').map(Number), now = new Date();
  return '<form class="mrecf" id="moodForm" novalidate>'
    + `<div class="mrhead"><span>${mdOf(m, d)}${ui.day === localToday() ? '' : T('（补记）')}</span><span>${EN ? `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() < 12 ? 'AM' : 'PM'}` : `${period(now.getHours())} ${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`}</span></div>`
    + `<textarea name="note" maxlength="${kit.noteMax || 80}" rows="4" placeholder="${T('今天发生了什么？记下来就好')}" aria-label="${T('今天发生了什么')}">${esc(ui.note)}</textarea>`
    + `<div class="mrgrid" role="group" aria-label="${T('此刻的心情')}"><small>${T('此刻的心情（可以不选，再点一次取消）')}</small><div>${kit.moods.map((x) => chip(kit, x, 'data-mood-pick', x.key === ui.mood)).join('')}</div></div>`
    + `<div class="mcolors-wrap"><small>${T('便签颜色')}</small><div class="mcolors" role="group" aria-label="${T('便签颜色')}">${kit.colors.map((c) => `<button type="button" data-mood-color="${c.key}" aria-pressed="${c.key === ui.color}" style="${paper(c)}" aria-label="${T('{c}色便签', { c: esc(c.name) })}"></button>`).join('')}</div></div>`
    + `<button type="submit" class="btn primary block"${ready() ? '' : ' disabled'}>${T('记下')}</button></form>`;
}
const redrawSheet = () => { const b = $('#sheet .sbody'); if (b && $('#moodForm', b)) b.innerHTML = sheetBody(); };
function openRecord(day, mood) {
  if (isDemo()) { guestAsk(T('记录心情')); return; }
  const kit = kitOf();
  if (!kit) return;
  ui.day = day; ui.mood = mood || null; ui.note = ''; ui.colorSet = false;
  ui.color = mood ? moodOf(kit, mood).color : kit.eventColor || kit.colors[0].key;
  const body = openSheet(day === localToday() ? T('记一笔') : T('补记一笔'), sheetBody());
  if (!mood) { const ta = body && body.querySelector('textarea'); if (ta) setTimeout(() => ta.focus(), 250); }
}
let selected = () => localToday();
let rerender = () => {};
export function onMoodChange(fn, sel) { rerender = fn; if (sel) selected = sel; }
onClick('[data-mood-quick]', (el) => openRecord(selected(), el.getAttribute('data-mood-quick')));
onClick('[data-mood-rec]', () => openRecord(selected()));
onClick('[data-mood-pick]', (el) => {
  const kit = kitOf();
  const k = el.getAttribute('data-mood-pick');
  ui.mood = ui.mood === k ? null : k;
  if (!ui.colorSet) ui.color = ui.mood ? moodOf(kit, ui.mood).color : kit.eventColor || kit.colors[0].key;
  redrawSheet();
});
onClick('[data-mood-color]', (el) => { ui.color = el.getAttribute('data-mood-color'); ui.colorSet = true; redrawSheet(); });
document.addEventListener('input', (e) => {
  const f = e.target.closest('#moodForm');
  if (!f || e.target.name !== 'note') return;
  ui.note = e.target.value;
  $('button[type=submit]', f).disabled = !ready();
});

// 记下或撕掉之后，今天页、这一周、日历缓存里的同一天一起更新
function applyList(day, d) {
  const t = S.today;
  if (t && day === t.date) t.moods = d.moods;
  if (t && t.rate) t.rate.summary = d.summary;
  for (const strip of [t && t.strip, ...Object.values(S.wcache || {})]) {
    const x = strip && strip.days.find((z) => z.date === day);
    if (x) x.moods = d.moods;
  }
  const [yy, mm, dd] = day.split('-').map(Number);
  if (S.cal && S.cal.y === yy && S.cal.m === mm && S.cal.moods) S.cal.moods = S.cal.moods.filter((m) => m.d !== dd).concat(d.moods.map((m) => ({ ...m, d: dd })));
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'moodForm') return;
  e.preventDefault();
  ui.note = e.target.elements.note.value;
  if (!ready()) { toast(T('写点什么，或者选一个心情')); return; }
  const day = ui.day, btn = $('button[type=submit]', e.target);
  btn.disabled = true;
  api('POST', 'moods', { day, mood: ui.mood || '', color: ui.color, note: ui.note.trim() }).then((d) => {
    track('mood_stick', { mood: ui.mood || 'none', note: !!ui.note.trim(), color: ui.color, n: d.moods.length });
    if (navigator.vibrate) navigator.vibrate(12);
    applyList(day, d);
    dismissSheet();
    rerender();
  }, (err) => { btn.disabled = false; toast(err.message); });
});
onClick('[data-unstick]', (el) => {
  // 便签角上的 × 离便签本身太近，先变成「撕掉」，3 秒内再点一次才撕，防止想看全文时误删
  if (!el.hasAttribute('data-close-after') && !el.classList.contains('arm')) {
    el.classList.add('arm'); el.textContent = T('撕掉'); el.setAttribute('aria-label', T('再点一下撕掉'));
    setTimeout(() => { if (el.isConnected && el.classList.contains('arm')) { el.classList.remove('arm'); el.textContent = '×'; el.setAttribute('aria-label', T('撕掉这张')); } }, 3000);
    return;
  }
  const id = +el.getAttribute('data-unstick'), day = el.getAttribute('data-unstick-day');
  const card = el.closest('.stk');
  if (card) card.classList.add('peel');
  api('DELETE', 'moods/' + id, {}).then((d) => { applyList(day, d); if (el.hasAttribute('data-close-after')) dismissSheet(); rerender(); }, (err) => { if (card) card.classList.remove('peel'); toast(err.message); });
});
// 点便签看全文（字多的便签上只露几行）
function findRec(id) {
  const t = S.today;
  const lists = [t && t.moods, ...[t && t.strip, ...Object.values(S.wcache || {})].filter(Boolean).flatMap((w) => w.days.map((x) => x.moods)), S.cal && S.cal.moods];
  for (const l of lists) { const m = (l || []).find((z) => z.id === id); if (m) return m; }
  return null;
}
onClick('[data-stk-open]', (el) => {
  const m = findRec(+el.getAttribute('data-stk-open')), kit = kitOf();
  if (!m || !kit) return;
  const md = moodOf(kit, m.mood), c = colorOf(kit, m.color), [, mm, dd] = m.day.split('-').map(Number);
  const can = canRecord(m.day) && !isDemo() && !document.getElementById('sheet');
  openSheet(`${mdOf(mm, dd)} ${hm(m.createdAt)}`, `<div class="stkfull" style="${paper(c)}">${md ? `<b>${esc(md.char)}</b><span class="w">${esc(md.word)}</span>` : ''}${m.note ? `<p>${esc(m.note)}</p>` : ''}</div>`
    + (can ? `<button type="button" class="btn ghost block" data-unstick="${m.id}" data-unstick-day="${m.day}" data-close-after>${T('撕掉这张')}</button>` : ''));
});
