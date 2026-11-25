// 支付弹层：电脑显示二维码，手机浏览器跳支付宝，微信里引导去浏览器。付完自动开通并回到原处。
// 商品：月度会员（默认）、问事 1 次、特别款御守。会员另有海外付款：去 Gumroad 用外币卡或 PayPal 付（按月/按年自动续费）。
import { $, esc, api, toast, openSheet, dismissSheet, onClick, ymdText, price, pad, IS_WECHAT, IS_MOBILE, track } from './core.js';
import { S } from './state.js';

let timers = [], order = null, intl = null, checking = false, onPaid = null, paidPending = false, opts = {};
const TITLE = { member: '开通月度会员', ask: '问事 1 次', amulet: '特别款御守' };
const LINE = { member: (o) => `月度会员 · ${o.days} 天 · 不自动续费`, ask: () => '问事 1 次 · 买了不过期', amulet: () => '特别款御守 1 枚 · 买了不过期' };
function stop() { timers.forEach((t) => clearInterval(t)); timers = []; document.removeEventListener('visibilitychange', onVisible); }
function onVisible() { if (document.visibilityState === 'visible' && order) check(true); }

export function openPay(after, options) {
  if (!S.me) { location.hash = '#/start'; return; }
  onPaid = after || null;
  opts = options || {};
  const product = opts.product || 'member';
  track('pay_open', { product });
  const body = openSheet(TITLE[product], '<div class="pay"><div class="sk" style="width:208px;height:208px"></div><p class="tip">正在生成订单…</p></div>', { onClose: () => { stop(); order = null; if (paidPending) { paidPending = false; if (onPaid) onPaid(); } } });
  api('POST', 'pay/orders', { product }).then((d) => {
    order = d.order;
    intl = d.intl || null;
    render(body);
    watch(body);
  }, (e) => { body.innerHTML = `<div class="pay"><p class="tip">${esc(e.message)}</p><button type="button" class="btn ghost" data-pay-retry>重试</button></div>`; });
}

function watch(body) {
  if (timers.length) return;
  timers.push(setInterval(() => { if (document.visibilityState === 'visible' && order) check(false); }, 2000));
  timers.push(setInterval(() => tick(body), 1000));
  document.addEventListener('visibilitychange', onVisible);
}

// 海外付款入口：两个按钮，点了新开 Gumroad 结账页
function intlHtml() {
  if (!intl) return '';
  return `<div class="intl"><p class="tip">在海外？用外币卡或 PayPal 付（美元，自动续费，随时可取消）</p><div class="row"><button type="button" class="btn ghost" data-intl="monthly">$${price(intl.monthly)} / 月</button><button type="button" class="btn ghost" data-intl="yearly">$${price(intl.yearly)} / 年</button></div></div>`;
}

