// 转运御守：两个分页，做好事（记善行，攒够 5 件换一枚）、提能量（冥想、释放练习，攒够 20 分钟换一枚）；
// 下面可以直接买一枚，还有我的御守。
// 例子、件数、释放练习每一步的话都在 content/luck.json；御守的心愿和颜色在 amulets.json。
import { $, esc, api, toast, onClick, currentPath, openSheet, dismissSheet, track } from './core.js';
import { S } from './state.js';
import { footHtml, memberLockHtml } from './today.js';
import { openPay } from './pay.js';
import { omamoriSvg, startRitual, shareAmulet, STYLE_NAME } from './wish.js';

const phead = (title) => `<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>${title}</h1></div>`;
const md = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const M = { way: 'bowl', minutes: 10 }; // 冥想的选择
let TAB = 'deed';

export function pageLuck(r) {
  const t = r && r.q && r.q.get('tab');
  if (t === 'deed' || t === 'energy') TAB = t;
  const v = $('#view');
  v.innerHTML = phead('转运御守') + '<div class="sk" style="height:520px"></div>';
  api('GET', 'luck').then((d) => {
    if (currentPath() !== '/luck') return;
    S.luck = d;
    renderLuck();
  }, (e) => { v.innerHTML = phead('转运御守') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
addEventListener('lrl:luck', () => { if (currentPath() === '/luck' && S.luck) renderLuck(); });

function deedsHtml(z) {
  const n = Math.min(z.unused, z.per), full = z.unused >= z.per, left = z.dailyMax - z.today;
  const slots = Array.from({ length: z.per }, (_, i) => `<i class="${i < n ? 'on' : ''}" aria-hidden="true">${i < n ? '善' : ''}</i>`).join('');
  return '<section class="lsec" role="tabpanel" aria-label="做好事"><p class="ltip">记下你做的好事，攒 ' + z.per + ' 件换一枚御守。</p>'
    + `<div class="dprog"><div class="dslots">${slots}</div><span>已攒 <b>${n}</b>/${z.per}${z.unused > z.per ? `（还多 ${z.unused - z.per} 件）` : ''}</span></div>`
    + (full ? `<button type="button" class="btn primary block" data-deed-exchange>用 ${z.per} 件善行换一枚御守</button>` : '')
    + (left > 0
      ? `<form class="deedf" id="deedForm" novalidate><input name="text" maxlength="${z.maxLen}" placeholder="今天做了什么好事？" enterkeyhint="done" aria-label="今天做了什么好事"><button type="submit" class="btn primary sm">记下</button></form>`
        + `<p class="dtip">今天还能记 ${left} 件 · 大事小事都算，真心就好</p><div class="dex" aria-label="比如">${z.examples.map((x) => `<button type="button" data-deed-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>`
      : `<p class="dtip">今天记满 ${z.dailyMax} 件了，明天再来。</p>`)
    + (z.list.length ? `<ul class="dlist">${z.list.slice(0, 8).map((r) => `<li class="${r.used ? 'used' : ''}"><span>${esc(r.text)}</span><small>${md(r.createdAt)}${r.used ? ' · 已换成御守' : ''}</small>${r.used ? '' : `<button type="button" class="x" data-deed-del="${r.id}" aria-label="删掉这条">×</button>`}</li>`).join('')}</ul>` : '')
    + '</section>';
}
function energyHtml(d) {
  const pr = d.practice, p = pr.week, r = d.release, n = Math.min(pr.have, pr.per), full = pr.have >= pr.per;
  return `<section class="lsec" role="tabpanel" aria-label="提能量"><p class="ltip">冥想几分钟就攒几分钟，攒够 ${pr.per} 分钟换一枚御守。</p>`
    + `<div class="eprog"><div class="ebar" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.per}" aria-valuenow="${n}"><i style="width:${n / pr.per * 100}%"></i></div><span>已攒 <b>${n}</b>/${pr.per} 分钟${pr.have > pr.per ? `（还多 ${pr.have - pr.per} 分钟）` : ''}</span></div>`
    + (full ? `<button type="button" class="btn primary block" data-energy-exchange>用 ${pr.per} 分钟换一枚御守</button>` : '')
    + (p.meditate || p.release ? `<p class="dtip">这周冥想 ${p.meditate} 次 · 释放 ${p.release} 次</p>` : '')
    + '<div class="lcards"><div class="lcard"><b>冥想练习</b><p>点一炷香或敲颂钵，跟着呼吸静一静。坐满才算。</p>'
    + `<div class="pills" role="group" aria-label="方式"><button type="button" data-med-way="bowl" aria-pressed="${M.way === 'bowl'}">敲颂钵</button><button type="button" data-med-way="incense" aria-pressed="${M.way === 'incense'}">点一炷香</button></div>`
    + `<div class="pills" role="group" aria-label="时长">${d.meditate.minutes.map((m) => `<button type="button" data-med-min="${m}" aria-pressed="${M.minutes === m}">${m} 分钟</button>`).join('')}</div>`
    + '<button type="button" class="btn primary block" data-med-start>开始冥想</button></div>'
    + `<div class="lcard"><b>${esc(r.name)}</b><small>圣多纳释放法${pr.releaseMinutes ? ` · 做完一次算 ${pr.releaseMinutes} 分钟` : ''}</small><p>${esc(r.intro)}</p><button type="button" class="btn primary block" data-rel-start>开始释放</button></div>`
    + '</div></section>';
}
function renderLuck() {
  const d = S.luck, v = $('#view');
  if (!d) return;
  const a = d.amulets, price = `¥${(a.priceCents / 100).toFixed(1)}`;
  const buy = `<section class="lsec lbuy"><div><b>不想等？直接买一枚</b><small>转运款 · 节气款${a.birthdayMonth ? ' · 生日款' : ''}，${price} 一枚</small></div><button type="button" class="btn ghost sm" data-om-buy>买一枚</button></section>`;
  const mine = `<section class="lsec lmine"><a class="lkrow" href="#/amulets"><span>我的御守</span><b>${a.count} 枚 ›</b></a></section>`;
  if (d.mode === 'blocked') { v.innerHTML = phead('转运御守') + memberLockHtml('做好事、提能量换御守') + mine + footHtml(); return; }
  const z = d.deeds, pr = d.practice;
  const tab = (k, title, sub, ready) => `<button type="button" role="tab" data-luck-tab="${k}" aria-selected="${TAB === k}"><b>${title}</b><small>${ready ? '可以换一枚了' : sub}</small>${ready ? '<i class="dot" aria-hidden="true"></i>' : ''}</button>`;
  v.innerHTML = phead('转运御守') + '<p class="lintro">两种方法都能换一枚转运御守：做点好事，或者给自己提提能量。</p>'
    + `<div class="ltabs" role="tablist" aria-label="获取御守的方法">${tab('deed', '做好事', `善行 ${Math.min(z.unused, z.per)}/${z.per}`, z.unused >= z.per)}${tab('energy', '提能量', `冥想 ${Math.min(pr.have, pr.per)}/${pr.per} 分钟`, pr.have >= pr.per)}</div>`
    + (TAB === 'deed' ? deedsHtml(z) : energyHtml(d)) + buy + mine + footHtml();
}
onClick('[data-luck-tab]', (el) => {
  TAB = el.getAttribute('data-luck-tab');
  try { history.replaceState(history.state, '', '#/luck?tab=' + TAB); } catch {}
  track('luck_tab', { tab: TAB });
  renderLuck();
});

// ---------- 做好事 ----------
onClick('[data-deed-ex]', (el) => { const i = $('#deedForm input'); if (i) { i.value = el.getAttribute('data-deed-ex'); i.focus(); } });
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'deedForm') return;
  e.preventDefault();
  const text = e.target.elements.text.value.trim(), btn = $('button', e.target);
  if (text.length < 2) { toast('写一句做了什么好事'); return; }
  btn.disabled = true;
  api('POST', 'deeds', { text }).then((d) => {
    const before = S.luck.deeds.unused;
    S.luck.deeds = d.deeds;
    if (S.today && S.today.luck) S.today.luck.unused = d.deeds.unused;
    track('deed_add', { n: d.deeds.unused });
    renderLuck();
    if (before < d.deeds.per && d.deeds.unused >= d.deeds.per) toast(`攒够 ${d.deeds.per} 件了，可以换一枚御守`);
    else toast('记下了，好事会有回音');
  }, (err) => { btn.disabled = false; toast(err.message); });
});
onClick('[data-deed-del]', (el) => {
  api('DELETE', 'deeds/' + el.getAttribute('data-deed-del'), {}).then((d) => {
    S.luck.deeds = d.deeds;
    if (S.today && S.today.luck) S.today.luck.unused = d.deeds.unused;
    renderLuck();
  }, (e) => toast(e.message));
});

