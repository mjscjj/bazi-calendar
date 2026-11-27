// 展示用的常量和小工具（沿用原单页的文案）。日历和分数都由服务端算好，这里只负责把它们说成人话。
// 文案用 t() 包着（英文在 i18n/en/data.json）；表的键（正官、桃花…）是逻辑标识，不翻。
import { EN } from './i18n.js';
import { tm } from './i18n.js';
const t = tm('data'); // 先查 i18n/en/data.json
// 同一日柱的旧能量卡、收藏和分享图也要加载新版画作。
export const pillarArtSrc = (path) => path.startsWith('art/pillars/') ? path.split('?')[0] + '?v=plein-air-1' : path;
export const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
export const WX = ['木', '火', '土', '金', '水'], WXEN = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'], WXC = ['w0', 'w1', 'w2', 'w3', 'w4'];
const ZHI_WX = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
export const HIDE = { 子: '癸', 丑: '己癸辛', 寅: '甲丙戊', 卯: '乙', 辰: '戊乙癸', 巳: '丙庚戊', 午: '丁己', 未: '己丁乙', 申: '庚壬戊', 酉: '辛', 戌: '戊辛丁', 亥: '壬甲' };
// 专业模式月历格子里的十神简写（英文用三个字母）
export const SHORT = EN ? { 比肩: 'All', 劫财: 'Cmp', 食神: 'Eas', 伤官: 'Exp', 偏财: 'Opp', 正财: 'Ear', 七杀: 'Prs', 正官: 'Str', 偏印: 'Ins', 正印: 'Sup' }
  : { 比肩: '比', 劫财: '劫', 食神: '食', 伤官: '伤', 偏财: '才', 正财: '财', 七杀: '杀', 正官: '官', 偏印: '枭', 正印: '印' };
