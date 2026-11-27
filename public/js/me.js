// 我的页：能量卡缩略、各入口；能量档案子页（五行比例、幸运元素、专业模式、完整八字盘）。
import { $, esc, api, toast, onClick, mdText, IS_STANDALONE, IS_MOBILE, track, currentPath, getTheme, setTheme, EN, MON } from './core.js';
import { WX, WXEN, WXC, HIDE, SHORT, gwx, cg, shishen, dishi } from './data.js';
import { S, isPro } from './state.js';
import { footHtml, loadToday } from './today.js';
import { cardArt, cardTitle, gzText } from './onboard.js';
import { tm } from './i18n.js';
const t = tm('me'); // 先查 i18n/en/me.json

let card = null;
function loadCard() { return api('GET', 'me/card').then((d) => { card = d.card; }, () => { card = null; }); }

function statusText() {
  const a = S.access || {};
  if (a.beta) return t('体验版 · 会员免费');
  if (a.mode === 'member') return t('会员 · 至 {date}', { date: mdText(a.memberUntil) });
  if (a.mode === 'free') return t('免费体验 · 剩 {n} 次', { n: a.remaining });
  return a.expired ? t('会员已到期') : t('开通会员');
}

export function pageMe() {
  const v = $('#view');
  const row = (go, label, right = '', extra = '') => `<button type="button" class="mrow" ${go}><span>${label}</span><span class="r">${right}${extra}<i>›</i></span></button>`;
  const render = () => {
    const nm = S.me.nickname || S.me.username;
    const c = card;
    v.innerHTML = '<div class="mgrid"><div class="mcol">' + (c
      ? `<button type="button" class="mecard" data-go="/card">${cardArt(c)}<span class="t"><small>${t('{name} 的能量卡', { name: esc(nm) })}</small><b>${esc(cardTitle(c))}</b><span>${c.traits.map((x) => t(x)).join(' · ')}</span></span><span class="go">›</span></button>`
      : '<div class="sk" style="height:112px"></div>')
      + '<section class="mlist">'
      + row('data-go="/energy"', t('能量档案'), t('五行 · 幸运元素'))
      + row('data-go="/recap"', t('月度回顾'), t('这个月打开了几天、收了几张画'))
      + row('data-go="/jiazi"', t('我的一甲子'), S.today && S.today.jiazi ? t('已收 {n} / 60', { n: S.today.jiazi.n }) : t('每天收一张画'))
      + row('data-go="/member"', t('会员与订单'), statusText())
      + `<button type="button" class="mrow" id="proToggle" aria-pressed="${isPro()}"><span>${t('专业模式')}</span><span class="r"><span class="switch${isPro() ? ' on' : ''}"></span></span></button>`
      + `<div class="mrow" role="group" aria-label="${t('语言')}"><span>${t('语言')}</span><span class="seg3">${[['zh', '中文'], ['en', 'English']].map(([k, l]) => `<span role="button" tabindex="0" data-lang-set="${k}" aria-pressed="${(EN ? 'en' : 'zh') === k}">${l}</span>`).join('')}</span></div>`
      + `<div class="mrow" role="group" aria-label="${t('外观')}"><span>${t('外观')}</span><span class="seg3">${[['light', t('白色')], ['dark', t('深色')], ['auto', t('跟随系统')]].map(([k, l]) => `<span role="button" tabindex="0" data-theme-set="${k}" aria-pressed="${getTheme() === k}">${l}</span>`).join('')}</span></div>`
      + '</section></div><div class="mcol"><section class="mlist">'
      + row('data-go="/asks"', t('问事记录'), t('梅花易数 · 会员不限次'))
      + row('data-go="/amulets"', t('我的御守'), '')
      + row('data-go="/lots"', t('我的签谱'), t('抽过的签都在这里'))
      + row('data-go="/invite"', t('邀请好友'), S.access?.beta ? t('看你们俩的画') : t('朋友的画 · 各得 {n} 天', { n: S.inviteDays || 7 }))
      + row('data-go="/ics"', t('订阅到手机日历'), t('每天出现在日历里'))
      + (IS_STANDALONE() ? '' : IS_MOBILE ? row('data-install', t('加到主屏'), t('像 App 一样打开')) : row('data-install', t('安装到电脑'), t('从桌面一点就开')))
      + '</section><section class="mlist">'
      + row('data-go="/profile"', t('我的资料'), esc(S.me.username))
      + row('data-go="/feedback"', t('意见反馈'), '', S.unread ? `<span class="rdot" aria-label="${t('有新回复')}"></span>` : '')
      + row('data-go="/about"', t('关于与声明'))
      + `</section><button type="button" class="btn ghost block" id="logoutBtn">${t('退出登录')}</button></div></div>` + footHtml();
  };
  render();
  if (!card) loadCard().then(() => { if (currentPath() === '/me') render(); });
}

