// 新用户引导：填出生信息 → 能量卡揭晓（不用注册）→ 注册 → 三步引导 → 加到主屏。
import { $, $$, esc, api, toast, openSheet, dismissSheet, onClick, currentPath, mark, seen, readLocal, writeLocal, IS_IOS, IS_IPAD, IS_MOBILE, SAFARI_VER, IS_STANDALONE, IN_APP, installKind, ENV_NAME, copyText, track, EN, MON } from './core.js';
import { S } from './state.js';
import { pillarArtSrc, setGlow, WX } from './data.js';
import { wheelsHtml, mountWheels } from './wheel.js';
import { tm } from './i18n.js';
const t = tm('onboard'); // 先查 i18n/en/onboard.json

// ---------- 出生信息表单（引导页和我的资料共用） ----------
// 公历或农历；出生城市用来换算真太阳时；真太阳时落在两个时辰交界附近时，让用户选按哪个时辰算。
const CN_MONTH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const CN_DAY = (d) => (d === 10 ? '初十' : d === 20 ? '二十' : d === 30 ? '三十' : ['初', '十', '廿'][Math.floor((d - 1) / 10)] + '一二三四五六七八九十'[(d - 1) % 10]);
const pad2 = (n) => String(n).padStart(2, '0');
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const zhiIdx = (h, m) => Math.floor(((h * 60 + m + 60) % 1440) / 120);
// 英文：时辰写成钟点（7–9 AM、11 PM–1 AM），干支写拼音（辛亥 → Xin Hai），日期按英文顺序
const GAN_PY = { 甲: 'Jia', 乙: 'Yi', 丙: 'Bing', 丁: 'Ding', 戊: 'Wu', 己: 'Ji', 庚: 'Geng', 辛: 'Xin', 壬: 'Ren', 癸: 'Gui' };
const ZHI_PY = { 子: 'Zi', 丑: 'Chou', 寅: 'Yin', 卯: 'Mao', 辰: 'Chen', 巳: 'Si', 午: 'Wu', 未: 'Wei', 申: 'Shen', 酉: 'You', 戌: 'Xu', 亥: 'Hai' };
export const gzText = (gz) => (EN && gz ? [...gz].map((c, i) => (i === 0 ? GAN_PY[c] : ZHI_PY[c]) || c).join(' ') : gz || '');
const h12 = (h) => (h % 12 === 0 ? 12 : h % 12), ap = (h) => (h < 12 ? 'AM' : 'PM');
export const hourRangeEn = (i) => { const a = (i * 2 + 23) % 24, b = (i * 2 + 1) % 24; return ap(a) === ap(b) ? `${h12(a)}–${h12(b)} ${ap(b)}` : `${h12(a)} ${ap(a)}–${h12(b)} ${ap(b)}`; };
const zhiRange = (i) => (EN ? hourRangeEn(i) : `${(i * 2 + 23) % 24}–${(i * 2 + 1) % 24} 点`);
// 时辰：中文「辰时」，英文写钟点
const zhiName = (i) => (EN ? hourRangeEn(i) : ZHI[i] + '时');
const solarLabel = (d) => { const [y, m, dd] = d.split('-').map(Number); return EN ? `${MON[m - 1]} ${dd}, ${y}` : `${y}年${m}月${dd}日`; };
const lunarLabel = (L) => (EN ? `Lunar ${L.leap ? 'leap ' : ''}${L.m}/${L.d}, ${L.y}` : `农历${L.y}年${L.leap ? '闰' : ''}${CN_MONTH[L.m - 1]}月${CN_DAY(L.d)}`);
// 经度：东经 113.3° / 113.3°E
const lngText = (lng) => (EN ? `${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}` : `${lng >= 0 ? '东经' : '西经'} ${Math.abs(lng).toFixed(1)}°`);
// 出生日期、时间都点开底部的滚轮一次选完；选好的值放在隐藏字段里，表单显示成一行字
export function birthFields(b, nickname) {
  b = b || {};
  const noTime = b.date && !b.time, lunar = b.cal === 'lunar', L = b.lunar || {};
  return (nickname !== undefined ? `<label class="field"><span>${t('称呼')}</span><input name="nickname" maxlength="12" placeholder="${t('日历上怎么称呼你（选填）')}" value="${esc(nickname || '')}"></label>` : '')
    + `<div class="field"><span>${t('出生日期')}</span>`
    + `<input type="hidden" name="cal" value="${lunar ? 'lunar' : 'solar'}"><input type="hidden" name="date" value="${esc(b.date || '')}">`
    + `<input type="hidden" name="ly" value="${L.y || ''}"><input type="hidden" name="lm" value="${L.m || ''}"><input type="hidden" name="ld" value="${L.d || ''}"><input type="hidden" name="leap" value="${L.leap ? 1 : 0}">`
    + '<button type="button" class="pickbox" data-pick-date aria-haspopup="dialog"><span data-date-text></span><i aria-hidden="true">›</i></button><span class="hint" data-conv></span></div>'
    + `<div class="field"><span>${t('出生时间')}</span><input type="hidden" name="time" value="${esc(b.time || '')}">`
    + `<button type="button" class="pickbox" data-pick-time aria-haspopup="dialog"${noTime ? ' disabled' : ''}><span data-time-text></span><i aria-hidden="true">›</i></button>`
    + `<label class="check" style="margin-top:4px"><input type="checkbox" name="notime"${noTime ? ' checked' : ''}><span>${t('不知道具体时间（只按年、月、日推算，会粗一些）')}</span></label></div>`
    + `<div class="field citybox"><span>${t('出生城市')}</span><input name="city" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="40" placeholder="${t('输入城市，比如：广州（选填）')}" value="${esc(b.cityLabel || b.city || '')}" data-city="${esc(b.city || '')}" role="combobox" aria-expanded="false" aria-autocomplete="list" enterkeyhint="done"><div class="sugg" role="listbox" hidden></div><span class="hint" data-cityhint>${t('用来换算真太阳时，时辰更准；不填就按北京时间算')}</span></div>`
    + '<div class="solar" data-solar hidden></div>'
    + `<div class="edge" data-edge hidden data-zhi="${esc(b.zhi || '')}"></div>`
    + `<div class="field"><span>${t('性别')}</span><div class="pills" data-gender>${['女', '男'].map((g) => `<button type="button" aria-pressed="${b.gender === g}" data-g="${g}">${t(g)}</button>`).join('')}</div><span class="hint">${t('只用来推算大运的方向')}</span></div>`;
}
export function readBirth(f) {
  const g = $('[data-gender] [aria-pressed="true"]', f);
  const el = f.elements, edge = $('[data-edge]', f), lunar = el.cal.value === 'lunar';
  return {
    cal: lunar ? 'lunar' : 'solar',
    date: lunar ? ((f._pv && f._pv.date) || '') : (el.date.value || ''),
    lunar: lunar && el.ly.value ? { y: +el.ly.value, m: +el.lm.value, d: +el.ld.value, leap: el.leap.value === '1' } : undefined,
    time: el.notime.checked ? null : (el.time.value || null),
    gender: g ? g.getAttribute('data-g') : '',
    city: el.city.dataset.city || null, cityText: el.city.value.trim(),
    zhi: edge.hidden ? null : (edge.dataset.zhi || null),
  };
}

