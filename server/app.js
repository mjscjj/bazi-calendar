// 流日历服务端：账号、资料、日历（服务端排盘）、计划、免费次数、月度会员与支付宝、反馈、管理后台。
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import qrcode from 'qrcode-generator';
import { chart, calendar, dayOut, almanac, lunarToSolar, solarToLunar, lunarMonths, termOf, ZHI, WX, dayGz } from './engine.js';
import { makeSettings } from './settings.js';
import { loadContent, makeContent } from './content.js';
import { searchCities, cityByName, resolveBirth } from './solar.js';
import { pickDays } from './pick.js';
import { buildIcs, dayEvent } from './ics.js';
import { adminStats } from './stats.js';
import { makeMeihua } from './meihua.js';
import { makeAi, checkReading, checkFollow } from './ai.js';
import { THEME, bestHours, hhShort } from '../public/js/data.js';

const PUBLIC_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const DEMO_BIRTH = { date: '1990-10-19', time: '10:00', gender: '女' };
const DEMO_NAME = '小满';
const FEEDBACK_TYPES = ['问题', '建议', '付款问题', '其他'];
const SESSION_DAYS = 30;
const ADMIN_SESSION_HOURS = 12;
const ORDER_MINUTES = 10;

// ---------- 小工具 ----------
const nowIso = () => new Date().toISOString();
const addMs = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();
const DAY_MS = 86400000;
// 北京时间的日期 YYYY-MM-DD
export const bjDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randToken = () => crypto.randomBytes(32).toString('base64url');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = (n) => Array.from(crypto.randomBytes(n), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
// 计划日期统一存成不补零的「2026-12-9」（和月历格子的写法一致）
const planDate = (s) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '')); return m ? `${+m[1]}-${+m[2]}-${+m[3]}` : null; };
const planUtc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (msg) => new HttpError(400, msg);

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}

function rateLimiter() {
  const hits = new Map();
  return (key, limit, windowMs) => {
    const t = Date.now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= limit) { hits.set(key, arr); return false; }
    arr.push(t); hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] > windowMs) hits.delete(k);
    return true;
  };
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, '内容太长');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const str = (v, max, name) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw bad(`${name}不能超过 ${max} 个字`);
  return s;
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

