// 账号相关页面：登录注册、忘记密码、我的资料、会员与订单、意见反馈、关于与声明。
import { $, $$, esc, api, toast, openSheet, onClick, dtText, ymdText, price, readLocal, writeLocal, track, currentPath, anonId } from './core.js';
import { THEME, THEME_DESC, ADVICE } from './data.js';
import { S } from './state.js';
import { footHtml } from './today.js';
import { birthFields, readBirth, wireBirth, checkBirth } from './onboard.js';
import { resetCard } from './me.js';

const phead = (title) => `<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>${title}</h1></div>`;

// ---------- 登录注册 ----------
export function pageAuth(r) {
  const reg = r.path === '/register';
  const p = readLocal('pending');
  const thumb = p ? `<div class="pthumb"><span class="sym">${p.card.symbol}</span><span><b>${esc(p.nickname || '你')}的能量卡 · ${p.card.element} · ${p.card.image}型</b><small>${reg ? '注册后保存，每天给你算今天' : '登录后可以用这份出生信息'}</small></span></div>` : '';
  $('#view').innerHTML = `<div class="auth">${thumb || '<div class="hero2"><b>流日历</b><span>按你的出生信息，告诉你每天适合做什么、几点做。</span></div>'}`
    + `<section class="card"><nav class="seg2"><button type="button" data-go="/login" aria-selected="${!reg}">登录</button><button type="button" data-go="/register" aria-selected="${reg}">注册</button></nav>`
    + '<form class="form" id="authForm" novalidate>'
    + `<label class="field"><span>用户名</span><input name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" required${reg ? ' placeholder="3–20 位，中文、字母、数字或下划线"' : ''}></label>`
    + `<label class="field"><span>密码</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" maxlength="72" enterkeyhint="${reg ? 'next' : 'go'}" required${reg ? ' placeholder="至少 8 位"' : ''}></label>`
    + (reg ? '<label class="field"><span>确认密码</span><input name="password2" type="password" autocomplete="new-password" maxlength="72" required></label>'
      + '<label class="check"><input type="checkbox" name="agree"><span>我已阅读并同意<button type="button" class="tbtn" data-doc="terms">用户协议</button>、<button type="button" class="tbtn" data-doc="privacy">隐私政策</button>和<button type="button" class="tbtn" data-doc="disclaimer">娱乐声明</button></span></label>' : '')
    + '<div class="err" id="authErr"></div>'
    + (reg && readLocal('invite') && readLocal('invite').name ? `<p class="invnote">注册后，你和${esc(readLocal('invite').name)}各得 ${readLocal('invite').days || 7} 天会员（明天再打开一次就生效）</p>` : '')
    + `<button class="btn primary block" type="submit">${reg ? (p ? '注册并保存' : '注册') : '登录'}</button>`
    + (reg ? '' : '<p style="margin:0;text-align:center"><a class="tbtn" href="#/forgot">忘记密码？</a></p>')
    + '</form></section>'
    + (p ? '' : '<p class="note" style="text-align:center;margin:0"><a href="#/start">先测测我的能量卡 ›</a></p>') + '</div>';
  const f = $('#authForm');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(f), err = $('#authErr');
    err.textContent = '';
    if (reg && fd.get('password') !== fd.get('password2')) { err.textContent = '两次输入的密码不一样'; return; }
    const btn = $('button[type=submit]', f); btn.disabled = true;
    const body = { username: fd.get('username'), password: fd.get('password'), agree: !!fd.get('agree') };
    if (reg && p) { body.birth = p.birth; body.nickname = p.nickname || ''; }
    const inv = readLocal('invite');
    if (reg && inv) { body.invite = inv.code; body.anonId = anonId(); }
    api('POST', reg ? 'auth/register' : 'auth/login', body)
      .then(() => api('GET', 'me'))
      .then((d) => {
        S.me = d.user; S.access = d.access; S.unread = d.unread; S.today = null; S.cal = null; resetCard();
        if (reg) { S.justRegistered = true; track('register', { withCard: !!p }); }
        if (p && !reg && (!S.me.birth || confirm('要用刚才填的出生信息替换账号里的吗？'))) {
          return api('PUT', 'me/profile', { nickname: p.nickname || S.me.nickname, bio: S.me.bio || '', birth: p.birth }).then((x) => { S.me = x.user; });
        }
      })
      .then(() => { if (p) writeLocal('pending', null); if (reg) writeLocal('invite', null); location.hash = S.me.birth ? '#/' : '#/welcome'; })
      .catch((e2) => { btn.disabled = false; err.textContent = e2.message; });
  });
}

