// 转运御守走查：node test/e2e/wish.mjs <baseUrl> <dbPath> <outDir>
// 今天页入口 → 转运页两个分页 → 做好事：记善行（一天最多 3 件）、攒满 5 件换一枚 → 分享 → 我的御守
// → 提能量：冥想（测试里把时间加速 40 倍，切出去自动暂停，提前结束不算）、释放练习（圣多纳释放法）、攒够 20 分钟换一枚
// → 直接买一枚（模拟付款后直接织好）。手机和电脑、白色和深色。服务端以 ALIPAY_FAKE=1 启动。
import { DatabaseSync } from 'node:sqlite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000'); // 服务也在写，撞上时等一等，别直接报 database is locked
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const ctx = await browser.newContext(iphone);
await ctx.addInitScript(() => { const real = performance.now.bind(performance), t0 = real(); performance.now = () => t0 + (real() - t0) * 40; });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/402|409|Payment Required/.test(m.text())) errors.push('console: ' + m.text()); });
const user = 'luck' + Date.now().toString(36).slice(-5);
await p.goto(base + '/');
await p.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'wishwish1', agree: true, nickname: '小满', birth: { date: '1990-10-19', time: '10:00', gender: '女' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); localStorage.setItem('lrl:theme', '"light"');
}, user);
const uid = () => db.prepare('SELECT id FROM users WHERE username = ?').get(user).id;
await p.reload(); await p.waitForSelector('.ommini');
check('今天页是转运御守入口', (await p.textContent('.ommini')).includes('转运御守') && (await p.textContent('.ommini small')).includes('0/5'));
await p.click('.ommini'); await p.waitForSelector('#deedForm');
check('两个分页：做好事和提能量', (await p.$$('.ltabs [data-luck-tab]')).length === 2 && (await p.getAttribute('[data-luck-tab="deed"]', 'aria-selected')) === 'true');
await p.screenshot({ path: `${out}/w01-luck-light.png`, fullPage: true });

// 做好事
await p.click('[data-deed-ex]');
check('点例子填进输入框', (await p.inputValue('#deedForm input')).length > 2);
await p.click('#deedForm button');
await p.waitForSelector('.dslots i.on');
for (const t of ['帮同事看了代码', '真心夸了一个人']) { await p.fill('#deedForm input', t); await p.click('#deedForm button'); await p.waitForFunction((n) => document.querySelectorAll('.dslots i.on').length === n, t === '帮同事看了代码' ? 2 : 3); }
check('一天记满 3 件就收起输入框', !(await p.$('#deedForm')) && (await p.textContent('.dtip')).includes('明天再来'));
db.prepare("UPDATE deeds SET day = '2000-01-01' WHERE user_id = ?").run(uid());
await p.reload(); await p.waitForSelector('#deedForm');
for (const t of ['给外卖员说了谢谢', '让座给老人']) { await p.fill('#deedForm input', t); await p.click('#deedForm button'); await p.waitForTimeout(300); }
await p.waitForSelector('[data-deed-exchange]');
check('攒满 5 件出现换御守', (await p.$$('.dslots i.on')).length === 5);
await p.screenshot({ path: `${out}/w02-five-light.png`, fullPage: true });
await p.click('[data-deed-exchange]'); await p.waitForSelector('#sheet .omx');
await p.click('[data-ox-wish="事业"]');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/w03-exchange-light.png` });
await p.click('[data-ox-go]'); await p.waitForSelector('[data-om-keep]');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/w04-reveal-light.png` });
check('换来的是善缘款', db.prepare('SELECT style FROM amulets WHERE user_id = ?').get(uid()).style === 'deed');
await p.click('[data-om-share]'); await p.waitForSelector('.sharepv img', { timeout: 8000 });
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
check('换完进度清零', (await p.$$('.dslots i.on')).length === 0 && (await p.textContent('.dlist')).includes('已换成御守'));

// 提能量：冥想
await p.click('[data-luck-tab="energy"]'); await p.waitForSelector('.eprog');
check('切到提能量分页', p.url().includes('tab=energy'));
await p.screenshot({ path: `${out}/w04b-energy-light.png`, fullPage: true });
await p.click('[data-med-min="1"]'); await p.click('[data-med-way="incense"]');
await p.click('[data-med-start]'); await p.waitForSelector('#ritual .incense');
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForSelector('#ritual .rpause:not([hidden])');
check('切出去自动暂停', true);
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.click('[data-ritual-resume]');
await p.waitForSelector('#ritual.revealed', { timeout: 15000 }); await p.waitForTimeout(300);
check('冥想练完不发御守，只记一次', (await p.textContent('#ritual')).includes('练完了') && db.prepare('SELECT COUNT(*) n FROM amulets WHERE user_id = ?').get(uid()).n === 1);
await p.screenshot({ path: `${out}/w05-meditate-done.png` });
await p.click('[data-ritual-close]'); await p.waitForSelector('#ritual', { state: 'detached' });
await p.waitForTimeout(300);
check('转运页显示这周冥想次数', (await p.textContent('#view')).includes('这周冥想 1 次'));
await p.click('[data-med-start]'); await p.waitForSelector('#ritual');
p.once('dialog', (d) => d.accept());
await p.click('[data-ritual-end]'); await p.waitForSelector('#ritual', { state: 'detached' });
check('提前结束不算', db.prepare("SELECT COUNT(*) n FROM practices WHERE user_id = ? AND kind = 'meditate'").get(uid()).n === 1);

