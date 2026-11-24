// 问事：写下一件拿不准的事 → 梅花易数起卦（规则算，卦象一爻一爻显出来）→ AI 写白话解读 → 给两个适合去做的日子
// → 同一卦里追问 1–2 次（不另收费）→ 7 天后回看那件事后来怎样了。
import { $, $$, esc, api, toast, onClick, currentPath, dtText, price, track, localToday } from './core.js';
import { THEME, WEEK, hhShort } from './data.js';
import { S, isPro } from './state.js';
import { footHtml, memberLockHtml } from './today.js';
import { openPay } from './pay.js';
import { openPicker } from './calendar.js';
import { openDay } from './day.js';

const phead = (title, back = true) => `<div class="phead">${back ? '<button type="button" class="back" data-back aria-label="返回">‹</button>' : ''}<h1>${title}</h1></div>`;
const TEND = { 顺: 'good', 先阻后顺: 'mid', 宜缓: 'slow', 有阻: 'bad' };
export const tendHtml = (t) => `<span class="tend t-${TEND[t] || 'mid'}">${esc(t)}</span>`;
// 六爻从下往上画；动爻用朱砂色
function hexHtml(lines, moving, reveal, delay = 0) {
  return `<div class="hex${reveal ? ' reveal' : ''}" aria-hidden="true">${lines.map((v, i) => `<i class="${v ? '' : 'yin'}${i + 1 === moving ? ' mv' : ''}" style="--k:${i + delay}"></i>`).join('')}</div>`;
}