export const ADVICE = {
  正官: { h: t('规矩与认可的一天，适合向上沟通。'), do: [t('向上汇报、面谈领导'), t('办正式手续、提交材料'), t('面试、考试、答辩')], dont: [t('迟到、越级'), t('违规操作走捷径')] },
  七杀: { h: t('压力和挑战偏多，适合集中火力攻坚。'), do: [t('处理棘手难题、截止冲刺'), t('运动释放压力'), t('果断拍板小事')], dont: [t('与人正面冲突'), t('冒险投资、熬夜')] },
  正印: { h: t('得人帮扶，适合学习、写东西、充电。'), do: [t('学习进修、写方案'), t('请教导师、长辈'), t('休息调养')], dont: [t('一味拖延'), t('事事依赖别人')] },
  偏印: { h: t('思考力强但容易多想，适合独处深挖。'), do: [t('独立研究、复盘'), t('冥想、整理思路'), t('做需要专注的活')], dont: [t('疑神疑鬼、临时变卦'), t('冷落身边人')] },
  比肩: { h: t('同伴运旺，适合协作、约朋友。'), do: [t('团队协作、对齐目标'), t('约朋友、运动'), t('自己能做主的事')], dont: [t('合伙分钱'), t('固执己见')] },
  劫财: { h: t('竞争与开销并存，看好钱包和情绪。'), do: [t('竞争性任务'), t('社交破冰')], dont: [t('借钱给人、冲动消费'), t('大额投资、签担保')] },
  食神: { h: t('状态松弛，有创意，适合输出与享受。'), do: [t('创作、写作、做内容'), t('分享、带新人'), t('美食和休闲')], dont: [t('过度放松误事')] },
  伤官: { h: t('表达欲强、点子多，注意说话分寸。'), do: [t('提案、演讲、展示作品'), t('头脑风暴、做创新')], dont: [t('顶撞上级、口舌是非'), t('草率签合同')] },
  正财: { h: t('踏实收获的一天，适合收尾和理财。'), do: [t('整理账目、理财规划'), t('交付、收尾、写周报'), t('按计划执行')], dont: [t('投机、追高')] },
  偏财: { h: t('机会与人脉活跃，适合谈合作谈钱。'), do: [t('谈合作、谈薪谈价'), t('拓展人脉、商务应酬'), t('尝试新渠道')], dont: [t('赌性投资'), t('过度承诺')] },
};
const THEME_CN = { 正官: ['认可日', 'Recognition'], 七杀: ['挑战日', 'Challenge'], 正印: ['充电日', 'Recharge'], 偏印: ['深思日', 'Reflection'], 比肩: ['伙伴日', 'Teamwork'], 劫财: ['守财日', 'Guard your wallet'], 食神: ['享受日', 'Enjoy'], 伤官: ['表达日', 'Express'], 正财: ['收获日', 'Harvest'], 偏财: ['机遇日', 'Opportunity'] };
// [这一天的主题, 英文副标题]；英文界面第一个也是英文（Recognition Day…）
export const THEME = Object.fromEntries(Object.entries(THEME_CN).map(([k, [zh, en]]) => [k, [t(zh), en]]));
// 这个月的主题（认可月）、去掉「日」的短名（认可），月历和时段表用
export const themeMonth = (ss) => t(THEME_CN[ss][0].replace('日', '月'));
export const themeShort = (ss) => t(THEME_CN[ss][0].replace('日', ''));
export const THEME_DESC = { 正官: t('规则、上级、名声相关的事更顺'), 七杀: t('压力大但能逼出效率'), 正印: t('适合学习、休养、被照顾'), 偏印: t('适合独处、钻研、想清楚'), 比肩: t('朋友同事给力，适合合作'), 劫财: t('花钱和竞争多，看好钱包'), 食神: t('心情放松，适合创作和享受'), 伤官: t('表达欲强，点子多，注意说话分寸'), 正财: t('踏实付出能看到回报'), 偏财: t('意外机会和人脉活跃') };
export const ACT = { 正官: t('汇报'), 七杀: t('攻坚'), 正印: t('充电'), 偏印: t('深思'), 比肩: t('协作'), 劫财: t('守财'), 食神: t('创作'), 伤官: t('表达'), 正财: t('收尾'), 偏财: t('谈事') };
export const HOUR_TIP = { 正官: t('适合汇报沟通'), 七杀: t('适合攻坚冲刺'), 正印: t('适合学习、写方案'), 偏印: t('适合独处思考'), 比肩: t('适合协作对齐'), 劫财: t('少花钱、少争执'), 食神: t('适合创作、放松'), 伤官: t('适合表达，慎言'), 正财: t('适合处理钱和收尾'), 偏财: t('适合谈事、见人') };
export const GLOW = ['#5FD08A', '#FF9A3C', '#E2B45A', '#F1D9A0', '#6FA8FF'];
// 白色主题下做文字和能量环时用的深一档同色（金、土的光晕色太浅，白底上看不清）
export const GLOW_INK = ['#2E8B57', '#D9622B', '#A87522', '#9C7A1E', '#2F6DB5'];
export function setGlow(i) {
  document.documentElement.style.setProperty('--glow', GLOW[i]);
  document.documentElement.style.setProperty('--glow-ink', GLOW_INK[i]);
}
// 幸运色 → 卡片配色：两种幸运色里挑更鲜明的做主色，调到在深浅底上都看得清
const hsl = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(((h * 60) + 360) % 360), s, l];
};
const css = ([h, s, l]) => `hsl(${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function luckVars(colors) {
  if (!colors || !colors.length) return '';
  const cs = colors.map((c) => hsl(c.hex)).sort((a, b) => b[1] * (1 - Math.abs(b[2] - 0.5)) - a[1] * (1 - Math.abs(a[2] - 0.5)));
  const [m, o] = [cs[0], cs[1] || cs[0]];
  const glow = [m[0], Math.min(m[1], 0.8), clamp(m[2], 0.56, 0.7)], ink = [m[0], Math.min(m[1], 0.75), clamp(m[2], 0.32, 0.44)];
  const two = [o[0], Math.min(o[1], 0.8), clamp(o[2], 0.5, 0.72)];
  return `--lk:${css(glow)};--lk-ink:${css(ink)};--lk2:${css(two)}`;
}
// 星期：中文是一个字（配「周」用），英文是 Sun…Sat；显示整个「周一」用 wkName
export const WEEK = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : '日一二三四五六';
export const wkName = (i) => t('周{w}', { w: WEEK[i] });
// 月份：英文用缩写（Nov）和全称（November）
export const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 11月26日 / Nov 26；2026年11月 / November 2026；2026年11月26日 / Nov 26, 2026
export const mdLabel = (m, d) => t('{m}月{d}日', { m: EN ? MON_EN[m - 1] : m, d });
export const ymLabel = (y, m) => t('{y}年{m}月', { y, m: EN ? MONTH_EN[m - 1] : m });
export const ymdLabel = (y, m, d) => t('{y}年{m}月{d}日', { y, m: EN ? MON_EN[m - 1] : m, d });
// 干支的拼音（英文界面里不夹汉字，专业模式的干支除外）：辛亥 → Xin Hai
const GAN_PY = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui'];
const ZHI_PY = ['Zi', 'Chou', 'Yin', 'Mao', 'Chen', 'Si', 'Wu', 'Wei', 'Shen', 'You', 'Xu', 'Hai'];
export const ganPy = (g) => GAN_PY[GAN.indexOf(g)] || g;
export const gzName = (gz) => (EN && gz && gz.length === 2 ? `${ganPy(gz[0])} ${ZHI_PY[ZHI.indexOf(gz[1])] || gz[1]}` : gz);
// 签的等级：上上、大吉 g5；上、吉 g4；中 g3；其余 g2
export const GRADE_CLS = (g) => (/上上|大吉/.test(g) ? 'g5' : /上|吉|^Great/i.test(g) ? 'g4' : /中|^Fair/i.test(g) ? 'g3' : 'g2');
const DISHI_START = { 甲: 11, 丙: 2, 戊: 2, 庚: 5, 壬: 8, 乙: 6, 丁: 9, 己: 9, 辛: 0, 癸: 3 };
const DS = [t('长生'), t('沐浴'), t('冠带'), t('临官'), t('帝旺'), t('衰'), t('病'), t('死'), t('墓'), t('绝'), t('胎'), t('养')];

export const gwx = (g) => Math.floor(GAN.indexOf(g) / 2);
export const zwx = (z) => ZHI_WX[ZHI.indexOf(z)];
export function cg(ch) { const i = GAN.indexOf(ch); return 'w' + (i >= 0 ? Math.floor(i / 2) : zwx(ch)); }
export function gzHtml(gz) { return `<span class="${cg(gz[0])}">${gz[0]}</span><span class="${cg(gz[1])}">${gz[1]}</span>`; }
export function shishen(dm, g) {
  const a = GAN.indexOf(dm), b = GAN.indexOf(g), ea = Math.floor(a / 2), eb = Math.floor(b / 2), same = (a % 2) === (b % 2);
  return [['比肩', '劫财'], ['食神', '伤官'], ['偏财', '正财'], ['七杀', '正官'], ['偏印', '正印']][(eb - ea + 5) % 5][same ? 0 : 1];
}
export function dishi(g, z) { const s = DISHI_START[g], zi = ZHI.indexOf(z), yang = GAN.indexOf(g) % 2 === 0; return DS[yang ? (zi - s + 12) % 12 : (s - zi + 12) % 12]; }
export const hhmm = (i) => { if (EN) return hhShort(i); const a = (i * 2 + 23) % 24, b = (i * 2 + 1) % 24; return String(a).padStart(2, '0') + ':00–' + String(b).padStart(2, '0') + ':00'; };
// 7–9 点；英文 7–9 AM、11 AM–1 PM
const ap = (h) => (h < 12 ? 'AM' : 'PM'), h12 = (h) => (h % 12 || 12);
export const hhShort = (i) => {
  const a = (i * 2 + 23) % 24, b = (i * 2 + 1) % 24;
  if (EN) return ap(a) === ap(b) ? `${h12(a)}–${h12(b)} ${ap(b)}` : `${h12(a)} ${ap(a)}–${h12(b)} ${ap(b)}`;
  return t('{a}–{b} 点', { a, b });
};
export const actOf = (x) => (x.level.k <= 1 ? t('休整') : ACT[x.ssG]);
export const weekday = (x) => WEEK[new Date(x.y, x.m - 1, x.d).getDay()];
// 农历的数字月日：日子里有 month / day；黄历（almanac）只有中文的 monthCn / dayCn，按字换算
const CN_M = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'], CN_D = ['初', '十', '廿', '三'], CN_N = ['十', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function lunarNum(l) {
  if (l.month != null && l.day != null) return { m: Math.abs(l.month), d: l.day, leap: l.month < 0 };
  const mc = String(l.monthCn || ''), dc = String(l.dayCn || '');
  const m = CN_M.indexOf(mc.replace('闰', '')) + 1;
  const d = dc === '二十' ? 20 : dc === '三十' ? 30 : dc === '初十' ? 10 : CN_D.indexOf(dc[0]) * 10 + CN_N.indexOf(dc[1]);
  return { m, d, leap: mc.startsWith('闰') };
}
// 农历十月十八 / Lunar 10/18（闰月 Lunar leap 6/3）
export function lunarText(l) {
  if (!EN) return t('农历{m}月{d}', { m: l.monthCn, d: l.dayCn });
  const n = lunarNum(l);
  return t('农历{m}月{d}', { m: (n.leap ? 'leap ' : '') + n.m, d: n.d });
}
// 月历格子里的那一行：节日 / 节气 / 农历日子（英文写 10/18）
export function lunarLabel(x) {
  if (x.lunar.festival) return { t: t(x.lunar.festival), c: 'fe' };
  if (x.lunar.jieqi) return { t: t(x.lunar.jieqi), c: 'jq' };
  if (EN) { const n = lunarNum(x.lunar); return { t: n.d === 1 ? `Lunar ${n.m}` : `L${n.d}`, c: '' }; } // 9/24 会被当成公历
  return { t: x.lunar.day === 1 ? (x.lunar.monthCn + '月') : x.lunar.dayCn, c: '' };
}
// 生日、农历生日、本命日、贵人日、本命冲
export function specials(x, chart) {
  const b = chart.birth.date.split('-').map(Number), r = [];
  if (x.m === b[1] && x.d === b[2]) r.push({ k: 'bd', t: t('生日') });
  if (Math.abs(x.lunar.month) === Math.abs(chart.birth.lunarMonth) && x.lunar.day === chart.birth.lunarDay) r.push({ k: 'bd', t: t('农历生日') });
  if (x.gz === chart.pillars[2]) r.push({ k: 'me', t: t('本命日') });
  if (x.guiren) r.push({ k: 'gr', t: t('贵人日') });
  if (x.chongDay) r.push({ k: 'cg', t: t('本命冲') });
  return r;
}
// 当天适合、少做（含冲日、驿马、桃花、低分日的调整）
export function dosDonts(x, pro) {
  const a = ADVICE[x.ssG];
  let dos = a.do.slice();
  const donts = a.dont.slice();
  if (x.chongDay) donts.unshift(pro ? t('重要决定、搬家签约（日支逢冲）') : t('做重大决定、搬家、签约'));
  if (x.tags.includes('驿马')) dos.push(t('出差、出行'));
  if (x.tags.includes('桃花')) dos.push(t('约会、社交'));
  if (x.level.k <= 2) { dos = dos.slice(0, 2); dos.push(t('早点休息，降低预期')); }
  return { dos, donts };
}
// 7–21 点里最好的两个时段和要避开的时段（太早太晚的时段不推荐给人安排事）
export function bestHours(x) {
  const day = (x.hours || []).filter((t) => t.i >= 4 && t.i <= 10);
  const top = day.slice().sort((p, q) => q.score - p.score).slice(0, 2);
  const worst = day.slice().sort((p, q) => p.score - q.score)[0];
  return { top, worst, worstWhy: worst ? ((worst.why.find((w) => w.v < 0) || {}).p || t('能量偏低')) : '' };
}
