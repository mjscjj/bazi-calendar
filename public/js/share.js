// 分享图：能量卡、你的今天、每日一签、幸运色、邀请海报、问事卦签等竖版图片（1080×1920），底部带二维码。浏览器里用画布绘制。
// 另有「今日锁屏」：按手机屏幕比例（1170×2532），上面留给锁屏时钟，下面是今天的画和你的主题。
// 跟随当前的白色 / 深色主题，预览时也能手动换；登录用户的二维码都带着自己的邀请码。
import { $, esc, openSheet, onClick, toast, track, IS_MOBILE, IS_WECHAT, isDarkNow } from './core.js';
import { EN } from './i18n.js';
import { pillarArtSrc, THEME, hhmm, hhShort, bestHours, HOUR_TIP, mdLabel, ymdLabel, wkName, lunarText, gzName, ganPy, MONTH_EN } from './data.js';
import { S } from './state.js';
import { tm } from './i18n.js';
const t = tm('share'); // 先查 i18n/en/share.json

const W = 1080, H = 1920;
let lastShare = null;
// 英文先用西文衬线体，汉字（专业模式的干支）落到后面的中文字体
const SERIF = (EN ? 'Georgia,"Iowan Old Style","Times New Roman",' : '') + '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC","SimSun",serif';
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
// 一行字：超出可用宽度时整体缩小字号（英文往往比中文长），max 不传时按画布留边算
function text(ctx, s, x, y, { size = 40, font = SANS, weight = 400, color = P.fg, align = 'center', max } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  const room = max || (align === 'center' ? ctx.canvas.width - 120 : ctx.canvas.width - x - 60);
  const w = ctx.measureText(s).width;
  if (w > room) { size = Math.floor(size * room / w); ctx.font = `${weight} ${size}px ${font}`; }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}
