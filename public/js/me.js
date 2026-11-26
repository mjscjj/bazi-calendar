// 我的页：能量卡缩略、各入口；能量档案子页（五行比例、幸运元素、专业模式、完整八字盘）。
import { $, esc, api, toast, onClick, mdText, IS_STANDALONE, IS_MOBILE, track, currentPath, getTheme, setTheme } from './core.js';
import { WX, WXEN, WXC, HIDE, SHORT, gwx, cg, shishen, dishi } from './data.js';
import { S, isPro } from './state.js';
import { footHtml, loadToday } from './today.js';
import { cardArt, cardTitle } from './onboard.js';

let card = null;
function loadCard() { return api('GET', 'me/card').then((d) => { card = d.card; }, () => { card = null; }); }

function statusText() {
  const a = S.access || {};
  if (a.beta) return '体验版 · 会员免费';
  if (a.mode === 'member') return `会员 · 至 ${mdText(a.memberUntil)}`;
  if (a.mode === 'free') return `免费体验 · 剩 ${a.remaining} 次`;
  return a.expired ? '会员已到期' : '开通会员';
}

export function pageMe() {
  const v = $('#view');
  const row = (go, label, right = '', extra = '') => `<button type="button" class="mrow" ${go}><span>${label}</span><span class="r">${right}${extra}<i>›</i></span></button>`;
  const render = () => {
    const nm = S.me.nickname || S.me.username;
    const c = card;
    v.innerHTML = '<div class="mgrid"><div class="mcol">' + (c
      ? `<button type="button" class="mecard" data-go="/card">${cardArt(c)}<span class="t"><small>${esc(nm)} 的能量卡</small><b>${esc(cardTitle(c))}</b><span>${c.traits.join(' · ')}</span></span><span class="go">›</span></button>`
      : '<div class="sk" style="height:112px"></div>')
      + '<section class="mlist">'
      + row('data-go="/energy"', '能量档案', '五行 · 幸运元素')
      + row('data-go="/recap"', '月度回顾', '这个月打开了几天、收了几张画')
      + row('data-go="/jiazi"', '我的一甲子', S.today && S.today.jiazi ? `已收 ${S.today.jiazi.n} / 60` : '每天收一张画')
      + row('data-go="/member"', '会员与订单', statusText())
      + `<button type="button" class="mrow" id="proToggle" aria-pressed="${isPro()}"><span>专业模式</span><span class="r"><span class="switch${isPro() ? ' on' : ''}"></span></span></button>`
      + `<div class="mrow" role="group" aria-label="外观"><span>外观</span><span class="seg3">${[['light', '白色'], ['dark', '深色'], ['auto', '跟随系统']].map(([k, l]) => `<span role="button" tabindex="0" data-theme-set="${k}" aria-pressed="${getTheme() === k}">${l}</span>`).join('')}</span></div>`
      + '</section></div><div class="mcol"><section class="mlist">'
      + row('data-go="/asks"', '问事记录', '梅花易数 · 会员不限次')
      + row('data-go="/amulets"', '我的御守', '')
      + row('data-go="/lots"', '我的签谱', '抽过的签都在这里')
      + row('data-go="/invite"', '邀请好友', S.access?.beta ? '看你们俩的画' : `朋友的画 · 各得 ${S.inviteDays || 7} 天`)
      + row('data-go="/ics"', '订阅到手机日历', '每天出现在日历里')
      + (IS_STANDALONE() ? '' : IS_MOBILE ? row('data-install', '加到主屏', '像 App 一样打开') : row('data-install', '安装到电脑', '从桌面一点就开'))
      + '</section><section class="mlist">'
      + row('data-go="/profile"', '我的资料', esc(S.me.username))
      + row('data-go="/feedback"', '意见反馈', '', S.unread ? '<span class="rdot" aria-label="有新回复"></span>' : '')
      + row('data-go="/about"', '关于与声明')
      + '</section><button type="button" class="btn ghost block" id="logoutBtn">退出登录</button></div></div>' + footHtml();
  };
  render();
  if (!card) loadCard().then(() => { if (currentPath() === '/me') render(); });
}

