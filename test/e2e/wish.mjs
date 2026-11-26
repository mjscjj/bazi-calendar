// 手机和桌面端的御守选取、掉落、分享、练习与模拟支付走查。
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
await p.reload();
const luckTab = p.locator('.tabbar a[href="#/calendar"] + a[href="#/luck"]');
check('日历旁的转运页签', (await luckTab.textContent()) === '转运');
await luckTab.click(); await p.waitForSelector('#deedForm');
check('两个分页：做好事和提能量', (await p.$$('.ltabs [data-luck-tab]')).length === 2 && (await p.getAttribute('[data-luck-tab="deed"]', 'aria-selected')) === 'true');
await p.screenshot({ path: `${out}/w01-luck-light.png`, fullPage: true });

// 善行掉落、个性化分享、同日连续记录
const countAmulets = () => db.prepare('SELECT COUNT(*) n FROM amulets WHERE user_id = ?').get(uid()).n;
check('架上有九种御守', await p.locator('[data-charm-wish]').count() === 9);
await p.click('[data-charm-wish="姻缘"]');
await p.locator('.deed-paper').evaluate(el => el.scrollIntoView({block:'center'}));
await p.locator('.deed-paper').screenshot({path:out + '/deed-entry.png'});
await p.click('.deed-ideas summary');
await p.click('[data-deed-ex]');
check('点例子填进输入框', (await p.inputValue('#deedForm input')).length > 2);
await p.click('#deedForm button');
await p.waitForFunction(()=>document.querySelector('.deed-balance').textContent.includes('还差 4 件'));
check('记录一件只增加进度', countAmulets() === 0 && !(await p.$('[data-deed-exchange]')));
for (const t of ['帮同事看了代码','真心夸了一个人','把座位让给别人','陪朋友散步']) {
  await p.fill('#deedForm input',t); await p.click('#deedForm button');
  await p.waitForFunction(text => document.querySelector('.deed-history li span')?.textContent === text,t);
}
check('五件攒满后可以兑换所选御守', countAmulets()===0 && await p.isVisible('[data-deed-exchange]'));
await p.click('[data-deed-exchange]'); await p.waitForSelector('[data-om-share]');
check('兑换扣五件，收到一枚',countAmulets()===1 && (await p.textContent('.deed-balance')).includes('已攒 0 件'));
await p.click('[data-om-share]'); await p.waitForSelector('.gift-preview');
await p.fill('#gift-to','阿晴'); await p.fill('#charm-message','愿你遇见的每一份善意，都恰好落在心上。');
const preview = () => p.getAttribute('.gift-preview','src');
const light = await preview();
await p.click('[data-gift-paper="dark"]');
await p.waitForFunction(src => document.querySelector('.gift-preview').src !== src, light);
await p.click('[data-gift-paper="light"]'); await p.waitForTimeout(350);
const download = p.waitForEvent('download');
await p.click('[data-share-save]'); await (await download).saveAs(out + '/gift.jpg');
await p.screenshot({path:out + '/gift-editor.png'});
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet',{state:'detached'});
await p.click('[data-luck-tab="energy"]'); await p.waitForSelector('[data-med-start]');
await p.click('[data-charm-wish="厄除"]');
check('切到提能量分页', p.url().includes('tab=energy'));
await p.screenshot({ path: `${out}/w04b-energy-light.png`, fullPage: true });
await p.click('[data-med-min="1"]'); await p.click('[data-med-way="incense"]');
await p.click('[data-med-start]'); await p.waitForSelector('#ritual .incense');
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForSelector('#ritual .rpause:not([hidden])');
check('切出去自动暂停', true);
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.click('[data-ritual-resume]');
await p.waitForFunction(()=>document.querySelector('.practice-result')?.textContent.includes('+1 分钟'));
check('完成冥想记入余额', countAmulets()===1 && (await p.textContent('.energy-goal')).includes('还差 19 分钟'));
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
await p.waitForFunction(()=>document.querySelector('.practice-result')?.textContent.includes('+3 分钟'));
const rel = db.prepare("SELECT detail FROM practices WHERE user_id = ? AND kind = 'release'").get(uid());
check('释放练习计入 3 分钟并显示前后感受', countAmulets() === 1 && JSON.parse(rel.detail).rounds === 2 && (await p.textContent('.energy-goal')).includes('感受 8 → 2 分'));
await p.locator('.energy-goal').evaluate(el=>el.scrollIntoView({block:'center'}));
await p.locator('.energy-goal').screenshot({path:out+'/energy-progress.png'});
await p.click('[data-med-min="20"]');
await p.click('[data-med-start]'); await p.waitForFunction(()=>document.querySelector('.practice-result')?.textContent.includes('+20 分钟'), null, {timeout:45000});
await p.click('[data-energy-exchange]'); await p.waitForSelector('[data-om-keep]');
check('24 分钟换一枚，余 4 分钟',countAmulets()===2 && (await p.textContent('.energy-goal')).includes('已攒 4 分钟'));
await p.click('[data-om-keep]'); await p.waitForSelector('#sheet',{state:'detached'});
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
check('收藏中的三枚御守及来源', (await p.$$('.omcard')).length === 3 && (await p.textContent('.omgrid')).includes('5 件善行换的') && (await p.textContent('.omgrid')).includes('20 分钟静心换的'));
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

if (errors.length) process.exitCode = 1;
