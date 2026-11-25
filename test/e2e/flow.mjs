// 浏览器端到端走查：node test/e2e/flow.mjs <baseUrl> <dbPath> <outDir>
// 需要环境变量 PLAYWRIGHT_MODULE、CHROME；服务端以 ALIPAY_FAKE=1 启动。
import { DatabaseSync } from 'node:sqlite';
import { setBirth } from './helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000'); // 服务也在写，撞上时等一等，别直接报 database is locked
// 掷筊直到圣杯再解签（服务端用 JIAO_FAKE=xiao,sheng 启动时第 2 次是圣杯）
async function tossToLot(pg) {
  await pg.waitForSelector('#sheet [data-toss]', { timeout: 8000 });
  for (let i = 0; i < 3; i++) {
    await pg.click('#sheet [data-toss]');
    await pg.waitForSelector('#sheet [data-jiao-read], #sheet [data-toss]:not([disabled]), #sheet .jdone', { timeout: 8000 });
    if (await pg.$('#sheet [data-jiao-read]')) { await pg.click('#sheet [data-jiao-read]'); return; }
    if (await pg.$('#sheet .jdone')) throw new Error('掷筊没求成（服务端启动时加 JIAO_FAKE=xiao,sheng）');
  }
}
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/402|Payment Required/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
};
const ctx = await browser.newContext(iphone);
const page = await ctx.newPage(); watch(page, 'mobile');
const shot = async (name, full = false) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log('shot', name); };
const step = (s) => console.log('—', s);
const closeSheet = async () => { await page.click('#sheet [data-close-sheet]'); await page.waitForSelector('#sheet', { state: 'detached' }); };

step('访客看示例的今天');
await page.goto(base + '/');
await page.waitForSelector('.tcard');
await shot('01-demo-today', true);
// 访客点要注册才能用的功能：弹一句说明和「测测我的能量卡」按钮，不只闪一下提示
await page.click('[data-draw]'); await page.waitForSelector('#sheet .guestask a[href="#/start"]');
await shot('01b-guest-ask');
await closeSheet();

step('测测我的能量卡（不用注册）');
await page.click('.notice a[href="#/start"]');
await page.waitForSelector('#bForm'); await shot('02a-start');
await page.fill('input[name=nickname]', '阿杰');
await setBirth(page, '1992-06-08', '08:30');
await page.click('[data-g="男"]');
await page.click('#bForm button[type=submit]');
await page.waitForSelector('.ecard.step');
const artOk = (sel) => page.waitForFunction((s) => { const i = document.querySelector(s); return i && i.complete && i.naturalWidth > 0; }, sel, { timeout: 8000 }).then(() => true, () => false);
if (!(await artOk('.ecard .art img'))) errors.push('能量卡的日柱插画没加载出来');
if (!/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥] · .+/.test(await page.textContent('.ecard .ttl'))) errors.push('能量卡标题不是「日柱 · 称号」');
for (const k of [1, 2, 3]) { await page.waitForTimeout(600); await shot('02-card-step' + k); await page.click('.stepnav [data-card-next]'); }
await page.waitForSelector('.ecard:not(.step)');
await shot('02-card-reveal');
await page.click('[data-share="card"]');
await page.waitForSelector('.sharepv img');
await shot('03-share-card');
await closeSheet();

step('保存并看我的今天 → 注册');
await page.click('a[href="#/register"]');
await page.waitForSelector('.pthumb');
await page.fill('input[name=username]', '测试用户');
await page.fill('input[name=password]', 'password1');
await page.fill('input[name=password2]', 'password1');
await page.check('input[name=agree]');
await shot('04-register');
await page.click('#authForm button[type=submit]');
await page.waitForSelector('.tcard');
await page.waitForSelector('#sheet .guide');
await shot('05-guide');
await page.click('[data-guide-next]'); await page.click('[data-guide-next]');
await shot('05-guide-3');
await closeSheet();
if (!(await artOk('.dslot.cur .dart img'))) errors.push('今天卡片里的画没加载出来');
if (!(await page.$('.dslot.cur .dart .seal'))) errors.push('今天的画没盖「收」印');
await shot('06-today');
await shot('06-today-full', true);

