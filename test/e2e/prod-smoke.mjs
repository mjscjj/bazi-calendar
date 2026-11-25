// 线上冒烟：node test/e2e/prod-smoke.mjs <baseUrl> <outDir> <username>
// 测能量卡 → 注册 → 今天 → 抽签 → 电脑端真实下单拿到支付宝二维码 → 手机端看跳转按钮。不付款；测完由运维删除该账号。
import { setBirth } from './helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out, username] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const m = await (await browser.newContext(iphone)).newPage(); watch(m);
await m.goto(base + '/');
await m.waitForSelector('.tcard');
await m.screenshot({ path: `${out}/p1-demo.png` });
await m.goto(base + '/#/start');
await setBirth(m, '1990-10-19', '10:00');
await m.click('[data-g="女"]');
await m.click('#bForm button[type=submit]');
await m.waitForSelector('.ecard.step');
for (let k = 0; k < 3; k++) await m.click('.stepnav [data-card-next]');
await m.waitForSelector('.ecard:not(.step)');
await m.waitForTimeout(1000);
await m.screenshot({ path: `${out}/p2-card.png` });
await m.click('a[href="#/register"]');
await m.fill('input[name=username]', username);
await m.fill('input[name=password]', 'smoketest123');
await m.fill('input[name=password2]', 'smoketest123');
await m.check('input[name=agree]');
await m.click('#authForm button[type=submit]');
await m.waitForSelector('.tcard');
await m.waitForSelector('#sheet .guide');
await m.click('#sheet [data-close-sheet]');
await m.click('[data-draw]');
await m.waitForSelector('#drawForm'); await m.click('#drawForm button[type=submit]');
await m.waitForSelector('#sheet [data-toss]', { timeout: 8000 }); await m.screenshot({ path: `${out}/p3-drawn.png` });
// 线上掷筊是真随机：解签、换个问题、今天没求成都算走通
for (let i = 0; i < 3; i++) {
  await m.click('#sheet [data-toss]');
  await m.waitForSelector('#sheet [data-jiao-read], #sheet [data-toss]:not([disabled]), #sheet .jdone', { timeout: 8000 });
  if (await m.$('#sheet [data-jiao-read]')) { await m.click('#sheet [data-jiao-read]'); await m.waitForSelector('#sheet .lot', { timeout: 8000 }); break; }
  if (await m.$('#sheet .jdone')) break;
}
console.log('lot:', (await m.$('#sheet .lot')) ? '解签' : '没求成（掷筊结果随机）');
await m.screenshot({ path: `${out}/p3-lot.png` });
await m.click('#sheet [data-close-sheet]');
await m.screenshot({ path: `${out}/p4-today.png` });
await m.goto(base + '/#/member');
await m.waitForSelector('.card [data-pay]');
await m.click('.card [data-pay]');
await m.waitForSelector('#openAlipay', { timeout: 20000 });
const href = await m.getAttribute('#openAlipay', 'href');
console.log('mobile scheme ok:', href.startsWith('alipays://platformapi/startapp?saId=10000007&qrcode=https%3A%2F%2Fqr.alipay.com%2F'));
const cookies = await m.context().cookies();
const d = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage(); watch(d);
await d.context().addCookies(cookies);
await d.goto(base + '/#/member');
await d.waitForSelector('.card [data-pay]');
await d.click('.card [data-pay]');
await d.waitForSelector('.pay .qr svg', { timeout: 20000 });
await d.waitForTimeout(500);
await d.screenshot({ path: `${out}/p5-pay-desktop.png` });
console.log('price shown:', await d.textContent('.pay .amt'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
