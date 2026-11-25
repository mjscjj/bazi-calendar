// 问事：写下一件拿不准的事 → 按住起卦 → 全屏把真实的推算演一遍（取数、相加、除余、八卦环锁定、六爻落定、动爻翻转、体用生克）
// → AI 写白话解读 → 给两个适合去做的日子 → 同一卦里追问 1–2 次（不另收费）→ 7 天后回看那件事后来怎样了。
// 样子走现代、克制的「推算仪器」风格：细线、等宽数字、一点强调色，不用水墨和印章。
import { $, $$, esc, api, toast, onClick, currentPath, dtText, track, localToday } from './core.js';
import { THEME, WEEK, WX, hhShort } from './data.js';
import { S } from './state.js';
import { footHtml, memberLockHtml } from './today.js';
import { openPay } from './pay.js';
import { openPicker } from './calendar.js';
import { openDay } from './day.js';
import { share } from './share.js';

const phead = (title, back = true) => `<div class="phead">${back ? '<button type="button" class="back" data-back aria-label="返回">‹</button>' : ''}<h1>${title}</h1></div>`;
const TEND = { 顺: 'good', 先阻后顺: 'mid', 宜缓: 'slow', 有阻: 'bad' };
export const tendHtml = (t) => `<span class="tend t-${TEND[t] || 'mid'}">${esc(t)}</span>`;
// 体（你）和另一卦的关系：s 是画走势用的高低，dir 是谁作用于谁（in：这件事作用于你；out：你作用于这件事）
const REL = {
  用生体: { s: 0.9, dir: 'in', verb: '生', say: '这件事在帮你' },
  比和: { s: 0.72, dir: 'eq', verb: '比和', say: '你和这件事同气' },
  体克用: { s: 0.58, dir: 'out', verb: '克', say: '你压得住这件事' },
  体生用: { s: 0.34, dir: 'out', verb: '生', say: '你要为它付出' },
  用克体: { s: 0.16, dir: 'in', verb: '克', say: '这件事在压你' },
};
const rel = (k) => REL[k] || REL.比和;
const wxc = (w) => 'w' + WX.indexOf(w);
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// 一卦六根线（从下往上画）：阳爻一整根，阴爻断成两截；mv 是动爻
function hexSvg(lines, { mv = 0, cls = '' } = {}) {
  const bars = lines.map((v, i) => {
    const y = 85 - i * 17, c = `ln${i + 1 === mv ? ' mv' : ''}`;
    return v ? `<rect class="${c}" style="--k:${i}" x="0" y="${y}" width="100" height="10" rx="2"/>`
      : `<g class="${c}" style="--k:${i}"><rect x="0" y="${y}" width="43" height="10" rx="2"/><rect x="57" y="${y}" width="43" height="10" rx="2"/></g>`;
  }).join('');
  return `<svg class="hx ${cls}" viewBox="0 0 100 95" aria-hidden="true">${bars}</svg>`;
}
// 八卦的三根线，放在八卦环上
const triSvg = (lines) => lines.map((v, i) => {
  const y = 9 - i * 8;
  return v ? `<rect x="-14" y="${y}" width="28" height="4.6" rx="1"/>` : `<rect x="-14" y="${y}" width="12" height="4.6" rx="1"/><rect x="2" y="${y}" width="12" height="4.6" rx="1"/>`;
}).join('');

// 轻微的声音（现场合成，不用音频文件）：tick 是锁定，chime 是得出结果
let actx = null;
function audioOn() {
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC && !actx) actx = new AC(); if (actx && actx.state === 'suspended') actx.resume(); } catch { /* 没有声音也不影响 */ }
}
function tone(freqs, len, vol) {
  try {
    if (!actx) return;
    const t0 = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + len + 0.05);
    }
  } catch { /* 无所谓 */ }
}
const tick = () => tone([1760], 0.07, 0.05), chime = () => tone([523.25, 783.99, 1046.5], 1.4, 0.035);
const vib = (p) => { if (navigator.vibrate) navigator.vibrate(p); };