export function pageEnergy() {
  const v = $('#view');
  const head = `<div class="phead"><button type="button" class="back" data-back aria-label="${t('返回')}">‹</button><h1>${t('能量档案')}</h1></div>`;
  const render = () => {
    if (S.todayLocked) { v.innerHTML = head + `<section class="card"><p style="margin:0">${t('开通会员后可以查看完整的能量档案和八字盘。')}</p><button type="button" class="btn primary block" data-pay>${t('开通会员')}</button></section>`; return; }
    if (!S.today) { v.innerHTML = head + '<div class="sk" style="height:300px"></div>'; return; }
    const C = S.today.chart, x = S.today.day, pro = isPro();
    const tot = C.force.reduce((a, b) => a + b, 0);
    // 日柱图鉴：出生那天的天干地支，最能代表你自己
    const card = S.today.card, pl = card && card.pillar;
    let h = head + (pl ? `<section class="card pillarc">${cardArt(card)}<div class="pt"><small>${t('你的日柱')}${pro ? ` · ${esc(pl.tag)}` : ''}</small><b>${esc(cardTitle(card))}</b><p>${esc(pl.intro)}</p><p class="sl">${esc(pl.line)}</p></div></section>` : '')
      + `<section class="card"><h3>${t('五种能量在你身上的比例')}</h3><div class="force">`;
    C.force.forEach((val, i) => {
      const st = C.xi.includes(i) ? 'xi' : C.ji.includes(i) ? 'ji' : '';
      const lab = st === 'xi' ? (pro ? t('喜用') : t('幸运')) : st === 'ji' ? (pro ? t('忌') : t('消耗')) : t('中性');
      h += `<div class="r"><span class="${WXC[i]}" style="font-weight:700">${EN ? WXEN[i] : WX[i]}${pro || EN ? '' : `<br><span style="font-size:10px;font-weight:400" class="muted">${WXEN[i]}</span>`}</span><span class="bar"><i style="width:${Math.round(val / tot * 100)}%;background:var(--${['wood', 'fire', 'earth', 'metal', 'water'][i]})"></i></span><span class="muted" style="font-variant-numeric:tabular-nums">${Math.round(val / tot * 100)}%</span><button type="button" class="xiset ${st}" data-w="${i}">${lab}</button></div>`;
    });
    const dmName = EN ? `${gzText(C.dm)} ${WXEN[gwx(C.dm)]}` : C.dm + WX[gwx(C.dm)];
    h += `</div><p class="note" style="margin:0">${pro ? t('日主{dm}，同类加生扶占 {pct}%，判为{strength}。点右侧按钮可在「喜用 → 忌 → 中性」之间切换', { dm: dmName, pct: Math.round(C.selfPct * 100), strength: C.strong ? t('偏强') : t('偏弱') }) : t('如果你从命理师那里知道了自己的幸运元素，可以点右侧按钮在「幸运 → 消耗 → 中性」之间切换')}${t('，日历会按你的设置重算。')}${C.xiCustom ? ` <button type="button" class="btn sm ghost" id="resetXi">${t('恢复自动')}</button>` : ''}</p></section>`;
    if (pro) {
      let dy = null; C.dayuns.forEach((d) => { if (x.y >= d.startYear && x.y <= d.endYear) dy = d; });
      const cols = [[t('年柱'), C.pillars[0]], [t('月柱'), C.pillars[1]], [t('日柱'), C.pillars[2]], [t('时柱'), C.pillars[3] || '—'], [t('大运'), dy ? dy.gz : '—'], [t('流年'), x.ygz], [t('流月'), x.mgz], [t('流日'), x.gz]];
      const row = (name, fn) => `<tr><td class="rl">${name}</td>${cols.map((c, i) => `<td${i === 4 ? ' class="sep"' : ''}>${c[1] === '—' ? '—' : fn(c[1], i)}</td>`).join('')}</tr>`;
      let tb = `<table><tr><th></th>${cols.map((c, i) => `<th${i === 4 ? ' class="sep"' : ''}>${c[0]}</th>`).join('')}</tr>`;
      // 专业模式的盘：干支保留汉字（术语表允许），十神英文下用白话名
      tb += row(t('主星'), (p, i) => (i === 2 ? `<span class="muted">${t('日主')}</span>` : t(shishen(C.dm, p[0]))));
      tb += row(t('天干'), (p) => `<span class="big ${cg(p[0])}">${p[0]}</span>`);
      tb += row(t('地支'), (p) => `<span class="big ${cg(p[1])}">${p[1]}</span>`);
      tb += row(t('藏干'), (p) => `<div class="hide">${HIDE[p[1]].split('').map((g) => `<span class="${cg(g)}">${g}${EN ? '' : SHORT[shishen(C.dm, g)]}</span>`).join('<br>')}</div>`);
      tb += row(t('地势'), (p) => dishi(C.dm, p[1]));
      tb += row(t('自坐'), (p) => dishi(p[0], p[1]));
      const today = EN ? `${MON[x.m - 1]} ${x.d}` : `${x.m}月${x.d}日`;
      h += `<section class="card"><h3>${t('完整八字盘（专业）')}</h3><div class="pan">${tb}</table></div><p class="note" style="margin:0">${t('流日为今天（{date}）。', { date: today })}${dy ? t('当前大运 {gz}（{from}–{to}）。', { gz: EN ? gzText(dy.gz) : dy.gz, from: dy.startYear, to: dy.endYear }) : ''}${t('{n} 岁起运。', { n: C.startAge })}${C.noTime ? t('出生时间不详，只排年、月、日三柱。') : ''}</p></section>`;
    } else {
      h += `<p class="note" style="text-align:center;margin:0">${t('想看完整八字盘？在「我的」里打开「专业模式」。')}</p>`;
    }
    v.innerHTML = h + footHtml();
  };
  render();
  if (!S.today && !S.todayLocked) loadToday().then(() => { if (currentPath() === '/energy') render(); });
  pageEnergy.render = render;
}