export function pageForgot() {
  $('#view').innerHTML = phead('忘记密码') + '<section class="card"><p style="margin:0;font-size:13.5px">流日历不绑定手机和邮箱。留下用户名和联系方式，我们核实后帮你重置密码，并把新密码发给你。</p>'
    + '<form class="form" id="fgForm" novalidate><label class="field"><span>用户名</span><input name="username" maxlength="20" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"></label>'
    + '<label class="field"><span>联系方式</span><input name="contact" maxlength="50" placeholder="微信或手机号" autocapitalize="off" autocorrect="off"></label>'
    + '<label class="field"><span>补充说明（选填）</span><textarea name="note" maxlength="300" placeholder="比如：注册时间、开通会员的时间，方便我们核实"></textarea></label>'
    + '<div class="err" id="fgErr"></div><button class="btn primary block" type="submit">提交申请</button></form></section>';
  const f = $('#fgForm');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    api('POST', 'auth/forgot', { username: fd.get('username'), contact: fd.get('contact'), note: fd.get('note') }).then(() => {
      $('#view').innerHTML = phead('忘记密码') + '<section class="card" style="align-items:center;text-align:center"><div class="pay"><div class="ok">✓</div></div><b>已提交</b><p class="note" style="margin:0">我们会尽快核实，通过你留的联系方式把新密码发给你。</p><a class="btn ghost" href="#/login">返回登录</a></section>';
    }, (e2) => { $('#fgErr').textContent = e2.message; });
  });
}

// ---------- 我的资料 ----------
export function pageProfile() {
  const u = S.me;
  $('#view').innerHTML = phead('我的资料')
    + '<section class="card"><form class="form" id="pForm" novalidate>'
    + `<label class="field"><span>用户名</span><input value="${esc(u.username)}" disabled><span class="hint">用户名注册后不能修改</span></label>`
    + `<label class="field"><span>称呼</span><input name="nickname" maxlength="12" value="${esc(u.nickname)}" placeholder="日历上怎么称呼你"></label>`
    + `<label class="field"><span>简介</span><textarea name="bio" maxlength="100" placeholder="一句话介绍自己（选填）">${esc(u.bio)}</textarea><span class="hint" id="bioCount"></span></label>`
    + birthFields(u.birth)
    + '<div class="err" id="pErr"></div><button class="btn primary block" type="submit">保存</button></form></section>'
    + '<section class="card"><h3>修改密码</h3><form class="form" id="pwForm" novalidate>'
    + '<label class="field"><span>当前密码</span><input name="old" type="password" autocomplete="current-password" required></label>'
    + '<label class="field"><span>新密码</span><input name="password" type="password" autocomplete="new-password" placeholder="至少 8 位" required></label>'
    + '<label class="field"><span>确认新密码</span><input name="password2" type="password" autocomplete="new-password" required></label>'
    + '<div class="err" id="pwErr"></div><button class="btn ghost block" type="submit">修改密码</button></form></section>'
    + '<p style="margin:0;text-align:center"><button type="button" class="tbtn quiet" data-delete-open>注销账号</button></p>' + footHtml();
  const f = $('#pForm'); wireBirth(f);
  const bio = f.elements.bio, cnt = $('#bioCount');
  const upd = () => { cnt.textContent = bio.value.length + ' / 100'; }; upd(); bio.addEventListener('input', upd);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const b = readBirth(f), msg = checkBirth(b);
    if (msg) { $('#pErr').textContent = msg; return; }
    const changed = !u.birth || b.date !== u.birth.date || (b.time || null) !== (u.birth.time || null) || (b.city || null) !== (u.birth.city || null) || (b.zhi || null) !== (u.birth.zhi || null);
    if (changed && u.xiOverride && !confirm('改了出生信息后，你自定义的幸运元素会恢复为自动推算，确定吗？')) return;
    const btn = $('button[type=submit]', f); btn.disabled = true;
    api('PUT', 'me/profile', { nickname: f.elements.nickname.value, bio: bio.value, birth: b }).then((d) => {
      S.me = d.user; S.today = null; S.cal = null; resetCard(); btn.disabled = false; $('#pErr').textContent = '';
      toast(changed ? '已保存，日历已按新的出生信息重算' : '已保存');
    }, (e2) => { btn.disabled = false; $('#pErr').textContent = e2.message; });
  });
  const pf = $('#pwForm');
  pf.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(pf);
    if (fd.get('password') !== fd.get('password2')) { $('#pwErr').textContent = '两次输入的新密码不一样'; return; }
    api('POST', 'auth/password', { old: fd.get('old'), password: fd.get('password') }).then(() => {
      pf.reset(); $('#pwErr').textContent = ''; toast('密码已修改，其他设备需要重新登录');
    }, (e2) => { $('#pwErr').textContent = e2.message; });
  });
}