// ---------- 写问题 ----------
let draft = { question: '', category: '', method: 'time', nums: ['', '', ''] };
let clockTimer = null;
const clockText = () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':'); };
// 起卦方式：两段切换。「此刻」把要用的四个数缩成一行（旁边走秒）；「报三个数」选中才展开三个格子
function methodHtml(q) {
  const ins = (q.moment && q.moment.inputs) || [];
  return '<div class="akmode"><span class="segs" role="group" aria-label="起卦方式">'
    + `<button type="button" data-amethod="time" aria-pressed="${draft.method === 'time'}">此刻起卦</button><button type="button" data-amethod="nums" aria-pressed="${draft.method === 'nums'}">报三个数</button></span>`
    + `<p class="akmline"${draft.method === 'time' ? '' : ' hidden'}><i class="aklive"></i><span class="akm-n">${ins.map((x) => `<b>${x.n}</b>`).join('')}</span><small>${ins.map((x) => esc(x.label)).join(' ')}</small><em id="amClock">${clockText()}</em></p>`
    + `<p class="akmline"${draft.method === 'nums' ? '' : ' hidden'}><small>想着这件事，凭直觉报三个 1–999 的数</small></p>`
    + `<div class="nums3"${draft.method === 'nums' ? '' : ' hidden'}>${[0, 1, 2].map((i) => `<input name="n${i}" type="number" inputmode="numeric" min="1" max="999" placeholder="${['第一个数', '第二个数', '第三个数'][i]}" value="${esc(draft.nums[i])}" aria-label="第 ${i + 1} 个数">`).join('')}</div></div>`;
}
export function pageAsk() {
  const v = $('#view');
  clearInterval(clockTimer);
  v.innerHTML = phead('问一件事') + '<div class="sk" style="height:420px"></div>';
  api('GET', 'asks/quota').then((q) => {
    if (currentPath() !== '/ask') return;
    S.askQuota = q;
    if (q.mode === 'blocked') { v.innerHTML = phead('问一件事') + memberLockHtml('问事（会员不限次）') + '<p style="margin:0;text-align:center"><a class="tbtn" href="#/asks">看以前的问事记录 ›</a></p>' + footHtml(); return; }
    if (!draft.category) draft.category = q.categories[0];
    // 会员问事不限次；体验期送 1 次；以前单买的次数没会员时还能用；都没有就先开通会员
    const left = q.unlimited ? '会员 · 问事不限次' : q.free ? '体验期送 <b>1</b> 次' : q.credits ? `还有 <b>${q.credits}</b> 次` : '开通会员后问事不限次';
    const cost = q.unlimited ? '会员不限次' : q.free ? '本次免费' : q.credits ? '用 1 次' : '先开通会员';
    v.innerHTML = phead('问一件事')
      + '<div class="askwrap">'
      + `<div class="quota"><span>拿不准的事，起一卦看倾向</span><span>${left}</span></div>`
      + '<form class="askpad" id="askForm" novalidate>'
      + `<label class="askin"><span class="lbl">想问什么</span><textarea name="question" maxlength="60" rows="2" enterkeyhint="done" placeholder="比如：这周找老板谈加薪合适吗？">${esc(draft.question)}</textarea><span class="cnt" id="askCount">${draft.question.length} / 60</span></label>`
      + `<div class="acats" role="group" aria-label="是哪方面">${q.categories.map((c) => `<button type="button" data-acat-v="${esc(c)}" aria-pressed="${c === draft.category}">${esc(c)}</button>`).join('')}</div>`
      + methodHtml(q)
      // 底部常驻：手机上固定在屏幕底部，键盘弹起时贴在键盘上方；出错和提示也写在这里，总看得到
      + `<div class="akbar"><div class="err" id="askErr"></div><p class="holdtip" id="holdTip"></p>`
      + `<button type="button" class="akhold" data-hold${q.ready ? '' : ' disabled'}><i class="fill"></i><span class="hlbl"><b>${q.ready ? '按住起卦' : '解读服务维护中，稍后再来'}</b>${q.ready ? `<small>${cost} · 按住 1 秒</small>` : ''}</span></button></div></form>`
      + '<p class="note" style="margin:0">卦象和倾向按梅花易数规则算出，每一步都可以在结果页「看推演」里核对；白话解读由 AI 生成，仅供参考。健康、投资、法律这类问题请找专业人士，这里不解答。</p>'
      + '<p style="margin:0;text-align:center"><a class="tbtn" href="#/asks">问事记录 ›</a></p></div>' + footHtml();
    const f = $('#askForm');
    f.elements.question.addEventListener('input', function () { draft.question = this.value; $('#askCount').textContent = this.value.length + ' / 60'; });
    // 问题就一句话：回车＝写完，收起键盘（输入法还在选字时不算）
    f.elements.question.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); this.blur(); } });
    $$('.nums3 input', f).forEach((el, i) => el.addEventListener('input', () => { draft.nums[i] = el.value; }));
    liftBar();
    clockTimer = setInterval(() => { const c = $('#amClock'); if (!c || currentPath() !== '/ask') { clearInterval(clockTimer); return; } c.textContent = clockText(); }, 1000);
  }, (e) => { v.innerHTML = phead('问一件事') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
onClick('[data-acat-v]', (el) => { draft.category = el.getAttribute('data-acat-v'); $$('[data-acat-v]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false')); });
onClick('[data-amethod]', (el) => {
  draft.method = el.getAttribute('data-amethod');
  $$('[data-amethod]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
  const [tl, nl] = $$('.akmline');
  tl.hidden = draft.method !== 'time'; nl.hidden = $('.nums3').hidden = draft.method !== 'nums';
  if (draft.method === 'nums') $('.nums3 input').focus();
});
// 键盘弹起时，底部的「按住起卦」贴在键盘上方：iOS 和新版安卓的键盘都只缩可视区域，不缩页面
function liftBar() {
  const bar = $('.akbar'), vv = window.visualViewport;
  if (!bar || !vv) return;
  const off = Math.round(window.innerHeight - vv.height - vv.offsetTop);
  bar.style.transform = off > 1 ? `translateY(${-off}px)` : '';
}
if (window.visualViewport) { visualViewport.addEventListener('resize', liftBar); visualViewport.addEventListener('scroll', liftBar); }
// 起卦前先检查：问题写具体、报的数在范围里
function draftOk() {
  const f = $('#askForm'), err = $('#askErr');
  if (!f) return false;
  draft.question = f.elements.question.value;
  err.textContent = '';
  if (draft.question.trim().length < 4) { err.textContent = '把想问的事写具体一点，至少 4 个字'; f.elements.question.focus(); return false; }
  if (draft.method === 'nums' && draft.nums.some((n) => !(+n >= 1 && +n <= 999))) { err.textContent = '报三个 1 到 999 之间的数'; return false; }
  return true;
}
function submitAsk() {
  const btn = $('#askForm [data-hold]');
  if (btn) btn.disabled = true;
  const body = { question: draft.question.trim(), category: draft.category, method: draft.method, nums: draft.nums.map((n) => +n) };
  api('POST', 'asks', body).then((d) => {
    track('ask_done', { category: body.category, method: body.method, repeat: !!d.repeat });
    if (d.repeat) toast('同一件事一天只起一卦，这是上次的结果');
    else { S.askFresh = d.ask.id; draft = { question: '', category: '', method: 'time', nums: ['', '', ''] }; }
    location.hash = '#/ask/result?id=' + d.ask.id;
  }, (e) => {
    if (btn) { btn.disabled = false; btn.classList.remove('fired'); $('b', btn).textContent = '按住起卦'; }
    if (e.status === 402 && e.data.error === 'need_member') { openPay(() => { if (currentPath() === '/ask') submitAsk(); }); return; }
    if (e.status === 402) { openPay(() => pageAsk()); return; }
    const err = $('#askErr');
    if (err) err.textContent = e.message;
  });
}
// 按住起卦：按住 1 秒圆满才起（也防误点扣次数）；松开早了就提示一句。键盘上回车、空格直接起
let hold = null;
const HOLD_MS = 1000;
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('#askForm [data-hold]');
  if (!b || b.disabled || e.button > 0) return;
  if (!draftOk()) { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); return; }
  e.preventDefault();
  try { b.setPointerCapture(e.pointerId); } catch { /* 没关系 */ }
  audioOn(); vib(8);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  b.classList.add('holding'); $('b', b).textContent = '想着这件事…';
  hold = { b, fired: false, t: setTimeout(() => { hold.fired = true; b.classList.add('fired'); vib([10, 40, 16]); tick(); submitAsk(); }, HOLD_MS) };
});
function release() {
  if (!hold) return;
  const { b, fired, t } = hold;
  hold = null;
  clearTimeout(t);
  b.classList.remove('holding');
  if (!fired) { $('b', b).textContent = '按住起卦'; const tip = $('#holdTip'); if (tip) { tip.textContent = '再按久一点，等进度走满'; tip.classList.remove('flash'); void tip.offsetWidth; tip.classList.add('flash'); clearTimeout(tipTimer); tipTimer = setTimeout(() => { tip.textContent = ''; }, 2600); } }
}
let tipTimer = null;
document.addEventListener('pointerup', release);
document.addEventListener('pointercancel', release);
document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-hold]')) e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  const b = e.target.closest && e.target.closest('#askForm [data-hold]');
  if (!b || b.disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  if (draftOk()) { audioOn(); b.classList.add('fired'); submitAsk(); }
});
document.addEventListener('submit', (e) => { if (e.target.id === 'askForm') e.preventDefault(); });