// ---------- 滚轮：出生日期（公历 / 农历，年月日一次选完）、出生时间（时分） ----------
const lunarMonthsCache = {};
const getLunarMonths = (y) => (lunarMonthsCache[y] ? Promise.resolve(lunarMonthsCache[y]) : api('GET', 'lunar/months?y=' + y).then((d) => (lunarMonthsCache[y] = d.months)));
const seq = (n, label) => Array.from({ length: n }, (_, i) => ({ v: i + 1, label: label(i + 1) }));
function openDatePicker(f) {
  const el = f.elements, yNow = new Date().getFullYear();
  const years = Array.from({ length: yNow - 1900 }, (_, i) => ({ v: 1901 + i, label: t('{y} 年', { y: 1901 + i }) }));
  let cal = el.cal.value === 'lunar' && el.ly.value ? 'lunar' : 'solar', st;
  if (cal === 'lunar') st = { y: +el.ly.value, m: +el.lm.value, d: +el.ld.value, leap: el.leap.value === '1' };
  else if (el.date.value) { const [y, m, d] = el.date.value.split('-').map(Number); st = { y, m, d, leap: false }; } else st = { y: 1995, m: 1, d: 1, leap: false };
  let months = [], W = null, lastPv = null, pvTimer;
  const body = openSheet(t('出生日期'), `<div class="wpick"><div class="wtop"><span class="segs" role="group" aria-label="${t('历法')}">`
    + `<button type="button" data-wcal="solar" aria-pressed="${cal === 'solar'}">${t('公历')}</button><button type="button" data-wcal="lunar" aria-pressed="${cal === 'lunar'}">${t('农历')}</button></span>`
    + `<b class="wlive" data-wlive></b></div><div data-wbox></div><button type="button" class="btn primary block" data-wok>${t('确定')}</button></div>`);
  const monthItems = () => (cal === 'solar' ? seq(12, (m) => (EN ? MON[m - 1] : m + ' 月')) : months.map((x) => ({ v: x.m, label: EN ? `${x.leap ? 'Leap ' : ''}Month ${x.m}` : `${x.leap ? '闰' : ''}${CN_MONTH[x.m - 1]}月` })));
  const mIndex = () => (cal === 'solar' ? st.m - 1 : Math.max(0, months.findIndex((x) => x.m === st.m && x.leap === st.leap)));
  const daysIn = () => (cal === 'solar' ? new Date(st.y, st.m, 0).getDate() : (months.find((x) => x.m === st.m && x.leap === st.leap) || { days: 30 }).days);
  const dayItems = () => seq(daysIn(), (d) => (EN ? String(d) : cal === 'solar' ? d + ' 日' : CN_DAY(d)));
  // 上方实时显示选中的日期，并对照另一种历法
  const live = () => {
    const txt = cal === 'solar' ? solarLabel(`${st.y}-${st.m}-${st.d}`) : lunarLabel(st);
    $('[data-wlive]', body).textContent = txt;
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      const birth = cal === 'solar' ? { cal, date: `${st.y}-${pad2(st.m)}-${pad2(st.d)}` } : { cal, lunar: { ...st } };
      api('POST', 'birth/preview', { birth }).then((pv) => {
        lastPv = pv;
        const w = $('[data-wlive]', body);
        if (w) w.textContent = txt + (cal === 'solar' ? ' · ' + (EN ? lunarLabel(pv.lunar).replace(/, \d+$/, '') : `农历${pv.lunar.text.replace(/^.+?年/, '')}`) : ` · ${t('公历')}${EN ? ' ' : ''}${solarLabel(pv.date)}`);
      }, () => {});
    }, 150);
  };
  const fixDays = () => { st.d = Math.min(st.d, daysIn()); W.setItems(2, dayItems(), st.d - 1); };
  const onChange = (col, k) => {
    if (col === 0) {
      st.y = years[k].v;
      if (cal === 'lunar') {
        getLunarMonths(st.y).then((ms) => {
          months = ms;
          if (!months.some((x) => x.m === st.m && x.leap === st.leap)) st.leap = false;
          W.setItems(1, monthItems(), mIndex()); fixDays(); live();
        });
        return;
      }
      fixDays();
    }
    if (col === 1) { if (cal === 'solar') st.m = k + 1; else { st.m = months[k].m; st.leap = months[k].leap; } fixDays(); }
    if (col === 2) st.d = k + 1;
    live();
  };
  const build = () => {
    const box = $('[data-wbox]', body);
    box.innerHTML = wheelsHtml([{ items: years, flex: 1.3, name: t('年') }, { items: monthItems(), name: t('月') }, { items: dayItems(), name: t('日') }]);
    W = mountWheels(box, [{ index: st.y - 1901 }, { index: mIndex() }, { index: st.d - 1 }], onChange);
    live();
  };
  const start = () => (cal === 'lunar' ? getLunarMonths(st.y).then((ms) => { months = ms; build(); }) : build());
  start();
  body.addEventListener('click', (e) => {
    const c = e.target.closest('[data-wcal]');
    if (c && c.getAttribute('data-wcal') !== cal) {
      cal = c.getAttribute('data-wcal');
      $$('[data-wcal]', body).forEach((b) => b.setAttribute('aria-pressed', b === c ? 'true' : 'false'));
      // 换历法时把选好的日期换算过去
      if (lastPv) {
        if (cal === 'lunar') st = { y: lastPv.lunar.y, m: lastPv.lunar.m, d: lastPv.lunar.d, leap: lastPv.lunar.leap };
        else { const [y, m, d] = lastPv.date.split('-').map(Number); st = { y, m, d, leap: false }; }
      }
      start();
    }
    if (e.target.closest('[data-wok]')) {
      if (W) W.flush();
      el.cal.value = cal;
      if (cal === 'solar') el.date.value = `${st.y}-${pad2(st.m)}-${pad2(st.d)}`;
      else { el.ly.value = st.y; el.lm.value = st.m; el.ld.value = st.d; el.leap.value = st.leap ? '1' : '0'; if (lastPv) el.date.value = lastPv.date; }
      dismissSheet();
      f.dispatchEvent(new Event('birthset'));
    }
  });
}
function openTimePicker(f) {
  const el = f.elements;
  let [h, m] = (el.time.value || '12:00').split(':').map(Number);
  const body = openSheet(t('出生时间'), '<div class="wpick"><div class="wtop"><b class="wlive" data-wlive></b></div><div data-wbox></div>'
    + `<button type="button" class="btn primary block" data-wok>${t('确定')}</button><button type="button" class="tbtn wno" data-wnotime>${t('不知道具体时间')}</button></div>`);
  const live = () => { const i = zhiIdx(h, m); $('[data-wlive]', body).textContent = `${pad2(h)}:${pad2(m)} · ` + (EN ? 'double-hour ' + zhiRange(i) : `${ZHI[i]}时（${zhiRange(i)}）`); };
  const box = $('[data-wbox]', body);
  box.innerHTML = wheelsHtml([{ items: Array.from({ length: 24 }, (_, i) => ({ v: i, label: t('{n} 时', { n: pad2(i) }) })), name: t('时') }, { items: Array.from({ length: 60 }, (_, i) => ({ v: i, label: t('{n} 分', { n: pad2(i) }) })), name: t('分') }]);
  const TW = mountWheels(box, [{ index: h }, { index: m }], (c, k) => { if (c === 0) h = k; else m = k; live(); });
  live();
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-wok]')) { TW.flush(); el.time.value = `${pad2(h)}:${pad2(m)}`; el.notime.checked = false; }
    else if (e.target.closest('[data-wnotime]')) { el.time.value = ''; el.notime.checked = true; }
    else return;
    dismissSheet();
    f.dispatchEvent(new Event('birthset'));
  });
}

