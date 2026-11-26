// 撕日历：每天第一次打开，屏幕上还挂着昨天那一页老黄历；往下一拉（或点「撕掉昨天」），
// 「刺啦」一声撕下来，露出今天这一页和今天的画，再回到今天页。注册当天没有「昨天」，不出现。
import { pillarArtSrc } from './data.js';
import { $, esc, localToday, ymd, seen, mark, track } from './core.js';
import { S } from './state.js';

const WEEK = '日一二三四五六';
const MONTH_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const short = (arr, n) => (arr || []).slice(0, n).join(' ');

// 一页日历：大红抬头、大数字、星期、农历干支、宜忌
function pageHtml(a, cls) {
  const red = a.week === 0 || a.week === 6;
  return `<div class="${cls}"><div class="thd"><span>${a.y}</span><b>${MONTH_CN[a.m - 1]}月</b><span>星期${WEEK[a.week]}</span></div>`
    + `<div class="tnum${red ? ' red' : ''}">${a.d}</div>`
    + `<div class="tlu">农历${esc(a.lunar.monthCn)}月${esc(a.lunar.dayCn)} · ${esc(a.gz)}日${a.lunar.jieqi ? ' · ' + esc(a.lunar.jieqi) : ''}</div>`
    + `<div class="tyj"><p><b>宜</b>${esc(short(a.yi, 4))}</p><p><b class="ji">忌</b>${esc(short(a.ji, 3))}</p></div></div>`;
}

// 撕纸声：一小段滤过的噪声，按随机的小块起伏，听起来像纸纤维一根根断开
function tearSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC(), len = Math.floor(ac.sampleRate * 0.42), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    let amp = 0;
    for (let i = 0; i < len; i++) {
      if (i % 220 === 0) amp = Math.random() < 0.7 ? 0.35 + Math.random() * 0.65 : 0.08;
      ch[i] = (Math.random() * 2 - 1) * amp * Math.min(1, i / 400) * (1 - i / len) ** 1.4;
    }
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7; g.gain.value = 0.55;
    src.buffer = buf; src.connect(bp).connect(g).connect(ac.destination); src.start();
    setTimeout(() => ac.close(), 800);
  } catch { /* 没有声音也不影响 */ }
}

// 该不该撕：今天第一次打开、不是注册当天、引导看过了、不是点朋友链接进来的
export function shouldTear(d) {
  if (!d || !d.prev || !d.jiazi || !d.jiazi.fresh || !S.me || S.linking || !seen('guide')) return false;
  const day = localToday();
  if (seen('tear:' + day)) return false;
  return S.me.createdAt && ymd(new Date(S.me.createdAt)) < day;
}

// 显示撕页；撕完调用 done
export function showTear(d, art, done) {
  const day = localToday();
  mark('tear:' + day);
  const [y, m, dd] = day.split('-').map(Number), w = new Date(y, m - 1, dd).getDay();
  const today = { ...(d.almanac || {}), y, m, d: dd, week: w };
  const el = document.createElement('div');
  el.className = 'tear'; el.id = 'tear';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '撕下昨天的日历');
  el.innerHTML = '<div class="tpad"><div class="trings" aria-hidden="true"><i></i><i></i></div>'
    + `<div class="tunder">${pageHtml(today, 'tpage')}${art ? `<img class="tart" src="${esc(pillarArtSrc(art.art))}" alt="">` : ''}</div>`
    + `${pageHtml(d.prev, 'tpage tleaf')}</div>`
    + '<p class="ttip">往下拉，撕掉昨天</p><button type="button" class="btn ghost tgo">撕掉昨天</button>';
  document.body.appendChild(el);
  const leaf = $('.tleaf', el);
  let y0 = null, dy = 0, torn = false;
  const finish = () => {
    if (torn) return;
    torn = true;
    tearSound();
    if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
    track('calendar_tear', {});
    el.classList.add('torn');
    leaf.style.transform = '';
    setTimeout(() => el.classList.add('out'), 1250);
    setTimeout(() => { el.remove(); done && done(); }, 1650);
  };
  leaf.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; leaf.setPointerCapture(e.pointerId); leaf.style.transition = 'none'; });
  leaf.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    leaf.style.transform = `translateY(${dy * 0.5}px) rotate(${dy / 45}deg)`;
  });
  const up = () => {
    if (y0 == null) return;
    y0 = null;
    leaf.style.transition = '';
    if (dy > 70) finish(); else leaf.style.transform = '';
  };
  leaf.addEventListener('pointerup', up);
  leaf.addEventListener('pointercancel', up);
  $('.tgo', el).addEventListener('click', finish);
  // 没理它也不挡路：15 秒后自己撕掉
  setTimeout(() => { if (el.isConnected && !torn) finish(); }, 15000);
}
