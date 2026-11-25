// 桌面版走查：node test/e2e/desktop.mjs <baseUrl> <outDir>
// 1440×900：顶栏导航、今天页两栏、日历右侧详情面板（点日子不弹窗）、我的两栏、登录注册左右分栏；逐页截图。
import { setBirth } from './helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out] = process.argv.slice(2);
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
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [], results = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png` }); };

await page.goto(base + '/');
await page.waitForSelector('.tcard');
check('顶栏导航可见', await page.isVisible('.topnav'));
check('底部页签隐藏', !(await page.isVisible('#tabbar')));
const cols = await page.$eval('.dgrid', (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
check('今天页两栏', cols === 2, `${cols} 栏`);
await shot('d1-visitor-today');

await page.click('.notice a[href="#/start"]');
await page.waitForSelector('#bForm');
await shot('d2-start');
await page.fill('input[name=nickname]', '阿杰');
await setBirth(page, '1992-06-08', '08:30');
await page.click('[data-g="男"]');
await page.click('#bForm button[type=submit]');
await page.waitForSelector('.ecard.step');
await shot('d3-card-step');
for (let k = 0; k < 3; k++) await page.click('.stepnav [data-card-next]');
await page.waitForSelector('.ecard:not(.step)');
await shot('d3-card');
await page.click('a[href="#/register"]');
await page.waitForSelector('.pthumb');
await page.fill('input[name=username]', 'desk' + Date.now().toString(36));
await page.fill('input[name=password]', 'desktop123');
await page.fill('input[name=password2]', 'desktop123');
await page.check('input[name=agree]');
await shot('d4-register');
await page.click('#authForm button[type=submit]');
await page.waitForSelector('.tcard');
await page.waitForSelector('#sheet .guide');
await page.click('#sheet [data-close-sheet]');
await page.waitForSelector('#sheet', { state: 'detached' });
await page.click('.dslot.cur [data-day-step="1"]');
await page.waitForFunction(() => document.querySelector('.dslot.cur .eyebrow')?.textContent.includes('明天'));
await shot('d4b-tomorrow');
await page.click('.dslot.cur [data-day-go]'); await page.waitForSelector('.wstrip .wc.today.on');
await page.click('[data-draw]');
await page.waitForSelector('#drawForm'); await page.click('#drawForm button[type=submit]');
await tossToLot(page);
await page.waitForSelector('#sheet .lot', { timeout: 6000 });
await shot('d5-lot-modal');
await page.click('#sheet .close');
await page.waitForSelector('#sheet', { state: 'detached' });
await shot('d6-today');

await page.click('.topnav a[href="#/calendar"]');
await page.waitForSelector('.grid .c2');
await page.waitForSelector('#dayPanel .hours');
check('日历右侧有当日详情面板', await page.isVisible('#dayPanel'));
const before = await page.textContent('#dayPanel .ph2');
await page.click('.grid [data-d="15"]');
await page.waitForTimeout(300);
check('点日子更新右侧面板，不弹窗', !(await page.$('#sheet')) && (await page.textContent('#dayPanel .ph2')) !== before, (await page.textContent('#dayPanel .ph2')).trim());
await shot('d7-calendar');

await page.click('.topnav a[href="#/me"]');
await page.waitForSelector('.mecard');
const mcols = await page.$eval('.mgrid', (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
check('我的页两栏', mcols === 2, `${mcols} 栏`);
check('子页面时顶栏仍标出「我的」', await page.isVisible('.topnav a.on[href="#/me"]'));
await shot('d8-me');
await page.click('[data-go="/energy"]');
await page.waitForSelector('.force');
check('子页面时顶栏仍标出「我的」', await page.isVisible('.topnav a.on[href="#/me"]'));
await shot('d9-energy');
await page.click('.topnav a[href="#/me"]');
await page.click('[data-go="/member"]');
await page.waitForSelector('.mcard');
await shot('d10-member');

// 缩到手机宽度：切回手机版（底部页签、单栏）
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + '/#/');
await page.waitForSelector('.tcard');
await page.waitForTimeout(300);
check('缩到手机宽度后切回手机版', (await page.isVisible('#tabbar')) && !(await page.isVisible('.topnav')));

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