// 真太阳时怎么来的，用大白话说：钟表时间 →（夏令时）→ 出生地经度 → 季节
function solarHtml(pv) {
  const s = pv.solar;
  if (!s) return '';
  const zone = !pv.tz || pv.tz === 'Asia/Shanghai' ? t('北京时间') : t('当地时间');
  const fast = (n) => { const v = { n: Math.abs(Math.round(n)) }; return n > 0 ? t('快 {n} 分钟', v) : t('慢 {n} 分钟', v); };
  const lng = typeof pv.lng === 'number' ? lngText(pv.lng) : '';
  const parts = [t('钟表是{zone} {clock}', { zone, clock: s.clock })];
  if (s.dstMinutes) parts.push(t('那年夏天实行夏令时，钟表拨快了 {n} 分钟，要减回来', { n: s.dstMinutes }));
  if (Math.round(s.lngMinutes)) parts.push(t('{city}在{lng}，太阳比{zone}{fast}', { city: esc(pv.city), lng, zone, fast: fast(s.lngMinutes) }));
  if (Math.round(s.eotMinutes)) parts.push(t('这个季节太阳走得{fast}', { fast: fast(s.eotMinutes) }));
  const day = s.date !== pv.date ? (EN ? `${MON[+s.date.slice(5, 7) - 1]} ${+s.date.slice(8)} ` : s.date.slice(5).replace('-', '月') + '日 ') : '';
  return `<span class="sico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg></span><div><b>${t('真太阳时 {when}', { when: day + s.time })}</b><small>${parts.join(t('；'))}${t('。')}</small></div>`;
}
export function wireBirth(f) {
  const el = f.elements, conv = $('[data-conv]', f), solar = $('[data-solar]', f), edge = $('[data-edge]', f), sugg = $('.sugg', f), city = el.city;
  let pvTimer, cityTimer, pseq = 0;
  const isLunar = () => el.cal.value === 'lunar';
  // 表单上显示选好的日期和时间
  const syncText = () => {
    const dt = $('[data-date-text]', f), tt = $('[data-time-text]', f);
    const d = isLunar() && el.ly.value ? lunarLabel({ y: +el.ly.value, m: +el.lm.value, d: +el.ld.value, leap: el.leap.value === '1' }) : el.date.value ? solarLabel(el.date.value) : '';
    dt.textContent = d || t('选择年、月、日'); dt.classList.toggle('ph', !d);
    const tv = el.notime.checked ? '' : el.time.value;
    tt.textContent = el.notime.checked ? t('不知道') : tv ? (EN ? tv : `${tv} · ${ZHI[zhiIdx(...tv.split(':').map(Number))]}时`) : t('选择几点几分');
    tt.classList.toggle('ph', !tv);
    $('[data-pick-time]', f).disabled = el.notime.checked;
  };
  // 实时预览：农历和公历互相对照、真太阳时、时辰交界
  const preview = () => {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      const b = readBirth(f), my = ++pseq;
      if (!b.date && !b.lunar) { conv.textContent = ''; solar.hidden = true; edge.hidden = true; return; }
      api('POST', 'birth/preview', { birth: b }).then((pv) => {
        if (my !== pseq) return;
        f._pv = pv;
        conv.textContent = isLunar() ? t('对应公历 {date}', { date: solarLabel(pv.date) }) : (EN ? lunarLabel(pv.lunar) : `农历${pv.lunar.text}`);
        conv.classList.remove('bad');
        solar.innerHTML = solarHtml(pv); solar.hidden = !pv.solar;
        if (pv.edge) {
          const e = pv.edge, cur = edge.dataset.zhi && [e.before, e.after].includes(edge.dataset.zhi) ? edge.dataset.zhi : e.current;
          edge.dataset.zhi = cur;
          edge.innerHTML = `<span>${t('你出生在<b>{a}</b>和<b>{b}</b>交界附近（相差 {n} 分钟），两种时辰算出来不一样。拿不准的话可以先按默认的，以后在「我的资料」里随时换。', { a: zhiName(ZHI.indexOf(e.before)), b: zhiName(ZHI.indexOf(e.after)), n: e.minutes })}</span>`
            + `<span class="segs" role="group" aria-label="${t('按哪个时辰算')}">${[[e.before, e.beforeRange], [e.after, e.afterRange]].map(([z, r]) => `<button type="button" data-zhi="${z}" aria-pressed="${z === cur}">${EN ? 'Use ' + hourRangeEn(ZHI.indexOf(z)) : `按${z}时（${r} 点）`}</button>`).join('')}</span>`;
          edge.hidden = false;
        } else edge.hidden = true;
      }, (e) => { if (my !== pseq) return; f._pv = null; conv.textContent = e.status === 400 ? e.message : ''; conv.classList.add('bad'); solar.hidden = true; edge.hidden = true; });
    }, 250);
  };
  f.addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]');
    if (g) $$('[data-g]', f).forEach((b) => b.setAttribute('aria-pressed', b === g ? 'true' : 'false'));
    if (e.target.closest('[data-pick-date]')) openDatePicker(f);
    if (e.target.closest('[data-pick-time]')) openTimePicker(f);
    const z = e.target.closest('[data-zhi]');
    if (z) { edge.dataset.zhi = z.getAttribute('data-zhi'); $$('[data-zhi]', edge).forEach((b) => b.setAttribute('aria-pressed', b === z ? 'true' : 'false')); }
    const o = e.target.closest('[data-city-pick]');
    if (o) {
      const name = o.getAttribute('data-city-pick');
      city.value = name ? o.getAttribute('data-label') || name : ''; city.dataset.city = name; // 显示英文名，提交的是城市的标识
      sugg.hidden = true; city.setAttribute('aria-expanded', 'false');
      $('[data-cityhint]', f).textContent = name ? o.getAttribute('data-sub') : t('没填城市，按北京时间算');
      preview();
    }
  });
  el.notime.addEventListener('change', () => { syncText(); preview(); });
  f.addEventListener('birthset', () => { syncText(); preview(); });
  syncText();
  // 出生城市联想：输入一两个字就出候选，最后一项是“不确定”
  city.addEventListener('input', () => {
    city.dataset.city = '';
    clearTimeout(cityTimer);
    const q = city.value.trim();
    if (!q) { sugg.hidden = true; city.setAttribute('aria-expanded', 'false'); $('[data-cityhint]', f).textContent = t('用来换算真太阳时，时辰更准；不填就按北京时间算'); preview(); return; }
    cityTimer = setTimeout(() => api('GET', 'cities?q=' + encodeURIComponent(q)).then((d) => {
      if (city.value.trim() !== q) return;
      sugg.innerHTML = d.list.map((c) => `<button type="button" role="option" data-city-pick="${esc(c.name)}" data-label="${esc(c.label || c.name)}" data-sub="${esc(c.province)} · ${lngText(c.lng)}"><span>${esc(c.label || c.name)}</span><small>${esc(c.province)} · ${lngText(c.lng)}</small></button>`).join('')
        + (d.list.length ? '' : `<div class="none">${t('没找到这个城市，换个写法试试，比如写地级市')}</div>`)
        + `<button type="button" role="option" data-city-pick=""><span>${t('不确定，按北京时间算')}</span></button>`;
      sugg.hidden = false; city.setAttribute('aria-expanded', 'true');
    }, () => {}), 150);
  });
  city.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = $('[data-city-pick]', sugg); if (!sugg.hidden && first) first.click(); } });
  if (city.dataset.city) { const c = city.dataset.city; api('GET', 'cities?q=' + encodeURIComponent(c)).then((d) => { const x = d.list.find((y) => y.name === c); if (x) $('[data-cityhint]', f).textContent = `${x.province} · ${lngText(x.lng)}`; }, () => {}); }
  preview();
}
export function checkBirth(b) {
  if (b.cal === 'lunar' ? !(b.lunar && b.lunar.y && b.lunar.m && b.lunar.d) : !b.date) return t('请填写出生日期');
  if (b.date) {
    const age = (Date.now() - Date.parse(b.date)) / (365.25 * 86400000);
    if (age < 14) return t('flowday 暂不面向 14 岁以下的朋友');
  }
  if (b.cityText && !b.city) return t('出生城市请从列表里选一个，不确定就清空');
  if (!b.gender) return t('请选择性别');
  return '';
}