step('每日一签（完整仪式）');
await page.click('[data-draw]');
await page.waitForSelector('#drawForm'); await shot('07a-draw-ask');
await page.fill('#drawForm input[name=q]', '这周的面试');
await page.click('#drawForm button[type=submit]');
await page.waitForSelector('#sheet .shake');
await shot('07-shake');
await page.waitForSelector('#sheet [data-toss]', { timeout: 6000 }); await shot('07b-drawn');
await tossToLot(page);
await page.waitForSelector('#sheet .lot', { timeout: 5000 });
if (!(await page.textContent('#sheet .lotq')).includes('这周的面试')) errors.push('签上没带着所问之事');
await shot('08-lot');
await page.click('#sheet [data-share="lot"]');
await page.waitForSelector('.sharepv img');
await shot('09-share-lot');
await closeSheet();
const lot1 = await page.textContent('[data-draw] b');

step('幸运色、大家的今天、今天详情');
await page.click('[data-outfit]'); await page.waitForSelector('#sheet .outfit'); await shot('10-outfit'); await closeSheet();
await page.click('[data-almanac]'); await page.waitForSelector('#sheet .almbig'); await shot('11-almanac'); await closeSheet();
await page.click('[data-today-detail]'); await page.waitForSelector('#sheet .hours'); await shot('12-day-detail'); await closeSheet();
await page.click('[data-share="today"]'); await page.waitForSelector('.sharepv img'); await shot('13-share-today'); await closeSheet();

step('日历：挑日子');
await page.click('.tabbar a[href="#/calendar"]');
await page.waitForSelector('.grid .c2');
await shot('14-calendar', true);
await page.click('.grid [data-d="15"]'); await page.waitForSelector('#sheet .hours'); await closeSheet();
await page.click('[data-pick-open]');
await page.waitForSelector('#pickForm'); await shot('14b-pick-form');
await page.fill('#pickForm input[name=name]', '和客户谈续约');
await page.click('[data-ptype="签约"]');
await page.click('[data-prange="3m"]');
await page.click('#pickForm button[type=submit]');
await page.waitForSelector('#sheet .pc'); await shot('14c-pick-result');
await page.click('[data-pick-day="1"]'); await page.waitForSelector('#sheet .hours'); await shot('14d-pick-day');
await page.click('[data-pick-back="result"]'); await page.waitForSelector('#sheet .pc');
await page.locator('[data-pick-pin]').first().click();
await page.waitForSelector('#sheet', { state: 'detached' });
await page.waitForSelector('.prow');
await shot('14e-plans', true);
await page.click('.prow'); await page.waitForSelector('#sheet .plandet'); await shot('14f-plan-detail'); await closeSheet();
await page.click('[data-cal-yi]'); await page.waitForSelector('.grid.withyi'); await shot('14g-cal-yi'); await page.click('[data-cal-yi]');

step('我的、能量档案、专业模式');
await page.click('.tabbar a[href="#/me"]');
await page.waitForSelector('.mecard');
if (!(await artOk('.mecard .art img'))) errors.push('「我的」入口的插画没加载出来');
await page.click('[data-go="/jiazi"]'); await page.waitForSelector('.jzgrid .jz.got');
if ((await page.$$('.jzgrid .jz')).length !== 60) errors.push('一甲子不是 60 格');
await shot('15b-jiazi', true);
await page.click('.phead [data-back]'); await page.waitForSelector('.mecard');
await shot('15-me');
await page.click('[data-go="/energy"]');
await page.waitForSelector('.force');
if (!(await artOk('.pillarc .art img'))) errors.push('能量档案的日柱插画没加载出来');
await shot('16-energy', true);
await page.click('.tabbar a[href="#/me"]').catch(() => {});
await page.goto(base + '/#/me');
await page.waitForSelector('#proToggle');
await page.click('#proToggle');
await page.waitForSelector('#proToggle .switch.on');
await page.click('[data-go="/energy"]');
await page.waitForSelector('.pan table');
if (!/坐.+、/.test(await page.textContent('.pillarc small'))) errors.push('专业模式下日柱没显示命理标注');
await shot('17-energy-pro', true);
await page.goto(base + '/#/me'); await page.waitForSelector('#proToggle'); await page.click('#proToggle'); await page.waitForSelector('#proToggle .switch:not(.on)');

