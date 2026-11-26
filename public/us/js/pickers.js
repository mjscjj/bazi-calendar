// Choose, don't type: birthday and birth time on wheels (the same wheel as the Chinese edition), birth place by search.
// Each picker opens a sheet and resolves with the value, or null if the sheet was closed.
import { $, $$, esc, openSheet, closeSheet, MONTHS, iso, localDay } from './core.js';

const ROW = 40;
const itemsHtml = (items) => '<div class="wpad"></div>' + items.map((it) => `<div class="witem" data-v="${esc(it.v)}">${esc(it.label)}</div>`).join('') + '<div class="wpad"></div>';
const wheelsHtml = (cols) => `<div class="wheels">${cols.map((c, i) => `<div class="wcol" data-wcol="${i}" style="flex:${c.flex || 1}" role="listbox" tabindex="0" aria-label="${esc(c.name || '')}">${itemsHtml(c.items)}</div>`).join('')}<i class="wband" aria-hidden="true"></i></div>`;

// cols: [{ items: [{ v, label }], index }]; onChange(column, index)
function mountWheels(root, cols, onChange) {
  const els = $$('.wcol', root), timers = [], last = [];
  const mark = (el, k) => el.querySelectorAll('.witem').forEach((it, i) => it.classList.toggle('on', i === k));
  const count = (el) => el.querySelectorAll('.witem').length;
  els.forEach((el, i) => {
    el.scrollTop = cols[i].index * ROW;
    mark(el, cols[i].index);
    last[i] = cols[i].index;
    el.addEventListener('scroll', () => { clearTimeout(timers[i]); timers[i] = setTimeout(() => settle(i), 90); }, { passive: true });
    // keyboard: up and down arrows move one row
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const k = Math.max(0, Math.min(count(el) - 1, Math.round(el.scrollTop / ROW) + (e.key === 'ArrowDown' ? 1 : -1)));
      el.scrollTop = k * ROW;
    });
    el.addEventListener('click', (e) => {
      const it = e.target.closest('.witem'); if (!it) return;
      el.scrollTo({ top: [...el.querySelectorAll('.witem')].indexOf(it) * ROW, behavior: 'smooth' });
    });
  });
  function settle(i) {
    const el = els[i], k = Math.max(0, Math.min(count(el) - 1, Math.round(el.scrollTop / ROW)));
    clearTimeout(timers[i]); mark(el, k);
    if (k !== last[i]) { last[i] = k; onChange(i, k); }
  }
  return {
    flush() { els.forEach((_, i) => settle(i)); },
    setItems(i, items, index) {
      const el = els[i]; el.innerHTML = itemsHtml(items);
      const k = Math.max(0, Math.min(items.length - 1, index));
      el.scrollTop = k * ROW; mark(el, k); last[i] = k; return k;
    },
  };
}

const sheet = (title, body, note = '') => new Promise((done) => {
  const panel = openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">${title}</h2>${note ? `<p class="muted" style="margin:0">${note}</p>` : ''}${body}`, '', () => done(null));
  panel._done = (v) => { panel._done = null; done(v); closeSheet(true); };
});
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

// ---------- birthday: Month / Day / Year ----------
export async function pickDate(value, { title = 'Your birthday', note = '' } = {}) {
  const now = new Date(), maxY = now.getFullYear();
  let [y, m, d] = value ? value.split('-').map(Number) : [1995, 1, 1];
  m -= 1;
  const years = Array.from({ length: maxY - 1902 + 1 }, (_, i) => 1902 + i);
  const days = (yy, mm) => Array.from({ length: daysIn(yy, mm) }, (_, i) => ({ v: i + 1, label: String(i + 1) }));
  const p = sheet(title, `${wheelsHtml([
    { name: 'Month', flex: 1.6, items: MONTHS.map((x, i) => ({ v: i, label: x })) },
    { name: 'Day', items: days(y, m) },
    { name: 'Year', flex: 1.1, items: years.map((x) => ({ v: x, label: String(x) })) },
  ])}<p class="err" id="pdErr"></p><button class="btn block" id="pdOk">Done</button>`, note);
  const panel = $('#sheet .panel');
  const w = mountWheels(panel, [{ index: m }, { index: d - 1 }, { index: years.indexOf(y) }], (col, k) => {
    if (col === 0) m = k; else if (col === 1) d = k + 1; else y = years[k];
    if (col !== 1) { const n = daysIn(y, m); d = w.setItems(1, days(y, m), Math.min(d, n) - 1) + 1; }
  });
  $('#pdOk').addEventListener('click', () => {
    w.flush();
    const s = iso(new Date(y, m, d));
    if (s > localDay()) { $('#pdErr').textContent = 'That date is in the future.'; return; }
    panel._done?.(s);
  });
  return p;
}