// ---------- 填出生信息 ----------
function birthPage({ title, sub, submitText, onSubmit, birth, nickname, lead = '' }) {
  $('#view').innerHTML = `<div class="auth" style="justify-content:flex-start;padding-top:8px"><div class="hero2">${lead}<b>${title}</b><span>${sub}</span></div>`
    + `<section class="card"><form class="form" id="bForm" novalidate>${birthFields(birth, nickname || '')}<div class="err" id="bErr"></div><button class="btn primary block" type="submit">${submitText}</button></form></section>`
    + `<p class="note" style="text-align:center;margin:0">${t('出生信息只用来推算你的日历。我们不收手机号、照片和通讯录。')}</p></div>`;
  const f = $('#bForm'); wireBirth(f);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const b = readBirth(f), msg = checkBirth(b);
    if (msg) { $('#bErr').textContent = msg; return; }
    const btn = $('button[type=submit]', f); btn.disabled = true;
    onSubmit(b, f.elements.nickname.value.trim()).catch((err) => { btn.disabled = false; $('#bErr').textContent = err.message; });
  });
}

export function pageStart() {
  const p = readLocal('pending'), inv = readLocal('invite');
  birthPage({
    title: t('测测你的能量卡'), sub: t('填一下出生信息，马上看到你的本命形象和幸运元素。不用注册。'), submitText: t('看我的能量卡'),
    lead: inv && inv.name ? `<small class="invlead">${t('{name} 邀请你来测', { name: esc(inv.name) })}</small>` : '',
    birth: p && p.birth, nickname: p && p.nickname,
    onSubmit: (birth, nickname) => api('POST', 'preview/card', { birth, nickname }).then((d) => {
      writeLocal('pending', { birth, nickname, card: d.card });
      S.cardReveal = true;
      track('card_preview', { dm: d.card.dm });
      location.hash = '#/card';
    }),
  });
}

