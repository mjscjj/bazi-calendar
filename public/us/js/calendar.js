// Calendar: the month as a heat map of how each day treats you, with the score in every cell. Tap a day and its
// reading opens right below the month. Choose something you're planning ("A job interview") and the best-day finder
// scans the days ahead: the ones set aside fade, the top three get a number, and you can save one as a plan.
import { $, $$, esc, S, api, data, track, toast, buzz, reduced, localDay, fmt, parse, ymd, WEEK, MONTHS, byGz, pillarOf, signName, art, elStyle, elOf,
  level, theme, toneOf, toneWord, tenName, hourRange, ring, loading, failed, countUp, you, bestHour, worstHour, openSheet, closeSheet } from './core.js';
import { needAccount } from './onboard.js';

const view = () => $('#view');
let month = null, selDay = null, act = null, range = '1m', picks = null, cal = null;
// "A job interview" → "Job interview"
const short = (v) => { const s = v.replace(/^(A|An) /, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
const iso3 = (p) => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;

// #/calendar?t=面试 opens with an activity already chosen (from the Oracle or Today)
export function pageCalendar(want) {
  if (want && S.C.pickTypes[want] && want !== act) { act = want; picks = null; }
  const today = localDay();
  month = month || today.slice(0, 7);
  view().innerHTML = `<div class="page split" style="${elStyle(elOf(you()))}">
    <div class="cols"><div class="sticky">
      <div class="scrollrow" id="acts"><button class="pill" data-t="" aria-pressed="${!act}">Any day</button>${Object.entries(S.C.pickTypes).map(([k, v]) => `<button class="pill" data-t="${k}" aria-pressed="${act === k}">${short(v)}</button>`).join('')}</div>
      <div class="monthbar"><button class="navbtn" aria-label="Previous month" data-mv="-1">‹</button><h1 class="h1" id="mTitle"></h1><button class="navbtn" aria-label="Next month" data-mv="1">›</button></div>
      <div class="cal" id="cal"></div>
      <div id="calFoot"></div>
    </div>
    <div class="stack"><div id="dayPanel"></div><div id="bestBox"></div><div id="plans"></div></div></div>
  </div>`;
  $$('#acts .pill').forEach((b) => b.addEventListener('click', () => chooseAct(b.dataset.t || null)));
  $$('[data-mv]').forEach((b) => b.addEventListener('click', () => { const [y, m] = month.split('-').map(Number), t = new Date(y, m - 1 + +b.dataset.mv, 1); month = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; selDay = null; buzz(5); loadMonth(); }));
  if (act) $(`#acts [data-t="${act}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  loadMonth().then(() => { if (act && !picks) runPick(); });
}

async function loadMonth() {
  const [y, m] = month.split('-').map(Number), first = `${month}-01`, n = new Date(y, m, 0).getDate(), lead = parse(first).getDay(), today = localDay();
  $('#mTitle').textContent = `${MONTHS[m - 1]} ${y}`;
  $('#cal').innerHTML = `${WEEK.map((w) => `<span class="wd">${w[0]}</span>`).join('')}${'<span class="blank"></span>'.repeat(lead)}
    ${Array.from({ length: n }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, '0')}`; return `<button data-d="${d}" class="${d === today ? 'today' : d < today ? 'past' : ''}" style="--i:${i}"><span>${i + 1}</span><small>&nbsp;</small></button>`; }).join('')}`;
  $('#dayPanel').innerHTML = loading(200);
  const asked = month;
  try { cal = await data.calendar(y, m); } catch (e) { $('#dayPanel') && ($('#dayPanel').innerHTML = failed(e.message)); return; }
  if (!$('#cal') || asked !== month) return; // left the page, or moved to another month, while loading
  const planDays = new Set((cal.plans || []).map((p) => p.date));
  for (const x of cal.days) {
    const d = ymd(x), b = $(`#cal button[data-d="${d}"]`); if (!b) continue;
    b.classList.add('lv' + x.level.k);
    b.querySelector('small').textContent = x.score;
    if (x.lunar?.jieqi) b.classList.add('term');
    if (planDays.has(d)) b.classList.add('plan');
    const mood = cal.moods?.filter((mm) => mm.d === x.d).pop();
    if (mood) { const c = cal.moodKit?.colors.find((cc) => cc.key === mood.color); b.insertAdjacentHTML('beforeend', `<em class="md" style="background:${document.documentElement.dataset.theme === 'dark' ? c?.dark : c?.light}"></em>`); }
    b.setAttribute('aria-label', `${fmt(d)}: ${level(x.level.k).word}, ${x.score}`);
    b.addEventListener('click', () => { selDay = d; markSel(); dayPanel(); buzz(4); if (matchMedia('(max-width: 959px)').matches) $('#dayPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  }
  if (!reduced()) $('#cal').classList.add('paint');
  if (!selDay || !selDay.startsWith(month)) selDay = today.startsWith(month) ? today : `${month}-01`;
  markSel(); markPicks(); dayPanel(); foot(); bestBox(); plansBox();
}
const dayData = (d) => cal?.days.find((x) => ymd(x) === d);
function markSel() { $$('#cal button').forEach((b) => b.classList.toggle('sel', b.dataset.d === selDay)); }

// ---------- the legend, or what the finder is doing ----------
function foot() {
  if (!$('#calFoot')) return;
  if (!act) { $('#calFoot').innerHTML = `<div class="legend">${[5, 4, 3, 2, 1].map((k) => `<span class="lv${k}"><i></i>${level(k).word}</span>`).join('')}</div>`; return; }
  const label = S.C.pickTypes[act];
  $('#calFoot').innerHTML = `<div class="pickhead"><span id="pickTxt">${picks ? `<b>${picks.days}</b> days checked · <b>${picks.set}</b> set aside` : 'Checking your days…'}</span>
    <div class="seg" style="min-width:150px">${[['1m', '30 days'], ['3m', '3 months']].map(([k, v]) => `<button data-r="${k}" aria-pressed="${range === k}">${v}</button>`).join('')}</div></div>
    <p class="hint" style="margin-top:6px">Best days for ${esc(label.charAt(0).toLowerCase() + label.slice(1))}: days that clash with your chart or that the old almanac marks as wrong for it are set aside first.</p>`;
  $$('[data-r]').forEach((b) => b.addEventListener('click', () => { range = b.dataset.r; runPick(); }));
}

// ---------- the best-day finder ----------
function chooseAct(t) {
  act = t; picks = null; buzz(5);
  $$('#acts .pill').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.t || null) === act)));
  $('#cal').classList.remove('picking', 'scan'); $$('#cal .badge').forEach((x) => x.remove());
  foot(); bestBox();
  if (act) runPick();
}
let runId = 0;
async function runPick() {
  const id = ++runId, type = act;
  foot();
  let r;
  try { r = await data.pick(type, range); } catch (e) { if (id === runId) toast(e.message); return; }
  if (id !== runId || type !== act || !$('#cal')) return; // a newer choice replaced this one
  track('us_pick', { type, range });
  picks = { list: r.picks.map((p) => ({ ...p, date: iso3(p) })), days: r.days, set: r.excluded ? r.excluded.ji + r.excluded.po + r.excluded.chong : Math.max(0, r.days - (r.candidates || r.days)), best: r.best };
  // the first pick shows in the month it falls in
  const first = picks.list[0]?.date;
  if (first && !first.startsWith(month)) { month = first.slice(0, 7); selDay = first; await loadMonth(); }
  else { if (first) selDay = first; markSel(); markPicks(true); foot(); dayPanel(); bestBox(); }
  buzz(12);
}
function markPicks(animate) {
  const c = $('#cal'); if (!c) return;
  $$('.badge', c).forEach((x) => x.remove());
  $$('button', c).forEach((b) => b.classList.remove('pick'));
  if (!act || !picks) { c.classList.remove('picking'); return; }
  picks.list.forEach((p, i) => { const b = $(`button[data-d="${p.date}"]`, c); if (b) { b.classList.add('pick'); b.insertAdjacentHTML('beforeend', `<span class="badge">${i + 1}</span>`); } });
  if (animate && !reduced()) { c.classList.remove('scan', 'paint'); void c.offsetWidth; c.classList.add('scan'); }
  c.classList.add('picking');
}

// ---------- the selected day, under the month ----------
function dayPanel() {
  const box = $('#dayPanel'); if (!box) return;
  const x = dayData(selDay);
  if (!x) { box.innerHTML = ''; return; }
  const d = selDay, today = localDay(), dp = byGz(x.gz), tone = toneOf(cal.chart, x.gz), th = theme(x.ssG, tone, d), lv = level(x.level.k);
  const b = bestHour(x), w = worstHour(x), pk = picks?.list.find((p) => p.date === d), rank = pk ? picks.list.indexOf(pk) + 1 : 0;
  box.innerHTML = `<div class="card dayp">
    <div class="top2 lv${x.level.k}">${ring(x.score, 56, 5)}<div><p class="label">${d === today ? 'Today' : fmt(d, 'full')}${rank ? ` · <b style="color:var(--ink)">#${rank} for ${esc(short(S.C.pickTypes[act]).toLowerCase())}</b>` : ''}</p><div class="word" style="margin-top:4px">${lv.word}</div><div class="title">${esc(th.title)}</div></div>
      <img class="thumb" src="${art(dp)}" alt="" title="${signName(dp)}"></div>
    <p class="dc-line" style="font-size:14px">${esc(th.line)}</p>
    <div class="hours"><span class="chip good">Best ${hourRange((pk?.hours?.[0] != null ? { i: pk.hours[0] } : b).i)}</span><span class="chip bad">Go easy ${hourRange(w.i)}</span>${x.lunar?.jieqi ? `<span class="chip">${esc(S.C.seasons[x.lunar.jieqi] || '')} begins</span>` : ''}</div>
    <div class="div dodont"><div><p class="label">Do</p><ul>${th.do.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div><div class="no"><p class="label">Skip</p><ul>${th.dont.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div></div>
    <p class="small" style="margin:12px 0 0">${signName(dp)} day · ${tenName(x.ssG)}, ${toneWord(tone)}</p>
    <div class="btnrow" style="margin-top:12px">${d >= today ? `<button class="btn sm" id="savePlan">${act ? 'Save as plan' : 'Plan something'}</button>` : ''}<a class="btn sm ghost" href="#/today?d=${d}">Open the full day</a></div>
  </div>`;
  countUp($('#dayPanel [data-count]'), x.score, 600);
  $('#savePlan')?.addEventListener('click', () => {
    if (needAccount('Create a free account to save plans — they show here and in your phone calendar.')) return;
    if (act) savePlan(act, d, pk?.hours?.[0] ?? b.i, $('#savePlan'));
    else planSheet(d, b.i);
  });
}
async function savePlan(type, date, hour, btn) {
  try {
    await api('POST', 'plans', { name: S.C.pickTypes[type], type, date, hour, reason: '' });
    if (btn) { btn.textContent = 'Saved ✓'; btn.disabled = true; }
    buzz(10); track('us_plan_save', { type }); toast(`Saved — ${fmt(date, 'md')}, ${hourRange(hour)}`);
    $(`#cal button[data-d="${date}"]`)?.classList.add('plan');
    cal.plans = [...(cal.plans || []), { name: S.C.pickTypes[type], type, date, hour }]; plansBox();
  } catch (x) { toast(x.message); }
}
function planSheet(date, hour) {
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">What's on ${fmt(date, 'md')}?</h2><p class="muted" style="margin:0 0 12px">Saved plans show here and in your phone calendar.</p>
    <div class="chips">${Object.entries(S.C.pickTypes).map(([k, v]) => `<button class="pill" data-pt="${k}">${v}</button>`).join('')}</div>`);
  $$('[data-pt]').forEach((b) => b.addEventListener('click', () => { closeSheet(); savePlan(b.dataset.pt, date, hour, $('#savePlan')); }));
}

// ---------- the month's best days, or the finder's top three ----------
function bestBox() {
  const box = $('#bestBox'); if (!box || !cal) return;
  const today = localDay();
  let items, head;
  if (act) {
    if (!picks) { box.innerHTML = ''; return; }
    head = `Best days for ${esc(S.C.pickTypes[act].charAt(0).toLowerCase() + S.C.pickTypes[act].slice(1))}`;
    items = picks.list.map((p, i) => ({ date: p.date, k: p.level.k, score: p.score, title: theme(p.ssG, toneOf(cal.chart, pillarOf(p.date).cn), p.date).title, hour: p.hours?.[0], tag: i === 0 ? (picks.best ? 'Best pick' : 'Top pick') : `Option ${i + 1}` }));
  } else {
    head = 'Best days left this month';
    items = cal.days.filter((x) => ymd(x) >= today).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => ({ date: ymd(x), k: x.level.k, score: x.score, title: theme(x.ssG, toneOf(cal.chart, x.gz), ymd(x)).title, hour: bestHour(x).i }));
    if (!items.length) { box.innerHTML = ''; return; }
  }
  box.innerHTML = `<div class="card bestlist"><div class="sec-h"><h2 class="h3">${head}</h2></div>${items.map((it) => { const t = parse(it.date); return `
    <button class="item" data-go="${it.date}" style="width:100%;border:0;background:none;padding-left:0;padding-right:0;text-align:left;cursor:pointer;font:inherit;color:inherit">
      <div class="datebox"><b>${t.getDate()}</b><span>${MONTHS[t.getMonth()].slice(0, 3)}</span></div>
      <div><h3>${WEEK[t.getDay()]} · ${level(it.k).word} ${it.score}${it.tag ? ` · <span style="color:var(--good)">${it.tag}</span>` : ''}</h3><p>${esc(it.title)}${it.hour != null ? ` · best ${hourRange(it.hour)}` : ''}</p></div><span class="go">›</span></button>`; }).join('')}</div>`;
  $$('[data-go]', box).forEach((b) => b.addEventListener('click', async () => {
    const d = b.dataset.go; selDay = d;
    if (!d.startsWith(month)) { month = d.slice(0, 7); await loadMonth(); } else { markSel(); dayPanel(); }
    $('#dayPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
}
function plansBox() {
  const box = $('#plans'); if (!box) return;
  const mine = (cal?.plans || []).filter((pl) => pl.date && pl.date >= localDay()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  box.innerHTML = mine.length ? `<div class="card bestlist"><div class="sec-h"><h2 class="h3">Coming up</h2></div>${mine.map((pl) => { const t = parse(pl.date); return `
    <a class="item" href="#/today?d=${pl.date}" style="text-decoration:none"><div class="datebox"><b>${t.getDate()}</b><span>${WEEK[t.getDay()]}</span></div><div><h3>${esc(S.C.pickTypes[pl.type] || pl.name)}</h3><p>${pl.hour != null ? hourRange(pl.hour) : 'All day'}</p></div><span class="go">›</span></a>`; }).join('')}</div>` : '';
}
