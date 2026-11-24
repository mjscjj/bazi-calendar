// 挑日子：从明天起，在时间范围内先排除不合适的日子（黄历忌这类事、月破岁破、和本命相冲），
// 再按「个人分 + 十神对路 − 十神拧着 + 神煞 + 黄历宜」排序，取前 3 天，并给出每天 7–21 点里最好的两个时段。
import { dayOut, isChong } from './engine.js';
import { bestHours } from '../public/js/data.js';

const DAY_MS = 86400000;
const RANGE_DAYS = { '2w': 14, '1m': 30, '3m': 90 };

export function pickDays(c, type, allJi, today, range) {
  const [ty, tm, td] = today.split('-').map(Number);
  // 从明天开始挑：今天的好时段多半已经过去，挑日子是给接下来的事做安排
  const start = Date.UTC(ty, tm - 1, td) + DAY_MS;
  const end = range === 'month' ? Date.UTC(ty, tm, 0) : start + (RANGE_DAYS[range] - 1) * DAY_MS;
  const ji = new Set([...type.ji, ...allJi]);
  const excluded = { ji: 0, jiWords: [], po: 0, chong: 0 };
  const cands = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const dt = new Date(t), y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const x = dayOut(c, y, m, d, false);
    const jiHit = x.lunar.ji.filter((w) => ji.has(w));
    if (jiHit.length) { excluded.ji++; for (const w of jiHit) if (!excluded.jiWords.includes(w)) excluded.jiWords.push(w); continue; }
    if (isChong(x.gz[1], x.mgz[1]) || isChong(x.gz[1], x.ygz[1])) { excluded.po++; continue; }
    if (x.chongDay) { excluded.chong++; continue; }
    const yiHits = x.lunar.yi.filter((w) => type.yi.includes(w));
    const fit = type.ss.includes(x.ssG), against = type.avoid.includes(x.ssG);
    const tag = type.tag && x.tags.includes(type.tag);
    cands.push({ x, yiHits, fit, tag, s: x.score + (fit ? 15 : 0) - (against ? 20 : 0) + (tag ? 8 : 0) + (yiHits.length ? 6 : 0) });
  }
  cands.sort((a, b) => b.s - a.s || a.x.d - b.x.d);
  const top = cands.slice(0, 3);
  const picks = top.map((o) => {
    const full = dayOut(c, o.x.y, o.x.m, o.x.d, true);
    return {
      date: `${o.x.y}-${o.x.m}-${o.x.d}`, y: o.x.y, m: o.x.m, d: o.x.d,
      ssG: o.x.ssG, level: o.x.level, score: o.x.score, fit: o.fit, tag: o.tag ? type.tag : null, yiHits: o.yiHits,
      guiren: o.x.why.some((w) => /贵人日/.test(w.p)),
      hours: bestHours(full).top.map((h) => h.i),
    };
  });
  return {
    picks, best: top.length > 1 && top[0].s - top[1].s >= 5,
    days: Math.max(0, Math.round((end - start) / DAY_MS) + 1), candidates: cands.length, excluded,
    end: `${new Date(end).getUTCFullYear()}-${new Date(end).getUTCMonth() + 1}-${new Date(end).getUTCDate()}`,
  };
}
