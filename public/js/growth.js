// 邀请好友、订阅到手机日历两个子页，以及朋友点开邀请链接时的落地处理。
import { $, esc, api, toast, openSheet, onClick, currentPath, dtText, readLocal, writeLocal, IS_IOS, IS_IPAD, IS_MOBILE, IS_STANDALONE, IN_APP, installKind, ENV_NAME, copyText, track, EN, MON } from './core.js';
import { S } from './state.js';
import { footHtml } from './today.js';
import { share } from './share.js';
import { tm } from './i18n.js';
const t = tm('me'); // 先查 i18n/en/me.json

const phead = (title) => `<div class="phead"><button type="button" class="back" data-back aria-label="${t('返回')}">‹</button><h1>${title}</h1></div>`;
const errHtml = (title, e) => phead(title) + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>${t('重新加载')}</button></div>`;
// 星期：中文「周二」，英文「Tue」
const WK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekName = (w) => (EN ? WK_EN[w] : '周' + '日一二三四五六'[w]);
const app = () => (EN ? t('这个应用') : IN_APP); // 英文不点 App 名
export const inviteUrl = (code, from) => `${location.origin}${location.pathname}?i=${code}${from ? '&from=' + from : ''}`;
const copy = copyText;

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
    setTimeout(() => openSheet(t('你们俩的画'), d.pair
      ? pairHtml(d.pair, d.best, d.name, t('你们已经连上，在「我的 › 邀请好友」里随时能看。'))
      : `<p style="margin:0;line-height:1.8">${t('你和{name}已经连上。你们俩都测完能量卡后，就能在「我的 › 邀请好友」里看到你们俩的画。', { name: esc(d.name) })}</p>`), 400);
  }, () => { S.linking = false; });
}
export const pendingInvite = () => { const v = readLocal('invite'); return v && Date.now() - (v.at || 0) < 30 * 86400000 ? v : null; };

// 两个人的画：画、画名、关系、一句话、未来两周最适合一起做事的一天（被邀请的朋友测完能量卡、邀请记录里都用）
export function pairHtml(p, best, who, note = '') {
  const date = best ? (EN ? `${weekName(best.week)}, ${MON[best.m - 1]} ${best.d}` : `${best.m}月${best.d}日 ${weekName(best.week)}`) : '';
  return `<section class="pairc"><small>${t('你和{name}的画', { name: esc(who) })}</small><img class="pa" src="${esc(p.art)}" alt="" width="600" height="600" decoding="async">`
    + `<b class="pn">${esc(p.name)}</b><span class="ptag">${esc(p.tag)}</span><p class="pl">${esc(p.line)}</p>`
    + (best ? `<p class="pbest">${t('未来两周，<b>{date}</b>最适合你们一起做事', { date })}</p>` : '')
    + (note ? `<p class="note" style="margin:0">${note}</p>` : '') + '</section>';
}

// ---------- 邀请好友 ----------
export function pageInvite() {
  const v = $('#view'), T = t('邀请好友');
  v.innerHTML = phead(T) + '<div class="sk" style="height:190px"></div><div class="sk" style="height:120px"></div>';
  Promise.all([api('GET', 'me/invite'), api('GET', 'friends')]).then(([d, fr]) => {
    if (currentPath() !== '/invite') return;
    S.inviteCode = d.code; S.friends = fr.list;
    const url = inviteUrl(d.code);
    const beta = !!S.access?.beta; // 体验版人人都是会员，不提奖励天数
    const st = (r) => (beta ? `<em class="ok">${t('已加入')}</em>` : r.status === 'done' ? `<em class="ok">${t('已生效 +{n} 天', { n: d.days })}</em>` : r.status === 'capped' ? `<em>${t('已生效 · 本月奖励已满')}</em>` : r.status === 'blocked' ? `<em>${t('同一台设备注册，不计奖励')}</em>` : `<em>${esc(r.need)}</em>`);
    v.innerHTML = phead(T)
      + (beta ? `<section class="invhero"><b>${t('邀请朋友一起来<br>看看你们俩的画')}</b><span>${t('朋友测完能量卡、注册后，就在这里看你们俩的画。')}</span>`
        : `<section class="invhero"><b>${t('每邀请一位朋友<br>你们各得 {n} 天会员', { n: d.days })}</b><span>${t('朋友测完能量卡、注册，第二天再打开一次就生效。')}</span>`)
      + `<div class="linkbox"><span>${esc(url.replace(/^https?:\/\//, ''))}</span><button type="button" class="btn sm primary" data-inv-copy>${t('复制')}</button></div>`
      + `<button type="button" class="btn ghost block" data-inv-poster>${t('生成邀请海报')}</button></section>`
      + friendsHtml(fr.list)
      + (beta ? '' : `<section class="card"><div class="stats3"><div><b>${d.stats.invited}</b><small>${t('已邀请')}</small></div><div><b>${d.stats.done}</b><small>${t('已生效')}</small></div><div><b>${d.stats.days}</b><small>${t('得到的天数')}</small></div></div></section>`)
      + `<section class="card"><h3>${t('邀请记录')}</h3>${d.list.length ? `<div class="ilist">${d.list.map((r) => `<div><span>${esc(r.name)}<small>${dtText(r.at)}</small></span>${st(r)}</div>`).join('')}</div>` : `<div class="empty">${t('还没有朋友通过你的链接注册')}</div>`}</section>`
      + (beta ? '' : `<p class="note" style="margin:0;text-align:center">${d.left > 0 ? t('本月还能获得 {n} 次奖励', { n: d.left }) : t('本月的邀请奖励已经满了，朋友注册仍然能拿到奖励')}</p>`) + footHtml();
    S.inviteUrl = url;
  }, (e) => { v.innerHTML = errHtml(T, e); });
}
// 朋友的画：你邀请的、邀请你的、点链接连上的，每人一张你们俩的画
const SRC = { invited: t('你邀请的'), inviter: t('邀请你的'), link: t('点链接连上的') };
function friendsHtml(list) {
  return `<section class="card"><h3>${t('朋友的画')}</h3>`
    + (list.length ? `<div class="frlist">${list.map((x, i) => `<button type="button" class="frrow" data-friend="${i}"${x.pair ? '' : ' disabled'}>`
      + (x.pair ? `<img src="${esc(x.pair.art)}" alt="">` : `<span class="frnone" aria-hidden="true">${t('画')}</span>`)
      + `<span><b>${esc(x.name)}</b><small>${SRC[x.src]} · ${x.pair ? esc(x.pair.tag) : t('测完能量卡后就有你们俩的画')}</small></span>${x.pair ? '<i aria-hidden="true">›</i>' : ''}</button>`).join('')}</div>`
      : `<div class="empty">${t('还没有朋友。把下面的链接发给朋友，TA 测完能量卡就会出现在这里。')}</div>`)
    + `<p class="note" style="margin:0">${t('链接发给新朋友：{who}；发给已经在用 flowday 的朋友：TA 点开，你们也会在这里看到彼此的画。双方只看到对方的本命形象，看不到生日。', { who: S.access?.beta ? t('TA 注册后就会出现在这里') : t('注册后你们各得会员') })}</p></section>`;
}
onClick('[data-friend]', (el) => {
  const x = S.friends && S.friends[+el.getAttribute('data-friend')];
  if (!x || !x.pair) return;
  track('pair_view', { from: 'friends', src: x.src, kind: x.pair.kind });
  openSheet(t('你们俩的画'), pairHtml(x.pair, x.pair.best, x.name));
});
onClick('[data-inv-copy]', () => { track('invite_copy'); copy(t('我在用 flowday，按出生信息算每天适合做什么。测测你是什么型：{url}', { url: S.inviteUrl }), t('已复制，发给朋友吧')); });
onClick('[data-inv-poster]', (el) => {
  if (el.disabled) return;
  track('invite_poster');
  // 取能量卡、加载插画要一两秒，按钮先给个反馈，免得以为没点上
  const text = el.textContent;
  el.disabled = true; el.textContent = t('正在生成海报…');
  api('GET', 'me/card').then((d) => share('invite', { card: d.card, name: d.nickname || S.me.username, days: S.inviteDays }), (e) => toast(e.message))
    .finally(() => { el.disabled = false; el.textContent = text; });
});

