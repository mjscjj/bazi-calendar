// Oracle: the Daily Oracle (the English Guanyin oracle). Same rules as the Chinese edition's 每日一签:
// write what's on your mind → hold to focus → a lot jumps out of the tube → toss the moon blocks to confirm
// (one up one down = yes; both up = ask more clearly; both down = not yet; three "not yet" = rephrase) → the reading.
import { $, $$, esc, S, api, store, track, toast, buzz, sfx, reduced, localDay, fmt, loading, failed, elStyle, elOf, artOf, pillarOf, you, data, MONTHS, WEEK, parse } from './core.js';
import { needAccount } from './onboard.js';
import { shareImage } from './share.js';

const view = () => $('#view');
const O = () => S.C.oracle;
const lotEn = (no) => O().lots[String(no)];
let drawDay = null; // the day today's lot was drawn (a toss right after midnight still belongs to it)
const topicKey = () => store.get('oracleTopic')?.day === localDay() ? store.get('oracleTopic').key : null;

export async function pageOracle() {
  view().innerHTML = `<div class="page split oracle" style="${elStyle(elOf(you()))}">
    <div class="cols"><div>
      <h1 class="h1" style="margin-top:4px">Daily Oracle</h1>
      <p class="muted" style="margin:4px 0 14px">One question a day. Draw a lot, then toss the moon blocks to confirm it — an old ritual from Chinese temples.</p>
      <section class="card orc" id="orc">${loading(260)}</section>
    </div>
    <div>${S.me ? `<div class="card"><div class="sec-h"><h2 class="h3">Your oracle journal</h2></div><div id="journal">${loading(70)}</div></div>`
      : `<div class="card"><h2 class="h3">How it works</h2><ol class="steps" style="margin-top:8px"><li>Ask about one thing, and keep it in mind.</li><li>Hold the button: one of 100 lots jumps out of the tube.</li><li>Toss the moon blocks. One up and one down means yes — the lot is yours to read.</li></ol><p class="hint">Every lot you draw is kept in your journal once you have a free account.</p></div>`}</div></div>
  </div>`;
  try {
    const t = S.today && S.today.date === localDay() ? S.today : await data.today(localDay());
    if (!$('#orc')) return;
    S.today = t; drawDay = t.date;
    render(t.draw);
  } catch (e) { $('#orc') && ($('#orc').innerHTML = failed(e.message)); }
  if (S.me) loadJournal();
}

function render(d, fresh) {
  if (!d) return askView();
  if (d.status === 'pending') return tossView(d, fresh);
  if (d.status === 'done') return readingView(d, fresh);
  if (d.status === 'reask') return askView(d, 'Three times "not yet". Put your question another way, then draw again.');
  return closedView(d);
}