export function pageWelcome() {
  birthPage({
    title: t('先认识一下你'), sub: t('填一下出生信息，生成你的能量卡和个人行动日历。'), submitText: t('生成我的能量卡'),
    birth: S.me.birth, nickname: S.me.nickname,
    onSubmit: (birth, nickname) => api('PUT', 'me/profile', { nickname, bio: S.me.bio || '', birth }).then((d) => {
      S.me = d.user; S.today = null; S.cal = null; S.justRegistered = true; S.cardReveal = true;
      location.hash = '#/card';
    }),
  });
}

// ---------- 能量卡揭晓 ----------
// 日柱插画（旧数据没有日柱时退回本命形象的那个字）；能量卡、我的、注册页、邀请横幅共用。
// 旁边总有「日柱 · 称号」的标题，插画只是装饰，alt 留空免得读屏念两遍
export const cardArt = (c, cls = 'art') => (c.pillar
  ? `<span class="${cls}"><img src="${esc(pillarArtSrc(c.pillar.art))}" alt="" width="600" height="600" decoding="async"></span>`
  : `<span class="sym" aria-hidden="true">${esc(c.symbol)}</span>`);
// 本命形象一行：中文「辛金 · 珍珠型」，英文「Xin Metal · The Pearl」
const typeLine = (c) => (EN ? `${GAN_PY[c.dm] || c.dm || ''} ${t(c.element)} · The ${c.en}` : `${c.dm || ''}${c.element} · ${c.image}型`);
export const cardTitle = (c) => (c.pillar ? `${gzText(c.pillar.gz)} · ${c.pillar.name}` : typeLine(c));
const cardSub = (c) => (EN ? typeLine(c) : `${typeLine(c)} · The ${c.en}`);
// 「你的能量卡」/「小满 的能量卡」
const cardOf = (name) => (name ? t('{name} 的能量卡', { name: esc(name) }) : t('你的能量卡'));
// 出生那天：农历哪天、月亮什么样、节气后第几天（英文不写农历日子）
const bornLine = (b) => (b ? `<p class="born">${EN
  ? `The day you were born · ${t(b.moon)} · ${b.days ? `${b.days} day${b.days > 1 ? 's' : ''} after ${t(b.term)}` : `on ${t(b.term)}`}`
  : `你出生那天 · 农历${b.lunar} · ${b.moon} · ${b.days ? `${b.term}后第 ${b.days} 天` : `正逢${b.term}`}`}</p>` : '');
