// 梅花易数起卦（规则算，AI 不参与）：时间起卦或报三个数，得本卦、互卦、变卦，按体用生克和月令旺衰得出倾向。
import lunar from 'lunar-javascript';

const { Solar } = lunar;
const ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']; // 先天数 1–8
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const ZHI_WX = { 寅: '木', 卯: '木', 巳: '火', 午: '火', 申: '金', 酉: '金', 亥: '水', 子: '水', 辰: '土', 戌: '土', 丑: '土', 未: '土' };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const mod = (n, m) => (n % m) || m;

// 体和另一卦的关系，以及给人看的说法
const REL_TEXT = { 用生体: '有人帮、顺势', 比和: '同心协力、顺', 体克用: '能拿下，但要花力气', 体生用: '要多付出、有消耗', 用克体: '有阻力' };
const GOOD = new Set(['用生体', '比和', '体克用']);
function relation(ti, other) {
  if (ti === other) return '比和';
  if (SHENG[other] === ti) return '用生体';
  if (KE[ti] === other) return '体克用';
  if (SHENG[ti] === other) return '体生用';
  return '用克体';
}
// 体卦五行在月令里的旺衰
function monthState(ti, mwx) {
  if (ti === mwx) return '当令（旺）';
  if (SHENG[mwx] === ti) return '得月令生扶（相）';
  if (SHENG[ti] === mwx) return '不得月令（休）';
  if (KE[ti] === mwx) return '不得月令（囚）';
  return '受月令克制（死）';
}

// 北京时间的那一刻：年支、农历月、农历日、时支（梅花易数的时间起卦用这四个数）
export function momentOf(ms) {
  const d = new Date(ms + 8 * 3600000);
  const l = Solar.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0).getLunar();
  const y = ZHI.indexOf(l.getYearZhi()) + 1, h = ZHI.indexOf(l.getTimeZhi()) + 1;
  const lm = Math.abs(l.getMonth()), ld = l.getDay();
  return {
    y, m: lm, d: ld, h,
    monthZhi: l.getMonthZhiExact(),
    text: `${l.getYearInGanZhi()}年${l.getMonthInChinese()}月${l.getDayInChinese()} ${l.getTimeZhi()}时`,
    // 起卦用到的四个数，以及它们从哪来（给页面演推算用）
    inputs: [{ label: l.getYearZhi() + '年', n: y }, { label: l.getMonthInChinese() + '月', n: lm }, { label: l.getDayInChinese(), n: ld }, { label: l.getTimeZhi() + '时', n: h }],
  };
}
// 一步推算：几个数相加，再除以 div 取余（余 0 当 div）
const step = (parts, div) => { const sum = parts.reduce((a, b) => a + b, 0); return { parts, sum, div, r: mod(sum, div) }; };

export function makeMeihua(c) {
  const T = c.trigrams, H = c.hexagrams;
  const byLines = (ls) => ORDER.find((k) => T[k].lines.join('') === ls.join(''));
  const hex = (up, low) => ({ key: up + low, up, low, name: H[up + low].name, gist: H[up + low].gist, lines: [...T[low].lines, ...T[up].lines] });

  function build(upNum, lowNum, moving, monthZhi) {
    const ben = hex(ORDER[upNum - 1], ORDER[lowNum - 1]);
    const bl = ben.lines.slice();
    bl[moving - 1] = 1 - bl[moving - 1];
    const bian = hex(byLines(bl.slice(3)), byLines(bl.slice(0, 3)));
    const hu = hex(byLines(ben.lines.slice(2, 5)), byLines(ben.lines.slice(1, 4)));
    // 动爻在下卦，下卦是用、上卦是体；反之亦然
    const yongLow = moving <= 3;
    const ti = yongLow ? ben.up : ben.low, yong = yongLow ? ben.low : ben.up, bianYong = yongLow ? bian.low : bian.up;
    const now = relation(T[ti].wx, T[yong].wx), later = relation(T[ti].wx, T[bianYong].wx);
    const tendency = GOOD.has(now) ? (GOOD.has(later) ? '顺' : '宜缓') : (GOOD.has(later) ? '先阻后顺' : '有阻');
    const mwx = ZHI_WX[monthZhi];
    return {
      ben, hu, bian, moving,
      ti: { name: ti, wx: T[ti].wx }, yong: { name: yong, wx: T[yong].wx }, bianYong: { name: bianYong, wx: T[bianYong].wx },
      now: { rel: now, text: REL_TEXT[now] }, later: { rel: later, text: REL_TEXT[later] },
      month: { zhi: monthZhi, wx: mwx, state: monthState(T[ti].wx, mwx) }, tendency,
    };
  }
  return {
    // 时间起卦：(年+月+日)÷8 余数为上卦，再加时为下卦，总数÷6 余数为动爻
    byTime(ms) {
      const t = momentOf(ms), s = t.y + t.m + t.d;
      const calc = { inputs: t.inputs, up: step([t.y, t.m, t.d], 8), low: step([s, t.h], 8), mv: step([s, t.h], 6) };
      return { ...build(calc.up.r, calc.low.r, calc.mv.r, t.monthZhi), cast: { method: 'time', text: t.text, calc } };
    },
    // 报三个数：第一个数定上卦，第二个数定下卦，三数之和定动爻
    byNums([a, b, n3], ms) {
      const t = momentOf(ms);
      const calc = { inputs: [{ label: '第一个数', n: a }, { label: '第二个数', n: b }, { label: '第三个数', n: n3 }], up: step([a], 8), low: step([b], 8), mv: step([a, b, n3], 6) };
      return { ...build(calc.up.r, calc.low.r, calc.mv.r, t.monthZhi), cast: { method: 'nums', nums: [a, b, n3], text: t.text, calc } };
    },
  };
}
