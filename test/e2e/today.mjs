// 今天页走查：node test/e2e/today.mjs <baseUrl> <outDir>
// 顺序：本周 7 天 → 每天的卡片 → 小卡 → 记录此刻 → 明天寄语；卡片左右滑换一天、滑出本周取下一周、回到今天；
// 记录此刻的弹层（选心情、换颜色、写一句）；访客示例页。手机和电脑、白色和深色各截一遍。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/402|401|409/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
};
const user = 'td' + Date.now().toString(36).slice(-5);
const ctx = await browser.newContext(iphone);
const p = await ctx.newPage(); watch(p, 'mobile');
const cdp = await ctx.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
async function swipe(dx) {
  await p.evaluate(() => window.scrollTo(0, 0)); await p.locator('#dayswipe').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const box = await p.locator('#dayswipe').boundingBox();
  const y = box.y + 120, x0 = box.x + box.width / 2;
  await touch('touchStart', x0, y);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x0 + (dx * i) / 8, y + i);
  await touch('touchEnd', x0 + dx, y + 8);
  await p.waitForTimeout(350);
}

// 访客示例页也是新顺序
await p.goto(base + '/'); await p.waitForSelector('.wstrip');
check('访客示例页有本周和明天寄语', await p.isVisible('.wstrip') && await p.isVisible('.tmrw'));

await p.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'today1234', agree: true, nickname: '小满', birth: { date: '1990-10-19', time: '10:00', gender: '女', city: '杭州' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); localStorage.setItem('lrl:theme', '"light"');
}, user);
await p.reload(); await p.waitForSelector('.wstrip .wc.on');
const order = await p.evaluate(() => [...document.querySelectorAll('.wstrip, #dayswipe, .moodbox, .minis, .tmrw')].map((e) => e.className.split(' ')[0] || e.id));
check('从上往下：本周、卡片、小卡、记录此刻、明天寄语', order.join(',') === 'wstrip,dayswipe,minis,moodbox,tmrw', order.join(','));
check('本周 7 天，选中的是今天', (await p.$$('.wstrip .wc')).length === 7 && (await p.getAttribute('.wstrip .wc.on', 'class')).includes('today'));
check('有趋势线', (await p.$$('.wtrend .ed')).length === 7);
check('明天寄语有一句准备的话', (await p.textContent('.tmrw .th2')).length > 8);
await p.screenshot({ path: `${out}/t01-top-light.png` });
await p.screenshot({ path: `${out}/t02-full-light.png`, fullPage: true });