const forceBar = (c, total, title) => `<div class="fbar" aria-label="${t('五行比例')}">${c.force.map((f, i) => `<i class="w${i}b" style="flex:${f.pct / total}"${title ? ` title="${t(f.el)} ${f.pct}%"` : ''}></i>`).join('')}</div>`
  + `<div class="flab">${c.force.map((f) => `<span>${t(f.el)} ${f.pct}%</span>`).join('')}</div>`;
const traitsHtml = (c, cls = '') => `<div class="traits${cls}">${c.traits.map((x) => `<span>${t(x)}</span>`).join('')}</div>`;
const luckyHtml = (c, cls = '') => `<div class="lucky2${cls}">${t('幸运元素')} <b>${c.lucky.map((x) => t(x)).join(' · ')}</b></div>`;
export function cardHtml(c, name) {
  const total = c.force.reduce((a, f) => a + f.pct, 0) || 100;
  const p = c.pillar;
  const zhi = c.basis ? (EN ? hourRangeEn(ZHI.indexOf(c.basis.zhi)) : c.basis.zhi) : '';
  return `<div class="ecard"><small>${cardOf(name)}</small>${cardArt(c)}`
    + `<b class="ttl">${esc(cardTitle(c))}</b><span class="en">${p ? esc(cardSub(c)) : `The ${c.en}`}</span>`
    + traitsHtml(c)
    + `<p class="intro">${esc(p ? p.intro : c.intro)}</p><p class="sl">${esc(p ? p.line : c.strengthLine)}</p>`
    + forceBar(c, total, true)
    + luckyHtml(c)
    + (c.basis ? `<div class="basis">${c.basis.solar ? t('按真太阳时 {time} · {zhi}时排盘 · {city}', { time: c.basis.time, zhi, city: esc(c.basis.city) }) : t('按北京时间 {time} · {zhi}时排盘（没填出生城市）', { time: c.basis.time, zhi })}</div>` : '') + '</div>';
}

