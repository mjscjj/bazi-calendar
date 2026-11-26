// Share images: a 1080 × 1920 story card for a sign or a pair painting.
import { $, S, SITE, track, toast, openSheet, signName, fullName, elOf, shareBase } from './core.js';

const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
function wrapLines(ctx, text, max) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
async function drawCard(o) {
  await Promise.all(["400 120px 'Instrument Serif'", "italic 400 64px 'Instrument Serif'", '600 28px Inter', '500 28px Inter'].map((f) => document.fonts.load(f)));
  const W = 1080, H = 1920, X = 90, IW = 900, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = await loadImg(o.art), E = S.C.elements[o.el];
  ctx.fillStyle = '#F6F5F1'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(await loadImg('logo.svg'), X, 104, 56, 56);
  ctx.fillStyle = '#16151A'; ctx.font = "400 64px 'Instrument Serif'"; ctx.fillText('Flow Day', X + 72, 156);
  ctx.save(); ctx.shadowColor = 'rgba(20,18,14,.25)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 26; rrect(ctx, X, 230, IW, IW, 44); ctx.fillStyle = '#EFEDE7'; ctx.fill(); ctx.restore();
  ctx.save(); rrect(ctx, X, 230, IW, IW, 44); ctx.clip(); ctx.drawImage(img, X, 230, IW, IW); ctx.restore();
  ctx.font = '600 28px Inter'; const kt = o.kicker.toUpperCase(), kw = ctx.measureText(kt).width + 56;
  rrect(ctx, X, 1196, kw, 56, 28); ctx.fillStyle = E.tint; ctx.fill();
  ctx.fillStyle = E.color; ctx.beginPath(); ctx.arc(X + 26, 1224, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillText(kt, X + 44, 1234);
  let size = 128; ctx.font = `400 ${size}px 'Instrument Serif'`;
  while (ctx.measureText(o.title).width > IW && size > 72) { size -= 4; ctx.font = `400 ${size}px 'Instrument Serif'`; }
  ctx.fillStyle = '#16151A'; ctx.fillText(o.title, X - 4, 1290 + size * 0.95);
  const y2 = 1290 + size * 0.95 + 80;
  ctx.fillStyle = '#57545A'; ctx.font = "italic 400 64px 'Instrument Serif'"; ctx.fillText(o.sub, X, y2);
  ctx.fillStyle = '#96928C'; ctx.font = '500 28px Inter'; ctx.fillText(o.meta, X, y2 + 60);
  ctx.fillStyle = '#16151A'; ctx.font = "400 46px 'Instrument Serif'";
  wrapLines(ctx, o.body, IW).slice(0, 3).forEach((l, i) => ctx.fillText(l, X, y2 + 140 + i * 58));
  ctx.fillStyle = '#E9E6DF'; ctx.fillRect(X, 1784, IW, 2);
  ctx.fillStyle = '#16151A'; ctx.font = "italic 400 48px 'Instrument Serif'"; ctx.fillText("What's your sign?", X, 1856);
  ctx.font = '600 28px Inter'; ctx.textAlign = 'right'; ctx.fillText(SITE, W - X, 1850); ctx.textAlign = 'left';
  return cv;
}
export async function shareImage(make, filename, sign, link) {
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Share</h2><p class="tip">Getting it ready…</p>`);
  let cv;
  try { cv = await make(); } catch { toast('Could not make the image. Please try again.'); return; }
  const url = cv.toDataURL('image/jpeg', 0.9);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const canFiles = navigator.canShare && navigator.canShare({ files: [file] });
  const touch = matchMedia('(pointer: coarse)').matches;
  openSheet(`<button class="x" aria-label="Close">×</button><h2 class="h1">Share</h2><p class="muted" style="margin:0">Sized for Stories and TikTok.</p>
    <img class="shot" src="${url}" alt="Your Flow Day image">
    ${touch ? '<p class="tip">Press and hold the image to save it to Photos.</p>' : ''}
    <div class="btns">${canFiles ? '<button class="btn block" id="doShare">Share image</button>' : ''}
    ${!touch || !canFiles ? `<a class="btn ${canFiles ? 'ghost ' : ''}block" id="doSave" href="${url}" download="${filename}">Download image</a>` : ''}
    ${link ? '<button class="btn ghost block" id="doLink">Copy link</button>' : ''}</div>`);
  track('us_share', { sign, step: 'open' });
  $('#doShare')?.addEventListener('click', async () => { try { await navigator.share({ files: [file] }); track('us_share', { sign, step: 'shared' }); } catch {} });
  $('#doSave')?.addEventListener('click', () => track('us_share', { sign, step: 'saved' }));
  $('#doLink')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { prompt('Copy this link', link); } track('us_share', { sign, step: 'link' }); });
}
export const shareSign = (p) => shareImage(() => drawCard({ art: `../art/pillars/${p.art}`, el: elOf(p), kicker: 'My sign', title: signName(p), sub: p.name, meta: `${fullName(p)} · No. ${p.no} of 60`, body: p.intro }), `flowday-${p.slug}.jpg`, p.slug, `${shareBase()}s/${p.slug}`);
export const sharePair = (o) => shareImage(() => drawCard(o), `flowday-pair.jpg`, 'pair');
export const drawCardPublic = drawCard;