// ---- 1. ask ----
function askView(d, note) {
  const topics = Object.entries(O().topics);
  $('#orc').innerHTML = `
    ${note ? `<p class="orc-note">${esc(note)}</p>` : ''}
    <label class="h3" for="q">What's on your mind?</label>
    <textarea class="input q" id="q" rows="2" maxlength="80" placeholder="Ask about one thing" style="margin-top:8px">${esc(d?.question || '')}</textarea>
    <div class="suggest">${S.C.questions.map((x) => `<button type="button">${esc(x)}</button>`).join('')}</div>
    <p class="label" style="margin:14px 0 0">It's about</p>
    <div class="scrollrow topics">${topics.map(([k, t]) => `<button type="button" class="pill" data-k="${k}" aria-pressed="${topicKey() === k}">${t.name}</button>`).join('')}</div>
    <div class="tube-wrap"><div class="tube" id="tube">${'<i></i>'.repeat(9)}</div></div>
    <button class="hold" id="hold"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="trk"/><circle cx="50" cy="50" r="46" class="fill" id="holdArc"/></svg><span>Hold to ask</span></button>
    <p class="hint" style="text-align:center">Keep your question in mind while you hold.</p>`;
  $$('.suggest button').forEach((b) => b.addEventListener('click', () => { $('#q').value = b.textContent; buzz(4); }));
  $$('.topics .pill').forEach((b) => b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; $$('.topics .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b && on))); buzz(4); }));
  holdButton($('#hold'), 1300, async () => {
    if (needAccount('Create a free account to draw your lot — your journal keeps every reading.')) return false;
    const q = $('#q').value.trim();
    const k = $('.topics .pill[aria-pressed=true]')?.dataset.k || null;
    store.set('oracleTopic', { day: localDay(), key: k });
    $('#tube').classList.add('shake'); buzz(30);
    try {
      drawDay = localDay();
      const r = await api('POST', 'draws/today', { date: drawDay, question: q || undefined });
      track('us_oracle_draw', { topic: k, q: !!q });
      await wait(reduced() ? 0 : 1300);
      if (!$('#orc')) return;
      S.today.draw = r.draw; render(r.draw, true);
    } catch (e) { $('#tube')?.classList.remove('shake'); toast(e.message); return false; } // false: the hold button resets
  });
}

// ---- 2. toss the moon blocks ----
function blocks(faces = ['flat', 'round']) {
  return `<div class="blocks">${faces.map((f, i) => `<i class="blk ${f}" style="--i:${i}"><svg viewBox="0 0 100 60"><path d="M4 44 C 14 6, 86 6, 96 44 C 78 26, 22 26, 4 44Z"/></svg></i>`).join('')}</div>`;
}
const FACES = { sheng: ['flat', 'round'], xiao: ['flat', 'flat'], yin: ['round', 'round'] };
function tossView(d, fresh) {
  const L = O().jiao, tries = d.tosses || [];
  $('#orc').innerHTML = `
    <div class="lotno${fresh ? ' pop' : ''}"><span>Lot</span><b>No. ${d.no}</b></div>
    <p class="orc-q">${d.question ? `“${esc(d.question)}”` : 'Your question'}</p>
    <p class="muted" style="text-align:center;margin:6px 0 0">${L.ask}</p>
    <div class="toss-area" id="tossArea">${blocks(tries.length ? FACES[tries[tries.length - 1]] : ['flat', 'round'])}</div>
    <p class="orc-res" id="tossRes">${tries.length ? esc(L[tries[tries.length - 1]].line) : ''}</p>
    <div class="tries">${[0, 1, 2].map((i) => `<i class="${tries[i] || ''}"></i>`).join('')}<span>${3 - tries.length} toss${3 - tries.length === 1 ? '' : 'es'} left</span></div>
    <button class="btn block" id="toss">Toss the blocks</button>
    <p class="hint" style="text-align:center">${L.rules}</p>`;
  let busy = false;
  const go = async () => {
    if (busy) return; busy = true;
    const area = $('#tossArea'); area.innerHTML = blocks(['flat', 'round']); area.classList.remove('land'); void area.offsetWidth; area.classList.add('fly');
    buzz(15);
    let r;
    try { r = await api('POST', 'draws/today/toss', { date: drawDay || localDay() }); } catch (e) { toast(e.message); busy = false; return; }
    await wait(reduced() ? 0 : 900);
    area.classList.remove('fly'); area.innerHTML = blocks(FACES[r.toss] || ['flat', 'round']); area.classList.add('land'); sfx('clack'); buzz(r.toss === 'sheng' ? [20, 60, 20] : 25);
    $('#tossRes').textContent = r.toss ? `${L[r.toss].name} — ${L[r.toss].line}` : '';
    track('us_oracle_toss', { r: r.toss });
    S.today.draw = r.draw;
    await wait(reduced() ? 0 : 1300);
    if ($('#orc')) render(r.draw, true);
  };
  $('#toss').addEventListener('click', go);
  // flick up on the blocks to toss
  let y0 = null;
  $('#tossArea').addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  $('#tossArea').addEventListener('pointerup', (e) => { if (y0 != null && y0 - e.clientY > 40) go(); y0 = null; });
}

// ---- 3. the reading: the answer first, then the verse, every topic, and a day to act on it ----
function readingView(d, fresh) {
  const en = lotEn(d.no), g = O().grades[d.grade] || d.grade, asked = topicKey();
  const tops = (d.topics || []).slice().sort((a, b) => (b.key === asked) - (a.key === asked));
  const main = tops.find((t) => t.key === asked) || tops.find((t) => t.key === 'self') || tops[0];
  const tt = O().topics[main?.key], adv = tt?.advice[String(main?.stars)];
  const stars = (n) => `<b class="stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></b>`;
  $('#orc').innerHTML = `
    <div class="reading${fresh ? ' fresh' : ''}">
      <div class="rd-head"><span class="chip grade g${d.grade === '上签' ? 1 : d.grade === '下签' ? 3 : 2}">${g}</span><span class="small">Lot No. ${d.no}</span></div>
      <h2 class="rd-title">${esc(en.title)}</h2>
      ${d.question ? `<p class="orc-q left">“${esc(d.question)}”</p>` : ''}
      <p class="rd-read">${esc(en.reading)}</p>
      ${main && tt ? `<div class="answer"><p class="label">${asked ? 'What you asked about' : 'Overall'}</p><div class="h3"><span>${tt.name}</span>${stars(main.stars)}</div>
        ${adv ? `<p>${esc(adv.say)}</p><ul>${adv.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      <div class="verse">${en.verse.map((l, i) => `<p style="--i:${i}">${esc(l)}</p>`).join('')}</div>
      <div class="chips" style="margin-top:12px"><span class="chip kw">${esc(en.keyword)}</span></div>
      <p class="label" style="margin:18px 0 0">Every topic</p>
      <div class="tgrid">${tops.filter((t) => t !== main).map((t) => `<button data-k="${t.key}" aria-expanded="false"><span>${O().topics[t.key]?.name || t.key}</span>${stars(t.stars)}</button>`).join('')}</div>
      <div id="tdetail"></div>
      <a class="card act" id="actLink" href="#/calendar${S.C.pickFor[main?.key] ? `?t=${encodeURIComponent(S.C.pickFor[main.key])}` : ''}"><div><p class="label">Best day to act on this</p><b id="actDay">Find it on your calendar</b></div><span class="go">›</span></a>
      <button class="btn ghost block" id="shareLot" style="margin-top:12px">Share this reading</button>
      <p class="hint">A new lot tomorrow. The oracle offers perspective, not predictions.</p>
    </div>`;
  if (fresh) { buzz([10, 40, 10]); setTimeout(() => sfx('chime'), 400); track('us_oracle_read', { no: d.no, grade: d.grade }); if (S.me) loadJournal(); }
  $$('.tgrid button').forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    $$('.tgrid button').forEach((x) => x.setAttribute('aria-expanded', String(x === b && open)));
    const t = tops.find((x) => x.key === b.dataset.k), a = O().topics[t.key]?.advice[String(t.stars)];
    $('#tdetail').innerHTML = open && a ? `<div class="tdetail"><p><b>${O().topics[t.key].name}:</b> ${esc(a.say)}</p><ul>${a.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    buzz(4);
  }));
  actDay(main?.key);
  $('#shareLot').addEventListener('click', () => {
    const p = pillarOf(localDay());
    shareImage(() => import('./share.js').then((m) => m.drawCardPublic({ art: artOf(p.cn), el: elOf(you()), kicker: `Daily Oracle · ${g}`, title: en.title, sub: en.keyword, meta: `Lot No. ${d.no} · ${fmt(localDay(), 'long')}`, body: en.verse.join(' / ') })), `flowday-oracle-${d.no}.jpg`, 'oracle');
  });
}
// the oracle says "act" or "wait" — this finds when: the best day ahead for that kind of thing
async function actDay(key) {
  const type = S.C.pickFor[key];
  if (!type) return;
  try {
    const r = await data.pick(type, '1m'), p = r.picks[0];
    if (!p || !$('#actDay')) return;
    const t = new Date(p.y, p.m - 1, p.d);
    $('#actDay').textContent = `${WEEK[t.getDay()]}, ${MONTHS[t.getMonth()].slice(0, 3)} ${t.getDate()} — for ${S.C.pickTypes[type].charAt(0).toLowerCase() + S.C.pickTypes[type].slice(1)}`;
  } catch {}
}
function closedView(d) {
  $('#orc').innerHTML = `<div class="lotno"><span>Lot</span><b>No. ${d.no}</b></div>
    <p class="orc-q">${d.question ? `“${esc(d.question)}”` : ''}</p>
    <div class="toss-area">${blocks(['round', 'flat'])}</div>
    <p class="orc-note" style="text-align:center">${O().jiao.closed}</p>`;
}

async function loadJournal() {
  try {
    const { list } = await api('GET', 'draws');
    if (!$('#journal')) return;
    $('#journal').innerHTML = list.length ? list.slice(0, 30).map((x) => { const en = lotEn(x.no); return `<div class="jrow"><div class="jd"><b>${fmt(x.day, 'md')}</b><span>No. ${x.no}</span></div>
      <div><h3>${esc(en?.title || '')}</h3><p>${esc(en?.keyword || '')}${x.question ? ` · “${esc(x.question)}”` : ''}</p></div></div>`; }).join('')
      : '<p class="small" style="margin:0">Every lot you draw is kept here.</p>';
  } catch { $('#journal') && ($('#journal').innerHTML = ''); }
}

// ---- helpers ----
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function holdButton(btn, ms, done) {
  const arc = btn.querySelector('.fill'), c = 2 * Math.PI * 46;
  arc.style.strokeDasharray = `0 ${c}`;
  let t0 = 0, raf = 0, fired = false;
  const reset = () => { fired = false; btn.classList.remove('on', 'done'); arc.style.strokeDasharray = `0 ${c}`; };
  const fire = () => { fired = true; btn.classList.add('done'); Promise.resolve(done()).then((ok) => { if (ok === false) reset(); }); };
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); arc.style.strokeDasharray = `${c * k} ${c}`; if (k >= 1) { fire(); return; } if (Math.round(k * 10) !== Math.round((k - 0.02) * 10)) buzz(3); raf = requestAnimationFrame(step); };
  const start = (e) => { e.preventDefault(); if (fired) return; t0 = performance.now(); btn.classList.add('on'); raf = requestAnimationFrame(step); };
  const stop = () => { if (fired) return; cancelAnimationFrame(raf); btn.classList.remove('on'); arc.style.strokeDasharray = `0 ${c}`; };
  btn.addEventListener('pointerdown', start); btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !fired) fire(); });
}