// ---------- 会员与订单 ----------
export function pageMember() {
  const v = $('#view');
  v.innerHTML = phead('会员与订单') + '<div class="sk" style="height:110px"></div><div class="sk" style="height:220px"></div>';
  api('GET', 'membership').then((d) => {
    if (currentPath() !== '/member') return;
    S.access = d.access; S.priceCents = d.priceCents; S.memberDays = d.memberDays;
    const a = d.access;
    let card;
    if (a.mode === 'member') card = `<div class="mcard"><small>月度会员</small><b>有效期至 ${ymdText(a.memberUntil)}</b><span>还剩 ${a.daysLeft} 天${a.daysLeft <= 3 ? '，快到期了' : ''}</span></div>`;
    else if (a.mode === 'free') card = `<div class="mcard"><small>免费体验中</small><b>还剩 ${a.remaining} 次</b><span>同一天里随便看只算 1 次，共 ${a.freeLimit} 次</span></div>`;
    else card = `<div class="mcard"><small>${a.expired ? '会员已到期' : '免费体验已用完'}</small><b>开通后继续使用</b><span>你的资料和计划都还在</span></div>`;
    const buy = `<section class="card"><div class="price"><b>¥${price(d.priceCents)}</b><span>/ ${d.memberDays} 天</span></div>`
      + '<ul class="perks"><li>每天的你：今日一句、宜忌、最佳时段</li><li>每日一签和今日穿搭色</li><li>整月日历、挑日子（最远 3 个月）、本月精选</li><li>订阅到手机日历，每天出现在日历里</li><li>每月 1 次免费问事（梅花易数 + 白话解读）</li><li>能量档案和专业模式（完整八字盘）</li></ul>'
      + `<button type="button" class="btn primary block" data-pay>${a.mode === 'member' ? '续费 ' + d.memberDays + ' 天' : '开通月度会员'}</button>`
      + '<p class="note" style="margin:0">支付宝付款，不自动续费。会员期内续费，有效期顺延。</p></section>';
    const orders = '<section class="card"><h3>订单记录</h3>' + (d.orders.length ? '<div class="olist">' + d.orders.map((o) => {
      const st = { paid: '已支付', pending: '待支付', refunded: '已退款' }[o.status] || o.status;
      return `<div class="o"><span>${o.product && o.product !== 'member' ? esc(o.productName) : `月度会员 · ${o.days} 天`}</span><span class="s">¥${price(o.amountCents)}</span><small>${dtText(o.paidAt || o.createdAt)} · ${o.outTradeNo}</small><small style="text-align:right">${st}</small></div>`;
    }).join('') + '</div>' : '<div class="empty">还没有订单</div>') + '</section>';
    v.innerHTML = phead('会员与订单') + card + buy + orders + '<p class="note" style="text-align:center;margin:0">付了钱但没开通？<a href="#/feedback?t=付款问题">告诉我们</a></p>' + footHtml();
  }, (e) => { v.innerHTML = phead('会员与订单') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}

// ---------- 意见反馈 ----------
export function pageFeedback(r) {
  const v = $('#view');
  const types = ['问题', '建议', '付款问题', '其他'], t0 = types.includes(r.q.get('t')) ? r.q.get('t') : '问题';
  v.innerHTML = phead('意见反馈')
    + '<section class="card"><form class="form" id="fbForm" novalidate>'
    + `<div class="field"><span>类型</span><div class="pills">${types.map((t) => `<button type="button" data-t="${t}" aria-pressed="${t === t0}">${t}</button>`).join('')}</div></div>`
    + '<label class="field"><span>内容</span><textarea name="content" maxlength="500" placeholder="遇到了什么问题，或者希望我们改进什么？"></textarea><span class="hint" id="fbCount">0 / 500</span></label>'
    + '<label class="field"><span>联系方式（选填）</span><input name="contact" maxlength="50" placeholder="微信或手机号，方便我们回复你"></label>'
    + '<div class="err" id="fbErr"></div><button class="btn primary block" type="submit">提交</button></form></section>'
    + '<section class="card"><h3>我的反馈</h3><div id="fbList"><div class="sk" style="height:60px"></div></div></section>' + footHtml();
  const f = $('#fbForm');
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) $$('[data-t]', f).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); });
  f.elements.content.addEventListener('input', function () { $('#fbCount').textContent = this.value.length + ' / 500'; });
  const load = () => api('GET', 'feedback').then((d) => {
    S.unread = 0;
    if (!$('#fbList')) return;
    $('#fbList').innerHTML = d.list.length ? d.list.map((x) => {
      const st = { open: '待处理', replied: '已回复', closed: '已关闭' }[x.status];
      return `<div class="fb"><div class="fh"><span class="st ${x.status}">${st}</span><span>${esc(x.type)}</span><span>${dtText(x.created_at)}</span></div><div>${esc(x.content)}</div>${x.reply ? `<div class="rp"><b>回复 · ${dtText(x.replied_at)}</b>${esc(x.reply)}</div>` : ''}</div>`;
    }).join('') : '<div class="empty">还没有提交过反馈</div>';
  }, (e) => { if ($('#fbList')) $('#fbList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = $('[data-t][aria-pressed="true"]', f).getAttribute('data-t');
    const btn = $('button[type=submit]', f); btn.disabled = true;
    api('POST', 'feedback', { type, content: f.elements.content.value, contact: f.elements.contact.value, meta: { page: location.href, screen: screen.width + 'x' + screen.height } }).then(() => {
      btn.disabled = false; f.elements.content.value = ''; $('#fbCount').textContent = '0 / 500'; $('#fbErr').textContent = '';
      toast('收到了，谢谢你。回复会显示在下面'); load();
    }, (e2) => { btn.disabled = false; $('#fbErr').textContent = e2.message; });
  });
  load();
}

