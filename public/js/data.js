// 展示用的常量和小工具（沿用原单页的文案）。日历和分数都由服务端算好，这里只负责把它们说成人话。
export const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
export const WX = ['木', '火', '土', '金', '水'], WXEN = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'], WXC = ['w0', 'w1', 'w2', 'w3', 'w4'];
const ZHI_WX = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
export const HIDE = { 子: '癸', 丑: '己癸辛', 寅: '甲丙戊', 卯: '乙', 辰: '戊乙癸', 巳: '丙庚戊', 午: '丁己', 未: '己丁乙', 申: '庚壬戊', 酉: '辛', 戌: '戊辛丁', 亥: '壬甲' };
export const SHORT = { 比肩: '比', 劫财: '劫', 食神: '食', 伤官: '伤', 偏财: '才', 正财: '财', 七杀: '杀', 正官: '官', 偏印: '枭', 正印: '印' };
export const ADVICE = {
  正官: { h: '规矩与认可的一天，适合向上沟通。', do: ['向上汇报、面谈领导', '办正式手续、提交材料', '面试、考试、答辩'], dont: ['迟到、越级', '违规操作走捷径'] },
  七杀: { h: '压力和挑战偏多，适合集中火力攻坚。', do: ['处理棘手难题、截止冲刺', '运动释放压力', '果断拍板小事'], dont: ['与人正面冲突', '冒险投资、熬夜'] },
  正印: { h: '得人帮扶，适合学习、写东西、充电。', do: ['学习进修、写方案', '请教导师、长辈', '休息调养'], dont: ['一味拖延', '事事依赖别人'] },
  偏印: { h: '思考力强但容易多想，适合独处深挖。', do: ['独立研究、复盘', '冥想、整理思路', '做需要专注的活'], dont: ['疑神疑鬼、临时变卦', '冷落身边人'] },
  比肩: { h: '同伴运旺，适合协作、约朋友。', do: ['团队协作、对齐目标', '约朋友、运动', '自己能做主的事'], dont: ['合伙分钱', '固执己见'] },
  劫财: { h: '竞争与开销并存，看好钱包和情绪。', do: ['竞争性任务', '社交破冰'], dont: ['借钱给人、冲动消费', '大额投资、签担保'] },
  食神: { h: '状态松弛，有创意，适合输出与享受。', do: ['创作、写作、做内容', '分享、带新人', '美食和休闲'], dont: ['过度放松误事'] },
  伤官: { h: '表达欲强、点子多，注意说话分寸。', do: ['提案、演讲、展示作品', '头脑风暴、做创新'], dont: ['顶撞上级、口舌是非', '草率签合同'] },
  正财: { h: '踏实收获的一天，适合收尾和理财。', do: ['整理账目、理财规划', '交付、收尾、写周报', '按计划执行'], dont: ['投机、追高'] },
  偏财: { h: '机会与人脉活跃，适合谈合作谈钱。', do: ['谈合作、谈薪谈价', '拓展人脉、商务应酬', '尝试新渠道'], dont: ['赌性投资', '过度承诺'] },
};
export const THEME = { 正官: ['认可日', 'Recognition'], 七杀: ['挑战日', 'Challenge'], 正印: ['充电日', 'Recharge'], 偏印: ['深思日', 'Reflection'], 比肩: ['伙伴日', 'Teamwork'], 劫财: ['守财日', 'Guard your wallet'], 食神: ['享受日', 'Enjoy'], 伤官: ['表达日', 'Express'], 正财: ['收获日', 'Harvest'], 偏财: ['机遇日', 'Opportunity'] };
export const THEME_DESC = { 正官: '规则、上级、名声相关的事更顺', 七杀: '压力大但能逼出效率', 正印: '适合学习、休养、被照顾', 偏印: '适合独处、钻研、想清楚', 比肩: '朋友同事给力，适合合作', 劫财: '花钱和竞争多，看好钱包', 食神: '心情放松，适合创作和享受', 伤官: '表达欲强，点子多，注意说话分寸', 正财: '踏实付出能看到回报', 偏财: '意外机会和人脉活跃' };
export const ACT = { 正官: '汇报', 七杀: '攻坚', 正印: '充电', 偏印: '深思', 比肩: '协作', 劫财: '守财', 食神: '创作', 伤官: '表达', 正财: '收尾', 偏财: '谈事' };
export const HOUR_TIP = { 正官: '适合汇报沟通', 七杀: '适合攻坚冲刺', 正印: '适合学习、写方案', 偏印: '适合独处思考', 比肩: '适合协作对齐', 劫财: '少花钱、少争执', 食神: '适合创作、放松', 伤官: '适合表达，慎言', 正财: '适合处理钱和收尾', 偏财: '适合谈事、见人' };
export const GLOW = ['#5FD08A', '#FF9A3C', '#E2B45A', '#F1D9A0', '#6FA8FF'];
// 白色主题下做文字和能量环时用的深一档同色（金、土的光晕色太浅，白底上看不清）
export const GLOW_INK = ['#2E8B57', '#D9622B', '#A87522', '#9C7A1E', '#2F6DB5'];
export function setGlow(i) {
  document.documentElement.style.setProperty('--glow', GLOW[i]);
  document.documentElement.style.setProperty('--glow-ink', GLOW_INK[i]);
}
export const WEEK = '日一二三四五六';
const DISHI_START = { 甲: 11, 丙: 2, 戊: 2, 庚: 5, 壬: 8, 乙: 6, 丁: 9, 己: 9, 辛: 0, 癸: 3 };
const DS = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];

