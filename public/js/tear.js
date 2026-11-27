// 撕日历：每天第一次打开，屏幕上还挂着昨天那一页老黄历；往下一拉（或点「撕掉昨天」），
// 「刺啦」一声撕下来，露出今天这一页和今天的画，再回到今天页。注册当天没有「昨天」，不出现。
import { pillarArtSrc } from './data.js';
import { $, esc, localToday, ymd, seen, mark, track, EN, MONTH_EN, lunarText, gzText } from './core.js';
import { S } from './state.js';
import { tm } from './i18n.js';
const t = tm('today'); // 先查 i18n/en/today.json

const WEEK = '日一二三四五六';
const MONTH_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const short = (arr, n) => (arr || []).slice(0, n).map((w) => (/[\u4e00-\u9fff]/.test(w) ? t(w) : w)).join(EN ? ', ' : ' ');
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 一页日历：大红抬头、大数字、星期、农历干支、宜忌
function pageHtml(a, cls) {
  const red = a.week === 0 || a.week === 6;
  return `<div class="${cls}"><div class="thd"><span>${a.y}</span><b>${EN ? MONTH_EN[a.m - 1] : MONTH_CN[a.m - 1] + '月'}</b><span>${EN ? WEEK_EN[a.week] : '星期' + WEEK[a.week]}</span></div>`
    + `<div class="tnum${red ? ' red' : ''}">${a.d}</div>`
    + `<div class="tlu">${esc(lunarText(a.lunar))} · ${esc(t('{gz}日', { gz: gzText(a.gz) }))}${a.lunar.jieqi ? ' · ' + esc(/[\u4e00-\u9fff]/.test(a.lunar.jieqi) ? t(a.lunar.jieqi) : a.lunar.jieqi) : ''}</div>`
    + `<div class="tyj"><p><b>${t('宜')}</b>${esc(short(a.yi, EN ? 3 : 4))}</p><p><b class="ji">${t('忌')}</b>${esc(short(a.ji, EN ? 2 : 3))}</p></div></div>`;
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
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', t('撕下昨天的日历'));
  el.innerHTML = '<div class="tpad"><div class="trings" aria-hidden="true"><i></i><i></i></div>'
    + `<div class="tunder">${pageHtml(today, 'tpage')}${art ? `<img class="tart" src="${esc(pillarArtSrc(art.art))}" alt="">` : ''}</div>`
    + `${pageHtml(d.prev, 'tpage tleaf')}</div>`
    + `<p class="ttip">${t('往下拉，撕掉昨天')}</p><button type="button" class="btn ghost tgo">${t('撕掉昨天')}</button>`;
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
