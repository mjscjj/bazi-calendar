// 主题走查：node test/e2e/theme.mjs <baseUrl> <outDir>
// 默认白色；顶栏按钮切深色并记住；「我的 · 外观」可选白色 / 深色 / 跟随系统；手机和桌面各截两种主题。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };

for (const [label, opts] of [['m', iphone], ['d', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext({ ...opts, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} ${e.message}`));
  await page.goto(base + '/');
  await page.evaluate(async (u) => {
    await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'theme1234', agree: true, nickname: '小测', birth: { date: '1990-10-19', time: '10:00', gender: '女' } }) });
    localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1');
  }, 'th' + label + Date.now().toString(36));
  await page.reload(); await page.waitForSelector('.tcard'); await page.waitForTimeout(300);
  check(`${label} 默认白色`, (await bg(page)) === 'rgb(255, 255, 255)', await bg(page));
  await page.screenshot({ path: `${out}/${label}-light-today.png` });
  await page.click('[data-theme-toggle]'); await page.waitForTimeout(300);
  check(`${label} 顶栏按钮切到深色`, (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await bg(page)) !== 'rgb(255, 255, 255)', await bg(page));
  await page.screenshot({ path: `${out}/${label}-dark-today.png` });
  await page.reload(); await page.waitForSelector('.tcard'); await page.waitForTimeout(200);
  check(`${label} 刷新后还是深色`, (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.goto(base + '/#/calendar'); await page.waitForSelector('.grid .c2'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${label}-dark-calendar.png` });
  await page.goto(base + '/#/card'); await page.waitForSelector('.ecard'); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${label}-dark-card.png` });
  await page.goto(base + '/#/me'); await page.waitForSelector('[data-theme-set]');
  await page.click('[data-theme-set="light"]'); await page.waitForTimeout(300);
  check(`${label} 「我的 · 外观」选白色`, (await bg(page)) === 'rgb(255, 255, 255)' && (await page.isVisible('[data-theme-set="light"][aria-pressed="true"]')));
  await page.screenshot({ path: `${out}/${label}-light-me.png` });
  await page.goto(base + '/#/card'); await page.waitForSelector('.ecard'); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${label}-light-card.png` });
  await page.goto(base + '/#/calendar'); await page.waitForSelector('.grid .c2'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${label}-light-calendar.png` });
  await page.goto(base + '/#/me'); await page.waitForSelector('[data-theme-set]');
  await page.click('[data-theme-set="auto"]'); await page.waitForTimeout(200);
  check(`${label} 选跟随系统后去掉强制主题`, !(await page.evaluate(() => document.documentElement.dataset.theme)));
  await ctx.close();
}
// 系统是深色、没选过：跟随系统显示深色
const dctx = await browser.newContext({ ...iphone, colorScheme: 'dark' });
const dp = await dctx.newPage();
await dp.goto(base + '/'); await dp.waitForSelector('.tcard'); await dp.waitForTimeout(200);
check('系统深色时默认跟随深色', (await bg(dp)) !== 'rgb(255, 255, 255)', await bg(dp));

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