// ---------- 应用 ----------
export function createApp({ db, alipay, env = process.env, log = console, content, ai }) {
  const settings = makeSettings(db);
  const C = content || makeContent(loadContent());
  const M = makeMeihua(C.ask);
  const AI = ai || makeAi(env, log);
  const BASE = (env.BASE_PATH || '/bazi').replace(/\/$/, '');
  const COOKIE_SECURE = env.COOKIE_SECURE !== '0';
  const limit = rateLimiter();

  // ----- 会话 -----
  function setCookie(res, name, value, maxAgeSec) {
    const parts = [`${name}=${value}`, `Path=${BASE || '/'}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
    if (COOKIE_SECURE) parts.push('Secure');
    const prev = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', [...prev, parts.join('; ')]);
  }
  function newSession(res, kind, userId) {
    const token = randToken();
    const hours = kind === 'admin' ? ADMIN_SESSION_HOURS : SESSION_DAYS * 24;
    db.run('INSERT INTO sessions(token_hash, kind, user_id, created_at, expires_at) VALUES(?,?,?,?,?)', sha256(token), kind, userId ?? null, nowIso(), addMs(nowIso(), hours * 3600000));
    setCookie(res, kind === 'admin' ? 'lrl_admin' : 'lrl_sid', token, hours * 3600);
  }
  function sessionOf(req, kind) {
    const token = parseCookies(req)[kind === 'admin' ? 'lrl_admin' : 'lrl_sid'];
    if (!token) return null;
    const s = db.get('SELECT * FROM sessions WHERE token_hash = ? AND kind = ?', sha256(token), kind);
    if (!s || s.expires_at < nowIso()) return null;
    return { ...s, token };
  }
  function currentUser(req) {
    const s = sessionOf(req, 'user');
    if (!s) return null;
    const u = db.get('SELECT * FROM users WHERE id = ?', s.user_id);
    if (!u || u.status !== 'active') return null;
    return u;
  }
  function requireUser(req) {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, '请先登录');
    return u;
  }
  function requireAdmin(req) {
    if (!sessionOf(req, 'admin')) throw new HttpError(401, '请先登录后台');
  }

  // ----- 免费次数与会员 -----
  function access(u) {
    const today = bjDay();
    const until = u.member_until;
    if (until && until > nowIso()) {
      return { mode: 'member', memberUntil: until, daysLeft: Math.ceil((new Date(until) - Date.now()) / DAY_MS) };
    }
    const freeLimit = settings.int('free_uses');
    const used = db.get('SELECT COUNT(*) n FROM usage_days WHERE user_id = ?', u.id).n;
    const todayCounted = !!db.get('SELECT 1 x FROM usage_days WHERE user_id = ? AND day = ?', u.id, today);
    const allowed = todayCounted || used < freeLimit;
    const usedAfter = todayCounted ? used : (allowed ? used + 1 : used);
    return {
      mode: allowed ? 'free' : 'blocked', freeLimit, freeUsed: usedAfter,
      remaining: Math.max(0, freeLimit - usedAfter), expired: !!until,
      memberUntil: until || null,
    };
  }
  // 记下今天用过（免费次数按天算）；返回是不是今天第一次
  function recordUse(u) {
    return db.run('INSERT OR IGNORE INTO usage_days(user_id, day, created_at) VALUES(?,?,?)', u.id, bjDay(), nowIso()).changes > 0;
  }
  // 记下今天打开过（收画用，和会员、免费次数无关）；返回是不是今天第一次
  function recordOpen(u) {
    return db.run('INSERT OR IGNORE INTO open_days(user_id, day, created_at) VALUES(?,?,?)', u.id, bjDay(), nowIso()).changes > 0;
  }
  // 一甲子：每天打开就收下当天日柱的那张画，60 张一轮。返回 日柱 → 第一次收下的那天
  function jiaziOf(u) {
    const got = new Map();
    for (const r of db.all('SELECT day FROM open_days WHERE user_id = ? ORDER BY day', u.id)) { const gz = dayGz(r.day); if (!got.has(gz)) got.set(gz, r.day); }
    return got;
  }
  // 第一次集满 60 张，送一枚御守（加一次御守次数，转运页「直接买一枚」里免费领；只送一次）
  function jiaziReward(u, n) {
    if (n < 60 || u.jiazi_done) return false;
    return db.run('UPDATE users SET jiazi_done = ?, amulet_credits = amulet_credits + 1 WHERE id = ? AND jiazi_done IS NULL', nowIso(), u.id).changes > 0;
  }
  // 会员顺延：没过期从到期日往后加，过期了从现在加
  function addMemberDays(userId, days) {
    const t = nowIso();
    const u = db.get('SELECT member_until FROM users WHERE id = ?', userId);
    const base = u.member_until && u.member_until > t ? u.member_until : t;
    const until = addMs(base, days * DAY_MS);
    db.run('UPDATE users SET member_until = ? WHERE id = ?', until, userId);
    return until;
  }

  // ----- 邀请 -----
  function newInviteCode() {
    for (;;) { const c = randCode(5); if (!db.get('SELECT 1 x FROM users WHERE invite_code = ?', c)) return c; }
  }
  function inviteCodeOf(u) {
    if (u.invite_code) return u.invite_code;
    const c = newInviteCode();
    db.run('UPDATE users SET invite_code = ? WHERE id = ?', c, u.id);
    return c;
  }
  // 注册时带了邀请码：记一条待生效的邀请。同一台设备注册的第二个被邀请账号、或邀请人自己的设备，不发奖励
  function linkInvite(uid, code, anonId) {
    const c = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(c)) return;
    const inviter = db.get('SELECT id FROM users WHERE invite_code = ?', c);
    if (!inviter || inviter.id === uid) return;
    const anon = String(anonId || '').slice(0, 64);
    const sameDevice = anon && (db.get('SELECT 1 x FROM invites WHERE anon_id = ?', anon) || db.get('SELECT 1 x FROM events WHERE user_id = ? AND anon_id = ? LIMIT 1', inviter.id, anon));
    db.run('INSERT OR IGNORE INTO invites(inviter_id, invitee_id, anon_id, status, created_at) VALUES(?,?,?,?,?)', inviter.id, uid, anon, sameDevice ? 'blocked' : 'pending', nowIso());
  }
  // 被邀请人测完能量卡、并在第二天再次打开：双方各加天数；邀请人每月封顶，超过的只给被邀请人
  function activateInvite(u) {
    const inv = db.get("SELECT * FROM invites WHERE invitee_id = ? AND status = 'pending'", u.id);
    if (!inv || !u.birth_date) return;
    if (db.get('SELECT COUNT(*) n FROM usage_days WHERE user_id = ?', u.id).n < 2) return;
    const days = settings.int('invite_days'), cap = settings.int('invite_cap');
    db.tx(() => {
      const monthStart = new Date(Date.parse(bjDay().slice(0, 8) + '01T00:00:00+08:00')).toISOString();
      const used = db.get("SELECT COUNT(*) n FROM invites WHERE inviter_id = ? AND status = 'done' AND done_at >= ?", inv.inviter_id, monthStart).n;
      const status = used < cap ? 'done' : 'capped';
      addMemberDays(u.id, days);
      if (status === 'done') addMemberDays(inv.inviter_id, days);
      db.run('UPDATE invites SET status = ?, done_at = ?, inviter_seen = ?, invitee_seen = 0 WHERE id = ?', status, nowIso(), status === 'done' ? 0 : 1, inv.id);
    });
  }
  const shownName = (x) => x.nickname || (x.username ? x.username.slice(0, 1) + '**' : '朋友');
  // 今天页的一次性消息：邀请生效
  function newsFor(u) {
    const out = [];
    const days = settings.int('invite_days');
    for (const r of db.all("SELECT i.id, u.nickname, u.username FROM invites i JOIN users u ON u.id = i.invitee_id WHERE i.inviter_id = ? AND i.inviter_seen = 0", u.id)) {
      out.push({ kind: 'invite_done', text: `${shownName(r)}加入了，你们各得 ${days} 天会员` });
      db.run('UPDATE invites SET inviter_seen = 1 WHERE id = ?', r.id);
    }
    const mine = db.get("SELECT i.id, u.nickname, u.username FROM invites i JOIN users u ON u.id = i.inviter_id WHERE i.invitee_id = ? AND i.invitee_seen = 0", u.id);
    if (mine) {
      out.push({ kind: 'invited_done', text: `你和${shownName(mine)}各得 ${days} 天会员，已经加到你的会员里` });
      db.run('UPDATE invites SET invitee_seen = 1 WHERE id = ?', mine.id);
    }
    return out;
  }

  // ----- 计划 -----
  // 带上那天对你是什么日子（按当前的出生信息现算）
  function plansOf(u, c) {
    return db.all('SELECT id, name, type, date, hour, reason, created_at FROM plans WHERE user_id = ? ORDER BY id', u.id).map((p) => {
      if (!p.date || !c) return p;
      const [y, m, d] = p.date.split('-').map(Number);
      const x = dayOut(c, y, m, d, false);
      return { ...p, ssG: x.ssG, level: x.level, score: x.score };
    });
  }

  // ----- 每晚自评 -----
  const band = (v) => (v <= 2 ? 0 : v === 3 ? 1 : 2);
  // 本月自评：吻合几天；系统说顺的日子和说要留神的日子，你各自平均打了几分
  function rateMonth(u, date) {
    const rows = db.all('SELECT day, score, sys_level FROM ratings WHERE user_id = ? AND day LIKE ? ORDER BY day', u.id, date.slice(0, 7) + '-%');
    const avg = (list) => (list.length ? Math.round((list.reduce((a, r) => a + r.score, 0) / list.length) * 10) / 10 : null);
    const good = rows.filter((r) => r.sys_level >= 4), low = rows.filter((r) => r.sys_level <= 2);
    return {
      month: +date.slice(5, 7), rated: rows.length, match: rows.filter((r) => band(r.score) === band(r.sys_level)).length,
      good: { n: good.length, avg: avg(good) }, low: { n: low.length, avg: avg(low) },
      days: rows.map((r) => ({ d: +r.day.slice(8), ok: band(r.score) === band(r.sys_level) })),
    };
  }
  function rateInfo(u, c, date) {
    const [y, m, d] = date.split('-').map(Number);
    const yd = new Date(Date.UTC(y, m - 1, d) - DAY_MS).toISOString().slice(0, 10);
    const get = (day) => { const r = db.get('SELECT score FROM ratings WHERE user_id = ? AND day = ?', u.id, day); return r ? r.score : null; };
    const note = (db.get('SELECT note FROM ratings WHERE user_id = ? AND day = ?', u.id, date) || {}).note || '';
    const usedYesterday = !!db.get('SELECT 1 x FROM usage_days WHERE user_id = ? AND day = ?', u.id, yd);
    let yday = null;
    if (usedYesterday && get(yd) == null) {
      const [a, b, e] = yd.split('-').map(Number);
      const x = dayOut(c, a, b, e, false);
      yday = { date: yd, level: x.level, score: x.score };
    }
    return { today: get(date), note, yesterday: yday, summary: rateMonth(u, date) };
  }

  // ----- 心情便签 -----
  // 一天可以贴好几张；每张的心情对应一个分数，当天的平均分写进 ratings（src = 'mood'），和系统的判断对照、后台吻合度都照旧
  const MK = C.moods;
  const moodKit = () => ({ max: MK.max_per_day, noteMax: MK.note_max, eventColor: MK.event_color, moods: MK.moods.map(({ key, word, char, color, score }) => ({ key, word, char, color, score })), colors: MK.colors.map(({ key, name, light, dark }) => ({ key, name, light, dark })) });
  const moodOut = (r) => ({ id: r.id, day: r.day, mood: r.mood, color: r.color, note: r.note, createdAt: r.created_at });
  const moodsOn = (u, day) => db.all('SELECT * FROM moods WHERE user_id = ? AND day = ? ORDER BY id', u.id, day).map(moodOut);
  // 给一周的每一天带上那天贴的心情
  function withMoods(u, strip) {
    const rows = db.all('SELECT * FROM moods WHERE user_id = ? AND day >= ? AND day <= ? ORDER BY id', u.id, strip.days[0].date, strip.days[6].date).map(moodOut);
    for (const x of strip.days) x.moods = rows.filter((r) => r.day === x.date);
    return strip;
  }
  function syncMoodRating(u, day) {
    const list = db.all('SELECT mood FROM moods WHERE user_id = ? AND day = ?', u.id, day);
    // 只记了事情、没选心情的不算分
    const scores = list.map((r) => (MK.moods.find((m) => m.key === r.mood) || {}).score).filter(Boolean);
    if (!scores.length) { db.run("DELETE FROM ratings WHERE user_id = ? AND day = ? AND src = 'mood'", u.id, day); return; }
    const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const [y, m, d] = day.split('-').map(Number);
    const x = dayOut(chartOf(u), y, m, d, false);
    db.run(`INSERT INTO ratings(user_id, day, score, sys_score, sys_level, note, src, created_at) VALUES(?,?,?,?,?,'','mood',?)
      ON CONFLICT(user_id, day) DO UPDATE SET score = excluded.score, src = 'mood', created_at = excluded.created_at`, u.id, day, score, x.score, x.level.k, nowIso());
  }

  const publicUser = (u) => ({
    id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
    birth: u.birth_date ? {
      date: u.birth_date, time: u.birth_time || null, gender: u.gender,
      cal: u.birth_cal || 'solar', lunar: solarToLunar(u.birth_date), city: u.birth_city || null, zhi: u.birth_zhi || null,
    } : null,
    proMode: !!u.pro_mode, xiOverride: u.xi_override ? JSON.parse(u.xi_override) : null, inviteCode: u.invite_code || null,
    createdAt: u.created_at,
  });
  const unreadCount = (u) => db.get("SELECT COUNT(*) n FROM feedback WHERE user_id = ? AND user_seen = 0", u.id).n;
  const priceInfo = () => ({ priceCents: settings.int('price_cents'), memberDays: settings.int('member_days'), inviteDays: settings.int('invite_days') });

  // ----- 订单 -----
  // 三种商品：月度会员（加天数）、问事 1 次、特别款御守 1 枚（加次数）。支付宝订单名里不出现命理字样
  const PRODUCT_NAME = { member: '月度会员', ask: '问事 1 次', amulet: '特别款御守' };
  const CREDIT_COL = { ask: 'ask_credits', amulet: 'amulet_credits' };
  function product(kind) {
    if (kind === 'ask') return { kind, amountCents: settings.int('ask_price_cents'), days: 0, subject: 'MindFlow 问事 1 次' };
    if (kind === 'amulet') return { kind, amountCents: settings.int('amulet_price_cents'), days: 0, subject: 'MindFlow 特别款御守' };
    return { kind: 'member', amountCents: settings.int('price_cents'), days: settings.int('member_days'), subject: settings.get('order_subject') };
  }
  function grant(outTradeNo, { tradeNo, buyer, amount, raw }) {
    return db.tx(() => {
      const o = db.get('SELECT * FROM orders WHERE out_trade_no = ?', outTradeNo);
      if (!o) return null;
      if (o.status === 'paid' || o.status === 'refunded') return o;
      if (amount != null && Math.round(parseFloat(amount) * 100) !== o.amount_cents) {
        log.error(`[pay] 金额不符 ${outTradeNo} ${amount} != ${o.amount_cents}`);
        return o;
      }
      const t = nowIso();
      db.run("UPDATE orders SET status='paid', paid_at=?, trade_no=?, buyer=?, notify_raw=COALESCE(?, notify_raw) WHERE id=?", t, tradeNo || null, buyer || null, raw || null, o.id);
      if (!db.get('SELECT 1 x FROM users WHERE id = ?', o.user_id)) { log.error(`[pay] 账号已注销，订单 ${outTradeNo} 需人工处理`); return db.get('SELECT * FROM orders WHERE id = ?', o.id); }
      if (CREDIT_COL[o.product]) db.run(`UPDATE users SET ${CREDIT_COL[o.product]} = ${CREDIT_COL[o.product]} + ? WHERE id = ?`, o.qty, o.user_id);
      else addMemberDays(o.user_id, o.days);
      log.info(`[pay] 已到账 ${outTradeNo} user=${o.user_id} ${o.product} ${CREDIT_COL[o.product] ? '+' + o.qty : '+' + o.days + 'd'}`);
      return db.get('SELECT * FROM orders WHERE id = ?', o.id);
    });
  }
  async function syncOrder(o, force) {
    if (!alipay || o.status !== 'pending') return o;
    const t = nowIso();
    const expired = o.expires_at < t;
    if (!force && !expired && o.last_query_at && new Date(t) - new Date(o.last_query_at) < 3000) return o;
    db.run('UPDATE orders SET last_query_at = ? WHERE id = ?', t, o.id);
    try {
      const q = await alipay.query(o.out_trade_no);
      if (q.exists && (q.status === 'TRADE_SUCCESS' || q.status === 'TRADE_FINISHED')) {
        return grant(o.out_trade_no, { tradeNo: q.tradeNo, buyer: q.buyer, amount: q.amount });
      }
      if (expired) {
        await alipay.cancel(o.out_trade_no).catch(() => false);
        db.run("UPDATE orders SET status='closed', closed_at=? WHERE id=? AND status='pending'", t, o.id);
      }
    } catch (e) {
      log.error(`[pay] 查单失败 ${o.out_trade_no}: ${e.message}`);
      if (expired && new Date(t) - new Date(o.expires_at) > 30 * 60000) db.run("UPDATE orders SET status='closed', closed_at=? WHERE id=? AND status='pending'", t, o.id);
    }
    return db.get('SELECT * FROM orders WHERE id = ?', o.id);
  }
  const qrSvg = (text) => {
    const qr = qrcode(0, 'M');
    qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  };
  const orderOut = (o, withQr) => ({
    outTradeNo: o.out_trade_no, amountCents: o.amount_cents, days: o.days, subject: o.subject, status: o.status,
    product: o.product, productName: PRODUCT_NAME[o.product] || o.product, qty: o.qty,
    createdAt: o.created_at, expiresAt: o.expires_at, paidAt: o.paid_at,
    ...(withQr && o.status === 'pending' ? { qr: o.qr_code, qrSvg: qrSvg(o.qr_code) } : {}),
  });

  // ----- 日历 -----
  function calendarFor(birth, xi, q) {
    const y = parseInt(q.get('y'), 10), m = parseInt(q.get('m'), 10);
    if (!(y >= 1901 && y <= 2099 && m >= 1 && m <= 12)) throw bad('月份不对');
    const today = /^\d{4}-\d{2}-\d{2}$/.test(q.get('today') || '') ? q.get('today') : bjDay();
    return calendar(chart(birth, xi, engineVer()), y, m, today);
  }

  const birthOf = (u) => ({ date: u.birth_date, time: u.birth_time, gender: u.gender, city: u.birth_city, lng: u.birth_lng, tz: u.birth_tz, zhi: u.birth_zhi });
  const xiOf = (u) => (u.xi_override ? JSON.parse(u.xi_override) : null);
  // 打分规则版本：后台「设置」里的 engine（v1 / v2），发起人审过对比后再切
  const engineVer = () => (settings.get('engine') === 'v2' ? 'v2' : 'v1');
  const chartOf = (u) => chart(birthOf(u), xiOf(u), engineVer());
  // 客户端按设备时区传「今天」，只接受前后两天内的日期
  function validDay(s) {
    const d = String(s || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return bjDay();
    const t = Date.parse(d + 'T12:00:00Z');
    if (isNaN(t) || Math.abs(t - Date.now()) > 2.5 * DAY_MS) throw bad('日期不对');
    return d;
  }
  // 今天页一次拿全：大家的今天、你的今天、今日一句、穿搭、签、今天的计划、未来 7 天
  // 今天页顶上的一周（周一到周日）：每天的完整数据、今日一句、通用黄历，用来滑动看前后几天
  const ymd = (dt) => dt.toISOString().slice(0, 10);
  function weekStrip(c, date) {
    const [y, m, d] = date.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d)), dow = (base.getUTCDay() + 6) % 7;
    const days = [];
    for (let k = 0; k < 7; k++) {
      const dt = new Date(Date.UTC(y, m - 1, d - dow + k)), [a, b, e] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
      const x = dayOut(c, a, b, e, true);
      days.push({ date: ymd(dt), day: x, line: C.dailyLine(c, x), almanac: almanac(a, b, e), luck: C.outfit(c, x).colors });
    }
    return { start: days[0].date, days };
  }
  // 两个人一起做事最合适的一天：未来两周里，两人分数里较低的那个最高的一天（两人都不差）
  function pairBest(cA, cB) {
    const [y, m, d] = bjDay().split('-').map(Number);
    let best = null;
    for (let k = 1; k <= 14; k++) {
      const dt = new Date(Date.UTC(y, m - 1, d + k)), a = dt.getUTCFullYear(), b = dt.getUTCMonth() + 1, e = dt.getUTCDate();
      const x = dayOut(cA, a, b, e, false), z = dayOut(cB, a, b, e, false), sc = Math.min(x.score, z.score);
      if (!best || sc > best.sc) best = { sc, date: ymd(dt), m: b, d: e, week: dt.getUTCDay() };
    }
    return { date: best.date, m: best.m, d: best.d, week: best.week };
  }
  // 明天寄语：明天的主题、档位、最好的时段，和一句今晚能做的准备话
  function tomorrowOf(c, date) {
    const [y, m, d] = date.split('-').map(Number);
    const nx = new Date(Date.UTC(y, m - 1, d + 1)), tx = dayOut(c, nx.getUTCFullYear(), nx.getUTCMonth() + 1, nx.getUTCDate(), true);
    const hours = bestHours(tx).top.map((h) => h.i);
    return { y: tx.y, m: tx.m, d: tx.d, ssG: tx.ssG, level: tx.level, score: tx.score, head: C.dailyLine(c, tx).head, hours, prep: C.tomorrowPrep(tx, THEME[tx.ssG][0], hours[0] != null ? hhShort(hours[0]) : '') };
  }
  function todayFor(birth, xi, date, extra) {
    const [y, m, d] = date.split('-').map(Number);
    const c = chart(birth, xi, engineVer());
    const day = dayOut(c, y, m, d, true);
    const week = calendar(c, y, m, date).week;
    return {
      date, almanac: almanac(y, m, d), chart: c, card: C.energyCard(c), day, week, arts: C.arts,
      line: C.dailyLine(c, day), outfit: C.outfit(c, day), strip: weekStrip(c, date), tomorrow: tomorrowOf(c, date), ...extra,
    };
  }
  // 往前往后能翻多远
  function stripDay(q) {
    const s = String(q.get('date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s)) || Math.abs(Date.parse(s + 'T12:00:00Z') - Date.now()) > 400 * DAY_MS) throw bad('日期不对');
    return s;
  }

  // ----- 校验 -----
  // 出生信息：公历或农历日期、时间、出生城市（换算真太阳时）、时辰交界时选的时辰。needGender=false 用于填写中的预览
  function validBirth(b, needGender = true) {
    const cal = b?.cal === 'lunar' ? 'lunar' : 'solar';
    let date = String(b?.date || '');
    if (cal === 'lunar') {
      const l = b.lunar || {};
      const r = lunarToSolar(parseInt(l.y, 10), parseInt(l.m, 10), parseInt(l.d, 10), !!l.leap);
      if (r.error) throw bad(r.error);
      date = r.date;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || date < '1901-02-20' || date > bjDay()) throw bad('请填写正确的出生日期');
    let time = b?.time ? String(b.time) : null;
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw bad('出生时间格式不对');
    const gender = b?.gender === '男' ? '男' : b?.gender === '女' ? '女' : null;
    if (!gender && needGender) throw bad('请选择性别');
    const c = b?.city ? cityByName(b.city) : null;
    if (b?.city && !c) throw bad('没找到这个城市，请从列表里选一个');
    const zhi = b?.zhi && ZHI.includes(b.zhi) ? b.zhi : null;
    return { date, time, gender, cal, city: c ? c.name : null, lng: c ? c.lng : null, tz: c ? c.tz : null, zhi };
  }
  const birthCols = (b) => [b.date, b.time, b.gender, b.cal, b.city, b.lng, b.tz, b.zhi];
  function validUsername(s) {
    const u = String(s || '').trim();
    if (!/^[\p{Script=Han}A-Za-z0-9_]{3,20}$/u.test(u)) throw bad('用户名需 3–20 位，可用中文、字母、数字和下划线');
    return u;
  }
  function validPassword(s) {
    const p = String(s || '');
    if (p.length < 8) throw bad('密码至少 8 位');
    if (p.length > 72) throw bad('密码太长');
    return p;
  }

  // ---------- 路由 ----------
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };

  // 账号
  route('POST', '/api/auth/register', async ({ req, res, body, ip }) => {
    if (!limit('reg:' + ip, 10, 3600000)) throw new HttpError(429, '注册太频繁，请稍后再试');
    if (!body.agree) throw bad('请先阅读并同意用户协议和娱乐声明');
    const username = validUsername(body.username);
    const password = validPassword(body.password);
    if (db.get('SELECT 1 x FROM users WHERE username = ?', username)) throw bad('这个用户名已经被用了');
    // 访客先看过能量卡的，把当时填的出生信息一起带进来
    const b = body.birth ? validBirth(body.birth) : null;
    const nickname = str(body.nickname, 12, '称呼');
    const r = db.run('INSERT INTO users(username, pass_hash, nickname, birth_date, birth_time, gender, birth_cal, birth_city, birth_lng, birth_tz, birth_zhi, invite_code, created_at, last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      username, hashPassword(password), nickname, ...(b ? birthCols(b) : [null, null, null, 'solar', null, null, null, null]), newInviteCode(), nowIso(), nowIso());
    const uid = Number(r.lastInsertRowid);
    newSession(res, 'user', uid);
    linkInvite(uid, body.invite, body.anonId);
    return { ok: true };
  });
  route('POST', '/api/auth/login', async ({ res, body, ip }) => {
    if (!limit('login:' + ip, 50, 15 * 60000)) throw new HttpError(429, '尝试太频繁，请稍后再试');
    const u = db.get('SELECT * FROM users WHERE username = ?', String(body.username || '').trim());
    if (!u) throw bad('用户名或密码不对');
    if (u.locked_until && u.locked_until > nowIso()) {
      const mins = Math.ceil((new Date(u.locked_until) - Date.now()) / 60000);
      throw bad(`密码错误次数太多，请 ${mins} 分钟后再试`);
    }
    if (!checkPassword(String(body.password || ''), u.pass_hash)) {
      const n = u.failed_logins + 1;
      if (n >= 5) {
        db.run('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?', addMs(nowIso(), 15 * 60000), u.id);
        throw bad('密码连续错误 5 次，账号锁定 15 分钟');
      }
      db.run('UPDATE users SET failed_logins = ? WHERE id = ?', n, u.id);
      throw bad(`用户名或密码不对，还可以再试 ${5 - n} 次`);
    }
    if (u.status !== 'active') throw bad('这个账号已被停用，如有疑问请联系我们');
    db.run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_seen_at = ? WHERE id = ?', nowIso(), u.id);
    newSession(res, 'user', u.id);
    return { ok: true };
  });
  route('POST', '/api/auth/logout', async ({ req, res }) => {
    const s = sessionOf(req, 'user');
    if (s) db.run('DELETE FROM sessions WHERE token_hash = ?', s.token_hash);
    setCookie(res, 'lrl_sid', '', 0);
    return { ok: true };
  });
  route('POST', '/api/auth/password', async ({ req, body }) => {
    const u = requireUser(req);
    if (!checkPassword(String(body.old || ''), u.pass_hash)) throw bad('当前密码不对');
    const pw = validPassword(body.password);
    const s = sessionOf(req, 'user');
    db.run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(pw), u.id);
    db.run("DELETE FROM sessions WHERE kind='user' AND user_id = ? AND token_hash != ?", u.id, s.token_hash);
    return { ok: true };
  });
  route('POST', '/api/auth/forgot', async ({ body, ip, req }) => {
    if (!limit('forgot:' + ip, 5, 3600000)) throw new HttpError(429, '提交太频繁，请稍后再试');
    const username = str(body.username, 20, '用户名');
    const contact = str(body.contact, 50, '联系方式');
    if (!username) throw bad('请填写用户名');
    if (!contact) throw bad('请留下微信或手机号，方便我们联系你');
    const note = str(body.note, 300, '补充说明');
    const u = db.get('SELECT id FROM users WHERE username = ?', username);
    db.run('INSERT INTO feedback(user_id, username, type, content, contact, meta, created_at) VALUES(?,?,?,?,?,?,?)',
      u ? u.id : null, username, '找回密码', note || '申请重置密码', contact, JSON.stringify({ ua: req.headers['user-agent'] || '', found: !!u }), nowIso());
    return { ok: true };
  });

  // 填出生信息时的实时预览：农历换算、真太阳时、是否落在时辰交界
  route('POST', '/api/birth/preview', async ({ body, ip }) => {
    if (!limit('bprev:' + ip, 600, 3600000)) throw new HttpError(429, '操作太频繁，请稍后再试');
    const b = validBirth(body.birth, false);
    const r = resolveBirth(b);
    return { date: b.date, lunar: solarToLunar(b.date), city: b.city, lng: b.lng, tz: b.tz, solar: r.solar, edge: r.edge };
  });
  route('GET', '/api/lunar/months', async ({ q }) => {
    const y = parseInt(q.get('y'), 10);
    if (!(y >= 1901 && y <= 2099)) throw bad('年份不对');
    return { y, months: lunarMonths(y) };
  });
  route('GET', '/api/cities', async ({ q }) => ({ list: searchCities(q.get('q')).map((c) => ({ name: c.name, province: c.province, lng: c.lng })) }));

  route('GET', '/api/health', async () => {
    db.get('SELECT 1 x');
    return { ok: true, pay: !!alipay };
  });

  // 我
  route('GET', '/api/me', async ({ req }) => {
    const u = currentUser(req);
    if (!u) return { user: null, ...priceInfo(), planTypes: C.pick.types.map((t) => ({ name: t.name, char: t.char })) };
    db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', nowIso(), u.id);
    inviteCodeOf(u);
    return { user: publicUser(db.get('SELECT * FROM users WHERE id = ?', u.id)), access: access(u), unread: unreadCount(u), ...priceInfo(), planTypes: C.pick.types.map((t) => ({ name: t.name, char: t.char })) };
  });
  route('PUT', '/api/me/profile', async ({ req, body }) => {
    const u = requireUser(req);
    const nickname = str(body.nickname, 12, '称呼');
    const bio = str(body.bio, 100, '简介');
    const b = validBirth(body.birth);
    const birthChanged = b.date !== u.birth_date || (b.time || null) !== (u.birth_time || null) || b.city !== (u.birth_city || null) || b.zhi !== (u.birth_zhi || null);
    db.run(`UPDATE users SET nickname=?, bio=?, birth_date=?, birth_time=?, gender=?, birth_cal=?, birth_city=?, birth_lng=?, birth_tz=?, birth_zhi=?${birthChanged ? ', xi_override=NULL' : ''} WHERE id=?`, nickname, bio, ...birthCols(b), u.id);
    return { user: publicUser(db.get('SELECT * FROM users WHERE id = ?', u.id)) };
  });
  route('PUT', '/api/me/settings', async ({ req, body }) => {
    const u = requireUser(req);
    if ('proMode' in body) db.run('UPDATE users SET pro_mode = ? WHERE id = ?', body.proMode ? 1 : 0, u.id);
    if ('xiOverride' in body) {
      const x = body.xiOverride;
      if (x === null) db.run('UPDATE users SET xi_override = NULL WHERE id = ?', u.id);
      else {
        const ok = (a) => Array.isArray(a) && a.length <= 5 && a.every((i) => Number.isInteger(i) && i >= 0 && i < 5);
        if (!ok(x.xi) || !ok(x.ji)) throw bad('设置格式不对');
        db.run('UPDATE users SET xi_override = ? WHERE id = ?', JSON.stringify({ xi: [...new Set(x.xi)], ji: [...new Set(x.ji)] }), u.id);
      }
    }
    return { user: publicUser(db.get('SELECT * FROM users WHERE id = ?', u.id)) };
  });

  // 日历
  route('GET', '/api/calendar', async ({ req, q }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const a = access(u);
    if (a.mode === 'blocked') throw new HttpError(402, '免费体验已用完', { error: 'paywall', access: a, ...priceInfo() });
    recordUse(u);
    const cal = calendarFor(birthOf(u), xiOf(u), q);
    const ym = `${cal.y}-${String(cal.m).padStart(2, '0')}`;
    const ratings = db.all('SELECT day, score, note FROM ratings WHERE user_id = ? AND day LIKE ?', u.id, ym + '-%').map((r) => ({ d: +r.day.slice(8), score: r.score, note: r.note }));
    const moods = db.all('SELECT * FROM moods WHERE user_id = ? AND day LIKE ? ORDER BY id', u.id, ym + '-%').map((r) => ({ ...moodOut(r), d: +r.day.slice(8) }));
    return { ...cal, access: a, plans: plansOf(u, cal.chart), name: u.nickname, ratings, moods, moodKit: moodKit() };
  });
  route('GET', '/api/demo/calendar', async ({ q }) => {
    return { ...calendarFor(DEMO_BIRTH, null, q), plans: [], name: DEMO_NAME, demo: true };
  });

  // 能量卡：访客不用注册就能看（不保存），登录用户看自己的
  route('POST', '/api/preview/card', async ({ body, ip }) => {
    if (!limit('preview:' + ip, 30, 3600000)) throw new HttpError(429, '操作太频繁，请稍后再试');
    const c = chart(validBirth(body.birth));
    return { card: C.energyCard(c), nickname: str(body.nickname, 12, '称呼') };
  });
  // 我的一甲子：收下了哪些日柱的画，各是哪天收下的
  route('GET', '/api/jiazi', async ({ req }) => {
    const u = requireUser(req);
    const got = jiaziOf(u);
    return { list: [...got].map(([gz, day]) => ({ gz, day })), n: got.size, done: !!u.jiazi_done, member: access(u).mode !== 'blocked', today: dayGz(bjDay()), arts: C.arts };
  });
  route('GET', '/api/me/card', async ({ req }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    return { card: C.energyCard(chartOf(u)), nickname: u.nickname };
  });

  // 今天
  route('GET', '/api/today', async ({ req, q }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const date = validDay(q.get('date'));
    const [y, m, d] = date.split('-').map(Number);
    // 收画和会员无关：体验用完、会员到期也照样收下今天的画
    const fresh = recordOpen(u), got = jiaziOf(u), gz = dayGz(date);
    const jiazi = { n: got.size, has: got.has(gz), fresh: fresh && got.get(gz) === bjDay(), reward: jiaziReward(u, got.size) };
    // 撕日历：每天第一次打开，先撕掉昨天那一页
    const yd = new Date(Date.UTC(y, m - 1, d - 1)), prev = almanac(yd.getUTCFullYear(), yd.getUTCMonth() + 1, yd.getUTCDate());
    const a = access(u);
    if (a.mode === 'blocked') throw new HttpError(402, '免费体验已用完', { error: 'paywall', access: a, almanac: almanac(y, m, d), art: { gz, ...C.arts[gz] }, jiazi, prev, ...priceInfo() });
    recordUse(u);
    activateInvite(u);
    const drawn = db.get('SELECT * FROM draws WHERE user_id = ? AND day = ?', u.id, date);
    const t = todayFor(birthOf(u), xiOf(u), date, { access: access(db.get('SELECT * FROM users WHERE id = ?', u.id)), name: u.nickname });
    t.plans = plansOf(u, t.chart);
    t.draw = drawOut(drawn, t.day.level.k);
    t.jiao = jiaoText();
    t.rate = rateInfo(u, t.chart, date);
    t.moods = moodsOn(u, date);
    t.moodKit = moodKit();
    t.jiazi = jiazi;
    t.prev = prev;
    t.luck = { unused: unusedDeeds(u), per: C.luck.deeds.per_amulet, energy: energyHave(u), energyPer: C.luck.energy.per_amulet_minutes };
    withMoods(u, t.strip);
    t.news = newsFor(u);
    return t;
  });
  // 今天页滑到别的周：那一周 7 天的数据
  route('GET', '/api/week', async ({ req, q }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const a = access(u);
    if (a.mode === 'blocked') throw new HttpError(402, '免费体验已用完', { error: 'paywall', access: a, ...priceInfo() });
    return withMoods(u, weekStrip(chart(birthOf(u), xiOf(u), engineVer()), stripDay(q)));
  });
  route('GET', '/api/demo/week', async ({ q }) => weekStrip(chart(DEMO_BIRTH, null, engineVer()), stripDay(q)));
  route('GET', '/api/demo/today', async ({ q }) => {
    return todayFor(DEMO_BIRTH, null, validDay(q.get('date')), { name: DEMO_NAME, demo: true, plans: [], draw: null });
  });
  // ----- 每日一签：默念所求 → 摇签（先只知道签号）→ 掷筊向神明确认 → 解签 -----
  // status：pending 摇出了签、还没掷出圣杯；done 圣杯，签文可以看；
  // reask 连续 max_tries 次都是阴杯，换个问题重新摇（一天最多 max_rounds 轮）；closed 掷满了没有圣杯，今天不能再求
  const J = C.jiao;
  const jiaoText = () => ({ steps: J.steps, intro: J.intro, drawn: J.drawn, rules: J.rules, results: J.results, giveUp: J.give_up, reask: J.reask, roundsOut: J.rounds_out, maxTries: J.max_tries, maxRounds: J.max_rounds });
  function drawOut(r, level) {
    if (!r) return null;
    const tosses = JSON.parse(r.tosses || '[]');
    if (r.status === 'done') return { status: 'done', ...C.lot(r.lot_no, level, topicOf(r)), question: r.question, tosses, round: r.rounds };
    return { status: r.status, no: r.lot_no, question: r.question, tosses, round: r.rounds, roundsLeft: Math.max(0, J.max_rounds - r.rounds) };
  }
  // 问的是哪类事：从问题里认，认出来的那类在解签里排第一
  const topicOf = (r) => C.lotTopicOf(r.question);
  const drawGate = (u) => {
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const a = access(u);
    if (a.mode === 'blocked') throw new HttpError(402, '免费体验已用完', { error: 'paywall', access: a, ...priceInfo() });
  };
  const levelOn = (u, date) => { const [y, m, d] = date.split('-').map(Number); return dayOut(chartOf(u), y, m, d, false).level.k; };
  // 摇签：每人每天一支，当天不变；摇出来先是 pending，要掷筊确认
  route('POST', '/api/draws/today', async ({ req, body }) => {
    const u = requireUser(req);
    drawGate(u);
    const date = validDay(body.date);
    const question = str(body.question, 30, '所问之事');
    const old = db.get('SELECT * FROM draws WHERE user_id = ? AND day = ?', u.id, date);
    // 三次都是阴杯：换个问题重新摇一支（签号跟着轮次变）
    if (old && old.status === 'reask') {
      if (old.rounds >= J.max_rounds) throw new HttpError(409, J.rounds_out);
      if (!question || question === old.question) throw bad('换个问题再求，写下新的问题');
      const round = old.rounds + 1;
      db.run("UPDATE draws SET lot_no = ?, question = ?, status = 'pending', tosses = '[]', rounds = ? WHERE user_id = ? AND day = ?", C.lotNumber(u.id, `${date}#${round}`), question, round, u.id, date);
    } else db.run("INSERT OR IGNORE INTO draws(user_id, day, lot_no, question, status, tosses, created_at) VALUES(?,?,?,?,'pending','[]',?)", u.id, date, C.lotNumber(u.id, date), question, nowIso());
    const r = db.get('SELECT * FROM draws WHERE user_id = ? AND day = ?', u.id, date);
    return { draw: drawOut(r, levelOn(u, date)) };
  });
  // 掷筊：结果由服务器定，按两块筊杯各自正反一半的概率：圣杯 1/2，笑杯 1/4，阴杯 1/4
  route('POST', '/api/draws/today/toss', async ({ req, body }) => {
    const u = requireUser(req);
    drawGate(u);
    const date = validDay(body.date);
    const r = db.get('SELECT * FROM draws WHERE user_id = ? AND day = ?', u.id, date);
    if (!r) throw bad('先摇一支签');
    if (r.status !== 'pending') return { toss: null, draw: drawOut(r, levelOn(u, date)) };
    const question = 'question' in body ? str(body.question, 30, '所问之事') : r.question;
    const before = JSON.parse(r.tosses || '[]');
    // 本地开发和浏览器走查用：JIAO_FAKE=xiao,sheng 表示第 1 次笑杯、第 2 次圣杯，依此类推。线上不要设
    const fake = (process.env.JIAO_FAKE || '').split(',').filter((x) => ['sheng', 'xiao', 'yin'].includes(x));
    const faces = [crypto.randomInt(2), crypto.randomInt(2)];
    const toss = fake.length ? fake[before.length % fake.length] : faces[0] !== faces[1] ? 'sheng' : faces[0] ? 'xiao' : 'yin';
    const tosses = [...before, toss];
    const status = toss === 'sheng' ? 'done' : tosses.length < J.max_tries ? 'pending'
      : tosses.every((x) => x === 'yin') ? (r.rounds < J.max_rounds ? 'reask' : 'closed') : 'closed';
    db.run('UPDATE draws SET tosses = ?, status = ?, question = ? WHERE user_id = ? AND day = ?', JSON.stringify(tosses), status, question, u.id, date);
    return { toss, draw: drawOut(db.get('SELECT * FROM draws WHERE user_id = ? AND day = ?', u.id, date), levelOn(u, date)) };
  });
  // 签谱：抽过的签都在这里，可以回看
  route('GET', '/api/draws', async ({ req }) => {
    const u = requireUser(req);
    return { list: db.all("SELECT day, lot_no, question FROM draws WHERE user_id = ? AND status = 'done' ORDER BY day DESC LIMIT 200", u.id).map((r) => ({ day: r.day, question: r.question, ...C.lot(r.lot_no, 0, topicOf(r)) })) };
  });

  // 埋点：批量上报，失败不影响使用
  route('POST', '/api/events', async ({ req, body, ip }) => {
    if (!limit('ev:' + ip, 600, 3600000)) return { ok: false };
    const u = currentUser(req);
    const list = Array.isArray(body.events) ? body.events.slice(0, 30) : [];
    const anon = String(body.anonId || '').slice(0, 64);
    for (const e of list) {
      const name = String(e?.name || '');
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(name)) continue;
      db.run('INSERT INTO events(user_id, anon_id, name, props, created_at) VALUES(?,?,?,?,?)', u ? u.id : null, anon, name, JSON.stringify(e.props && typeof e.props === 'object' ? e.props : {}).slice(0, 1000), nowIso());
    }
    return { ok: true };
  });

  // 计划
  // 挑日子：给一件事在一段时间里挑 3 个合适的日子
  route('POST', '/api/pick', async ({ req, body }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const a = access(u);
    if (a.mode === 'blocked') throw new HttpError(402, '免费体验已用完', { error: 'paywall', access: a, ...priceInfo() });
    const type = C.pickType(body.type);
    if (!type) throw bad('请选一类事');
    const range = ['month', '1m', '3m'].includes(body.range) ? body.range : '1m';
    return { type: type.name, range, ...pickDays(chartOf(u), type, C.pick.all_ji, validDay(body.today), range) };
  });
  const planFields = (body, partial) => {
    const f = {};
    if (!partial || 'name' in body) f.name = str(body.name, 20, '计划名称') || (C.pickType(body.type) ? body.type : '');
    if (!partial || 'type' in body) { if (!C.pickType(body.type)) throw bad('计划类型不对'); f.type = body.type; }
    if (!partial || 'date' in body) { f.date = body.date == null ? null : planDate(body.date); if (body.date != null && !f.date) throw bad('日期格式不对'); }
    if (!partial || 'hour' in body) { const h = body.hour == null ? null : parseInt(body.hour, 10); if (h != null && !(h >= 0 && h <= 11)) throw bad('时段不对'); f.hour = h; }
    if (!partial || 'reason' in body) f.reason = str(body.reason, 120, '理由');
    return f;
  };
  route('POST', '/api/plans', async ({ req, body }) => {
    const u = requireUser(req);
    const f = planFields(body, false);
    if (!f.name) throw bad('写一下要做什么事');
    if (db.get('SELECT COUNT(*) n FROM plans WHERE user_id = ?', u.id).n >= 50) throw bad('计划太多了，先删掉一些吧');
    const r = db.run('INSERT INTO plans(user_id, name, type, date, hour, reason, created_at) VALUES(?,?,?,?,?,?,?)', u.id, f.name, f.type, f.date, f.hour, f.reason, nowIso());
    return { plan: db.get('SELECT id, name, type, date, hour, reason FROM plans WHERE id = ?', Number(r.lastInsertRowid)) };
  });
  route('PUT', '/api/plans/:id', async ({ req, body, params }) => {
    const u = requireUser(req);
    const f = planFields(body, true);
    const keys = Object.keys(f);
    if (!keys.length) return { ok: true };
    const r = db.run(`UPDATE plans SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ? AND user_id = ?`, ...keys.map((k) => f[k]), Number(params.id), u.id);
    if (!r.changes) throw new HttpError(404, '计划不存在');
    return { ok: true };
  });
  route('DELETE', '/api/plans/:id', async ({ req, params }) => {
    const u = requireUser(req);
    db.run('DELETE FROM plans WHERE id = ? AND user_id = ?', Number(params.id), u.id);
    return { ok: true };
  });

  // ----- 问事 -----
  // 起卦和倾向由规则算好并立刻返回；白话解读交给 AI 在后台写，页面轮询。AI 两次都失败就退回次数，稍后再自动重试。
  const monthStartIso = () => new Date(Date.parse(bjDay().slice(0, 8) + '01T00:00:00+08:00')).toISOString();
  function askQuota(u) {
    const a = access(u);
    const member = a.mode === 'member';
    const used = db.get(`SELECT COUNT(*) n FROM asks WHERE user_id = ? AND charge = 'free'${member ? ' AND created_at >= ?' : ''}`, ...(member ? [u.id, monthStartIso()] : [u.id])).n;
    const allowance = a.mode === 'blocked' ? 0 : member ? settings.int('ask_free_monthly') : 1;
    return { mode: a.mode, free: Math.max(0, allowance - used), credits: u.ask_credits || 0, priceCents: settings.int('ask_price_cents'), ready: AI.enabled };
  }
  const qkeyOf = (q) => q.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  // 追问和回看：次数、天数、回看选项都在 content/ask.json 的 follow 里
  const FO = C.ask.follow;
  const bjAfter = (iso, days) => bjDay(new Date(Date.parse(iso) + days * DAY_MS));
  const outcomeOf = (key) => C.ask.follow.outcomes.find((o) => o.key === key) || null;
  function reviewOf(a) {
    const dueDay = bjAfter(a.created_at, FO.review_days), today = bjDay();
    const o = a.outcome && a.outcome !== 'dismiss' ? outcomeOf(a.outcome) : null;
    return {
      dueDay, due: a.status === 'done' && today >= dueDay,
      outcome: o ? { key: o.key, text: o.text } : null, note: a.outcome_note || '', reviewedAt: a.reviewed_at || null,
      // 今天页要不要提醒：到了日子、还没回看也没点过“不用了”、没过提醒期
      remind: a.status === 'done' && !a.outcome && today >= dueDay && today <= bjAfter(a.created_at, FO.review_days + FO.review_window),
    };
  }
  const askOut = (a) => ({
    id: a.id, question: a.question, category: a.category, gua: JSON.parse(a.gua), days: JSON.parse(a.days),
    pickType: (C.ask.categories.find((x) => x.name === a.category) || {}).pick || null,
    status: a.status, reading: a.reading ? JSON.parse(a.reading) : null, createdAt: a.created_at, review: reviewOf(a),
  });
  const followOut = (f) => ({ id: f.id, question: f.question, status: f.status, reading: f.reading ? JSON.parse(f.reading) : null, createdAt: f.created_at });
  // 失败的追问不算次数
  const followsOf = (a) => db.all('SELECT * FROM ask_follows WHERE ask_id = ? ORDER BY id', a.id);
  function followInfo(a, list = followsOf(a)) {
    const until = bjAfter(a.created_at, FO.days);
    const used = list.filter((f) => f.status !== 'failed').length;
    const open = a.status === 'done' && bjDay() <= until;
    return { max: FO.max, left: open ? Math.max(0, FO.max - used) : 0, until, open };
  }
  const askDetail = (a) => { const list = followsOf(a); return { ...askOut(a), follows: list.map(followOut), follow: followInfo(a, list) }; };
  function askPrompt(a) {
    const g = JSON.parse(a.gua), T = C.ask.trigrams;
    const tri = (x) => `${x.name}卦（${T[x.name].image}）`;
    const v = {
      question: a.question, category: a.category, time: g.cast.text, moving: g.moving, tendency: g.tendency, today: g.today || '',
      method: g.cast.method === 'time' ? '用问事那一刻的时间起卦' : `用户报了三个数 ${g.cast.nums.join('、')}`,
      ben: g.ben.name, ben_gist: g.ben.gist, hu: g.hu.name, hu_gist: g.hu.gist, bian: g.bian.name, bian_gist: g.bian.gist,
      ti: tri(g.ti), ti_wx: g.ti.wx, yong: tri(g.yong), yong_wx: g.yong.wx, bian_yong: tri(g.bianYong), bian_yong_wx: g.bianYong.wx,
      now_rel: `${g.now.rel}（${g.now.text}）`, later_rel: `${g.later.rel}（${g.later.text}）`,
      month: `${g.month.zhi}月（${g.month.wx}当令）`, ti_state: g.month.state,
    };
    return C.askPrompt.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? String(v[k]) : m));
  }
  const asking = new Set();
  function runAsk(id) {
    if (asking.has(id)) return;
    const a = db.get("SELECT * FROM asks WHERE id = ? AND status = 'pending'", id);
    if (!a) return;
    asking.add(id);
    db.run('UPDATE asks SET attempts = attempts + 1, tried_at = ? WHERE id = ?', nowIso(), id);
    AI.write(askPrompt(a)).then(({ reading, ms }) => {
      const r = checkReading(reading, C.ask.banned);
      db.run("UPDATE asks SET status = 'done', reading = ?, model = ?, ms = ?, done_at = ?, error = NULL WHERE id = ?", JSON.stringify(r), AI.model, ms, nowIso(), id);
    }).catch((e) => {
      const cur = db.get('SELECT attempts, charge, user_id FROM asks WHERE id = ?', id);
      if (!cur) return;
      if (cur.attempts % 2 === 1) { setTimeout(() => runAsk(id), 1500); return; } // 每轮失败自动再试一次
      db.tx(() => {
        db.run("UPDATE asks SET status = 'failed', error = ?, charge = 'none' WHERE id = ?", String(e.message).slice(0, 300), id);
        if (cur.charge === 'credit') db.run('UPDATE users SET ask_credits = ask_credits + 1 WHERE id = ?', cur.user_id);
      });
    }).finally(() => asking.delete(id));
  }
  function followPrompt(a, f) {
    const g = JSON.parse(a.gua), r = JSON.parse(a.reading);
    const prev = db.all("SELECT question, reading FROM ask_follows WHERE ask_id = ? AND id < ? AND status = 'done' ORDER BY id", a.id, f.id);
    const v = {
      question: a.question, category: a.category, tendency: g.tendency,
      ben: g.ben.name, ben_gist: g.ben.gist, hu: g.hu.name, hu_gist: g.hu.gist, bian: g.bian.name, bian_gist: g.bian.gist,
      now_rel: `${g.now.rel}（${g.now.text}）`, later_rel: `${g.later.rel}（${g.later.text}）`,
      reading: [r.headline, ...r.body, '建议：' + r.advice].join(' '),
      history: prev.length ? prev.map((p, i) => { const x = JSON.parse(p.reading); return `${i + 1}. 问：${p.question}\n   答：${x.answer}（建议：${x.advice}）`; }).join('\n') : '（没有）',
      follow: f.question,
    };
    return C.askFollowPrompt.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? String(v[k]) : m));
  }
  const following = new Set();
  function runFollow(id) {
    if (following.has(id)) return;
    const f = db.get("SELECT * FROM ask_follows WHERE id = ? AND status = 'pending'", id);
    const a = f && db.get("SELECT * FROM asks WHERE id = ? AND status = 'done'", f.ask_id);
    if (!a) return;
    following.add(id);
    db.run('UPDATE ask_follows SET attempts = attempts + 1, tried_at = ? WHERE id = ?', nowIso(), id);
    AI.write(followPrompt(a, f), 'follow').then(({ reading, ms }) => {
      const r = checkFollow(reading, C.ask.banned);
      db.run("UPDATE ask_follows SET status = 'done', reading = ?, model = ?, ms = ?, done_at = ?, error = NULL WHERE id = ?", JSON.stringify(r), AI.model, ms, nowIso(), id);
    }).catch((e) => {
      const cur = db.get('SELECT attempts FROM ask_follows WHERE id = ?', id);
      if (!cur) return;
      if (cur.attempts % 2 === 1) { setTimeout(() => runFollow(id), 1500); return; }
      db.run("UPDATE ask_follows SET status = 'failed', error = ? WHERE id = ?", String(e.message).slice(0, 300), id);
    }).finally(() => following.delete(id));
  }
  // 重启后把没写完的接着写
  setTimeout(() => {
    for (const a of db.all("SELECT id FROM asks WHERE status = 'pending'")) runAsk(a.id);
    for (const f of db.all("SELECT id FROM ask_follows WHERE status = 'pending'")) runFollow(f.id);
  }, 1000).unref?.();
  const refuseCheck = (question) => {
    for (const [kind, words] of Object.entries(C.ask.refuse)) {
      if (words.some((w) => question.includes(w))) throw new HttpError(400, C.ask.refuse_text.replace('{kind}', kind), { error: 'refused' });
    }
  };

  route('GET', '/api/asks/quota', async ({ req }) => {
    const u = requireUser(req);
    return { ...askQuota(u), categories: C.ask.categories.map((x) => x.name) };
  });
  route('GET', '/api/asks', async ({ req }) => {
    const u = requireUser(req);
    return { list: db.all('SELECT * FROM asks WHERE user_id = ? ORDER BY id DESC LIMIT 50', u.id).map((a) => { const o = askOut(a); return { id: o.id, question: o.question, category: o.category, tendency: o.gua.tendency, ben: o.gua.ben.name, status: o.status, createdAt: o.createdAt, outcome: o.review.outcome, remind: o.review.remind }; }) };
  });
  route('GET', '/api/asks/:id', async ({ req, params }) => {
    const u = requireUser(req);
    let a = db.get('SELECT * FROM asks WHERE id = ? AND user_id = ?', Number(params.id), u.id);
    if (!a) throw new HttpError(404, '没有这条问事记录');
    // 失败的过一会儿自动重来（最多再来两轮），不再扣次数
    if (a.status === 'failed' && a.attempts < 6 && Date.now() - Date.parse(a.tried_at || a.created_at) > 60000 && AI.enabled) {
      db.run("UPDATE asks SET status = 'pending' WHERE id = ?", a.id);
      runAsk(a.id);
      a = db.get('SELECT * FROM asks WHERE id = ?', a.id);
    }
    return { ask: askDetail(a), outcomes: FO.outcomes.map(({ key, text, hint }) => ({ key, text, hint })) };
  });
  // 追问：同一卦里再问细节，不重新起卦、不另收费；起卦后 FO.days 天内最多 FO.max 次
  route('POST', '/api/asks/:id/follows', async ({ req, body, params }) => {
    const u = requireUser(req);
    const a = db.get('SELECT * FROM asks WHERE id = ? AND user_id = ?', Number(params.id), u.id);
    if (!a) throw new HttpError(404, '没有这条问事记录');
    if (a.status !== 'done') throw new HttpError(409, '等解读写好了再追问');
    const question = str(body.question, 60, '追问');
    if (question.length < 2) throw bad('把想追问的写具体一点');
    refuseCheck(question);
    const info = followInfo(a);
    if (!info.open) throw new HttpError(409, `这一卦的追问到 ${info.until} 截止了，想问新情况可以另起一卦`, { error: 'follow_closed' });
    if (!info.left) throw new HttpError(409, `每一卦最多追问 ${FO.max} 次，想问新情况可以另起一卦`, { error: 'follow_used' });
    if (db.get("SELECT 1 x FROM ask_follows WHERE ask_id = ? AND status = 'pending'", a.id)) throw new HttpError(409, '上一个追问还在写，稍等一下');
    if (!limit('ask:' + u.id, 20, DAY_MS)) throw new HttpError(429, '今天问得有点多了，明天再来吧');
    const id = Number(db.run('INSERT INTO ask_follows(ask_id, user_id, question, created_at) VALUES(?,?,?,?)', a.id, u.id, question, nowIso()).lastInsertRowid);
    runFollow(id);
    return { ask: askDetail(db.get('SELECT * FROM asks WHERE id = ?', a.id)) };
  });
  // 回看：那件事后来怎样了。随时可以记，可以改；dismiss 表示“不用提醒了”
  route('POST', '/api/asks/:id/review', async ({ req, body, params }) => {
    const u = requireUser(req);
    const a = db.get('SELECT * FROM asks WHERE id = ? AND user_id = ?', Number(params.id), u.id);
    if (!a) throw new HttpError(404, '没有这条问事记录');
    if (a.status !== 'done') throw new HttpError(409, '等解读写好了再回看');
    const outcome = String(body.outcome || '');
    if (outcome !== 'dismiss' && !outcomeOf(outcome)) throw bad('选一下后来怎样了');
    const note = outcome === 'dismiss' ? a.outcome_note : str(body.note, 60, '一句话');
    if (outcome === 'dismiss' && a.outcome && a.outcome !== 'dismiss') return { ask: askDetail(a) };
    db.run('UPDATE asks SET outcome = ?, outcome_note = ?, reviewed_at = ? WHERE id = ?', outcome, note || '', nowIso(), a.id);
    return { ask: askDetail(db.get('SELECT * FROM asks WHERE id = ?', a.id)) };
  });
  route('POST', '/api/asks', async ({ req, body }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const question = str(body.question, 60, '问题');
    if (question.length < 4) throw bad('把想问的事写具体一点，至少 4 个字');
    const cat = C.ask.categories.find((x) => x.name === body.category);
    if (!cat) throw bad('选一下是哪方面的事');
    refuseCheck(question);
    let nums = null;
    if (body.method === 'nums') {
      nums = (Array.isArray(body.nums) ? body.nums : []).map((n) => parseInt(n, 10));
      if (nums.length !== 3 || nums.some((n) => !(n >= 1 && n <= 999))) throw bad('报三个 1 到 999 之间的数');
    }
    // 同一件事 24 小时内再问，直接给上次的结果
    const qkey = qkeyOf(question);
    const same = db.get('SELECT * FROM asks WHERE user_id = ? AND qkey = ? AND created_at >= ? ORDER BY id DESC LIMIT 1', u.id, qkey, addMs(nowIso(), -DAY_MS));
    if (same) return { ask: askDetail(same), repeat: true };
    const q = askQuota(u);
    if (q.mode === 'blocked') throw new HttpError(402, '免费体验已用完', { error: 'paywall', access: access(u), ...priceInfo() });
    if (!q.free && !q.credits) throw new HttpError(402, `本月的免费次数用完了，再问一次 ¥${(q.priceCents / 100).toFixed(1)}`, { error: 'need_pay', product: 'ask', priceCents: q.priceCents });
    if (!limit('ask:' + u.id, 20, DAY_MS)) throw new HttpError(429, '今天问得有点多了，明天再来吧');
    const c = chartOf(u), date = bjDay(), [y, m, d] = date.split('-').map(Number);
    const g = nums ? M.byNums(nums, Date.now()) : M.byTime(Date.now());
    const x = dayOut(c, y, m, d, false);
    g.today = `${THEME[x.ssG][0]} · ${x.level.p} ${x.score}`;
    // 接下来两周里最合适的两天，按日期排（问的多是眼前的事）
    const days = cat.pick ? pickDays(c, C.pickType(cat.pick), C.pick.all_ji, date, '2w').picks.slice(0, 2).sort((p, q) => Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(q.y, q.m - 1, q.d)) : [];
    const id = db.tx(() => {
      let charge = 'free';
      if (!q.free) {
        if (!db.run('UPDATE users SET ask_credits = ask_credits - 1 WHERE id = ? AND ask_credits > 0', u.id).changes) throw new HttpError(402, '次数不够了', { error: 'need_pay', product: 'ask', priceCents: q.priceCents });
        charge = 'credit';
      }
      return Number(db.run('INSERT INTO asks(user_id, question, qkey, category, gua, days, charge, created_at) VALUES(?,?,?,?,?,?,?,?)',
        u.id, question, qkey, cat.name, JSON.stringify(g), JSON.stringify(days), charge, nowIso()).lastInsertRowid);
    });
    runAsk(id);
    return { ask: askDetail(db.get('SELECT * FROM asks WHERE id = ?', id)) };
  });

  // ----- 转运御守 -----
  // 御守三种来路：攒够 5 件善行换一枚（善缘款）；冥想累计 20 分钟换一枚（静心款，释放练习每次也算几分钟）；
  // 或者直接买（转运款、节气款、生日款，¥3.9）。善缘款、静心款、转运款都用幸运元素的颜色。
  const CN_MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  function amuletInfo(u) {
    const today = bjDay(), month = today.slice(0, 7), m = +today.slice(5, 7);
    const term = termOf(today);
    const season = Object.entries(C.amulets.seasons).find(([, x]) => x.terms.includes(term))[0];
    return {
      month, monthCn: CN_MONTH[m - 1] + '月', term, season, element: WX[chartOf(u).xi[0]],
      birthdayMonth: !!u.birth_date && +u.birth_date.slice(5, 7) === m,
      basicTaken: !!db.get("SELECT 1 x FROM amulets WHERE user_id = ? AND month = ? AND style = 'basic'", u.id, month),
      credits: u.amulet_credits || 0, priceCents: settings.int('amulet_price_cents'),
    };
  }
  // 三种款式的样子：基础款用幸运元素的颜色；节气款按当月节气的季节换颜色和图案；生日款是金色
  function lookOf(style, info) {
    const A = C.amulets;
    const look = style === 'basic' || style === 'deed' || style === 'energy' ? { colors: A.element_colors[info.element], element: info.element }
      : style === 'term' ? { colors: A.seasons[info.season].colors, motif: A.seasons[info.season].motif, term: info.term }
        : { colors: A.birthday.colors, ink: A.birthday.ink, motif: 'star' };
    return { ...look, monthCn: info.monthCn };
  }
  const amuletOut = (a) => ({ id: a.id, month: a.month, wish: a.wish, way: a.way, minutes: a.minutes, style: a.style, look: JSON.parse(a.look), createdAt: a.created_at });
  route('GET', '/api/amulets', async ({ req }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const A = C.amulets, info = amuletInfo(u);
    return {
      ...info, mode: access(u).mode, wishes: A.wishes, minutes: A.minutes, breath: A.breath,
      looks: { basic: lookOf('basic', info), term: lookOf('term', info), birthday: lookOf('birthday', info) },
      list: db.all('SELECT * FROM amulets WHERE user_id = ? ORDER BY id DESC', u.id).map(amuletOut),
    };
  });
  const luckGate = (u) => {
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    if (access(u).mode === 'blocked') throw new HttpError(402, '免费体验已用完', { error: 'paywall', access: access(u), ...priceInfo() });
  };
  const wishOf = (name) => { const w = C.amulets.wishes.find((x) => x.name === name); if (!w) throw bad('选一个心愿'); return w; };
  // 直接买一枚：转运款（basic）、节气款、生日款
  route('POST', '/api/amulets', async ({ req, body }) => {
    const u = requireUser(req);
    luckGate(u);
    const info = amuletInfo(u), wish = wishOf(body.wish);
    if (!['basic', 'term', 'birthday'].includes(body.style)) throw bad('选一个款式');
    if (body.way && body.way !== 'buy') throw bad('御守现在靠做好事、提能量来换，也可以直接买一枚');
    const style = body.style;
    if (style === 'birthday' && !info.birthdayMonth) throw bad('生日款只在你的生日月才有');
    const look = lookOf(style, info);
    const id = db.tx(() => {
      if (!db.run('UPDATE users SET amulet_credits = amulet_credits - 1 WHERE id = ? AND amulet_credits > 0', u.id).changes) {
        throw new HttpError(402, `御守 ¥${(info.priceCents / 100).toFixed(1)} 一枚`, { error: 'need_pay', product: 'amulet', priceCents: info.priceCents });
      }
      return Number(db.run('INSERT INTO amulets(user_id, month, wish, way, minutes, style, look, created_at) VALUES(?,?,?,?,?,?,?,?)',
        u.id, info.month, wish.name, 'buy', 0, style, JSON.stringify(look), nowIso()).lastInsertRowid);
    });
    return { amulet: amuletOut(db.get('SELECT * FROM amulets WHERE id = ?', id)) };
  });
  // 做好事：记一件善行；攒够 per_amulet 件换一枚善缘款
  const LK = C.luck;
  const deedOut = (r) => ({ id: r.id, day: r.day, text: r.text, used: !!r.amulet_id, createdAt: r.created_at });
  const unusedDeeds = (u) => db.get('SELECT COUNT(*) n FROM deeds WHERE user_id = ? AND amulet_id IS NULL', u.id).n;
  function deedInfo(u) {
    return {
      per: LK.deeds.per_amulet, dailyMax: LK.deeds.daily_max, maxLen: LK.deeds.max_len, examples: LK.deeds.examples,
      unused: unusedDeeds(u), today: db.get('SELECT COUNT(*) n FROM deeds WHERE user_id = ? AND day = ?', u.id, bjDay()).n,
      total: db.get('SELECT COUNT(*) n FROM deeds WHERE user_id = ?', u.id).n,
      list: db.all('SELECT * FROM deeds WHERE user_id = ? ORDER BY id DESC LIMIT 30', u.id).map(deedOut),
    };
  }
  // 能量：练习累计的分钟数减去已经换掉的（换的时候记在那枚御守的 minutes 上）
  const energyHave = (u) => db.get('SELECT COALESCE(SUM(minutes), 0) n FROM practices WHERE user_id = ?', u.id).n
    - db.get("SELECT COALESCE(SUM(minutes), 0) n FROM amulets WHERE user_id = ? AND way = 'energy'", u.id).n;
  function practiceInfo(u) {
    const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
    const n = (kind, from) => db.get('SELECT COUNT(*) n FROM practices WHERE user_id = ? AND kind = ? AND created_at >= ?', u.id, kind, from).n;
    return {
      week: { meditate: n('meditate', since), release: n('release', since) }, total: { meditate: n('meditate', ''), release: n('release', '') },
      have: energyHave(u), per: LK.energy.per_amulet_minutes, releaseMinutes: LK.energy.release_minutes,
    };
  }
  route('GET', '/api/luck', async ({ req }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const A = C.amulets, info = amuletInfo(u);
    return {
      mode: access(u).mode, deeds: deedInfo(u), practice: practiceInfo(u), release: LK.release,
      meditate: { minutes: A.minutes, breath: A.breath },
      amulets: {
        count: db.get('SELECT COUNT(*) n FROM amulets WHERE user_id = ?', u.id).n, wishes: A.wishes, monthCn: info.monthCn,
        credits: info.credits, priceCents: info.priceCents, birthdayMonth: info.birthdayMonth, term: info.term,
        looks: { deed: lookOf('deed', info), energy: lookOf('energy', info), basic: lookOf('basic', info), term: lookOf('term', info), birthday: lookOf('birthday', info) },
      },
    };
  });
  route('POST', '/api/deeds', async ({ req, body }) => {
    const u = requireUser(req);
    luckGate(u);
    const text = str(body.text, LK.deeds.max_len, '这件好事');
    if (text.length < 2) throw bad('写一句做了什么好事');
    const day = bjDay();
    if (db.get('SELECT COUNT(*) n FROM deeds WHERE user_id = ? AND day = ?', u.id, day).n >= LK.deeds.daily_max) throw new HttpError(409, `一天最多记 ${LK.deeds.daily_max} 件，明天再来`);
    db.run('INSERT INTO deeds(user_id, day, text, created_at) VALUES(?,?,?,?)', u.id, day, text, nowIso());
    return { deeds: deedInfo(u) };
  });
  route('DELETE', '/api/deeds/:id', async ({ req, params }) => {
    const u = requireUser(req);
    const r = db.get('SELECT * FROM deeds WHERE id = ? AND user_id = ?', Number(params.id), u.id);
    if (!r) throw new HttpError(404, '这条善行不在了');
    if (r.amulet_id) throw bad('这件已经换成御守了，不能删');
    db.run('DELETE FROM deeds WHERE id = ?', r.id);
    return { deeds: deedInfo(u) };
  });
  route('POST', '/api/amulets/exchange', async ({ req, body }) => {
    const u = requireUser(req);
    luckGate(u);
    const info = amuletInfo(u), wish = wishOf(body.wish), per = LK.deeds.per_amulet;
    if (body.by === 'energy') {
      const need = LK.energy.per_amulet_minutes;
      const eid = db.tx(() => {
        const have = energyHave(u);
        if (have < need) throw new HttpError(409, `还差 ${need - have} 分钟`);
        return Number(db.run('INSERT INTO amulets(user_id, month, wish, way, minutes, style, look, created_at) VALUES(?,?,?,?,?,?,?,?)',
          u.id, info.month, wish.name, 'energy', need, 'energy', JSON.stringify(lookOf('energy', info)), nowIso()).lastInsertRowid);
      });
      return { amulet: amuletOut(db.get('SELECT * FROM amulets WHERE id = ?', eid)), practice: practiceInfo(u) };
    }
    const id = db.tx(() => {
      const ids = db.all('SELECT id FROM deeds WHERE user_id = ? AND amulet_id IS NULL ORDER BY id LIMIT ?', u.id, per).map((r) => r.id);
      if (ids.length < per) throw new HttpError(409, `还差 ${per - ids.length} 件善行`);
      const aid = Number(db.run('INSERT INTO amulets(user_id, month, wish, way, minutes, style, look, created_at) VALUES(?,?,?,?,?,?,?,?)',
        u.id, info.month, wish.name, 'deed', 0, 'deed', JSON.stringify(lookOf('deed', info)), nowIso()).lastInsertRowid);
      db.run(`UPDATE deeds SET amulet_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`, aid, ...ids);
      return aid;
    });
    return { amulet: amuletOut(db.get('SELECT * FROM amulets WHERE id = ?', id)), deeds: deedInfo(u) };
  });
  // 提能量：冥想、释放练习，只记一次练习
  route('POST', '/api/practices', async ({ req, body }) => {
    const u = requireUser(req);
    luckGate(u);
    const kind = body.kind;
    if (!['meditate', 'release'].includes(kind)) throw bad('练习类型不对');
    if (!limit('practice:' + u.id, 40, DAY_MS)) throw new HttpError(429, '今天练得够多了，休息一下');
    let minutes = 0, detail = {};
    if (kind === 'meditate') {
      minutes = parseInt(body.minutes, 10);
      if (!C.amulets.minutes.includes(minutes)) throw bad('时长不对');
      detail = { way: body.way === 'bowl' ? 'bowl' : 'incense' };
    } else {
      const sc = (v) => { const n = parseInt(v, 10); if (!(n >= 0 && n <= 10)) throw bad('分数在 0 到 10 之间'); return n; };
      detail = { before: sc(body.before), after: sc(body.after), rounds: Math.min(LK.release.max_rounds, Math.max(1, parseInt(body.rounds, 10) || 1)) };
      minutes = LK.energy.release_minutes;
    }
    db.run('INSERT INTO practices(user_id, kind, minutes, detail, created_at) VALUES(?,?,?,?,?)', u.id, kind, minutes, JSON.stringify(detail), nowIso());
    return { practice: practiceInfo(u) };
  });

  // 每晚自评：今天或昨天，1–5 分；同时记下系统当天的判断，用来对照
  route('POST', '/api/ratings', async ({ req, body }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const day = validDay(body.day);
    const score = parseInt(body.score, 10);
    if (!(score >= 1 && score <= 5)) throw bad('分数不对');
    const note = str(body.note, 60, '这句话');
    const [y, m, d] = day.split('-').map(Number);
    const x = dayOut(chartOf(u), y, m, d, false);
    db.run(`INSERT INTO ratings(user_id, day, score, sys_score, sys_level, note, created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id, day) DO UPDATE SET score = excluded.score${'note' in body ? ', note = excluded.note' : ''}, created_at = excluded.created_at`,
      u.id, day, score, x.score, x.level.k, note, nowIso());
    return { summary: rateMonth(u, day) };
  });

  // 今天的记录：可以只记心情、只记事情，或者都记（今天或前后两天内，按用户本地日期）；撕掉一条
  route('POST', '/api/moods', async ({ req, body }) => {
    const u = requireUser(req);
    if (!u.birth_date) throw new HttpError(409, '请先填写出生信息', { error: 'need_birth' });
    const day = validDay(body.day);
    const mood = body.mood ? String(body.mood) : '';
    if (mood && !MK.moods.some((m) => m.key === mood)) throw bad('这个心情不认识');
    if (!MK.colors.some((c) => c.key === body.color)) throw bad('选一张便签');
    const note = str(body.note, MK.note_max, '这条记录');
    if (!mood && !note) throw bad('写点什么，或者选一个心情');
    const n = db.get('SELECT COUNT(*) n FROM moods WHERE user_id = ? AND day = ?', u.id, day).n;
    if (n >= MK.max_per_day) throw new HttpError(409, `一天最多记 ${MK.max_per_day} 条，可以先撕掉一张`);
    db.tx(() => {
      db.run('INSERT INTO moods(user_id, day, mood, color, note, created_at) VALUES(?,?,?,?,?,?)', u.id, day, mood, body.color, note, nowIso());
      syncMoodRating(u, day);
    });
    return { moods: moodsOn(u, day), summary: rateMonth(u, day) };
  });
  route('DELETE', '/api/moods/:id', async ({ req, params }) => {
    const u = requireUser(req);
    const r = db.get('SELECT * FROM moods WHERE id = ? AND user_id = ?', Number(params.id), u.id);
    if (!r) throw new HttpError(404, '这张便签不在了');
    db.tx(() => { db.run('DELETE FROM moods WHERE id = ?', r.id); syncMoodRating(u, r.day); });
    return { moods: moodsOn(u, r.day), summary: rateMonth(u, r.day) };
  });

  // 邀请：落地页能看到邀请人的本命形象（不含生日）；我的邀请页
  route('GET', '/api/invite/:code', async ({ params }) => {
    const inv = db.get("SELECT * FROM users WHERE invite_code = ? AND status = 'active'", String(params.code).toUpperCase());
    if (!inv) throw new HttpError(404, '邀请链接已失效');
    const card = inv.birth_date ? C.energyCard(chartOf(inv)) : null;
    return { name: inv.nickname || '你的朋友', days: settings.int('invite_days'), card: card && { symbol: card.symbol, element: card.element, image: card.image, traits: card.traits, pillar: { gz: card.pillar.gz, name: card.pillar.name, art: card.pillar.art } } };
  });
  route('POST', '/api/pair', async ({ body, ip }) => {
    if (!limit('preview:' + ip, 30, 3600000)) throw new HttpError(429, '操作太频繁，请稍后再试');
    const inv = db.get("SELECT * FROM users WHERE invite_code = ? AND status = 'active'", String(body.code || '').toUpperCase());
    if (!inv || !inv.birth_date) throw new HttpError(404, '邀请链接已失效');
    const me = chart(validBirth(body.birth)), you = chartOf(inv);
    return { name: inv.nickname || '你的朋友', pair: C.pair(me.dm, you.dm), best: pairBest(me, you) };
  });
  // 朋友的画：通过链接连上的人——你邀请的、邀请你的、已经注册后点链接互相配的。双方只看到对方的日干形象和这张画
  function friendsOf(u) {
    const rows = db.all(`SELECT invitee_id id, created_at, 'invited' src FROM invites WHERE inviter_id = ?
      UNION ALL SELECT inviter_id, created_at, 'inviter' FROM invites WHERE invitee_id = ?
      UNION ALL SELECT CASE WHEN a = ? THEN b ELSE a END, created_at, 'link' FROM friend_links WHERE a = ? OR b = ?`, u.id, u.id, u.id, u.id, u.id);
    const byId = new Map();
    for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r);
    const mine = u.birth_date ? chartOf(u) : null;
    // 每位朋友都要排盘、算两周，只取最近的 100 位
    return [...byId.values()].sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, 100).map((r) => {
      const f = db.get("SELECT * FROM users WHERE id = ? AND status = 'active'", r.id);
      if (!f) return null;
      const fc = mine && f.birth_date ? chartOf(f) : null;
      return { name: shownName(f), src: r.src, at: r.created_at, pair: fc ? { ...C.pair(mine.dm, fc.dm), best: pairBest(mine, fc) } : null };
    }).filter(Boolean);
  }
  route('GET', '/api/friends', async ({ req }) => ({ list: friendsOf(requireUser(req)) }));
  // 已经注册的人打开朋友的邀请链接：两人连上，互相看到你们俩的画（不算邀请奖励）
  route('POST', '/api/friends/link', async ({ req, body }) => {
    const u = requireUser(req);
    // 限次数：免得有人试邀请码，把自己挂到陌生人的朋友里
    if (!limit('link:' + u.id, 20, DAY_MS)) throw new HttpError(429, '今天连得有点多了，明天再来吧');
    const f = db.get("SELECT * FROM users WHERE invite_code = ? AND status = 'active'", String(body.code || '').toUpperCase());
    if (!f || f.id === u.id) throw new HttpError(404, '链接已失效');
    db.run('INSERT OR IGNORE INTO friend_links(a, b, created_at) VALUES(?,?,?)', Math.min(u.id, f.id), Math.max(u.id, f.id), nowIso());
    const me = u.birth_date ? chartOf(u) : null, fc = f.birth_date ? chartOf(f) : null;
    return { name: shownName(f), pair: me && fc ? C.pair(me.dm, fc.dm) : null, best: me && fc ? pairBest(me, fc) : null };
  });
  route('GET', '/api/me/invite', async ({ req }) => {
    const u = requireUser(req);
    const days = settings.int('invite_days'), cap = settings.int('invite_cap');
    const list = db.all('SELECT i.status, i.created_at, i.done_at, i.invitee_id, u.nickname, u.username, (SELECT COUNT(*) FROM usage_days d WHERE d.user_id = u.id) uses, u.birth_date FROM invites i JOIN users u ON u.id = i.invitee_id WHERE i.inviter_id = ? ORDER BY i.id DESC LIMIT 100', u.id);

    const monthStart = new Date(Date.parse(bjDay().slice(0, 8) + '01T00:00:00+08:00')).toISOString();
    const usedThisMonth = db.get("SELECT COUNT(*) n FROM invites WHERE inviter_id = ? AND status = 'done' AND done_at >= ?", u.id, monthStart).n;
    const done = list.filter((r) => r.status === 'done').length;
    return {
      code: inviteCodeOf(u), days, cap, left: Math.max(0, cap - usedThisMonth),
      stats: { invited: list.length, done, days: done * days },
      list: list.map((r) => ({
        name: shownName(r), status: r.status, at: r.done_at || r.created_at,
        need: r.status !== 'pending' ? '' : !r.birth_date ? '等 TA 测完能量卡' : '等 TA 明天再打开一次',
      })),
    };
  });

  // 订阅到手机日历：订阅链接里只有一个随机令牌，可以重置
  const publicBase = (req) => env.PUBLIC_URL || `${String(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}${BASE}`;
  const feedOut = (req, u) => {
    const https = `${publicBase(req)}/api/ics/${u.cal_token}.ics`;
    return { url: https, webcal: https.replace(/^https?:/, 'webcal:') };
  };
  route('GET', '/api/me/calendar-feed', async ({ req }) => {
    let u = requireUser(req);
    if (!u.cal_token) { db.run('UPDATE users SET cal_token = ? WHERE id = ?', randToken(), u.id); u = db.get('SELECT * FROM users WHERE id = ?', u.id); }
    const preview = [];
    if (u.birth_date) {
      const c = chartOf(u);
      const t0 = Date.parse(bjDay() + 'T00:00:00Z');
      for (let k = 0; k < 3; k++) { const dt = new Date(t0 + k * DAY_MS); preview.push(dayEvent(c, C, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())); }
    }
    return { ...feedOut(req, u), preview, fetchedAt: u.cal_fetched_at };
  });
  route('POST', '/api/me/calendar-feed/reset', async ({ req }) => {
    const u = requireUser(req);
    db.run('UPDATE users SET cal_token = ?, cal_fetched_at = NULL WHERE id = ?', randToken(), u.id);
    return feedOut(req, db.get('SELECT * FROM users WHERE id = ?', u.id));
  });
  route('GET', '/api/ics/:token', async ({ req, params, ip }) => {
    if (!limit('ics:' + ip, 120, 3600000)) throw new HttpError(429, '请求太频繁');
    const token = String(params.token).replace(/\.ics$/, '');
    const u = token.length > 20 && db.get("SELECT * FROM users WHERE cal_token = ? AND status = 'active'", token);
    if (!u || !u.birth_date) throw new HttpError(404, '订阅链接已失效');
    db.run('UPDATE users SET cal_fetched_at = ? WHERE id = ?', nowIso(), u.id);
    const c = chartOf(u);
    const body = buildIcs({
      c, C, userId: u.id, name: u.nickname, today: bjDay(), plans: plansOf(u, null),
      expired: access(u).mode === 'blocked', url: publicBase(req) + '/',
    });
    return { __raw: body, __type: 'text/calendar; charset=utf-8', __headers: { 'Cache-Control': 'private, max-age=1800', 'Content-Disposition': 'inline; filename="liurili.ics"' } };
  });

  // 注销账号：删掉这个人的全部数据；订单只留金额、时间和支付宝交易号用于对账
  route('POST', '/api/me/delete', async ({ req, res, body }) => {
    const u = requireUser(req);
    if (!checkPassword(String(body.password || ''), u.pass_hash)) throw bad('密码不对');
    db.tx(() => {
      for (const t of ['sessions', 'usage_days', 'open_days', 'plans', 'draws', 'feedback', 'ratings', 'events', 'asks', 'ask_follows', 'amulets', 'moods', 'deeds', 'practices']) db.run(`DELETE FROM ${t} WHERE user_id = ?`, u.id);
      db.run('DELETE FROM friend_links WHERE a = ? OR b = ?', u.id, u.id);
      db.run('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?', u.id, u.id);
      db.run("UPDATE orders SET status = 'closed', closed_at = ? WHERE user_id = ? AND status = 'pending'", nowIso(), u.id);
      db.run('UPDATE orders SET user_id = 0, buyer = NULL, notify_raw = NULL, qr_code = NULL WHERE user_id = ?', u.id);
      db.run('DELETE FROM users WHERE id = ?', u.id);
    });
    adminLog('用户注销', '#' + u.id, '', '');
    setCookie(res, 'lrl_sid', '', 0);
    return { ok: true };
  });

  // 会员与支付
  route('GET', '/api/membership', async ({ req }) => {
    const u = requireUser(req);
    const orders = db.all("SELECT * FROM orders WHERE user_id = ? AND status != 'closed' ORDER BY id DESC LIMIT 50", u.id).map((o) => orderOut(o, false));
    return { access: access(u), orders, ...priceInfo() };
  });
  route('POST', '/api/pay/orders', async ({ req, ip, body }) => {
    const u = requireUser(req);
    if (!alipay) throw new HttpError(503, '支付暂时不可用，请稍后再试');
    if (!limit('order:' + u.id, 10, 3600000)) throw new HttpError(429, '下单太频繁，请稍后再试');
    const P = product(body.product);
    const reuse = db.get("SELECT * FROM orders WHERE user_id = ? AND status = 'pending' AND product = ? AND expires_at > ? ORDER BY id DESC LIMIT 1", u.id, P.kind, addMs(nowIso(), 60000));
    if (reuse && reuse.amount_cents === P.amountCents) return { order: orderOut(reuse, true) };
    const t = nowIso();
    const outTradeNo = 'LRL' + t.replace(/\D/g, '').slice(0, 14) + String(u.id).padStart(5, '0') + crypto.randomBytes(2).toString('hex');
    const { amountCents, days, subject } = P;
    let qr;
    try { qr = await alipay.precreate({ outTradeNo, amountCents, subject }); } catch (e) {
      log.error(`[pay] ${e.message}`);
      throw new HttpError(502, '支付宝暂时连不上，请稍后再试');
    }
    db.run('INSERT INTO orders(out_trade_no, user_id, amount_cents, days, subject, qr_code, created_at, expires_at, product, qty) VALUES(?,?,?,?,?,?,?,?,?,?)',
      outTradeNo, u.id, amountCents, days, subject, qr, t, addMs(t, ORDER_MINUTES * 60000), P.kind, 1);
    return { order: orderOut(db.get('SELECT * FROM orders WHERE out_trade_no = ?', outTradeNo), true) };
  });
  route('GET', '/api/pay/orders/:no', async ({ req, params, q }) => {
    const u = requireUser(req);
    let o = db.get('SELECT * FROM orders WHERE out_trade_no = ? AND user_id = ?', params.no, u.id);
    if (!o) throw new HttpError(404, '订单不存在');
    o = await syncOrder(o, q.get('force') === '1');
    const fresh = db.get('SELECT * FROM users WHERE id = ?', u.id);
    return { order: orderOut(o, false), access: access(fresh), credits: { ask: fresh.ask_credits, amulet: fresh.amulet_credits } };
  });
  route('POST', '/api/pay/notify', async ({ rawBody }) => {
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    if (!alipay || !alipay.verifyNotify(params)) { log.error('[pay] 通知验签失败'); return { __text: 'fail' }; }
    if (params.app_id !== alipay.appId) return { __text: 'fail' };
    if (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED') {
      grant(params.out_trade_no, { tradeNo: params.trade_no, buyer: params.buyer_logon_id, amount: params.total_amount, raw: rawBody.slice(0, 4000) });
    }
    return { __text: 'success' };
  });

  // 反馈
  route('GET', '/api/feedback', async ({ req }) => {
    const u = requireUser(req);
    const list = db.all('SELECT id, type, content, contact, status, reply, replied_at, user_seen, created_at FROM feedback WHERE user_id = ? ORDER BY id DESC LIMIT 50', u.id);
    db.run('UPDATE feedback SET user_seen = 1 WHERE user_id = ? AND user_seen = 0', u.id);
    return { list };
  });
  route('POST', '/api/feedback', async ({ req, body }) => {
    const u = requireUser(req);
    if (!limit('fb:' + u.id, 20, DAY_MS)) throw new HttpError(429, '今天提交得有点多了，明天再来吧');
    if (!FEEDBACK_TYPES.includes(body.type)) throw bad('请选择反馈类型');
    const content = str(body.content, 500, '反馈内容');
    if (!content) throw bad('写一下你遇到的问题或建议');
    const contact = str(body.contact, 50, '联系方式');
    const a = access(u);
    const meta = JSON.stringify({ ...(typeof body.meta === 'object' && body.meta ? body.meta : {}), access: a.mode, ua: req.headers['user-agent'] || '' }).slice(0, 2000);
    db.run('INSERT INTO feedback(user_id, username, type, content, contact, meta, created_at) VALUES(?,?,?,?,?,?,?)', u.id, u.username, body.type, content, contact, meta, nowIso());
    return { ok: true };
  });

  // 公开文本
  route('GET', '/api/legal', async () => {
    const s = settings.all();
    return { disclaimer: s.disclaimer, terms: s.terms, privacy: s.privacy, ...priceInfo(), freeUses: parseInt(s.free_uses, 10) };
  });

  // ---------- 后台 ----------
  const adminLog = (action, target, detail, reason) => db.run('INSERT INTO admin_logs(action, target, detail, reason, created_at) VALUES(?,?,?,?,?)', action, String(target ?? ''), String(detail ?? ''), String(reason ?? ''), nowIso());

  route('POST', '/api/admin/login', async ({ res, body, ip }) => {
    if (!limit('admin:' + ip, 10, 15 * 60000)) throw new HttpError(429, '尝试太频繁，请稍后再试');
    const user = env.ADMIN_USER || 'admin', pw = env.ADMIN_PASSWORD || '';
    const a = Buffer.from(sha256(String(body.password || ''))), b = Buffer.from(sha256(pw));
    if (!pw || String(body.username || '') !== user || !crypto.timingSafeEqual(a, b)) throw bad('账号或密码不对');
    newSession(res, 'admin', null);
    return { ok: true };
  });
  route('POST', '/api/admin/logout', async ({ req, res }) => {
    const s = sessionOf(req, 'admin');
    if (s) db.run('DELETE FROM sessions WHERE token_hash = ?', s.token_hash);
    setCookie(res, 'lrl_admin', '', 0);
    return { ok: true };
  });
  route('GET', '/api/admin/me', async ({ req }) => { requireAdmin(req); return { ok: true, user: env.ADMIN_USER || 'admin' }; });

  route('GET', '/api/admin/overview', async ({ req }) => {
    requireAdmin(req);
    const t = nowIso(), today = bjDay();
    const d30 = bjDay(new Date(Date.now() - 29 * DAY_MS));
    const dayStartIso = (d) => new Date(Date.parse(d + 'T00:00:00+08:00')).toISOString();
    const one = (sql, ...a) => db.get(sql, ...a);
    const users = one('SELECT COUNT(*) n FROM users').n;
    const paying = one("SELECT COUNT(DISTINCT user_id) n FROM orders WHERE status = 'paid'").n;
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = bjDay(new Date(Date.now() - i * DAY_MS)), s = dayStartIso(d), e = addMs(s, DAY_MS);
      series.push({
        day: d,
        signups: one('SELECT COUNT(*) n FROM users WHERE created_at >= ? AND created_at < ?', s, e).n,
        active: one('SELECT COUNT(*) n FROM usage_days WHERE day = ?', d).n,
        paid: one("SELECT COUNT(*) n FROM orders WHERE status IN ('paid','refunded') AND paid_at >= ? AND paid_at < ?", s, e).n,
        revenueCents: one("SELECT COALESCE(SUM(amount_cents),0) n FROM orders WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?", s, e).n,
      });
    }
    const sum = (k, from) => series.filter((x) => x.day >= from).reduce((a, x) => a + x[k], 0);
    return {
      today: { signups: sum('signups', today), active: sum('active', today), paid: sum('paid', today), revenueCents: sum('revenueCents', today) },
      last30: { signups: sum('signups', d30), active: one('SELECT COUNT(DISTINCT user_id) n FROM usage_days WHERE day >= ?', d30).n, paid: sum('paid', d30), revenueCents: sum('revenueCents', d30) },
      totals: {
        users, payingUsers: paying, conversion: users ? paying / users : 0,
        activeMembers: one('SELECT COUNT(*) n FROM users WHERE member_until > ?', t).n,
        revenueCents: one("SELECT COALESCE(SUM(amount_cents),0) n FROM orders WHERE status = 'paid'").n,
        openFeedback: one("SELECT COUNT(*) n FROM feedback WHERE status = 'open'").n,
      },
      series,
    };
  });

  route('GET', '/api/admin/stats', async ({ req }) => { requireAdmin(req); return adminStats(db); });

  // 规则对比：同一个生日、同一个月，v1 和 v2 每天的分数、档位和理由；再拿全部每晚自评看哪一版和用户感受更一致
  route('GET', '/api/admin/compare', async ({ req, q }) => {
    requireAdmin(req);
    let b, who;
    if (q.get('username')) {
      const u = db.get('SELECT * FROM users WHERE username = ?', q.get('username').trim());
      if (!u || !u.birth_date) throw bad('没找到这个用户，或者他还没填出生信息');
      b = birthOf(u); who = u.nickname || u.username;
    } else {
      b = validBirth({ date: q.get('date'), time: q.get('time') || null, gender: q.get('gender'), city: q.get('city') || null });
      who = '手动输入';
    }
    const y = parseInt(q.get('y'), 10), m = parseInt(q.get('m'), 10);
    if (!(y >= 1901 && y <= 2099 && m >= 1 && m <= 12)) throw bad('月份不对');
    const c1 = chart(b, null, 'v1'), c2 = chart(b, null, 'v2');
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate(), days = [];
    const pick = (x) => ({ score: x.score, k: x.level.k, p: x.level.p, why: x.why.map((w) => `${w.v > 0 ? '+' : ''}${w.v} ${w.t}`) });
    for (let d = 1; d <= n; d++) {
      const a = dayOut(c1, y, m, d, false), z = dayOut(c2, y, m, d, false);
      days.push({ d, gz: a.gz, ss: a.ssG, v1: pick(a), v2: pick(z) });
    }
    const share = (k) => [1, 2, 3, 4, 5].map((l) => days.filter((x) => x[k].k === l).length);
    // 每晚自评：系统档位和用户打分落在同一段（低 / 中 / 高）算一致
    const charts = new Map(), rows = db.all('SELECT r.user_id, r.day, r.score, r.sys_level FROM ratings r JOIN users u ON u.id = r.user_id');
    let m1 = 0, m2 = 0;
    for (const r of rows) {
      if (!charts.has(r.user_id)) { const u = db.get('SELECT * FROM users WHERE id = ?', r.user_id); charts.set(r.user_id, chart(birthOf(u), xiOf(u), 'v2')); }
      const [yy, mm, dd] = r.day.split('-').map(Number);
      if (band(r.score) === band(r.sys_level)) m1++;
      if (band(r.score) === band(dayOut(charts.get(r.user_id), yy, mm, dd, false).level.k)) m2++;
    }
    return {
      who, birth: { date: b.date, time: b.time, gender: b.gender, city: b.city }, pillars: c1.pillars, strong: c1.strong, xi: c1.xi,
      days, levels: { v1: share('v1'), v2: share('v2') },
      changed: days.filter((x) => x.v1.k !== x.v2.k).length, big: days.filter((x) => Math.abs(x.v1.k - x.v2.k) >= 2).length,
      ratings: { n: rows.length, v1: rows.length ? m1 / rows.length : null, v2: rows.length ? m2 / rows.length : null },
      current: engineVer(),
    };
  });

  route('GET', '/api/admin/users', async ({ req, q }) => {
    requireAdmin(req);
    const kw = (q.get('q') || '').trim();
    const page = Math.max(1, parseInt(q.get('page') || '1', 10));
    const where = kw ? 'WHERE u.username LIKE ? OR u.nickname LIKE ?' : '';
    const args = kw ? [`%${kw}%`, `%${kw}%`] : [];
    const total = db.get(`SELECT COUNT(*) n FROM users u ${where}`, ...args).n;
    const list = db.all(`SELECT u.id, u.username, u.nickname, u.bio, u.birth_date, u.birth_time, u.gender, u.birth_city, u.status, u.member_until, u.created_at, u.last_seen_at, u.locked_until,
      (SELECT COUNT(*) FROM usage_days d WHERE d.user_id = u.id) uses,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') paid_orders,
      (SELECT COALESCE(SUM(amount_cents),0) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') paid_cents
      FROM users u ${where} ORDER BY u.id DESC LIMIT 50 OFFSET ?`, ...args, (page - 1) * 50);
    return { total, page, list };
  });
  route('POST', '/api/admin/users/:id/reset-password', async ({ req, params }) => {
    requireAdmin(req);
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(params.id));
    if (!u) throw new HttpError(404, '用户不存在');
    const pw = crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 10);
    db.run('UPDATE users SET pass_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', hashPassword(pw), u.id);
    db.run("DELETE FROM sessions WHERE kind='user' AND user_id = ?", u.id);
    adminLog('重置密码', u.username, '', '');
    return { password: pw };
  });
  route('POST', '/api/admin/users/:id/adjust-days', async ({ req, params, body }) => {
    requireAdmin(req);
    const days = parseInt(body.days, 10);
    const reason = str(body.reason, 200, '原因');
    if (!days || Math.abs(days) > 3650) throw bad('天数不对');
    if (!reason) throw bad('请填写原因');
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(params.id));
    if (!u) throw new HttpError(404, '用户不存在');
    const until = addMemberDays(u.id, days);
    adminLog('调整会员天数', u.username, `${days > 0 ? '+' : ''}${days} 天，至 ${until}`, reason);
    return { memberUntil: until };
  });
  route('POST', '/api/admin/users/:id/status', async ({ req, params, body }) => {
    requireAdmin(req);
    const status = body.status === 'disabled' ? 'disabled' : 'active';
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(params.id));
    if (!u) throw new HttpError(404, '用户不存在');
    db.run('UPDATE users SET status = ? WHERE id = ?', status, u.id);
    if (status === 'disabled') db.run("DELETE FROM sessions WHERE kind='user' AND user_id = ?", u.id);
    adminLog(status === 'disabled' ? '停用账号' : '启用账号', u.username, '', str(body.reason, 200, '原因'));
    return { ok: true };
  });

  route('GET', '/api/admin/orders', async ({ req, q }) => {
    requireAdmin(req);
    const status = q.get('status') || '';
    const kw = (q.get('q') || '').trim();
    const conds = [], args = [];
    if (status) { conds.push('o.status = ?'); args.push(status); }
    if (kw) { conds.push('(o.out_trade_no LIKE ? OR u.username LIKE ? OR o.trade_no LIKE ?)'); args.push(`%${kw}%`, `%${kw}%`, `%${kw}%`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const list = db.all(`SELECT o.out_trade_no, o.amount_cents, o.days, o.product, o.qty, o.status, o.trade_no, o.buyer, o.created_at, o.paid_at, o.closed_at, o.refunded_at, COALESCE(u.username, '（已注销）') username, o.user_id
      FROM orders o LEFT JOIN users u ON u.id = o.user_id ${where} ORDER BY o.id DESC LIMIT 200`, ...args);
    return { list };
  });
  route('POST', '/api/admin/orders/:no/query', async ({ req, params }) => {
    requireAdmin(req);
    if (!alipay) throw new HttpError(503, '支付未配置');
    const o = db.get('SELECT * FROM orders WHERE out_trade_no = ?', params.no);
    if (!o) throw new HttpError(404, '订单不存在');
    const q = await alipay.query(o.out_trade_no);
    let granted = false;
    if (q.exists && (q.status === 'TRADE_SUCCESS' || q.status === 'TRADE_FINISHED') && o.status !== 'paid' && o.status !== 'refunded') {
      grant(o.out_trade_no, { tradeNo: q.tradeNo, buyer: q.buyer, amount: q.amount });
      granted = true;
      adminLog('查单补开通', o.out_trade_no, `支付宝状态 ${q.status}`, '');
    }
    return { alipay: q, granted, order: db.get('SELECT out_trade_no, status, paid_at, trade_no FROM orders WHERE out_trade_no = ?', o.out_trade_no) };
  });
  route('POST', '/api/admin/orders/:no/refund', async ({ req, params, body }) => {
    requireAdmin(req);
    const reason = str(body.reason, 200, '原因');
    if (!reason) throw bad('请填写退款原因');
    const o = db.get('SELECT * FROM orders WHERE out_trade_no = ?', params.no);
    if (!o) throw new HttpError(404, '订单不存在');
    if (o.status !== 'paid') throw bad('只有已支付的订单可以登记退款');
    db.tx(() => {
      db.run("UPDATE orders SET status='refunded', refunded_at=? WHERE id=?", nowIso(), o.id);
      const u = db.get('SELECT member_until FROM users WHERE id = ?', o.user_id);
      if (!u) return;
      if (CREDIT_COL[o.product]) db.run(`UPDATE users SET ${CREDIT_COL[o.product]} = MAX(0, ${CREDIT_COL[o.product]} - ?) WHERE id = ?`, o.qty, o.user_id);
      else if (u.member_until) db.run('UPDATE users SET member_until = ? WHERE id = ?', addMs(u.member_until, -o.days * DAY_MS), o.user_id);
    });
    adminLog('登记退款', o.out_trade_no, CREDIT_COL[o.product] ? `扣回 ${PRODUCT_NAME[o.product]} ${o.qty} 次` : `扣回 ${o.days} 天`, reason);
    return { ok: true };
  });

  route('GET', '/api/admin/feedback', async ({ req, q }) => {
    requireAdmin(req);
    const conds = [], args = [];
    if (q.get('status')) { conds.push('status = ?'); args.push(q.get('status')); }
    if (q.get('type')) { conds.push('type = ?'); args.push(q.get('type')); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    return { list: db.all(`SELECT * FROM feedback ${where} ORDER BY (status = 'open') DESC, id DESC LIMIT 200`, ...args) };
  });
  route('POST', '/api/admin/feedback/:id', async ({ req, params, body }) => {
    requireAdmin(req);
    const f = db.get('SELECT * FROM feedback WHERE id = ?', Number(params.id));
    if (!f) throw new HttpError(404, '反馈不存在');
    const sets = [], args = [];
    if ('reply' in body) {
      const reply = str(body.reply, 1000, '回复');
      sets.push('reply = ?', 'replied_at = ?', 'user_seen = ?', "status = CASE WHEN status = 'closed' THEN status ELSE 'replied' END");
      args.push(reply, reply ? nowIso() : null, reply && f.user_id ? 0 : 1);
    }
    if ('note' in body) { sets.push('note = ?'); args.push(str(body.note, 1000, '备注')); }
    if ('status' in body) {
      if (!['open', 'replied', 'closed'].includes(body.status)) throw bad('状态不对');
      sets.push('status = ?'); args.push(body.status);
    }
    if (sets.length) db.run(`UPDATE feedback SET ${sets.join(', ')} WHERE id = ?`, ...args, f.id);
    return { item: db.get('SELECT * FROM feedback WHERE id = ?', f.id) };
  });

  route('GET', '/api/admin/settings', async ({ req }) => { requireAdmin(req); return { settings: settings.all() }; });
  route('PUT', '/api/admin/settings', async ({ req, body }) => {
    requireAdmin(req);
    const before = settings.all();
    const changes = [];
    const num = (k, min, max, name) => {
      if (!(k in body)) return;
      const v = parseInt(body[k], 10);
      if (!(v >= min && v <= max)) throw bad(`${name}不对`);
      if (String(v) !== before[k]) { settings.set(k, v); changes.push(`${name} ${before[k]} → ${v}`); }
    };
    num('price_cents', 1, 100000, '价格（分）');
    num('free_uses', 0, 30, '免费次数');
    num('invite_days', 0, 60, '邀请奖励天数');
    num('ask_price_cents', 1, 100000, '问事单价（分）');
    if ('engine' in body && ['v1', 'v2'].includes(body.engine) && body.engine !== before.engine) { settings.set('engine', body.engine); changes.push(`打分规则 ${before.engine} → ${body.engine}`); }
    num('ask_free_monthly', 0, 30, '会员每月免费问事次数');
    num('amulet_price_cents', 1, 100000, '特别款御守单价（分）');
    num('invite_cap', 0, 100, '每月邀请奖励上限');
    for (const [k, name, max] of [['order_subject', '订单名称', 60], ['disclaimer', '娱乐声明', 2000], ['terms', '用户协议', 20000], ['privacy', '隐私政策', 20000]]) {
      if (!(k in body)) continue;
      const v = String(body[k]).trim();
      if (!v || v.length > max) throw bad(`${name}不能为空且不超过 ${max} 字`);
      if (v !== before[k]) { settings.set(k, v); changes.push(`修改${name}`); }
    }
    if (changes.length) adminLog('修改设置', '', changes.join('；'), '');
    return { settings: settings.all() };
  });
  route('GET', '/api/admin/logs', async ({ req }) => {
    requireAdmin(req);
    return { list: db.all('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 300') };
  });

  // 本地开发用的模拟支付（只有 ALIPAY_FAKE=1 时存在）
  if (alipay && alipay.fake) {
    route('POST', '/api/dev/pay/:no', async ({ params }) => { alipay.fake.paid.add(params.no); return { ok: true }; });
  }

  // ---------- 静态文件 ----------
  function serveStatic(req, res, p) {
    if (p === '/' || p === '') p = '/index.html';
    if (p === '/admin') p = '/admin.html';
    const file = path.join(PUBLIC_DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(PUBLIC_DIR)) return false;
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return true; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      // 插画不常换，缓存一天；页面和脚本每次协商，保证总是最新
      'Cache-Control': p.startsWith('/art/') ? 'public, max-age=86400' : 'no-cache', ETag: etag,
    });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  // ---------- 处理请求 ----------
  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const url = new URL(req.url, 'http://x');
    let p = url.pathname;
    if (BASE && (p === BASE || p.startsWith(BASE + '/'))) p = p.slice(BASE.length) || '/';
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    try {
      if (p.startsWith('/api/')) {
        const r = routes.find((x) => (x.method === req.method || (req.method === 'HEAD' && x.method === 'GET')) && x.re.test(p));
        if (!r) throw new HttpError(404, '接口不存在');
        const m = p.match(r.re);
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        let body = {}, rawBody = '';
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          rawBody = await readBody(req);
          const ct = String(req.headers['content-type'] || '');
          if (p === '/api/pay/notify') { /* 支付宝表单 */ } else {
            if (!ct.includes('application/json')) throw new HttpError(415, '请求格式不对');
            try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { throw bad('请求格式不对'); }
            if (!body || typeof body !== 'object') body = {};
          }
        }
        const out = await r.handler({ req, res, q: url.searchParams, params, body, rawBody, ip });
        if (out && out.__text) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(out.__text); return; }
        if (out && out.__raw != null) { res.writeHead(200, { 'Content-Type': out.__type, ...out.__headers }); res.end(req.method === 'HEAD' ? undefined : out.__raw); return; }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(out ?? { ok: true }));
        return;
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, p)) return;
      if (p === '/admin/') { res.writeHead(301, { Location: `${BASE}/admin` }); res.end(); return; }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log.error(e);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: e.extra?.error || 'error', message: status === 500 ? '服务器出了点问题，请稍后再试' : e.message, ...(e.extra || {}) }));
    }
  };
}

export function createServer(opts) {
  return http.createServer(createApp(opts));
}
