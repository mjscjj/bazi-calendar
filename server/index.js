// 启动入口。配置全部来自环境变量（线上由 systemd 的 EnvironmentFile 提供）。
import { openDb } from './db.js';
import { createServer } from './app.js';
import { makeAlipay } from './alipay.js';
import { makeGumroad } from './gumroad.js';
import { loadContent, makeContent } from './content.js';

const env = process.env;
const db = openDb(env.DB_PATH || new URL('../data/app.db', import.meta.url).pathname);

// 本地开发用 ALIPAY_FAKE=1：不连支付宝，订单由 /api/dev/pay/:no 标记为已付
function fakeAlipay() {
  const paid = new Set();
  return {
    appId: 'fake', fake: { paid },
    async precreate({ outTradeNo }) { return `https://qr.alipay.com/fake-${outTradeNo}`; },
    async query(no) { return paid.has(no) ? { exists: true, status: 'TRADE_SUCCESS', tradeNo: 'FAKE' + no, amount: null, buyer: 'fake***' } : { exists: false }; },
    async cancel() { return true; },
    verifyNotify() { return false; },
  };
}

const alipay = env.ALIPAY_FAKE === '1' ? fakeAlipay() : makeAlipay(env);
if (!alipay) console.warn('[pay] 未配置支付宝，下单接口会返回“支付暂时不可用”');
const gumroad = makeGumroad(env);
if (!gumroad) console.warn('[pay] 未配置 Gumroad，海外付款不显示');
if (!env.ADMIN_PASSWORD) console.warn('[admin] 未设置 ADMIN_PASSWORD，后台无法登录');

const port = parseInt(env.PORT || '3200', 10);
const host = env.HOST || '127.0.0.1';
createServer({ db, alipay, gumroad, env, content: makeContent(loadContent(env.CONTENT_DIR || undefined)), contentEn: makeContent(loadContent(env.CONTENT_DIR || undefined, 'en')) }).listen(port, host, () => {
  console.log(`[bazi-calendar] listening on http://${host}:${port}${env.BASE_PATH ?? '/bazi'}/`);
});
