// 今天页走查：node test/e2e/today.mjs <baseUrl> <outDir>
// 顺序：本周 7 天 → 每天的卡片 → 记录此刻 → 明天寄语和工具；左右滑换一天、滑出本周取下一周、回到今天；
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
check('从上往下：本周、卡片、记录此刻、明天寄语、工具', order.join(',') === 'wstrip,dayswipe,moodbox,tmrw,minis', order.join(','));
check('本周 7 天，选中的是今天', (await p.$$('.wstrip .wc')).length === 7 && (await p.getAttribute('.wstrip .wc.on', 'class')).includes('today'));
check('有趋势线', (await p.$$('.wtrend .ed')).length === 7);
const card = p.locator('.dslot.cur .tcard');
const verifyWeekDay = async () => {
  const sel = p.locator('.wstrip .wc.on');
  return await sel.getAttribute('data-sel-day') === await card.locator('time').getAttribute('datetime')
    && await sel.locator('.wscore').textContent() === (await card.locator('.ring b').textContent()) + ' · ' + (await card.locator('.ring small').textContent());
};
await p.locator('.wc:not(.on) .ed').first().click();
check('点趋势可选日，选中点与日卡分数和判断一致', await verifyWeekDay() && await p.locator('.wscore').count() === 1);
await p.click('.cur [data-day-go]');
const cardOrder = await card.locator('.hero3, .day-public, .day-personal, .today-hours').evaluateAll((els) => els.map((el) => el.className));
check('卡片顺序：今日主题、公共黄历、我的日历、时辰轴', cardOrder.join(',') === 'hero3,day-public,day-personal,today-hours');
check('公共和个人各有一组宜忌', (await card.locator('.day-compare .yj2 dd').count()) === 4);
check('时段轴保留各段状态并标出最佳时段', (await card.locator('.hour-seg.best').count()) === 1
  && (await card.locator('.hour-seg[class*=" k"]').count()) === 8
  && /最佳时段 \d{2}:00–\d{2}:00/.test(await card.locator('.hour-best').textContent())
  && !(await card.locator('.hcap').textContent()));
const hour = card.locator('[data-hour][aria-pressed="false"]').first();
const hourId = await hour.getAttribute('data-hour');
const hourName = (await hour.getAttribute('aria-label')).split('，')[0];
await hour.click();
check('点选时段更新解读', (await card.locator(`[data-hour="${hourId}"]`).getAttribute('aria-pressed')) === 'true' && (await card.locator('.hcap').textContent()).includes(hourName));
await card.locator('[data-today-detail]').click();
await p.waitForSelector('#sheet .hours');
check('时段详情可查看全天十二个时段', (await p.locator('#sheet .hours .hr').count()) === 12
  && (await p.locator('#sheet .sh').textContent()).includes('时段详情'));
check('次佳时段在时辰详情里', (await p.locator('#sheet .slots').textContent()).includes('次佳时段'));
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
// 幸运色并进了今天的卡片：主题下面一行，点开看为什么和配饰；右边小卡不再单独放
const luck = card.locator('.tluck .luck-field');
const luckLabels = await luck.locator('small').allTextContents();
const luckValues = await luck.locator('b').allTextContents();
check('幸运色和配饰都有值', luckLabels.join(',') === '幸运色,幸运配饰' && luckValues.every(Boolean) && await luck.locator('.luck-color').count() === 2);
check('小卡剩两张，没有单独的穿搭色', (await p.$$('.minis > *')).length === 2 && !(await p.$('.minis [data-outfit]')));
await p.click('.dslot.cur .tluck'); await p.waitForSelector('#sheet .outfit');
check('详情与卡片的两项取值一致', (await p.textContent('#sheet .sh b')).includes('今日幸运指南') && (await p.locator('#sheet .luck-field b').allTextContents()).join('|') === luckValues.join('|'));
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
check('明天寄语有一句准备的话', (await p.textContent('.tmrw .th2')).length > 8);
await p.evaluate(() => window.scrollTo(0, 0));
await p.screenshot({ path: `${out}/t01-top-light.png` });
await p.screenshot({ path: `${out}/t02-full-light.png`, fullPage: true });

// 记录区：先完成一项待办，刷新后仍在；心情继续用原来的便签。
await p.fill('.todo-add input', '整理今天的笔记');
await p.locator('.todo-add input').press('Enter');
await p.locator('.todo-list input').check();
await p.waitForSelector('.todos .todo-list input', { state: 'detached' });
await p.reload(); await p.click('[data-todo-history]');
await p.waitForSelector('.todo-archive input:checked');
check('完成项刷新后收在当天历史', await p.locator('.todos .todo-list li').count() === 0 && (await p.textContent('.todo-archive')).includes('整理今天的笔记'));
await p.locator('.todo-archive input').uncheck();
await p.waitForSelector('.todo-archive input', { state: 'detached' });
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
check('恢复后回到主清单', (await p.textContent('.todos .todo-list')).includes('整理今天的笔记') && !await p.locator('[data-todo-history]').count());
// 记录此刻
await p.click('[data-mood-quick="calm"]'); await p.waitForSelector('#moodForm');
check('点心情直接打开记录弹层并选好', (await p.getAttribute('#moodForm [data-mood-pick="calm"]', 'aria-pressed')) === 'true');
await p.click('#moodForm [data-mood-color="sage"]');
await p.fill('#moodForm textarea', '下午喝了杯好咖啡');
await p.screenshot({ path: `${out}/t03-record-sheet-light.png` });
await p.click('#moodForm button[type=submit]');
await p.waitForSelector('#sheet', { state: 'detached' });
await p.waitForSelector('.moodbox .mood-entry');
check('记下后出现在下面', (await p.textContent('.moodbox .mood-log')).includes('好咖啡'));
check('日期旁出现心情纸片', (await p.$$('.wc.today .wdate .mstk')).length === 1);
await p.click('[data-mood-rec]'); await p.waitForSelector('#moodForm');
check('没选心情时「记下」是灰的', await p.isDisabled('#moodForm button[type=submit]'));
await p.click('#moodForm [data-mood-pick="happy"]'); await p.click('#moodForm button[type=submit]');
await p.waitForFunction(() => document.querySelectorAll('.moodbox .mood-entry').length === 2);
// 只记一件事，不选心情
await p.click('.moodbox .mwrite'); await p.waitForSelector('#moodForm');
await p.fill('#moodForm textarea', '和设计过了一遍首页，定下了新的排版，周四给老板看第一版。');
check('只写字也能记', !(await p.isDisabled('#moodForm button[type=submit]')));
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/t03b-event-sheet-light.png` });
await p.click('#moodForm button[type=submit]');
await p.waitForSelector('.moodbox .mood-entry.ev');
check('只记事情的便签上就是那件事', (await p.textContent('.moodbox .mood-entry.ev')).includes('首页'));
await p.locator('.moodbox').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/t04-recorded-light.png` });
await p.click('.moodbox .mood-entry.ev [data-stk-open]'); await p.waitForSelector('#sheet .stkfull');
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
check('往左滑到后一天', next > today && await verifyWeekDay(), `${today} → ${next}`);
check('别的日子显示「回到今天」', await p.isVisible('.cur [data-day-go]'));
check('可提前添加待办，未来日期不显示心情入口', await p.isVisible('.todo-add') && !(await p.$('.moodbox .mchips')));
check('后一天列出两项幸运信息', (await p.$eval('.dslot.cur .tluck', (e) => e.tagName)) === 'DIV' && await luck.count() === 2);
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
check('公共黄历能点开', true);
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