// ---------- 换御守 / 买特别款（一个弹层：选心愿，特别款再选款式） ----------
const X = { mode: 'deed', wish: null, style: 'basic' };
function amuletSheet() {
  const a = S.luck.amulets, wish = a.wishes.find((w) => w.name === X.wish) || a.wishes[0];
  X.wish = wish.name;
  if (X.mode === 'buy' && X.style === 'birthday' && !a.birthdayMonth) X.style = 'basic';
  const style = X.mode === 'buy' ? X.style : X.mode;
  const pv = omamoriSvg({ look: a.looks[style], wish: wish.text, style }, 'pv');
  const price = `¥${(a.priceCents / 100).toFixed(1)}`;
  return `<div class="omx"><div class="omamori sm">${pv}</div>`
    + `<p class="note" style="margin:0;text-align:center">${{ deed: `善缘款 · 用你的幸运色（${esc(a.looks.deed.element)}）织成，盖「善行」印`, energy: `静心款 · 用你的幸运色（${esc(a.looks.deed.element)}）织成，盖「静心」印`, basic: `转运款 · 用你的幸运色（${esc(a.looks.deed.element)}）织成`, term: `节气款 · ${esc(a.term)}时节的颜色和图案`, birthday: '生日款 · 只在你的生日月有' }[style]}</p>`
    + `<div class="pills" role="group" aria-label="心愿">${a.wishes.map((w) => `<button type="button" data-ox-wish="${esc(w.name)}" aria-pressed="${w.name === X.wish}">${esc(w.name)}</button>`).join('')}</div>`
    + (X.mode === 'buy' ? `<div class="pills" role="group" aria-label="款式"><button type="button" data-ox-style="basic" aria-pressed="${X.style === 'basic'}">转运款</button><button type="button" data-ox-style="term" aria-pressed="${X.style === 'term'}">节气款</button>${a.birthdayMonth ? `<button type="button" data-ox-style="birthday" aria-pressed="${X.style === 'birthday'}">生日款</button>` : ''}</div>` : '')
    + `<button type="button" class="btn primary block" data-ox-go>${X.mode === 'deed' ? `用 ${S.luck.deeds.per} 件善行换` : X.mode === 'energy' ? `用 ${S.luck.practice.per} 分钟换` : a.credits ? `用已有的 ${a.credits} 枚里的 1 枚` : `${price} 买一枚`}</button></div>`;
}
const redrawOx = () => { const b = $('#sheet .sbody'); if (b && $('.omx', b)) b.innerHTML = amuletSheet(); };
function openAmuletSheet(mode) {
  X.mode = mode; X.wish = X.wish || null;
  openSheet(mode === 'buy' ? '直接买一枚御守' : '换一枚御守', amuletSheet());
}
onClick('[data-deed-exchange]', () => openAmuletSheet('deed'));
onClick('[data-energy-exchange]', () => openAmuletSheet('energy'));
onClick('[data-om-buy]', () => {
  if (S.luck) { openAmuletSheet('buy'); return; }
  api('GET', 'luck').then((d) => { S.luck = d; openAmuletSheet('buy'); }, (e) => toast(e.message));
});
onClick('[data-ox-wish]', (el) => { X.wish = el.getAttribute('data-ox-wish'); redrawOx(); });
onClick('[data-ox-style]', (el) => { X.style = el.getAttribute('data-ox-style'); redrawOx(); });
function reveal(a) {
  S.revealed = a;
  openSheet('收下你的御守', `<div class="omx"><div class="omamori">${omamoriSvg(a, 'rv' + a.id)}</div>`
    + `<p class="note" style="margin:0;text-align:center">${a.way === 'deed' ? `${S.luck ? S.luck.deeds.per : 5} 件善行换来的。` : a.way === 'energy' ? `${a.minutes} 分钟冥想换来的。` : `${STYLE_NAME[a.style]}。`}收在「我的御守」里。</p>`
    + '<div class="acts2"><button type="button" class="btn ghost" data-om-share>分享</button><button type="button" class="btn primary" data-om-keep>收下</button></div></div>');
}
onClick('[data-om-share]', () => { if (S.revealed) shareAmulet(S.revealed); });
onClick('[data-om-keep]', () => { dismissSheet(); if (currentPath() === '/luck') renderLuck(); else if (currentPath() !== '/amulets') location.hash = '#/amulets'; else window.dispatchEvent(new Event('hashchange')); });
onClick('[data-ox-go]', (el) => {
  const a = S.luck.amulets;
  el.disabled = true;
  if (X.mode === 'energy') {
    api('POST', 'amulets/exchange', { wish: X.wish, by: 'energy' }).then((d) => {
      track('energy_exchange', { wish: X.wish });
      S.luck.practice = d.practice; a.count += 1;
      if (S.today && S.today.luck) S.today.luck.energy = d.practice.have;
      if (currentPath() === '/luck') renderLuck();
      reveal(d.amulet);
    }, (e) => { el.disabled = false; toast(e.message); });
    return;
  }
  if (X.mode === 'deed') {
    api('POST', 'amulets/exchange', { wish: X.wish }).then((d) => {
      track('deed_exchange', { wish: X.wish });
      S.luck.deeds = d.deeds; a.count += 1;
      if (S.today && S.today.luck) S.today.luck.unused = d.deeds.unused;
      if (currentPath() === '/luck') renderLuck();
      reveal(d.amulet);
    }, (e) => { el.disabled = false; toast(e.message); });
    return;
  }
  const buy = () => api('POST', 'amulets', { wish: X.wish, style: X.style }).then((d) => {
    track('amulet_buy', { style: X.style });
    a.credits = Math.max(0, a.credits - 1); a.count += 1;
    if (currentPath() === '/luck') renderLuck();
    reveal(d.amulet);
  }, (e) => {
    el.disabled = false;
    if (e.data && e.data.error === 'need_pay') openPay(() => { a.credits += 1; buy(); }, { product: 'amulet' });
    else toast(e.message);
  });
  if (!a.credits) { el.disabled = false; openPay(() => { a.credits += 1; buy(); }, { product: 'amulet' }); return; }
  buy();
});

