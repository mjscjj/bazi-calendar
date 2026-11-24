// 分享图：能量卡、你的今天、每日一签、穿搭色、邀请海报五种竖版图片（1080×1920），底部带二维码。浏览器里用画布绘制。
// 跟随当前的白色 / 深色主题，预览时也能手动换；登录用户的二维码都带着自己的邀请码。
import { $, esc, openSheet, onClick, toast, track, IS_IOS, isDarkNow } from './core.js';
import { THEME, hhmm, bestHours, HOUR_TIP } from './data.js';
import { S } from './state.js';

const W = 1080, H = 1920;
let lastShare = null;
const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC","SimSun",serif';
const SANS = '-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
const THEMES = {
  dark: { bg: ['#2A2038', '#1A1424'], fg: '#F6EFE6', muted: '#BDB1C4', glowA: 0.42, chip: 'rgba(255,255,255,0.1)', box: 'rgba(255,255,255,0.07)', line: 'rgba(255,255,255,0.08)', track: 'rgba(255,255,255,0.14)', ring: 'rgba(255,255,255,0.25)', el: ['#5CC487', '#FF7B6B', '#D1A06A', '#F0B848', '#6FA6F2'] },
  light: { bg: ['#FFFFFF', '#F7F6F4'], fg: '#15151C', muted: '#6B6B76', glowA: 0.26, chip: 'rgba(17,17,26,0.06)', box: 'rgba(17,17,26,0.04)', line: 'rgba(17,17,26,0.08)', track: 'rgba(17,17,26,0.09)', ring: 'rgba(17,17,26,0.12)', el: ['#2E8B57', '#D0453B', '#A2702C', '#B0861C', '#2F6DB5'] },
};
let P = THEMES.dark, mode = 'dark';
const cssVar = (k, d) => getComputedStyle(document.documentElement).getPropertyValue(k).trim() || d;
function glowColor() { return cssVar('--glow', '#FF9A3C'); }
// 做文字用的五行色：白底上用深一档
function glowText() { return mode === 'light' ? cssVar('--glow-ink', '#D9622B') : glowColor(); }

