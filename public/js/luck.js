// 选中的御守随善行或练习掉落。已有的兑换余额仍可使用。
import { $, esc, api, toast, onClick, currentPath, openSheet, dismissSheet, track, readLocal, writeLocal } from './core.js';
import { S } from './state.js';
import { footHtml, memberLockHtml } from './today.js';
import { openPay } from './pay.js';
import { returnFromPractice, amuletVisual, startRitual, shareAmulet, STYLE_NAME } from './wish.js';

import { embroidered, hangingSrc, editionOf } from './omamori-art.js';

const heading = '<div class="phead"><h1>转运</h1></div>';
const md = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const M = { way: 'bowl', minutes: 10 }; // 冥想的选择
let TAB = 'deed';

let selectedWish = '平安';
function exhibit() {
  const art = embroidered[selectedWish];
  return `<section class="wish-rack" aria-label="御守挂架"><div class="rack-header"><h2>挑一枚心愿御守</h2><small lang="en">Omamori</small></div><div class="rack-rows">`
    + [0, 3, 6].map(start => '<div class="rack-rail">' + Object.entries(embroidered).slice(start,start + 3).map(([wish, a]) =>
      `<button type="button" data-charm-wish="${wish}" aria-pressed="${wish === selectedWish}"><img src="${hangingSrc(a)}" alt=""><span>${a.title}</span></button>`).join('') + '</div>').join('')
    + `</div><div class="rack-caption" aria-live="polite"><b>${art.title}</b><em lang="en">${art.en}</em><p>${art.message}</p></div></section>`;
}
function pathTabs() {
  return '<div class="ltabs luck-paths" role="tablist" aria-label="御守掉落方式">' +
    [['deed','行善迎好运'],['energy','静心送霉运']].map(([key,title]) =>
      `<button type="button" role="tab" data-luck-tab="${key}" aria-selected="${TAB === key}">${title}</button>`).join('') + '</div>';
}
function guestLuck() {
  const action = TAB === 'deed' ? deedsHtml(null) : energyHtml(null);
  return heading + exhibit() + pathTabs() + action + footHtml();
}
onClick('[data-charm-wish]', el => {
  selectedWish = el.dataset.charmWish;
  writeLocal('charm-wish:' + (S.me?.id || 'guest'), selectedWish);
  const rack = el.closest('.wish-rack'), art = embroidered[selectedWish];
  rack.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed','false');
  el.setAttribute('aria-pressed','true');
  $('.rack-caption', rack).innerHTML = `<b>${art.title}</b><em lang="en">${art.en}</em><p>${art.message}</p>`;
  const preview = $('.deed-preview');
  if (preview) preview.innerHTML = TAB === 'energy' ? previewCharm(S.me && S.luck?.practice, true) : previewCharm(S.me && S.luck?.deeds);
});
export function pageLuck(r) {
  const saved = readLocal('charm-wish:' + (S.me?.id || 'guest'));
  selectedWish = Object.hasOwn(embroidered, saved) ? saved : '平安';
  const t = r && r.q && r.q.get('tab');
  if (r) TAB = t === 'energy' ? 'energy' : 'deed';
  const v = $('#view');
  if (!S.me) {
    v.innerHTML = guestLuck();
    return;
  }
  v.innerHTML = heading + '<div class="sk" style="height:520px"></div>';
  api('GET', 'luck').then((d) => {
    if (currentPath() !== '/luck') return;
    S.luck = d;
    renderLuck();
  }, (e) => { if (currentPath() !== '/luck') return; v.innerHTML = heading + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}
addEventListener('lrl:luck', () => { if (currentPath() === '/luck' && S.luck) renderLuck(); });

function encouragement(text, n) {
  if (/电话|听|陪伴|陪着/.test(text)) return '谢谢你的陪伴。';
  if (/谢谢|感谢|夸|鼓励/.test(text)) return '你的话很暖。';
  if (/捡|垃圾|清理/.test(text)) return '谢谢你的用心。';
  return ['谢谢你的善意。','小事也很温暖。','有心了。'][(n - 1) % 3];
}
function previewCharm(z, energy = false) {
  const art = embroidered[selectedWish];
  const redeem = z && (energy ? z.have : z.unused) >= z.per;
  const action = energy ? 'data-energy-exchange' : 'data-deed-exchange';
  return `<small>兑换目标</small><img src="${hangingSrc(art)}" alt=""><figcaption>${art.title}</figcaption>
    ${redeem ? `<button type="button" class="btn primary sm" ${action}>兑换这枚</button>` : ''}`;
}
function deedWriting(z) {
  const per = z?.per || 5, balance = z?.unused || 0, filled = Math.min(balance, per);
  const status = balance >= per ? `可兑换 ${Math.floor(balance / per)} 枚` : `还差 ${per - filled} 件`;
  const marks = Array.from({length: per}, (_, i) => `<i class="${i < filled ? 'filled' : ''}"></i>`).join('');
  const entry = z ? `<form class="deedf deed-entry" id="deedForm" novalidate><input id="deed-text" aria-label="今天做了什么好事" name="text" maxlength="${z.maxLen}" placeholder="今天做了什么好事？" enterkeyhint="done"><button type="submit" class="btn ghost sm">记录善行</button></form>`
    : '<button class="btn ghost sm" data-demo-tip="保存善行进度">记录善行</button>';
  return `<div class="deed-compose"><div class="deed-ledger"><h2>${per} 件好事换 1 枚御守</h2><div class="deed-marks" aria-hidden="true">${marks}</div><p class="deed-balance">已攒 ${balance} 件 · ${status}</p>${entry}</div><figure class="deed-preview">${previewCharm(z)}</figure></div>`;
}
function deedLinks(z) {
  if (!z) return '';
  const count = `今日 ${z.today} 件`;
  const history = z.list.length ? `<details name="deed-more" class="deed-history"><summary>记录 · ${count}</summary><ul class="dlist">${z.list.map(r => {
    const art = embroidered[r.wish];
    const charm = art && r.amuletId ? `<button type="button" data-deed-amulet="${r.amuletId}" aria-label="查看${art.title}御守"><img src="${hangingSrc(art)}" alt="">${art.title} ›</button>` : '';
    return `<li><span>${esc(r.text)}</span><small>${md(r.createdAt)}</small>${charm}${r.used ? '' : `<button type="button" class="x" data-deed-del="${r.id}" aria-label="删掉这条">×</button>`}</li>`;
  }).join('')}</ul></details>` : `<span>${count}</span>`;
  return `${history}<details name="deed-more" class="deed-ideas"><summary>灵感</summary><div>${z.examples.map(x => `<button type="button" data-deed-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div></details>`;
}
function deedsHtml(z) {
  return `<section class="lsec deed-paper" role="tabpanel" aria-label="行善迎好运"><div class="deed-writing">${deedWriting(z)}</div><div class="deed-ticket" aria-live="polite" aria-atomic="true"></div><div class="deed-links">${deedLinks(z)}</div></section>`;
}
onClick('[data-deed-amulet]', async el => {
  try {
    const { amulet } = await api('GET', 'amulets/' + el.dataset.deedAmulet);
    if (el.isConnected) reveal(amulet);
  } catch (err) { toast(err.message); }
});
function energyHtml(d) {
  const pr = d?.practice, per = pr?.per || 20, have = pr?.have || 0;
  const status = have < per ? `还差 ${per-have} 分钟` : `可兑换 ${Math.floor(have/per)} 枚`;
  const header = `<div class="deed-paper energy-goal"><div class="deed-compose"><div class="deed-ledger"><h2>累计静心 ${per} 分钟换 1 枚御守</h2>
    <progress max="${per}" value="${Math.min(have,per)}" aria-label="静心兑换进度"></progress><p class="deed-balance">已攒 ${have} 分钟 · ${status}</p>
    <div class="practice-result" role="status"></div></div><figure class="deed-preview">${previewCharm(pr,true)}</figure></div></div>`;
  if (!d) return header + '<section class="lsec"><button class="btn primary block" data-demo-tip="保存静心进度">开始练习</button></section>';
  const p = pr.week, r = d.release;
  return header + '<section class="lsec" role="tabpanel" aria-label="静心练习">'
    + (p.meditate || p.release ? `<p class="dtip">这周冥想 ${p.meditate} 次 · 释放 ${p.release} 次</p>` : '')
    + '<div class="lcards"><div class="lcard"><b>冥想练习</b><p>完成所选时长后计入进度。</p>'
    + `<div class="pills" role="group" aria-label="方式"><button type="button" data-med-way="bowl" aria-pressed="${M.way === 'bowl'}">敲颂钵</button><button type="button" data-med-way="incense" aria-pressed="${M.way === 'incense'}">点一炷香</button></div>`
    + `<div class="pills" role="group" aria-label="时长">${d.meditate.minutes.map((m) => `<button type="button" data-med-min="${m}" aria-pressed="${M.minutes === m}">${m} 分钟</button>`).join('')}</div>`
    + `<small class="energy-forecast">${have + M.minutes < per ? `本次完成后，还差 ${per-have-M.minutes} 分钟` : `本次完成后，可兑换 ${Math.floor((have+M.minutes)/per)} 枚`}</small><button type="button" class="btn primary block" data-med-start>开始 ${M.minutes} 分钟冥想</button></div>`
    + `<div class="lcard"><b>${esc(r.name)}</b><small>完成一次计 ${pr.releaseMinutes} 分钟</small><p>${esc(r.intro)}</p><button type="button" class="btn primary block" data-rel-start>开始释放</button></div>`
    + '</div></section>';
}
function renderLuck() {
  const d = S.luck, v = $('#view');
  if (!d || !S.me || currentPath() !== '/luck') return;
  const a = d.amulets, price = `¥${(a.priceCents / 100).toFixed(1)}`;
  // 手里有送的（新用户、集齐一甲子）或买过没领的，先让人看见能领
  const buy = a.credits
    ? `<section class="lsec lbuy"><div><b>你有 ${a.credits} 枚御守可以领</b><small>选个心愿和款式，绣成你的那一枚</small></div><button type="button" class="btn primary sm" data-om-buy>领取</button></section>`
    : `<section class="lsec lbuy"><div><b>特别款御守</b><small>转运款 · 节气款${a.birthdayMonth ? ' · 生日款' : ''}，${price} 一枚</small></div><button type="button" class="btn ghost sm" data-om-buy>买一枚</button></section>`;
  const mine = `<section class="lsec lmine"><a class="lkrow" href="#/amulets"><span>我的御守</span><b>${a.count} 枚 ›</b></a></section>`;
  if (d.mode === 'blocked') { v.innerHTML = heading + exhibit() + memberLockHtml('记录善行或完成练习，收下御守') + mine + footHtml(); return; }
  const z = d.deeds;
  const top = `<div class="phead luck-head"><h1>转运</h1><a href="#/amulets">我的御守 · ${a.count} 枚 ›</a></div>`;
  v.innerHTML = top + exhibit() + pathTabs()
    + (TAB === 'deed' ? deedsHtml(z) : energyHtml(d)) + buy + footHtml();
}
onClick('[data-luck-tab]', (el) => {
  const tab = el.dataset.luckTab;
  if (TAB === tab) return;
  TAB = tab;
  history.pushState(null, '', '#/luck?tab=' + TAB);
  track('luck_tab', { tab: TAB });
  if (S.me) renderLuck(); else $('#view').innerHTML = guestLuck();
  $(`[data-luck-tab="${TAB}"]`)?.focus({ preventScroll: true });
});

// ---------- 做好事 ----------
onClick('[data-deed-ex]', (el) => { const i = $('#deedForm input'); if (i && !i.readOnly) { $('.deed-writing').hidden = false; $('.deed-ticket').replaceChildren(); i.value = el.dataset.deedEx; el.closest('details').open = false; i.focus(); } });
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'deedForm') return;
  e.preventDefault();
  const text = e.target.elements.text.value.trim(), btn = $('button', e.target);
  if (text.length < 2) { toast('写一句做了什么好事'); return; }
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '正在记下…';
  const form = e.target, owner = S.me?.id;
  form.elements.text.readOnly = true;
  if (form.dataset.text !== text) {
    form.dataset.text = text; form.dataset.key = crypto.randomUUID();
  }
  api('POST', 'deeds', { text, recordKey: form.dataset.key }).then((d) => {
    if (!S.luck || S.me?.id !== owner) return;
    S.luck.deeds = d.deeds;
    if (S.today?.luck) S.today.luck.unused = d.deeds.unused;
    track('deed_add', { n: d.deeds.total });
    if (!form.isConnected) {
      if (currentPath() === '/luck') pageLuck();
      return;
    }
    $('.deed-writing').innerHTML = deedWriting(d.deeds);
    $('.deed-links').innerHTML = deedLinks(d.deeds);
    $('.deed-ticket').textContent = '已记录。' + encouragement(text, d.deeds.today);
    if (!matchMedia('(pointer: coarse)').matches) $('#deedForm input').focus({preventScroll:true});
  }, (err) => {
    btn.disabled = false;
    form.elements.text.readOnly = false;
    btn.textContent = '再试一次';
    toast(err.message);
  });
});
onClick('[data-deed-del]', (el) => {
  api('DELETE', 'deeds/' + el.getAttribute('data-deed-del'), {}).then((d) => {
    S.luck.deeds = d.deeds;
    if (S.today && S.today.luck) S.today.luck.unused = d.deeds.unused;
    renderLuck();
  }, (e) => toast(e.message));
});

// ---------- 换御守 / 买特别款（一个弹层：选心愿，特别款再选款式） ----------
const X = { mode: 'buy', wish: null, style: 'basic' };
function amuletSheet() {
  const a = S.luck.amulets, wish = a.wishes.find((w) => w.name === X.wish) || a.wishes[0];
  X.wish = wish.name;
  if (X.mode === 'buy' && X.style === 'birthday' && !a.birthdayMonth) X.style = 'basic';
  const style = X.mode === 'buy' ? X.style : X.mode;
  const candidate = { look: a.looks[style], wish: wish.name, style };
  const art = editionOf(candidate);
  const pv = amuletVisual(candidate, 'pv');
  const price = `¥${(a.priceCents / 100).toFixed(1)}`;
  return `<div class="omx"><div class="omamori sm">${pv}</div>`
    + `<p class="note" style="margin:0;text-align:center">${art ? art.title + ' · ' + art.fabric : { deed: `善缘款 · 用你的幸运色（${esc(a.looks.deed.element)}）织成，盖「善行」印`, energy: `静心款 · 用你的幸运色（${esc(a.looks.deed.element)}）织成，盖「静心」印`, basic: `转运款 · 用你的幸运色（${esc(a.looks.deed.element)}）织成`, term: `节气款 · ${esc(a.term)}时节的颜色和图案`, birthday: '生日款 · 只在你的生日月有' }[style]}</p>`
    + `<div class="pills" role="group" aria-label="心愿">${a.wishes.map((w) => `<button type="button" data-ox-wish="${esc(w.name)}" aria-pressed="${w.name === X.wish}">${X.mode !== 'buy' && embroidered[w.name] ? embroidered[w.name].title : esc(w.name)}</button>`).join('')}</div>`
    + (X.mode === 'buy' ? `<div class="pills" role="group" aria-label="款式"><button type="button" data-ox-style="basic" aria-pressed="${X.style === 'basic'}">转运款</button><button type="button" data-ox-style="term" aria-pressed="${X.style === 'term'}">节气款</button>${a.birthdayMonth ? `<button type="button" data-ox-style="birthday" aria-pressed="${X.style === 'birthday'}">生日款</button>` : ''}</div>` : '')
    + `<button type="button" class="btn primary block" data-ox-go>${X.mode === 'energy' ? `用 ${S.luck.practice.per} 分钟换` : a.credits ? (a.credits > 1 ? `用已有的 ${a.credits} 枚里的 1 枚` : '用已有的 1 枚') : `${price} 买一枚`}</button></div>`;
}
const redrawOx = () => { const b = $('#sheet .sbody'); if (b && $('.omx', b)) b.innerHTML = amuletSheet(); };
function openAmuletSheet(mode) {
  X.mode = mode; X.wish = selectedWish; // 心愿跟挂架上选的一致
  openSheet(mode !== 'buy' ? '换一枚御守' : S.luck.amulets.credits ? '领一枚御守' : '直接买一枚御守', amuletSheet());
}
onClick('[data-deed-exchange]', async el => {
  el.disabled = true;
  const wish = selectedWish, batchStart = S.luck.deeds.batchStart;
  try {
    const d = await api('POST', 'amulets/exchange', { wish, batchStart });
    S.luck.deeds = d.deeds;
    S.luck.amulets.count = d.amuletCount;
    if (S.today?.luck) S.today.luck.unused = d.deeds.unused;
    track('deed_exchange', { wish });
    if (currentPath() === '/luck') {
      renderLuck();
      await animateRackDrop(d.amulet, false);
      if (currentPath() === '/luck') reveal(d.amulet);
    }
  } catch (err) { el.disabled = false; toast(err.message); }
});
onClick('[data-energy-exchange]', async el => {
  el.disabled = true;
  const wish = selectedWish;
  try {
    const d = await api('POST', 'amulets/exchange', { by:'energy', wish, lastExchange:S.luck.practice.lastExchange });
    S.luck.practice = d.practice;
    S.luck.amulets.count = d.amuletCount;
    if (S.today?.luck) S.today.luck.energy = d.practice.have;
    track('energy_exchange', {wish});
    if (currentPath() === '/luck') {
      renderLuck();
      await animateRackDrop(d.amulet, false);
      if (currentPath() === '/luck') reveal(d.amulet);
    }
  } catch (err) { el.disabled = false; toast(err.message); }
});
onClick('[data-om-buy]', () => {
  if (S.luck) { openAmuletSheet('buy'); return; }
  api('GET', 'luck').then((d) => { S.luck = d; openAmuletSheet('buy'); }, (e) => toast(e.message));
});
onClick('[data-ox-wish]', (el) => { X.wish = el.getAttribute('data-ox-wish'); redrawOx(); });
onClick('[data-ox-style]', (el) => { X.style = el.getAttribute('data-ox-style'); redrawOx(); });
async function animateRackDrop(a, scroll) {
  const charm = $(`[data-charm-wish="${a.wish}"] img`);
  if (charm && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (scroll) charm.scrollIntoView({ block:'nearest' });
    const effect = a.way === 'energy' ? 'energy-drop' : 'good-drop';
    charm.parentElement.classList.add(effect);
    const drift = a.way === 'energy' ? -8 : 8;
    await charm.animate([{transform:'rotate(0deg)'},{transform:`rotate(${drift}deg)`,offset:.3},{transform:'translateY(65px) rotate(-4deg)',opacity:0}],{duration:650,easing:'ease-in'}).finished.catch(() => {});
    charm.parentElement.classList.remove(effect);
  }
}
addEventListener('lrl:practice-complete', e => {
  if (currentPath() !== '/luck' || TAB !== 'energy') return;
  renderLuck();
  const feedback = $('.practice-result');
  if (feedback) {
    feedback.textContent = e.detail;
    feedback.closest('.energy-goal').scrollIntoView({ block:'center' });
  }
});
function reveal(a, note = '') {
  const dropped = a.look.dropKind;
  S.revealed = a;
  openSheet(a.style === 'pool' ? (note === '已收藏' ? a.wish + ' · 善意池限定' : '限定御守掉落 · ' + a.wish) : dropped ? (a.way === 'deed' ? '好事有回音' : '让不顺随风去') : '收下你的御守', `<div class="omx"><div class="omamori">${amuletVisual(a, 'rv' + a.id)}</div>`
    + `<p class="note" style="margin:0;text-align:center">${a.style === 'pool' ? `累计 ${a.look.goal.toLocaleString('en-US')} 件善行，获得「${esc(a.wish)}」。` : dropped ? esc(note || (a.way === 'deed' ? '你的善意带来了「' + embroidered[a.wish].title + '」。' : '这枚御守，送给刚刚静下来的你。')) : a.way === 'deed' ? `${S.luck ? S.luck.deeds.per : 5} 件善行换来的。` : a.way === 'energy' ? `${a.minutes} 分钟静心换来的。` : `${STYLE_NAME[a.style]}。`}收在「我的御守」里。</p>`
    + '<div class="acts2"><button type="button" class="btn ghost" data-om-share>送个祝福</button><button type="button" class="btn primary" data-om-wall>存为壁纸</button></div><div><button type="button" class="tbtn" data-om-keep>完成</button></div></div>');
}
onClick('[data-om-share]', () => { if (S.revealed) shareAmulet(S.revealed); });
onClick('[data-om-wall]', () => { if (S.revealed) shareAmulet(S.revealed, true); });
onClick('[data-om-keep]', () => { dismissSheet(); if (currentPath() === '/luck') renderLuck(); else if (currentPath() !== '/amulets') location.hash = '#/amulets'; else window.dispatchEvent(new Event('hashchange')); });
onClick('[data-ox-go]', (el) => {
  const a = S.luck.amulets;
  el.disabled = true;
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
onClick('[data-med-start]', () => startRitual({ ...M, recordKey: crypto.randomUUID(), breath: S.luck.meditate.breath }));

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
  const session = RL;
  if (!session || session.saving) return;
  session.saving = true;
  RL.step = 'done'; relScreen();
  const close = $('#release .relbody [data-rl-close]');
  if (close) { close.disabled = true; close.textContent = '正在保存…'; }
  api('POST','practices',{ kind:'release', before:session.before, after:session.after, rounds:session.round, recordKey:session.recordKey }).then(d => {
    if (S.luck) S.luck.practice = d.practice;
    if (S.today?.luck) S.today.luck.energy = d.practice.have;
    track('practice_release',{before:session.before,after:session.after});
    if (RL === session) returnFromPractice(closeRelease,`释放练习 +${d.minutes} 分钟 · 感受 ${session.before} → ${session.after} 分`);
  }, err => {
    session.saving = false;
    if (RL === session) $('.relbody').innerHTML = `<p>${esc(err.message)}</p><button class="btn primary" data-rl-done>重试保存</button>`;
  });
}

onClick('[data-rel-start]', () => {
  RL = { recordKey: crypto.randomUUID(), step: 'intro', topic: '', before: null, after: null, round: 1 };
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
}
onClick('[data-rl-close]', () => closeRelease());
addEventListener('popstate', () => { if (RL && !(history.state && history.state.lrlRelease)) closeRelease(true); });
