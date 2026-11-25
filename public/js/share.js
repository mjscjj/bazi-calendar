// 分享图：能量卡、你的今天、每日一签、幸运色、邀请海报五种竖版图片（1080×1920），底部带二维码。浏览器里用画布绘制。
// 另有「今日锁屏」：按手机屏幕比例（1170×2532），上面留给锁屏时钟，下面是今天的画和你的主题。
// 跟随当前的白色 / 深色主题，预览时也能手动换；登录用户的二维码都带着自己的邀请码。
import { $, esc, openSheet, onClick, toast, track, IS_MOBILE, IS_WECHAT, isDarkNow } from './core.js';
import { THEME, hhmm, hhShort, bestHours, HOUR_TIP } from './data.js';
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
  card(ctx, { card: c, name, invite, img }) {
    text(ctx, invite ? `${name || '我'} 邀请你测测能量卡` : `${name ? name + ' 的' : '我的'}能量卡`, W / 2, 230, { size: invite ? 48 : 40, weight: invite ? 700 : 400, color: invite ? P.fg : P.muted });
    if (img && c.pillar) {
      // 日柱插画：圆角方图，下面是日柱和称号
      const s = 540, x = (W - s) / 2, y = 300;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 48; ctx.shadowOffsetY = 14;
      roundRect(ctx, x, y, s, s, 36); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
      ctx.save(); roundRect(ctx, x, y, s, s, 36); ctx.clip(); ctx.drawImage(img, x, y, s, s); ctx.restore();
      // 右下角的朱砂印：日柱两个字竖排
      const ss = 66;
      ctx.save(); ctx.translate(x + s - ss / 2 - 34, y + s - ss / 2 - 30); ctx.rotate(-0.1);
      ctx.fillStyle = '#C2412D'; roundRect(ctx, -ss / 2, -ss / 2, ss, ss, 10); ctx.fill();
      text(ctx, c.pillar.gz[0], 0, -5, { size: 27, font: SERIF, weight: 900, color: '#FFF4EC' });
      text(ctx, c.pillar.gz[1], 0, 25, { size: 27, font: SERIF, weight: 900, color: '#FFF4EC' });
      ctx.restore();
      text(ctx, `${c.pillar.gz} · ${c.pillar.name}`, W / 2, 950, { size: 72, font: SERIF, weight: 900 });
      text(ctx, `${c.dm}${c.element} · ${c.image}型`, W / 2, 1022, { size: 42, color: glowText() });
    } else {
      ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 90;
      text(ctx, c.symbol, W / 2, 760, { size: 460, font: SERIF, weight: 900 }); ctx.restore();
      text(ctx, `${c.dm}${c.element} · ${c.image}型`, W / 2, 940, { size: 84, font: SERIF, weight: 900 });
      text(ctx, `The ${c.en}`, W / 2, 1010, { size: 46, font: 'Georgia,serif', color: glowText() });
    }
    let total = 0; const ws = c.traits.map((t) => { ctx.font = `600 40px ${SANS}`; const w = ctx.measureText(t).width + 56; total += w + 20; return w; });
    let x = W / 2 - (total - 20) / 2;
    c.traits.forEach((t, i) => { chip(ctx, t, x + ws[i] / 2, 1125, 40); x += ws[i] + 20; });
    // 两行时按字数排均匀，免得第二行只剩一两个字
    const intro = c.pillar ? c.pillar.intro : c.intro, per = Math.ceil(intro.length / Math.ceil(intro.length / 19));
    wrap(ctx, intro, W / 2, 1250, Math.min(860, per * 44 + 8), 64, 2, { size: 44 });
    const bx = 120, bw = W - 240, by = 1420;
    let off = 0; const sum = c.force.reduce((a, f) => a + f.pct, 0) || 100;
    c.force.forEach((f, i) => { const w = (f.pct / sum) * bw; ctx.fillStyle = P.el[i]; ctx.fillRect(bx + off, by, Math.max(0, w - 4), 22); off += w; });
    off = 0;
    c.force.forEach((f) => { const w = (f.pct / sum) * bw; if (w > 70) text(ctx, `${f.el} ${f.pct}%`, bx + off + w / 2, by + 70, { size: 30, color: P.muted }); off += w; });
    text(ctx, invite ? `注册后，你们俩各得 ${invite} 天会员` : `幸运元素  ${c.lucky.join(' · ')}`, W / 2, 1550, { size: 44, weight: 600, color: glowText() });
  },
  today(ctx, t) {
    const x = t.day, a = t.almanac, art = t.arts && t.arts[x.gz];
    if (t.img && art) { todayWithArt(ctx, t, art); return; }
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
    text(ctx, '今日幸运色', W / 2, 260, { size: 72, font: SERIF, weight: 900 });
    o.colors.forEach((c, i) => {
      const cx = W / 2 + (i ? 210 : -210);
      bead(ctx, c.hex, cx, 640, 190);
      ctx.strokeStyle = P.ring; ctx.lineWidth = 4; ctx.stroke();
      text(ctx, c.name, cx, 900, { size: 56, weight: 700 });
    });
    text(ctx, `配饰 · ${o.accessory}`, W / 2, 1060, { size: 52, weight: 600, color: glowText() });
    wrap(ctx, o.text, W / 2, 1200, 860, 68, 4, { size: 44, color: P.muted });
  },
  invite(ctx, d) { DRAW.card(ctx, { ...d, invite: d.days || 7 }); },
  // 节气海报：日期、节气的画、节气名、这个节气的意思、对你意味着什么
  term(ctx, x) {
    const now = new Date();
    text(ctx, `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 今日节气`, W / 2, 200, { size: 38, color: P.muted });
    if (x.img) {
      const s = 800, ax = (W - s) / 2, ay = 250;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 48; ctx.shadowOffsetY = 14;
      roundRect(ctx, ax, ay, s, s, 36); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
      ctx.save(); roundRect(ctx, ax, ay, s, s, 36); ctx.clip(); ctx.drawImage(x.img, ax, ay, s, s); ctx.restore();
    }
    text(ctx, x.name, W / 2, 1200, { size: 128, font: SERIF, weight: 900 });
    const y2 = wrap(ctx, x.line, W / 2, 1290, evenW(x.line, 40, 860), 58, 2, { size: 40 });
    wrap(ctx, x.mine, W / 2, y2 + 24, evenW(x.mine, 34, 860), 50, 3, { size: 34, color: glowText() });
  },
  // 月度回顾：标题、六个数、这个月收的画（最多 9 张）、最顺的一天、最好的签、最常的心情
  recap(ctx, d) {
    const MCN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    text(ctx, `${d.name || '我'}的${MCN[d.m - 1]}月`, W / 2, 210, { size: 76, font: SERIF, weight: 900 });
    text(ctx, `${d.y} · 流日历月度回顾${d.inProgress ? '（到今天为止）' : ''}`, W / 2, 272, { size: 34, color: P.muted });
    const items = [[d.opened, '天打开'], [d.arts.length, '张画'], [d.notes, '条记录'], [d.lots, '支签'], [d.deeds, '件好事'], [d.amulets, '枚御守']];
    items.forEach(([n, l], i) => {
      const cx = 240 + (i % 3) * 300, cy = 400 + Math.floor(i / 3) * 150;
      text(ctx, String(n), cx, cy, { size: 76, weight: 700, color: i ? P.fg : glowText() });
      text(ctx, l, cx, cy + 46, { size: 30, color: P.muted });
    });
    const imgs = (d.imgs || []).filter(Boolean);
    let y = 700;
    if (imgs.length) {
      const per = 3, cell = 200, gap = 16, rows = Math.ceil(imgs.length / per);
      imgs.forEach((im, i) => {
        const r = Math.floor(i / per), inRow = Math.min(per, imgs.length - r * per), rw = inRow * cell + (inRow - 1) * gap;
        const x = (W - rw) / 2 + (i % per) * (cell + gap), yy = y + r * (cell + gap);
        ctx.save(); roundRect(ctx, x, yy, cell, cell, 18); ctx.clip(); ctx.drawImage(im, x, yy, cell, cell); ctx.restore();
      });
      y += rows * (cell + gap) + 40;
    }
    const lines = [];
    if (d.best) lines.push(`最顺的一天 · ${d.best.m}月${d.best.d}日 · ${d.best.theme}`);
    if (d.bestLot) lines.push(`最好的一支签 · 第 ${d.bestLot.no} 签 ${d.bestLot.title} · ${d.bestLot.grade}`);
    if (d.moods && d.moods[0]) lines.push(`最常的心情 · ${d.moods[0].word} × ${d.moods[0].n}`);
    lines.slice(0, 3).forEach((l, i) => text(ctx, l, W / 2, Math.min(y, 1440) + i * 62, { size: 38, color: i ? P.muted : P.fg, weight: i ? 400 : 600 }));
  },
  wall(ctx, t) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height, x = t.day, a = t.arts[x.gz];
    ctx.fillStyle = mode === 'light' ? '#F6F1E7' : '#17151A'; ctx.fillRect(0, 0, cw, ch);
    const s = 880, ax = (cw - s) / 2, ay = 1000;
    if (t.img) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 18;
      roundRect(ctx, ax, ay, s, s, 44); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
      ctx.save(); roundRect(ctx, ax, ay, s, s, 44); ctx.clip(); ctx.drawImage(t.img, ax, ay, s, s); ctx.restore();
    }
    text(ctx, `${x.m}月${x.d}日 · ${x.gz}日 · ${a.name}`, cw / 2, ay + s + 120, { size: 42, color: P.muted });
    text(ctx, `今天是你的${THEME[x.ssG][0]}`, cw / 2, ay + s + 236, { size: 80, font: SERIF, weight: 900 });
    const { top } = bestHours(x);
    if (top[0]) text(ctx, `最好的时段 ${hhmm(top[0].i)}`, cw / 2, ay + s + 330, { size: 46, weight: 600, color: glowText() });
    text(ctx, '流日历', cw / 2, ch - 170, { size: 34, font: SERIF, color: P.muted });
  },
  amulet(ctx, { img, a }) {
    text(ctx, `${a.look.monthCn} · ${a.wish}`, W / 2, 250, { size: 44, color: P.muted });
    text(ctx, '我的御守', W / 2, 360, { size: 80, font: SERIF, weight: 900 });
    ctx.save(); ctx.shadowColor = a.look.colors[0]; ctx.shadowBlur = 80;
    ctx.drawImage(img, W / 2 - 280, 450, 560, 840); ctx.restore();
    text(ctx, `静坐 ${a.minutes} 分钟，许了一个心愿`, W / 2, 1430, { size: 42, color: P.muted });
    text(ctx, a.style === 'term' ? `${a.look.term} · 节气款` : a.style === 'birthday' ? '生日月 · 特别款' : `幸运色 · ${a.look.element}`, W / 2, 1510, { size: 40, weight: 600, color: glowText() });
  },
};