export const gwx = (g) => Math.floor(GAN.indexOf(g) / 2);
export const zwx = (z) => ZHI_WX[ZHI.indexOf(z)];
export function cg(ch) { const i = GAN.indexOf(ch); return 'w' + (i >= 0 ? Math.floor(i / 2) : zwx(ch)); }
export function gzHtml(gz) { return `<span class="${cg(gz[0])}">${gz[0]}</span><span class="${cg(gz[1])}">${gz[1]}</span>`; }
export function shishen(dm, g) {
  const a = GAN.indexOf(dm), b = GAN.indexOf(g), ea = Math.floor(a / 2), eb = Math.floor(b / 2), same = (a % 2) === (b % 2);
  return [['比肩', '劫财'], ['食神', '伤官'], ['偏财', '正财'], ['七杀', '正官'], ['偏印', '正印']][(eb - ea + 5) % 5][same ? 0 : 1];
}
export function dishi(g, z) { const s = DISHI_START[g], zi = ZHI.indexOf(z), yang = GAN.indexOf(g) % 2 === 0; return DS[yang ? (zi - s + 12) % 12 : (s - zi + 12) % 12]; }
export const hhmm = (i) => { const a = (i * 2 + 23) % 24, b = (i * 2 + 1) % 24; return String(a).padStart(2, '0') + ':00–' + String(b).padStart(2, '0') + ':00'; };
export const hhShort = (i) => { const a = (i * 2 + 23) % 24, b = (i * 2 + 1) % 24; return a + '–' + b + ' 点'; };
export const actOf = (x) => (x.level.k <= 1 ? '休整' : ACT[x.ssG]);
export const weekday = (x) => WEEK[new Date(x.y, x.m - 1, x.d).getDay()];
export function lunarLabel(x) {
  if (x.lunar.festival) return { t: x.lunar.festival, c: 'fe' };
  if (x.lunar.jieqi) return { t: x.lunar.jieqi, c: 'jq' };
  return { t: x.lunar.day === 1 ? (x.lunar.monthCn + '月') : x.lunar.dayCn, c: '' };
}
// 生日、农历生日、本命日、贵人日、本命冲
export function specials(x, chart) {
  const b = chart.birth.date.split('-').map(Number), r = [];
  if (x.m === b[1] && x.d === b[2]) r.push({ k: 'bd', t: '生日' });
  if (Math.abs(x.lunar.month) === Math.abs(chart.birth.lunarMonth) && x.lunar.day === chart.birth.lunarDay) r.push({ k: 'bd', t: '农历生日' });
  if (x.gz === chart.pillars[2]) r.push({ k: 'me', t: '本命日' });
  if (x.why.some((w) => /贵人日/.test(w.p))) r.push({ k: 'gr', t: '贵人日' });
  if (x.chongDay) r.push({ k: 'cg', t: '本命冲' });
  return r;
}
// 当天适合、少做（含冲日、驿马、桃花、低分日的调整）
export function dosDonts(x, pro) {
  const a = ADVICE[x.ssG];
  let dos = a.do.slice();
  const donts = a.dont.slice();
  if (x.chongDay) donts.unshift(pro ? '重要决定、搬家签约（日支逢冲）' : '做重大决定、搬家、签约');
  if (x.tags.includes('驿马')) dos.push('出差、出行');
  if (x.tags.includes('桃花')) dos.push('约会、社交');
  if (x.level.k <= 2) { dos = dos.slice(0, 2); dos.push('早点休息，降低预期'); }
  return { dos, donts };
}
// 7–21 点里最好的两个时段和要避开的时段（太早太晚的时段不推荐给人安排事）
export function bestHours(x) {
  const day = (x.hours || []).filter((t) => t.i >= 4 && t.i <= 10);
  const top = day.slice().sort((p, q) => q.score - p.score).slice(0, 2);
  const worst = day.slice().sort((p, q) => p.score - q.score)[0];
  return { top, worst, worstWhy: worst ? ((worst.why.find((w) => w.v < 0) || {}).p || '能量偏低') : '' };
}