// ---------- birth time: Hour / Minute / AM·PM, or "I don't know" ----------
export async function pickTime(value) {
  let [h, mi] = value ? value.split(':').map(Number) : [8, 0];
  let ap = h >= 12 ? 1 : 0, h12 = h % 12 || 12;
  const hours = Array.from({ length: 12 }, (_, i) => ({ v: i + 1, label: String(i + 1) }));
  const mins = Array.from({ length: 60 }, (_, i) => ({ v: i, label: String(i).padStart(2, '0') }));
  const p = sheet('Birth time', `${wheelsHtml([{ name: 'Hour', items: hours }, { name: 'Minute', items: mins }, { name: 'AM or PM', items: [{ v: 0, label: 'AM' }, { v: 1, label: 'PM' }] }])}
    <div class="btns"><button class="btn block" id="ptOk">Done</button><button class="btn ghost block" id="ptNo">I don't know</button></div>`,
    'Even a rough time helps — it sets your fourth pillar, the hour.');
  const panel = $('#sheet .panel');
  const w = mountWheels(panel, [{ index: h12 - 1 }, { index: mi }, { index: ap }], (col, k) => { if (col === 0) h12 = k + 1; else if (col === 1) mi = k; else ap = k; });
  $('#ptOk').addEventListener('click', () => { w.flush(); const hh = (h12 % 12) + (ap ? 12 : 0); panel._done?.(`${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`); });
  $('#ptNo').addEventListener('click', () => panel._done?.(''));
  return p;
}
export const timeLabel = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// ---------- birth place: type a few letters ----------
let CITIES = null;
export const cities = async () => (CITIES = CITIES || await fetch('cities.json').then((r) => r.json()).catch(() => []));
export async function pickCity(value) {
  const list = await cities();
  const p = sheet('Birth place', `<input class="input" id="pcQ" type="search" placeholder="Search a city" autocomplete="off" value="${esc(value || '')}" style="margin-top:12px">
    <div class="citylist" id="pcList"></div><button class="linkbtn" id="pcNone">I'm not sure — skip this</button>`, 'Your local solar time comes from where you were born.');
  const panel = $('#sheet .panel'), q = $('#pcQ'), out = $('#pcList');
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const hits = (s ? list.filter((c) => c.name.toLowerCase().includes(s)).sort((a, b) => a.name.toLowerCase().indexOf(s) - b.name.toLowerCase().indexOf(s)) : list).slice(0, 40);
    out.innerHTML = hits.length ? hits.map((c) => `<button data-c="${esc(c.name)}"><span>${esc(c.name)}</span>${c.name === value ? '<small>Selected</small>' : ''}</button>`).join('')
      : '<p>No match. Try the nearest big city.</p>';
  };
  draw();
  q.addEventListener('input', draw);
  out.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) panel._done?.(b.dataset.c); });
  $('#pcNone').addEventListener('click', () => panel._done?.(''));
  if (matchMedia('(pointer: fine)').matches) q.focus();
  return p;
}

// a form field that opens the birthday wheel; the value sits in data-v
export function dateField(id, value = '') {
  return `<button type="button" class="input pickfield${value ? '' : ' empty'}" id="${id}" data-v="${esc(value)}">${value ? longDate(value) : 'Select your birthday'}</button>`;
}
export function wireDateField(btn, onPick) {
  btn.addEventListener('click', async () => {
    const v = await pickDate(btn.dataset.v || null);
    if (!v) return;
    btn.dataset.v = v; btn.textContent = longDate(v); btn.classList.remove('empty');
    onPick?.(v);
  });
}
const longDate = (s) => { const [y, m, d] = s.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
