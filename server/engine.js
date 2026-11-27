// 八字 flowday 打分引擎：从原单页 HTML 的 BZ 模块原样搬到服务端（规则为假设，可调）。
// 页面只拿这里算好的结果，不再在浏览器里排盘。
import lunar from 'lunar-javascript';
import { resolveBirth } from './solar.js';
import { T, isEn } from './i18n.js';

const { Solar, Lunar, LunarYear, LunarMonth } = lunar;

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const WX = ['木', '火', '土', '金', '水'];
const WXP = ['木（Wood）', '火（Fire）', '土（Earth）', '金（Metal）', '水（Water）'];
const ZHI_WX = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
const HIDE = { 子: '癸', 丑: '己癸辛', 寅: '甲丙戊', 卯: '乙', 辰: '戊乙癸', 巳: '丙庚戊', 午: '丁己', 未: '己丁乙', 申: '庚壬戊', 酉: '辛', 戌: '戊辛丁', 亥: '壬甲' };
const HIDE_W = [1, 0.5, 0.3];

// 展示用的名字：中文请求原样；英文请求干支写拼音、五行和十神写英文（标识本身仍是中文，前端和数据都按中文认）
const PY = { 甲: 'Jia', 乙: 'Yi', 丙: 'Bing', 丁: 'Ding', 戊: 'Wu', 己: 'Ji', 庚: 'Geng', 辛: 'Xin', 壬: 'Ren', 癸: 'Gui', 子: 'Zi', 丑: 'Chou', 寅: 'Yin', 卯: 'Mao', 辰: 'Chen', 巳: 'Si', 午: 'Wu', 未: 'Wei', 申: 'Shen', 酉: 'You', 戌: 'Xu', 亥: 'Hai' };
const WX_EN = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
const GZ = (x) => (isEn() ? [...x].map((ch) => PY[ch] || ch).join(' ') : x);
const W = (i) => (isEn() ? WX_EN[i] : WX[i]);
const WP = (i) => (isEn() ? WX_EN[i] : WXP[i]);
const SS = (name) => (isEn() ? T(name) : name);
const RL = (r) => (isEn() ? T(r) : r);
const PN = (i) => (isEn() ? T(PILLAR_NAME[i]) : PILLAR_NAME[i]);

const gwx = (g) => Math.floor(GAN.indexOf(g) / 2);
const zwx = (z) => ZHI_WX[ZHI.indexOf(z)];
const zi = (z) => ZHI.indexOf(z);

// 十神：以日干 dm 看 g
export function shishen(dm, g) {
  const a = GAN.indexOf(dm), b = GAN.indexOf(g), ea = Math.floor(a / 2), eb = Math.floor(b / 2), same = (a % 2) === (b % 2);
  const r = (eb - ea + 5) % 5; // 0同 1我生 2我克 3克我 4生我
  return [['比肩', '劫财'], ['食神', '伤官'], ['偏财', '正财'], ['七杀', '正官'], ['偏印', '正印']][r][same ? 0 : 1];
}