step('第二天：同一天签不变，换一天第二次体验');
await page.goto(base + '/#/'); await page.waitForSelector('.tcard');
const lot2 = await page.textContent('[data-draw] b');
if (lot1 !== lot2) errors.push(`同一天的签变了：${lot1} → ${lot2}`);
const uid = db.prepare("SELECT id FROM users WHERE username='测试用户'").get().id;
db.prepare("UPDATE usage_days SET day = '2000-01-01' WHERE user_id = ?").run(uid);
await page.reload(); await page.waitForSelector('.tcard');
await shot('18-last-free');

step('第三天：锁定页（大家的今天仍可见）');
db.prepare("UPDATE usage_days SET day = '2000-01-02' WHERE user_id = ? AND day != '2000-01-01'").run(uid);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.lock2');
await shot('19-locked');

step('手机支付 → 开通');
await page.click('.lock2 [data-pay]');
await page.waitForSelector('#openAlipay');
await shot('20-pay-mobile');
const no = db.prepare('SELECT out_trade_no FROM orders WHERE user_id = ? ORDER BY id DESC').get(uid).out_trade_no;
await page.request.post(base + '/api/dev/pay/' + no, { headers: { 'Content-Type': 'application/json' }, data: {} });
await page.waitForSelector('#sheet .pay .ok', { timeout: 10000 });
await shot('21-pay-success');
await page.waitForSelector('.tcard', { timeout: 10000 });
await shot('22-member-today');

step('电脑端');
const desk = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const dp = await desk.newPage(); watch(dp, 'desktop');
await dp.goto(base + '/#/login');
await dp.fill('input[name=username]', '测试用户');
await dp.fill('input[name=password]', 'password1');
await dp.click('#authForm button[type=submit]');
await dp.waitForSelector('.tcard');
await dp.waitForTimeout(400);
await dp.screenshot({ path: `${out}/23-desktop-today.png` });
await dp.goto(base + '/#/member');
await dp.waitForSelector('.card [data-pay]');
await dp.click('.card [data-pay]');
await dp.waitForSelector('.pay .qr svg'); await dp.waitForTimeout(400);
await dp.screenshot({ path: `${out}/24-desktop-pay.png` });

step('微信内付款引导');
const wx = await browser.newContext({ ...iphone, userAgent: iphone.userAgent + ' MicroMessenger/8.0.47' });
const wp = await wx.newPage(); watch(wp, 'wechat');
await wp.goto(base + '/#/login');
await wp.fill('input[name=username]', '测试用户');
await wp.fill('input[name=password]', 'password1');
await wp.click('#authForm button[type=submit]');
await wp.waitForSelector('.tcard');
await wp.goto(base + '/#/member');
await wp.waitForSelector('.card [data-pay]');
await wp.click('.card [data-pay]');
await wp.waitForSelector('#copyLink');
await wp.screenshot({ path: `${out}/25-wechat-pay.png` });

step('深色模式');
const dark = await browser.newContext({ ...iphone, colorScheme: 'dark' });
const kp = await dark.newPage(); watch(kp, 'dark');
await kp.goto(base + '/');
await kp.waitForSelector('.tcard'); await kp.waitForTimeout(300);
await kp.screenshot({ path: `${out}/26-dark.png` });

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
