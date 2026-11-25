// 问事走查：node test/e2e/ask.mjs <baseUrl> <dbPath> <outDir> <adminPassword>
// 抽签弹层进入 → 写问题 → 起卦（卦象一爻一爻显出）→ 解读 → 问事记录 → 再问要付费（模拟付款后自动接着起卦）
// → 用这件事去挑日子 → 电脑端今天页侧栏入口 → 后台规则对比。服务端以 ALIPAY_FAKE=1、ASK_AI=fake 启动。
import { DatabaseSync } from 'node:sqlite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out, adminPw] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000'); // 服务也在写，撞上时等一等，别直接报 database is locked
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
check('手机今天页的小卡里有问事和御守', await p.isVisible('.minis .askmini') && await p.isVisible('.minis .ommini'));
await p.click('[data-draw]'); await p.waitForSelector('#drawForm'); await p.click('#drawForm button[type=submit]'); await tossToLot(p); await p.waitForSelector('#sheet .askentry', { timeout: 8000 });
await p.screenshot({ path: `${out}/a01-lot-entry.png` });
await p.click('#sheet .askentry'); await p.waitForSelector('#askForm');
check('从签弹层进入问事', !(await p.$('#sheet')));
await p.fill('#askForm textarea', '这周找老板谈加薪合适吗？');
await p.click('[data-acat-v="事业"]');
await p.screenshot({ path: `${out}/a02-ask-form.png`, fullPage: true });
await p.click('#askForm button[type=submit]');
await p.waitForSelector('.guacard .hex.reveal');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/a03-casting.png` });
await p.waitForSelector('.reading .hl', { timeout: 15000 });
await p.waitForTimeout(4200);
check('解读写好后出现', (await p.textContent('.reading .hl')).length > 4);
await p.screenshot({ path: `${out}/a04-result.png`, fullPage: true });
check('有两个适合的日子', (await p.$$('.chip.pick2')).length === 2);

await p.goto(base + '/#/asks'); await p.waitForSelector('.arow');
await p.screenshot({ path: `${out}/a05-asks.png` });
await p.click('a[href="#/ask"]'); await p.waitForSelector('#askForm');
check('免费次数用完后按钮显示价格', (await p.textContent('#askForm button[type=submit]')).includes('¥1.9'));
await p.fill('#askForm textarea', '下个月去成都出差顺利吗');
await p.click('[data-acat-v="出行"]');
await p.click('[data-amethod="nums"]');
const nums = await p.$$('.nums3 input');
for (const [i, v] of ['3', '8', '21'].entries()) await nums[i].fill(v);
await p.click('#askForm button[type=submit]');
await p.waitForSelector('#sheet .pay #openAlipay');
await p.screenshot({ path: `${out}/a06-pay-ask.png` });
const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(user).id;
const no = db.prepare("SELECT out_trade_no FROM orders WHERE user_id = ? AND product = 'ask' ORDER BY id DESC").get(uid).out_trade_no;
await p.request.post(base + '/api/dev/pay/' + no, { headers: { 'Content-Type': 'application/json' }, data: {} });
await p.waitForSelector('#sheet .pay .ok', { timeout: 10000 });
await p.screenshot({ path: `${out}/a07-paid.png` });
await p.waitForSelector('.guacard', { timeout: 12000 });
check('付完自动接着起卦', (await p.textContent('.askq b')).includes('成都'));
await p.waitForSelector('.reading .hl', { timeout: 15000 });
await p.click('[data-ask-pick]'); await p.waitForSelector('#pickForm', { timeout: 8000 });
check('用这件事去挑日子时带上事项', (await p.$eval('#pickForm input[name=name]', (e) => e.value)).includes('成都') && await p.isVisible('[data-ptype="出行"][aria-pressed="true"]'));
await p.screenshot({ path: `${out}/a08-ask-to-pick.png` });

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