// 折成几行时按字数排均匀，免得最后一行只剩一两个字或一个标点
const evenW = (str, size, maxW) => { const per = Math.ceil(str.length / Math.ceil((str.length * size) / maxW)); return Math.min(maxW, per * size + size * 0.6); };
// 画按封面方式裁进一个框（取画面偏下的主体，和今天卡片里一样）
function drawCover(ctx, img, x, y, w, h, py = 0.62) {
  const sw = img.naturalWidth, sh = img.naturalHeight, r = Math.max(w / sw, h / sh), cw = w / r, ch = h / r;
  ctx.drawImage(img, (sw - cw) / 2, (sh - ch) * py, cw, ch, x, y, w, h);
}
// 「我的今天」带今天的画：上面一幅这一天日柱的画，下面是主题、分数、今日一句、最好的时段
// 一颗色珠：底色加左上角一点高光，和今天卡片里的幸运色一个样子
function bead(ctx, hex, cx, cy, r) {
  ctx.fillStyle = hex; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.36, cy - r * 0.44, 0, cx - r * 0.36, cy - r * 0.44, r * 0.95);
  g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fill();
}
function todayWithArt(ctx, t, art) {
  const x = t.day, a = t.almanac, bx = 120, by = 250, bw = W - 240, bh = 420;
  text(ctx, `${a.m}月${a.d}日 · 周${'日一二三四五六'[a.week]} · 农历${a.lunar.monthCn}月${a.lunar.dayCn}`, W / 2, 200, { size: 38, color: P.muted });
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 12;
  roundRect(ctx, bx, by, bw, bh, 36); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
  ctx.save(); roundRect(ctx, bx, by, bw, bh, 36); ctx.clip(); drawCover(ctx, t.img, bx, by, bw, bh); ctx.restore();
  // 左下角：这一天的日柱和画名
  const cap = `${x.gz}日 · ${art.name}`;
  ctx.font = `600 30px ${SANS}`;
  const cw = ctx.measureText(cap).width + 40;
  ctx.fillStyle = 'rgba(246,241,231,.9)'; roundRect(ctx, bx + 22, by + bh - 74, cw, 52, 14); ctx.fill();
  text(ctx, cap, bx + 42, by + bh - 37, { size: 30, weight: 600, color: '#2B2620', align: 'left' });
  text(ctx, '今天是我的', W / 2, 790, { size: 48, font: SERIF, weight: 900 });
  ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 60;
  text(ctx, THEME[x.ssG][0], W / 2, 960, { size: 160, font: SERIF, weight: 900, color: glowText() }); ctx.restore();
  text(ctx, `${x.level.p} · 能量 ${x.score}`, W / 2, 1050, { size: 46, weight: 700 });
  ctx.fillStyle = P.track; roundRect(ctx, 200, 1084, W - 400, 14, 7); ctx.fill();
  ctx.fillStyle = glowText(); roundRect(ctx, 200, 1084, (W - 400) * x.score / 100, 14, 7); ctx.fill();
  const head = t.line.head || t.line.text;
  const y2 = wrap(ctx, head, W / 2, 1196, evenW(head, 48, 860), 66, 2, { size: 48, font: SERIF, weight: 900 });
  if (t.line.why) wrap(ctx, t.line.why, W / 2, y2 + 12, evenW(t.line.why, 34, 860), 50, 2, { size: 34, color: P.muted });
  const { top } = bestHours(x);
  const o = t.outfit && t.outfit.colors && t.outfit.colors.length >= 2 ? t.outfit : null;
  if (!top[0] && !o) return;
  ctx.fillStyle = P.box; roundRect(ctx, 120, 1420, W - 240, 150, 26); ctx.fill();
  // 有幸运色时框分两半：左边最佳时段，右边幸运色
  const hx = o && top[0] ? 120 + (W - 240) / 4 : W / 2, lx = o && top[0] ? 120 + (W - 240) * 3 / 4 : W / 2;
  if (top[0]) {
    text(ctx, '最佳时段', hx, 1474, { size: 32, color: P.muted });
    text(ctx, o ? hhShort(top[0].i) : hhmm(top[0].i), hx, 1544, { size: o ? 54 : 60, weight: 700 });
  }
  if (o) {
    if (top[0]) { ctx.fillStyle = P.track; ctx.fillRect(W / 2 - 1, 1450, 2, 90); }
    text(ctx, '幸运色', lx, 1474, { size: 32, color: P.muted });
    const name = `${o.colors[0].name} · ${o.colors[1].name}`;
    ctx.font = `700 46px ${SANS}`;
    const w = 70 + 18 + ctx.measureText(name).width, x0 = lx - w / 2;
    bead(ctx, o.colors[0].hex, x0 + 22, 1527, 22); bead(ctx, o.colors[1].hex, x0 + 48, 1527, 22);
    text(ctx, name, x0 + 88, 1544, { size: 46, weight: 700, align: 'left' });
  }
}

