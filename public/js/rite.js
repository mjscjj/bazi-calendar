// 每日一签的仪式：默念（按住三秒）→ 摇签（真的摇手机，或点一下）→ 起签（星盘三圈依次停下）→ 掷筊（按住往上抛）→ 解签。
// 全屏深色，不跟白色 / 深色主题走，点缀色是今天的幸运色。签号和掷筊结果都由服务端定，这里只把过程演出来：
// 星盘中间是你的日柱，天干、地支两圈停在今天的日子上，最外一圈停在服务端给的那支签；筊杯落地的正反面按服务端的结果来。
import { $, esc, api, toast, openSheet, dismissSheet, onClick, track, readLocal, writeLocal, EN } from './core.js';
import { luckVars, GRADE_CLS } from './data.js';
import { S } from './state.js';
import { tm } from './i18n.js';
const t = tm('rite'); // 先查 i18n/en/rite.json

const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
// 英文界面：干支写拼音（辛亥 → Xin Hai）
const PY_G = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui'], PY_Z = ['Zi', 'Chou', 'Yin', 'Mao', 'Chen', 'Si', 'Wu', 'Wei', 'Shen', 'You', 'Xu', 'Hai'];
const gzText = (gz) => (EN && gz ? `${PY_G[GAN.indexOf(gz[0])] || gz[0]} ${PY_Z[ZHI.indexOf(gz[1])] || gz[1]}` : gz);
const FACES = { sheng: [0, 180], xiao: [0, 0], yin: [180, 180] }; // 0：平面朝上；180：凸面朝上
const HOLD_S = 2.6, G = 2700;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = () => matchMedia('(pointer: coarse)').matches;
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* 不支持震动就算了 */ } };
// 一个字一个字浮现；英文按词浮现（span 是 inline-block，单独的空格会被吞掉，词之间的空格留在外面）
const spans = (s, d0, per) => (EN ? String(s).split(/(\s+)/).filter(Boolean) : [...s]).map((ch, i) => (/^\s+$/.test(ch) ? ' ' : `<span style="--d:${(d0 + i * per * (EN ? 1.6 : 1)).toFixed(2)}s">${esc(ch)}</span>`)).join('');
const dots = (n) => `<span class="rdots" role="img" aria-label="${t('{n} 颗星', { n })}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`;
let R = null; // 当前这一场；弹层关掉就清空

// ---------------- 声音：全部现场合成，不用音频文件 ----------------
const A = { ctx: null, master: null, drone: null };
const soundOn = () => readLocal('rite-mute') !== true;
function ac() {
  try {
    if (!A.ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      A.ctx = new C(); A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);
    }
    A.master.gain.value = soundOn() ? 1 : 0;
    if (A.ctx.state === 'suspended') A.ctx.resume();
  } catch { /* 没有声音也不影响 */ }
  return A.ctx;
}
function noise(len, f, q, gain, delay = 0) {
  const c = A.ctx; if (!c) return;
  const n = Math.max(1, Math.floor(c.sampleRate * len)), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 5;
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = b; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.value = gain;
  s.connect(fl).connect(g).connect(A.master); s.start(c.currentTime + delay);
}
function bell(freqs, gain = 0.08, dur = 2.6) {
  const c = A.ctx; if (!c) return; const t = c.currentTime;
  freqs.forEach((f, i) => [1, 2.76, 5.4].forEach((m, j) => {
    const o = c.createOscillator(), g = c.createGain(), a = gain / (1 + j * 2.4) / (1 + i * 0.3);
    o.type = 'sine'; o.frequency.value = f * m;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + j * 0.9));
    o.connect(g).connect(A.master); o.start(t); o.stop(t + dur + 0.1);
  }));
}
const tick = (v) => noise(0.012, 3800, 7, v);
const tock = () => { noise(0.03, 1500, 5, 0.55); bell([392], 0.035, 1.2); };
function rattle(s = 1) { let t = 0; const n = 4 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) { noise(0.02, 2000 + Math.random() * 1500, 7, (0.25 + Math.random() * 0.3) * s, t); t += 0.025 + Math.random() * 0.05; } }
const clack = (v) => { noise(0.05, 800 + Math.random() * 500, 3.5, Math.min(1, v) * 1.2); noise(0.02, 2700, 5, Math.min(1, v) * 0.45); };
function droneOn() {
  const c = A.ctx; if (!c || A.drone) return;
  const g = c.createGain(), lp = c.createBiquadFilter(); g.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 650; lp.connect(g).connect(A.master);
  const os = [110, 164.8, 220.6].map((f, i) => { const o = c.createOscillator(), og = c.createGain(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f; og.gain.value = [0.5, 0.32, 0.1][i]; o.connect(og).connect(lp); o.start(); return o; });
  A.drone = { g, os };
}
const droneLevel = (v) => { if (A.drone) A.drone.g.gain.setTargetAtTime(v, A.ctx.currentTime, 0.18); };
function droneOff() { if (!A.drone) return; const d = A.drone; A.drone = null; d.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.5); setTimeout(() => d.os.forEach((o) => o.stop()), 2500); }