// 记录此刻
await p.click('[data-mood-quick="calm"]'); await p.waitForSelector('#moodForm');
check('点心情直接打开记录弹层并选好', (await p.getAttribute('#moodForm [data-mood-pick="calm"]', 'aria-pressed')) === 'true');
await p.click('#moodForm [data-mood-color="sage"]');
await p.fill('#moodForm textarea', '下午喝了杯好咖啡');
await p.screenshot({ path: `${out}/t03-record-sheet-light.png` });
await p.click('#moodForm button[type=submit]');
await p.waitForSelector('#sheet', { state: 'detached' });
await p.waitForSelector('.moodbox .board .stk');
check('记下后出现在下面', (await p.textContent('.moodbox .board')).includes('好咖啡'));
check('趋势上出现心情纸片', (await p.$$('.wtrend .mdot')).length === 1);
await p.click('[data-mood-rec]'); await p.waitForSelector('#moodForm');
check('没选心情时「记下」是灰的', await p.isDisabled('#moodForm button[type=submit]'));
await p.click('#moodForm [data-mood-pick="happy"]'); await p.click('#moodForm button[type=submit]');
await p.waitForFunction(() => document.querySelectorAll('.moodbox .board .stk').length === 2);
// 只记一件事，不选心情
await p.click('.moodbox .mwrite'); await p.waitForSelector('#moodForm');
await p.fill('#moodForm textarea', '和设计过了一遍首页，定下了新的排版，周四给老板看第一版。');
check('只写字也能记', !(await p.isDisabled('#moodForm button[type=submit]')));
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/t03b-event-sheet-light.png` });
await p.click('#moodForm button[type=submit]');
await p.waitForSelector('.moodbox .board .stk.ev');
check('只记事情的便签上就是那件事', (await p.textContent('.moodbox .stk.ev')).includes('首页'));
await p.locator('.moodbox').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/t04-recorded-light.png` });
await p.click('.moodbox .stk.ev'); await p.waitForSelector('#sheet .stkfull');
check('点便签看全文', (await p.textContent('#sheet .stkfull')).includes('周四给老板看第一版'));
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/t04c-full-light.png` });
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });

// 左右滑：拖一小段，卡片跟手；松手弹回
{
  await p.evaluate(() => window.scrollTo(0, 0)); await p.locator('#dayswipe').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const box = await p.locator('#dayswipe').boundingBox(), y = box.y + 120, x0 = box.x + box.width / 2;
  await touch('touchStart', x0, y);
  for (let i = 1; i <= 6; i++) await touch('touchMove', x0 - 10 * i, y);
  const mid = await p.$eval('#dtrack', (e) => getComputedStyle(e).transform);
  check('拖动时卡片跟着手指走', +(mid.split(',')[4] || 0) < -30, mid);
  check('拖的时候后一天的卡片在旁边', !!(await p.$('.dslot.next .tcard')));
  await p.screenshot({ path: `${out}/t04b-dragging.png` });
  await touch('touchEnd', x0 - 60, y);
  await p.waitForTimeout(400);
  check('没拖够就弹回这一天', (await p.getAttribute('.wstrip .wc.on', 'class')).includes('today'));
}
const today = await p.getAttribute('.wstrip .wc.today', 'data-sel-day');
await swipe(-160);
const next = await p.getAttribute('.wstrip .wc.on', 'data-sel-day');
check('往左滑到后一天', next > today, `${today} → ${next}`);
check('别的日子显示「回到今天」', await p.isVisible('.cur [data-day-go]'));
check('后一天不显示记录此刻', !(await p.$('.moodbox')));
await p.screenshot({ path: `${out}/t05-next-day-light.png` });
await swipe(160); await swipe(160);
const prev = await p.getAttribute('.wstrip .wc.on', 'data-sel-day');
check('往右滑两次到前一天', prev < today);
check('前一天可以补记', (await p.textContent('.moodbox .mwrite')).includes('补记'));
for (let i = 0; i < 8; i++) { await p.click('#dayswipe .cur [data-day-step="1"]'); await p.waitForTimeout(450); }
await p.waitForSelector('#dayswipe .cur .tcard');
await p.waitForFunction((t) => document.querySelector('.wstrip .wc.on') && !document.querySelector('.wstrip .wc.today'), today, { timeout: 8000 });
check('翻出本周会取下一周', !(await p.$('.wstrip .wc.today')));
await p.screenshot({ path: `${out}/t06-next-week-light.png` });
await p.click('.cur [data-day-go]'); await p.waitForSelector('.wstrip .wc.today.on');
check('回到今天', true);
await p.click('[data-almanac]'); await p.waitForSelector('#sheet .almbig');
check('大家的这一天能点开', true);
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });

await p.evaluate(() => localStorage.setItem('lrl:theme', '"dark"')); await p.reload(); await p.waitForSelector('.wstrip');
await p.screenshot({ path: `${out}/t07-top-dark.png` });
await p.screenshot({ path: `${out}/t08-full-dark.png`, fullPage: true });
await p.click('[data-mood-rec]'); await p.waitForSelector('#moodForm'); await p.click('#moodForm [data-mood-pick="tired"]');
await p.screenshot({ path: `${out}/t09-record-sheet-dark.png` });

for (const theme of ['light', 'dark']) {
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dctx.newPage(); watch(dp, 'desktop-' + theme);
  await dp.goto(base + '/#/login');
  await dp.evaluate((t) => { localStorage.setItem('lrl:theme', JSON.stringify(t)); localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); }, theme);
  await dp.reload();
  await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'today1234');
  await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('.wstrip');
  await dp.screenshot({ path: `${out}/t10-desk-${theme}.png`, fullPage: true });
  await dp.click('[data-mood-rec]'); await dp.waitForSelector('#moodForm');
  await dp.screenshot({ path: `${out}/t11-desk-sheet-${theme}.png` });
  await dctx.close();
}

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
