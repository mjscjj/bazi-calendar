// Oracle: the Daily Oracle (the English Guanyin oracle). Same rules as the Chinese edition's 每日一签:
// write what's on your mind → hold to focus → a lot jumps out of the tube → toss the moon blocks to confirm
// (one up one down = yes; both up = ask more clearly; both down = not yet; three "not yet" = rephrase) → the reading.
import { $, $$, esc, S, api, store, track, toast, buzz, reduced, localDay, fmt, loading, failed, elStyle, elOf, artOf, pillarOf } from './core.js';
import { shareImage } from './share.js';

const view = () => $('#view');
const O = () => S.C.oracle;
const lotEn = (no) => O().lots[String(no)];
const topicKey = () => store.get('oracleTopic')?.day === localDay() ? store.get('oracleTopic').key : null;

export async function pageOracle() {
  view().innerHTML = `<div class="page oracle" style="${elStyle(elOf(S.me.p))}">
    <h1 class="h2" style="margin-top:6px">Daily Oracle</h1>
    <p class="muted" style="margin:6px 0 16px">An old ritual from Chinese temples: one question a day, one lot, and the moon blocks to confirm it.</p>
    <section class="card orc" id="orc">${loading(260)}</section>
    <div class="sec"><p class="label">Your oracle journal</p><div id="journal" class="stack-gap">${loading(70)}</div></div>
  </div>`;
  try {
    const t = S.today && S.today.date === localDay() ? S.today : await api('GET', 'today?date=' + localDay());
    S.today = t;
    render(t.draw);
  } catch (e) { $('#orc').innerHTML = failed(e.message); }
  loadJournal();
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
    <label class="label" for="q">What's on your mind?</label>
    <textarea class="input q" id="q" rows="2" maxlength="80" placeholder="e.g. Should I take the new job?">${esc(d?.question || '')}</textarea>
    <p class="label" style="margin:14px 0 8px">About</p>
    <div class="chips topics">${topics.map(([k, t]) => `<button type="button" class="chip${topicKey() === k ? ' on' : ''}" data-k="${k}">${t.name}</button>`).join('')}</div>
    <div class="tube-wrap"><div class="tube" id="tube">${'<i></i>'.repeat(9)}</div></div>
    <button class="hold" id="hold"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="trk"/><circle cx="50" cy="50" r="46" class="fill" id="holdArc"/></svg><span>Hold to ask</span></button>
    <p class="hint" style="text-align:center">Keep your question in mind while you hold.</p>`;
  $$('.topics .chip').forEach((b) => b.addEventListener('click', () => { $$('.topics .chip').forEach((x) => x.classList.toggle('on', x === b && !x.classList.contains('on'))); buzz(4); }));
  holdButton($('#hold'), 1300, async () => {
    const q = $('#q').value.trim();
    const k = $('.topics .chip.on')?.dataset.k || null;
    store.set('oracleTopic', { day: localDay(), key: k });
    $('#tube').classList.add('shake'); buzz(30);
    try {
      const r = await api('POST', 'draws/today', { date: localDay(), question: q || undefined });
      track('us_oracle_draw', { topic: k, q: !!q });
      await wait(reduced() ? 0 : 1300);
      S.today.draw = r.draw; render(r.draw, true);
    } catch (e) { $('#tube')?.classList.remove('shake'); toast(e.message); }
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
    try { r = await api('POST', 'draws/today/toss', { date: localDay() }); } catch (e) { toast(e.message); busy = false; return; }
    await wait(reduced() ? 0 : 900);
    area.classList.remove('fly'); area.innerHTML = blocks(FACES[r.toss] || ['flat', 'round']); area.classList.add('land'); buzz(r.toss === 'sheng' ? [20, 60, 20] : 25);
    $('#tossRes').textContent = r.toss ? `${L[r.toss].name} — ${L[r.toss].line}` : '';
    track('us_oracle_toss', { r: r.toss });
    S.today.draw = r.draw;
    await wait(reduced() ? 0 : 1300);
    render(r.draw, true);
  };
  $('#toss').addEventListener('click', go);
  // flick up on the blocks to toss
  let y0 = null;
  $('#tossArea').addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  $('#tossArea').addEventListener('pointerup', (e) => { if (y0 != null && y0 - e.clientY > 40) go(); y0 = null; });
}

// ---- 3. the reading ----
function readingView(d, fresh) {
  const en = lotEn(d.no), g = O().grades[d.grade] || d.grade, asked = topicKey();
  const tops = (d.topics || []).slice().sort((a, b) => (b.key === asked) - (a.key === asked));
  $('#orc').innerHTML = `
    <div class="reading${fresh ? ' fresh' : ''}">
      <div class="rd-head"><span class="chip grade g${d.grade === '上签' ? 1 : d.grade === '下签' ? 3 : 2}">${g}</span><span class="small">Lot No. ${d.no}</span></div>
      <h2 class="rd-title">${esc(en.title)}</h2>
      ${d.question ? `<p class="orc-q left">“${esc(d.question)}”</p>` : ''}
      <div class="verse">${en.verse.map((l, i) => `<p style="--i:${i}">${esc(l)}</p>`).join('')}</div>
      <p class="rd-read">${esc(en.reading)}</p>
      <span class="chip kw">${esc(en.keyword)}</span>
      <p class="label" style="margin:22px 0 8px">Topic by topic</p>
      <div class="topiclist">${tops.map((t) => { const tt = O().topics[t.key], a = tt?.advice[String(t.stars)]; return `
        <details class="tp${t.key === asked ? ' asked' : ''}"${t.key === asked ? ' open' : ''}><summary><span>${tt?.name || t.key}${t.key === asked ? ' <em>you asked</em>' : ''}</span><b class="stars">${'★'.repeat(t.stars)}<i>${'★'.repeat(5 - t.stars)}</i></b></summary>
          ${a ? `<p>${esc(a.say)}</p><ul>${a.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</details>`; }).join('')}</div>
      <button class="btn ghost block" id="shareLot" style="margin-top:16px">Share this reading</button>
      <p class="hint">A new lot tomorrow. The oracle offers perspective, not predictions.</p>
    </div>`;
  if (fresh) { buzz([10, 40, 10]); track('us_oracle_read', { no: d.no, grade: d.grade }); loadJournal(); }
  $('#shareLot').addEventListener('click', () => {
    const p = pillarOf(localDay());
    shareImage(() => import('./share.js').then((m) => m.drawCardPublic({ art: artOf(p.cn), el: elOf(S.me.p), kicker: `Daily Oracle · ${g}`, title: en.title, sub: en.keyword, meta: `Lot No. ${d.no} · ${fmt(localDay(), 'long')}`, body: en.verse.join(' / ') })), `sixty-oracle-${d.no}.jpg`, 'oracle');
  });
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
    $('#journal').innerHTML = list.length ? list.slice(0, 30).map((x) => { const en = lotEn(x.no); return `<div class="card jrow"><div class="jd"><b>${fmt(x.day, 'md')}</b><span>No. ${x.no}</span></div>
      <div><h3 class="h3">${esc(en?.title || '')}</h3><p class="small" style="margin:2px 0 0">${esc(en?.keyword || '')}${x.question ? ` · “${esc(x.question)}”` : ''}</p></div></div>`; }).join('')
      : '<div class="card empty"><p>Your lots will be kept here.</p></div>';
  } catch { $('#journal').innerHTML = ''; }
}

// ---- helpers ----
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function holdButton(btn, ms, done) {
  const arc = btn.querySelector('.fill'), c = 2 * Math.PI * 46;
  arc.style.strokeDasharray = `0 ${c}`;
  let t0 = 0, raf = 0, fired = false;
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); arc.style.strokeDasharray = `${c * k} ${c}`; if (k >= 1) { fired = true; btn.classList.add('done'); done(); return; } if (Math.round(k * 10) !== Math.round((k - 0.02) * 10)) buzz(3); raf = requestAnimationFrame(step); };
  const start = (e) => { e.preventDefault(); if (fired) return; t0 = performance.now(); btn.classList.add('on'); raf = requestAnimationFrame(step); };
  const stop = () => { if (fired) return; cancelAnimationFrame(raf); btn.classList.remove('on'); arc.style.strokeDasharray = `0 ${c}`; };
  btn.addEventListener('pointerdown', start); btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
  btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { fired = true; done(); } });
}