// ---------------- 打开、关闭 ----------------
export function openRite(onChange) {
  const td = S.today, J = td.jiao;
  const body = openSheet(t('每日一签'), '<div class="rit" style="' + luckVars(td.outfit && td.outfit.colors) + '">'
    + '<canvas class="rdust" aria-hidden="true"></canvas><div class="rbloom" aria-hidden="true"></div>'
    + `<ol class="rsteps">${J.steps.map((x) => `<li><i></i>${esc(x)}</li>`).join('')}</ol>`
    + '<div class="rdial" data-nodrag><div class="rdin"><div class="rhalo"></div><svg viewBox="-215 -215 430 430" aria-hidden="true"></svg><div class="rcore"><b></b><small></small></div></div></div>'
    + '<div class="rcap" aria-live="polite"><p></p><small></small></div>'
    + `<div class="rtable" data-nodrag><div class="rfloor"></div><p class="rhint">${t('按住筊杯，往上一抛')}</p></div>`
    + '<div class="rres" aria-live="polite"><b></b><small></small><div class="rtries"></div></div>'
    + '<div class="rctl"></div><div class="rlot"></div></div>', { cls: 'lotrite', onClose: stop });
  const el = $('.rit', body), sheet = el.closest('.sheet');
  if (R) stop();
  R = { t: td, J, onChange, el, sheet, phase: '', spin: 1, hold: { on: false, p: 0, done: false, q: 0 }, energy: 0, J0: { x: 0, y: 0, vx: 0, vy: 0 },
    dust: [], D: { pull: 0, swirl: 0, cx: 0, cy: 0 }, timers: [], question: (td.draw && td.draw.question) || '', last: performance.now(), raf: 0, tossing: null, grab: null, lastTick: 0 };
  // 声音开关放在弹层标题栏里，关掉的人以后都不响
  const sh = $('.sh', sheet), snd = document.createElement('button');
  snd.type = 'button'; snd.className = 'rsnd'; snd.setAttribute('data-rite-snd', ''); snd.textContent = soundOn() ? t('声音 开') : t('声音 关');
  sh.insertBefore(snd, $('.close', sh));
  buildDial(); buildBlocks(); sizeDust();
  $('.rdial', el).addEventListener('pointerdown', holdStart);
  bindTable();
  const d = td.draw;
  if (!d) toAsk();
  else { lockAll(d.no); if (d.status === 'done') toLot(true); else toToss(true); }
  R.raf = requestAnimationFrame(frame);
}
function stop() {
  if (!R) return;
  cancelAnimationFrame(R.raf); R.timers.forEach(clearTimeout); clearInterval(R.scr);
  droneOff(); removeEventListener('devicemotion', onMotion);
  R = null;
}
const later = (fn, ms) => { const r = R; R.timers.push(setTimeout(() => { if (R === r) fn(); }, ms)); };
function setPhase(p) {
  R.phase = p;
  [...R.el.classList].filter((c) => c.startsWith('p-')).forEach((c) => R.el.classList.remove(c));
  R.el.classList.add('p-' + p);
  R.sheet.classList.toggle('inlot', p === 'lot');
}
const setStep = (k) => R.el.querySelectorAll('.rsteps li').forEach((li, i) => { li.className = i < k ? 'done' : i === k ? 'on' : ''; });
// 换说明、换按钮：先淡出，再换内容淡入
function swap(sel, fill) {
  const box = $(sel, R.el); box.classList.add('sw');
  later(() => { fill(box); box.classList.remove('sw'); }, 220);
}
const setCap = (a, b) => swap('.rcap', (box) => { $('p', box).textContent = a; $('small', box).textContent = b || ''; });
const setCtl = (html, after) => swap('.rctl', (box) => { box.innerHTML = html; if (after) after(box); });