onClick('#proToggle', () => {
  const on = !isPro();
  api('PUT', 'me/settings', { proMode: on }).then((d) => { S.me = d.user; S.cal = null; pageMe(); toast(on ? t('已打开专业模式') : t('已关闭专业模式')); track('pro_toggle', { on }); }, (e) => toast(e.message));
});
onClick('.xiset', (el) => {
  const C = S.today.chart, i = +el.getAttribute('data-w'), xi = C.xi.slice(), ji = C.ji.slice();
  if (xi.includes(i)) { xi.splice(xi.indexOf(i), 1); ji.push(i); } else if (ji.includes(i)) ji.splice(ji.indexOf(i), 1); else xi.push(i);
  api('PUT', 'me/settings', { xiOverride: { xi, ji } }).then((d) => { S.me = d.user; S.cal = null; card = null; return loadToday(); }).then(() => pageEnergy.render(), (e) => toast(e.message));
});
onClick('#resetXi', () => { api('PUT', 'me/settings', { xiOverride: null }).then((d) => { S.me = d.user; S.cal = null; card = null; return loadToday(); }).then(() => pageEnergy.render()); });
export function resetCard() { card = null; }
onClick('[data-theme-set]', (el) => { setTheme(el.getAttribute('data-theme-set')); pageMe(); document.querySelector('[data-theme-toggle]') && window.dispatchEvent(new Event('lrl-theme')); });
