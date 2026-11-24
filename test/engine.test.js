// 和原单页 HTML 里的 BZ 引擎逐日对拍：分数、等级、十神、理由、时辰都必须一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import lunar from 'lunar-javascript';
import { chart, calendar } from '../server/engine.js';

const html = fs.readFileSync(new URL('../ref/original.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('var BZ = (function(){'), html.indexOf('if(typeof module'));
const ctx = { Solar: lunar.Solar };
vm.runInNewContext(src + ';this.BZ=BZ;', ctx);
const BZ = ctx.BZ;
const j = (v) => JSON.parse(JSON.stringify(v));

const births = [
  { date: '1990-10-19', time: '10:00', gender: '女' },
  { date: '1985-02-04', time: '23:30', gender: '男' },
  { date: '2001-07-15', time: '04:05', gender: '男' },
  { date: '1976-12-31', time: '18:45', gender: '女' },
];
const months = [[2026, 11], [2026, 12], [2027, 2], [2025, 6]];

test('与原页面引擎逐日一致', () => {
  for (const b of births) {
    const [y, m, d] = b.date.split('-').map(Number), [h, mi] = b.time.split(':').map(Number);
    const C0 = BZ.chart(y, m, d, h, mi, b.gender);
    const C1 = chart(b);
    assert.deepEqual(C1.pillars, j(C0.pillars));
    assert.deepEqual(C1.xi, j(C0.xi));
    assert.equal(C1.strong, C0.strong);
    for (const [cy, cm] of months) {
      const cal = calendar(C1, cy, cm, null);
      cal.days.forEach((x) => {
        const o = BZ.scoreDay(C0, cy, cm, x.d);
        assert.equal(x.score, o.score, `${b.date} ${cy}-${cm}-${x.d}`);
        assert.equal(x.ssG, o.ssG);
        assert.deepEqual(x.why.map((w) => [w.v, w.t, w.p]), j(o.why.map((w) => [w.v, w.t, w.p])));
        assert.deepEqual(x.tags, j(o.tags));
        assert.equal(x.chongDay, o.chongDay);
        const oh = BZ.scoreHours(C0, o);
        assert.deepEqual(x.hours.map((t) => [t.score, t.ss, t.why.length]), j(oh.map((t) => [t.score, t.ss, t.why.length])));
      });
    }
  }
});

test('不知道出生时间时只排三柱', () => {
  const c = chart({ date: '1990-10-19', time: null, gender: '女' });
  assert.equal(c.pillars.length, 3);
  assert.equal(c.noTime, true);
  const cal = calendar(c, 2026, 11, '2026-11-23');
  assert.equal(cal.days.length, 30);
  assert.equal(cal.week.length, 7);
});

test('自定义喜用神生效', () => {
  const c = chart({ date: '1990-10-19', time: '10:00', gender: '女' }, { xi: [0], ji: [3] });
  assert.deepEqual(c.xi, [0]);
  assert.equal(c.xiCustom, true);
});

test('规则 v2：五档比例大致是 10% / 20% / 35% / 25% / 10%', async () => {
  const { chart, dayOut } = await import('../server/engine.js');
  let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const cnt = [0, 0, 0, 0, 0]; let n = 0;
  for (let i = 0; i < 40; i++) {
    const y = 1965 + Math.floor(rnd() * 40), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
    const c = chart({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, time: `${String(Math.floor(rnd() * 24)).padStart(2, '0')}:10`, gender: rnd() < 0.5 ? '男' : '女' }, null, 'v2');
    for (let k = 0; k < 365; k += 3) { const t = new Date(Date.UTC(2026, 0, 1) + k * 86400000); cnt[dayOut(c, t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), false).level.k - 1]++; n++; }
  }
  [0.10, 0.20, 0.35, 0.25, 0.10].forEach((want, i) => assert.ok(Math.abs(cnt[i] / n - want) < 0.07, `第 ${i + 1} 档 ${(cnt[i] / n * 100).toFixed(1)}%`));
});