// ---------------- 星盘：外圈一百签，中间十二地支，里面十天干，正中是你的日柱 ----------------
function buildDial() {
  const svg = $('.rdial svg', R.el), NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, at, p) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (p) p.appendChild(e); return e; };
  R.mk = mk; R.CP = 2 * Math.PI * 204;
  R.prog = mk('circle', { r: 204, class: 'rpr', 'stroke-dasharray': R.CP, 'stroke-dashoffset': R.CP, transform: 'rotate(-90)' }, svg);
  mk('line', { x1: 0, y1: -40, x2: 0, y2: -196, class: 'rmer' }, svg);
  mk('path', { d: 'M0 -197 L-5 -207 L5 -207 Z', class: 'rmk' }, svg);
  const ring = (items, r, w, base, dir) => {
    const g = mk('g', {}, svg), step = 360 / items.length, glyphs = [];
    mk('circle', { r: r - w, class: 'rrl' }, g); mk('circle', { r: r + w, class: 'rrl' }, g);
    items.forEach((x, i) => {
      mk('line', { x1: 0, y1: -(r - w), x2: 0, y2: -(r + w), transform: `rotate(${i * step + step / 2})`, class: 'rsep' }, g);
      const tx = mk('text', { transform: `rotate(${i * step}) translate(0 ${-r})`, class: 'rgl', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      tx.textContent = x; glyphs.push(tx);
    });
    return { g, step, n: items.length, ang: Math.random() * 360, vel: 0, base, dir, mode: 'free', glyphs, lastIdx: -1 };
  };
  const nr = (() => {
    const r = 170, g = mk('g', {}, svg);
    mk('circle', { r, class: 'rrl' }, g);
    for (let i = 0; i < 100; i++) {
      const long = i % 10 === 0;
      mk('line', { x1: 0, y1: -r, x2: 0, y2: -(r + (long ? 11 : 5)), transform: `rotate(${i * 3.6})`, class: long ? 'rtk l' : 'rtk' }, g);
      if (long) mk('text', { transform: `rotate(${i * 3.6}) translate(0 ${-(r + 21)})`, class: 'rnm', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g).textContent = i + 1;
    }
    return { g, r, step: 3.6, n: 100, ang: Math.random() * 360, vel: 0, base: 5, dir: 1, mode: 'free', glyphs: [], lastIdx: -1 };
  })();
  R.rings = [nr, ring([...ZHI], 128, 15, 7, -1), ring([...GAN], 86, 14, 9, 1)];
  R.inner = mk('g', {}, svg); mk('circle', { r: 50, class: 'rrl dash' }, R.inner); mk('circle', { r: 44, class: 'rrl' }, R.inner);
  R.irAng = 0;
  coreMine();
}
function coreMine() {
  const me = R.t.card && R.t.card.pillar;
  $('.rcore b', R.el).textContent = me ? gzText(me.gz) : t('你');
  $('.rcore small', R.el).textContent = me ? t('你的日柱') : '';
}
// 停下来：像真的转盘一样恒定减速。按当时的速度推算大约停在哪，挑离那里最近、方向一致的那一格；
// 停点比格子多冲一点，最后由一个小弹簧「咔」地拉回格子里
function lockRing(ring, idx, cb, dur = 1.7) {
  let v = ring.vel; if (Math.abs(v) < 240) v = (ring.dir || 1) * (260 + Math.random() * 80);
  const sgn = Math.sign(v), base = -idx * ring.step, proj = ring.ang + v * dur / 2;
  let tgt = base + 360 * Math.round((proj - base) / 360);
  while ((tgt - ring.ang) * sgn < 100) tgt += 360 * sgn;
  const dist = tgt + sgn * Math.min(ring.step * 0.3, 4) - ring.ang;
  Object.assign(ring, { mode: 'decay', a0: ring.ang, v0: v, dist, T: 2 * dist / v, t: 0, target: tgt, idx, cb });
  if (RM()) Object.assign(ring, { ang: tgt, vel: 0, mode: 'detent' });
}
function ratchet(ring) {
  const i = ((Math.round(-ring.ang / ring.step) % ring.n) + ring.n) % ring.n;
  if (i === ring.lastIdx) return; ring.lastIdx = i;
  const now = performance.now(); if (now - R.lastTick < 30) return; R.lastTick = now;
  tick(Math.min(0.5, 0.1 + Math.abs(ring.vel) / 900));
}
function stepRing(ring, dt) {
  if (ring.mode === 'free') {
    ring.vel += (ring.dir * ring.base * R.spin - ring.vel) * (1 - Math.exp(-dt * (R.phase === 'shake' ? 1.4 : 2.4)));
    ring.ang += ring.vel * dt;
  } else if (ring.mode === 'decay') {
    ring.t += dt; const u = Math.min(1, ring.t / ring.T);
    ring.ang = ring.a0 + ring.dist * (1 - (1 - u) * (1 - u)); ring.vel = ring.v0 * (1 - u);
    if (u >= 1) ring.mode = 'detent';
    ratchet(ring);
  } else if (ring.mode === 'detent') {
    const resp = 0.26, damp = 0.5, k = (2 * Math.PI / resp) ** 2, c = 4 * Math.PI * damp / resp, h = dt / 6;
    for (let i = 0; i < 6; i++) { ring.vel += (-k * (ring.ang - ring.target) - c * ring.vel) * h; ring.ang += ring.vel * h; }
    ratchet(ring);
    if (Math.abs(ring.ang - ring.target) < 0.04 && Math.abs(ring.vel) < 1.5) {
      Object.assign(ring, { ang: ring.target, vel: 0, mode: 'locked' });
      if (ring.glyphs[ring.idx]) ring.glyphs[ring.idx].classList.add('hit');
      tock(); buzz(10);
      const cb = ring.cb; ring.cb = null; if (cb) cb();
    }
  }
  ring.g.setAttribute('transform', `rotate(${ring.ang.toFixed(3)})`);
}
function numberMark(no) {
  const [nr] = R.rings;
  if (nr.mark) nr.mark.remove();
  nr.mark = R.mk('text', { transform: `rotate(${(no - 1) * 3.6}) translate(0 ${-(nr.r + 21)})`, class: 'rnm hit', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, nr.g);
  nr.mark.textContent = no;
}
// 已经摇过（回来接着掷、看签文）：三圈直接停在位置上
function lockAll(no) {
  const gz = R.t.almanac.gz, [nr, zr, gr] = R.rings;
  [[nr, no - 1], [zr, ZHI.indexOf(gz[1])], [gr, GAN.indexOf(gz[0])]].forEach(([ring, i]) => {
    Object.assign(ring, { ang: -i * ring.step, vel: 0, mode: 'locked', idx: i, lastIdx: i });
    if (ring.glyphs[i]) ring.glyphs[i].classList.add('hit');
    ring.g.setAttribute('transform', `rotate(${ring.ang})`);
  });
  numberMark(no);
  $('.rcore b', R.el).textContent = no; $('.rcore small', R.el).textContent = t('第 {n} 签', { n: no });
  R.el.classList.add('locked'); R.spin = 1;
}
function unlockAll() {
  R.rings.forEach((ring) => { ring.mode = 'free'; ring.glyphs.forEach((x) => x.classList.remove('hit')); });
  if (R.rings[0].mark) { R.rings[0].mark.remove(); R.rings[0].mark = null; }
  R.el.classList.remove('locked', 'blessed'); coreMine();
}
// 摇的时候星盘本身晃一下：欠阻尼弹簧
function stepJolt(dt) {
  const J = R.J0, resp = 0.2, damp = 0.38, k = (2 * Math.PI / resp) ** 2, c = 4 * Math.PI * damp / resp, h = dt / 4;
  for (let i = 0; i < 4; i++) { J.vx += (-k * J.x - c * J.vx) * h; J.vy += (-k * J.y - c * J.vy) * h; J.x += J.vx * h; J.y += J.vy * h; }
  if (Math.abs(J.x) + Math.abs(J.y) + Math.abs(J.vx) + Math.abs(J.vy) > 0.01) $('.rdin', R.el).style.transform = `translate(${J.x.toFixed(2)}px,${J.y.toFixed(2)}px) rotate(${(J.x * 0.15).toFixed(2)}deg)`;
}

// ---------------- 星尘 ----------------
function sizeDust() {
  const cv = $('.rdust', R.el), dpr = Math.min(2, devicePixelRatio || 1);
  R.W = R.el.clientWidth; R.H = R.el.clientHeight;
  cv.style.height = R.H + 'px'; cv.width = R.W * dpr; cv.height = R.H * dpr;
  R.cx = cv.getContext('2d'); R.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  R.lk = getComputedStyle(R.el).getPropertyValue('--lk').trim() || '#57C2A3';
  if (!RM()) for (let i = 0; i < 130; i++) R.dust.push(newDust());
}
const newDust = () => ({ x: Math.random() * R.W, y: Math.random() * R.H, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8 - 3, r: Math.random() * 1.2 + 0.3, a: Math.random() * 0.45 + 0.1, tw: Math.random() * 6.3, c: Math.random() < 0.18 ? 1 : 0 });
function burst(x, y, n, gold) {
  if (RM()) return;
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 260; R.dust.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: Math.random() * 1.6 + 0.5, a: 1, tw: 0, c: gold ? 2 : 1, life: 1.2 + Math.random() * 1.2, age: 0 }); }
}
function stepDust(dt, t) {
  const { cx, D, W, H } = R, r = $('.rdial', R.el).getBoundingClientRect(), e = R.el.getBoundingClientRect();
  D.cx = r.left - e.left + r.width / 2; D.cy = r.top - e.top + r.height / 2;
  cx.clearRect(0, 0, W, H);
  for (let i = R.dust.length - 1; i >= 0; i--) {
    const p = R.dust[i];
    if (p.life) { p.age += dt; if (p.age > p.life) { R.dust.splice(i, 1); continue; } p.vy += 30 * dt; }
    else {
      const dx = D.cx - p.x, dy = D.cy - p.y, d = Math.hypot(dx, dy) + 1;
      p.vx += ((dx / d) * D.pull * 90 + (-dy / d) * D.swirl * 110) * dt;
      p.vy += ((dy / d) * D.pull * 90 + (dx / d) * D.swirl * 110) * dt;
      if (D.pull > 0.3 && d < 26) Object.assign(p, newDust(), { x: Math.random() < 0.5 ? 0 : W });
    }
    const fr = Math.exp(-dt * (p.life ? 1.4 : 0.9)); p.vx *= fr; p.vy *= fr; p.x += p.vx * dt; p.y += p.vy * dt;
    if (!p.life) { if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5; if (p.y < -5) p.y = H + 5; if (p.y > H + 5) p.y = -5; }
    cx.globalAlpha = Math.min(1, p.life ? p.a * (1 - p.age / p.life) : p.a * (0.55 + 0.45 * Math.sin(t * 1.6 + p.tw)) * (1 + D.pull * 0.8));
    cx.fillStyle = p.c === 2 ? '#E2BC72' : p.c === 1 ? R.lk : '#EDEBE7';
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill();
  }
  cx.globalAlpha = 1;
}

