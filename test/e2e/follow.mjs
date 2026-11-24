// 追问和回看走查：node test/e2e/follow.mjs <baseUrl> <dbPath> <outDir>
// 起卦 → 解读写好 → 追问两次（第二次后输入框收起）→ 把起卦时间挪到 8 天前 → 今天页出现回看卡 → 一键记下 → 补一句
// → 结果页显示回看 → 问事记录显示“后来…”。手机和电脑、白色和深色各截一遍。服务端以 ASK_AI=fake 启动。
import { DatabaseSync } from 'node:sqlite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/402|401|409|Payment Required/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
};
const user = 'fol' + Date.now().toString(36).slice(-5);
const ctx = await browser.newContext(iphone);
const p = await ctx.newPage(); watch(p, 'mobile');
await p.goto(base + '/');
await p.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'follow123', agree: true, nickname: '小满', birth: { date: '1990-10-19', time: '10:00', gender: '女', city: '杭州' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); localStorage.setItem('lrl:theme', '"light"');
}, user);
await p.reload(); await p.waitForSelector('.tcard');
await p.goto(base + '/#/ask'); await p.waitForSelector('#askForm');
await p.fill('#askForm textarea', '要不要接下新部门的邀请');
await p.click('[data-acat-v="事业"]');
await p.click('#askForm button[type=submit]');
await p.waitForSelector('.reading .hl', { timeout: 15000 });
await p.waitForSelector('#followForm');
check('解读写好后出现追问框', true);
check('写着还能追问 2 次', (await p.textContent('.follows .ftip')).includes('2'));
check('回看约好了日子', (await p.textContent('.review .rvlead')).includes('约好了'));

await p.fill('#followForm input', '什么时候答复比较好');
await p.click('#followForm button');
await p.waitForSelector('.follows .writing');
check('追问后显示正在写、输入框收起', !(await p.$('#followForm')));
await p.waitForSelector('.follows .fa', { timeout: 15000 });
await p.waitForSelector('#followForm');
check('还能追问 1 次', (await p.textContent('.follows .ftip')).includes('1'));
await p.fill('#followForm input', '要先和现在的老板说吗');
await p.click('#followForm button');
await p.waitForFunction(() => document.querySelectorAll('.follows .fa').length === 2, null, { timeout: 15000 });
check('两次追问后不再有输入框', !(await p.$('#followForm')));
check('提示可以另起一卦', (await p.textContent('.follows .ftip')).includes('另起一卦'));
await p.locator('.follows').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/f01-follows-light.png`, fullPage: true });
await p.evaluate(() => { localStorage.setItem('lrl:theme', '"dark"'); }); await p.reload(); await p.waitForSelector('.follows .fa');
await p.screenshot({ path: `${out}/f02-follows-dark.png`, fullPage: true });

// 挪到 8 天前，今天页该提醒回看了
const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(user).id;
const askId = db.prepare('SELECT id FROM asks WHERE user_id = ?').get(uid).id;
db.prepare('UPDATE asks SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 8 * 86400000).toISOString(), askId);
await p.evaluate(() => { localStorage.setItem('lrl:theme', '"light"'); });
await p.goto(base + '/'); await p.reload(); await p.waitForSelector('.tcard');
await p.waitForSelector('.areview', { timeout: 8000 });
check('今天页出现回看卡', (await p.textContent('.areview .q')).includes('后来怎样了'));
await p.locator('.areview').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/f03-today-review-light.png` });
await p.evaluate(() => { localStorage.setItem('lrl:theme', '"dark"'); }); await p.reload(); await p.waitForSelector('.areview');
await p.locator('.areview').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/f04-today-review-dark.png` });
await p.click('[data-areview="progress"]');
await p.waitForSelector('.areview.done');
await p.fill('.arnote input', '谈了一次，下周再定');
await p.click('.arnote button');
await p.waitForSelector('.areview .rsaid');
check('今天页记下回看和一句话', (await p.textContent('.areview')).includes('有进展'));
await p.screenshot({ path: `${out}/f05-today-reviewed-dark.png` });
await p.reload(); await p.waitForSelector('.tcard'); await p.waitForTimeout(500);
check('记过以后今天页不再提醒', !(await p.$('.areview')));

await p.goto(base + '/#/ask/result?id=' + askId); await p.waitForSelector('.review .rvsaid');
check('结果页显示回看', (await p.textContent('.review')).includes('谈了一次'));
check('过了 7 天追问截止', (await p.textContent('.follows .ftip')).includes('截止'));
await p.locator('.review').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/f06-result-reviewed-dark.png` });
await p.click('[data-review-edit]'); await p.waitForSelector('[data-review="good"]');
await p.click('[data-review="good"]'); await p.waitForSelector('.review .rvsaid');
check('可以改回看结果', (await p.textContent('.review .rvsaid')).includes('顺利'));
await p.goto(base + '/#/asks'); await p.waitForSelector('.arow');
check('问事记录显示后来怎样', (await p.textContent('.arow')).includes('后来顺利'));
await p.screenshot({ path: `${out}/f07-asks-dark.png` });

// 电脑端：白色和深色
for (const theme of ['light', 'dark']) {
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dctx.newPage(); watch(dp, 'desktop-' + theme);
  await dp.goto(base + '/#/login');
  await dp.evaluate((t) => { localStorage.setItem('lrl:theme', JSON.stringify(t)); localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); }, theme);
  await dp.reload();
  await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'follow123');
  await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('.tcard');
  await dp.goto(base + '/#/ask/result?id=' + askId); await dp.waitForSelector('.review .rvsaid');
  await dp.screenshot({ path: `${out}/f08-desk-result-${theme}.png`, fullPage: true });
  await dctx.close();
}
// 电脑端今天页回看卡：再造一条到期的问事
db.prepare("INSERT INTO asks(user_id, question, qkey, category, gua, days, status, reading, charge, created_at) SELECT user_id, '下个月去成都出差顺利吗', 'x', category, gua, days, 'done', reading, 'free', ? FROM asks WHERE id = ?").run(new Date(Date.now() - 9 * 86400000).toISOString(), askId);
for (const theme of ['light', 'dark']) {
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dctx.newPage(); watch(dp, 'desktop-today-' + theme);
  await dp.goto(base + '/#/login');
  await dp.evaluate((t) => { localStorage.setItem('lrl:theme', JSON.stringify(t)); localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); }, theme);
  await dp.reload();
  await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'follow123');
  await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('.areview', { timeout: 8000 });
  check(`电脑端今天页回看卡（${theme}）`, (await dp.textContent('.areview')).includes('成都'));
  await dp.screenshot({ path: `${out}/f09-desk-today-${theme}.png`, fullPage: true });
  await dctx.close();
}

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
