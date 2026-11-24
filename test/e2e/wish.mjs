// 祈愿与御守走查：node test/e2e/wish.mjs <baseUrl> <dbPath> <outDir>
// 今天页入口 → 选心愿、方式、时长、款式 → 全屏静坐（测试里把时间加速 40 倍）→ 切出去自动暂停 → 揭晓御守 → 分享 → 我的御守
// → 再领特别款要付费（模拟付款后直接开始）→ 颂钵方式 → 提前结束不发御守。服务端以 ALIPAY_FAKE=1 启动。
import { DatabaseSync } from 'node:sqlite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const ctx = await browser.newContext(iphone);
await ctx.addInitScript(() => { const real = performance.now.bind(performance), t0 = real(); performance.now = () => t0 + (real() - t0) * 40; });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/402|Payment Required/.test(m.text())) errors.push('console: ' + m.text()); });
const user = 'wish' + Date.now().toString(36).slice(-5);
await p.goto(base + '/');
await p.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'wishwish1', agree: true, nickname: '小满', birth: { date: '1990-10-19', time: '10:00', gender: '女' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1');
}, user);
await p.reload(); await p.waitForSelector('.ommini');
check('今天页有本月御守入口', (await p.textContent('.ommini small')).includes('静坐'));
await p.click('.ommini'); await p.waitForSelector('.stycard');
await p.click('[data-wwish="事业"]'); await p.click('[data-wminutes="1"]');
await p.screenshot({ path: `${out}/w01-choose.png`, fullPage: true });
await p.click('[data-wish-start]');
await p.waitForSelector('#ritual .incense');
await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/w02-incense.png` });
// 切出去：暂停
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForSelector('#ritual .rpause:not([hidden])');
check('切出去自动暂停', true);
await p.screenshot({ path: `${out}/w03-paused.png` });
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.click('[data-ritual-resume]');
await p.waitForSelector('#ritual.revealed .omamori', { timeout: 15000 });
await p.waitForTimeout(1400);
await p.screenshot({ path: `${out}/w04-reveal.png` });
await p.click('[data-om-share]'); await p.waitForSelector('.sharepv img', { timeout: 8000 });
await p.screenshot({ path: `${out}/w05-share.png` });
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
check('关掉分享后还在揭晓页', await p.isVisible('#ritual.revealed'));
await p.click('[data-om-keep]'); await p.waitForSelector('.omgrid');
check('收下后进了我的御守', (await p.$$('.omcard')).length === 1);
await p.screenshot({ path: `${out}/w06-collection.png` });

// 特别款：先付费再开始，用颂钵
await p.click('a[href="#/wish"]'); await p.waitForSelector('.stycard');
check('基础款本月已领时默认选节气款', await p.isVisible('[data-wstyle="term"][aria-pressed="true"]'));
await p.click('[data-wway="bowl"]'); await p.click('[data-wminutes="1"]');
await p.screenshot({ path: `${out}/w07-choose-term.png`, fullPage: true });
await p.click('[data-wish-start]');
await p.waitForSelector('#sheet .pay #openAlipay');
const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(user).id;
const no = db.prepare("SELECT out_trade_no FROM orders WHERE user_id = ? AND product = 'amulet' ORDER BY id DESC").get(uid).out_trade_no;
await p.request.post(base + '/api/dev/pay/' + no, { headers: { 'Content-Type': 'application/json' }, data: {} });
await p.waitForSelector('#sheet .pay .ok', { timeout: 10000 });
await p.click('#sheet [data-close-sheet]');
await p.waitForSelector('#ritual .sbowl', { timeout: 8000 });
await p.click('[data-strike]'); await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/w08-bowl.png` });
await p.waitForSelector('#ritual.revealed .omamori', { timeout: 15000 });
await p.waitForTimeout(1400);
await p.screenshot({ path: `${out}/w09-reveal-term.png` });
await p.click('[data-om-keep]'); await p.waitForSelector('.omgrid');
check('节气款也收进来了', (await p.$$('.omcard')).length === 2);

// 提前结束不发
await p.goto(base + '/#/wish'); await p.waitForSelector('.stycard');
const before = db.prepare('SELECT COUNT(*) n FROM amulets WHERE user_id = ?').get(uid).n;
const credits = db.prepare('SELECT amulet_credits c FROM users WHERE id = ?').get(uid).c;
if (credits === 0) db.prepare('UPDATE users SET amulet_credits = 1 WHERE id = ?').run(uid);
await p.reload(); await p.waitForSelector('.stycard');
await p.click('[data-wish-start]'); await p.waitForSelector('#ritual');
p.once('dialog', (d) => d.accept());
await p.click('[data-ritual-end]');
await p.waitForSelector('#ritual', { state: 'detached' });
check('提前结束不发御守', db.prepare('SELECT COUNT(*) n FROM amulets WHERE user_id = ?').get(uid).n === before);
await p.goto(base + '/#/amulets'); await p.waitForSelector('.omcard');
await p.click('.omcard'); await p.waitForSelector('#sheet .omview');
await p.screenshot({ path: `${out}/w10-view.png` });

// 电脑端选择页
const dp = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
dp.on('pageerror', (e) => errors.push('desk pageerror: ' + e.message));
await dp.goto(base + '/#/login');
await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'wishwish1');
await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('.tcard');
await dp.screenshot({ path: `${out}/w11-desk-today.png` });
await dp.goto(base + '/#/amulets'); await dp.waitForSelector('.omgrid');
await dp.screenshot({ path: `${out}/w12-desk-collection.png` });

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