// 朋友邀请来测的：完整能量卡下面给一张「你和 TA 的画」（邀请模块按需加载，免得循环引用）
function loadPair() {
  const p = readLocal('pending'), inv = readLocal('invite');
  if (!p || !p.birth || !inv || !inv.code || Date.now() - (inv.at || 0) > 30 * 86400000) return;
  api('POST', 'pair', { birth: p.birth, code: inv.code }).then((d) => import('./growth.js').then(({ pairHtml }) => {
    const box = $('#pairBox');
    if (!box) return;
    box.innerHTML = pairHtml(d.pair, d.best, d.name, t('注册后，{name}也会在邀请记录里看到你们的画。', { name: esc(d.name) }));
    track('pair_view', { from: 'invitee', kind: d.pair.kind });
  }), () => {});
}
// 刚测完时分三张翻开：日柱插画和称号 → 性格 → 五行和幸运元素，最后再看完整的卡
function stepHtml(c, name, k) {
  const total = c.force.reduce((a, f) => a + f.pct, 0) || 100;
  const head = `<small>${cardOf(name)} · ${k + 1} / 3</small>`;
  const body = [
    `${cardArt(c)}<b class="ttl">${esc(cardTitle(c))}</b><span class="en">${c.pillar ? esc(typeLine(c)) : `The ${c.en}`}</span><p class="intro">${esc(c.pillar ? c.pillar.intro : c.intro)}</p>${bornLine(c.born)}`,
    `<p class="slead">${t('你是这样的人')}</p>${traitsHtml(c, ' big')}<p class="sl">${esc(c.pillar ? c.pillar.line : c.strengthLine)}</p>`,
    `<p class="slead">${t('你身上的五种能量')}</p>${forceBar(c, total, false)}${luckyHtml(c, ' big')}<p class="sl">${t('每天哪股能量当家，决定了这天对你顺不顺。')}</p>`,
  ][k];
  return `<button type="button" class="ecard step" data-card-next aria-label="${t('翻开下一张')}">${head}${body}</button>`
    + `<div class="stepnav"><span class="dots3">${[0, 1, 2].map((i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</span><button type="button" class="btn primary" data-card-next>${k < 2 ? t('翻开下一张') : t('看完整能量卡')}</button></div>`;
}
let reveal = null;
export function pageCard() {
  const v = $('#view');
  const full = (c, name, actions) => {
    v.innerHTML = `<div class="reveal">${cardHtml(c, name)}<div id="pairBox"></div><div class="acts">${actions}</div>${c.noTime ? `<p class="note" style="margin:0;text-align:center">${t('没填出生时间，按年、月、日三柱推算。')}</p>` : ''}</div>`;
    if (!S.me) loadPair();
  };
  const show = (c, name, actions) => {
    setGlow(WX.indexOf(c.element));
    S.shareCard = { card: c, name };
    if (!S.cardReveal) { full(c, name, actions); return; }
    S.cardReveal = false;
    reveal = { c, name, actions, k: 0, full };
    v.innerHTML = `<div class="reveal stepped">${stepHtml(c, name, 0)}</div>`;
  };
  if (S.me) {
    v.innerHTML = '<div class="sk" style="height:520px"></div>';
    api('GET', 'me/card').then((d) => currentPath() === '/card' && show(d.card, d.nickname, `<button type="button" class="btn ghost" data-share="card">${t('分享')}</button><a class="btn primary" href="#/">${t('看我的今天')}</a>`),
      () => { location.hash = '#/welcome'; });
    return;
  }
  const p = readLocal('pending');
  if (!p) { location.hash = '#/start'; return; }
  show(p.card, p.nickname, `<button type="button" class="btn ghost" data-share="card">${t('分享')}</button><a class="btn primary" href="#/register">${t('保存并看我的今天')}</a>`);
}

// 新注册的账号：清掉这台设备上上一个账号的第一周进度（本机标记不分账号，同一台设备反复注册时引导要从头来）
const FIRST_WEEK = ['guide', 'fd-why', 'fd-swipe', 'fd-rate', 'fd-done', 'fd-gift', 'fd-gift-seen', 'beta-member', 'drip-pick', 'drip-time', 'drip-week', 'city-tip'];
export function freshStart() { for (const k of FIRST_WEEK) { try { localStorage.removeItem('lrl:' + k); } catch { /* 无痕模式 */ } } }

