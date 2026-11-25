// 心情便签走查：node test/e2e/mood.mjs <baseUrl> <dbPath> <outDir>
// 贴三张（不同心情和颜色，带一句话）→ 撕掉一张 → 月历小纸片 → 当日详情；手机和电脑、白色和深色各截一遍。
import { DatabaseSync } from 'node:sqlite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000'); // 服务也在写，撞上时等一等，别直接报 database is locked
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/402|401|409/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
};
const setTheme = (p, t) => p.evaluate((t) => localStorage.setItem('lrl:theme', JSON.stringify(t)), t);
const user = 'md' + Date.now().toString(36).slice(-5);
const p = await (await browser.newContext(iphone)).newPage(); watch(p, 'mobile');
if (process.env.DEBUG) p.on('response', async (r) => { if (r.url().includes('/api/moods')) console.log('resp', r.status(), (await r.text()).slice(0, 120)); });
await p.goto(base + '/');
await p.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'mood1234', agree: true, nickname: '小满', birth: { date: '1990-10-19', time: '10:00', gender: '女', city: '杭州' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); localStorage.setItem('lrl:theme', '"light"');
}, user);
await p.reload(); await p.waitForSelector('.moodbox [data-mood-rec]');
check('一进来就能记一笔', await p.isVisible('.moodbox .mwrite') && await p.isVisible('.moodbox .mchips'));
await p.locator('.moodbox').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/m01-empty-light.png` });
const stick = async (mood, color, note) => {
  await p.click('[data-mood-rec]'); await p.waitForSelector('#moodForm');
  await p.click(`#moodForm [data-mood-pick="${mood}"]`); await p.click(`#moodForm [data-mood-color="${color}"]`);
  if (note) await p.fill('#moodForm textarea', note);
  const n = (await p.$$('.moodbox .board .stk')).length;
  await p.click('#moodForm button[type=submit]');
  await p.waitForFunction((n) => document.querySelectorAll('.moodbox .board .stk').length === n + 1, n);
};
await p.click('[data-mood-rec]'); await p.waitForSelector('#moodForm');
check('没选心情时「记下」是灰的', await p.isDisabled('#moodForm button[type=submit]'));
await p.click('#moodForm [data-mood-pick="happy"]');
check('选了心情「记下」就能点', !(await p.isDisabled('#moodForm button[type=submit]')));
await p.click('#moodForm [data-mood-pick="happy"]');
check('再点一次取消心情', (await p.getAttribute('#moodForm [data-mood-pick="happy"]', 'aria-pressed')) === 'false' && await p.isDisabled('#moodForm button[type=submit]'));
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
await stick('happy', 'apricot', '早上跑了五公里');
await stick('tired', 'sky', '');
await stick('calm', 'sage', '晚上看完一本书');
check('贴了三张', (await p.$$('.moodbox .board .stk')).length === 3);
await p.locator('.moodbox').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/m02-three-light.png` });
const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(user).id;
check('三张平均成当天的分数（5、2、3 → 3）', db.prepare('SELECT score FROM ratings WHERE user_id = ?').get(uid).score === 3);
await p.click('.moodbox .stk [data-unstick]');
await p.waitForTimeout(400);
check('点一下 × 先变成「撕掉」，不直接删', (await p.$$('.moodbox .board .stk')).length === 3 && (await p.textContent('.moodbox .stk .x.arm')) === '撕掉');
await p.locator('.moodbox').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/m02b-arm-light.png` });
await p.click('.moodbox .stk .x.arm');
await p.waitForFunction(() => document.querySelectorAll('.moodbox .board .stk').length === 2);
check('再点一下才撕掉', true);
await setTheme(p, 'dark'); await p.reload(); await p.waitForSelector('.moodbox .board');
await p.locator('.moodbox').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/m03-two-dark.png` });
await p.click('[data-mood-rec]'); await p.waitForSelector('#moodForm'); await p.click('#moodForm [data-mood-pick="upset"]'); await p.click('#moodForm [data-mood-color="blush"]');
await p.screenshot({ path: `${out}/m04-composer-dark.png` });
await p.click('#moodForm button[type=submit]');
await p.waitForFunction(() => document.querySelectorAll('.moodbox .board .stk').length === 3);

for (const theme of ['light', 'dark']) {
  await setTheme(p, theme);
  await p.goto(base + '/#/calendar'); await p.reload(); await p.waitForSelector('.grid .c2 .mstk');
  check(`手机月历有小纸片（${theme}）`, (await p.$$('.grid .c2.today .mstk i')).length === 3);
  await p.screenshot({ path: `${out}/m05-cal-${theme}.png` });
  await p.click('.c2.today'); await p.waitForSelector('#sheet .mymoods');
  await p.screenshot({ path: `${out}/m06-day-${theme}.png` });
  await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
}

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await ctx.newPage(); watch(dp, 'desktop-' + theme);
  await dp.goto(base + '/#/login');
  await dp.evaluate((t) => { localStorage.setItem('lrl:theme', JSON.stringify(t)); localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); }, theme);
  await dp.reload();
  await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'mood1234');
  await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('.moodbox .board');
  await dp.screenshot({ path: `${out}/m07-desk-today-${theme}.png`, fullPage: true });
  await dp.goto(base + '/#/calendar'); await dp.waitForSelector('.grid .c2 .mstk');
  check(`电脑月历小纸片上有字（${theme}）`, (await dp.textContent('.grid .c2.today .mstk')).length === 3);
  await dp.screenshot({ path: `${out}/m08-desk-cal-${theme}.png` });
  await ctx.close();
}

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