// ---------- 写问题 ----------
let draft = { question: '', category: '', method: 'time', nums: ['', '', ''] };
export function pageAsk() {
  const v = $('#view');
  v.innerHTML = phead('问一件事') + '<div class="sk" style="height:360px"></div>';
  api('GET', 'asks/quota').then((q) => {
    if (currentPath() !== '/ask') return;
    S.askQuota = q;
    if (q.mode === 'blocked') { v.innerHTML = phead('问一件事') + memberLockHtml('问事（每月免费 1 次）') + '<p style="margin:0;text-align:center"><a class="tbtn" href="#/asks">看以前的问事记录 ›</a></p>' + footHtml(); return; }
    if (!draft.category) draft.category = q.categories[0];
    const left = q.free ? `本月免费 <b>${q.free}</b> 次` : q.credits ? `还有 <b>${q.credits}</b> 次` : `¥${price(q.priceCents)} / 次`;
    const cost = q.free || q.credits ? '起卦' : `¥${price(q.priceCents)} 起卦`;
    v.innerHTML = phead('问一件事')
      + `<div class="quota"><span>心里有一件具体的事拿不准，就问一卦</span><span>${q.mode === 'free' && q.free ? '体验期送 <b>1</b> 次' : left}</span></div>`
      + '<section class="card"><form class="form askf" id="askForm" novalidate>'
      + `<label class="field"><span>想问什么</span><textarea name="question" maxlength="60" rows="3" placeholder="比如：这周找老板谈加薪合适吗？">${esc(draft.question)}</textarea><span class="hint" id="askCount" style="text-align:right">${draft.question.length} / 60</span></label>`
      + `<div class="field"><span>是哪方面</span><div class="pills" data-acat>${q.categories.map((c) => `<button type="button" data-acat-v="${esc(c)}" aria-pressed="${c === draft.category}">${esc(c)}</button>`).join('')}</div></div>`
      + `<div class="field"><span>怎么起卦</span><span class="segs" role="group" aria-label="起卦方式"><button type="button" data-amethod="time" aria-pressed="${draft.method === 'time'}">用此刻起卦</button><button type="button" data-amethod="nums" aria-pressed="${draft.method === 'nums'}">报三个数</button></span>`
      + `<div class="nums3"${draft.method === 'nums' ? '' : ' hidden'}>${[0, 1, 2].map((i) => `<input name="n${i}" type="number" inputmode="numeric" min="1" max="999" placeholder="${['第一个数', '第二个数', '第三个数'][i]}" value="${esc(draft.nums[i])}" aria-label="第 ${i + 1} 个数">`).join('')}</div>`
      + '<span class="hint">心里想着这件事，凭直觉报三个 1–999 的数；不想报就用此刻的时间起卦。</span></div>'
      + `<div class="err" id="askErr"></div><button class="btn primary block" type="submit"${q.ready ? '' : ' disabled'}>${q.ready ? cost : '解读服务维护中，稍后再来'}</button></form></section>`
      + '<p class="note" style="margin:0">卦象和倾向按梅花易数规则算出，白话解读由 AI 生成，仅供参考。健康、投资、法律这类问题请找专业人士，这里不解答。</p>'
      + '<p style="margin:0;text-align:center"><a class="tbtn" href="#/asks">问事记录 ›</a></p>' + footHtml();
    const f = $('#askForm');
    f.elements.question.addEventListener('input', function () { draft.question = this.value; $('#askCount').textContent = this.value.length + ' / 60'; });
    $$('.nums3 input', f).forEach((el, i) => el.addEventListener('input', () => { draft.nums[i] = el.value; }));
  }, (e) => { v.innerHTML = phead('问一件事') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
onClick('[data-acat-v]', (el) => { draft.category = el.getAttribute('data-acat-v'); $$('[data-acat-v]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false')); });
onClick('[data-amethod]', (el) => {
  draft.method = el.getAttribute('data-amethod');
  $$('[data-amethod]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
  $('.nums3').hidden = draft.method !== 'nums';
  if (draft.method === 'nums') $('.nums3 input').focus();
});
function submitAsk() {
  const f = $('#askForm'), err = $('#askErr');
  const btn = f && $('button[type=submit]', f);
  if (btn) btn.disabled = true;
  const body = { question: draft.question.trim(), category: draft.category, method: draft.method, nums: draft.nums.map((n) => +n) };
  api('POST', 'asks', body).then((d) => {
    track('ask_done', { category: body.category, method: body.method, repeat: !!d.repeat });
    if (d.repeat) toast('同一件事一天只起一卦，这是上次的结果');
    else { S.askFresh = d.ask.id; draft = { question: '', category: '', method: 'time', nums: ['', '', ''] }; }
    location.hash = '#/ask/result?id=' + d.ask.id;
  }, (e) => {
    if (btn) btn.disabled = false;
    if (e.status === 402 && e.data.error === 'need_pay') { openPay(() => { if (currentPath() === '/ask') submitAsk(); }, { product: 'ask' }); return; }
    if (e.status === 402) { openPay(() => pageAsk()); return; }
    if (err) err.textContent = e.message;
  });
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'askForm') return;
  e.preventDefault();
  draft.question = e.target.elements.question.value;
  if (draft.question.trim().length < 4) { $('#askErr').textContent = '把想问的事写具体一点，至少 4 个字'; return; }
  if (draft.method === 'nums' && draft.nums.some((n) => !(+n >= 1 && +n <= 999))) { $('#askErr').textContent = '报三个 1 到 999 之间的数'; return; }
  submitAsk();
});

// ---------- 结果 ----------
let pollTimer = null;
function readingHtml(a) {
  if (a.status === 'done') {
    const r = a.reading;
    return `<p class="hl">${esc(r.headline)}</p>${r.body.map((p) => `<p>${esc(p)}</p>`).join('')}<p class="adv"><b>今天可以做</b>${esc(r.advice)}</p>`;
  }
  if (a.status === 'failed') return '<p class="muted" style="margin:0">解读这次没写出来，已经退回这次的次数。过一会儿再打开，会自动再写一次。</p>';
  return '<div class="writing"><span><i></i><i></i><i></i></span>正在把卦象写成白话，大约半分钟。离开也没关系，写好会存在「问事记录」里。</div>';
}
function daysHtml(a) {
  if (!a.days.length) return '';
  return `<section class="card"><h3>如果要做，接下来两周里这两天更好</h3><div class="chips">${a.days.map((p) => `<button type="button" class="chip pick2" data-ask-day="${p.y}-${p.m}-${p.d}">${p.m}月${p.d}日 周${WEEK[new Date(p.y, p.m - 1, p.d).getDay()]} · ${THEME[p.ssG][0]}${p.hours[0] != null ? ' · ' + hhShort(p.hours[0]) : ''} ›</button>`).join('')}</div>`
    + `<button type="button" class="btn ghost block" data-ask-pick="${a.id}">用这件事去挑日子</button></section>`;
}
function resultHtml(a, fresh) {
  const g = a.gua;
  const changed = g.bian.lines.map((v, i) => (v !== g.ben.lines[i] ? i + 1 : 0)).find(Boolean);
  return phead('问事') + `<div class="askq"><b>${esc(a.question)}</b><small>${esc(a.category)} · ${g.cast.method === 'time' ? '此刻起卦' : '报数 ' + g.cast.nums.join('、')} · ${esc(g.cast.text)}</small></div>`
    + `<section class="card guacard${fresh ? ' fresh' : ''}"><div class="hexrow"><div>${hexHtml(g.ben.lines, g.moving, fresh)}<div class="hexn"><b>${esc(g.ben.name)}</b>本卦</div></div><span class="arrow" aria-hidden="true">→</span>`
    + `<div>${hexHtml(g.bian.lines, changed, fresh, 6)}<div class="hexn"><b>${esc(g.bian.name)}</b>变卦</div></div></div>`
    + `${tendHtml(g.tendency)}<p class="gnote">眼下${esc(g.now.text)}，后来${esc(g.later.text)}。</p>`
    + `<details class="guadet"${isPro() ? ' open' : ''}><summary>看卦象细节</summary><dl>`
    + `<div><dt>本卦</dt><dd>${esc(g.ben.name)}：${esc(g.ben.gist)}</dd></div><div><dt>互卦</dt><dd>${esc(g.hu.name)}：${esc(g.hu.gist)}（事情中间的过程）</dd></div>`
    + `<div><dt>变卦</dt><dd>${esc(g.bian.name)}：${esc(g.bian.gist)}（事情后来的走向）</dd></div>`
    + `<div><dt>动爻</dt><dd>第 ${g.moving} 爻（从下往上数，红色那一爻）</dd></div>`
    + `<div><dt>体用</dt><dd>体卦${esc(g.ti.name)}（${esc(g.ti.wx)}）代表你，用卦${esc(g.yong.name)}（${esc(g.yong.wx)}）代表这件事；眼下${esc(g.now.rel)}，后来${esc(g.later.rel)}；${esc(g.month.zhi)}月体卦${esc(g.month.state)}</dd></div>`
    + '</dl></details></section>'
    + `<section class="card reading" id="reading"><h3>解读<span class="aitag">AI 生成</span></h3><div class="rbody">${readingHtml(a)}</div></section>`
    + `<div id="followBox">${followHtml(a)}</div>`
    + daysHtml(a)
    + `<div id="reviewBox">${reviewHtml(a)}</div>`
    + '<p class="note" style="margin:0">卦象和倾向按梅花易数规则算出；白话解读由 AI 生成，仅供参考，不构成任何决策依据。</p>' + footHtml();
}
// ---------- 追问 ----------
const dayCn = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}月${dd}日`; };
function followHtml(a) {
  if (a.status !== 'done') return '';
  const fo = a.follow, list = a.follows || [];
  if (!list.length && !fo.open) return '';
  const pending = list.some((f) => f.status === 'pending');
  const items = list.map((f) => `<div class="fitem"><p class="fq">${esc(f.question)}</p>`
    + (f.status === 'done' ? `<p class="fa">${esc(f.reading.answer)}</p><p class="adv"><b>接下来可以做</b>${esc(f.reading.advice)}</p>`
      : f.status === 'failed' ? '<p class="muted fa">这次没写出来，不占追问次数，可以再问一次。</p>'
        : '<div class="writing"><span><i></i><i></i><i></i></span>正在写，十几秒。</div>') + '</div>').join('');
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
  clearTimeout(pollTimer); clearTimeout(followPoll);
  const fresh = S.askFresh === id;
  S.askFresh = null;
  v.innerHTML = phead('问事') + '<div class="sk" style="height:260px"></div>';
  const here = () => currentPath() === '/ask/result' && new URLSearchParams(location.hash.split('?')[1] || '').get('id') === String(id);
  const poll = () => {
    pollTimer = setTimeout(() => api('GET', 'asks/' + id).then((d) => {
      if (!here()) return;
      S.ask = d.ask;
      if (d.ask.status === 'pending') { poll(); return; }
      const box = $('#reading .rbody');
      if (box) { box.innerHTML = readingHtml(d.ask); box.classList.add('appear'); }
      const fb = $('#followBox'), rb = $('#reviewBox');
      if (fb) fb.innerHTML = followHtml(d.ask);
      if (rb) rb.innerHTML = reviewHtml(d.ask);
    }, () => { if (here()) poll(); }), 2000);
  };
  api('GET', 'asks/' + id).then((d) => {
    if (!here()) return;
    S.ask = d.ask;
    S.askOutcomes = d.outcomes;
    v.innerHTML = resultHtml(d.ask, fresh);
    if (d.ask.status === 'pending') poll();
    if ((d.ask.follows || []).some((f) => f.status === 'pending')) pollFollows(id);
  }, (e) => { v.innerHTML = phead('问事') + `<div class="errbox"><p>${esc(e.message)}</p><a class="btn ghost" href="#/asks">看问事记录</a></div>`; });
}
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
export function pageAsks() {
  const v = $('#view');
  v.innerHTML = phead('问事记录') + '<div class="sk" style="height:200px"></div>';
  api('GET', 'asks').then((d) => {
    if (currentPath() !== '/asks') return;
    v.innerHTML = phead('问事记录') + '<a class="btn primary block" href="#/ask">问一件事</a>'
      + (d.list.length ? `<section class="mlist alist">${d.list.map((a) => `<button type="button" class="arow" data-go="/ask/result?id=${a.id}"><span class="q">${esc(a.question)}<small>${dtText(a.createdAt)} · ${esc(a.category)} · ${esc(a.ben)}${a.outcome ? ` · 后来${esc(a.outcome.text)}` : a.remind ? ' · <em class="due">该回看了</em>' : ''}</small></span>${tendHtml(a.tendency)}</button>`).join('')}</section>`
        : '<div class="empty">还没有问过事。心里有拿不准的事时，来起一卦。</div>') + footHtml();
  }, (e) => { v.innerHTML = phead('问事记录') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
