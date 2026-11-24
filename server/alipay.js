// 支付宝当面付：预下单、查单、撤销、通知验签。配置从环境变量读，和 Ai Article 共用同一个应用。
import crypto from 'node:crypto';
import { AlipaySdk } from 'alipay-sdk';

function pem(raw, type) {
  const s = String(raw || '').trim();
  if (!s || s.includes('-----BEGIN')) return s;
  const body = s.replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${type} KEY-----\n${body}\n-----END ${type} KEY-----`;
}

// 支付宝后台给的私钥常是不带头尾的一行，可能是 PKCS8 也可能是 PKCS1，两种都试
function privateKey(raw) {
  const s = String(raw || '').trim();
  if (s.includes('-----BEGIN RSA PRIVATE')) return { key: s, type: 'PKCS1' };
  if (s.includes('-----BEGIN')) return { key: s, type: 'PKCS8' };
  for (const [hdr, type] of [['PRIVATE', 'PKCS8'], ['RSA PRIVATE', 'PKCS1']]) {
    const key = pem(s, hdr);
    try { crypto.createPrivateKey(key); return { key, type }; } catch { /* 换另一种 */ }
  }
  throw new Error('支付宝应用私钥无法解析');
}

export function makeAlipay(env = process.env) {
  if (!env.ALIPAY_APPID || !env.ALIPAY_PRIVATE_KEY || !env.ALIPAY_PUBLIC_KEY) return null;
  const pk = privateKey(env.ALIPAY_PRIVATE_KEY);
  const sdk = new AlipaySdk({
    appId: env.ALIPAY_APPID.trim(),
    privateKey: pk.key,
    keyType: pk.type,
    alipayPublicKey: pem(env.ALIPAY_PUBLIC_KEY, 'PUBLIC'),
    signType: 'RSA2',
    timeout: 10000,
    camelcase: false,
  });
  const notifyUrl = env.ALIPAY_NOTIFY_URL || '';
  return {
    appId: env.ALIPAY_APPID.trim(),
    async precreate({ outTradeNo, amountCents, subject }) {
      const r = await sdk.exec('alipay.trade.precreate', {
        ...(notifyUrl ? { notify_url: notifyUrl } : {}),
        bizContent: {
          out_trade_no: outTradeNo,
          total_amount: (amountCents / 100).toFixed(2),
          subject,
          timeout_express: '10m',
          qr_code_timeout_express: '10m',
        },
      });
      if (r.code !== '10000' || !r.qr_code) throw new Error(`支付宝下单失败：${r.code} ${r.sub_code || ''} ${r.sub_msg || r.msg || ''}`.trim());
      return r.qr_code;
    },
    async query(outTradeNo) {
      const r = await sdk.exec('alipay.trade.query', { bizContent: { out_trade_no: outTradeNo } });
      if (r.code === '10000') return { exists: true, status: r.trade_status, tradeNo: r.trade_no, amount: r.total_amount, buyer: r.buyer_logon_id || '' };
      if (r.sub_code === 'ACQ.TRADE_NOT_EXIST') return { exists: false };
      throw new Error(`支付宝查单失败：${r.code} ${r.sub_code || ''} ${r.sub_msg || r.msg || ''}`.trim());
    },
    async cancel(outTradeNo) {
      const r = await sdk.exec('alipay.trade.cancel', { bizContent: { out_trade_no: outTradeNo } });
      return r.code === '10000';
    },
    verifyNotify(params) {
      try { return sdk.checkNotifySignV2(params) || sdk.checkNotifySign(params); } catch { return false; }
    },
  };
}
