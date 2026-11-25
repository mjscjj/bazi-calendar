// Gumroad 代收：海外用户用外币卡或 PayPal 开会员（按月/按年自动续费）。
// Gumroad 是卖方（merchant of record），税由它处理；我们只收它的付款通知（Ping）。
// 配置从环境变量读：GUMROAD_PRODUCT_ID、GUMROAD_PRODUCT_URL、GUMROAD_PING_SECRET 必填，GUMROAD_ACCESS_TOKEN 用来回查订单。
import crypto from 'node:crypto';

const MAX_SKEW_SECONDS = 300;

export function makeGumroad(env = process.env) {
  const productId = (env.GUMROAD_PRODUCT_ID || '').trim();
  const productUrl = (env.GUMROAD_PRODUCT_URL || '').trim();
  const secret = (env.GUMROAD_PING_SECRET || '').trim();
  if (!productId || !productUrl || !secret) return null;
  const token = (env.GUMROAD_ACCESS_TOKEN || '').trim();
  return {
    productId,
    // 页面上显示的价格，要和 Gumroad 后台的定价一致
    plans: {
      monthly: { cents: parseInt(env.GUMROAD_MONTH_CENTS || '499', 10) },
      yearly: { cents: parseInt(env.GUMROAD_YEAR_CENTS || '2999', 10) },
    },
    checkoutUrl({ ref, plan }) {
      const u = new URL(productUrl);
      u.searchParams.set('wanted', 'true');
      u.searchParams.set('recurrence', plan);
      u.searchParams.set('ref', ref);
      return u.toString();
    },
    // X-Gumroad-Signature: t=<秒>,v1=<hex HMAC-SHA256(t + "." + 原始请求体)>
    verify(rawBody, header) {
      const kv = Object.fromEntries(String(header || '').split(',').map((s) => s.trim().split('=')));
      const t = kv.t || '', v1 = kv.v1 || '';
      if (!/^\d+$/.test(t) || Math.abs(Date.now() / 1000 - Number(t)) > MAX_SKEW_SECONDS) return false;
      const expected = Buffer.from(crypto.createHmac('sha256', secret).update(t + '.').update(rawBody).digest('hex'));
      const received = Buffer.from(v1);
      return expected.length === received.length && crypto.timingSafeEqual(expected, received);
    },
    // 回查订单；没配令牌或查不到返回 null
    async sale(id) {
      if (!token) return null;
      const r = await fetch(`https://api.gumroad.com/v2/sales/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404 || d.success === false) return { missing: true };
      if (!r.ok) throw new Error(`Gumroad 查单失败 ${r.status}`);
      return d.sale || null;
    },
  };
}