// ---------- 订阅到手机日历 ----------
export function pageIcs() {
  const v = $('#view'), T = t('订阅到手机日历');
  v.innerHTML = phead(T) + '<div class="sk" style="height:220px"></div>';
  track('ics_open', { env: ENV_NAME });
  api('GET', 'me/calendar-feed').then((d) => {
    if (currentPath() !== '/ics') return;
    S.feed = d;
    const wk = (e) => weekName(new Date(e.y, e.m - 1, e.d).getDay());
    // 苹果设备一键订阅（webcal://）；App 内置浏览器会拦这个链接，就只给手动粘贴的办法；安卓自带日历大多不支持订阅网址，照实说
    const apple = IS_IOS || (!IS_MOBILE && /Macintosh/.test(navigator.userAgent)), android = IS_MOBILE && !IS_IOS;
    const steps = (arr) => `<ol class="steps">${arr.map((x) => `<li>${x}</li>`).join('')}</ol>`;
    const iosSteps = steps([t('点下面的「复制订阅链接」。'), t('打开「设置」，进入「App → 日历 → 日历账户」（iOS 17 及更早是「日历 → 账户」）。'), t('选「添加账户 → 其他 → 添加已订阅的日历」，粘贴链接，点「下一步」再点「存储」。')]);
    const androidNote = `<section class="card">${steps([t('点上面的「复制订阅链接」。'), t('打开手机自带的日历，在设置里找「订阅日历」或「通过网址添加」，粘贴链接。'), t('用 Google 日历的：在电脑上打开 calendar.google.com，左侧「其他日历」点「＋」，选「通过网址添加」，手机会自动同步。')])}<p class="note" style="margin:8px 0 0">${t('很多安卓手机自带的日历没有订阅网址的功能，这种情况暂时订阅不了，每天打开 flowday 看就好。')}</p></section>`;
    const copyBtn = (primary) => `<button type="button" class="btn ${primary ? 'primary' : 'ghost'} block" data-ics-copy>${t('复制订阅链接')}</button>`;
    let how;
    // iPhone 上只有 Safari 确定能一键订阅；App 里和其他浏览器给手动粘贴的办法，哪里都能用
    if (IS_IOS && installKind() !== 'ios-safari') how = `<p class="note" style="margin:0">${IN_APP ? t('在{app}里不能一键订阅', { app: esc(app()) }) : IS_STANDALONE() ? t('从桌面打开时不一定能一键订阅') : t('这个浏览器不一定能一键订阅')}${t('，按下面三步手动加，一分钟就好。')}</p>` + copyBtn(true) + `<section class="card">${iosSteps}</section>`;
    else if (apple && IN_APP) how = `<p class="note" style="margin:0">${t('在{app}里不能一键订阅，点「复制订阅链接」，到 Mac 的「日历 → 文件 → 新建日历订阅」里粘贴。', { app: esc(app()) })}</p>` + copyBtn(true);
    else if (apple) how = `<a class="btn primary block" href="${esc(d.webcal)}" data-ics-sub>${t('订阅到 {device} 日历', { device: IS_IPAD ? 'iPad' : IS_IOS ? 'iPhone' : 'Mac' })}</a>` + copyBtn(false)
      + (IS_IOS ? `<details class="icsmore"><summary>${t('点了没反应？手动加')}</summary>${iosSteps}</details>` : '');
    else if (android) how = copyBtn(true) + androidNote;
    // Windows、Linux 没有系统日历接 webcal://，点了常常没反应，只给手动的办法
    else how = copyBtn(true) + `<section class="card">${steps([t('点上面的「复制订阅链接」。'), t('Google 日历：打开 calendar.google.com，左侧「其他日历」点「＋」，选「通过网址添加」，粘贴后添加。'), t('Outlook：在日历里点「添加日历 → 从 Internet 订阅」，粘贴链接。')])}</section>`;
    const where = android ? t('支持订阅的') : IS_MOBILE ? t('手机自带的') : t('你电脑上的');
    v.innerHTML = phead(T)
      + `<p class="lead">${t('订阅一次，{where}日历里每天都会出现你的这一天，不用打开 flowday 也能看到。', { where })}</p>`
      + `<div class="calmock"><div class="hd"><span>${t('日历 · 预览')}</span><span>flowday</span></div>${d.preview.map((e) => `<div class="ev"><span class="d">${wk(e)}<b>${e.d}</b></span><span class="t k${e.level}">${esc(e.summary)}<small>${esc(e.desc.split('\n')[0])}</small></span></div>`).join('')}</div>`
      + how
      + `<p class="note" style="margin:0">${t('每天自动更新未来 60 天，你定下的计划也会同步。')}${d.fetchedAt ? t('最近一次同步：{time}。', { time: dtText(d.fetchedAt) }) : ''}${t('链接只属于你，{reset}后旧的会失效。', { reset: `<button type="button" class="tbtn" data-ics-reset>${t('重置链接')}</button>` })}</p>` + footHtml();
  }, (e) => { v.innerHTML = errHtml(T, e); });
}
onClick('[data-ics-sub]', () => track('ics_subscribe', { via: 'webcal', env: ENV_NAME }));
onClick('[data-ics-copy]', () => { track('ics_subscribe', { via: 'copy', env: ENV_NAME }); copy(S.feed.url, t('已复制订阅链接')); });
onClick('[data-ics-reset]', () => {
  if (!confirm(t('重置后，已经订阅的旧链接会失效，需要重新订阅。确定吗？'))) return;
  api('POST', 'me/calendar-feed/reset', {}).then(() => { toast(t('已重置，请重新订阅')); pageIcs(); }, (e) => toast(e.message));
});
