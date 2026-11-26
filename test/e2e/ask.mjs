// 问事走查：node test/e2e/ask.mjs <baseUrl> <dbPath> <outDir> <adminPassword>
// 抽签弹层进入 → 写问题 → 短按只提示、按住才起卦 → 全屏推演（取数、除余、八卦环锁定、六爻、动爻翻转、倾向）
// → 结果页（走势、依据）→ 看推演重放 → 卦签分享 → 解读 → 问事记录 → 体验那 1 次用完再问要开通会员（模拟付款后自动接着起卦，之后问事不限次）
// → 用这件事去挑日子 → 电脑端今天页侧栏入口 → 后台规则对比。服务端以 ALIPAY_FAKE=1、ASK_AI=fake 启动。
import { DatabaseSync } from 'node:sqlite';
import { drawLot, holdToCast } from './helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out, adminPw] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000'); // 服务也在写，撞上时等一等，别直接报 database is locked
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/402|401|Payment Required/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
};
const user = 'ask' + Date.now().toString(36).slice(-5);
const ctx = await browser.newContext(iphone);
const p = await ctx.newPage(); watch(p, 'mobile');
await p.goto(base + '/');
await p.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'askask123', agree: true, nickname: '小满', birth: { date: '1990-10-19', time: '10:00', gender: '女', city: '杭州' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1');
}, user);
await p.reload(); await p.waitForSelector('.tcard');
check('问事在今天页，转运在日历旁', await p.isVisible('.minis .askmini') && await p.isVisible('.tabbar a[href="#/calendar"] + a[href="#/luck"]'));
await p.click('[data-draw]'); await drawLot(p); await p.waitForTimeout(4500);
await p.screenshot({ path: `${out}/a01-lot-entry.png` });
await p.click('#sheet .rlinks a[href="#/ask"]'); await p.waitForSelector('#askForm');
check('从签弹层进入问事', !(await p.$('#sheet')));
await p.fill('#askForm textarea', '这周找老板谈加薪合适吗？');
await p.click('[data-acat-v="事业"]');
await p.screenshot({ path: `${out}/a02-ask-form.png`, fullPage: true });
check('此刻起卦显示要用的四个数', (await p.$$('.akmline .akm-n b')).length === 4);
check('手机上「按住起卦」固定在屏幕底部', await p.evaluate(() => { const b = document.querySelector('.akbar'); const r = b.getBoundingClientRect(); return getComputedStyle(b).position === 'fixed' && r.bottom <= innerHeight + 1 && r.bottom >= innerHeight - 2; }));
// 短按：不起卦，只提示要按住
const hb = await (await p.$('#askForm [data-hold]')).boundingBox();
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await p.mouse.down(); await p.waitForTimeout(200); await p.mouse.up(); await p.waitForTimeout(400);
check('短按不起卦，提示按久一点', (await p.textContent('#holdTip')).includes('按久') && !db.prepare('SELECT 1 FROM asks').get());
await holdToCast(p, { skip: false });
await p.waitForSelector('#cast');
check('推演写出真实的算式', /÷ 8 余/.test(await p.textContent('#cast [data-row="up"]')));
await p.waitForSelector('#cast.st-end', { timeout: 12000 });
await p.screenshot({ path: `${out}/a03-casting.png` });
const cg = await p.evaluate(() => ({ lit: document.querySelectorAll('#cast .rt.on').length, rows: document.querySelectorAll('#cast .crow.done').length }));
check('八卦环锁定、三行算式都算完', cg.lit === 1 && cg.rows === 3, JSON.stringify(cg));
await p.waitForSelector('#cast', { state: 'detached', timeout: 8000 });
check('推演结束自动收起，结果页走势画出来', await p.isVisible('.gx.go .trend'));
await p.waitForSelector('.reading .hl', { timeout: 15000 });
await p.waitForTimeout(1600);
check('解读写好后出现', (await p.textContent('.reading .hl')).length > 4);
check('结论和今天可以做在第一屏', await p.evaluate(() => { scrollTo(0, 0); return document.querySelector('.reading .adv').getBoundingClientRect().bottom < innerHeight; }));
await p.screenshot({ path: `${out}/a04-result.png`, fullPage: true });
check('有两个适合的日子', (await p.$$('.dtile.pick2')).length === 2);
check('依据里有眼下、后来、时令三行', (await p.$$('.awhy .akw')).length === 3);
await p.click('[data-cast-replay]'); await p.waitForSelector('#cast');
await p.click('#cast .ctop [data-cast-skip]'); await p.waitForSelector('#cast', { state: 'detached' });
check('看推演可以重放、可以跳过', true);
await p.click('[data-ask-share]'); await p.waitForSelector('#sheet .sharepv img');
const q0 = await p.getAttribute('#sheet .sharepv img', 'src');
await p.click('[data-share-q="1"]'); await p.waitForTimeout(300);
check('卦签默认不带问题，可以切换带上', q0 !== await p.getAttribute('#sheet .sharepv img', 'src'));
await p.screenshot({ path: `${out}/a04b-share.png` });
await p.click('#sheet .sh [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });

await p.goto(base + '/#/asks'); await p.waitForSelector('.arow');
check('问事记录每一卦带卦象和走势', !!(await p.$('.arow .hx')) && !!(await p.$('.arow .spark')));
await p.screenshot({ path: `${out}/a05-asks.png` });
await p.click('a[href="#/ask"]'); await p.waitForSelector('#askForm');
check('体验那 1 次用完后，按钮写着先开通会员，不再单卖问事', (await p.textContent('#askForm [data-hold]')).includes('先开通会员') && !(await p.textContent('#view')).includes('¥1.9'));
await p.fill('#askForm textarea', '下个月去成都出差顺利吗');
await p.click('[data-acat-v="出行"]');
await p.click('[data-amethod="nums"]');
const nums = await p.$$('.nums3 input');
for (const [i, v] of ['3', '8', '21'].entries()) await nums[i].fill(v);
await holdToCast(p, { skip: false });
await p.waitForSelector('#sheet .pay #openAlipay');
check('弹出的是开通月度会员', (await p.textContent('#sheet .sh b')).includes('月度会员'));
await p.screenshot({ path: `${out}/a06-pay-ask.png` });
const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(user).id;
const no = db.prepare("SELECT out_trade_no FROM orders WHERE user_id = ? AND product = 'member' ORDER BY id DESC").get(uid).out_trade_no;
await p.request.post(base + '/api/dev/pay/' + no, { headers: { 'Content-Type': 'application/json' }, data: {} });
await p.waitForSelector('#sheet .pay .ok', { timeout: 10000 });
await p.screenshot({ path: `${out}/a07-paid.png` });
await p.waitForSelector('#cast', { timeout: 12000 });
check('报数起卦的推演用报的三个数', (await p.$$eval('#cast .cins b', (bs) => bs.map((x) => x.getAttribute('data-to')).join(','))) === '3,8,21' && (await p.textContent('#cast [data-row="up"]')).includes('3 ÷ 8 余'));
await p.click('#cast .ctop [data-cast-skip]'); await p.waitForSelector('#cast', { state: 'detached' });
check('付完自动接着起卦', (await p.textContent('.askq b')).includes('成都'));
check('问事没有再扣次数，记的是会员', db.prepare("SELECT charge FROM asks WHERE user_id = ? ORDER BY id DESC").get(uid).charge === 'member');
await p.waitForSelector('.reading .hl', { timeout: 15000 });
await p.click('[data-ask-pick]'); await p.waitForSelector('#pickForm', { timeout: 8000 });
check('用这件事去挑日子时带上事项', (await p.$eval('#pickForm input[name=name]', (e) => e.value)).includes('成都') && await p.isVisible('[data-ptype="出行"][aria-pressed="true"]'));
await p.screenshot({ path: `${out}/a08-ask-to-pick.png` });
await p.goto(base + '/#/ask'); await p.waitForSelector('#askForm [data-hold]');
check('开通会员后问事不限次', (await p.textContent('.quota')).includes('不限次') && (await p.textContent('#askForm [data-hold]')).includes('会员不限次'));
await p.screenshot({ path: `${out}/a08b-member-ask.png` });

// 电脑端
const dp = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(dp, 'desktop');
await dp.goto(base + '/#/login');
await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'askask123');
await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('.tcard');
check('电脑端今天页侧栏有问事入口', await dp.isVisible('.askmini'));
await dp.screenshot({ path: `${out}/a09-desk-today.png` });
await dp.goto(base + '/#/asks'); await dp.waitForSelector('.arow'); await dp.click('.arow'); await dp.waitForSelector('.reading');
await dp.screenshot({ path: `${out}/a10-desk-result.png` });

// 后台规则对比
const ad = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(ad, 'admin');
await ad.goto(base + '/admin');
await ad.fill('input[name=username]', 'admin'); await ad.fill('input[name=password]', adminPw); await ad.click('#lf button');
await ad.waitForSelector('.kpis');
await ad.goto(base + '/admin#/compare'); await ad.waitForSelector('#cf');
await ad.fill('#cf input[name=username]', user);
await ad.click('#cf button'); await ad.waitForSelector('.lvbar');
check('规则对比出结果', (await ad.$$('#cmp tr')).length > 28);
await ad.screenshot({ path: `${out}/a11-compare.png`, fullPage: true });

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