// ---------- 注册成功：你的画铺满全屏，约 2 秒后飞进「我的」页签 ----------
// 不弹说明、不加按钮；看过记成 guide（撕日历、收画提示、加到主屏都以它为前提）
export function openWelcome(tries = 0) {
  if (seen('guide')) return;
  const p = S.today && S.today.card && S.today.card.pillar;
  if (!p) { if (tries < 40) setTimeout(() => openWelcome(tries + 1), 150); else mark('guide'); return; }
  mark('guide');
  track('onboard_welcome');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.createElement('div');
  el.className = 'welcome';
  el.innerHTML = `<img src="${esc(p.art)}" alt=""><div class="wtxt"><b>${esc(gzText(p.gz))} · ${esc(p.name)}</b><p>${t('从今天起，每天都有一张画属于你。')}</p></div>`;
  document.body.appendChild(el);
  const done = () => el.remove();
  el.addEventListener('click', done);
  setTimeout(() => {
    // 飞进「我的」页签：你的能量卡和这张画都在那里（手机是底部页签，电脑是顶部导航）
    const img = el.querySelector('img'), to = [...document.querySelectorAll('.tabbar a[href="#/me"], .topnav a[href="#/me"]')].find((x) => x.offsetParent);
    el.classList.add('fly');
    if (to) {
      const a = img.getBoundingClientRect(), b = to.getBoundingClientRect();
      img.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(${b.width / a.width})`;
      img.style.borderRadius = '50%';
    }
    setTimeout(done, 750);
  }, 2200);
}
onClick('[data-card-next]', () => {
  if (!reveal || currentPath() !== '/card') return;
  reveal.k++;
  track('card_step', { k: reveal.k });
  if (reveal.k > 2) { const r = reveal; reveal = null; r.full(r.c, r.name, r.actions); return; }
  $('#view .reveal').innerHTML = stepHtml(reveal.c, reveal.name, reveal.k);
});

// ---------- 加到主屏 ----------
export function openInstall() {
  track('a2hs_open', { env: ENV_NAME });
  if (S.installPrompt) {
    const p = S.installPrompt; S.installPrompt = null;
    dismissSheet();
    p.prompt();
    p.userChoice.then((c) => { if (c.outcome === 'accepted') { mark('a2hs-done'); track('a2hs_accept'); toast(t('已添加，可以从桌面打开了')); } });
    return;
  }
  const k = installKind(), here = location.href.split('#')[0], title = IS_MOBILE ? t('加到主屏') : t('安装到电脑');
  const app = EN ? t('这个应用') : IN_APP; // 英文不点 App 名
  const sheet = (lead, steps, done = true) => openSheet(title, `<div class="guide">${lead ? `<p>${lead}</p>` : ''}${steps.length ? `<ol class="steps">${steps.map((x) => `<li>${x}</li>`).join('')}</ol>` : ''}<div class="acts">${done
    ? `<button type="button" class="btn ghost" data-a2hs-done-close>${t('已经加好了')}</button><button type="button" class="btn primary" data-close-sheet>${t('知道了')}</button>`
    : `<button type="button" class="btn ghost" data-close-sheet>${t('知道了')}</button><button type="button" class="btn primary" data-copy-url="${esc(here)}">${t('复制链接')}</button>`}</div></div>`);
  const relogin = t('从桌面第一次打开时如果要求登录，用同一个账号登录就好。');
  if (k === 'no' && IN_APP && !IS_MOBILE) sheet(t('在{app}里没法安装，要先换到浏览器。', { app }),
    [t('点窗口右上角的「在默认浏览器中打开」'), t('在浏览器里用同一个账号登录，再到「我的 → 安装到电脑」'), t('找不到这个按钮的话，点下面「复制链接」，粘贴到浏览器里打开')], false);
  else if (k === 'no' && IN_APP) sheet(t('在{app}里没法加到主屏，要先换到手机浏览器。', { app }),
    [IS_IOS ? t('点右上角「···」，选「在浏览器打开」或「在 Safari 中打开」') : t('点右上角「···」，选「在浏览器打开」'), t('在浏览器里用同一个账号登录，再到「我的 → 加到主屏」'), t('菜单里没有这个选项的话，点下面「复制链接」，粘贴到浏览器里打开')], false);
  else if (k === 'no' && IS_IOS) sheet(t('这个浏览器加不了主屏。点下面「复制链接」，粘贴到 Safari 里打开，再到「我的 → 加到主屏」。'), [], false);
  else if (k === 'no') sheet(/Firefox\//.test(navigator.userAgent) ? t('这个浏览器不支持安装网页应用。可以把 flowday 加进书签，或者换 Chrome、Edge 打开。')
    : t('这个版本的 Safari 还不能添加到程序坞（要 Safari 17 以上）。可以先把 flowday 加进书签，或者换 Chrome、Edge 打开。'), [], false);
  // iPad 的分享按钮在右上角；iPhone 上 iOS 26 的 Safari 默认底栏没有分享，收在「···」里
  else if (k === 'ios-safari') sheet('', [IS_IPAD ? t('点 Safari 右上角的「分享」按钮（方框加向上箭头）') : SAFARI_VER >= 26 ? t('点 Safari 底部的「···」，再点「分享」') : t('点 Safari 底部的「分享」按钮（方框加向上箭头）。看不到底栏的话，先往上轻滑一下页面'),
    t('往下滑，选「添加到主屏幕」'), t('点右上角「添加」，桌面上就有 flowday 了'), t('找不到「添加到主屏幕」的话，说明不是在 Safari 里打开的，先换到 Safari 打开这个网页'), relogin]);
  else if (k === 'ios-share') sheet('', [t('点浏览器的「分享」按钮：Chrome 在地址栏右边，Edge 在「···」菜单里，Firefox 在「≡」菜单里'), t('选「添加到主屏幕」'), t('点右上角「添加」，桌面上就有 flowday 了'), relogin]);
  else if (k === 'android') sheet('', [t('如果是从某个 App 里点开的，先在右上角菜单选「在浏览器打开」'), t('点浏览器的菜单（右上角「⋮」或底部「≡」）'), t('找「添加到主屏幕」或「添加到桌面」，有的浏览器放在「工具箱」或「添加至」里'), t('加了没看到图标：去手机「设置 → 应用 → 这个浏览器 → 权限」，打开「桌面快捷方式」，再加一次'), t('菜单里找不到这一项的浏览器加不了，可以换一个浏览器试试')]);
  else if (k === 'mac-safari') sheet('', [t('点屏幕顶部菜单栏的「文件」'), t('选「添加到程序坞」，以后从程序坞一点就开'), t('「文件」里没有这一项的话，是系统低于 macOS 14，加不了；可以把 flowday 加进书签，或者换 Chrome、Edge 安装')]);
  else sheet('', [t('点地址栏右侧的「安装」图标（一个电脑加箭头）'), t('或在浏览器菜单里选「安装 flowday」'), t('两处都找不到的话，这个浏览器不支持安装，可以把 flowday 加进书签，或者换 Chrome、Edge 打开')]);
}
onClick('[data-install]', openInstall);
onClick('[data-copy-url]', (el) => { track('a2hs_copy', { env: ENV_NAME }); copyText(el.dataset.copyUrl, t('已复制，粘贴到浏览器里打开')); });
onClick('[data-a2hs-done-close]', () => { mark('a2hs-done'); track('a2hs_done'); dismissSheet(); const n = $('[data-notice="a2hs"]'); if (n) n.remove(); });