// ---------- 冥想 ----------
onClick('[data-med-way]', (el) => { M.way = el.getAttribute('data-med-way'); renderLuck(); });
onClick('[data-med-min]', (el) => { M.minutes = +el.getAttribute('data-med-min'); renderLuck(); });
onClick('[data-med-start]', () => startRitual({ ...M, breath: S.luck.meditate.breath }));

// ---------- 释放练习（圣多纳释放法）：全屏一步一步来 ----------
let RL = null;
const scale = (key, cur) => `<div class="rscale" role="group" aria-label="0 到 10">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-rl-score="${key}:${i}" aria-pressed="${cur === i}">${i}</button>`).join('')}</div><div class="rscale-l"><span>没感觉</span><span>非常强</span></div>`;
function relScreen() {
  const r = S.luck.release, s = RL.step, quote = RL.topic ? `<p class="rquote">「${esc(RL.topic)}」</p>` : '';
  const steps = r.steps;
  let h = '';
  if (s === 'intro') h = `<p class="rround">圣多纳释放法</p><h1>${esc(r.name)}</h1><p class="rtext">${esc(r.intro)}</p><p class="relnote">${esc(r.note)}</p><button type="button" class="btn primary block" data-rl-next>开始</button>`;
  else if (s === 'topic') h = `<h1>${esc(r.topic.title)}</h1><p class="rtext">${esc(r.topic.hint)}</p><input class="rinput" id="rlTopic" maxlength="40" placeholder="${esc(r.topic.placeholder || '')}" value="${esc(RL.topic)}"><button type="button" class="btn primary block" data-rl-next>下一步</button>`;
  else if (s === 'before') h = `${quote}<h1>${esc(r.before.title)}</h1><p class="rtext">${esc(r.before.hint)}</p>${scale('before', RL.before)}<button type="button" class="btn primary block" data-rl-next${RL.before == null ? ' disabled' : ''}>下一步</button>`;
  else if (typeof s === 'number') {
    const x = steps[s];
    h = `${quote}<p class="rround">第 ${RL.round} 轮 · ${s + 1}/${steps.length}</p><h1>${esc(x.title)}</h1><p class="rtext">${esc(x.text)}</p>`
      + (x.choices ? `<div class="rchoices">${x.choices.map((c) => `<button type="button" class="btn ghost" data-rl-next>${esc(c)}</button>`).join('')}</div>`
        : `<div class="rbreath" aria-hidden="true"><i></i></div><button type="button" class="btn primary block" data-rl-next id="rlWait" disabled>${x.wait} 秒</button>`);
  } else if (s === 'after') h = `${quote}<h1>${esc(r.after.title)}</h1><p class="rtext">${esc(r.after.hint)} · 刚才是 ${RL.before}</p>${scale('after', RL.after)}<button type="button" class="btn primary block" data-rl-next${RL.after == null ? ' disabled' : ''}>下一步</button>`;
  else if (s === 'again') h = `${quote}<h1>${RL.before} → ${RL.after}</h1><p class="rtext">${esc(r.again)}</p><div class="rchoices"><button type="button" class="btn primary" data-rl-again>再来一轮</button><button type="button" class="btn ghost" data-rl-done>就到这里</button></div>`;
  else if (s === 'done') h = `<p class="rround">释放练习 · ${RL.round} 轮</p><h1 class="rbig">${RL.before} <span>→</span> ${RL.after}</h1><p class="rtext">${esc(r.done)}</p><p class="rround" id="relGain"></p><p class="relnote">${esc(r.note)}</p><button type="button" class="btn primary block" data-rl-close>完成</button>`;
  const el = $('#release');
  el.innerHTML = `<button type="button" class="rx" data-rl-close aria-label="结束">×</button><div class="relbody">${h}</div>`;
  if (typeof s === 'number' && steps[s].wait) {
    let n = steps[s].wait;
    clearInterval(RL.timer);
    RL.timer = setInterval(() => { n -= 1; const b = $('#rlWait'); if (!b) { clearInterval(RL.timer); return; } if (n <= 0) { clearInterval(RL.timer); b.disabled = false; b.textContent = '好了，下一步'; } else b.textContent = n + ' 秒'; }, 1000);
  }
}
function finishRelease() {
  RL.step = 'done';
  relScreen();
  api('POST', 'practices', { kind: 'release', before: RL.before, after: RL.after, rounds: RL.round }).then((d) => {
    track('practice_release', { before: RL && RL.before, after: RL && RL.after });
    if (S.luck) S.luck.practice = d.practice;
    if (S.today && S.today.luck) S.today.luck.energy = d.practice.have;
    const n = $('#relGain'); if (n && d.practice.releaseMinutes) n.textContent = `攒了 ${d.practice.releaseMinutes} 分钟能量，现在 ${d.practice.have}/${d.practice.per} 分钟`;
  }, () => {});
}
onClick('[data-rel-start]', () => {
  RL = { step: 'intro', topic: '', before: null, after: null, round: 1 };
  const el = document.createElement('div');
  el.id = 'release'; el.className = 'release';
  document.body.appendChild(el);
  document.body.classList.add('in-ritual');
  history.pushState({ lrlRelease: 1 }, '');
  relScreen();
});
onClick('[data-rl-score]', (el) => { const [k, v] = el.getAttribute('data-rl-score').split(':'); RL[k] = +v; relScreen(); });
onClick('[data-rl-next]', () => {
  const r = S.luck.release, s = RL.step;
  if (s === 'intro') RL.step = 'topic';
  else if (s === 'topic') { RL.topic = ($('#rlTopic') || {}).value?.trim() || ''; RL.step = 'before'; }
  else if (s === 'before') RL.step = 0;
  else if (typeof s === 'number') RL.step = s + 1 < r.steps.length ? s + 1 : 'after';
  else if (s === 'after') { if (RL.after > 2 && RL.round < r.max_rounds) RL.step = 'again'; else { finishRelease(); return; } }
  relScreen();
});
onClick('[data-rl-again]', () => { RL.round += 1; RL.after = null; RL.step = 0; relScreen(); });
onClick('[data-rl-done]', () => finishRelease());
function closeRelease(fromPop) {
  if (!RL) return;
  clearInterval(RL.timer);
  RL = null;
  const el = $('#release'); if (el) el.remove();
  document.body.classList.remove('in-ritual');
  if (!fromPop) history.back();
  if (currentPath() === '/luck') setTimeout(renderLuck, 60);
}
onClick('[data-rl-close]', () => closeRelease());
addEventListener('popstate', () => { if (RL && !(history.state && history.state.lrlRelease)) closeRelease(true); });
