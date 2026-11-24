// 手机操作走查：node test/e2e/mobile.mjs <baseUrl> <outDir>
// 用真实触摸事件验证：下拉关闭弹层、返回键关闭弹层、弹层时背景不滚、月历左右滑、未来 7 天就地打开、
// 输入框 16px（iPhone 不放大）、键盘弹出时收起页签、小按钮点按范围。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const ctx = await browser.newContext(iphone);
const page = await ctx.newPage();
const errors = [], results = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const cdp = await ctx.newCDPSession(page);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
async function drag(x, y0, x1, y1, steps = 8) {
  await touch('touchStart', x, y0);
  for (let i = 1; i <= steps; i++) await touch('touchMove', x + ((x1 - x) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  await touch('touchEnd', x1, y1);
}

// 准备一个已登录、有出生信息的账号
const name = 'm' + Date.now().toString(36);
await page.goto(base + '/');
await page.evaluate(async (u) => {
  const j = (p, b) => fetch('api/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  await j('auth/register', { username: u, password: 'mobile123', agree: true, birth: { date: '1990-10-19', time: '10:00', gender: '女' }, nickname: '小测' });
}, name);
await page.evaluate(() => { localStorage.setItem('lrl:guide', '1'); });
await page.goto(base + '/#/');
await page.reload();
await page.waitForSelector('.tcard');

// 1. 下拉关闭
await page.click('[data-today-detail]');
await page.waitForSelector('#sheet .hours');
check('弹层打开时背景锁定', await page.evaluate(() => document.body.style.position === 'fixed'));
const grab = await page.locator('#sheet .grab').boundingBox();
await drag(grab.x + grab.width / 2, grab.y + 2, grab.x + grab.width / 2, grab.y + 260);
await page.waitForTimeout(700);
check('从把手下拉关闭弹层', !(await page.$('#sheet')));
check('关闭后背景解锁', await page.evaluate(() => document.body.style.position === ''));

// 2. 返回键关闭弹层，不离开页面
await page.click('[data-almanac]');
await page.waitForSelector('#sheet .almbig');
const urlBefore = page.url();
await page.goBack();
await page.waitForTimeout(600);
check('返回键关掉弹层', !(await page.$('#sheet')));
check('返回键后还在今天页', page.url() === urlBefore && !!(await page.$('.tcard')), page.url());

// 3. 点 ✕ 关闭后，再按返回不会多退一步
await page.click('[data-outfit]');
await page.waitForSelector('#sheet .outfit');
await page.click('#sheet .close');
await page.waitForTimeout(700);
check('点 ✕ 关闭弹层', !(await page.$('#sheet')));
await page.click('.tabbar a[href="#/calendar"]');
await page.waitForSelector('.grid .c2');
await page.goBack();
await page.waitForTimeout(500);
check('之后按返回回到今天页（没有多余的历史记录）', !!(await page.$('.tcard')), page.url());

// 4. 本周 7 天：点某一天，卡片换成那天，不跳页
const target = await page.locator('.wstrip .wc:not(.on)').first().getAttribute('data-sel-day');
await page.click(`.wstrip [data-sel-day="${target}"]`);
await page.waitForSelector(`.wstrip .wc.on[data-sel-day="${target}"]`);
check('点本周的某天，卡片就地换成那天', !!(await page.$('.dslot.cur [data-day-go]')) && page.url().endsWith('#/'), page.url());
await page.screenshot({ path: `${out}/m1-week-day.png` });
await page.click('.dslot.cur [data-day-go]'); await page.waitForSelector('.wstrip .wc.today.on');

// 5. 月历左右滑
await page.click('.tabbar a[href="#/calendar"]');
await page.waitForSelector('.grid .c2');
const t0 = await page.textContent('.monthbar h2');
const g = await page.locator('.grid').boundingBox();
await drag(g.x + g.width - 20, g.y + 160, g.x + 30, g.y + 170);
await page.waitForFunction((t) => document.querySelector('.monthbar h2') && document.querySelector('.monthbar h2').textContent !== t && document.querySelector('.grid .c2'), t0, { timeout: 8000 });
const t1 = await page.textContent('.monthbar h2');
check('左滑换到下个月', t1 !== t0, `${t0.trim()} → ${t1.trim()}`);
await drag(g.x + 30, g.y + 160, g.x + g.width - 20, g.y + 170);
await page.waitForFunction((t) => document.querySelector('.monthbar h2') && document.querySelector('.monthbar h2').textContent !== t && document.querySelector('.grid .c2'), t1, { timeout: 8000 });
check('右滑换回来', (await page.textContent('.monthbar h2')) === t0);

// 6. 输入框 16px，聚焦时收起页签（用挑日子弹层里的输入框）
await page.click('[data-pick-open]'); await page.waitForSelector('#pickForm');
const PN = '#pickForm input[name=name]';
const fs = await page.$eval(PN, (el) => getComputedStyle(el).fontSize);
check('输入框字号 ≥ 16px（iPhone 不放大）', parseFloat(fs) >= 16, fs);
await page.focus(PN);
await page.waitForTimeout(100);
check('聚焦输入框时收起底部页签', await page.$eval('#tabbar', (el) => getComputedStyle(el).display === 'none'));
await page.$eval(PN, (el) => el.blur());
await page.waitForTimeout(150);
check('离开输入框后页签回来', await page.$eval('#tabbar', (el) => getComputedStyle(el).display !== 'none'));
const tsz = await page.locator('[data-ptype]').first().boundingBox();
check('事情类型按钮 ≥ 44px', tsz.height >= 44, `${Math.round(tsz.height)}px`);
await page.click('#sheet [data-close-sheet]'); await page.waitForSelector('#sheet', { state: 'detached' });

// 7. 小按钮的点按范围
await page.click('.tabbar a[href="#/"]');
await page.waitForSelector('.tcard');
const sizes = await page.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return Math.round(Math.min(b.width, b.height)); };
  return { status: r('.status'), share: r('.dslot.cur .tcard .ic'), mini: r('.mini'), tab: r('.tabbar a') };
});
check('顶栏状态标签够大', sizes.status >= 32, JSON.stringify(sizes));
await page.click('.tabbar a[href="#/me"]');
await page.waitForSelector('.mrow');
await page.click('[data-go="/profile"]');
await page.waitForSelector('#pForm');
const pill = await page.locator('[data-g]').first().boundingBox();
check('性别选项 ≥ 44px', pill.height >= 44, `${Math.round(pill.height)}px`);
const back = await page.locator('.phead .back').boundingBox();
check('返回按钮 ≥ 40px', back.height >= 40, `${Math.round(back.height)}px`);
await page.screenshot({ path: `${out}/m2-profile.png` });

// 8. 计划定在今天：今天页显示计划提醒（回归：曾因漏引用导致今天页报错）
await page.evaluate(async () => {
  const t = new Date(), date = `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
  const r = await fetch('api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '季度汇报', type: '汇报' }) });
  const { plan } = await r.json();
  await fetch('api/plans/' + plan.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
});
await page.goto(base + '/#/'); await page.reload();
await page.waitForSelector('.tcard');
check('计划定在今天时显示提醒', !!(await page.$('.notice.plan')), await page.$eval('.notice.plan', (el) => el.innerText).catch(() => '无'));

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