// ---------------- 1 默念：按住三秒（键盘用户回车或按按钮直接过） ----------------
function toAsk() {
  setPhase('ask'); setStep(0);
  Object.assign(R.hold, { on: false, p: 0, done: false, q: 0 });
  setCap(t('心里想着一件事'), R.J.intro);
  setCtl(`<form class="rform" id="drawForm"><input class="rq" name="q" maxlength="${EN ? 60 : 30}" placeholder="${t('想问哪件事？比如：这周的面试（可以不写）')}" enterkeyhint="go" aria-label="${t('想问的事')}">`
    + `<button type="button" class="rbtn hold" data-rite-hold><span class="fill"></span><span class="lb">${t('按住，默念')}</span></button></form>`, (box) => {
    const q = $('input', box); q.value = R.question;
    $('[data-rite-hold]', box).addEventListener('pointerdown', holdStart);
  });
}
function holdStart(e) {
  if (!R || R.phase !== 'ask' || R.hold.done) return;
  e.preventDefault();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 拿不到也照样按 */ }
  ac(); droneOn(); R.hold.on = true; R.hold.q = 0; buzz(8);
  const q = $('#drawForm input', R.el); if (q) { R.question = q.value.trim(); q.blur(); }
  setCap(R.question ? (EN ? `“${R.question}”` : `「${R.question}」`) : t('想着那件事'), t('默念着它，别松手'));
}
function holdEnd() {
  if (!R || !R.hold.on) return;
  R.hold.on = false;
  if (R.hold.done) toShake(); else setCap(t('再来一次'), t('按住不放，默念三秒'));
}
addEventListener('pointerup', holdEnd); addEventListener('pointercancel', holdEnd);
// iPhone 要在手指抬起的这一下里请求「运动与方向」权限，下一步才能真的摇
addEventListener('touchend', () => { if (R && R.hold.done && R.phase !== 'lot') askMotion(); });
function stepHold(dt) {
  const h = R.hold;
  if (h.on && !h.done) {
    h.p = Math.min(1, h.p + dt / HOLD_S);
    const q = Math.floor(h.p * 4); if (q > h.q) { h.q = q; buzz(6); tick(0.18); }
    if (h.p >= 1) { h.done = true; buzz(28); bell([294, 440], 0.05, 2.4); setCap(t('好'), t('松开手指')); }
  } else if (!h.done) h.p += (0 - h.p) * (1 - Math.exp(-dt * 7));
  R.prog.setAttribute('stroke-dashoffset', (R.CP * (1 - h.p)).toFixed(1));
  R.el.style.setProperty('--hp', h.p.toFixed(3));
  R.spin = 1 + h.p * 26; R.D.pull = h.p * 0.9; droneLevel(h.p * 0.075);
}
document.addEventListener('submit', (e) => {
  if (!R || (e.target.id !== 'drawForm' && e.target.id !== 'reaskForm')) return;
  e.preventDefault();
  const q = e.target.elements.q.value.trim();
  if (e.target.id === 'reaskForm') {
    if (!q || q === R.t.draw.question) { toast(t('换一个想问的事')); return; }
    track('draw_reask', { round: R.t.draw.round + 1 });
    R.question = q; unlockAll(); resetBlocks(); toShake();
    return;
  }
  R.question = q; ac(); toShake();
});
onClick('[data-rite-hold]', (el, e) => { if (R && R.phase === 'ask' && e.detail === 0) { R.question = $('#drawForm input', R.el).value.trim(); ac(); toShake(); } });

