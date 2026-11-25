// 美国版（US_EDITION=1）专有的两件事：分享链接的预览页、邮件重设密码。
// 其他功能都和中文版共用同一组接口。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dayOut } from './engine.js';
import { bestHours } from '../public/js/data.js';

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

export function registerUsSite({ route, db, env, log, limit, bad, HttpError, hashPassword, chartOf, publicBase, requireUser, access }) {
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
      db.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', new Date().toISOString(), r.user_id); // 这个人其他没用的链接也作废
      db.run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', r.user_id);
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
  // 手机日历订阅（英文）：未来 60 天每天一条全天日程；定了时段的计划按手机本地时间（不带时区）
  const GAN = '甲乙丙丁戊己庚辛壬癸', pad = (n) => String(n).padStart(2, '0'), DAY = 86400000;
  const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = (line) => { const out = []; let cur = '', n = 0; for (const ch of line) { const b = Buffer.byteLength(ch); if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; } cur += ch; n += b; } out.push(cur); return out.join('\r\n '); };
  const hourLabel = (i) => { const a = (i * 2 + 23) % 24, f = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`; return `${f(a)}–${f((a + 2) % 24)}`; };
  function ics({ c, userId, name, today, plans, expired, url, days = 60 }) {
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MindFlow//Sixty//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsText('Sixty' + (name ? ' · ' + name : ''))}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
    const dv = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; };
    const allDay = (uid, t, summary, desc) => L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${dv(t)}`, `DTEND;VALUE=DATE:${dv(t + DAY)}`,
      `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(desc)}`, 'TRANSP:TRANSPARENT', `URL:${url}`, 'END:VEVENT');
    const [ty, tm, td] = today.split('-').map(Number), t0 = Date.UTC(ty, tm - 1, td);
    if (expired) allDay(`expired-${userId}@mindflow.zone`, t0, 'Sixty Plus has ended', `Renew to bring your daily readings back.\n${url}`);
    else {
      for (let k = 0; k < days; k++) {
        const t = t0 + k * DAY, d = new Date(t), x = dayOut(c, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), true);
        const e = GAN.indexOf(x.gz[0]) >> 1, tone = c.ji.includes(e) ? 'ji' : 'xi', vs = C.themes[x.ssG][tone], th = vs[(Math.floor(t / DAY) + 17) % 60 % vs.length], best = bestHours(x).top.map((h) => hourLabel(h.i));
        allDay(`day-${dv(t)}-${userId}@mindflow.zone`, t, `${C.levels[x.level.k].word} · ${th.title.replace(/^A Day (to|for|of) /, '').replace(/^An? /, '')} · best ${best[0]}`,
          `${th.title}\n${th.line}\nDo: ${th.do.join('; ')}\nSkip: ${th.dont.join('; ')}\nBest hours: ${best.join(', ')}\n\nFor reflection and fun — not advice.`);
      }
      for (const p of plans) {
        if (!p.date) continue;
        const [y, m, d] = p.date.split('-').map(Number), t = Date.UTC(y, m - 1, d);
        if (t < t0) continue;
        if (p.hour == null) { allDay(`plan-${p.id}@mindflow.zone`, t, '📌 ' + p.name, p.reason || ''); continue; }
        // 第 i 个时辰从 (2i+23)%24 点开始，子时从前一天 23 点开始；不带时区，手机按自己的本地时间显示
        const st = t + ((p.hour * 2 + 23) % 24) * 3600000 - (p.hour === 0 ? DAY : 0);
        const fl = (ms) => { const z = new Date(ms); return `${z.getUTCFullYear()}${pad(z.getUTCMonth() + 1)}${pad(z.getUTCDate())}T${pad(z.getUTCHours())}0000`; };
        L.push('BEGIN:VEVENT', `UID:plan-${p.id}@mindflow.zone`, `DTSTAMP:${now}`, `DTSTART:${fl(st)}`, `DTEND:${fl(st + 7200000)}`,
          `SUMMARY:${icsText('📌 ' + p.name)}`, `DESCRIPTION:${icsText(p.reason || '')}`, `URL:${url}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(p.name)}`, 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT');
      }
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  // ----- 会自己换的锁屏：iPhone 快捷指令每天早上来拿一张图设为壁纸。地址带用户的日历订阅 token 和时区 -----
  const validTz = (tz) => { if (!tz || tz.length > 64) return null; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; } };
  let canvasMod = null;
  async function wallpaper(u, tz, W, H) {
    canvasMod = canvasMod || await import('@napi-rs/canvas').then((m) => {
      for (const f of ['InstrumentSerif-400.ttf', 'InstrumentSerif-400i.ttf', 'Inter-500.ttf', 'Inter-600.ttf']) m.GlobalFonts.registerFromPath(path.join(HERE, 'fonts', f), f.startsWith('Inter') ? 'Inter' : 'Instrument Serif');
      return m;
    });
    const { createCanvas, loadImage } = canvasMod;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: validTz(tz) || env.DAY_TZ || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [y, m, d] = date.split('-').map(Number), t = Date.UTC(y, m - 1, d);
    const c = chartOf(u), x = dayOut(c, y, m, d, true), p = pillar(x.gz);
    const e = GAN.indexOf(x.gz[0]) >> 1, tone = c.ji.includes(e) ? 'ji' : 'xi', vs = C.themes[x.ssG][tone], th = vs[(Math.floor(t / DAY) + 17) % 60 % vs.length];
    const h12 = (h) => h % 12 || 12, ap = (h) => (h < 12 ? 'AM' : 'PM');
    const best = bestHours(x).top.map((h) => { const a = (h.i * 2 + 23) % 24, b = (a + 2) % 24; return ap(a) === ap(b) && b ? `${h12(a)}–${h12(b)} ${ap(b)}` : `${h12(a)} ${ap(a)}–${h12(b)} ${ap(b)}`; });
    const img = await loadImage(path.join(HERE, '../public/art/pillars', p.art));
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    // 背景：同一张画放大、虚化、压暗，铺满整屏
    ctx.filter = 'blur(48px)'; const sc = Math.max(W, H) / 720 * 1.15; ctx.drawImage(img, (W - 720 * sc) / 2, (H - 720 * sc) / 2, 720 * sc, 720 * sc); ctx.filter = 'none';
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(10,10,14,.30)'); g.addColorStop(0.45, 'rgba(10,10,14,.45)'); g.addColorStop(1, 'rgba(10,10,14,.78)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 画：屏幕中下部，上面留给锁屏时钟
    // 版式按屏幕比例自适应：上面约 33% 留给锁屏时钟，底部留 9%，剩下的放画和四行字
    const k0 = W / 1179, textH = 400 * k0, top = Math.round(H * 0.33), bottom = Math.round(H * 0.09);
    const S = Math.round(Math.min(W * 0.72, H - top - bottom - textH)), X = (W - S) / 2;
    const Y = top + Math.max(0, Math.round((H - top - bottom - textH - S) / 2));
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24; ctx.beginPath(); ctx.roundRect(X, Y, S, S, 44); ctx.fillStyle = '#222'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(X, Y, S, S, 44); ctx.clip(); ctx.drawImage(img, X, Y, S, S); ctx.restore();
    const k = W / 1179, cx = W / 2; let ty = Y + S + 96 * k;
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = `600 ${30 * k}px Inter`;
    ctx.fillText(`${new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase()}  ·  ${signName(p).toUpperCase()}`, cx, ty);
    ty += 104 * k; ctx.fillStyle = '#fff'; ctx.font = `400 ${96 * k}px "Instrument Serif"`; ctx.fillText(`${C.levels[x.level.k].word} · ${x.score}`, cx, ty);
    ty += 70 * k; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = `italic 400 ${54 * k}px "Instrument Serif"`; ctx.fillText(th.title, cx, ty);
    ty += 74 * k; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = `500 ${34 * k}px Inter`; ctx.fillText(`Best ${best.join('  ·  ')}`, cx, ty);
    return cv.encode('jpeg', 88);
  }
  // 锁屏有自己的凭证（和日历订阅分开），拿到链接的人只能看到这张图
  const wallTokenOf = (u, fresh) => {
    const row = !fresh && db.get('SELECT token FROM wall_tokens WHERE user_id = ?', u.id);
    if (row) return row.token;
    const token = crypto.randomBytes(24).toString('base64url');
    db.run('INSERT INTO wall_tokens(user_id, token, created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at', u.id, token, new Date().toISOString());
    return token;
  };
  route('GET', '/api/us/wallpaper-link', async ({ req }) => ({ token: wallTokenOf(requireUser(req), false) }));
  route('POST', '/api/us/wallpaper-link/reset', async ({ req }) => ({ token: wallTokenOf(requireUser(req), true) }));

  // 出图：同一人同一天同一尺寸只画一次；同时最多画 2 张，其余排队（早上 7 点大家一起来拿）
  const cache = new Map(), MAXC = 300;
  let busy = 0; const waiters = [];
  const slot = () => (busy < 2 ? (busy++, Promise.resolve()) : new Promise((r) => waiters.push(r)));
  const free = () => { const w = waiters.shift(); if (w) w(); else busy--; };
  async function endedImage(W, H) {
    const { createCanvas } = canvasMod || await import('@napi-rs/canvas').then((m) => (canvasMod = m));
    const cv = createCanvas(W, H), ctx = cv.getContext('2d'), k = W / 1179;
    ctx.fillStyle = '#16151A'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#F2F1EE'; ctx.textAlign = 'center';
    ctx.font = `400 ${72 * k}px "Instrument Serif"`; ctx.fillText('Sixty Plus has ended', W / 2, H * 0.6);
    ctx.font = `500 ${32 * k}px Inter`; ctx.fillStyle = 'rgba(242,241,238,.7)'; ctx.fillText('Renew to bring your daily lock screen back.', W / 2, H * 0.6 + 70 * k);
    return cv.encode('jpeg', 85);
  }
  route('GET', '/api/us/wallpaper/:token', async ({ req, params, q, ip }) => {
    if (!limit('wall:' + ip, 600, HOUR)) throw new HttpError(429, 'Too many requests.');
    const token = String(params.token).replace(/\.(jpe?g|png)$/, '');
    const u = token.length > 20 && db.get("SELECT u.* FROM wall_tokens w JOIN users u ON u.id = w.user_id WHERE w.token = ? AND u.status = 'active'", token);
    if (!u || !u.birth_date) throw new HttpError(404, 'This link has expired.');
    if (!limit('wallt:' + token, 30, HOUR)) throw new HttpError(429, 'Too many requests.');
    const headers = { 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="sixty-today.jpg"' };
    if (req.method === 'HEAD') return { __raw: Buffer.alloc(0), __type: 'image/jpeg', __headers: headers };
    // 尺寸：宽 600–2000；高宽比不在手机常见范围（1.5–2.4）时按 2556/1179 出
    const W = Math.min(2000, Math.max(600, parseInt(q.get('w'), 10) || 1179)); let H = parseInt(q.get('h'), 10) || 2556;
    if (!(H / W >= 1.5 && H / W <= 2.4)) H = Math.round(W * 2556 / 1179);
    const tz = validTz(String(q.get('tz') || '')) || env.DAY_TZ || 'America/Chicago';
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const blocked = access(u).mode === 'blocked', key = `${u.id}:${day}:${W}x${H}:${blocked ? 0 : 1}:${u.birth_date}:${u.birth_time || ''}:${u.birth_lng ?? ''}:${u.gender || ''}`;
    let buf = cache.get(key);
    if (!buf) {
      await slot();
      try { buf = blocked ? await endedImage(W, H) : await wallpaper(u, tz, W, H); } finally { free(); }
      cache.set(key, buf); if (cache.size > MAXC) cache.delete(cache.keys().next().value);
    }
    return { __raw: buf, __type: 'image/jpeg', __headers: headers };
  });

  return {
    ics,
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