// 折行：中文按字，带西文的按词；最多 maxLines 行，超出加省略号
function wrap(ctx, s, x, y, maxW, lineH, maxLines, opts) {
  ctx.font = `${opts.weight || 400} ${opts.size}px ${opts.font || SANS}`;
  const words = /[A-Za-z]/.test(s);
  const units = words ? (s.match(/\S+\s*/g) || []) : [...s];
  const lines = [];
  let cur = '';
  for (const u of units) {
    if (cur && ctx.measureText((cur + u).trimEnd()).width > maxW) { lines.push(cur.trimEnd()); cur = u; } else cur += u;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = (words ? lines[maxLines - 1].replace(/\s*\S*$/, '') : lines[maxLines - 1].slice(0, -1)) + '…'; }
  lines.forEach((l, i) => text(ctx, l, x, y + i * lineH, { ...opts, max: Math.max(maxW, 10) }));
  return y + lines.length * lineH;
}
function footer(ctx, kind) {
  ctx.fillStyle = P.line; ctx.fillRect(80, 1600, W - 160, 2);
  text(ctx, 'flowday', 80, 1730, { size: 64, font: SERIF, weight: 900, align: 'left' });
  text(ctx, kind === 'invite' ? t('扫码测测你是什么型') : t('按你的出生信息，算你的每一天'), 80, 1792, { size: 34, color: P.muted, align: 'left', max: 650 });
  text(ctx, 'mindflow.zone/bazi', 80, 1846, { size: 30, color: P.muted, align: 'left' });
  const code = S.me && S.me.inviteCode;
  // 英文分享图的二维码带上 lang=en，扫进来就是英文
  const url = `${location.origin}${location.pathname}?from=share_${kind}${code ? '&i=' + code : ''}${EN ? '&lang=en' : ''}`;
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

// 日期那一行：11月26日 · 周四 · 农历十月初八 / Nov 26 · Thu · Lunar 10/8
const dateLine = (a) => [mdLabel(a.m, a.d), wkName(a.week), lunarText(a.lunar)].join(' · ');
// 日干型：丙火 · 烛光型 / Bing Fire · The Candle
const typeLine = (c) => (EN ? `${ganPy(c.dm)} ${t(c.element)} · ${t('{img}型', { img: c.image })}` : t('{img}型', { img: `${c.dm}${c.element} · ${c.image}` }));
const DRAW = {
  card(ctx, { card: c, name, invite, img }) {
    const head = invite ? (name ? t('{n} 邀请你测测能量卡', { n: name }) : t('我 邀请你测测能量卡')) : (name ? t('{n} 的能量卡', { n: name }) : t('我的能量卡'));
    text(ctx, head, W / 2, 230, { size: invite ? 48 : 40, weight: invite ? 700 : 400, color: invite ? P.fg : P.muted });
    if (img && c.pillar) {
      // 日柱插画：圆角方图，下面是日柱和称号
      const s = 540, x = (W - s) / 2, y = 300;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 48; ctx.shadowOffsetY = 14;
      roundRect(ctx, x, y, s, s, 36); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
      ctx.save(); roundRect(ctx, x, y, s, s, 36); ctx.clip(); ctx.drawImage(img, x, y, s, s); ctx.restore();
      text(ctx, `${gzName(c.pillar.gz)} · ${c.pillar.name}`, W / 2, 950, { size: 72, font: SERIF, weight: 900 });
      text(ctx, typeLine(c), W / 2, 1022, { size: 42, color: glowText() });
    } else {
      ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 90;
      text(ctx, c.symbol, W / 2, 760, { size: 460, font: SERIF, weight: 900 }); ctx.restore();
      text(ctx, typeLine(c), W / 2, 940, { size: 84, font: SERIF, weight: 900 });
      text(ctx, `The ${c.en}`, W / 2, 1010, { size: 46, font: 'Georgia,serif', color: glowText() });
    }
    let total = 0; const ws = c.traits.map((tr) => { ctx.font = `600 40px ${SANS}`; const w = ctx.measureText(tr).width + 56; total += w + 20; return w; });
    let x = W / 2 - (total - 20) / 2;
    c.traits.forEach((tr, i) => { chip(ctx, tr, x + ws[i] / 2, 1125, 40); x += ws[i] + 20; });
    // 两行时按字数排均匀，免得第二行只剩一两个字
    const intro = c.pillar ? c.pillar.intro : c.intro, per = Math.ceil(intro.length / Math.ceil(intro.length / 19));
    // 英文按词折行，一行装得下更多字，给三行
    if (EN) wrap(ctx, intro, W / 2, 1240, 860, 56, 3, { size: 38 });
    else wrap(ctx, intro, W / 2, 1250, Math.min(860, per * 44 + 8), 64, 2, { size: 44 });
    const bx = 120, bw = W - 240, by = 1420;
    let off = 0; const sum = c.force.reduce((a, f) => a + f.pct, 0) || 100;
    c.force.forEach((f, i) => { const w = (f.pct / sum) * bw; ctx.fillStyle = P.el[i]; ctx.fillRect(bx + off, by, Math.max(0, w - 4), 22); off += w; });
    off = 0;
    c.force.forEach((f) => { const w = (f.pct / sum) * bw; if (w > 70) text(ctx, `${t(f.el)} ${f.pct}%`, bx + off + w / 2, by + 70, { size: 30, color: P.muted, max: w - 8 }); off += w; });
    text(ctx, invite ? t('注册后，你们俩各得 {n} 天会员', { n: invite }) : t('幸运元素  {x}', { x: c.lucky.map((w) => t(w)).join(' · ') }), W / 2, 1550, { size: 44, weight: 600, color: glowText() });
  },
  today(ctx, td) {
    const x = td.day, a = td.almanac, art = td.arts && td.arts[x.gz];
    if (td.img && art) { todayWithArt(ctx, td, art); return; }
    text(ctx, dateLine(a), W / 2, 230, { size: 40, color: P.muted });
    text(ctx, t('今天是我的'), W / 2, 420, { size: 60, font: SERIF, weight: 900 });
    ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 70;
    text(ctx, THEME[x.ssG][0], W / 2, 640, { size: 210, font: SERIF, weight: 900, color: glowText() }); ctx.restore();
    text(ctx, t('{lv} · 能量 {s}', { lv: t(x.level.p), s: x.score }), W / 2, 770, { size: 54, weight: 700 });
    ctx.fillStyle = P.track; roundRect(ctx, 160, 815, W - 320, 18, 9); ctx.fill();
    ctx.fillStyle = glowText(); roundRect(ctx, 160, 815, (W - 320) * x.score / 100, 18, 9); ctx.fill();
    const y2 = wrap(ctx, td.line.head || td.line.text, W / 2, 960, 860, 76, 2, { size: 54, font: SERIF, weight: 900 });
    if (td.line.why) wrap(ctx, td.line.why, W / 2, y2 + 20, 860, 60, 2, { size: 38, color: P.muted });
    const { top } = bestHours(x);
    if (top[0]) {
      ctx.fillStyle = P.box; roundRect(ctx, 120, 1300, W - 240, 220, 28); ctx.fill();
      text(ctx, t('最佳时段'), W / 2, 1370, { size: 36, color: P.muted });
      text(ctx, hhmm(top[0].i), W / 2, 1445, { size: 72, weight: 700 });
      text(ctx, HOUR_TIP[top[0].ss], W / 2, 1495, { size: 34, color: P.muted });
    }
  },
  lot(ctx, d) {
    text(ctx, t('观音灵签 · 第 {no} 签', { no: d.no }), W / 2, 250, { size: 44, color: P.muted });
    chip(ctx, t(d.grade), W / 2, 360, 52);
    ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 50;
    text(ctx, d.title, W / 2, 540, { size: 112, font: SERIF, weight: 900 }); ctx.restore();
    d.poem.forEach((l, i) => text(ctx, l, W / 2, 720 + i * 112, { size: EN ? 56 : 72, font: SERIF, weight: 600 }));
    wrap(ctx, d.plain, W / 2, 1260, 860, 64, 3, { size: 42, color: P.muted });
    if (d.question) text(ctx, t('所问 · {q}', { q: d.question }), W / 2, 1452, { size: 36, color: P.muted });
    text(ctx, t('今天的关键词 · {k}', { k: d.keyword }), W / 2, 1520, { size: 46, weight: 700, color: glowText() });
  },
  outfit(ctx, o) {
    text(ctx, t('今日幸运指南'), W / 2, 260, { size: 72, font: SERIF, weight: 900 });
    text(ctx, t('幸运色'), W / 2, 380, { size: 42, color: P.muted });
    o.colors.forEach((c, i) => {
      const cx = W / 2 + (i ? 210 : -210);
      bead(ctx, c.hex, cx, 640, 190);
      ctx.strokeStyle = P.ring; ctx.lineWidth = 4; ctx.stroke();
      text(ctx, t(c.name), cx, 900, { size: 56, weight: 700, max: 400 });
    });
    text(ctx, t('幸运配饰 · {a}', { a: t(o.accessory) }), W / 2, 1060, { size: 52, weight: 600, color: glowText() });
    wrap(ctx, o.text, W / 2, 1200, 860, 68, 4, { size: 44, color: P.muted });
  },
  invite(ctx, d) { DRAW.card(ctx, { ...d, invite: d.days || 7 }); },
  // 节气海报：日期、节气的画、节气名、这个节气的意思、对你意味着什么
  // 卦签：倾向、眼下 → 后来的走势、三个卦、解读的一句结论、两个好日子。问的事多半是私事，默认不放，预览里可以打开
  gua(ctx, { a, withQ }) {
    const g = a.gua, tc = TEND_C[g.tendency] ? cssVar(TEND_C[g.tendency], P.fg) : P.fg;
    text(ctx, t('问事 · 卦签'), 80, 180, { size: 34, weight: 600, color: P.muted, align: 'left', max: 420 });
    text(ctx, g.cast.text, W - 80, 180, { size: 30, color: P.muted, align: 'right', max: 480 });
    if (withQ) wrap(ctx, t('「{q}」', { q: a.question }), 80, 290, W - 160, 68, 2, { size: 50, weight: 700, align: 'left' });
    else text(ctx, t('关于一件「{c}」上的事', { c: t(a.category) }), 80, 290, { size: 46, weight: 700, align: 'left' });
    text(ctx, t('这件事的倾向'), 80, 480, { size: 34, color: P.muted, align: 'left', max: 440 });
    const tend = t(g.tendency);
    text(ctx, tend, 72, 650, { size: EN ? 96 : g.tendency.length > 2 ? 120 : 170, weight: 900, color: tc, align: 'left', max: 460 });
    // 走势：眼下 → 后来
    const RS = { 用生体: 0.9, 比和: 0.72, 体克用: 0.58, 体生用: 0.34, 用克体: 0.16 };
    const cx0 = 600, cx1 = 1000, cyT = 450, cyB = 660, yy = (k) => cyB - (RS[k] || 0.5) * (cyB - cyT);
    const ya = yy(g.now.rel), yb = yy(g.later.rel), ym = (ya + yb) / 2, xm = (cx0 + cx1) / 2;
    ctx.strokeStyle = P.line; ctx.lineWidth = 2;
    for (const k of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(cx0 - 30, cyB - k * (cyB - cyT)); ctx.lineTo(cx1 + 20, cyB - k * (cyB - cyT)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx0, ya); ctx.bezierCurveTo(cx0 + 80, ya, xm - 80, ym, xm, ym); ctx.bezierCurveTo(xm + 80, ym, cx1 - 80, yb, cx1, yb);
    ctx.strokeStyle = tc; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
    for (const [x, y] of [[cx0, ya], [cx1, yb]]) { ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fillStyle = tc; ctx.fill(); }
    text(ctx, t('眼下'), cx0, cyB + 50, { size: 28, color: P.muted }); text(ctx, t('后来'), cx1, cyB + 50, { size: 28, color: P.muted });
    // 三个卦：眼下（本卦）、过程（互卦）、后来（变卦）
    ctx.fillStyle = P.box; roundRect(ctx, 80, 780, W - 160, 330, 30); ctx.fill();
    [[t('眼下 · 本卦'), g.ben, g.moving], [t('过程 · 互卦'), g.hu, 0], [t('后来 · 变卦'), g.bian, g.moving]].forEach(([lb, h, mv], i) => {
      const cx = 80 + (W - 160) * (i * 2 + 1) / 6;
      text(ctx, lb, cx, 840, { size: 28, color: P.muted, max: 290 });
      hexDraw(ctx, h.lines, cx - 70, 870, 140, mv, P.fg, glowText());
      text(ctx, h.name, cx, 1070, { size: 40, weight: 700, max: 290 });
    });
    const head = a.status === 'done' && a.reading ? a.reading.headline : g.ben.gist;
    wrap(ctx, head, W / 2, 1220, evenW(head, 54, 900), 74, 2, { size: 54, weight: 800 });
    if (a.days && a.days.length) {
      const ds = a.days.map((p) => `${mdLabel(p.m, p.d)} ${wkName(new Date(p.y, p.m - 1, p.d).getDay())}`).join('  ·  ');
      ctx.fillStyle = P.box; roundRect(ctx, 80, 1400, W - 160, 130, 26); ctx.fill();
      text(ctx, t('如果要做，这两天更好'), W / 2, 1452, { size: 30, color: P.muted });
      text(ctx, ds, W / 2, 1504, { size: 40, weight: 700 });
    }
  },
  term(ctx, x) {
    const now = new Date();
    text(ctx, t('{date} · 今日节气', { date: ymdLabel(now.getFullYear(), now.getMonth() + 1, now.getDate()) }), W / 2, 200, { size: 38, color: P.muted });
    if (x.img) {
      const s = 800, ax = (W - s) / 2, ay = 250;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 48; ctx.shadowOffsetY = 14;
      roundRect(ctx, ax, ay, s, s, 36); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
      ctx.save(); roundRect(ctx, ax, ay, s, s, 36); ctx.clip(); ctx.drawImage(x.img, ax, ay, s, s); ctx.restore();
    }
    text(ctx, t(x.name), W / 2, 1200, { size: EN ? 96 : 128, font: SERIF, weight: 900 });
    const y2 = wrap(ctx, x.line, W / 2, 1290, evenW(x.line, 40, 860), 58, 2, { size: 40 });
    wrap(ctx, x.mine, W / 2, y2 + 24, evenW(x.mine, 34, 860), 50, 3, { size: 34, color: glowText() });
  },
  // 月度回顾：标题、六个数、这个月收的画（最多 9 张）、最顺的一天、最好的签、最常的心情
  recap(ctx, d) {
    const MCN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    const mon = EN ? MONTH_EN[d.m - 1] : MCN[d.m - 1];
    text(ctx, d.name ? t('{n}的{m}月', { n: d.name, m: mon }) : t('我的{m}月', { m: mon }), W / 2, 210, { size: 76, font: SERIF, weight: 900 });
    text(ctx, t('{y} · flowday 月度回顾', { y: d.y }) + (d.inProgress ? t('（到今天为止）') : ''), W / 2, 272, { size: 34, color: P.muted });
    const items = [[d.opened, t('天打开')], [d.arts.length, t('张画')], [d.notes, t('条记录')], [d.lots, t('支签')], [d.deeds, t('件好事')], [d.amulets, t('枚御守')]];
    items.forEach(([n, l], i) => {
      const cx = 240 + (i % 3) * 300, cy = 400 + Math.floor(i / 3) * 150;
      text(ctx, String(n), cx, cy, { size: 76, weight: 700, color: i ? P.fg : glowText() });
      text(ctx, l, cx, cy + 46, { size: 30, color: P.muted, max: 280 });
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
    if (d.best) lines.push(t('最顺的一天 · {md} · {th}', { md: mdLabel(d.best.m, d.best.d), th: t(d.best.theme) }));
    if (d.bestLot) lines.push(t('最好的一支签 · 第 {no} 签 {title} · {g}', { no: d.bestLot.no, title: d.bestLot.title, g: t(d.bestLot.grade) }));
    if (d.moods && d.moods[0]) lines.push(t('最常的心情 · {w} × {n}', { w: d.moods[0].word, n: d.moods[0].n }));
    lines.slice(0, 3).forEach((l, i) => text(ctx, l, W / 2, Math.min(y, 1440) + i * 62, { size: 38, color: i ? P.muted : P.fg, weight: i ? 400 : 600 }));
  },
  wall(ctx, td) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height, x = td.day, a = td.arts[x.gz];
    ctx.fillStyle = mode === 'light' ? '#F6F1E7' : '#17151A'; ctx.fillRect(0, 0, cw, ch);
    const s = 880, ax = (cw - s) / 2, ay = 1000;
    if (td.img) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 18;
      roundRect(ctx, ax, ay, s, s, 44); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
      ctx.save(); roundRect(ctx, ax, ay, s, s, 44); ctx.clip(); ctx.drawImage(td.img, ax, ay, s, s); ctx.restore();
    }
    text(ctx, t('{md} · {gz}日 · {name}', { md: mdLabel(x.m, x.d), gz: gzName(x.gz), name: a.name }), cw / 2, ay + s + 120, { size: 42, color: P.muted });
    text(ctx, t('今天是你的{th}', { th: THEME[x.ssG][0] }), cw / 2, ay + s + 236, { size: 80, font: SERIF, weight: 900 });
    const { top } = bestHours(x);
    if (top[0]) text(ctx, t('最好的时段 {h}', { h: hhmm(top[0].i) }), cw / 2, ay + s + 330, { size: 46, weight: 600, color: glowText() });
    text(ctx, 'flowday', cw / 2, ch - 170, { size: 34, font: SERIF, color: P.muted });
  },
  amulet(ctx, { img, a, art, message, recipient }) {
    const night = mode === 'dark';
    const inks = {travel:'#31506c',dawn:'#9a4a26',laurel:'#326349',sakura:'#9e4970',cat:'#995720',crane:'#38716a',home:'#7f5a27',moon:'#65538d',falcon:'#325592','pool-dew':'#24645a','pool-koi':'#82532d','pool-lotus':'#70516c'};
    const ink = night ? '#eddcb9' : inks[art?.photo] || '#805434';
    const paper = night ? '#302c38' : '#fbf3df';
    ctx.fillStyle = paper; ctx.fillRect(0, 0, W, 1350);
    // Two-color letterpress border of the keepsake card.
    ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 7;
    ctx.setLineDash([24, 14]); ctx.strokeRect(27, 27, W-54, 1296); ctx.restore();
    text(ctx, recipient ? t('送给 {r}', { r: recipient }) : t('送你一枚好运'), 86, 133, { size:44, weight:600, align:'left', color:ink, max: 740 });
    ctx.save(); ctx.translate(W-147,155); ctx.rotate(.13); ctx.strokeStyle=ink;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(0,0,73,0,Math.PI*2);ctx.stroke();
    text(ctx,'OMAMORI',0,-9,{size:20,font:'Georgia,serif',color:ink});
    text(ctx,a.way === 'energy' ? t('静心') : (a.way === 'pool' ? t('限定') : a.way === 'deed' ? t('善意') : t('祝福')),0,35,{size:33,font:SERIF,color:ink,max:120});ctx.restore();
    const scale = Math.min(640 / img.naturalWidth, 635 / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.save();ctx.translate(W/2,557);ctx.rotate(-.065);
    ctx.shadowColor='rgba(70,44,22,.23)';ctx.shadowBlur=18;ctx.shadowOffsetY=13;
    ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
    for (const [x,y,r] of [[220,420,16],[818,620,17],[780,660,9],[256,704,9]]) {
      ctx.save();ctx.translate(x,y);ctx.fillStyle=night?'#c29b67':'#be9352';ctx.beginPath();
      ctx.moveTo(0,-r);ctx.quadraticCurveTo(2,-2,r,0);ctx.quadraticCurveTo(2,2,0,r);
      ctx.quadraticCurveTo(-2,2,-r,0);ctx.quadraticCurveTo(-2,-2,0,-r);ctx.fill();ctx.restore();
    }
    // 英文：绣品自带的英文名做标题，下面一行写 Omamori
    const amuletTitle = EN ? (art?.en || t('{w}御守', { w: t(a.wish) })) : (art?.title || t('{w}御守', { w: a.wish }));
    text(ctx,amuletTitle,W/2,975,{size:79,font:SERIF,weight:600,color:ink});
    text(ctx,EN ? 'Omamori' : (art?.en || 'Omamori'),W/2,1037,{size:41,font:'Georgia,serif',color:ink});
    wrap(ctx,message,W/2,1140,W-176,55,3,{size:40,color:night?'#f9efdf':'#413a33'});
  },
  amuletWall(ctx, { img, landscape, art, a }) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    if (landscape) {
      const scale = Math.max(w/img.naturalWidth,h/img.naturalHeight);
      ctx.drawImage(img,(w-img.naturalWidth*scale)/2,(h-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);
      return;
    }
    ctx.fillStyle = art ? '#eee0cf' : a.look.colors[1]; ctx.fillRect(0,0,w,h);
    const scale = Math.min(w*.78/img.naturalWidth, h*.50/img.naturalHeight);
    const iw = img.naturalWidth*scale, ih = img.naturalHeight*scale;
    ctx.drawImage(img,(w-iw)/2,h*.59-ih/2,iw,ih);
  },
};

// 折成几行时按字数排均匀，免得最后一行只剩一两个字或一个标点
// 西文一个字母大约半个字宽，按词折行时直接用整宽
const evenW = (str, size, maxW) => { if (/[A-Za-z]/.test(str)) return maxW; const per = Math.ceil(str.length / Math.ceil((str.length * size) / maxW)); return Math.min(maxW, per * size + size * 0.6); };
// 画按封面方式裁进一个框（取画面偏下的主体，和今天卡片里一样）
// 一卦六根线（从下往上）：阳爻一整根，阴爻断成两截；动爻用强调色
function hexDraw(ctx, lines, x, y, w, mv, color, mvColor) {
  const h = w * 0.1, gap = w * 0.07;
  lines.forEach((v, i) => {
    const yy = y + (5 - i) * (h + gap);
    ctx.fillStyle = i + 1 === mv ? mvColor : color;
    if (v) { roundRect(ctx, x, yy, w, h, h * 0.25); ctx.fill(); } else { roundRect(ctx, x, yy, w * 0.43, h, h * 0.25); ctx.fill(); roundRect(ctx, x + w * 0.57, yy, w * 0.43, h, h * 0.25); ctx.fill(); }
  });
}
const TEND_C = { 顺: '--plus', 先阻后顺: '--l4', 宜缓: '--l3', 有阻: '--l2' };
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
function todayWithArt(ctx, td, art) {
  const x = td.day, a = td.almanac, bx = 120, by = 250, bw = W - 240, bh = 420;
  text(ctx, dateLine(a), W / 2, 200, { size: 38, color: P.muted });
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 12;
  roundRect(ctx, bx, by, bw, bh, 36); ctx.fillStyle = '#F6F1E7'; ctx.fill(); ctx.restore();
  ctx.save(); roundRect(ctx, bx, by, bw, bh, 36); ctx.clip(); drawCover(ctx, td.img, bx, by, bw, bh); ctx.restore();
  // 左下角：这一天的日柱和画名
  const cap = t('{gz}日 · {name}', { gz: gzName(x.gz), name: art.name });
  ctx.font = `600 30px ${SANS}`;
  const cw = ctx.measureText(cap).width + 40;
  ctx.fillStyle = 'rgba(246,241,231,.9)'; roundRect(ctx, bx + 22, by + bh - 74, cw, 52, 14); ctx.fill();
  text(ctx, cap, bx + 42, by + bh - 37, { size: 30, weight: 600, color: '#2B2620', align: 'left' });
  text(ctx, t('今天是我的'), W / 2, 790, { size: 48, font: SERIF, weight: 900 });
  ctx.save(); ctx.shadowColor = glowColor(); ctx.shadowBlur = 60;
  text(ctx, THEME[x.ssG][0], W / 2, 960, { size: 160, font: SERIF, weight: 900, color: glowText() }); ctx.restore();
  text(ctx, t('{lv} · 能量 {s}', { lv: t(x.level.p), s: x.score }), W / 2, 1050, { size: 46, weight: 700 });
  ctx.fillStyle = P.track; roundRect(ctx, 200, 1084, W - 400, 14, 7); ctx.fill();
  ctx.fillStyle = glowText(); roundRect(ctx, 200, 1084, (W - 400) * x.score / 100, 14, 7); ctx.fill();
  const head = td.line.head || td.line.text;
  const y2 = wrap(ctx, head, W / 2, 1196, evenW(head, 48, 860), 66, 2, { size: 48, font: SERIF, weight: 900 });
  if (td.line.why) wrap(ctx, td.line.why, W / 2, y2 + 12, evenW(td.line.why, 34, 860), 50, 2, { size: 34, color: P.muted });
  const { top } = bestHours(x);
  const o = td.outfit && td.outfit.colors && td.outfit.colors.length >= 2 ? td.outfit : null;
  if (!top[0] && !o) return;
  ctx.fillStyle = P.box; roundRect(ctx, 120, 1420, W - 240, 150, 26); ctx.fill();
  // 有幸运色时框分两半：左边最佳时段，右边幸运色
  const hx = o && top[0] ? 120 + (W - 240) / 4 : W / 2, lx = o && top[0] ? 120 + (W - 240) * 3 / 4 : W / 2;
  if (top[0]) {
    text(ctx, t('最佳时段'), hx, 1474, { size: 32, color: P.muted });
    text(ctx, o ? hhShort(top[0].i) : hhmm(top[0].i), hx, 1544, { size: o ? 54 : 60, weight: 700, max: o ? 400 : undefined });
  }
  if (o) {
    if (top[0]) { ctx.fillStyle = P.track; ctx.fillRect(W / 2 - 1, 1450, 2, 90); }
    text(ctx, t('幸运色'), lx, 1474, { size: 32, color: P.muted });
    const name = `${t(o.colors[0].name)} · ${t(o.colors[1].name)}`;
    // 名字太长（英文常见）时缩小，色珠加名字不超过框的一半
    const room = (top[0] ? (W - 240) / 2 : W - 240) - 40;
    let fs = 46; ctx.font = `700 ${fs}px ${SANS}`;
    if (88 + ctx.measureText(name).width > room) { fs = Math.floor(fs * (room - 88) / ctx.measureText(name).width); ctx.font = `700 ${fs}px ${SANS}`; }
    const w = 70 + 18 + ctx.measureText(name).width, x0 = lx - w / 2;
    bead(ctx, o.colors[0].hex, x0 + 22, 1527, 22); bead(ctx, o.colors[1].hex, x0 + 48, 1527, 22);
    text(ctx, name, x0 + 88, 1544, { size: fs, weight: 700, align: 'left', max: room });
  }
}

function render(kind, data, theme) {
  mode = theme; P = THEMES[theme];
  const cv = document.createElement('canvas');
  const wall = kind === 'wall' || kind === 'amuletWall';
  cv.width = wall ? 1170 : W; cv.height = wall ? 2532 : H;
  if (kind === 'amulet') cv.height = 1350;
  const ctx = cv.getContext('2d');
  if (kind === 'amulet') {
    ctx.fillStyle = theme === 'light' ? '#f6f1e8' : '#252525';
    ctx.fillRect(0, 0, cv.width, cv.height);
    DRAW.amulet(ctx, data);
    return cv;
  }
  if (wall) { DRAW[kind](ctx, data); return cv; }
  base(ctx); DRAW[kind](ctx, data); footer(ctx, kind);
  return cv;
}

const NAMES = { gua: t('卦签'), card: t('能量卡'), today: t('我的今天'), lot: t('今日一签'), outfit: t('今日幸运指南'), invite: t('邀请海报'), amulet: t('御守祝福卡'), amuletWall: t('御守锁屏壁纸'), wall: t('今日锁屏'), recap: t('月度回顾'), term: t('节气海报') };
const SLUG = { gua: 'gua', card: 'card', today: 'today', lot: 'lot', outfit: 'outfit', invite: 'invite', amulet: 'omu-blessing', amuletWall: 'omu-wallpaper', wall: 'wallpaper', recap: 'recap', term: 'solar-term' };
// 分享图用 JPG：手机相册、微信都当照片处理（PNG 动辄两三兆，常被当成一个文件）
const jpg = (cv) => cv.toDataURL('image/jpeg', 0.92);
// 网页没法直接写进相册：手机上最可靠的是长按图片「保存图片 / 添加到照片」，所以放在最前面说；
// 「发给朋友」只传图片本身，电脑上给一个下载
function pvHtml(url, kind, theme, data) {
  const tip = IS_WECHAT ? t('长按图片，选「保存图片」存进相册，或直接「发送给朋友」') : t('长按图片，就能保存到相册');
  if (kind === 'amulet') {
    return `<div class="sharepv gift-editor"><img class="gift-preview" src="${url}" alt="${t('御守祝福明信片')}"><form class="charm-msg"><label for="gift-to">${t('送给谁')}</label><input id="gift-to" name="recipient" maxlength="14" placeholder="${t('朋友的名字或昵称（选填）')}" value="${esc(data.recipient || '')}"><label for="charm-message">${t('想对对方说')}</label><textarea id="charm-message" name="note" maxlength="48" rows="2" required>${esc(data.message)}</textarea><div class="gift-paper" role="group" aria-label="${t('信纸颜色')}">${[['light', t('奶油信纸')], ['dark', t('午夜信纸')]].map(([k,label]) => `<button type="button" data-gift-paper="${k}" aria-pressed="${k===theme}">${label}</button>`).join('')}</div></form><div class="gift-send">${navigator.share && !IS_WECHAT ? `<button class="btn primary" data-share-go>${t('送给朋友')}</button>` : ''}<a class="btn ghost" href="${url}" download="omamori-blessing.jpg" data-share-save>${t('保存祝福卡')}</a></div>${IS_MOBILE ? `<p class="savetip">${t('也可以长按明信片，保存或转发。')}</p>` : ''}</div>`;
  }
  return '<div class="sharepv">'  + (kind === 'amuletWall' ? '' : `<span class="segs pvtheme" role="group" aria-label="${t('图片颜色')}">${[['light', t('白色')], ['dark', t('深色')]].map(([k, l]) => `<button type="button" data-share-theme="${k}" aria-pressed="${k === theme}">${l}</button>`).join('')}</span>`)
    + (kind === 'gua' ? `<span class="segs pvtheme" role="group" aria-label="${t('问的事')}">${[['0', t('不带问题')], ['1', t('带上问的事')]].map(([k, l]) => `<button type="button" data-share-q="${k}" aria-pressed="${!!(data && data.withQ) === (k === '1')}">${l}</button>`).join('')}</span>` : '')
    + `<img src="${url}" alt="${esc(t('{n}分享图', { n: NAMES[kind] }))}">`
    + (IS_MOBILE
      ? `<p class="savetip">${tip}${kind === 'wall' || kind === 'amuletWall' ? t('，再在手机设置里设为锁屏') : ''}</p>${!IS_WECHAT && navigator.share ? `<button type="button" class="btn ghost block" data-share-go>${t('发给朋友')}</button>` : ''}`
      : `<a class="btn primary block" href="${url}" download="flowday-${SLUG[kind]}.jpg" data-share-save>${t('保存图片')}</a>${navigator.share ? `<button type="button" class="btn ghost block" data-share-go>${t('分享')}</button>` : ''}`)
    + '</div>';
}
// data 不传时从当前页面的数据里取（邀请海报由邀请页传进来）
export function share(kind, data) {
  data = data || (kind === 'card' ? (S.shareCard || (S.today && { card: S.today.card, name: S.today.name }))
    : kind === 'today' || kind === 'wall' ? S.today : kind === 'term' ? (S.today || S.todayLocked) && (S.today || S.todayLocked).term : kind === 'lot' ? S.today && S.today.draw : kind === 'outfit' ? S.today && S.today.outfit : null);
  if (!data) { toast(t('还没有可以分享的内容')); return; }
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
    openSheet(kind === 'wall' || kind === 'amuletWall' ? NAMES[kind] : t('分享{n}', { n: NAMES[kind] }), pvHtml(jpg(cv), kind, theme, d));
    lastShare = { cv, kind, name: NAMES[kind], data: d, theme };
  });
}
const arts = {};
const artOf = (src) => arts[src] || (arts[src] = new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => { delete arts[src]; ok(null); }; im.src = pillarArtSrc(src); }));
function refreshGift() {
  const s = lastShare, form = $('.gift-editor .charm-msg');
  if (!form || s?.kind !== 'amulet') return;
  s.data = { ...s.data, recipient: form.elements.recipient.value.trim(), message: form.elements.note.value.trim() || s.data.art?.message || t('愿你心想事成。') };
  s.cv = render(s.kind, s.data, s.theme);
  const url = jpg(s.cv);
  $('.gift-preview').src = url;
  $('.gift-send [data-share-save]').href = url;
}
let giftFrame;
document.addEventListener('input', e => {
  if (!e.target.closest('.charm-msg')) return;
  cancelAnimationFrame(giftFrame); giftFrame = requestAnimationFrame(refreshGift);
});
document.addEventListener('submit', e => { if(e.target.matches('.charm-msg')) {e.preventDefault(); refreshGift();} });
onClick('[data-gift-paper]', el => {
  if (!lastShare) return;
  lastShare.theme = el.dataset.giftPaper;
  for (const b of el.parentElement.children) b.setAttribute('aria-pressed',String(b===el));
  refreshGift();
});
onClick('[data-share-theme]', (el) => {
  const s = lastShare, theme = el.getAttribute('data-share-theme');
  if (!s || s.theme === theme) return;
  const cv = render(s.kind, s.data, theme);
  $('#sheet .sbody').innerHTML = pvHtml(jpg(cv), s.kind, theme, s.data);
  Object.assign(s, { cv, theme });
});
onClick('[data-share-q]', (el) => {
  const s = lastShare, withQ = el.getAttribute('data-share-q') === '1';
  if (!s || !!s.data.withQ === withQ) return;
  s.data = { ...s.data, withQ };
  s.cv = render(s.kind, s.data, s.theme);
  $('#sheet .sbody').innerHTML = pvHtml(jpg(s.cv), s.kind, s.theme, s.data);
});

onClick('[data-share]', (el) => share(el.getAttribute('data-share')));
onClick('[data-share-save]', () => { const s = lastShare; if (s) track('share_save', { kind: s.kind }); return false; });
onClick('[data-share-go]', () => {
  const s = lastShare;
  if (!s) return;
  const src = $('.sharepv img')?.src;
  if (!src) return;
  const bytes = Uint8Array.from(atob(src.split(',')[1]), c => c.charCodeAt(0));
  const file = new File([bytes], `flowday-${SLUG[s.kind]}.jpg`, { type:'image/jpeg' });
  if (navigator.canShare?.({files:[file]})) {
    navigator.share({files:[file]}).then(() => track('share_done',{kind:s.kind}), e => {
      if (e.name !== 'AbortError') toast(t('可以先保存图片，再发送给朋友'));
    });
  } else toast(IS_MOBILE ? t('长按上面的图片，就能保存到相册') : t('保存图片后就能发给朋友'));

});

