// 今天的记录：可以记心情，也可以单纯记一件事，两样都有也行；记下的以便签形式排在下面。月历格子上的小纸片、当日详情里的便签也在这里。
// 心情词、默认纸色、分数都在 content/moods.json。
import { $, esc, api, toast, onClick, track, localToday, openSheet, dismissSheet, guestAsk } from './core.js';
import { S, isDemo } from './state.js';

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
  return `<div class="stk${md ? '' : ' ev'}" style="${paper(c)};--r:${tilt(m.id)}deg"${open && m.id ? ` data-stk-open="${m.id}" role="button" tabindex="0" aria-label="看这条记录"` : ''}>`
    + (md ? `<b${both ? ' aria-hidden="true"' : ''}>${esc(md.char)}</b>${both ? `<span class="w">${esc(md.word)}</span>` : ''}` : '')
    + (m.note ? `<p>${esc(m.note)}</p>` : '') + `<time>${hm(m.createdAt)}</time>`
    + (remove ? `<button type="button" class="x" data-unstick="${m.id}" data-unstick-day="${m.day}" aria-label="撕掉这张${md ? `「${esc(md.word)}」` : "记录"}">×</button>` : '') + '</div>';
}
// 日历格子：最下面排一行小纸片（最多三张，最近贴的在前）；电脑上每张写一个字
export function cellStickers(list, kit) {
  if (!list || !list.length || !kit) return '';
  const top = list.slice(-3).reverse();
  return `<span class="mstk" aria-hidden="true">${top.map((m) => `<i style="${paper(colorOf(kit, m.color))};--r:${tilt(m.id)}deg">${esc((moodOf(kit, m.mood) || { char: '记' }).char)}</i>`).join('')}</span>`;
}
export const moodWords = (list, kit) => list.map((m) => (moodOf(kit, m.mood) || { word: '记事' }).word).join('、');

// ---------- 今天页：记录此刻 ----------
// 今天和前两天可以记；更早的只看；以后的日子不显示
const canRecord = (date) => { const t = localToday(); return date <= t && date >= addDays(t, -2); };
const chip = (kit, m, attr, on) => `<button type="button" class="mchip" ${attr}="${m.key}"${on == null ? '' : ` aria-pressed="${on}"`}><i style="${paper(colorOf(kit, m.color))}">${esc(m.char)}</i><span>${esc(m.word)}</span></button>`;
export function recordHtml(entry, kit) {
  if (!kit || !entry) return '';
  const today = localToday(), list = entry.moods || [], can = canRecord(entry.date) || isDemo();
  if (!can && !list.length) return '';
  const isToday = entry.date === today;
  const title = isToday ? '今天有什么要记录的？' : '这一天的记录';
  const sm = S.today && S.today.rate && S.today.rate.summary;
  return `<section class="moodbox" aria-label="${title}"><div class="q"><b>${title}</b>${list.length ? `<small>记了 ${list.length} 条</small>` : ''}</div>`
    + (can ? `<button type="button" class="mwrite" data-mood-rec><span aria-hidden="true">✎</span>${isToday ? '记一笔：今天发生了什么' : '补记一笔'}</button>`
      + `<div class="mlab">顺手记个心情</div><div class="mchips" role="group" aria-label="顺手记个心情">${kit.moods.map((m) => chip(kit, m, 'data-mood-quick')).join('')}</div>` : '')
    + (list.length ? `<div class="board">${list.map((m) => stickerHtml(m, kit, { remove: can && !isDemo() })).join('')}</div>` : '')
    + (isToday && sm && sm.rated ? `<p class="mfoot">这个月有 ${sm.rated} 天记了心情，其中 <b>${sm.match} 天</b>和系统的判断差不多。只用来帮你观察自己，不代表准不准。</p>` : '')
    + '</section>';
}

// 记一笔的弹层：日期和时间、写点什么、心情（可不选）、便签颜色
const ui = { day: null, mood: null, color: null, colorSet: false, note: '' };
const period = (h) => (h < 5 ? '凌晨' : h < 11 ? '早上' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上');
const ready = () => !!(ui.mood || ui.note.trim());
function sheetBody() {
  const kit = kitOf(), [, m, d] = ui.day.split('-').map(Number), now = new Date();
  return '<form class="mrecf" id="moodForm" novalidate>'
    + `<div class="mrhead"><span>${m}月${d}日${ui.day === localToday() ? '' : '（补记）'}</span><span>${period(now.getHours())} ${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}</span></div>`
    + `<textarea name="note" maxlength="${kit.noteMax || 80}" rows="4" placeholder="今天发生了什么？记下来就好" aria-label="今天发生了什么">${esc(ui.note)}</textarea>`
    + `<div class="mrgrid" role="group" aria-label="此刻的心情"><small>此刻的心情（可以不选，再点一次取消）</small><div>${kit.moods.map((x) => chip(kit, x, 'data-mood-pick', x.key === ui.mood)).join('')}</div></div>`
    + `<div class="mcolors-wrap"><small>便签颜色</small><div class="mcolors" role="group" aria-label="便签颜色">${kit.colors.map((c) => `<button type="button" data-mood-color="${c.key}" aria-pressed="${c.key === ui.color}" style="${paper(c)}" aria-label="${esc(c.name)}色便签"></button>`).join('')}</div></div>`
    + `<button type="submit" class="btn primary block"${ready() ? '' : ' disabled'}>记下</button></form>`;
}
const redrawSheet = () => { const b = $('#sheet .sbody'); if (b && $('#moodForm', b)) b.innerHTML = sheetBody(); };
function openRecord(day, mood) {
  if (isDemo()) { guestAsk('记录心情'); return; }
  const kit = kitOf();
  if (!kit) return;
  ui.day = day; ui.mood = mood || null; ui.note = ''; ui.colorSet = false;
  ui.color = mood ? moodOf(kit, mood).color : kit.eventColor || kit.colors[0].key;
  const body = openSheet(day === localToday() ? '记一笔' : '补记一笔', sheetBody());
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
  if (!ready()) { toast('写点什么，或者选一个心情'); return; }
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
    el.classList.add('arm'); el.textContent = '撕掉'; el.setAttribute('aria-label', '再点一下撕掉');
    setTimeout(() => { if (el.isConnected && el.classList.contains('arm')) { el.classList.remove('arm'); el.textContent = '×'; el.setAttribute('aria-label', '撕掉这张'); } }, 3000);
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
  openSheet(`${mm}月${dd}日 ${hm(m.createdAt)}`, `<div class="stkfull" style="${paper(c)}">${md ? `<b>${esc(md.char)}</b><span class="w">${esc(md.word)}</span>` : ''}${m.note ? `<p>${esc(m.note)}</p>` : ''}</div>`
    + (can ? `<button type="button" class="btn ghost block" data-unstick="${m.id}" data-unstick-day="${m.day}" data-close-after>撕掉这张</button>` : ''));
});