const LIUHE = { 子丑: 1, 寅亥: 1, 卯戌: 1, 辰酉: 1, 巳申: 1, 午未: 1 };
const SANHE = ['申子辰', '亥卯未', '寅午戌', '巳酉丑'];
const HAI = { 子未: 1, 丑午: 1, 寅巳: 1, 卯辰: 1, 申亥: 1, 酉戌: 1 };
const XING = { 寅巳: 1, 巳申: 1, 寅申: 1, 丑戌: 1, 戌未: 1, 丑未: 1, 子卯: 1 };
const pair = (a, b, set) => set[a + b] || set[b + a];
function rel(a, b) { // 地支关系
  if (Math.abs(zi(a) - zi(b)) === 6) return '冲';
  if (pair(a, b, LIUHE)) return '六合';
  for (let i = 0; i < 4; i++) { if (a !== b && SANHE[i].indexOf(a) >= 0 && SANHE[i].indexOf(b) >= 0) return '半合'; }
  if (pair(a, b, XING) || (a === b && '辰午酉亥'.indexOf(a) >= 0)) return '刑';
  if (pair(a, b, HAI)) return '害';
  return '';
}
const ganHe = (a, b) => Math.abs(GAN.indexOf(a) - GAN.indexOf(b)) === 5;
const GUIREN = { 甲: '丑未', 戊: '丑未', 庚: '丑未', 乙: '子申', 己: '子申', 丙: '亥酉', 丁: '亥酉', 辛: '寅午', 壬: '卯巳', 癸: '卯巳' };
const WENCHANG = { 甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' };
const taohua = (z) => ({ 申: '酉', 子: '酉', 辰: '酉', 寅: '卯', 午: '卯', 戌: '卯', 巳: '午', 酉: '午', 丑: '午', 亥: '子', 卯: '子', 未: '子' })[z];
const yima = (z) => ({ 申: '寅', 子: '寅', 辰: '寅', 寅: '申', 午: '申', 戌: '申', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳' })[z];

// 排盘。birth: { date:'YYYY-MM-DD', time:'HH:MM'|null, gender:'男'|'女', city?, lng?, tz?, zhi? }
// 填了出生城市时按真太阳时排；出生时间落在时辰交界附近时，按用户选的那个时辰排。
export function chart(birth, xiOverride, engine = 'v1') {
  const r = resolveBirth(birth);
  const [y, m, d] = r.date.split('-').map(Number);
  const noTime = !birth.time;
  const [h, mi] = noTime ? [12, 0] : r.time.split(':').map(Number);
  const s = Solar.fromYmdHms(y, m, d, h, mi, 0), l = s.getLunar(), e = l.getEightChar();
  const [cy, cm, cd] = birth.date.split('-').map(Number);
  const civil = Solar.fromYmd(cy, cm, cd).getLunar(); // 农历生日按出生当天的日期算
  e.setSect(2);
  let pillars = [e.getYear(), e.getMonth(), e.getDay(), e.getTime()];
  if (noTime) pillars = pillars.slice(0, 3);
  const dm = pillars[2][0];
  // 五行力量（假设：天干1，藏干本/中/余 1/0.5/0.3，月令×1.6）
  const force = [0, 0, 0, 0, 0];
  pillars.forEach((p, i) => {
    force[gwx(p[0])] += 1;
    HIDE[p[1]].split('').forEach((g, k) => { force[gwx(g)] += HIDE_W[k] * (i === 1 ? 1.6 : 1); });
  });
  const me = gwx(dm), mother = (me + 4) % 5;
  const total = force.reduce((a, b) => a + b, 0);
  const selfPct = (force[me] + force[mother]) / total;
  const strong = selfPct >= 0.5;
  const autoXi = strong ? [(me + 1) % 5, (me + 2) % 5, (me + 3) % 5] : [me, mother];
  const autoJi = strong ? [me, mother] : [(me + 1) % 5, (me + 2) % 5, (me + 3) % 5];
  const yun = e.getYun(birth.gender === '男' ? 1 : 0);
  const dayuns = yun.getDaYun(11).filter((x) => x.getGanZhi()).map((x) => ({ gz: x.getGanZhi(), startYear: x.getStartYear(), endYear: x.getEndYear() }));
  return {
    noTime, pillars, dm, force, selfPct, strong,
    xi: xiOverride ? xiOverride.xi.slice() : autoXi,
    ji: xiOverride ? xiOverride.ji.slice() : autoJi,
    xiCustom: !!xiOverride, engine: engine === 'v2' ? 'v2' : 'v1',
    gender: birth.gender, dayuns, startAge: yun.getStartYear(),
    natalZhi: pillars.map((p) => p[1]),
    birth: {
      date: birth.date, time: birth.time || null, timeZhi: noTime ? null : l.getTimeZhi(), lunarMonth: civil.getMonth(), lunarDay: civil.getDay(),
      city: birth.city || null, solar: r.solar, edge: r.edge, used: noTime ? null : r.time,
    },
  };
}

const wxScore = (c, w, amp) => (c.xi.indexOf(w) >= 0 ? amp : (c.ji.indexOf(w) >= 0 ? -amp : 0));
const PILLAR_NAME = ['年支', '月支', '日支', '时支'];

function level(s) {
  if (s >= 82) return { k: 5, n: '大吉', p: '很顺' };
  if (s >= 69) return { k: 4, n: '吉', p: '顺利' };
  if (s >= 52) return { k: 3, n: '平', p: '平稳' };
  if (s >= 41) return { k: 2, n: '小心', p: '留神' };
  return { k: 1, n: '凶', p: '低调' };
}

// 流日评分
function scoreDay(c, y, m, d) {
  if (c.engine === 'v2') return scoreDayV2(c, y, m, d);
  const l = Solar.fromYmd(y, m, d).getLunar();
  const gz = l.getDayInGanZhiExact(), g = gz[0], z = gz[1];
  const mgz = l.getMonthInGanZhiExact(), ygz = l.getYearInGanZhiExact();
  let sc = 60;
  const why = [];
  const add = (v, t, pl) => { if (v) { sc += v; why.push({ v, t, p: pl || t }); } };
  const ssG = shishen(c.dm, g), ssZ = shishen(c.dm, HIDE[z][0]);
  add(wxScore(c, gwx(g), 9), T('日干{g}（{wx}）为{ss}，{xi}', { g: GZ(g), wx: W(gwx(g)), ss: SS(ssG), xi: T(c.xi.indexOf(gwx(g)) >= 0 ? '属喜用' : '属忌神') }), T('今天的主能量是{wx}，{xi}', { wx: WP(gwx(g)), xi: T(c.xi.indexOf(gwx(g)) >= 0 ? '正是你的幸运元素' : '对你来说偏消耗') }));
  add(wxScore(c, zwx(z), 8), T('日支{z}（{wx}）为{ss}，{xi}', { z: GZ(z), wx: W(zwx(z)), ss: SS(ssZ), xi: T(c.xi.indexOf(zwx(z)) >= 0 ? '属喜用' : '属忌神') }), T('今天的底层能量是{wx}，{xi}', { wx: WP(zwx(z)), xi: T(c.xi.indexOf(zwx(z)) >= 0 ? '也在帮你' : '有点拖后腿') }));
  if (ganHe(g, c.dm)) add(5, T('日干{g}合日主{dm}：有人缘、易得助力', { g: GZ(g), dm: GZ(c.dm) }), T('今天容易遇到合拍的人'));
  c.natalZhi.forEach((nz, i) => {
    const r = rel(z, nz); if (!r) return;
    const isDay = i === 2;
    const tbl = isDay ? { 冲: -15, 六合: 8, 半合: 6, 刑: -6, 害: -5 } : { 冲: -6, 六合: 3, 半合: 3, 刑: -3, 害: -2 };
    add(tbl[r], T('{z}{nz}{r}（原局{pn}{self}）', { z: GZ(z), nz: GZ(nz), r: RL(r), pn: PN(i), self: isDay ? T('·自身/伴侣宫') : '' }), T((isDay
      ? { 冲: '今天和你的本命能量正面相冲，情绪和亲密关系容易起波动', 六合: '今天和你的本命能量特别合拍', 半合: '今天和你的本命能量很合拍', 刑: '和本命能量有摩擦，说话做事多留余地', 害: '容易有小误会，重要的事多确认一遍' }
      : { 冲: '和你出生时的某股能量有轻微冲突', 六合: '和你出生时的能量有呼应', 半合: '和你出生时的能量有呼应', 刑: '有点小摩擦', 害: '有点小摩擦' })[r]));
  });
  if (Math.abs(zi(z) - zi(ygz[1])) === 6) add(-4, T('日支{z}冲流年太岁{y}', { z: GZ(z), y: GZ(ygz[1]) }), T('和今年的大环境有点逆着来'));
  if (GUIREN[c.dm].indexOf(z) >= 0) add(8, T('逢天乙贵人（{z}）：易遇贵人相助', { z: GZ(z) }), T('贵人日：更容易得到别人帮忙'));
  if (WENCHANG[c.dm] === z) add(4, T('逢文昌（{z}）：利学习、文书', { z: GZ(z) }), T('学习和写作的灵感更足'));
  const mAdj = Math.round(wxScore(c, gwx(mgz[0]), 2) + wxScore(c, zwx(mgz[1]), 2));
  if (mAdj) add(mAdj, T('流月{gz}{dir}', { gz: GZ(mgz), dir: T(mAdj > 0 ? '整体偏顺' : '整体偏逆') }), T(mAdj > 0 ? '这个月整体顺风' : '这个月整体逆风'));
  const tags = [];
  if (taohua(c.natalZhi[0]) === z || taohua(c.natalZhi[2]) === z) tags.push('桃花');
  if (yima(c.natalZhi[0]) === z || yima(c.natalZhi[2]) === z) tags.push('驿马');
  sc = Math.max(15, Math.min(98, sc));
  const s = l.getSolar();
  return {
    y, m, d, gz, mgz, ygz, ssG, ssZ, score: sc, level: level(sc), why, tags,
    guiren: GUIREN[c.dm].indexOf(z) >= 0, // 贵人日：前端和挑日子认这个，不去匹配理由里的文字（英文版理由是英文）
    chongDay: rel(z, c.natalZhi[2]) === '冲',
    lunar: {
      month: l.getMonth(), day: l.getDay(), monthCn: l.getMonthInChinese(), dayCn: l.getDayInChinese(),
      jieqi: l.getJieQi() || '', festival: l.getFestivals().concat(s.getFestivals())[0] || '',
      yi: l.getDayYi(), ji: l.getDayJi(),
    },
    _lunar: l,
  };
}

// ---------- 规则 v2（待发起人审过再切换）----------
// 和 v1 的差别：大运、流年作为底色（合计约 ±10）；冲按被冲的本命地支是喜是忌决定加减（绝对值 4–8）；
// 合、刑、害减半；贵人、文昌降到 +3 / +2；最后按分位数分五档，保证很顺、顺利、平稳、留神、低调的比例稳定。
// 分位点用 300 个随机生日 × 2026 全年模拟得出：低调 / 留神 / 平稳 / 顺利 / 很顺 约 10% / 20% / 35% / 25% / 10%（test/engine.test.js 有抽样检查）。
const V2_CUTS = [42, 53, 68, 83];
function levelV2(s) {
  if (s >= V2_CUTS[3]) return { k: 5, n: '大吉', p: '很顺' };
  if (s >= V2_CUTS[2]) return { k: 4, n: '吉', p: '顺利' };
  if (s >= V2_CUTS[1]) return { k: 3, n: '平', p: '平稳' };
  if (s >= V2_CUTS[0]) return { k: 2, n: '小心', p: '留神' };
  return { k: 1, n: '凶', p: '低调' };
}
const toneOf = (c, w) => (c.xi.indexOf(w) >= 0 ? 'xi' : c.ji.indexOf(w) >= 0 ? 'ji' : 'n');
export function rawDayV2(c, y, m, d) {
  const l = Solar.fromYmd(y, m, d).getLunar();
  const gz = l.getDayInGanZhiExact(), g = gz[0], z = gz[1];
  const mgz = l.getMonthInGanZhiExact(), ygz = l.getYearInGanZhiExact();
  let sc = 60;
  const why = [];
  const add = (v, t, pl) => { if (v) { sc += v; why.push({ v, t, p: pl || t }); } };
  const ssG = shishen(c.dm, g), ssZ = shishen(c.dm, HIDE[z][0]);
  add(wxScore(c, gwx(g), 9), T('日干{g}（{wx}）为{ss}，{xi}', { g: GZ(g), wx: W(gwx(g)), ss: SS(ssG), xi: T(c.xi.indexOf(gwx(g)) >= 0 ? '属喜用' : '属忌神') }), T('今天的主能量是{wx}，{xi}', { wx: WP(gwx(g)), xi: T(c.xi.indexOf(gwx(g)) >= 0 ? '正是你的幸运元素' : '对你来说偏消耗') }));
  add(wxScore(c, zwx(z), 8), T('日支{z}（{wx}）为{ss}，{xi}', { z: GZ(z), wx: W(zwx(z)), ss: SS(ssZ), xi: T(c.xi.indexOf(zwx(z)) >= 0 ? '属喜用' : '属忌神') }), T('今天的底层能量是{wx}，{xi}', { wx: WP(zwx(z)), xi: T(c.xi.indexOf(zwx(z)) >= 0 ? '也在帮你' : '有点拖后腿') }));
  if (ganHe(g, c.dm)) add(4, T('日干{g}合日主{dm}：有人缘、易得助力', { g: GZ(g), dm: GZ(c.dm) }), T('今天容易遇到合拍的人'));
  let chongBad = false;
  c.natalZhi.forEach((nz, i) => {
    const r = rel(z, nz); if (!r) return;
    const isDay = i === 2;
    if (r === '冲') {
      const t = toneOf(c, zwx(nz));
      const v = t === 'ji' ? (isDay ? 6 : 4) : t === 'xi' ? (isDay ? -8 : -5) : (isDay ? -5 : -3);
      if (isDay && v < 0) chongBad = true;
      add(v, T('{z}冲{nz}（原局{pn}，{wx}{tone}）', { z: GZ(z), nz: GZ(nz), pn: PN(i), wx: W(zwx(nz)), tone: T(t === 'ji' ? '为忌，冲去为吉' : t === 'xi' ? '为喜，被冲为凶' : '为闲神') }),
        T(t === 'ji' ? '冲走了对你不利的本命能量，反倒轻松一些' : (isDay ? '和你的本命能量正面相冲，情绪和关系容易起波动' : '和你出生时的某股能量有冲突')));
      return;
    }
    const tbl = isDay ? { 六合: 6, 半合: 4, 刑: -4, 害: -3 } : { 六合: 2, 半合: 2, 刑: -2, 害: -1 };
    add(tbl[r], T('{z}{nz}{r}（原局{pn}）', { z: GZ(z), nz: GZ(nz), r: RL(r), pn: PN(i) }), T({ 六合: '今天和你的本命能量很合拍', 半合: '今天和你的本命能量合拍', 刑: '有点小摩擦，说话做事多留余地', 害: '容易有小误会，重要的事多确认一遍' }[r]));
  });
  if (Math.abs(zi(z) - zi(ygz[1])) === 6) add(-3, T('日支{z}冲流年太岁{y}', { z: GZ(z), y: GZ(ygz[1]) }), T('和今年的大环境有点逆着来'));
  if (GUIREN[c.dm].indexOf(z) >= 0) add(3, T('逢天乙贵人（{z}）', { z: GZ(z) }), T('贵人日：更容易得到别人帮忙'));
  if (WENCHANG[c.dm] === z) add(2, T('逢文昌（{z}）', { z: GZ(z) }), T('学习和写作的灵感更足'));
  const mAdj = Math.round(wxScore(c, gwx(mgz[0]), 2) + wxScore(c, zwx(mgz[1]), 2));
  if (mAdj) add(mAdj, T('流月{gz}{dir}', { gz: GZ(mgz), dir: T(mAdj > 0 ? '整体偏顺' : '整体偏逆') }), T(mAdj > 0 ? '这个月整体顺风' : '这个月整体逆风'));
  // 底色：所在大运和流年对你是喜是忌
  const dy = c.dayuns.find((x) => y >= x.startYear && y <= x.endYear);
  if (dy) {
    const v = wxScore(c, gwx(dy.gz[0]), 3) + wxScore(c, zwx(dy.gz[1]), 2);
    add(v, T('大运{gz}{dir}', { gz: GZ(dy.gz), dir: T(v > 0 ? '偏喜' : '偏忌') }), T(v > 0 ? '这几年的大运在帮你' : '这几年的大运有些消耗'));
  }
  const yv = wxScore(c, gwx(ygz[0]), 2) + wxScore(c, zwx(ygz[1]), 2);
  add(yv, T('流年{gz}{dir}', { gz: GZ(ygz), dir: T(yv > 0 ? '偏喜' : '偏忌') }), T(yv > 0 ? '今年整体顺风' : '今年整体逆风'));
  const tags = [];
  if (taohua(c.natalZhi[0]) === z || taohua(c.natalZhi[2]) === z) tags.push('桃花');
  if (yima(c.natalZhi[0]) === z || yima(c.natalZhi[2]) === z) tags.push('驿马');
  return { l, gz, mgz, ygz, ssG, ssZ, score: sc, why, tags, chongBad, guiren: GUIREN[c.dm].indexOf(z) >= 0 };
}
function scoreDayV2(c, y, m, d) {
  const r = rawDayV2(c, y, m, d);
  const sc = Math.max(15, Math.min(98, r.score));
  const l = r.l, s = l.getSolar();
  return {
    y, m, d, gz: r.gz, mgz: r.mgz, ygz: r.ygz, ssG: r.ssG, ssZ: r.ssZ, score: sc, level: levelV2(sc), why: r.why, tags: r.tags, guiren: r.guiren,
    chongDay: r.chongBad,
    lunar: {
      month: l.getMonth(), day: l.getDay(), monthCn: l.getMonthInChinese(), dayCn: l.getDayInChinese(),
      jieqi: l.getJieQi() || '', festival: l.getFestivals().concat(s.getFestivals())[0] || '',
      yi: l.getDayYi(), ji: l.getDayJi(),
    },
    _lunar: l,
  };
}

const HOUR_RANGE = ['23–01', '01–03', '03–05', '05–07', '07–09', '09–11', '11–13', '13–15', '15–17', '17–19', '19–21', '21–23'];
function scoreHours(c, day) {
  const times = day._lunar.getTimes().slice(0, 12);
  return times.map((t, i) => {
    const gz = t.getGanZhi(), g = gz[0], z = gz[1];
    let sc = 60;
    const why = [];
    const add = (v, s, pl, chong) => { if (v) { sc += v; why.push({ v, t: s, p: pl || s, ...(chong ? { chong: true } : {}) }); } };
    add(wxScore(c, gwx(g), 10), T('时干{g}·{ss}', { g: GZ(g), ss: SS(shishen(c.dm, g)) }), T('这个时段的主能量是{wx}，{xi}', { wx: WP(gwx(g)), xi: T(c.xi.indexOf(gwx(g)) >= 0 ? '对你有帮助' : '对你偏消耗') }));
    add(wxScore(c, zwx(z), 8), T('时支{z}·{ss}', { z: GZ(z), ss: SS(shishen(c.dm, HIDE[z][0])) }), T('这个时段的底层能量是{wx}，{xi}', { wx: WP(zwx(z)), xi: T(c.xi.indexOf(zwx(z)) >= 0 ? '对你有帮助' : '对你偏消耗') }));
    if (Math.abs(zi(z) - zi(day.gz[1])) === 6) add(-12, T('{z}冲当日{dz}（日破时）', { z: GZ(z), dz: GZ(day.gz[1]) }), T('这个时段和当天的能量相冲'), true);
    const r = rel(z, c.natalZhi[2]);
    if (r === '冲') add(-10, T('{z}冲原局日支{nz}', { z: GZ(z), nz: GZ(c.natalZhi[2]) }), T('这个时段和你的本命能量相冲'), true);
    if (r === '六合' || r === '半合') add(6, T('{z}{nz}{r}', { z: GZ(z), nz: GZ(c.natalZhi[2]), r: RL(r) }), T('这个时段和你的本命能量合拍'));
    if (GUIREN[c.dm].indexOf(z) >= 0) add(6, T('贵人时'), T('贵人时段：容易得到帮助'));
    const luck = t.getTianShenLuck();
    add(luck === '吉' ? 4 : -4, T('黄历{ts}{dir}', { ts: isEn() ? T(t.getTianShen()) : t.getTianShen(), dir: T(luck === '吉' ? '（黄道）' : '（黑道）') }), T(luck === '吉' ? '传统黄历的吉时' : '传统黄历的非吉时'));
    sc = Math.max(15, Math.min(98, sc));
    return { i, gz, range: HOUR_RANGE[i], name: z + '时', ss: shishen(c.dm, g), score: sc, level: level(sc), why, night: i <= 2 };
  });
}

export function dayOut(c, y, m, d, withHours) {
  const x = scoreDay(c, y, m, d);
  if (withHours) x.hours = scoreHours(c, x);
  delete x._lunar;
  return x;
}

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// 一个月的完整数据（含每天的十二时辰）+ 从 today 起的 7 天
export function calendar(c, y, m, today) {
  const days = [];
  for (let d = 1; d <= daysIn(y, m); d++) days.push(dayOut(c, y, m, d, true));
  const week = [];
  if (today) {
    const [ty, tm, td] = today.split('-').map(Number);
    for (let k = 0; k < 7; k++) {
      const dt = new Date(Date.UTC(ty, tm - 1, td + k));
      week.push(dayOut(c, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), k === 0));
    }
  }
  const out = { ...c };
  return { chart: out, y, m, days, week };
}

// 大家的今天：只看历法，不看个人（锁定页、示例页也能用）
export function almanac(y, m, d) {
  const s = Solar.fromYmd(y, m, d), l = s.getLunar();
  return {
    y, m, d, week: s.getWeek(), gz: l.getDayInGanZhiExact(),
    lunar: { monthCn: l.getMonthInChinese(), dayCn: l.getDayInChinese(), jieqi: l.getJieQi() || '', festival: l.getFestivals().concat(s.getFestivals())[0] || '' },
    yi: l.getDayYi(), ji: l.getDayJi(),
  };
}

// 两个地支是否相冲（挑日子排除月破、岁破用）
export const isChong = (a, b) => Math.abs(zi(a) - zi(b)) === 6;

// 农历生日 → 公历日期。出错时返回 { error } 给用户看
const CN_MONTH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
export function lunarToSolar(y, m, d, leap) {
  if (!(y >= 1901 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 30)) return { error: T('请选择正确的农历日期') };
  if (leap && LunarYear.fromYear(y).getLeapMonth() !== m) return { error: T('农历{y}年没有闰{m}月', { y, m: isEn() ? m : CN_MONTH[m - 1] }) };
  const days = LunarMonth.fromYm(y, leap ? -m : m).getDayCount();
  if (d > days) return { error: T(leap ? '农历{y}年闰{m}月只有 {days} 天' : '农历{y}年{m}月只有 {days} 天', { y, m: isEn() ? m : CN_MONTH[m - 1], days }) };
  return { date: Lunar.fromYmd(y, leap ? -m : m, d).getSolar().toYmd() };
}
// 农历某一年的月份（含闰月）和每月天数，日期滚轮用
export function lunarMonths(y) {
  return LunarYear.fromYear(y).getMonthsInYear().map((m) => ({ m: Math.abs(m.getMonth()), leap: m.getMonth() < 0, days: m.getDayCount() }));
}
// 公历日期 → 农历（表单回显和预览用）
// 某天（公历）的日柱，和每天卡片上的一致
export function dayGz(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Solar.fromYmd(y, m, d).getLunar().getDayInGanZhiExact();
}
// 出生那天：农历哪天、月亮什么样、上一个节气过了几天
const MOON = (d) => (d === 1 ? '新月' : d <= 6 ? '蛾眉月' : d <= 9 ? '上弦月' : d <= 13 ? '盈凸月' : d <= 16 ? '满月' : d <= 21 ? '亏凸月' : d <= 24 ? '下弦月' : '残月');
export function bornDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  const l = Solar.fromYmd(y, m, d).getLunar(), jq = l.getPrevJieQi(true), js = jq.getSolar();
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(js.getYear(), js.getMonth() - 1, js.getDay())) / 86400000);
  // 英文：农历写成 Lunar 10/18，月相和节气名用英文（term 只用于展示）
  if (isEn()) return { lunar: `Lunar ${l.getMonth() < 0 ? 'leap ' : ''}${Math.abs(l.getMonth())}/${l.getDay()}`, moon: T(MOON(l.getDay())), term: T(jq.getName()), days };
  return { lunar: `${l.getMonthInChinese()}月${l.getDayInChinese()}`, moon: MOON(l.getDay()), term: jq.getName(), days };
}

export function solarToLunar(date) {
  const [y, m, d] = date.split('-').map(Number);
  const l = Solar.fromYmd(y, m, d).getLunar();
  return { y: l.getYear(), m: Math.abs(l.getMonth()), d: l.getDay(), leap: l.getMonth() < 0, text: isEn() ? `Lunar ${l.getYear()}, ${l.getMonth() < 0 ? 'leap ' : ''}${Math.abs(l.getMonth())}/${l.getDay()}` : `${l.getYearInChinese()}年${l.getMonthInChinese()}月${l.getDayInChinese()}` };
}

// 某天所在的节气（最近一个已经到了的节气）
// 这一天是不是节气，是的话返回节气名
export function jieqiOn(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Solar.fromYmd(y, m, d).getLunar().getJieQi() || '';
}
export function termOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Solar.fromYmd(y, m, d).getLunar().getPrevJieQi(true).getName();
}

export { GAN, ZHI, WX, HIDE };