// 提能量：释放练习
await p.click('[data-rel-start]'); await p.waitForSelector('#release .relbody');
await p.screenshot({ path: `${out}/w06-release-intro.png` });
await p.click('#release [data-rl-next]');
await p.fill('#rlTopic', '明天要汇报，有点慌'); await p.click('#release [data-rl-next]');
check('没打分不能下一步', await p.isDisabled('#release [data-rl-next]'));
await p.click('[data-rl-score="before:8"]'); await p.click('#release [data-rl-next]');
check('第一步要先呼吸一会儿', await p.isDisabled('#rlWait'));
await p.screenshot({ path: `${out}/w07-release-welcome.png` });
await p.waitForFunction(() => { const b = document.getElementById('rlWait'); return b && !b.disabled; }, null, { timeout: 15000 });
await p.click('#rlWait');
for (let i = 0; i < 3; i++) await p.click('#release .rchoices .btn >> nth=0');
await p.click('[data-rl-score="after:5"]');
await p.screenshot({ path: `${out}/w08-release-after.png` });
await p.click('#release [data-rl-next]');
check('还有感觉时问要不要再来一轮', (await p.textContent('#release')).includes('再来一轮'));
await p.click('[data-rl-again]');
check('第二轮从允许开始', (await p.textContent('#release .rround')).includes('第 2 轮'));
await p.waitForFunction(() => { const b = document.getElementById('rlWait'); return b && !b.disabled; }, null, { timeout: 15000 });
await p.click('#rlWait');
for (let i = 0; i < 3; i++) await p.click('#release .rchoices .btn >> nth=0');
await p.click('[data-rl-score="after:2"]'); await p.click('#release [data-rl-next]');
await p.waitForSelector('#release .rbig');
check('结束页显示前后对比', (await p.textContent('#release .rbig')).replace(/\s/g, '') === '8→2');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/w09-release-done.png` });
const rel = db.prepare("SELECT detail FROM practices WHERE user_id = ? AND kind = 'release'").get(uid());
check('释放练习记下前后分数和轮数', rel && JSON.parse(rel.detail).rounds === 2);
await p.click('#release [data-rl-close]'); await p.waitForSelector('#release', { state: 'detached' });
await p.waitForTimeout(300);
check('冥想 1 分钟 + 释放 3 分钟 = 4 分钟', (await p.textContent('.eprog')).includes('4/20'));
// 攒够 20 分钟换一枚静心款
db.prepare("INSERT INTO practices(user_id, kind, minutes, detail, created_at) VALUES(?, 'meditate', 20, '{}', ?)").run(uid(), new Date().toISOString());
await p.reload(); await p.waitForSelector('[data-energy-exchange]');
check('攒够 20 分钟出现换御守，分页上有红点', !!(await p.$('[data-luck-tab="energy"] .dot')));
await p.click('[data-energy-exchange]'); await p.waitForSelector('#sheet .omx');
await p.click('[data-ox-go]'); await p.waitForSelector('[data-om-keep]');
check('换来的是静心款，剩下的分钟留着', db.prepare("SELECT COUNT(*) n FROM amulets WHERE user_id = ? AND style = 'energy'").get(uid()).n === 1);
await p.click('[data-om-keep]'); await p.waitForTimeout(300);
check('进度只扣 20 分钟', (await p.textContent('.eprog')).includes('4/20'));

// 特别款：先付费
await p.click('.lbuy [data-om-buy]'); await p.waitForSelector('#sheet .omx');
check('默认买转运款', (await p.getAttribute('[data-ox-style="basic"]', 'aria-pressed')) === 'true');
await p.click('[data-ox-wish="平安"]');
await p.click('[data-ox-go]');
await p.waitForSelector('#sheet .pay #openAlipay');
const no = db.prepare("SELECT out_trade_no FROM orders WHERE user_id = ? AND product = 'amulet' ORDER BY id DESC").get(uid()).out_trade_no;
await p.request.post(base + '/api/dev/pay/' + no, { headers: { 'Content-Type': 'application/json' }, data: {} });
await p.waitForSelector('#sheet .pay .ok', { timeout: 10000 });
await p.click('#sheet [data-close-sheet]');
await p.waitForSelector('[data-om-keep]', { timeout: 8000 });
check('付完直接织好', db.prepare("SELECT COUNT(*) n FROM amulets WHERE user_id = ? AND way = 'buy'").get(uid()).n === 1);
await p.click('[data-om-keep]'); await p.waitForTimeout(300);
await p.goto(base + '/#/amulets'); await p.waitForSelector('.omgrid');
check('我的御守里有三枚', (await p.$$('.omcard')).length === 3 && (await p.textContent('.omgrid')).includes('善行换的') && (await p.textContent('.omgrid')).includes('冥想换的'));
await p.screenshot({ path: `${out}/w10-collection.png`, fullPage: true });

// 深色、电脑端
await p.evaluate(() => localStorage.setItem('lrl:theme', '"dark"'));
await p.goto(base + '/#/luck'); await p.reload(); await p.waitForSelector('.lsec');
await p.screenshot({ path: `${out}/w11-luck-dark.png`, fullPage: true });
for (const theme of ['light', 'dark']) {
  const dp = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  dp.on('pageerror', (e) => errors.push('desk pageerror: ' + e.message));
  await dp.goto(base + '/#/login');
  await dp.evaluate((t) => { localStorage.setItem('lrl:theme', JSON.stringify(t)); localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); }, theme);
  await dp.reload();
  await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'wishwish1');
  await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('.tcard');
  await dp.goto(base + '/#/luck'); await dp.waitForSelector('.lsec');
  await dp.screenshot({ path: `${out}/w12-desk-luck-${theme}.png`, fullPage: true });
  await dp.close();
}

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