function render(kind, data, theme) {
  mode = theme; P = THEMES[theme];
  const cv = document.createElement('canvas');
  const wall = kind === 'wall';
  cv.width = wall ? 1170 : W; cv.height = wall ? 2532 : H;
  const ctx = cv.getContext('2d');
  if (wall) { DRAW.wall(ctx, data); return cv; }
  base(ctx); DRAW[kind](ctx, data); footer(ctx, kind);
  return cv;
}

const NAMES = { card: '能量卡', today: '我的今天', lot: '今日一签', outfit: '今日幸运色', invite: '邀请海报', amulet: '御守', wall: '今日锁屏', recap: '月度回顾', term: '节气海报' };
const SLUG = { card: 'card', today: 'today', lot: 'lot', outfit: 'outfit', invite: 'invite', amulet: 'amulet', wall: 'wallpaper', recap: 'recap', term: 'solar-term' };
// 分享图用 JPG：手机相册、微信都当照片处理（PNG 动辄两三兆，常被当成一个文件）
const jpg = (cv) => cv.toDataURL('image/jpeg', 0.92);
// 网页没法直接写进相册：手机上最可靠的是长按图片「保存图片 / 添加到照片」，所以放在最前面说；
// 「发给朋友」只传图片本身，电脑上给一个下载
function pvHtml(url, kind, theme) {
  const tip = IS_WECHAT ? '长按图片，选「保存图片」存进相册，或直接「发送给朋友」' : '长按图片，就能保存到相册';
  return `<div class="sharepv"><span class="segs pvtheme" role="group" aria-label="图片颜色">${[['light', '白色'], ['dark', '深色']].map(([k, l]) => `<button type="button" data-share-theme="${k}" aria-pressed="${k === theme}">${l}</button>`).join('')}</span>`
    + `<img src="${url}" alt="${esc(NAMES[kind])}分享图">`
    + (IS_MOBILE
      ? `<p class="savetip">${tip}${kind === 'wall' ? '，再在手机设置里设为锁屏' : ''}</p>${!IS_WECHAT && navigator.share ? '<button type="button" class="btn ghost block" data-share-go>发给朋友</button>' : ''}`
      : `<a class="btn primary block" href="${url}" download="liurili-${SLUG[kind]}.jpg" data-share-save>保存图片</a>${navigator.share ? '<button type="button" class="btn ghost block" data-share-go>分享</button>' : ''}`)
    + '</div>';
}
// data 不传时从当前页面的数据里取（邀请海报由邀请页传进来）
export function share(kind, data) {
  data = data || (kind === 'card' ? (S.shareCard || (S.today && { card: S.today.card, name: S.today.name }))
    : kind === 'today' || kind === 'wall' ? S.today : kind === 'term' ? (S.today || S.todayLocked) && (S.today || S.todayLocked).term : kind === 'lot' ? S.today && S.today.draw : kind === 'outfit' ? S.today && S.today.outfit : null);
  if (!data) { toast('还没有可以分享的内容'); return; }
  track('share_create', { kind });
  const theme = isDarkNow() ? 'dark' : 'light';
  // 能量卡和邀请海报要先把日柱插画加载好（能量卡页显示过，一般直接命中缓存）
  const art = kind === 'term' ? data.art : kind === 'wall' || kind === 'today' ? data.arts && data.arts[data.day.gz] && data.arts[data.day.gz].art
    : (kind === 'card' || kind === 'invite') && data.card && data.card.pillar ? data.card.pillar.art : null;
  // 月度回顾要先把这个月收的画（最多 9 张）都加载好
  const many = kind === 'recap' ? Promise.all((data.arts || []).slice(0, 9).map((a) => artOf(a.art))) : Promise.resolve(null);
  return Promise.all([art ? artOf(art) : Promise.resolve(null), many]).then(([img, imgs]) => {
    const d = { ...data, ...(img ? { img } : {}), ...(imgs ? { imgs } : {}) };
    const cv = render(kind, d, theme);
    openSheet(kind === 'wall' ? NAMES.wall : '分享' + NAMES[kind], pvHtml(jpg(cv), kind, theme));
    lastShare = { cv, kind, name: NAMES[kind], data: d, theme };
  });
}
const arts = {};
const artOf = (src) => arts[src] || (arts[src] = new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => { delete arts[src]; ok(null); }; im.src = src; }));
onClick('[data-share-theme]', (el) => {
  const s = lastShare, theme = el.getAttribute('data-share-theme');
  if (!s || s.theme === theme) return;
  const cv = render(s.kind, s.data, theme);
  $('#sheet .sbody').innerHTML = pvHtml(jpg(cv), s.kind, theme);
  Object.assign(s, { cv, theme });
});

onClick('[data-share]', (el) => share(el.getAttribute('data-share')));
onClick('[data-share-save]', () => { const s = lastShare; if (s) track('share_save', { kind: s.kind }); return false; });
onClick('[data-share-go]', () => {
  const s = lastShare;
  if (!s) return;
  s.cv.toBlob((blob) => {
    // 只传图片本身，不带标题文字：带了标题，系统和微信常把它当成一个文件发出去
    const file = new File([blob], `liurili-${SLUG[s.kind]}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).then(() => track('share_done', { kind: s.kind }), () => {});
    else toast(IS_MOBILE ? '长按上面的图片，就能保存到相册' : '用「保存图片」存下来，再发给朋友');
  }, 'image/jpeg', 0.92);
});

