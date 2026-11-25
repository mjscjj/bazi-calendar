// 美国版（US_EDITION=1）专有的两件事：分享链接的预览页、邮件重设密码。
// 其他功能都和中文版共用同一组接口。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const HOUR = 3600000;

// 发信：配了 RESEND_API_KEY 就用 Resend 发；没配时把链接写进日志，由人转发
function makeMailer(env, log) {
  const key = (env.RESEND_API_KEY || '').trim(), from = env.MAIL_FROM || 'Sixty <hello@mindflow.zone>';
  return {
    live: !!key,
    async send(to, subject, html, text) {
      if (!key) { log.info(`[us-mail] 未配置发信，给 ${to} 的邮件「${subject}」：${text}`); return false; }
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html, text }), signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`发信失败 ${r.status} ${(await r.text()).slice(0, 200)}`);
      return true;
    },
  };
}

export function registerUsSite({ route, db, env, log, limit, bad, HttpError, hashPassword, chartOf, publicBase }) {
  const C = JSON.parse(fs.readFileSync(path.join(HERE, '../public/us/content.json'), 'utf8'));
  const pillar = (gz) => C.pillars.find((p) => p.cn === gz);
  const signName = (p) => `${C.stems[p.stem].element} ${p.animal}`;
  const mailer = makeMailer(env, log);

  // ----- 重设密码：先发一封带链接的邮件，链接里的 token 1 小时有效、只能用一次 -----
  route('POST', '/api/auth/reset-request', async ({ req, body, ip }) => {
    if (!limit('reset:' + ip, 5, HOUR)) throw new HttpError(429, 'Too many tries. Please wait a moment.');
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad('Please enter a valid email.');
    const u = db.get("SELECT id FROM users WHERE username = ? AND status = 'active'", email);
    // 不告诉对方这个邮箱有没有账号
    if (u) {
      const token = crypto.randomBytes(24).toString('base64url'), now = Date.now();
      db.run('INSERT INTO password_resets(token_hash, user_id, created_at, expires_at) VALUES(?,?,?,?)', sha(token), u.id, new Date(now).toISOString(), new Date(now + HOUR).toISOString());
      const link = `${publicBase(req)}/us/#/reset/${token}`;
      await mailer.send(email, 'Reset your Sixty password',
        `<p>Someone (hopefully you) asked to reset your Sixty password.</p><p><a href="${link}">Choose a new password</a> — this link works for one hour.</p><p>If it wasn't you, you can ignore this email.</p>`,
        `Reset your Sixty password: ${link} (works for one hour)`).catch((e) => log.error(`[us-mail] ${e.message}`));
    }
    return { ok: true };
  });
  route('POST', '/api/auth/reset', async ({ body }) => {
    const token = String(body.token || ''), pw = String(body.password || '');
    if (pw.length < 8) throw bad('Use at least 8 characters for your password.');
    if (pw.length > 72) throw bad('That password is too long.');
    const r = db.get('SELECT * FROM password_resets WHERE token_hash = ?', sha(token));
    if (!r || r.used_at || r.expires_at < new Date().toISOString()) throw bad('This link has expired. Please ask for a new one.');
    db.tx(() => {
      db.run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(pw), r.user_id);
      db.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', new Date().toISOString(), r.token_hash);
      db.run("DELETE FROM sessions WHERE kind = 'user' AND user_id = ?", r.user_id); // 其他设备上的登录一并退出
    });
    return { ok: true };
  });

  // ----- 分享链接：/s/<日柱> 和 /i/<邀请码>，给社交平台一个带画的预览，再跳进应用 -----
  const sharePage = (req, title, desc, image, to) => {
    const base = publicBase(req);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Sixty"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(base + image)}"><meta property="og:url" content="${esc(base + to)}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(base + to)}"></head><body><script>location.replace(${JSON.stringify(base + to)})</script><a href="${esc(base + to)}">Open Sixty</a></body></html>`;
  };
  return {
    page(p, req) {
      let m = p.match(/^\/s\/([a-z]{3,12})\/?$/);
      if (m) {
        const x = C.pillars.find((y) => y.slug === m[1]);
        if (!x) return null;
        return sharePage(req, `${signName(x)} — ${x.name} · Sixty`, `${x.intro} There are 60 kinds of people. Which one are you?`, `/art/pillars/${x.art}`, `/us/#/sign/${x.slug}`);
      }
      m = p.match(/^\/i\/([A-Za-z0-9]{4,12})\/?$/);
      if (m) {
        const inv = db.get("SELECT * FROM users WHERE invite_code = ? AND status = 'active'", m[1].toUpperCase());
        const x = inv && inv.birth_date ? pillar(chartOf(inv).pillars[2]) : null;
        const who = inv?.nickname && !/[一-鿿]/.test(inv.nickname) ? inv.nickname : 'A friend';
        return sharePage(req, x ? `${who} is a${/^[AEIOU]/.test(C.stems[x.stem].element) ? 'n' : ''} ${signName(x)}. What do you two make?` : 'You are invited to Sixty',
          'Every pair of signs makes a painting of its own. Add your birthday to see yours.', x ? `/art/pillars/${x.art}` : '/us/og.jpg', `/us/#/i/${m[1].toUpperCase()}`);
      }
      return null;
    },
  };
}

// 美国版注册的年龄下限（COPPA：不满 13 岁不收集个人信息）
export function ageOf(date, now = new Date()) {
  const [y, m, d] = String(date).split('-').map(Number);
  let a = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) a--;
  return a;
}