function render(body) {
  const o = order;
  if (!o) { body.innerHTML = `<div class="pay">${intlHtml()}</div>`; return; }
  let h = `<div class="pay"><div class="amt"><small>¥</small>${price(o.amountCents)}</div><p class="tip">${LINE[o.product || 'member'](o)}</p>`;
  if (IS_WECHAT) {
    h += `<ol class="steps"><li>微信里无法直接打开支付宝。</li><li>点右上角「···」，选择「在浏览器打开」。</li><li>在浏览器里重新点「${TITLE[o.product || 'member']}」完成付款。</li></ol><button type="button" class="btn ghost block" id="copyLink">复制页面链接</button>`;
  } else if (IS_MOBILE) {
    const scheme = 'alipays://platformapi/startapp?saId=10000007&qrcode=' + encodeURIComponent(o.qr);
    h += `<a class="btn alipay block" href="${esc(scheme)}" id="openAlipay">打开支付宝付款</a><button type="button" class="btn ghost block" data-paycheck>我已付款</button>`
      + `<p class="tip">付完回到这里，会自动开通。没有跳转？<a href="${esc(o.qr)}">点这里</a></p>`
      + `<details style="width:100%"><summary class="tip" style="text-align:center">用另一部手机扫码</summary><div class="qr" style="margin:10px auto 0">${o.qrSvg}</div></details>`;
  } else {
    h += `<div class="qr" aria-label="支付宝付款二维码">${o.qrSvg}</div><p class="tip">打开手机支付宝，扫一扫付款</p>`;
  }
  body.innerHTML = h + '<div class="cd" id="payCd"></div>' + intlHtml() + '</div>';
  tick(body);
}
function renderIntl(body, url) {
  const yearly = order.days > 31;
  const t = $('#sheet .sh b'); if (t) t.textContent = yearly ? '开通年度会员' : '开通月度会员';
  body.innerHTML = `<div class="pay"><div class="amt"><small>$</small>${price(order.amountCents)}</div><p class="tip">${yearly ? '年度' : '月度'}会员 · 自动续费 · 随时可取消</p>`
    + `<p class="tip">已在新页面打开 Gumroad 结账，付完回到这里会自动开通。</p><a class="btn primary block" href="${esc(url)}" target="_blank" rel="noopener">没打开？点这里去付款</a>`
    + '<button type="button" class="btn ghost block" data-paycheck>我已付款</button><p class="tip">取消续费：用 Gumroad 收据邮件里的「Manage membership」。</p></div>';
}
function tick(body) {
  if (!order || order.provider === 'gumroad') return;
  const left = Math.max(0, Math.floor((new Date(order.expiresAt) - Date.now()) / 1000));
  const el = $('#payCd', body);
  if (el) el.textContent = left > 0 ? `二维码 ${Math.floor(left / 60)}:${pad(left % 60)} 后失效` : '';
  if (left <= 0 && order.status === 'pending') check(true);
}
function check(force, manual) {
  if (!order || checking) return;
  checking = true;
  api('GET', 'pay/orders/' + order.outTradeNo + (force ? '?force=1' : '')).then((d) => {
    checking = false;
    if (!order) return;
    const body = $('#sheet .sbody');
    if (d.order.status === 'paid') {
      stop(); order = null;
      const product = d.order.product || 'member';
      S.access = d.access; S.credits = d.credits;
      if (product === 'member') { S.today = null; S.todayLocked = null; S.cal = null; S.calLocked = null; }
      track('pay_success', { product });
      const done = product === 'member'
        ? `<div class="amt" style="font-size:22px">开通成功</div><p class="tip">会员有效期至 ${ymdText(d.access.memberUntil)}</p><button type="button" class="btn primary block" data-close-sheet>开始使用</button>`
        : `<div class="amt" style="font-size:22px">已到账</div><p class="tip">${product === 'ask' ? '马上接着为你起卦' : '马上为你织这枚特别款御守'}</p><button type="button" class="btn primary block" data-close-sheet>好的</button>`;
      if (body) body.innerHTML = `<div class="pay"><div class="ok">✓</div>${done}</div>`;
      setTimeout(() => { if ($('#sheet .pay .ok')) dismissSheet(); }, 3000);
      paidPending = true;
    } else if (d.order.status === 'closed') {
      stop(); order = null;
      if (body) body.innerHTML = '<div class="pay"><p class="tip">二维码已过期</p><button type="button" class="btn primary block" data-pay-retry>重新生成</button></div>';
    } else if (manual) toast('还没收到付款结果，付完稍等几秒');
  }, (e) => { checking = false; if (manual) toast(e.message); });
}

onClick('[data-paycheck]', () => check(true, true));
onClick('[data-intl]', (el) => {
  const plan = el.getAttribute('data-intl');
  const w = window.open('', '_blank');
  track('pay_intl', { plan });
  api('POST', 'pay/gumroad', { plan }).then((d) => {
    if (w) w.location.href = d.url; else location.href = d.url;
    order = d.order;
    const body = $('#sheet .sbody');
    if (body) { renderIntl(body, d.url); watch(body); }
  }, (e) => { if (w) w.close(); toast(e.message); });
});
onClick('[data-pay-retry]', () => openPay(onPaid, opts));
onClick('#copyLink', () => {
  const u = location.href;
  (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('已复制，去浏览器打开吧'), () => prompt('复制这个链接，到浏览器打开：', u));
});