// ---------------- 2 摇签：真的摇手机，或者点 ----------------
const motion = { asked: false, last: 0, lastJ: 0 };
function onMotion(e) {
  const a = e.accelerationIncludingGravity; if (!a || a.x == null || !R) return;
  const m = Math.hypot(a.x, a.y, a.z), d = Math.abs(m - motion.last); motion.last = m;
  const now = performance.now();
  if (R.phase === 'shake' && d > 11 && now - motion.lastJ > 170) { motion.lastJ = now; jolt(Math.min(1.6, d / 16)); }
}
function listenMotion() { removeEventListener('devicemotion', onMotion); addEventListener('devicemotion', onMotion); }
function askMotion() {
  if (motion.asked) return; motion.asked = true;
  const DM = window.DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === 'function') DM.requestPermission().then((s) => { if (s === 'granted' && R) listenMotion(); }).catch(() => {});
}
function toShake() {
  R.hold.on = false; R.hold.done = true;
  setPhase('shake'); setStep(1); R.energy = 0; R.autoShaking = false;
  R.prog.style.transition = 'stroke-dashoffset .8s'; R.prog.setAttribute('stroke-dashoffset', R.CP); R.el.style.setProperty('--hp', 0);
  R.D.pull = 0; R.D.swirl = 0.7; R.spin = 16; droneOn(); droneLevel(0.035);
  const coarse = COARSE();
  setCap(coarse ? t('摇一摇手机') : t('摇签'), coarse ? t('签在里面翻动，摇到它自己跳出来') : t('点一下，签会在里面翻动'));
  setCtl(`<button type="button" class="rbtn${coarse ? ' ghost' : ''}" data-shake>${coarse ? t('摇不了？点这里') : t('摇签')}</button>`);
  if (coarse && !(window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function')) listenMotion();
  // 签号由服务端定：一进来就去要，摇完时多半已经回来了
  const r = R;
  R.pending = api('POST', 'draws/today', { date: R.t.date, question: R.question }).then((d) => {
    if (R !== r) return null;
    R.t.draw = d.draw; R.onChange();
    track('draw_shake', { no: d.draw.no, q: !!R.question });
    return d.draw;
  }, (e) => {
    if (R !== r) return null;
    toast(e.message); unlockAll(); R.D.swirl = 0; toAsk();
    return null;
  });
}
function jolt(s = 1) {
  if (!R || R.phase !== 'shake') return;
  R.rings.forEach((ring) => { if (ring.mode === 'free') ring.vel += ring.dir * (140 + Math.random() * 220) * s; });
  R.J0.vx += (Math.random() - 0.5) * 900 * s; R.J0.vy += (Math.random() - 0.5) * 700 * s;
  ac(); rattle(Math.min(1.3, s)); buzz(14); R.D.swirl = 1.6;
  R.energy += 0.24 * s;
  if (R.energy >= 1) startLock();
}
onClick('[data-shake]', () => {
  if (!R || R.phase !== 'shake' || R.autoShaking) return;
  askMotion(); R.autoShaking = true;
  let k = 0; const go = () => { if (!R || R.phase !== 'shake') return; jolt(1.15); if (++k < 5) later(go, 230 + Math.random() * 90); };
  go();
});

// ---------------- 3 起签：天干、地支停在今天，最外一圈停在你这一支 ----------------
function startLock() {
  setPhase('lock'); R.D.swirl = 0.25; R.spin = 10; droneLevel(0.02);
  setCtl(`<p class="rsub">${t('起签中')}</p>`);
  setCap('……', t('你 × 今天'));
  const gz = R.t.almanac.gz, [nr, zr, gr] = R.rings;
  R.pending.then((d) => {
    if (!d || !R) return;
    if (d.status === 'done') { lockAll(d.no); toLot(false); return; }
    lockRing(gr, GAN.indexOf(gz[0]), () => {});
    later(() => lockRing(zr, ZHI.indexOf(gz[1]), () => {
      setCap(t('今天 · {gz}日', { gz: gzText(gz) }), t('你 × 今天，起一支签'));
      const b = $('.rcore b', R.el); $('.rcore small', R.el).textContent = t('起签');
      R.scr = setInterval(() => { b.textContent = String(1 + Math.floor(Math.random() * 100)).padStart(2, '0'); }, 60);
      later(() => lockRing(nr, d.no - 1, () => revealNo(d), 2.2), 200);
    }), 560);
  });
}
function revealNo(d) {
  clearInterval(R.scr); numberMark(d.no);
  const b = $('.rcore b', R.el); b.textContent = d.no; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  $('.rcore small', R.el).textContent = t('第 {n} 签', { n: d.no });
  R.el.classList.add('locked'); bell([262, 392], 0.09, 3.2); buzz([18, 60, 18]);
  burst(R.D.cx, R.D.cy, 50, false); droneOff();
  setCap(t('第 {n} 签', { n: d.no }), t('你 × 今天，只有这一支。同一天里不会变'));
  setCtl('<p class="rsub">&nbsp;</p>');
  later(() => toToss(false), 2000);
}

// ---------------- 4 掷筊：按住往上抛；落地的正反面按服务端的结果 ----------------
const FLAT = '<svg viewBox="0 0 120 60"><defs><linearGradient id="rjfa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBF9F4"/><stop offset="1" stop-color="#CFC9BE"/></linearGradient></defs><path d="M8 56C14 6 106 6 112 56C98 44 22 44 8 56Z" fill="url(#rjfa)"/><path d="M18 50C26 22 94 22 102 50" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1.2"/></svg>';
const CVX = '<svg viewBox="0 0 120 60"><defs><linearGradient id="rjcv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55555E"/><stop offset=".6" stop-color="#1E1E24"/><stop offset="1" stop-color="#111114"/></linearGradient><radialGradient id="rjhl" cx=".38" cy=".22" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><path d="M8 56C14 6 106 6 112 56C98 44 22 44 8 56Z" fill="url(#rjcv)" stroke="rgba(255,255,255,.22)" stroke-width=".8"/><path d="M8 56C14 6 106 6 112 56C98 44 22 44 8 56Z" fill="url(#rjhl)"/></svg>';
function buildBlocks() {
  const table = $('.rtable', R.el);
  R.blocks = [0, 1].map((i) => {
    const el = document.createElement('div'); el.className = 'rjb'; el.style.marginLeft = `${i ? 10 : -110}px`;
    el.innerHTML = `<div class="rsh"></div><div class="rbd"><div class="rjf">${FLAT}</div><div class="rjf cv">${CVX}</div></div>`;
    table.appendChild(el);
    return { el, bd: $('.rbd', el), sh: $('.rsh', el), x: 0, vx: 0, h: 0, vh: 0, rx: 0, vrx: 0, rz: i ? 8 : -8, vrz: 0, state: 'rest', final: 0, wob: 0, age: 0, bounces: 0, planned: false, unsure: false };
  });
  resetBlocks();
}
// 没掷之前：一块平面朝上、一块凸面朝上，两面都看得到；回来接着掷，就停在上一次的结果上
function resetBlocks() {
  const d = R.t.draw, last = d && d.tosses && d.tosses[d.tosses.length - 1];
  const f = last && d.status !== 'reask' ? FACES[last] : d && d.status === 'reask' ? FACES.yin : [0, 180];
  R.blocks.forEach((b, i) => Object.assign(b, { x: 0, vx: 0, h: 0, vh: 0, rx: f[i], vrx: 0, state: 'rest', wob: 0, planned: false, unsure: false }));
}
const faceOf = (rx) => (((Math.round(rx / 180) % 2) + 2) % 2 ? 180 : 0);
function toToss(resume) {
  setPhase('toss'); setStep(2); R.el.classList.add('locked');
  const d = R.t.draw, last = d.tosses[d.tosses.length - 1];
  triesHtml();
  resetBlocks();
  $('.rhint', R.el).style.opacity = last ? 0 : '';
  if (resume && last) showWord(last, false);
  else { $('.rres b', R.el).textContent = ''; $('.rres small', R.el).textContent = R.J.drawn; }
  if (d.status === 'reask') reaskView(); else if (d.status === 'closed') closedView(); else tossCtl();
}
function triesHtml() {
  const d = R.t.draw;
  $('.rtries', R.el).innerHTML = Array.from({ length: R.J.maxTries }, (_, i) => `<i class="${d.tosses[i] || ''}" title="${d.tosses[i] ? `${t('第 {n} 次', { n: i + 1 })} · ${esc(R.J.results[d.tosses[i]].name)}` : ''}"></i>`).join('');
}
function tossCtl() {
  const d = R.t.draw, J = R.J, last = d.tosses[d.tosses.length - 1], n = d.tosses.length;
  setCtl((last === 'xiao' ? `<input class="rq" id="jQuestion" maxlength="${EN ? 60 : 30}" value="${esc(d.question || '')}" placeholder="${t('把问题说得更清楚些（可以不改）')}" aria-label="${t('所问之事')}">` : '')
    + `<button type="button" class="rbtn" data-toss>${last ? t('再掷一次（第 {n}/{max} 次）', { n: n + 1, max: J.maxTries }) : t('掷筊')}</button>`
    + `<details class="rrules"><summary>${t('掷筊的规矩')}${n ? t(' · 还能掷 {n} 次', { n: J.maxTries - n }) : ''}</summary><p>${esc(J.rules)}</p></details>`);
}
function showWord(kind, animate) {
  const W = R.J.results[kind], b = $('.rres b', R.el);
  b.textContent = W.name; b.className = kind; if (animate) { void b.offsetWidth; b.classList.add('w'); }
  $('.rres small', R.el).textContent = `${W.face} · ${W.text}`;
}
function reaskView() {
  setPhase('reask');
  $('.rres small', R.el).textContent = R.J.reask;
  setCtl(`<form class="rform" id="reaskForm"><input class="rq" name="q" maxlength="${EN ? 60 : 30}" placeholder="${t('换一个想问的事')}" aria-label="${t('换一个想问的事')}" required>`
    + `<button type="submit" class="rbtn">${t('换个问题，重新摇签')}</button></form>`
    + `<p class="rsub">${t('今天还能换 {n} 次问题', { n: R.t.draw.roundsLeft })}</p>`);
}
function closedView() {
  setPhase('closed');
  const d = R.t.draw;
  $('.rres small', R.el).textContent = d.tosses.every((x) => x === 'yin') ? R.J.roundsOut : R.J.giveUp;
  setCtl(`<p class="rsub">${t('第 {n} 签今天没有求成。明天再来摇一支。', { n: d.no })}</p><button type="button" class="rbtn ghost" data-close-sheet>${t('好的，改日再来')}</button>`);
}
function bindTable() {
  const table = $('.rtable', R.el);
  table.addEventListener('pointerdown', (e) => {
    if (!R || R.phase !== 'toss' || R.tossing || !$('[data-toss]', R.el)) return;
    e.preventDefault(); try { table.setPointerCapture(e.pointerId); } catch { /* 无所谓 */ }
    ac(); R.grab = { y0: e.clientY, hist: [[e.clientY, performance.now()]], lift: 0 };
    R.blocks.forEach((b) => { b.state = 'held'; }); buzz(6);
  });
  table.addEventListener('pointermove', (e) => {
    const g = R && R.grab; if (!g) return;
    g.hist.push([e.clientY, performance.now()]); if (g.hist.length > 6) g.hist.shift();
    const o = g.y0 - e.clientY; g.lift = Math.max(0, (o * 120 * 0.55) / (120 + 0.55 * Math.abs(o)));
  });
  const release = () => {
    const g = R && R.grab; if (!g) return; R.grab = null;
    const a = g.hist[0], b = g.hist[g.hist.length - 1], dt = Math.max(0.016, (b[1] - a[1]) / 1000), vUp = (a[0] - b[0]) / dt;
    if (vUp > 260 || g.lift > 38) toss(Math.min(1900, Math.max(1150, 1050 + vUp * 0.45)));
    else R.blocks.forEach((x) => { x.state = 'drop'; x.vh = 0; });
  };
  table.addEventListener('pointerup', release); table.addEventListener('pointercancel', release);
}
onClick('[data-toss]', () => toss(1350 + Math.random() * 200));
function toss(v0) {
  if (!R || R.phase !== 'toss' || R.tossing) return;
  const q = $('#jQuestion', R.el), r = R;
  R.tossing = { kind: null, data: null, err: null, shown: false };
  ac(); rattle(0.5); buzz(10);
  const btn = $('[data-toss]', R.el); if (btn) btn.disabled = true;
  $('.rhint', R.el).style.opacity = 0; $('.rres b', R.el).textContent = ''; $('.rres b', R.el).className = ''; $('.rres small', R.el).innerHTML = '&nbsp;';
  R.blocks.forEach((b, i) => {
    const v = v0 * (i ? 1.06 : 0.95) * (1 + (Math.random() - 0.5) * 0.06), T = 2 * v / G;
    Object.assign(b, { state: 'air', vh: v, h: Math.max(b.h, 1), vrx: 360 * (2 + i) / T, vrz: (i ? 1 : -1) * (25 + Math.random() * 45), vx: (i ? 1 : -1) * (20 + Math.random() * 40), bounces: 0, age: 0, planned: false, unsure: false });
  });
  api('POST', 'draws/today/toss', { date: R.t.date, ...(q ? { question: q.value.trim() } : {}) })
    .then((d) => { if (R === r && R.tossing) Object.assign(R.tossing, { kind: d.toss, data: d }); },
      (e) => { if (R === r && R.tossing) R.tossing.err = e; });
}
// 结果回来时筊还在空中：按剩下的飞行时间重新算转速，让它落地时正好是该有的那一面
function plan(b, face) {
  const tau = (b.vh + Math.sqrt(b.vh * b.vh + 2 * G * b.h)) / G;
  if (tau < 0.08) return;
  let fin = Math.round((b.rx + b.vrx * tau - face) / 360) * 360 + face;
  while (fin < b.rx + 90) fin += 360;
  b.final = fin; b.vrx = (fin - b.rx) / tau; b.planned = true;
}
function stepBlocks(dt) {
  const ts = R.tossing;
  R.blocks.forEach((b, i) => {
    const want = ts && ts.kind ? FACES[ts.kind][i] : null;
    if (b.state !== 'air') b.rz += ((i ? 8 : -8) - b.rz) * (1 - Math.exp(-dt * 1.2));
    if (b.state === 'held') b.h += ((R.grab ? R.grab.lift : 0) + 10 - b.h) * (1 - Math.exp(-dt * 18));
    else if (b.state === 'drop' || b.state === 'air' || b.state === 'bounce') {
      if (b.state === 'air' && want != null && !b.planned) plan(b, want);
      b.vh -= G * dt; b.h += b.vh * dt;
      if (b.state === 'air') b.rx += b.vrx * dt;
      b.rz += b.vrz * dt; b.x = Math.max(-70, Math.min(70, b.x + b.vx * dt));
      if (b.h <= 0 && b.vh < 0) {
        const imp = -b.vh; b.h = 0;
        if (b.state === 'air') {
          if (b.planned) b.rx = b.final; else { b.rx = Math.round(b.rx / 180) * 180; b.unsure = true; }
          b.wob = (Math.random() < 0.5 ? -1 : 1) * 12; b.age = 0; buzz(12);
        }
        clack(imp / 1500); b.vrz *= 0.35; b.vx *= 0.4;
        if (imp < 170 || b.bounces >= 3) { b.vh = 0; b.state = 'rest'; } else { b.vh = imp * 0.3; b.bounces++; b.state = 'bounce'; }
      }
    } else if (b.state === 'rest' && b.unsure && want != null) {
      // 落地时结果还没回来（网慢）：回来了，不对的那块就弹起来翻个面
      b.unsure = false;
      if (faceOf(b.rx) !== want) { Object.assign(b, { state: 'air', vh: 560, bounces: 0 }); b.vrx = 180 / (2 * 560 / G); b.final = b.rx + 180; b.planned = true; }
    }
    b.age += dt;
    const wob = b.state === 'air' ? 0 : b.wob * Math.exp(-b.age * 5) * Math.cos(b.age * 26);
    b.bd.style.transform = `translate3d(${b.x.toFixed(1)}px,${(-b.h * 0.62).toFixed(1)}px,0) rotateZ(${b.rz.toFixed(1)}deg) rotateX(${(b.rx + wob).toFixed(1)}deg) scale(${(1 + b.h / 1500).toFixed(3)})`;
    b.sh.style.transform = `translateX(${b.x.toFixed(1)}px) scale(${Math.max(0.35, 1 - b.h / 900).toFixed(3)})`;
    b.sh.style.opacity = Math.max(0.15, 1 - b.h / 700).toFixed(3);
  });
  if (!ts || ts.shown || !R.blocks.every((b) => b.state === 'rest')) return;
  if (ts.err) { R.tossing = null; toast(ts.err.message); tossCtl(); return; }
  if (ts.kind && R.blocks.every((b) => !b.unsure)) { ts.shown = true; later(() => showResult(ts.data), RM() ? 0 : 380); }
}
function showResult(d) {
  R.tossing = null; R.t.draw = d.draw; R.onChange();
  track('draw_toss', { toss: d.toss, n: d.draw.tosses.length });
  if (d.draw.status === 'done') track('draw', { no: d.draw.no, tries: d.draw.tosses.length });
  triesHtml(); showWord(d.toss, true);
  if (d.toss === 'sheng') {
    setPhase('blessed'); R.el.classList.add('blessed');
    bell([392, 587.3, 784], 0.1, 4.5); buzz([16, 70, 16, 120, 40]);
    const tb = $('.rtable', R.el).getBoundingClientRect(), e = R.el.getBoundingClientRect();
    burst(tb.left - e.left + tb.width / 2, tb.top - e.top + tb.height - 60, 110, true);
    setCtl(`<button type="button" class="rbtn" data-jiao-read>${t('看签文')}</button>`);
    return;
  }
  bell([233], 0.045, 1.6); buzz(20);
  if (d.draw.status === 'reask') later(reaskView, 900);
  else if (d.draw.status === 'closed') later(closedView, 900);
  else tossCtl();
}
onClick('[data-jiao-read]', () => { if (R) toLot(false); });

// 签的分项「断语」、建议：英文用冒号和分号
// 英文界面不显示中文原文断语，服务端给了 gloss（英文意思）就显示它，没有就不显示
const item = (it) => (EN ? esc(it.gloss || '') : `${esc(it.k)}「${esc(it.v)}」`);
const itemsOf = (list) => (EN ? list.filter((it) => it.gloss) : list);
const tipsText = (tips) => (EN ? tips.map(esc).join('; ') + '.' : tips.map(esc).join('；') + '。');
// ---------------- 5 解签：签名、四句诗一字一字浮现；先回答你问的事，其余几项收成小格 ----------------
function toLot(fast) {
  setPhase('lot'); setStep(3); R.el.classList.add('locked'); droneOff();
  const d = R.t.draw, T = d.titles || {}, topics = d.topics || [];
  const main = topics.find((x) => x.asked) || topics[0], rest = topics.filter((x) => x !== main);
  const p0 = 0.9, gap = 0.62, after = p0 + d.poem.length * gap + 0.3;
  const items = (x) => (itemsOf(x.items).length ? `<p class="ritems">${itemsOf(x.items).map(item).join(' · ')}</p>` : '');
  const box = $('.rlot', R.el);
  box.classList.toggle('fast', !!fast || RM());
  box.innerHTML = `<div class="rlh"><span>${t('观音灵签 · 第 {n} 签', { n: d.no })}</span><em class="${GRADE_CLS(d.grade)}">${esc(t(d.grade))}</em></div>`
    + `<h2 class="rv rtitle">${spans(d.title, 0.15, 0.14)}</h2>`
    + `<div class="rv rpoem">${d.poem.map((l, i) => `<p>${spans(l, p0 + i * gap, 0.05)}</p>`).join('')}</div>`
    + (d.hint ? `<p class="rhl rcard" style="--d:${after}s">${esc(d.hint)}</p>` : '')
    + (main ? `<div class="rans rcard" style="--d:${after + 0.15}s"><div class="q"><span>${d.question ? `${esc(T.asked || t('你问的'))} · ${esc(d.question)}` : t('今天的{name}', { name: esc(main.name) })}</span>${d.question ? `<em>${esc(main.name)}</em>` : ''}</div>`
      + `<h3>${esc(main.say)}${dots(main.stars)}</h3>${items(main)}<p class="radv"><b>${esc(T.advice || t('建议'))}</b>${tipsText(main.tips)}</p>${main.note ? `<p class="ritems">${esc(main.note)}</p>` : ''}</div>` : '')
    + (rest.length ? `<div class="rtiles rcard" style="--d:${after + 0.35}s">${rest.map((x) => `<button type="button" data-rtopic="${esc(x.key)}">${esc(x.name)}${dots(x.stars)}</button>`).join('')}</div><div class="rtdet"></div>` : '')
    + `<details class="rmore rcard" style="--d:${after + 0.5}s"><summary>${t('细读这支签')}</summary><div>`
    + (d.jieqian ? `<b>${t('解曰')}</b><p>${d.jieqian.map(esc).join(EN ? ' / ' : '　')}</p>` : '')
    + `<b>${t('白话')}</b><p>${esc(d.plain)}</p><b>${t('关键词')}</b><p>${esc(d.keyword)}</p>`
    + (EN ? (d.xianji && d.xianji.some((x) => x.gloss) ? `<b>${esc(T.table || t('签谱原文 · 仙机'))}</b><div class="rxj">${d.xianji.filter((x) => x.gloss).map((x) => `<span>${esc(x.gloss)}</span>`).join('')}</div>` : '')
      : d.xianji && d.xianji.some((x) => x.v) ? `<b>${esc(T.table || t('签谱原文 · 仙机'))}</b><div class="rxj">${d.xianji.map((x) => `<span><small>${esc(x.k)}</small>${esc(x.v || '—')}</span>`).join('')}</div>` : '')
    + '</div></details>'
    + `<div class="racts rcard" style="--d:${after + 0.65}s"><button type="button" class="rbtn" data-rite-keep>${t('收下这支签')}</button><button type="button" class="rbtn sq" data-share="lot" aria-label="${t('分享这支签')}">↗</button></div>`
    + `<div class="rlinks rcard" style="--d:${after + 0.75}s"><a href="#/lots" data-close-sheet>${t('我的签谱 ›')}</a><a href="#/ask" data-close-sheet>${t('想问一件具体的事 ›')}</a></div>`;
  R.sheet.scrollTop = 0;
  if (!fast && !RM()) {
    ac(); bell([523.3], 0.035, 3);
    const notes = [659.3, 523.3, 587.3, 392];
    d.poem.forEach((_, i) => later(() => { if (!box.classList.contains('fast')) bell([notes[i % 4]], 0.018, 2.2); }, (p0 + i * gap) * 1000));
  }
}
onClick('[data-rtopic]', (el) => {
  if (!R) return;
  const x = (R.t.draw.topics || []).find((t) => t.key === el.getAttribute('data-rtopic')), det = $('.rtdet', R.el), T = R.t.draw.titles || {};
  const on = !el.classList.contains('on');
  R.el.querySelectorAll('[data-rtopic]').forEach((b) => b.classList.toggle('on', on && b === el));
  det.classList.toggle('on', on);
  det.innerHTML = on && x ? `<h4>${esc(x.name)}${dots(x.stars)}</h4>${itemsOf(x.items).length ? `<p class="ritems">${itemsOf(x.items).map(item).join(' · ')}</p>` : ''}<p>${esc(x.say)}</p><p class="radv"><b>${esc(T.advice || t('建议'))}</b>${tipsText(x.tips)}</p>` : '';
});
// 点一下诗：不等，直接全部显出来
document.addEventListener('click', (e) => { if (R && R.phase === 'lot' && e.target.closest('.rtitle, .rpoem')) $('.rlot', R.el).classList.add('fast'); });
// 收下：签名飞进右上角，弹层关上，回到今天
onClick('[data-rite-keep]', (el) => {
  if (!R || el.disabled) return; el.disabled = true;
  const from = $('.rtitle', R.el).getBoundingClientRect(), to = $('.close', R.sheet).getBoundingClientRect();
  const chip = document.createElement('div'); chip.className = 'rchip'; chip.textContent = R.t.draw.title;
  chip.style.left = `${from.left + from.width / 2 - 60}px`; chip.style.top = `${from.top + 6}px`;
  document.body.appendChild(chip);
  requestAnimationFrame(() => requestAnimationFrame(() => { chip.style.transform = `translate(${to.left - (from.left + from.width / 2 - 60)}px,${to.top - from.top - 6}px) scale(.3)`; chip.style.opacity = 0; }));
  ac(); later(() => { tock(); buzz(10); }, 700);
  setTimeout(() => { chip.remove(); toast(t('收进「我的签谱」了')); dismissSheet(); }, 850);
});
onClick('[data-rite-snd]', (el) => {
  const on = !soundOn(); writeLocal('rite-mute', on ? null : true);
  el.textContent = on ? t('声音 开') : t('声音 关');
  if (A.master) A.master.gain.value = on ? 1 : 0;
});

// ---------------- 主循环 ----------------
function frame(now) {
  if (!R) return;
  const dt = Math.min(0.034, (now - R.last) / 1000); R.last = now;
  if (R.phase === 'ask') stepHold(dt);
  R.rings.forEach((ring) => stepRing(ring, dt));
  R.irAng -= dt * (4 + R.spin * 0.6); R.inner.setAttribute('transform', `rotate(${R.irAng.toFixed(2)})`);
  if (R.phase === 'shake') R.D.swirl += (0.7 - R.D.swirl) * (1 - Math.exp(-dt * 1.5));
  else if (R.phase !== 'ask') R.D.swirl *= Math.exp(-dt * 0.8);
  stepJolt(dt); stepBlocks(dt);
  if (R.phase !== 'lot') stepDust(dt, now / 1000); else if (!R.dustCleared) { R.cx.clearRect(0, 0, R.W, R.H); R.dustCleared = true; }
  if (R) R.raf = requestAnimationFrame(frame);
}