// ---------- 推演：把真实的起卦过程演一遍 ----------
let castT = [];
const later = (ms, fn) => castT.push(setTimeout(fn, ms));
function closeCast() {
  castT.forEach(clearTimeout); castT = [];
  const c = $('#cast');
  if (!c) return;
  c.classList.add('out');
  setTimeout(() => c.remove(), 420);
  const gx = $('.gx');
  if (gx) gx.classList.add('go');
}
const remText = (st) => `${st.sum} ÷ ${st.div} 余 <b>${st.sum % st.div}</b>${st.sum % st.div ? '' : `<small>（按 ${st.div}）</small>`}`;
function castHtml(a, tris) {
  const g = a.gua, c = g.cast.calc, T = (r) => tris.find((t) => t.num === r);
  const row = (k, name, st, out) => `<div class="crow" data-row="${k}"><span class="ck">${name}</span>`
    + `<span class="cf">${st.parts.length > 1 ? `${st.parts.join(' + ')} = <b>${st.sum}</b>` : `<b>${st.sum}</b>`}</span><span class="cm">${remText(st)}</span><span class="cr">${out}</span></div>`;
  const ring = tris.map((t, i) => `<g class="rt" data-n="${t.num}" transform="rotate(${i * 45})"><g transform="translate(0 -101)">${triSvg(t.lines)}</g><text y="-72" text-anchor="middle">${esc(t.name)}</text></g>`).join('');
  const ticks = Array.from({ length: 72 }, (_, i) => `<line x1="0" y1="${i % 9 ? -126 : -132}" x2="0" y2="-120" transform="rotate(${i * 5})"/>`).join('');
  const now = rel(g.now.rel), dirTxt = { in: '←', out: '→', eq: '=' }[now.dir];
  return `<div class="cast" id="cast" role="dialog" aria-label="起卦推演"><div class="cast-grid" aria-hidden="true"></div>`
    + `<div class="ctop"><span>起卦推演 · ${g.cast.method === 'time' ? '此刻' : '报数'} · ${esc(g.cast.text)}</span><button type="button" class="cskip" data-cast-skip>跳过</button></div>`
    + `<p class="cq">${esc(a.question)}</p>`
    + `<div class="cins">${c.inputs.map((x, i) => `<span style="--k:${i}"><b data-to="${x.n}">0</b><small>${esc(x.label)}</small></span>`).join('')}</div>`
    + `<div class="cstage"><svg class="cring" viewBox="-140 -140 280 280" aria-hidden="true"><circle r="120" class="c1"/><circle r="86" class="c2"/><g class="ticks">${ticks}</g><g class="rg">${ring}</g><path class="ptr" d="M0 -136 L-6 -146 L6 -146 Z"/></svg>`
    + `<div class="cbuild"><div class="hxbox">${hexSvg([1, 1, 1, 1, 1, 1], { cls: 'skel' })}${hexSvg(g.ben.lines, { mv: g.moving })}</div><p class="cname"><b>${esc(g.ben.name)}</b><span>${esc(g.bian.name)}</span></p></div>`
    // 最后一步：八卦环淡出，结论就显示在环的位置上（矮屏也不会被截）
    + `<div class="cend"><div class="crel ${now.dir}"><span class="${wxc(g.ti.wx)}"><i></i>你<small>${esc(g.ti.name)} · ${esc(g.ti.wx)}</small></span><em>${dirTxt} ${esc(now.verb)}</em><span class="${wxc(g.yong.wx)}"><i></i>这件事<small>${esc(g.yong.name)} · ${esc(g.yong.wx)}</small></span></div>`
    + `<p class="ctend t-${TEND[g.tendency] || 'mid'}"><small>倾向</small><b>${esc(g.tendency)}</b></p><button type="button" class="btn primary" data-cast-skip>看解读</button></div></div>`
    + `<div class="crows">${row('up', '上卦', c.up, `${esc(T(c.up.r).name)} · ${esc(T(c.up.r).image)}`)}${row('low', '下卦', c.low, `${esc(T(c.low.r).name)} · ${esc(T(c.low.r).image)}`)}${row('mv', '动爻', c.mv, `第 ${c.mv.r} 爻`)}</div></div>`;
}
// 数字像计数器一样滚到目标值
function rollTo(el, to, ms = 520) {
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = k < 1 ? Math.floor(Math.random() * Math.max(10, to * 1.6)) : to; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function playCast(a, tris) {
  if (!a.gua.cast.calc || !tris) return;
  $('#cast')?.remove();
  castT.forEach(clearTimeout); castT = [];
  document.body.insertAdjacentHTML('beforeend', castHtml(a, tris));
  const c = $('#cast'), g = a.gua, calc = g.cast.calc, rg = $('.rg', c), lines = $$('.cbuild .hx:not(.skel) .ln', c);
  const rows = { up: $('[data-row="up"]', c), low: $('[data-row="low"]', c), mv: $('[data-row="mv"]', c) };
  $$('.cins b', c).forEach((b, i) => later(250 + i * 200, () => rollTo(b, +b.getAttribute('data-to'))));
  let rot = 0;
  const spinTo = (r, extra) => { rot = rot - extra * 360 - ((((r - 1) * 45 + rot) % 360) + 360) % 360; rg.style.transform = `rotate(${rot}deg)`; };
  const land = (r) => { $$('.rt', c).forEach((t) => t.classList.toggle('on', +t.getAttribute('data-n') === r)); tick(); vib(8); };
  const base = 250 + calc.inputs.length * 200 + 500;
  // 上卦：算 → 八卦环转起来，锁定 → 上面三根线落下
  later(base, () => rows.up.classList.add('on'));
  later(base + 350, () => spinTo(calc.up.r, 2));
  later(base + 1650, () => { land(calc.up.r); rows.up.classList.add('done'); lines.slice(3).forEach((l) => l.classList.add('in')); });
  // 下卦
  later(base + 2000, () => rows.low.classList.add('on'));
  later(base + 2350, () => spinTo(calc.low.r, 2));
  later(base + 3650, () => { land(calc.low.r); rows.low.classList.add('done'); lines.slice(0, 3).forEach((l) => l.classList.add('in')); $('.cbuild', c).classList.add('named'); });
  // 动爻：那一根闪一下翻过来，本卦变成变卦
  later(base + 4000, () => { rows.mv.classList.add('on'); c.classList.add('ringoff'); });
  later(base + 4400, () => { rows.mv.classList.add('done'); lines[g.moving - 1].classList.add('flash'); tick(); });
  later(base + 5000, () => {
    // 动爻翻过来：先压扁，换成变卦里那一根的样子，再展开
    const el = lines[g.moving - 1];
    el.classList.remove('flash'); el.classList.add('squeeze');
    later(200, () => {
      const tmp = document.createElement('div');
      tmp.innerHTML = hexSvg(g.bian.lines, { mv: g.moving });
      const nu = $$('.ln', tmp)[g.moving - 1];
      nu.classList.add('in', 'flash', 'unsqueeze');
      el.replaceWith(nu);
      $('.cbuild', c).classList.add('changed'); vib(8);
    });
  });
  // 体用生克 → 倾向
  later(base + 5700, () => c.classList.add('st-end'));
  later(base + 6300, () => { c.classList.add('st-tend'); chime(); vib([12, 60, 18]); });
  later(base + 8600, closeCast);
}
onClick('[data-cast-skip]', () => closeCast());
onClick('[data-cast-replay]', () => { if (S.ask) { audioOn(); playCast(S.ask, S.askTris); track('ask_replay'); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#cast')) closeCast(); });

// ---------- 结果 ----------
let pollTimer = null;
const LV = ['死', '囚', '休', '相', '旺'];
const monthLv = (state) => { const m = /（(.)）/.exec(state || ''); return m ? LV.indexOf(m[1]) : 2; };
// 眼下 → 后来的走势：用体用关系的好坏定高低，画一条线
function trendSvg(g) {
  const y = (s) => 64 - s * 54, a = y(rel(g.now.rel).s), b = y(rel(g.later.rel).s), m = (a + b) / 2;
  const d = `M50 ${a} C 90 ${a}, 110 ${m}, 150 ${m} S 210 ${b}, 250 ${b}`;
  return `<svg class="trend" viewBox="0 0 300 72" aria-hidden="true"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>`
    + [0.25, 0.5, 0.75].map((s) => `<line class="gl" x1="30" x2="290" y1="${y(s)}" y2="${y(s)}"/>`).join('')
    + `<text class="ax" x="2" y="${y(0.86)}">顺</text><text class="ax" x="2" y="${y(0.1)}">阻</text>`
    + `<path class="area" d="${d} L250 70 L50 70 Z"/><path class="curve" d="${d}" pathLength="100"/>`
    + `<circle class="pt" cx="50" cy="${a}" r="4.5"/><circle class="pt now" cx="250" cy="${b}" r="4.5"/><circle class="halo" cx="250" cy="${b}" r="4.5"/></svg>`;
}
const noteText = (g) => (g.now.rel === g.later.rel ? `眼下和后来都是「${g.now.text}」` : `眼下${g.now.text}，后来${g.later.text}`);
function guaHtml(a, fresh) {
  const g = a.gua;
  return `<section class="card gx${fresh ? '' : ' go'} t-${TEND[g.tendency] || 'mid'}">`
    + trendSvg(g)
    + '<div class="gxcols">'
    + `<div><small>眼下 · 本卦</small>${hexSvg(g.ben.lines, { mv: g.moving })}<b>${esc(g.ben.name)}</b><span>${esc(g.now.text)}</span></div>`
    + `<div><small>过程 · 互卦</small>${hexSvg(g.hu.lines)}<b>${esc(g.hu.name)}</b><span>${esc(g.hu.gist.split('，')[0])}</span></div>`
    + `<div><small>后来 · 变卦</small>${hexSvg(g.bian.lines, { mv: g.moving })}<b>${esc(g.bian.name)}</b><span>${esc(g.later.text)}</span></div>`
    + '</div>'
    + `<div class="gxfoot">${g.cast.calc ? '<button type="button" class="tbtn" data-cast-replay>看推演 ↻</button>' : ''}<button type="button" class="tbtn" data-ask-share>分享卦签</button></div></section>`;
}
function relRow(label, ti, other, r, who) {
  const R = rel(r.rel), arrow = { in: '←', out: '→', eq: '=' }[R.dir];
  return `<div class="akw"><span class="akw-k">${label}</span><div class="akw-b"><div class="akrel ${R.dir}">`
    + `<span class="aknd ${wxc(ti.wx)}"><i></i>你<small>${esc(ti.name)} · ${esc(ti.wx)}</small></span>`
    + `<span class="aklk"><em>${arrow} ${esc(R.verb)}</em></span>`
    + `<span class="aknd ${wxc(other.wx)}"><i></i>${who}<small>${esc(other.name)} · ${esc(other.wx)}</small></span></div>`
    + `<p>${R.say}：${esc(r.text)}</p></div></div>`;
}
function whyHtml(a) {
  const g = a.gua, lv = monthLv(g.month.state);
  return '<section class="card awhy"><h3>为什么这样判断</h3>'
    + relRow('眼下', g.ti, g.yong, g.now, '这件事')
    + relRow('后来', g.ti, g.bianYong, g.later, '后来')
    + `<div class="akw"><span class="akw-k">时令</span><div class="akw-b"><div class="akmeter" role="img" aria-label="你在${esc(g.month.zhi)}月的状态：${esc(LV[lv])}">${LV.map((x, i) => `<span class="${i <= lv ? 'on' : ''}${i === lv ? ' cur' : ''}"><i></i>${x}</span>`).join('')}</div>`
    + `<p>${esc(g.month.zhi)}月属${esc(g.month.wx)}，代表你的${esc(g.ti.wx)}${esc(g.month.state)}</p></div></div>`
    + `<details class="guadet"><summary>卦意和推算细节</summary><dl>`
    + `<div><dt>本卦</dt><dd>${esc(g.ben.name)}：${esc(g.ben.gist)}</dd></div><div><dt>互卦</dt><dd>${esc(g.hu.name)}：${esc(g.hu.gist)}（事情中间的过程）</dd></div>`
    + `<div><dt>变卦</dt><dd>${esc(g.bian.name)}：${esc(g.bian.gist)}（事情后来的走向）</dd></div>`
    + `<div><dt>动爻</dt><dd>第 ${g.moving} 爻（从下往上数，亮色那一根）</dd></div>`
    + `<div><dt>体用</dt><dd>动爻在${g.moving <= 3 ? '下' : '上'}卦，所以${g.moving <= 3 ? '上' : '下'}卦${esc(g.ti.name)}是「体」，代表你；另一卦${esc(g.yong.name)}是「用」，代表这件事</dd></div>`
    + '</dl></details></section>';
}
// 结论卡（第一屏）：倾向大字、AI 的一句结论、今天可以做；AI 还没写好时是进度
function heroHtml(a) {
  const g = a.gua;
  return `<section class="card reading akhero t-${TEND[g.tendency] || 'mid'}" id="reading">`
    + `<div class="gxhead"><div class="gxt"><small>这件事的倾向</small><b>${esc(g.tendency)}</b></div><p>${esc(noteText(g))}。</p></div>`
    + `<div class="rbody">${readingHtml(a)}</div></section>`;
}
// 等 AI 写解读的半分钟：按起卦后过了多久，接着走进度
function readingHtml(a) {
  if (a.status === 'done') {
    const r = a.reading;
    return `<p class="hl">${esc(r.headline)}<span class="aitag">AI 生成</span></p><div class="adv"><small>今天可以做</small><p>${esc(r.advice)}</p></div>`;
  }
  if (a.status === 'failed') return '<p class="muted" style="margin:0">解读这次没写出来，已经退回这次的次数。过一会儿再打开，会自动再写一次。</p>';
  const gone = Math.max(0, (Date.now() - Date.parse(a.createdAt)) / 1000), late = gone > STEP2_S;
  return `<div class="writing" style="--gone:${gone.toFixed(1)}s"><div class="wbar"><i></i></div><ol><li class="done">卦象和倾向已经算好</li><li class="s2 ${late ? 'done' : 'on'}">对照你的问题推演</li><li class="s3${late ? ' on' : ''}">写成白话和建议</li></ol><small>大约半分钟。离开也没关系，写好会存在「问事记录」里。</small></div>`;
}
// 三步里第二步走多久（秒），之后进入「写成白话」
const STEP2_S = 12;
let stepTimer = null;
function stepWriting(a) {
  clearInterval(stepTimer);
  stepTimer = setInterval(() => {
    const w = $('#reading .writing');
    if (!w || currentPath() !== '/ask/result') { clearInterval(stepTimer); return; }
    const late = (Date.now() - Date.parse(a.createdAt)) / 1000 > STEP2_S;
    $('.s2', w).className = 's2 ' + (late ? 'done' : 'on');
    $('.s3', w).className = 's3' + (late ? ' on' : '');
  }, 1000);
}
// 解读全文（AI 写的两段），放在走势下面
const bodyHtml = (a) => (a.status === 'done' ? `<section class="card akbody"><h3>详细解读<span class="aitag">AI 生成</span></h3>${a.reading.body.map((p) => `<p>${esc(p)}</p>`).join('')}</section>` : '');
function daysHtml(a) {
  if (!a.days.length) return '';
  return `<section class="card adays"><h3>如果要做，接下来两周里这两天更好</h3><div class="dtiles">${a.days.map((p) => `<button type="button" class="dtile pick2" data-ask-day="${p.y}-${p.m}-${p.d}"><b>${p.m}月${p.d}日</b><span>周${WEEK[new Date(p.y, p.m - 1, p.d).getDay()]} · ${THEME[p.ssG][0]}</span>${p.hours[0] != null ? `<small>${hhShort(p.hours[0])}</small>` : ''}</button>`).join('')}</div>`
    + `<button type="button" class="btn ghost block" data-ask-pick="${a.id}">用这件事去挑日子</button></section>`;
}
function resultHtml(a, fresh) {
  const g = a.gua;
  // 页头：返回键旁边直接是问的事，省掉一行「问事」标题
  return `<div class="phead akq"><button type="button" class="back" data-back aria-label="返回">‹</button><div class="askq" role="heading" aria-level="1"><b>${esc(a.question)}</b><small>${esc(a.category)} · ${g.cast.method === 'time' ? '此刻起卦' : '报数 ' + g.cast.nums.join('、')} · ${esc(g.cast.text)}</small></div></div>`
    + '<div class="askwrap">'
    + heroHtml(a)
    + guaHtml(a, fresh)
    + `<div id="akBody">${bodyHtml(a)}</div>`
    + `<div id="followBox">${followHtml(a)}</div>`
    + whyHtml(a)
    + daysHtml(a)
    + `<div id="reviewBox">${reviewHtml(a)}</div>`
    + '<p class="note" style="margin:0">卦象和倾向按梅花易数规则算出；白话解读由 AI 生成，仅供参考，不构成任何决策依据。</p></div>' + footHtml();
}
// ---------- 追问 ----------
const dayCn = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}月${dd}日`; };
function followHtml(a) {
  if (a.status !== 'done') return '';
  const fo = a.follow, list = a.follows || [];
  if (!list.length && !fo.open) return '';
  const pending = list.some((f) => f.status === 'pending');
  const items = list.map((f) => `<div class="fitem"><p class="fq">${esc(f.question)}</p>`
    + (f.status === 'done' ? `<p class="fa">${esc(f.reading.answer)}</p><div class="adv"><small>接下来可以做</small><p>${esc(f.reading.advice)}</p></div>`
      : f.status === 'failed' ? '<p class="muted fa">这次没写出来，不占追问次数，可以再问一次。</p>'
        : '<div class="writing short"><div class="wbar"><i></i></div><small>正在写，十几秒。</small></div>') + '</div>').join('');
  const left = fo.left && !pending
    ? `<form class="followf" id="followForm" novalidate><input name="q" maxlength="60" placeholder="${list.length ? '还想追问什么？' : '比如：什么时候开口比较好？'}" enterkeyhint="send" aria-label="追问"><button type="submit" class="btn primary sm">追问</button></form>`
    : '';
  const tip = pending ? '' : fo.left ? `还能追问 <b>${fo.left}</b> 次，不另收费 · ${dayCn(fo.until)} 前有效` : `${fo.open ? `每一卦最多追问 ${fo.max} 次` : '这一卦的追问已经截止'}，有新情况可以 <a href="#/ask">另起一卦 ›</a>`;
  return `<section class="card follows"><h3>追问<span class="aitag">AI 生成</span></h3>${items}${left}<p class="ftip">${tip}</p></section>`;
}
let followPoll = null;
function pollFollows(id) {
  clearTimeout(followPoll);
  followPoll = setTimeout(() => api('GET', 'asks/' + id).then((d) => {
    if (!S.ask || S.ask.id !== id || currentPath() !== '/ask/result') return;
    S.ask = d.ask;
    const box = $('#followBox');
    if (box) box.innerHTML = followHtml(d.ask);
    if (d.ask.follows.some((f) => f.status === 'pending')) pollFollows(id);
  }, () => pollFollows(id)), 2000);
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'followForm') return;
  e.preventDefault();
  const a = S.ask, input = e.target.elements.q, question = input.value.trim(), btn = $('button', e.target);
  if (!a) return;
  if (question.length < 2) { toast('把想追问的写具体一点'); input.focus(); return; }
  btn.disabled = true;
  api('POST', `asks/${a.id}/follows`, { question }).then((d) => {
    track('ask_follow', { n: d.ask.follows.length });
    S.ask = d.ask;
    $('#followBox').innerHTML = followHtml(d.ask);
    pollFollows(a.id);
  }, (err) => { btn.disabled = false; toast(err.message); });
});

// ---------- 回看 ----------
const outcomePills = (outs, cur, attr) => `<div class="pills opills" role="group" aria-label="后来怎样了">${outs.map((o) => `<button type="button" ${attr}="${o.key}" aria-pressed="${o.key === cur}"${o.hint ? ` title="${esc(o.hint)}"` : ''}>${esc(o.text)}</button>`).join('')}</div>`;
function reviewHtml(a, editing = false) {
  if (a.status !== 'done' || !S.askOutcomes) return '';
  const rv = a.review;
  if (rv.outcome && !editing) {
    return `<section class="card review"><h3>回看</h3><p class="rvsaid"><b>后来：${esc(rv.outcome.text)}</b>${rv.note ? `<span>「${esc(rv.note)}」</span>` : ''}</p>`
      + `<p class="ftip">当时这一卦的倾向是${tendHtml(a.gua.tendency)}，${dayCn(rv.reviewedAt ? new Date(Date.parse(rv.reviewedAt) + 8 * 3600000).toISOString().slice(0, 10) : rv.dueDay)} 记下。<button type="button" class="tbtn" data-review-edit>改一下</button></p></section>`;
  }
  const lead = rv.due ? '这件事后来怎样了？' : `约好了：${dayCn(rv.dueDay)} 回来看看这件事后来怎样了`;
  const sub = rv.due ? '记一下，过段时间回头看，会更了解自己的判断。' : '到时候今天页会提醒你；提前有了结果，也可以现在就记。';
  return `<section class="card review"><h3>回看</h3><p class="rvlead"><b>${lead}</b><small>${sub}</small></p>`
    + `<input class="rvnote" name="note" maxlength="60" placeholder="想的话先写一句发生了什么，再点下面" value="${esc(rv.note || '')}" aria-label="加一句发生了什么（选填）">`
    + outcomePills(S.askOutcomes, rv.outcome && rv.outcome.key, 'data-review') + '</section>';
}
onClick('[data-review]', (el) => {
  const a = S.ask;
  if (!a) return;
  const note = ($('#reviewBox .rvnote') || {}).value || '';
  el.setAttribute('aria-pressed', 'true');
  api('POST', `asks/${a.id}/review`, { outcome: el.getAttribute('data-review'), note: note.trim() }).then((d) => {
    track('ask_review', { outcome: d.ask.review.outcome.key, from: 'result' });
    S.ask = d.ask;
    $('#reviewBox').innerHTML = reviewHtml(d.ask);
  }, (e) => { el.setAttribute('aria-pressed', 'false'); toast(e.message); });
});
onClick('[data-review-edit]', () => { if (S.ask) $('#reviewBox').innerHTML = reviewHtml(S.ask, true); });

export function pageAskResult(r) {
  const id = +r.q.get('id'), v = $('#view');
  clearTimeout(pollTimer); clearTimeout(followPoll); clearInterval(clockTimer);
  const fresh = S.askFresh === id;
  S.askFresh = null;
  v.innerHTML = phead('问事') + '<div class="sk" style="height:320px"></div>';
  const here = () => currentPath() === '/ask/result' && new URLSearchParams(location.hash.split('?')[1] || '').get('id') === String(id);
  const poll = () => {
    pollTimer = setTimeout(() => api('GET', 'asks/' + id).then((d) => {
      if (!here()) return;
      S.ask = d.ask;
      if (d.ask.status === 'pending') { poll(); return; }
      const box = $('#reading .rbody'), body = $('#akBody');
      if (box) { box.innerHTML = readingHtml(d.ask); box.classList.add('appear'); }
      if (body) body.innerHTML = bodyHtml(d.ask);
      const fb = $('#followBox'), rb = $('#reviewBox');
      if (fb) fb.innerHTML = followHtml(d.ask);
      if (rb) rb.innerHTML = reviewHtml(d.ask);
    }, () => { if (here()) poll(); }), 2000);
  };
  api('GET', 'asks/' + id).then((d) => {
    if (!here()) return;
    S.ask = d.ask;
    S.askOutcomes = d.outcomes;
    S.askTris = d.trigrams;
    const show = fresh && d.ask.gua.cast.calc && !reduced();
    v.innerHTML = resultHtml(d.ask, show);
    if (show) playCast(d.ask, d.trigrams);
    if (d.ask.status === 'pending') { poll(); stepWriting(d.ask); }
    if ((d.ask.follows || []).some((f) => f.status === 'pending')) pollFollows(id);
  }, (e) => { v.innerHTML = phead('问事') + `<div class="errbox"><p>${esc(e.message)}</p><a class="btn ghost" href="#/asks">看问事记录</a></div>`; });
}
// 离开结果页时把推演收起来
window.addEventListener('hashchange', () => { if ($('#cast') && currentPath() !== '/ask/result') { castT.forEach(clearTimeout); castT = []; $('#cast').remove(); } });
onClick('[data-ask-share]', () => { if (S.ask) share('gua', { a: S.ask }); });
onClick('[data-ask-day]', (el) => {
  const [y, m, d] = el.getAttribute('data-ask-day').split('-').map(Number);
  api('GET', `calendar?y=${y}&m=${m}&today=${localToday()}`).then((c) => openDay(c.days[d - 1], c.chart, c.name, c.plans), (e) => toast(e.message));
});
onClick('[data-ask-pick]', () => {
  const a = S.ask;
  if (!a) return;
  track('ask_to_pick');
  location.hash = '#/calendar';
  setTimeout(() => openPicker({ name: a.question.replace(/[？?。！!]+$/, '').slice(0, 20), type: a.pickType || '', from: 'ask' }), 300);
});

// ---------- 问事记录 ----------
// 每一卦一张卡：卦象、问题、眼下 → 后来的小走势
const spark = (tr) => { const y = (k) => (18 - rel(k).s * 14).toFixed(1); return `<svg class="spark" viewBox="0 0 40 20" aria-hidden="true"><path d="M3 ${y(tr[0])} C 16 ${y(tr[0])}, 24 ${y(tr[1])}, 37 ${y(tr[1])}"/><circle cx="37" cy="${y(tr[1])}" r="2.4"/></svg>`; };
export function pageAsks() {
  const v = $('#view');
  clearInterval(clockTimer);
  v.innerHTML = phead('问事记录') + '<div class="sk" style="height:200px"></div>';
  api('GET', 'asks').then((d) => {
    if (currentPath() !== '/asks') return;
    v.innerHTML = phead('问事记录') + '<div class="askwrap"><a class="btn primary block" href="#/ask">问一件事</a>'
      + (d.list.length ? `<section class="aglist">${d.list.map((a) => `<button type="button" class="arow t-${TEND[a.tendency] || 'mid'}" data-go="/ask/result?id=${a.id}">${a.lines ? hexSvg(a.lines, { mv: a.moving }) : ''}`
        + `<span class="q">${esc(a.question)}<small>${dtText(a.createdAt)} · ${esc(a.category)} · ${esc(a.ben)}${a.outcome ? ` · 后来${esc(a.outcome.text)}` : a.remind ? ' · <em class="due">该回看了</em>' : ''}</small></span>`
        + `<span class="at">${a.trend ? spark(a.trend) : ''}${tendHtml(a.tendency)}</span></button>`).join('')}</section>`
        : '<div class="empty">还没有问过事。心里有拿不准的事时，来起一卦。</div>') + '</div>' + footHtml();
  }, (e) => { v.innerHTML = phead('问事记录') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