export function pageEnergy() {
  const v = $('#view');
  const head = '<div class="phead"><button type="button" class="back" data-back aria-label="返回">‹</button><h1>能量档案</h1></div>';
  const render = () => {
    if (S.todayLocked) { v.innerHTML = head + '<section class="card"><p style="margin:0">开通会员后可以查看完整的能量档案和八字盘。</p><button type="button" class="btn primary block" data-pay>开通会员</button></section>'; return; }
    if (!S.today) { v.innerHTML = head + '<div class="sk" style="height:300px"></div>'; return; }
    const C = S.today.chart, x = S.today.day, pro = isPro();
    const tot = C.force.reduce((a, b) => a + b, 0);
    // 日柱图鉴：出生那天的天干地支，最能代表你自己
    const card = S.today.card, pl = card && card.pillar;
    let h = head + (pl ? `<section class="card pillarc">${cardArt(card)}<div class="pt"><small>你的日柱${pro ? ` · ${esc(pl.tag)}` : ''}</small><b>${esc(cardTitle(card))}</b><p>${esc(pl.intro)}</p><p class="sl">${esc(pl.line)}</p></div></section>` : '')
      + `<section class="card"><h3>五种能量在你身上的比例</h3><div class="force">`;
    C.force.forEach((val, i) => {
      const st = C.xi.includes(i) ? 'xi' : C.ji.includes(i) ? 'ji' : '';
      h += `<div class="r"><span class="${WXC[i]}" style="font-weight:700">${WX[i]}${pro ? '' : `<br><span style="font-size:10px;font-weight:400" class="muted">${WXEN[i]}</span>`}</span><span class="bar"><i style="width:${Math.round(val / tot * 100)}%;background:var(--${['wood', 'fire', 'earth', 'metal', 'water'][i]})"></i></span><span class="muted" style="font-variant-numeric:tabular-nums">${Math.round(val / tot * 100)}%</span><button type="button" class="xiset ${st}" data-w="${i}">${st === 'xi' ? (pro ? '喜用' : '幸运') : st === 'ji' ? (pro ? '忌' : '消耗') : '中性'}</button></div>`;
    });
    h += `</div><p class="note" style="margin:0">${pro ? `日主${C.dm}${WX[gwx(C.dm)]}，同类加生扶占 ${Math.round(C.selfPct * 100)}%，判为${C.strong ? '偏强' : '偏弱'}。点右侧按钮可在「喜用 → 忌 → 中性」之间切换` : '如果你从命理师那里知道了自己的幸运元素，可以点右侧按钮在「幸运 → 消耗 → 中性」之间切换'}，日历会按你的设置重算。${C.xiCustom ? ' <button type="button" class="btn sm ghost" id="resetXi">恢复自动</button>' : ''}</p></section>`;
    if (pro) {
      let dy = null; C.dayuns.forEach((d) => { if (x.y >= d.startYear && x.y <= d.endYear) dy = d; });
      const cols = [['年柱', C.pillars[0]], ['月柱', C.pillars[1]], ['日柱', C.pillars[2]], ['时柱', C.pillars[3] || '—'], ['大运', dy ? dy.gz : '—'], ['流年', x.ygz], ['流月', x.mgz], ['流日', x.gz]];
      const row = (name, fn) => `<tr><td class="rl">${name}</td>${cols.map((c, i) => `<td${i === 4 ? ' class="sep"' : ''}>${c[1] === '—' ? '—' : fn(c[1], i)}</td>`).join('')}</tr>`;
      let t = `<table><tr><th></th>${cols.map((c, i) => `<th${i === 4 ? ' class="sep"' : ''}>${c[0]}</th>`).join('')}</tr>`;
      t += row('主星', (p, i) => (i === 2 ? '<span class="muted">日主</span>' : shishen(C.dm, p[0])));
      t += row('天干', (p) => `<span class="big ${cg(p[0])}">${p[0]}</span>`);
      t += row('地支', (p) => `<span class="big ${cg(p[1])}">${p[1]}</span>`);
      t += row('藏干', (p) => `<div class="hide">${HIDE[p[1]].split('').map((g) => `<span class="${cg(g)}">${g}${SHORT[shishen(C.dm, g)]}</span>`).join('<br>')}</div>`);
      t += row('地势', (p) => dishi(C.dm, p[1]));
      t += row('自坐', (p) => dishi(p[0], p[1]));
      h += `<section class="card"><h3>完整八字盘（专业）</h3><div class="pan">${t}</table></div><p class="note" style="margin:0">流日为今天（${x.m}月${x.d}日）。${dy ? `当前大运 ${dy.gz}（${dy.startYear}–${dy.endYear}）。` : ''}${C.startAge} 岁起运。${C.noTime ? '出生时间不详，只排年、月、日三柱。' : ''}</p></section>`;
    } else {
      h += '<p class="note" style="text-align:center;margin:0">想看完整八字盘？在「我的」里打开「专业模式」。</p>';
    }
    v.innerHTML = h + footHtml();
  };
  render();
  if (!S.today && !S.todayLocked) loadToday().then(() => { if (currentPath() === '/energy') render(); });
  pageEnergy.render = render;
}

onClick('#proToggle', () => {
  const on = !isPro();
  api('PUT', 'me/settings', { proMode: on }).then((d) => { S.me = d.user; S.cal = null; pageMe(); toast(on ? '已打开专业模式' : '已关闭专业模式'); track('pro_toggle', { on }); }, (e) => toast(e.message));
});
onClick('.xiset', (el) => {
  const C = S.today.chart, i = +el.getAttribute('data-w'), xi = C.xi.slice(), ji = C.ji.slice();
  if (xi.includes(i)) { xi.splice(xi.indexOf(i), 1); ji.push(i); } else if (ji.includes(i)) ji.splice(ji.indexOf(i), 1); else xi.push(i);
  api('PUT', 'me/settings', { xiOverride: { xi, ji } }).then((d) => { S.me = d.user; S.cal = null; card = null; return loadToday(); }).then(() => pageEnergy.render(), (e) => toast(e.message));
});
onClick('#resetXi', () => { api('PUT', 'me/settings', { xiOverride: null }).then((d) => { S.me = d.user; S.cal = null; card = null; return loadToday(); }).then(() => pageEnergy.render()); });
export function resetCard() { card = null; }
onClick('[data-theme-set]', (el) => { setTheme(el.getAttribute('data-theme-set')); pageMe(); document.querySelector('[data-theme-toggle]') && window.dispatchEvent(new Event('lrl-theme')); });