function base(ctx) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W * 0.75, H * 0.18, 0, W * 0.75, H * 0.18, W * 0.95);
  r.addColorStop(0, hexA(glowColor(), P.glowA)); r.addColorStop(1, hexA(glowColor(), 0));
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
}
function hexA(hex, a) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function text(ctx, s, x, y, { size = 40, font = SANS, weight = 400, color = P.fg, align = 'center' } = {}) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}
// 按字折行（中文没有空格），最多 maxLines 行，超出加省略号
function wrap(ctx, s, x, y, maxW, lineH, maxLines, opts) {
  ctx.font = `${opts.weight || 400} ${opts.size}px ${opts.font || SANS}`;
  const lines = [];
  let cur = '';
  for (const ch of s) {
    if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…'; }
  lines.forEach((l, i) => text(ctx, l, x, y + i * lineH, opts));
  return y + lines.length * lineH;
}
function footer(ctx, kind) {
  ctx.fillStyle = P.line; ctx.fillRect(80, 1600, W - 160, 2);
  text(ctx, '流日历', 80, 1730, { size: 64, font: SERIF, weight: 900, align: 'left' });
  text(ctx, kind === 'invite' ? '扫码测测你是什么型' : '按你的出生信息，算你的每一天', 80, 1792, { size: 34, color: P.muted, align: 'left' });
  text(ctx, 'mindflow.zone/bazi', 80, 1846, { size: 30, color: P.muted, align: 'left' });
  const code = S.me && S.me.inviteCode;
  const url = `${location.origin}${location.pathname}?from=share_${kind}${code ? '&i=' + code : ''}`;
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), size = 230, cell = size / (n + 4), x0 = W - 80 - size, y0 = 1640;
  ctx.fillStyle = '#fff'; roundRect(ctx, x0, y0, size, size, 18); ctx.fill();
  if (mode === 'light') { ctx.strokeStyle = P.ring; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = '#1A1424';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(x0 + (c + 2) * cell, y0 + (r + 2) * cell, Math.ceil(cell), Math.ceil(cell));
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function chip(ctx, s, cx, y, size) {
  ctx.font = `600 ${size}px ${SANS}`;
  const w = ctx.measureText(s).width + size * 1.4;
  ctx.fillStyle = P.chip; roundRect(ctx, cx - w / 2, y - size * 1.1, w, size * 1.6, size * 0.8); ctx.fill();
  text(ctx, s, cx, y, { size, weight: 600 });
  return w;
}

const DRAW = {
  card(ctx, { card: c, name, invite }) {
    text(ctx, invite ? `${name || '我'} 邀请你测测能量卡` : `${name ? name + ' 的' : '我的'}能量卡`, W / 2, 230, { size: invite ? 48 : 40, weight: invite ? 700 : 400, color: invite ? P.fg : P.muted });
    ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 90;
    text(ctx, c.symbol, W / 2, 760, { size: 460, font: SERIF, weight: 900 }); ctx.restore();
    text(ctx, `${c.dm}${c.element} · ${c.image}型`, W / 2, 940, { size: 84, font: SERIF, weight: 900 });
    text(ctx, `The ${c.en}`, W / 2, 1010, { size: 46, font: 'Georgia,serif', color: glowText() });
    let total = 0; const ws = c.traits.map((t) => { ctx.font = `600 40px ${SANS}`; const w = ctx.measureText(t).width + 56; total += w + 20; return w; });
    let x = W / 2 - (total - 20) / 2;
    c.traits.forEach((t, i) => { chip(ctx, t, x + ws[i] / 2, 1125, 40); x += ws[i] + 20; });
    wrap(ctx, c.intro, W / 2, 1250, 860, 64, 2, { size: 44 });
    const bx = 120, bw = W - 240, by = 1420;
    let off = 0; const sum = c.force.reduce((a, f) => a + f.pct, 0) || 100;
    c.force.forEach((f, i) => { const w = (f.pct / sum) * bw; ctx.fillStyle = P.el[i]; ctx.fillRect(bx + off, by, Math.max(0, w - 4), 22); off += w; });
    off = 0;
    c.force.forEach((f) => { const w = (f.pct / sum) * bw; if (w > 70) text(ctx, `${f.el} ${f.pct}%`, bx + off + w / 2, by + 70, { size: 30, color: P.muted }); off += w; });
    text(ctx, invite ? `注册后，你们俩各得 ${invite} 天会员` : `幸运元素  ${c.lucky.join(' · ')}`, W / 2, 1550, { size: 44, weight: 600, color: glowText() });
  },
  today(ctx, t) {
    const x = t.day, a = t.almanac;
    text(ctx, `${a.m}月${a.d}日 · 周${'日一二三四五六'[a.week]} · 农历${a.lunar.monthCn}月${a.lunar.dayCn}`, W / 2, 230, { size: 40, color: P.muted });
    text(ctx, '今天是我的', W / 2, 420, { size: 60, font: SERIF, weight: 900 });
    ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 70;
    text(ctx, THEME[x.ssG][0], W / 2, 640, { size: 210, font: SERIF, weight: 900, color: glowText() }); ctx.restore();
    text(ctx, `${x.level.p} · 能量 ${x.score}`, W / 2, 770, { size: 54, weight: 700 });
    ctx.fillStyle = P.track; roundRect(ctx, 160, 815, W - 320, 18, 9); ctx.fill();
    ctx.fillStyle = glowText(); roundRect(ctx, 160, 815, (W - 320) * x.score / 100, 18, 9); ctx.fill();
    const y2 = wrap(ctx, t.line.head || t.line.text, W / 2, 960, 860, 76, 2, { size: 54, font: SERIF, weight: 900 });
    if (t.line.why) wrap(ctx, t.line.why, W / 2, y2 + 20, 860, 60, 2, { size: 38, color: P.muted });
    const { top } = bestHours(x);
    if (top[0]) {
      ctx.fillStyle = P.box; roundRect(ctx, 120, 1300, W - 240, 220, 28); ctx.fill();
      text(ctx, '最佳时段', W / 2, 1370, { size: 36, color: P.muted });
      text(ctx, hhmm(top[0].i), W / 2, 1445, { size: 72, weight: 700 });
      text(ctx, HOUR_TIP[top[0].ss], W / 2, 1495, { size: 34, color: P.muted });
    }
  },
  lot(ctx, d) {
    text(ctx, `观音灵签 · 第 ${d.no} 签`, W / 2, 250, { size: 44, color: P.muted });
    chip(ctx, d.grade, W / 2, 360, 52);
    ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 50;
    text(ctx, d.title, W / 2, 540, { size: 112, font: SERIF, weight: 900 }); ctx.restore();
    d.poem.forEach((l, i) => text(ctx, l, W / 2, 720 + i * 112, { size: 72, font: SERIF, weight: 600 }));
    wrap(ctx, d.plain, W / 2, 1260, 860, 64, 3, { size: 42, color: P.muted });
    if (d.question) text(ctx, `所问 · ${d.question}`, W / 2, 1452, { size: 36, color: P.muted });
    text(ctx, `今天的关键词 · ${d.keyword}`, W / 2, 1520, { size: 46, weight: 700, color: glowText() });
  },
  outfit(ctx, o) {
    text(ctx, '今日穿搭色', W / 2, 260, { size: 72, font: SERIF, weight: 900 });
    o.colors.forEach((c, i) => {
      const cx = W / 2 + (i ? 210 : -210);
      ctx.fillStyle = c.hex; ctx.beginPath(); ctx.arc(cx, 640, 190, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.ring; ctx.lineWidth = 4; ctx.stroke();
      text(ctx, c.name, cx, 900, { size: 56, weight: 700 });
    });
    text(ctx, `配饰 · ${o.accessory}`, W / 2, 1060, { size: 52, weight: 600, color: glowText() });
    wrap(ctx, o.text, W / 2, 1200, 860, 68, 4, { size: 44, color: P.muted });
  },
  invite(ctx, d) { DRAW.card(ctx, { ...d, invite: d.days || 7 }); },
  amulet(ctx, { img, a }) {
    text(ctx, `${a.look.monthCn} · ${a.wish}`, W / 2, 250, { size: 44, color: P.muted });
    text(ctx, '我的御守', W / 2, 360, { size: 80, font: SERIF, weight: 900 });
    ctx.save(); ctx.shadowColor = a.look.colors[0]; ctx.shadowBlur = 80;
    ctx.drawImage(img, W / 2 - 280, 450, 560, 840); ctx.restore();
    text(ctx, `静坐 ${a.minutes} 分钟，许了一个心愿`, W / 2, 1430, { size: 42, color: P.muted });
    text(ctx, a.style === 'term' ? `${a.look.term} · 节气款` : a.style === 'birthday' ? '生日月 · 特别款' : `幸运色 · ${a.look.element}`, W / 2, 1510, { size: 40, weight: 600, color: glowText() });
  },
};

function render(kind, data, theme) {
  mode = theme; P = THEMES[theme];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  base(ctx); DRAW[kind](ctx, data); footer(ctx, kind);
  return cv;
}

const NAMES = { card: '能量卡', today: '我的今天', lot: '今日一签', outfit: '今日穿搭色', invite: '邀请海报', amulet: '御守' };
function pvHtml(url, kind, theme) {
  return `<div class="sharepv"><span class="segs pvtheme" role="group" aria-label="图片颜色">${[['light', '白色'], ['dark', '深色']].map(([k, l]) => `<button type="button" data-share-theme="${k}" aria-pressed="${k === theme}">${l}</button>`).join('')}</span>`
    + `<img src="${url}" alt="${esc(NAMES[kind])}分享图">${IS_IOS
      ? '<button type="button" class="btn primary block" data-share-go>分享或保存</button><p class="note" style="margin:0;text-align:center">也可以长按上面的图片，存到相册</p>'
      : `<div class="acts"><a class="btn ghost" href="${url}" download="流日历-${NAMES[kind]}.png" data-share-save>保存图片</a><button type="button" class="btn primary" data-share-go>分享</button></div>`}</div>`;
}
// data 不传时从当前页面的数据里取（邀请海报由邀请页传进来）
export function share(kind, data) {
  data = data || (kind === 'card' ? (S.shareCard || (S.today && { card: S.today.card, name: S.today.name }))
    : kind === 'today' ? S.today : kind === 'lot' ? S.today && S.today.draw : kind === 'outfit' ? S.today && S.today.outfit : null);
  if (!data) { toast('还没有可以分享的内容'); return; }
  track('share_create', { kind });
  const theme = isDarkNow() ? 'dark' : 'light';
  const cv = render(kind, data, theme);
  openSheet('分享' + NAMES[kind], pvHtml(cv.toDataURL('image/png'), kind, theme));
  lastShare = { cv, kind, name: NAMES[kind], data, theme };
}
onClick('[data-share-theme]', (el) => {
  const s = lastShare, theme = el.getAttribute('data-share-theme');
  if (!s || s.theme === theme) return;
  const cv = render(s.kind, s.data, theme);
  $('#sheet .sbody').innerHTML = pvHtml(cv.toDataURL('image/png'), s.kind, theme);
  Object.assign(s, { cv, theme });
});

onClick('[data-share]', (el) => share(el.getAttribute('data-share')));
onClick('[data-share-save]', () => { const s = lastShare; if (s) track('share_save', { kind: s.kind }); return false; });
onClick('[data-share-go]', () => {
  const s = lastShare;
  if (!s) return;
  s.cv.toBlob((blob) => {
    const file = new File([blob], `流日历-${s.name}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: '流日历 · ' + s.name }).then(() => track('share_done', { kind: s.kind }), () => {});
    } else if (IS_IOS) {
      toast('长按上面的图片，就能存到相册');
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
      toast('已保存图片，可以发给朋友了');
      track('share_save', { kind: s.kind });
    }
  }, 'image/png');
});

