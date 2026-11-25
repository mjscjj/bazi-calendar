// Gumroad 海外付款：下单拿结账链接、Ping 验签、首单开通、重复 Ping 不重复加天数、续费、退款扣回；美国版的 Ping 原样转发。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';
import { makeGumroad } from '../server/gumroad.js';

const SECRET = 'test-secret';
const PRODUCT = 'PROD==';
let server, base, db, us;
const forwarded = [];
const quiet = { info() {}, error() {} };

before(async () => {
  us = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { forwarded.push({ url: req.url, sig: req.headers['x-gumroad-signature'], type: req.headers['content-type'], body: b }); res.end('ok'); }); });
  await new Promise((r) => us.listen(0, '127.0.0.1', r));
  db = openDb(':memory:');
  const gumroad = makeGumroad({ GUMROAD_PRODUCT_ID: PRODUCT, GUMROAD_PRODUCT_URL: 'https://seller.gumroad.com/l/mindflow', GUMROAD_PING_SECRET: SECRET });
  gumroad.sale = async () => null;
  server = createServer({ db, alipay: null, gumroad, env: { GUMROAD_FORWARD_URL: `http://127.0.0.1:${us.address().port}/sixty/api/us/pay/ping`, BASE_PATH: '/bazi', COOKIE_SECURE: '0', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'adminpass123', ASK_AI: 'fake' }, log: quiet });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/bazi`;
});
after(() => { server.close(); us.close(); });

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': '10.9.0.1' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.getSetCookie();
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ') || cookie;
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}
async function ping(fields, { sign = true } = {}) {
  const body = new URLSearchParams({ product_id: PRODUCT, resource_name: 'sale', ...fields }).toString();
  const t = String(Math.floor(Date.now() / 1000));
  const v1 = sign ? crypto.createHmac('sha256', SECRET).update(t + '.' + body).digest('hex') : 'bad';
  const res = await fetch(base + '/api/pay/gumroad/ping', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Gumroad-Signature': `t=${t},v1=${v1}` }, body });
  await new Promise((r) => setTimeout(r, 50));
  return res.status;
}
const until = (name) => db.get('SELECT member_until m FROM users WHERE username = ?', name).m;
const daysFromNow = (iso) => Math.round((new Date(iso) - Date.now()) / 86400000);

test('海外付款：首单开通、去重、续费、退款', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { username: 'intl_a', password: '12345678', agree: true });

  const o = await c('POST', '/api/pay/orders', { product: 'member' });
  assert.equal(o.status, 200);
  assert.equal(o.data.order, null, '没配支付宝时只给海外付款');
  assert.deepEqual(o.data.intl, { monthly: 499, yearly: 2999 });
  assert.equal((await c('POST', '/api/pay/orders', { product: 'ask' })).status, 400, '问事不单卖（含在会员里）');

  const g = await c('POST', '/api/pay/gumroad', { plan: 'yearly' });
  assert.equal(g.status, 200);
  const no = g.data.order.outTradeNo;
  assert.match(no, /^LRG/);
  const url = new URL(g.data.url);
  assert.equal(url.searchParams.get('ref'), no);
  assert.equal(url.searchParams.get('recurrence'), 'yearly');
  assert.equal(g.data.order.status, 'pending');

  assert.equal(await ping({ sale_id: 'S1', 'url_params[ref]': no, recurrence: 'yearly', price: '2999', subscription_id: 'SUB1' }, { sign: false }), 400, '签名不对拒收');
  assert.equal((await c('GET', `/api/pay/orders/${no}`)).data.order.status, 'pending');

  assert.equal(await ping({ sale_id: 'S1', 'url_params[ref]': no, recurrence: 'yearly', price: '2999', subscription_id: 'SUB1', email: 'a@example.com' }), 200);
  const s = await c('GET', `/api/pay/orders/${no}`);
  assert.equal(s.data.order.status, 'paid');
  assert.equal(s.data.order.currency, 'USD');
  assert.equal(daysFromNow(until('intl_a')), 365);

  assert.equal(await ping({ sale_id: 'S1', 'url_params[ref]': no, recurrence: 'yearly', price: '2999', subscription_id: 'SUB1' }), 200);
  assert.equal(daysFromNow(until('intl_a')), 365, '同一笔重复通知不重复加天数');

  assert.equal(await ping({ sale_id: 'S2', recurrence: 'yearly', price: '2999', subscription_id: 'SUB1', is_recurring_charge: 'true' }), 200);
  assert.equal(daysFromNow(until('intl_a')), 730, '续费按订阅找到用户再加一期');
  assert.equal(db.get("SELECT COUNT(*) n FROM orders WHERE provider = 'gumroad' AND status = 'paid'").n, 2);

  assert.equal(await ping({ sale_id: 'S2', resource_name: 'refund', subscription_id: 'SUB1' }), 200);
  assert.equal(daysFromNow(until('intl_a')), 365, '退款扣回那一期');
  assert.equal(db.get("SELECT status FROM orders WHERE trade_no = 'S2'").status, 'refunded');

  assert.equal(await ping({ sale_id: 'S3', product_id: 'OTHER', subscription_id: 'SUB1', price: '100' }), 200);
  assert.equal(db.get("SELECT COUNT(*) n FROM orders WHERE trade_no = 'S3'").n, 0, '别的商品不处理');

  const m = await c('POST', '/api/pay/gumroad', { plan: 'monthly' });
  assert.equal(m.data.order.amountCents, 499);
  assert.equal(m.data.order.days, 30);
});

test('美国版的 Ping 原样转发，中文版不处理', async () => {
  forwarded.length = 0;
  const before = db.get('SELECT COUNT(*) n FROM orders').n;
  assert.equal(await ping({ sale_id: 'U1', 'url_params[ref]': 'SXT123', recurrence: 'monthly', price: '499', subscription_id: 'USUB1' }), 200);
  assert.equal(await ping({ sale_id: 'U2', recurrence: 'monthly', price: '499', subscription_id: 'USUB1', is_recurring_charge: 'true' }), 200);
  assert.equal(await ping({ sale_id: 'U2', resource_name: 'refund', subscription_id: 'USUB1' }), 200);
  assert.equal(await ping({ sale_id: 'S9', recurrence: 'yearly', price: '2999', subscription_id: 'SUB1', is_recurring_charge: 'true' }), 200, '中文版的续费不转');
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(forwarded.map((f) => new URLSearchParams(f.body).get('sale_id')), ['U1', 'U2', 'U2']);
  assert.equal(forwarded[0].url, '/sixty/api/us/pay/ping');
  assert.match(forwarded[0].sig, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(forwarded[0].type, 'application/x-www-form-urlencoded');
  assert.equal(db.get("SELECT COUNT(*) n FROM orders WHERE trade_no IN ('U1','U2')").n, 0, '美国版的单不在中文版记账');
  assert.equal(db.get('SELECT COUNT(*) n FROM orders').n, before + 1, '只多了中文版那笔续费');
});
