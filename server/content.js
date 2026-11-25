// 内容库：能量卡、今日一句、穿搭色、观音灵签。文案都在 content/ 目录，启动时加载并校验，缺字段直接启动失败。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GAN, ZHI, WX, bornDay } from './engine.js';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../content');
// 日柱插画放在 public/art/pillars/，和文案目录无关（测试会把 content 拷到别处）
const ART_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/art/pillars');
const JIAZI = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);
const PAIR_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/art/pairs');
// 两个日干的组合键：按天干顺序排，55 种（含同一日干）
const pairKey = (a, b) => (GAN.indexOf(a) <= GAN.indexOf(b) ? a + b : b + a);
const HE = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
const gwx = (g) => Math.floor(GAN.indexOf(g) / 2);
const TEN = ['正财', '偏财', '正官', '七杀', '正印', '偏印', '比肩', '劫财', '食神', '伤官'];

function need(cond, msg) { if (!cond) throw new Error(`[content] ${msg}`); }
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export function loadContent(dir = DIR) {
  const cards = read(dir, 'energy-cards.json').cards;
  for (const g of GAN) {
    const c = cards[g];
    need(c, `能量卡缺少日干 ${g}`);
    for (const k of ['symbol', 'image', 'measure', 'en', 'intro', 'strong', 'weak']) need(typeof c[k] === 'string' && c[k], `能量卡 ${g} 缺少 ${k}`);
    need(Array.isArray(c.traits) && c.traits.length === 3, `能量卡 ${g} 需要三个性格词`);
  }
  // 日柱图鉴：60 个日柱各一张插画和一段白话（称号、介绍、身强一句、身弱一句）
  const pillars = read(dir, 'day-pillars.json').pillars;
  for (const gz of JIAZI) {
    const p = pillars?.[gz];
    need(p, `日柱图鉴缺少 ${gz}`);
    for (const k of ['name', 'tag', 'intro', 'strong', 'weak', 'art']) need(typeof p[k] === 'string' && p[k], `日柱图鉴 ${gz} 缺少 ${k}`);
    need(fs.existsSync(path.join(ART_DIR, p.art)), `日柱图鉴 ${gz} 的插画 public/art/pillars/${p.art} 不存在`);
  }
  // 两个人的画：55 种日干组合各一张画和画名，六种关系各一个标签和一句话
  const pairs = read(dir, 'pairs.json');
  for (let i = 0; i < 10; i++) for (let j = i; j < 10; j++) {
    const k = GAN[i] + GAN[j], p = pairs.pairs?.[k];
    need(p && p.name && p.art, `两个人的画缺少 ${k}`);
    need(fs.existsSync(path.join(PAIR_DIR, p.art)), `两个人的画 ${k} 的插画 public/art/pairs/${p.art} 不存在`);
  }
  for (const k of ['合', '同', '我生', '生我', '我克', '克我']) need(pairs.kinds?.[k]?.tag && pairs.kinds[k].text?.includes('{me}'), `两个人的画缺少关系 ${k}`);
  const line = read(dir, 'daily-line.json');
  for (const t of TEN) need(line.relations?.[t], `今日一句缺少十神 ${t}`);
  for (const k of [1, 2, 3, 4, 5]) need(Array.isArray(line.heads?.[k]) && line.heads[k].length, `今日一句缺少档位 ${k} 的行动话`);
  for (const k of [1, 2, 3, 4, 5]) need(line.draw_hints?.[k], `签的提示缺少档位 ${k}`);
  for (const k of [1, 2, 3, 4, 5]) need(Array.isArray(line.tomorrow?.[k]) && line.tomorrow[k].length && line.tomorrow[k].every((x) => typeof x === 'string' && x), `明天寄语缺少档位 ${k}`);
  const outfit = read(dir, 'outfit.json');
  for (const w of WX) {
    const e = outfit.elements?.[w];
    need(e && e.colors?.length >= 2 && e.accessories?.length && e.mood, `穿搭缺少五行 ${w}`);
  }
  for (const k of ['follow', 'balance', 'neutral']) need(outfit.lines?.[k], `穿搭缺少文案 ${k}`);
  const lots = read(dir, 'lots.json').lots;
  need(Array.isArray(lots) && lots.length === 100, '观音灵签需要 100 签');
  lots.forEach((l, i) => {
    need(l.no === i + 1, `签号不连续：第 ${i + 1} 条是 ${l.no}`);
    need(l.grade && l.title && l.plain && l.keyword, `第 ${l.no} 签缺少字段`);
    need(Array.isArray(l.poem) && l.poem.length === 4, `第 ${l.no} 签的签诗不是四句`);
  });
  const pick = read(dir, 'pick.json');
  need(Array.isArray(pick.all_ji), '挑日子缺少 all_ji');
  need(Array.isArray(pick.types) && pick.types.length, '挑日子缺少事项');
  for (const t of pick.types) {
    need(t.name && t.char, '挑日子的事项缺少名字或单字');
    need(Array.isArray(t.ss) && t.ss.every((x) => TEN.includes(x)), `挑日子「${t.name}」的十神不对`);
    need(Array.isArray(t.avoid) && t.avoid.every((x) => TEN.includes(x)), `挑日子「${t.name}」的 avoid 十神不对`);
    need(Array.isArray(t.yi) && Array.isArray(t.ji), `挑日子「${t.name}」缺少宜忌词`);
    need(!t.tag || ['桃花', '驿马'].includes(t.tag), `挑日子「${t.name}」的 tag 只能是桃花或驿马`);
  }
  const ask = read(dir, 'ask.json');
  const TRI = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
  for (const k of TRI) need(ask.trigrams?.[k]?.wx && ask.trigrams[k].lines?.length === 3, `问事缺少八卦 ${k}`);
  for (const u of TRI) for (const l of TRI) need(ask.hexagrams?.[u + l]?.name && ask.hexagrams[u + l].gist, `问事缺少卦 ${u}${l}`);
  need(Array.isArray(ask.categories) && ask.categories.length, '问事缺少方面');
  for (const x of ask.categories) need(!x.pick || pick.types.some((t) => t.name === x.pick), `问事方面「${x.name}」对应的挑日子事项不存在`);
  need(ask.refuse && ask.refuse_text && Array.isArray(ask.banned), '问事缺少 refuse、refuse_text 或 banned');
  const askPrompt = fs.readFileSync(path.join(dir, 'ask-prompt.md'), 'utf8');
  for (const k of ['question', 'ben', 'bian', 'tendency']) need(askPrompt.includes(`{{${k}}}`), `问事提示词缺少 {{${k}}}`);
  const fo = ask.follow;
  need(fo && [fo.max, fo.days, fo.review_days, fo.review_window].every((n) => Number.isInteger(n) && n >= 0), '问事缺少 follow 的 max、days、review_days 或 review_window');
  need(Array.isArray(fo.outcomes) && fo.outcomes.length && fo.outcomes.every((o) => /^[a-z]+$/.test(o.key || '') && o.text && o.hint), '问事回看的 outcomes 每条要有 key（小写字母）、text、hint');
  need(new Set(fo.outcomes.map((o) => o.key)).size === fo.outcomes.length, '问事回看的 outcomes 的 key 有重复');
  const askFollowPrompt = fs.readFileSync(path.join(dir, 'ask-follow-prompt.md'), 'utf8');
  for (const k of ['question', 'tendency', 'reading', 'history', 'follow']) need(askFollowPrompt.includes(`{{${k}}}`), `追问提示词缺少 {{${k}}}`);
  const moods = read(dir, 'moods.json');
  need(Number.isInteger(moods.max_per_day) && moods.max_per_day >= 1, '心情便签缺少 max_per_day');
  need(Number.isInteger(moods.note_max) && moods.note_max >= 10 && moods.note_max <= 200, '心情便签的 note_max 要在 10–200 之间');
  need(moods.colors?.some?.((c) => c.key === moods.event_color), '心情便签的 event_color 不在 colors 里');
  need(Array.isArray(moods.moods) && moods.moods.length >= 2, '心情便签至少要两种心情');
  for (const x of moods.moods) need(/^[a-z]+$/.test(x.key || '') && x.word && x.word.length <= 4 && x.char && x.char.length === 1 && [1, 2, 3, 4, 5].includes(x.score), `心情「${x.word || x.key}」要有 key（小写字母）、word（4 个字以内）、char（一个字）、score（1–5）`);
  need(Array.isArray(moods.colors) && moods.colors.length >= 2, '心情便签至少要两种颜色');
  for (const x of moods.colors) need(/^[a-z]+$/.test(x.key || '') && x.name && /^#[0-9A-Fa-f]{6}$/.test(x.light || '') && /^#[0-9A-Fa-f]{6}$/.test(x.dark || ''), `便签颜色「${x.name || x.key}」要有 key、name、light、dark（#RRGGBB）`);
  for (const x of moods.moods) need(moods.colors.some((c) => c.key === x.color), `心情「${x.word}」的默认颜色 ${x.color} 不在 colors 里`);
  for (const list of [moods.moods, moods.colors]) need(new Set(list.map((x) => x.key)).size === list.length, '心情便签的 key 有重复');
  const amulets = read(dir, 'amulets.json');
  need(Array.isArray(amulets.wishes) && amulets.wishes.every((w) => w.name && w.text && w.char), '御守缺少心愿');
  need(Array.isArray(amulets.minutes) && amulets.minutes.length && Array.isArray(amulets.breath) && amulets.breath.length, '御守缺少时长或呼吸引导');
  for (const w of WX) need(amulets.element_colors?.[w]?.length === 2, `御守缺少五行颜色 ${w}`);
  const terms = Object.values(amulets.seasons || {}).flatMap((x) => x.terms || []);
  need(terms.length === 24 && new Set(terms).size === 24, '御守的季节要覆盖 24 个节气');
  for (const [k, x] of Object.entries(amulets.seasons)) need(x.colors?.length === 2 && ['blossom', 'wave', 'leaf', 'snow'].includes(x.motif), `御守季节 ${k} 缺颜色或图案`);
  need(amulets.birthday?.colors?.length === 2 && amulets.birthday.ink, '御守缺少生日款颜色');
  return { cards, pillars, pairs, line, outfit, lots, pick, ask, askPrompt, askFollowPrompt, amulets, moods };
}

export function makeContent(c) {
  const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
  // 60 张日柱画：每一天也有日柱，今天页和「我的一甲子」按日柱找画
  const arts = Object.fromEntries(Object.entries(c.pillars).map(([gz, p]) => [gz, { name: p.name, art: 'art/pillars/' + p.art }]));
  const tone = (chart, w) => (chart.xi.includes(w) ? 'xi' : chart.ji.includes(w) ? 'ji' : 'neutral');
  const dayNum = (day) => day.y * 372 + day.m * 31 + day.d;

  return {
    arts, pick: c.pick, ask: c.ask,
    // 两个人的画：me 是「你」的日干，you 是对方的
    pair(me, you) {
      const p = c.pairs.pairs[pairKey(me, you)], a = gwx(me), b = gwx(you);
      const kind = HE.includes(pairKey(me, you)) ? '合' : a === b ? '同' : (a + 1) % 5 === b ? '我生' : (b + 1) % 5 === a ? '生我' : (a + 2) % 5 === b ? '我克' : '克我';
      const k = c.pairs.kinds[kind];
      return { name: p.name, art: 'art/pairs/' + p.art, kind, tag: k.tag, line: k.text.replace('{me}', c.cards[me].image).replace('{you}', c.cards[you].image) };
    }, askPrompt: c.askPrompt, askFollowPrompt: c.askFollowPrompt, amulets: c.amulets, moods: c.moods,
    pickType: (name) => c.pick.types.find((t) => t.name === name) || null,
    // 能量卡：日柱图鉴（插画、称号、介绍）、本命形象、性格词、五行比例、幸运元素
    energyCard(chart) {
      const card = c.cards[chart.dm];
      const total = chart.force.reduce((a, b) => a + b, 0);
      const gz = chart.pillars[2], p = c.pillars[gz];
      return {
        pillar: { gz, name: p.name, tag: p.tag, intro: p.intro, line: chart.strong ? p.strong : p.weak, art: 'art/pillars/' + p.art },
        born: bornDay(chart.birth.date),
        dm: chart.dm, element: WX[gwx(chart.dm)], symbol: card.symbol, image: card.image, en: card.en,
        traits: card.traits, intro: card.intro, strengthLine: chart.strong ? card.strong : card.weak, strong: chart.strong,
        force: chart.force.map((v, i) => ({ el: WX[i], pct: Math.round((v / total) * 100) })),
        lucky: chart.xi.map((i) => WX[i]), noTime: chart.noTime,
        // 排盘用的时间：按真太阳时（填了城市）或北京时间
        basis: chart.noTime ? null : { time: chart.birth.solar ? chart.birth.solar.time : chart.birth.time, zhi: chart.birth.timeZhi, city: chart.birth.city, solar: !!chart.birth.solar },
      };
    },
    // 今日一句：先一句按档位说的行动话，再说为什么（今天当家的天干对你是什么十神）
    dailyLine(chart, day) {
      const g = day.gz[0], w = gwx(g), card = c.cards[chart.dm];
      const head = pick(c.line.heads[day.level.k], dayNum(day));
      const why = `今天是${g}${WX[w]}当家，对你这${card.measure}${card.image}来说，${WX[w]}是${c.line.relations[day.ssG]}。`;
      return { head, why, text: `${head}${why}`, tone: tone(chart, w), ten: day.ssG };
    },
    // 明天寄语：按明天的档位给一句今晚能做的准备话
    tomorrowPrep(day, theme, hour) {
      return pick(c.line.tomorrow[day.level.k], dayNum(day)).replace(/\{theme\}/g, theme).replace(/\{hour\}/g, hour || '好时段');
    },
    // 今日穿搭色：今天的五行是幸运元素就顺着穿，否则穿第一幸运元素来平衡
    outfit(chart, day) {
      const dw = gwx(day.gz[0]);
      const follow = chart.xi.includes(dw);
      const el = follow ? dw : chart.xi[0];
      const e = c.outfit.elements[WX[el]];
      const kind = follow ? 'follow' : chart.ji.includes(dw) ? 'balance' : 'neutral';
      return {
        element: WX[el], colors: e.colors, accessory: pick(e.accessories, dayNum(day)), mood: e.mood,
        text: c.outfit.lines[kind].replace('{day}', WX[dw]).replace('{el}', WX[el]).replace('{mood}', e.mood),
      };
    },
    // 每日一签：由「用户 + 日期」决定，当天固定
    lotNumber(seed, date) {
      const h = crypto.createHash('sha256').update(`${seed}:${date}`).digest();
      return (h.readUInt32BE(0) % 100) + 1;
    },
    lot(no, level) {
      const l = c.lots[no - 1];
      return { no: l.no, grade: l.grade, title: l.title, poem: l.poem, plain: l.plain, keyword: l.keyword, hint: level ? c.line.draw_hints[level] : '' };
    },
  };
}