// ---------- 关于与声明 ----------
const loadLegal = () => (S.legal ? Promise.resolve(S.legal) : api('GET', 'legal').then((d) => { S.legal = d; return d; }));
export function openDoc(k) {
  const titles = { terms: '用户协议', privacy: '隐私政策', disclaimer: '娱乐声明' };
  loadLegal().then((d) => openSheet(titles[k], `<p class="doc">${esc(d[k])}</p>`), (e) => toast(e.message));
}
export function pageAbout(r) {
  const v = $('#view');
  v.innerHTML = phead('关于与声明') + '<div class="sk" style="height:300px"></div>';
  loadLegal().then((d) => {
    if (currentPath() !== '/about') return;
    const sec = r.q.get('s') || 'intro';
    const det = (id, title, body) => `<details id="s-${id}"${sec === id ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
    const themes = '<table>' + ['正财', '偏财', '正官', '七杀', '正印', '偏印', '食神', '伤官', '比肩', '劫财'].map((k) => `<tr><td><b>${THEME[k][0]}</b><br><span class="muted" style="font-size:11px">${THEME[k][1]}</span></td><td style="text-align:left;white-space:normal">${THEME_DESC[k]}。${ADVICE[k].do.slice(0, 2).join('、')}。<span class="muted" style="display:block;font-size:11px">专业名：${k}</span></td></tr>`).join('') + '</table>';
    v.innerHTML = phead('关于与声明') + '<section class="card about rules">'
      + det('intro', '一句话说清楚', '<p style="margin:0">中国传统认为，世界由五种能量组成：木、火、土、金、水。你出生那一刻的能量组合，就是你的「能量卡」。每一天、每两个小时也都有自己的能量。</p><ul><li>当天的能量正好是你需要的（幸运元素），这一天就更顺。</li><li>当天的能量和你的本命能量相冲，就容易有波动，适合低调一点。</li><li>能量和你的关系不同，这一天的「主题」也不同，比如收获日、表达日、充电日，建议也跟着主题走。</li><li>最上面一行「大家的今天」是所有人都一样的通用黄历；下面「你的今天」按你的出生信息单独算。</li></ul>')
      + det('themes', '十种「日主题」', themes)
      + det('algo', '这个日历怎么算（专业）', '<ol><li>按出生时间排出四柱（节气换月，立春换年，子时按 23 点起算）。</li><li>估算日主强弱：天干每个计 1 分，地支藏干本气 / 中气 / 余气计 1 / 0.5 / 0.3，月令再乘 1.6。日主同类加生我的五行占比 ≥ 50% 视为身强。</li><li>身强喜「我生、我克、克我」（食伤、财、官杀），忌印比；身弱反之。可在「能量档案」里手动改。</li><li>每天从 60 分起，按下表加减，再分五档：≥82 很顺，69–81 顺利，52–68 平稳，41–51 留神，≤40 低调。</li><li>时辰同理，以当天每个时辰的干支评分，并参考黄历的黄道 / 黑道。推荐给你的「最佳时段」只在 7–21 点里挑。</li><li>填了出生城市时，先把出生地的钟表时间换成真太阳时（含夏令时、经度时差、均时差）再排盘；落在两个时辰交界前后 15 分钟内的，按你选的时辰排。</li><li>挑日子：从明天起，先排除黄历忌这类事的日子、月破岁破日、和你日支相冲的日子，再按个人分、十神是否对路、黄历宜和神煞排序，取前 3 天。</li><li>每日一签用传统观音灵签 100 签，由「你 + 日期」决定，当天不变。</li></ol>'
        + '<h4>流日加减分</h4><table><tr><td>日干五行是喜用 / 忌神</td><td>+9 / −9</td></tr><tr><td>日支本气是喜用 / 忌神</td><td>+8 / −8</td></tr><tr><td>日支冲原局日支</td><td>−15</td></tr><tr><td>日支与原局日支六合 / 半合</td><td>+8 / +6</td></tr><tr><td>日支与原局日支相刑 / 相害</td><td>−6 / −5</td></tr><tr><td>日支冲原局年、月、时支</td><td>−6</td></tr><tr><td>日支与原局其他支合</td><td>+3</td></tr><tr><td>日干与日主相合</td><td>+5</td></tr><tr><td>日支逢天乙贵人 / 文昌</td><td>+8 / +4</td></tr><tr><td>日支冲流年太岁</td><td>−4</td></tr><tr><td>流月干支喜忌</td><td>±2 ~ ±4</td></tr></table>'
        + '<h4>十二时辰加减分</h4><table><tr><td>时干喜用 / 忌神</td><td>+10 / −10</td></tr><tr><td>时支本气喜用 / 忌神</td><td>+8 / −8</td></tr><tr><td>时支冲当天日支</td><td>−12</td></tr><tr><td>时支冲原局日支</td><td>−10</td></tr><tr><td>时支与原局日支合</td><td>+6</td></tr><tr><td>贵人时</td><td>+6</td></tr><tr><td>黄历黄道 / 黑道</td><td>+4 / −4</td></tr></table>')
      + det('disclaimer', '娱乐声明', `<p class="doc">${esc(d.disclaimer)}</p>`)
      + det('terms', '用户协议', `<p class="doc">${esc(d.terms)}</p>`)
      + det('privacy', '隐私政策', `<p class="doc">${esc(d.privacy)}</p>`)
      + '</section>' + footHtml();
    const el = $('#s-' + sec);
    if (el && sec !== 'intro') setTimeout(() => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -64); }, 0);
  }, (e) => { v.innerHTML = phead('关于与声明') + `<div class="errbox"><p>${esc(e.message)}</p><button class="btn ghost" type="button" data-reload>重新加载</button></div>`; });
}

onClick('[data-doc]', (el, e) => { e.preventDefault(); openDoc(el.getAttribute('data-doc')); });
onClick('#logoutBtn', () => {
  if (!confirm('确定退出登录吗？')) return;
  api('POST', 'auth/logout', {}).then(() => { if (window.caches) caches.keys().then((ks) => ks.filter((k) => k.startsWith('lrl-')).forEach((k) => caches.delete(k))); S.me = null; S.access = null; S.today = null; S.cal = null; resetCard(); location.hash = '#/'; });
});

// ---------- 注销账号 ----------
onClick('[data-delete-open]', () => {
  const a = S.access || {};
  openSheet('注销账号', '<form class="form" id="delForm" novalidate><p style="margin:0;font-size:14px;line-height:1.7">注销后会<b>立即删除</b>你的出生信息、计划、签、心情便签、问事、反馈和邀请关系，无法恢复。订单只保留金额、时间和支付宝交易号用于对账，不再和你关联。</p>'
    + (a.mode === 'member' ? `<p class="warnline">还剩 ${a.daysLeft} 天的会员会一起作废，不退款。</p>` : '')
    + '<label class="field"><span>输入密码确认</span><input name="password" type="password" autocomplete="current-password" required></label>'
    + '<div class="err" id="delErr"></div><button type="submit" class="btn danger block">注销账号</button></form>');
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'delForm') return;
  e.preventDefault();
  const btn = $('button[type=submit]', e.target); btn.disabled = true;
  api('POST', 'me/delete', { password: e.target.elements.password.value }).then(() => {
    if (window.caches) caches.keys().then((ks) => ks.filter((k) => k.startsWith('lrl-')).forEach((k) => caches.delete(k)));
    S.me = null; S.access = null; S.today = null; S.cal = null; resetCard();
    location.hash = '#/';
    toast('账号已注销');
  }, (e2) => { btn.disabled = false; $('#delErr').textContent = e2.message; });
});
