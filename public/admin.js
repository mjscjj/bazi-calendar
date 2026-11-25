// 流日历管理后台。
(function () {
'use strict';
var $ = function (s, r) { return (r || document).querySelector(s); };
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return String(n).padStart(2, '0'); }
function dt(iso) { if (!iso) return '—'; var d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function day(iso) { if (!iso) return '—'; var d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function yuan(c) { return '¥' + (c / 100).toFixed(2); }
function api(method, path, body) {
  return fetch('api/' + path, { method: method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(function (r) { return r.text().then(function (t) { var d; try { d = t ? JSON.parse(t) : {}; } catch (e) { d = {}; } if (!r.ok) { var e2 = new Error(d.message || '出错了'); e2.status = r.status; throw e2; } return d; }); },
      function () { throw new Error('网络连接失败'); })
    .catch(function (e) { if (e.status === 401) { renderLogin(); } throw e; });
}
var toastT;
function toast(m) { var el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); } el.textContent = m; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2600); }

// 简单对话框：fields = [{name,label,type,placeholder,value}]
function dialog(title, desc, fields, okText) {
  return new Promise(function (resolve) {
    var bg = document.createElement('div'); bg.className = 'dlg-bg';
    bg.innerHTML = '<form class="dlg"><h2>' + esc(title) + '</h2>' + (desc ? '<p>' + desc + '</p>' : '') + (fields || []).map(function (f) {
      return '<label class="field"><span>' + esc(f.label) + '</span>' + (f.type === 'textarea' ? '<textarea name="' + f.name + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea>' : '<input name="' + f.name + '" type="' + (f.type || 'text') + '" placeholder="' + esc(f.placeholder || '') + '" value="' + esc(f.value || '') + '">') + '</label>';
    }).join('') + '<div class="err"></div><div class="row"><button type="button" class="btn ghost" data-x>取消</button><button type="submit" class="btn primary">' + esc(okText || '确定') + '</button></div></form>';
    $('#layer').appendChild(bg);
    var f = $('form', bg), inp = $('input,textarea', f); if (inp) inp.focus();
    var done = function (v) { bg.remove(); resolve(v); };
    $('[data-x]', bg).onclick = function () { done(null); };
    bg.addEventListener('click', function (e) { if (e.target === bg) done(null); });
    f.onsubmit = function (e) { e.preventDefault(); var o = {}; new FormData(f).forEach(function (v, k) { o[k] = v; }); done(o); };
  });
}

var TABS = [['overview', '概览'], ['users', '用户'], ['orders', '订单'], ['feedback', '反馈'], ['compare', '规则对比'], ['settings', '设置'], ['logs', '操作日志']];
var openFb = 0;
function tab() { var h = location.hash.replace(/^#\/?/, ''); var t = h.split('?')[0]; return TABS.some(function (x) { return x[0] === t; }) ? t : 'overview'; }
function qparam(k) { var h = location.hash; var i = h.indexOf('?'); return i < 0 ? '' : (new URLSearchParams(h.slice(i + 1)).get(k) || ''); }

function shell(content) {
  var t = tab();
  $('#app').innerHTML = '<div class="ad"><nav><div class="brand"><span class="mk">流</span><b>流日历</b><small>后台</small></div>'
    + TABS.map(function (x) { return '<a href="#/' + x[0] + '"' + (x[0] === t ? ' aria-current="page"' : '') + '>' + x[1] + (x[0] === 'feedback' && openFb ? '<span class="cnt">' + openFb + '</span>' : '') + '</a>'; }).join('')
    + '<div class="bottom"><a href="./" target="_blank" rel="noopener">打开前台 ↗</a><a href="#" id="adLogout">退出后台</a></div></nav><main id="main">' + content + '</main></div>';
}
function renderLogin() {
  $('#app').innerHTML = '<div class="login2"><div class="brand" style="justify-content:center"><span class="mk">流</span><b>流日历 · 后台</b></div><section class="card"><form class="form" id="lf"><label class="field"><span>账号</span><input name="username" autocomplete="username"></label><label class="field"><span>密码</span><input name="password" type="password" autocomplete="current-password"></label><div class="err" id="lerr"></div><button class="btn primary block">登录</button></form></section></div>';
  $('#lf').onsubmit = function (e) {
    e.preventDefault(); var fd = new FormData(e.target);
    fetch('api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.message); }); })
      .then(route, function (er) { $('#lerr').textContent = er.message; });
  };
}

// ---------- 概览 ----------
function barChart(title, series, key, fmt) {
  var W = 560, H = 150, padL = 34, padB = 18, n = series.length;
  var max = Math.max(1, Math.max.apply(null, series.map(function (s) { return s[key]; })));
  var nice = Math.pow(10, Math.floor(Math.log10(max))); var top = Math.ceil(max / nice) * nice; if (top < 10 && top % 2) top += 1;
  var bw = (W - padL) / n, h = '';
  [0, 0.5, 1].forEach(function (f) { var y = (H - padB) * (1 - f); h += '<line x1="' + padL + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/><text class="ax" x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + fmt(top * f) + '</text>'; });
  series.forEach(function (s, i) {
    var v = s[key], bh = (H - padB) * v / top, x = padL + i * bw + 1, w = Math.max(2, bw - 2), y = H - padB - bh;
    if (v > 0) h += '<path d="M' + x + ',' + (H - padB) + 'V' + (y + Math.min(4, bh)) + 'q0,-' + Math.min(4, bh) + ' ' + Math.min(4, w / 2) + ',-' + Math.min(4, bh) + 'H' + (x + w - Math.min(4, w / 2)) + 'q' + Math.min(4, w / 2) + ',0 ' + Math.min(4, w / 2) + ',' + Math.min(4, bh) + 'V' + (H - padB) + 'Z" fill="var(--accent)"/>';
    h += '<rect x="' + (padL + i * bw) + '" y="0" width="' + bw + '" height="' + (H - padB) + '" fill="transparent"><title>' + s.day + '：' + fmt(v) + '</title></rect>';
    if ((i % 7 === 0 && n - 1 - i >= 4) || i === n - 1) h += '<text class="ax" x="' + (x + w / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + s.day.slice(5) + '</text>';
  });
  return '<div class="chart"><h3>' + title + '</h3><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(title) + '">' + h + '</svg></div>';
}
function kpi(label, val, sub) { return '<div class="kpi"><span>' + label + '</span><b>' + val + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
function pageOverview() {
  shell('<h1>概览</h1><div class="sk" style="height:300px"></div>');
  api('GET', 'admin/overview').then(function (d) {
    openFb = d.totals.openFeedback;
    var t = d.today, m = d.last30, a = d.totals;
    shell('<div class="bar2"><h1>概览</h1><span class="sub2">北京时间 · 实时</span></div>'
      + '<div class="grp">今天</div><div class="kpis">' + kpi('新注册', t.signups) + kpi('活跃用户', t.active) + kpi('新付费订单', t.paid) + kpi('收入', yuan(t.revenueCents)) + '</div>'
      + '<div class="grp">近 30 天</div><div class="kpis">' + kpi('新注册', m.signups) + kpi('活跃用户', m.active) + kpi('付费订单', m.paid) + kpi('收入', yuan(m.revenueCents)) + '</div>'
      + '<div class="grp">累计</div><div class="kpis">' + kpi('用户', a.users) + kpi('付费用户', a.payingUsers, '付费转化 ' + (a.conversion * 100).toFixed(1) + '%') + kpi('有效会员', a.activeMembers) + kpi('累计收入', yuan(a.revenueCents), '待处理反馈 ' + a.openFeedback + ' 条') + '</div>'
      + '<div class="charts">' + barChart('每日新注册', d.series, 'signups', function (v) { return Math.round(v); }) + barChart('每日活跃用户', d.series, 'active', function (v) { return Math.round(v); }) + barChart('每日收入（元）', d.series, 'revenueCents', function (v) { return (v / 100).toFixed(v % 100 ? 1 : 0); }) + '</div>'
      + '<div id="stats"><div class="sk" style="height:260px"></div></div>');
    return api('GET', 'admin/stats').then(function (st) { var el = $('#stats'); if (el) el.innerHTML = statsHtml(st); });
  });
}
// 种子期复盘用：转化漏斗、留存、北极星、功能使用、分享与邀请、自评吻合度
function pct(v) { return v == null ? '<span class="sub2">—</span>' : Math.round(v * 100) + '%'; }
function funnelHtml(title, f) {
  var top = f[0].n || 1;
  return '<div class="chart"><h3>' + title + '</h3><div class="funnel">' + f.map(function (x, i) {
    var prev = i ? f[i - 1].n : null;
    return '<div class="fr"><span>' + x.label + '</span><span class="fbar2"><i style="width:' + Math.max(2, Math.round(x.n / top * 100)) + '%"></i></span><b>' + x.n + '</b><small>' + (i && prev ? Math.round(x.n / prev * 100) + '%' : '') + '</small></div>';
  }).join('') + '</div></div>';
}
function statsHtml(st) {
  var ns = st.northStar;
  return '<div class="grp">北极星</div><div class="kpis">' + kpi('付费会员一周打开天数（中位数）', ns.median == null ? '—' : ns.median + ' 天', '目标 ≥ 4 天 · 付费会员 ' + ns.members + ' 人')
    + kpi('近 7 天生成分享图', st.share.makers + ' 人', '带来打开 ' + st.share.opens + ' 次') + kpi('近 7 天邀请注册', st.share.invitedSignups, '已生效 ' + st.share.invitesDone) + kpi('日历订阅在用', (st.features.filter(function (f) { return f.key === 'ics_fetch'; })[0] || {}).users || 0, '近 7 天同步过') + '</div>'
    + '<div class="grp">转化漏斗</div><div class="charts">' + funnelHtml('近 7 天', st.funnel7) + funnelHtml('近 30 天', st.funnel30) + '</div>'
    + (st.us ? '<div class="grp">美国版（/us/）</div><div class="charts">' + funnelHtml('近 30 天', st.us) + '</div>' : '')
    + '<p class="sub2" style="margin:0">「打开」「测能量卡」按设备计（「打开」从这次更新上线起记录），其余按注册账号计，所以比例可能超过 100%；「第 2 天再来」= 注册后至少用过两个不同的日子。</p>'
    + '<div class="grp">留存（按注册日）</div><div class="tbl"><table><tr><th>注册日</th><th class="num">人数</th><th class="num">第 1 天</th><th class="num">第 3 天</th><th class="num">第 7 天</th><th class="num">第 14 天</th></tr>'
    + (st.cohorts.some(function (c) { return c.size; }) ? '' : '<tr><td colspan="6" class="sub2" style="text-align:center;padding:20px">近 14 天没有新注册</td></tr>')
    + st.cohorts.slice().reverse().filter(function (c) { return c.size; }).map(function (c) { return '<tr><td>' + c.day.slice(5) + '</td><td class="num">' + c.size + '</td><td class="num">' + pct(c.d1) + '</td><td class="num">' + pct(c.d3) + '</td><td class="num">' + pct(c.d7) + '</td><td class="num">' + pct(c.d14) + '</td></tr>'; }).join('') + '</table></div>'
    + '<div class="charts"><div class="chart"><h3>近 7 天功能使用（人）</h3><div class="funnel">' + st.features.map(function (f) {
      var max = Math.max.apply(null, st.features.map(function (x) { return x.users; })) || 1;
      return '<div class="fr"><span>' + f.label + '</span><span class="fbar2"><i style="width:' + Math.max(2, Math.round(f.users / max * 100)) + '%"></i></span><b>' + f.users + '</b><small></small></div>';
    }).join('') + '</div></div>'
    + '<div class="chart"><h3>每晚自评 · 和系统判断一致的比例（按周）</h3><div class="funnel">' + st.ratings.map(function (w) {
      return '<div class="fr"><span>' + w.week.slice(5) + ' 起</span><span class="fbar2"><i style="width:' + (w.match == null ? 0 : Math.round(w.match * 100)) + '%"></i></span><b>' + pct(w.match) + '</b><small>' + w.n + ' 次</small></div>';
    }).join('') + '</div></div></div>';
}

// ---------- 用户 ----------
function pageUsers() {
  var q = qparam('q'), page = +qparam('page') || 1;
  shell('<div class="bar2"><h1>用户</h1><form id="uq"><input name="q" placeholder="搜用户名或称呼" value="' + esc(q) + '"></form></div><div class="sk" style="height:300px"></div>');
  api('GET', 'admin/users?q=' + encodeURIComponent(q) + '&page=' + page).then(function (d) {
    var now = new Date().toISOString();
    var rows = d.list.map(function (u) {
      var mem = u.member_until && u.member_until > now ? '<span class="tag2 ok">会员至 ' + day(u.member_until) + '</span>' : (u.member_until ? '<span class="tag2">已到期 ' + day(u.member_until) + '</span>' : '<span class="tag2">免费 · 用了 ' + u.uses + ' 次</span>');
      return '<tr><td><b>' + esc(u.username) + '</b>' + (u.nickname ? '<div class="sub2">' + esc(u.nickname) + '</div>' : '') + (u.bio ? '<div class="sub2" style="max-width:220px">' + esc(u.bio) + '</div>' : '') + '</td>'
        + '<td class="nw">' + (u.birth_date ? esc(u.birth_date) + ' ' + esc(u.birth_time || '时辰不详') + ' · ' + esc(u.gender) + '<div class="sub2">' + esc(u.birth_city || '未填城市') + '</div>' : '<span class="sub2">未填</span>') + '</td>'
        + '<td>' + mem + (u.status !== 'active' ? ' <span class="tag2 bad">已停用</span>' : '') + (u.locked_until && u.locked_until > now ? ' <span class="tag2 warn">登录锁定中</span>' : '') + '</td>'
        + '<td class="num">' + u.paid_orders + ' 笔<div class="sub2">' + yuan(u.paid_cents) + '</div></td>'
        + '<td class="nw">' + dt(u.created_at) + '<div class="sub2">最近 ' + dt(u.last_seen_at) + '</div></td>'
        + '<td><div class="acts"><button class="btn sm ghost" data-reset="' + u.id + '" data-name="' + esc(u.username) + '">重置密码</button><button class="btn sm ghost" data-days="' + u.id + '" data-name="' + esc(u.username) + '">调整天数</button>'
        + (u.status === 'active' ? '<button class="btn sm ghost" data-status="disabled" data-uid="' + u.id + '" data-name="' + esc(u.username) + '">停用</button>' : '<button class="btn sm ghost" data-status="active" data-uid="' + u.id + '" data-name="' + esc(u.username) + '">启用</button>') + '</div></td></tr>';
    }).join('');
    var pages = Math.max(1, Math.ceil(d.total / 50));
    shell('<div class="bar2"><h1>用户</h1><span class="sub2">共 ' + d.total + ' 人</span><form id="uq"><input name="q" placeholder="搜用户名或称呼" value="' + esc(q) + '"></form></div>'
      + '<div class="tbl"><table><tr><th>用户</th><th>出生信息</th><th>状态</th><th style="text-align:right">付费</th><th>注册 / 最近使用</th><th>操作</th></tr>' + (rows || '<tr><td colspan="6" class="sub2" style="text-align:center;padding:30px">没有找到用户</td></tr>') + '</table></div>'
      + (pages > 1 ? '<div class="pager">第 ' + page + ' / ' + pages + ' 页 ' + (page > 1 ? '<a class="btn sm ghost" href="#/users?q=' + encodeURIComponent(q) + '&page=' + (page - 1) + '">上一页</a>' : '') + (page < pages ? '<a class="btn sm ghost" href="#/users?q=' + encodeURIComponent(q) + '&page=' + (page + 1) + '">下一页</a>' : '') + '</div>' : ''));
  });
}

// ---------- 订单 ----------
var OST = { pending: ['待支付', 'info'], paid: ['已支付', 'ok'], closed: ['已关闭', ''], refunded: ['已退款', 'warn'] };
function pageOrders() {
  var st = qparam('status'), q = qparam('q');
  var bar = '<div class="bar2"><h1>订单</h1><select id="ost"><option value="">全部状态</option>' + Object.keys(OST).map(function (k) { return '<option value="' + k + '"' + (k === st ? ' selected' : '') + '>' + OST[k][0] + '</option>'; }).join('') + '</select><form id="oq"><input name="q" placeholder="订单号 / 用户名 / 支付宝交易号" value="' + esc(q) + '"></form></div>';
  shell(bar + '<div class="sk" style="height:300px"></div>');
  api('GET', 'admin/orders?status=' + st + '&q=' + encodeURIComponent(q)).then(function (d) {
    var rows = d.list.map(function (o) {
      var s = OST[o.status] || [o.status, ''];
      return '<tr><td class="nw"><b>' + esc(o.out_trade_no) + '</b><div class="sub2">' + (o.trade_no ? '支付宝 ' + esc(o.trade_no) : '—') + '</div></td><td>' + esc(o.username) + (o.buyer ? '<div class="sub2">付款人 ' + esc(o.buyer) + '</div>' : '') + '</td>'
        + '<td class="num">' + yuan(o.amount_cents) + '<div class="sub2">' + ({ ask: '问事 ' + o.qty + ' 次', amulet: '特别款御守 ' + o.qty + ' 枚' }[o.product] || o.days + ' 天会员') + '</div></td><td><span class="tag2 ' + s[1] + '">' + s[0] + '</span></td>'
        + '<td class="nw">' + dt(o.created_at) + '<div class="sub2">' + (o.paid_at ? '付款 ' + dt(o.paid_at) : o.refunded_at ? '退款 ' + dt(o.refunded_at) : o.closed_at ? '关闭 ' + dt(o.closed_at) : '') + '</div></td>'
        + '<td><div class="acts">' + (o.status !== 'paid' && o.status !== 'refunded' ? '<button class="btn sm ghost" data-query="' + esc(o.out_trade_no) + '">向支付宝查单</button>' : '') + (o.status === 'paid' ? '<button class="btn sm ghost" data-refund="' + esc(o.out_trade_no) + '">登记退款</button>' : '') + '</div></td></tr>';
    }).join('');
    shell(bar + '<div class="tbl"><table><tr><th>订单号</th><th>用户</th><th style="text-align:right">金额</th><th>状态</th><th>时间</th><th>操作</th></tr>' + (rows || '<tr><td colspan="6" class="sub2" style="text-align:center;padding:30px">没有订单</td></tr>') + '</table></div><p class="sub2" style="margin:0">退款请先在支付宝商家后台操作，再在这里登记，系统会扣回对应的会员天数。</p>');
  });
}

// ---------- 反馈 ----------
var FST = { open: ['待处理', 'bad'], replied: ['已回复', 'ok'], closed: ['已关闭', ''] };
function pageFeedback() {
  var st = qparam('status'), ty = qparam('type');
  var bar = '<div class="bar2"><h1>反馈</h1><select id="fst"><option value="">全部状态</option>' + Object.keys(FST).map(function (k) { return '<option value="' + k + '"' + (k === st ? ' selected' : '') + '>' + FST[k][0] + '</option>'; }).join('') + '</select><select id="fty"><option value="">全部类型</option>' + ['问题', '建议', '付款问题', '其他', '找回密码'].map(function (k) { return '<option' + (k === ty ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div>';
  shell(bar + '<div class="sk" style="height:300px"></div>');
  api('GET', 'admin/feedback?status=' + st + '&type=' + encodeURIComponent(ty)).then(function (d) {
    var meta = function (m) { try { var o = JSON.parse(m); return [o.access ? '状态 ' + o.access : '', o.screen ? '屏幕 ' + o.screen : '', o.found === false ? '用户名不存在' : ''].filter(Boolean).join(' · ') + (o.ua ? '<div class="sub2" style="word-break:break-all">' + esc(o.ua.slice(0, 160)) + '</div>' : ''); } catch (e) { return ''; } };
    var list = d.list.map(function (f) {
      var s = FST[f.status];
      return '<div class="fbc" data-id="' + f.id + '"><div><div class="meta"><span class="tag2 ' + s[1] + '">' + s[0] + '</span><span class="tag2' + (f.type === '找回密码' || f.type === '付款问题' ? ' warn' : '') + '">' + esc(f.type) + '</span><b style="color:var(--fg)">' + esc(f.username || '未登录') + '</b><span>' + dt(f.created_at) + '</span>' + (f.contact ? '<span>联系方式：<b style="color:var(--fg)">' + esc(f.contact) + '</b></span>' : '') + '</div>'
        + '<div class="body">' + esc(f.content) + '</div><div class="sub2">' + meta(f.meta) + '</div></div>'
        + '<div class="side"><textarea data-reply placeholder="' + (f.user_id ? '回复（用户在「意见反馈」里能看到）' : '这条来自未登录用户，回复请走联系方式') + '"' + (f.user_id ? '' : ' disabled') + '>' + esc(f.reply) + '</textarea>'
        + '<textarea data-note placeholder="内部备注（用户看不到）" style="min-height:48px">' + esc(f.note) + '</textarea>'
        + '<div class="acts">' + (f.user_id ? '<button class="btn sm primary" data-fbreply>回复</button>' : '') + '<button class="btn sm ghost" data-fbnote>保存备注</button>'
        + (f.type === '找回密码' ? '<a class="btn sm ghost" href="#/users?q=' + encodeURIComponent(f.username) + '">去重置密码</a>' : '')
        + (f.status !== 'closed' ? '<button class="btn sm ghost" data-fbstatus="closed">关闭</button>' : '<button class="btn sm ghost" data-fbstatus="open">重新打开</button>') + '</div></div></div>';
    }).join('');
    api('GET', 'admin/overview').then(function (o) { openFb = o.totals.openFeedback; var a = document.querySelector('nav a[href="#/feedback"]'); if (a) a.innerHTML = '反馈' + (openFb ? '<span class="cnt">' + openFb + '</span>' : ''); });
    shell(bar + '<div class="fbs">' + (list || '<div class="empty">没有反馈</div>') + '</div>');
  });
}

// ---------- 设置 ----------
function pageSettings() {
  shell('<h1>设置</h1><div class="sk" style="height:300px"></div>');
  api('GET', 'admin/settings').then(function (d) {
    var s = d.settings;
    shell('<div class="bar2"><h1>设置</h1><button class="btn primary" form="sf">保存设置</button></div><form id="sf" class="setg">'
      + '<label class="field"><span>月度会员价格（元）</span><input name="price" type="number" step="0.01" min="0.01" value="' + (s.price_cents / 100).toFixed(2) + '"><span class="hint">只影响之后新下的订单</span></label>'
      + '<label class="field"><span>免费体验次数</span><input name="free_uses" type="number" min="0" max="30" value="' + esc(s.free_uses) + '"><span class="hint">按使用日计，同一天只算 1 次</span></label>'
      + '<label class="field"><span>问事单价（元）</span><input name="ask_price" type="number" step="0.01" min="0.01" value="' + (s.ask_price_cents / 100).toFixed(2) + '"><span class="hint">免费次数用完后，每问一次的价格</span></label>'
      + '<label class="field"><span>会员每月免费问事次数</span><input name="ask_free_monthly" type="number" min="0" max="30" value="' + esc(s.ask_free_monthly) + '"><span class="hint">体验期固定送 1 次</span></label>'
      + '<label class="field"><span>特别款御守单价（元）</span><input name="amulet_price" type="number" step="0.01" min="0.01" value="' + (s.amulet_price_cents / 100).toFixed(2) + '"><span class="hint">节气款、生日款</span></label>'
      + '<label class="field"><span>打分规则</span><select name="engine"><option value="v1"' + (s.engine === 'v1' ? ' selected' : '') + '>v1（现在线上用的）</option><option value="v2"' + (s.engine === 'v2' ? ' selected' : '') + '>v2（加大运流年、冲克分喜忌）</option></select><span class="hint">会改变所有人每天的分数。先在「规则对比」里看过、发起人点头后再切，最好在月初切</span></label>'
      + '<label class="field"><span>邀请奖励天数</span><input name="invite_days" type="number" min="0" max="60" value="' + esc(s.invite_days) + '"><span class="hint">邀请人和被邀请人各得的会员天数</span></label>'
      + '<label class="field"><span>每人每月邀请奖励上限</span><input name="invite_cap" type="number" min="0" max="100" value="' + esc(s.invite_cap) + '"><span class="hint">超过后被邀请人仍有奖励，邀请人没有</span></label>'
      + '<label class="field"><span>支付宝订单名称</span><input name="order_subject" maxlength="60" value="' + esc(s.order_subject) + '"><span class="hint">不要出现八字、算命等字样</span></label>'
      + '<label class="field full"><span>娱乐声明</span><textarea name="disclaimer" style="min-height:80px">' + esc(s.disclaimer) + '</textarea></label>'
      + '<label class="field full"><span>用户协议</span><textarea name="terms">' + esc(s.terms) + '</textarea></label>'
      + '<label class="field full"><span>隐私政策</span><textarea name="privacy">' + esc(s.privacy) + '</textarea></label>'
      + '<div class="err full" id="serr"></div></form>');
    $('#sf').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      if (f.engine.value !== s.engine && !confirm('切换打分规则会改变所有人每天的分数和档位，确定现在切换吗？')) return;
      api('PUT', 'admin/settings', { price_cents: Math.round(parseFloat(f.price.value) * 100), free_uses: +f.free_uses.value, ask_price_cents: Math.round(parseFloat(f.ask_price.value) * 100), ask_free_monthly: +f.ask_free_monthly.value, amulet_price_cents: Math.round(parseFloat(f.amulet_price.value) * 100), engine: f.engine.value, invite_days: +f.invite_days.value, invite_cap: +f.invite_cap.value, order_subject: f.order_subject.value, disclaimer: f.disclaimer.value, terms: f.terms.value, privacy: f.privacy.value })
        .then(function () { $('#serr').textContent = ''; toast('已保存'); }, function (er) { $('#serr').textContent = er.message; });
    };
  });
}

// ---------- 日志 ----------
// ---------- 规则对比 ----------
var LV = ['', '低调', '留神', '平稳', '顺利', '很顺'];
function pageCompare() {
  var now = new Date(), q = function (k, d) { return qparam(k) || d; };
  var form = '<form id="cf" class="cmpf"><label class="field"><span>用户名（填了就用他的出生信息）</span><input name="username" value="' + esc(q('username', '')) + '" placeholder="选填"></label>'
    + '<label class="field"><span>出生日期</span><input name="date" type="date" value="' + esc(q('date', '1990-10-19')) + '"></label>'
    + '<label class="field"><span>出生时间</span><input name="time" type="time" value="' + esc(q('time', '10:00')) + '"></label>'
    + '<label class="field"><span>性别</span><select name="gender"><option' + (q('gender', '女') === '女' ? ' selected' : '') + '>女</option><option' + (q('gender', '') === '男' ? ' selected' : '') + '>男</option></select></label>'
    + '<label class="field"><span>出生城市</span><input name="city" value="' + esc(q('city', '')) + '" placeholder="选填，如：广州"></label>'
    + '<label class="field"><span>月份</span><input name="month" type="month" value="' + esc(q('month', now.getFullYear() + '-' + pad(now.getMonth() + 1))) + '"></label>'
    + '<button class="btn primary">对比</button></form>';
  shell('<div class="bar2"><h1>规则对比</h1><span class="sub2">同一个生日、同一个月，看 v1 和 v2 每天的分数、档位和理由</span></div>' + form + '<div id="cmp"></div>');
  $('#cf').onsubmit = function (e) {
    e.preventDefault(); var f = e.target;
    location.hash = '#/compare?' + new URLSearchParams({ username: f.username.value, date: f.date.value, time: f.time.value, gender: f.gender.value, city: f.city.value, month: f.month.value }).toString();
  };
  if (!qparam('month')) return;
  var ym = qparam('month').split('-');
  $('#cmp').innerHTML = '<div class="sk" style="height:300px"></div>';
  api('GET', 'admin/compare?' + new URLSearchParams({ username: qparam('username'), date: qparam('date'), time: qparam('time'), gender: qparam('gender'), city: qparam('city'), y: ym[0], m: +ym[1] }).toString()).then(function (d) {
    var bar = function (arr) { var n = arr.reduce(function (a, b) { return a + b; }, 0) || 1; return '<span class="lvbar">' + arr.map(function (c, i) { return c ? '<i class="k' + (i + 1) + '" style="flex:' + c + '" title="' + LV[i + 1] + ' ' + c + ' 天">' + c + '</i>' : ''; }).join('') + '</span>'; };
    var pct = function (v) { return v == null ? '—' : Math.round(v * 100) + '%'; };
    var rows = d.days.map(function (x) {
      var diff = x.v2.k - x.v1.k;
      return '<tr' + (Math.abs(diff) >= 2 ? ' class="big"' : '') + '><td class="nw">' + ym[1].replace(/^0/, '') + '月' + x.d + '日<div class="sub2">' + esc(x.gz) + ' · ' + esc(x.ss) + '</div></td>'
        + '<td class="num">' + x.v1.score + '<div class="sub2">' + x.v1.p + '</div></td><td class="num">' + x.v2.score + '<div class="sub2">' + x.v2.p + '</div></td>'
        + '<td class="num">' + (diff ? (diff > 0 ? '↑' : '↓') + Math.abs(diff) + ' 档' : '<span class="sub2">—</span>') + '</td>'
        + '<td><details><summary class="sub2">v1 ' + x.v1.why.length + ' 条 · v2 ' + x.v2.why.length + ' 条</summary><div class="whycmp"><div><b>v1</b>' + x.v1.why.map(esc).join('<br>') + '</div><div><b>v2</b>' + x.v2.why.map(esc).join('<br>') + '</div></div></details></td></tr>';
    }).join('');
    $('#cmp').innerHTML = '<div class="kpis">' + kpi('对比对象', esc(d.who), d.pillars.join(' ') + (d.strong ? ' · 身强' : ' · 身弱'))
      + kpi('档位变了的天数', d.changed + ' / ' + d.days.length, '变了 2 档以上 ' + d.big + ' 天')
      + kpi('自评一致率 v1', pct(d.ratings.v1), '全部用户 ' + d.ratings.n + ' 次自评')
      + kpi('自评一致率 v2', pct(d.ratings.v2), '现在线上用 ' + d.current) + '</div>'
      + '<div class="charts"><div class="chart"><h3>本月档位分布 · v1</h3>' + bar(d.levels.v1) + '</div><div class="chart"><h3>本月档位分布 · v2</h3>' + bar(d.levels.v2) + '</div></div>'
      + '<div class="tbl"><table><tr><th>日期</th><th class="num">v1</th><th class="num">v2</th><th class="num">变化</th><th>理由</th></tr>' + rows + '</table></div>'
      + '<p class="sub2" style="margin:0">v2 的改动：大运、流年作为底色（合计约 ±10 分）；冲按被冲的本命地支是喜是忌决定加减；合、刑、害减半；贵人、文昌降到 +3 / +2；五档按分位数划分（约 10% / 20% / 35% / 25% / 10%）。自评一致率：用户打分（1–2 低、3 中、4–5 高）和系统档位（低调留神 / 平稳 / 顺利很顺）落在同一段的比例。</p>';
  }, function (er) { $('#cmp').innerHTML = '<p class="err">' + esc(er.message) + '</p>'; });
}

function pageLogs() {
  shell('<h1>操作日志</h1><div class="sk" style="height:300px"></div>');
  api('GET', 'admin/logs').then(function (d) {
    shell('<h1>操作日志</h1><div class="tbl"><table><tr><th>时间</th><th>操作</th><th>对象</th><th>内容</th><th>原因</th></tr>' + (d.list.map(function (l) { return '<tr><td class="nw">' + dt(l.created_at) + '</td><td class="nw"><b>' + esc(l.action) + '</b></td><td>' + esc(l.target) + '</td><td>' + esc(l.detail) + '</td><td>' + esc(l.reason) + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="sub2" style="text-align:center;padding:30px">还没有操作记录</td></tr>') + '</table></div>');
  });
}

function route() {
  api('GET', 'admin/me').then(function () {
    ({ overview: pageOverview, users: pageUsers, orders: pageOrders, feedback: pageFeedback, compare: pageCompare, settings: pageSettings, logs: pageLogs })[tab()]();
  }, function () {});
}
window.addEventListener('hashchange', route);

document.addEventListener('submit', function (e) {
  if (e.target.id === 'uq') { e.preventDefault(); location.hash = '#/users?q=' + encodeURIComponent(e.target.q.value.trim()); }
  if (e.target.id === 'oq') { e.preventDefault(); location.hash = '#/orders?status=' + ($('#ost').value) + '&q=' + encodeURIComponent(e.target.q.value.trim()); }
});
document.addEventListener('change', function (e) {
  if (e.target.id === 'ost') location.hash = '#/orders?status=' + e.target.value;
  if (e.target.id === 'fst' || e.target.id === 'fty') location.hash = '#/feedback?status=' + $('#fst').value + '&type=' + encodeURIComponent($('#fty').value);
});
document.addEventListener('click', function (e) {
  var el;
  if ((el = e.target.closest('#adLogout'))) { e.preventDefault(); api('POST', 'admin/logout', {}).then(renderLogin); return; }
  if ((el = e.target.closest('[data-reset]'))) {
    dialog('重置「' + el.dataset.name + '」的密码', '会生成一个随机新密码，并让这个用户所有设备退出登录。', [], '重置').then(function (ok) {
      if (!ok) return;
      api('POST', 'admin/users/' + el.dataset.reset + '/reset-password', {}).then(function (d) {
        var bg = document.createElement('div'); bg.className = 'dlg-bg';
        bg.innerHTML = '<div class="dlg"><h2>新密码</h2><p>只显示这一次，请通过用户留下的联系方式告诉 TA，并提醒登录后在「我的资料」里改密码。</p><div class="pwbox">' + esc(d.password) + '</div><div class="row"><button class="btn ghost" data-copy>复制</button><button class="btn primary" data-x>完成</button></div></div>';
        $('#layer').appendChild(bg);
        $('[data-copy]', bg).onclick = function () { navigator.clipboard && navigator.clipboard.writeText(d.password).then(function () { toast('已复制'); }); };
        $('[data-x]', bg).onclick = function () { bg.remove(); };
      }, function (er) { toast(er.message); });
    });
    return;
  }
  if ((el = e.target.closest('[data-days]'))) {
    dialog('调整「' + el.dataset.name + '」的会员天数', '正数增加、负数扣减；未开通或已到期的从现在算起。', [{ name: 'days', label: '天数', type: 'number', placeholder: '如 7 或 -30' }, { name: 'reason', label: '原因（必填，记入操作日志）', placeholder: '如：付款成功但未到账，补开通' }], '确定').then(function (v) {
      if (!v) return;
      api('POST', 'admin/users/' + el.dataset.days + '/adjust-days', { days: +v.days, reason: v.reason }).then(function (d) { toast('已调整，会员至 ' + day(d.memberUntil)); route(); }, function (er) { toast(er.message); });
    });
    return;
  }
  if ((el = e.target.closest('[data-status]'))) {
    var dis = el.dataset.status === 'disabled';
    dialog((dis ? '停用' : '启用') + '「' + el.dataset.name + '」', dis ? '停用后该用户会立即退出，且无法登录。' : '', [{ name: 'reason', label: '原因', placeholder: '选填' }], dis ? '停用' : '启用').then(function (v) {
      if (!v) return;
      api('POST', 'admin/users/' + el.dataset.uid + '/status', { status: el.dataset.status, reason: v.reason }).then(function () { toast('已' + (dis ? '停用' : '启用')); route(); }, function (er) { toast(er.message); });
    });
    return;
  }
  if ((el = e.target.closest('[data-query]'))) {
    el.disabled = true;
    api('POST', 'admin/orders/' + el.dataset.query + '/query', {}).then(function (d) {
      toast(d.granted ? '支付宝显示已付款，已补开通会员' : (d.alipay.exists ? '支付宝状态：' + d.alipay.status : '支付宝没有这笔交易（用户没扫码）'));
      route();
    }, function (er) { el.disabled = false; toast(er.message); });
    return;
  }
  if ((el = e.target.closest('[data-refund]'))) {
    dialog('登记退款', '请确认已在支付宝商家后台完成退款。登记后会扣回这笔订单的会员天数。', [{ name: 'reason', label: '退款原因（必填）' }], '登记退款').then(function (v) {
      if (!v) return;
      api('POST', 'admin/orders/' + el.dataset.refund + '/refund', { reason: v.reason }).then(function () { toast('已登记'); route(); }, function (er) { toast(er.message); });
    });
    return;
  }
  var card = e.target.closest('.fbc');
  if (card) {
    var id = card.dataset.id;
    if (e.target.closest('[data-fbreply]')) { api('POST', 'admin/feedback/' + id, { reply: $('[data-reply]', card).value }).then(function () { toast('已回复'); route(); }, function (er) { toast(er.message); }); return; }
    if (e.target.closest('[data-fbnote]')) { api('POST', 'admin/feedback/' + id, { note: $('[data-note]', card).value }).then(function () { toast('备注已保存'); }, function (er) { toast(er.message); }); return; }
    if ((el = e.target.closest('[data-fbstatus]'))) { api('POST', 'admin/feedback/' + id, { status: el.dataset.fbstatus }).then(function () { route(); }, function (er) { toast(er.message); }); return; }
  }
});
route();
})();
