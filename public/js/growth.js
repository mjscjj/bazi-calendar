// 邀请好友、订阅到手机日历两个子页，以及朋友点开邀请链接时的落地处理。
import { $, esc, api, toast, openSheet, onClick, currentPath, dtText, readLocal, writeLocal, IS_IOS, IS_MOBILE, track } from './core.js';
import { S } from './state.js';
import { footHtml } from './today.js';
import { share } from './share.js';

const phead = (title) => `<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>${title}</h1></div>`;
const errHtml = (title, e) => phead(title) + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`;
export const inviteUrl = (code, from) => `${location.origin}${location.pathname}?i=${code}${from ? '&from=' + from : ''}`;
function copy(text, ok) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(ok), () => prompt('复制这个链接：', text));
}

// 朋友点开 ?i=邀请码：记下邀请码和邀请人的形象，去掉地址栏里的参数
export function catchInvite() {
  const sp = new URLSearchParams(location.search), code = (sp.get('i') || '').toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return Promise.resolve();
  sp.delete('i');
  history.replaceState(history.state, '', location.pathname + (sp.toString() ? '?' + sp : '') + location.hash);
  if (S.me) return linkFriend(code);
  track('landing', { from: 'invite' });
  return api('GET', 'invite/' + code).then((d) => writeLocal('invite', { code, name: d.name, days: d.days, card: d.card, at: Date.now() }), () => {});
}
// 已经注册的人打开朋友的链接（或在落地页登录）：两人连上，弹出你们俩的画（不算邀请奖励）。
// 这一次打开不弹收画提示，免得压在弹出的画上
export function linkFriend(code) {
  S.linking = true;
  return api('POST', 'friends/link', { code }).then((d) => {
    track('friend_link', { pair: !!d.pair });
    setTimeout(() => openSheet('你们俩的画', d.pair
      ? pairHtml(d.pair, d.best, d.name, '你们已经连上，在「我的 › 邀请好友」里随时能看。')
      : `<p style="margin:0;line-height:1.8">你和${esc(d.name)}已经连上。你们俩都测完能量卡后，就能在「我的 › 邀请好友」里看到你们俩的画。</p>`), 400);
  }, () => { S.linking = false; });
}
export const pendingInvite = () => { const v = readLocal('invite'); return v && Date.now() - (v.at || 0) < 30 * 86400000 ? v : null; };

// 两个人的画：画、画名、关系、一句话、未来两周最适合一起做事的一天（被邀请的朋友测完能量卡、邀请记录里都用）
export function pairHtml(p, best, who, note = '') {
  return `<section class="pairc"><small>你和${esc(who)}的画</small><img class="pa" src="${esc(p.art)}" alt="" width="600" height="600" decoding="async">`
    + `<b class="pn">${esc(p.name)}</b><span class="ptag">${esc(p.tag)}</span><p class="pl">${esc(p.line)}</p>`
    + (best ? `<p class="pbest">未来两周，<b>${best.m}月${best.d}日 周${'日一二三四五六'[best.week]}</b>最适合你们一起做事</p>` : '')
    + (note ? `<p class="note" style="margin:0">${note}</p>` : '') + '</section>';
}

// ---------- 邀请好友 ----------
export function pageInvite() {
  const v = $('#view'), T = '邀请好友';
  v.innerHTML = phead(T) + '<div class="sk" style="height:190px"></div><div class="sk" style="height:120px"></div>';
  Promise.all([api('GET', 'me/invite'), api('GET', 'friends')]).then(([d, fr]) => {
    if (currentPath() !== '/invite') return;
    S.inviteCode = d.code; S.friends = fr.list;
    const url = inviteUrl(d.code);
    const st = (r) => (r.status === 'done' ? `<em class="ok">已生效 +${d.days} 天</em>` : r.status === 'capped' ? '<em>已生效 · 本月奖励已满</em>' : r.status === 'blocked' ? '<em>同一台设备注册，不计奖励</em>' : `<em>${esc(r.need)}</em>`);
    v.innerHTML = phead(T)
      + `<section class="invhero"><b>每邀请一位朋友<br>你们各得 ${d.days} 天会员</b><span>朋友测完能量卡、注册，第二天再打开一次就生效。</span>`
      + `<div class="linkbox"><span>${esc(url.replace(/^https?:\/\//, ''))}</span><button type="button" class="btn sm primary" data-inv-copy>复制</button></div>`
      + '<button type="button" class="btn ghost block" data-inv-poster>生成邀请海报</button></section>'
      + friendsHtml(fr.list)
      + `<section class="card"><div class="stats3"><div><b>${d.stats.invited}</b><small>已邀请</small></div><div><b>${d.stats.done}</b><small>已生效</small></div><div><b>${d.stats.days}</b><small>得到的天数</small></div></div></section>`
      + `<section class="card"><h3>邀请记录</h3>${d.list.length ? `<div class="ilist">${d.list.map((r) => `<div><span>${esc(r.name)}<small>${dtText(r.at)}</small></span>${st(r)}</div>`).join('')}</div>` : '<div class="empty">还没有朋友通过你的链接注册</div>'}</section>`
      + `<p class="note" style="margin:0;text-align:center">${d.left > 0 ? `本月还能获得 ${d.left} 次奖励` : '本月的邀请奖励已经满了，朋友注册仍然能拿到奖励'}</p>` + footHtml();
    S.inviteUrl = url;
  }, (e) => { v.innerHTML = errHtml(T, e); });
}
// 朋友的画：你邀请的、邀请你的、点链接连上的，每人一张你们俩的画
const SRC = { invited: '你邀请的', inviter: '邀请你的', link: '点链接连上的' };
function friendsHtml(list) {
  return '<section class="card"><h3>朋友的画</h3>'
    + (list.length ? `<div class="frlist">${list.map((x, i) => `<button type="button" class="frrow" data-friend="${i}"${x.pair ? '' : ' disabled'}>`
      + (x.pair ? `<img src="${esc(x.pair.art)}" alt="">` : '<span class="frnone" aria-hidden="true">画</span>')
      + `<span><b>${esc(x.name)}</b><small>${SRC[x.src]} · ${x.pair ? esc(x.pair.tag) : '测完能量卡后就有你们俩的画'}</small></span>${x.pair ? '<i aria-hidden="true">›</i>' : ''}</button>`).join('')}</div>`
      : '<div class="empty">还没有朋友。把下面的链接发给朋友，TA 测完能量卡就会出现在这里。</div>')
    + '<p class="note" style="margin:0">链接发给新朋友：注册后你们各得会员；发给已经在用流日历的朋友：TA 点开，你们也会在这里看到彼此的画。双方只看到对方的本命形象，看不到生日。</p></section>';
}
onClick('[data-friend]', (el) => {
  const x = S.friends && S.friends[+el.getAttribute('data-friend')];
  if (!x || !x.pair) return;
  track('pair_view', { from: 'friends', src: x.src, kind: x.pair.kind });
  openSheet('你们俩的画', pairHtml(x.pair, x.pair.best, x.name));
});
onClick('[data-inv-copy]', () => { track('invite_copy'); copy(`我在用流日历，按出生信息算每天适合做什么。测测你是什么型：${S.inviteUrl}`, '已复制，发给朋友吧'); });
onClick('[data-inv-poster]', (el) => {
  if (el.disabled) return;
  track('invite_poster');
  // 取能量卡、加载插画要一两秒，按钮先给个反馈，免得以为没点上
  const text = el.textContent;
  el.disabled = true; el.textContent = '正在生成海报…';
  api('GET', 'me/card').then((d) => share('invite', { card: d.card, name: d.nickname || S.me.username, days: S.inviteDays }), (e) => toast(e.message))
    .finally(() => { el.disabled = false; el.textContent = text; });
});

