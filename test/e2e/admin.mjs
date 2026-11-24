// 后台走查：node test/e2e/admin.mjs <baseUrl> <outDir> <adminPassword>
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out, pw] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
// 先用一个临时用户提交一条反馈，后台才有东西可回复
const u = await browser.newContext();
const j = (data) => ({ headers: { 'Content-Type': 'application/json' }, data });
await u.request.post(base + '/api/auth/register', j({ username: 'fb_' + Date.now().toString(36), password: 'feedback123', agree: true }));
await u.request.post(base + '/api/feedback', j({ type: '建议', content: '希望加一个每日提醒', contact: 'wx:test' }));
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errors.push(m.text()); });
await page.goto(base + '/admin');
await page.fill('input[name=username]', 'admin');
await page.fill('input[name=password]', pw);
await page.click('button:has-text("登录")');
await page.waitForSelector('.kpis');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/a1-overview.png`, fullPage: true });
for (const [t, sel] of [['users', '.tbl table'], ['orders', '.tbl table'], ['feedback', '.fbs'], ['settings', '#sf'], ['logs', '.tbl table']]) {
  await page.click(`nav a[href="#/${t}"]`);
  await page.waitForSelector(sel);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/a-${t}.png`, fullPage: true });
}
await page.click('nav a[href="#/feedback"]');
await page.waitForSelector('[data-fbreply]');
await page.fill('.fbc [data-reply]', '谢谢建议，已经在排期了');
await page.click('.fbc [data-fbreply]');
await page.waitForSelector('.fbc .tag2.ok');
await page.click('nav a[href="#/users"]');
await page.waitForSelector('[data-reset]');
await page.click('[data-reset]');
await page.click('.dlg button[type=submit]');
await page.waitForSelector('.pwbox');
await page.screenshot({ path: `${out}/a-reset.png` });
console.log('new password shown:', (await page.textContent('.pwbox')).length === 10);
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