// ---------- 订阅到手机日历 ----------
export function pageIcs() {
  const v = $('#view'), T = '订阅到手机日历';
  v.innerHTML = phead(T) + '<div class="sk" style="height:220px"></div>';
  track('ics_open');
  api('GET', 'me/calendar-feed').then((d) => {
    if (currentPath() !== '/ics') return;
    S.feed = d;
    const wk = (e) => '日一二三四五六'[new Date(e.y, e.m - 1, e.d).getDay()];
    const android = IS_MOBILE && !IS_IOS;
    const steps = '<ol class="steps"><li>点上面的「复制订阅链接」。</li><li>在电脑浏览器打开 calendar.google.com，左侧「其他日历」点「＋」，选「通过网址添加」。</li><li>粘贴链接后添加，手机上的 Google 日历会自动同步。有的手机自带日历也支持「订阅日历」，粘贴同一个链接即可。</li></ol>';
    v.innerHTML = phead(T)
      + '<p class="lead">订阅一次，手机自带的日历和日历小组件里，每天都会出现你的这一天。不用打开流日历也能看到。</p>'
      + `<div class="calmock"><div class="hd"><span>日历 · 预览</span><span>流日历</span></div>${d.preview.map((e) => `<div class="ev"><span class="d">周${wk(e)}<b>${e.d}</b></span><span class="t k${e.level}">${esc(e.summary)}<small>${esc(e.desc.split('\n')[0])}</small></span></div>`).join('')}</div>`
      + (android ? '' : `<a class="btn primary block" href="${esc(d.webcal)}" data-ics-sub>订阅到 iPhone / Mac 日历</a>`)
      + `<button type="button" class="btn ${android ? 'primary' : 'ghost'} block" data-ics-copy>复制订阅链接（安卓、Google 日历）</button>`
      + (android ? `<section class="card">${steps}</section>` : `<details class="icsmore"><summary>安卓和 Google 日历怎么加</summary>${steps}</details>`)
      + `<p class="note" style="margin:0">每天自动更新未来 60 天，你定下的计划也会同步。${d.fetchedAt ? `最近一次同步：${dtText(d.fetchedAt)}。` : ''}链接只属于你，<button type="button" class="tbtn" data-ics-reset>重置链接</button>后旧的会失效。</p>` + footHtml();
  }, (e) => { v.innerHTML = errHtml(T, e); });
}
onClick('[data-ics-sub]', () => track('ics_subscribe', { via: 'webcal' }));
onClick('[data-ics-copy]', () => { track('ics_subscribe', { via: 'copy' }); copy(S.feed.url, '已复制订阅链接'); });
onClick('[data-ics-reset]', () => {
  if (!confirm('重置后，已经订阅的旧链接会失效，需要重新订阅。确定吗？')) return;
  api('POST', 'me/calendar-feed/reset', {}).then(() => { toast('已重置，请重新订阅'); pageIcs(); }, (e) => toast(e.message));
});
