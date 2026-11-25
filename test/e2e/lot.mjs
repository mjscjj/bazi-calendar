// 每日一签走查：node test/e2e/lot.mjs <baseUrl> <dbPath> <outDir>
// 服务端以 JIAO_FAKE=xiao,sheng 启动：第 1 次掷出笑杯（改问题再掷），第 2 次圣杯 → 解签。
// 再看阴杯接着掷、三次阴杯换个问题重新求、三次没圣杯改日再来。手机和电脑、白色和深色。
import { DatabaseSync } from 'node:sqlite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000'); // 服务也在写，撞上时等一等，别直接报 database is locked
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const p = await (await browser.newContext(iphone)).newPage();
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/402|409/.test(m.text())) errors.push('console: ' + m.text()); });
const user = 'lot' + Date.now().toString(36).slice(-5);
await p.goto(base + '/');
await p.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'lotlot123', agree: true, nickname: '小满', birth: { date: '1990-10-19', time: '10:00', gender: '女' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); localStorage.setItem('lrl:theme', '"light"');
}, user);
const uid = () => db.prepare('SELECT id FROM users WHERE username = ?').get(user).id;
await p.reload(); await p.waitForSelector('[data-draw]');
check('小卡写着摇签、掷筊、解签', (await p.textContent('[data-draw]')).includes('掷筊'));
await p.click('[data-draw]'); await p.waitForSelector('#drawForm');
check('第一步：默念所求', (await p.textContent('#sheet .jsteps li.on')).includes('默念所求'));
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/l01-ask.png` });
check('第一步不用选分类', !(await p.$('#drawForm .ltpick')));
await p.fill('#drawForm input[name=q]', '换工作');
await p.click('#drawForm button[type=submit]');
await p.waitForSelector('#sheet .shake');
check('第二步：摇签', (await p.textContent('#sheet .jsteps li.on')).includes('摇签'));
await p.waitForSelector('#sheet [data-toss]', { timeout: 6000 });
check('摇出签号，先不给签文', (await p.textContent('#sheet .jno')).includes('签') && !(await p.$('#sheet .poem')));
check('第三步：掷筊', (await p.textContent('#sheet .jsteps li.on')).includes('掷筊'));
await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/l02-drawn.png` });
check('今天页小卡变成「还没掷筊确认」', (await p.textContent('[data-draw] small')).includes('还没掷筊'));
await p.click('#sheet [data-toss]');
await p.waitForSelector('#sheet .jpair.tossing');
await p.screenshot({ path: `${out}/l03-tossing.png` });
await p.waitForSelector('#jQuestion', { timeout: 6000 });
check('笑杯：提示把问题说清楚，再掷一次', (await p.textContent('#sheet .jres.xiao')).includes('笑杯') && (await p.textContent('#sheet [data-toss]')).includes('再掷'));
await p.screenshot({ path: `${out}/l04-xiao.png` });
await p.fill('#jQuestion', '下个月要不要换工作');
await p.click('#sheet [data-toss]');
await p.waitForSelector('#sheet [data-jiao-read]', { timeout: 6000 });
check('圣杯：一正一反', (await p.textContent('#sheet .jres.sheng')).includes('圣杯') && (await p.$$('#sheet .jpair.land .jb.up')).length === 1);
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/l05-sheng.png` });
await p.click('#sheet [data-jiao-read]');
await p.waitForSelector('#sheet .lot .poem');
check('第四步：解签，带着改过的问题', (await p.textContent('#sheet .jsteps li.on')).includes('解签') && (await p.textContent('#sheet .lotq')).includes('下个月要不要换工作'));
await p.screenshot({ path: `${out}/l06-lot.png` });
check('解签带解曰四句', ((await p.textContent('#sheet .jieyue')) || '').includes('解曰'));
check('从「换工作」认出问的是工作，排第一', (await p.textContent('#sheet .ltrow.asked')).includes('事业工作') && (await p.$('#sheet .ltrow:first-of-type.asked')) !== null);
check('逐项运势 9 类，每类有星数、说明和建议', (await p.$$('#sheet .ltrow')).length === 9 && (await p.$$('#sheet .ltrow .lstars')).length === 9 && (await p.$$('#sheet .ltrow .ltadv')).length === 9);
await p.click('#sheet .xianji summary');
check('展开签谱原文仙机 15 项', (await p.$$('#sheet .xjgrid span')).length === 15);
await p.$eval('#sheet .ltlist', (el) => el.scrollIntoView({ block: 'start' }));
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/l06b-topics.png` });
await p.$eval('#sheet .xianji', (el) => el.scrollIntoView({ block: 'end' }));
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/l06c-xianji.png` });
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
check('小卡显示签文关键词', !(await p.textContent('[data-draw] small')).includes('掷筊'));
await p.reload(); await p.waitForSelector('[data-draw]');
await p.click('[data-draw]'); await p.waitForSelector('#sheet .lot');
check('当天再点直接看签文', true);
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });

// 阴杯：不再一次就结束，可以接着掷
const day = db.prepare('SELECT day FROM draws WHERE user_id = ?').get(uid()).day;
db.prepare(`UPDATE draws SET status = 'pending', tosses = '["yin"]' WHERE user_id = ? AND day = ?`).run(uid(), day);
await p.reload(); await p.waitForSelector('[data-draw]');
await p.click('[data-draw]'); await p.waitForSelector('#sheet [data-toss]');
check('阴杯：静一静再掷，第 2/3 次', (await p.textContent('#sheet .jres.yin')).includes('阴杯') && (await p.textContent('#sheet [data-toss]')).includes('2/3'));
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/l07-yin.png` });
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
// 三次都是阴杯：换个问题，重新摇一支
db.prepare(`UPDATE draws SET status = 'reask', tosses = '["yin","yin","yin"]' WHERE user_id = ? AND day = ?`).run(uid(), day);
await p.reload(); await p.waitForSelector('[data-draw]');
check('小卡：换个问题', (await p.textContent('[data-draw] small')).includes('换个问题'));
await p.click('[data-draw]'); await p.waitForSelector('#reaskForm');
check('三次阴杯：提示换个问题', (await p.textContent('#sheet .jdone')).includes('换个问题') && (await p.$$('#sheet .jhist span.yin')).length === 3);
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/l07b-reask.png` });
await p.fill('#reaskForm input', '这周要不要找老板谈');
await p.click('#reaskForm button');
await p.waitForSelector('#sheet [data-toss]', { timeout: 6000 });
check('换了问题重新摇出一支，从头掷', (await p.textContent('#sheet .lotq')).includes('找老板谈') && !(await p.$('#sheet .jhist')));
await p.click('#sheet [data-toss]'); await p.waitForSelector('#jQuestion', { timeout: 6000 });
await p.click('#sheet [data-toss]'); await p.waitForSelector('#sheet [data-jiao-read]', { timeout: 6000 });
await p.click('#sheet [data-jiao-read]'); await p.waitForSelector('#sheet .poem');
check('新问题掷出圣杯后解签', (await p.textContent('#sheet .lotq')).includes('找老板谈'));
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
// 三次没圣杯又不全是阴杯：不勉强
db.prepare(`UPDATE draws SET status = 'closed', tosses = '["xiao","yin","xiao"]' WHERE user_id = ? AND day = ?`).run(uid(), day);
await p.reload(); await p.waitForSelector('[data-draw]');
check('小卡：今天时机未到', (await p.textContent('[data-draw] small')).includes('时机未到'));
await p.click('[data-draw]'); await p.waitForSelector('#sheet .jdone');
check('三次没圣杯：不勉强，改日再来', (await p.textContent('#sheet .jdone')).includes('不勉强') && (await p.textContent('#sheet .jdone')).includes('改日'));
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });

// 深色、电脑端：重新摇
db.prepare('DELETE FROM draws WHERE user_id = ?').run(uid());
for (const [theme, vp] of [['dark', iphone], ['light', { viewport: { width: 1440, height: 900 } }], ['dark', { viewport: { width: 1440, height: 900 } }]]) {
  db.prepare('DELETE FROM draws WHERE user_id = ?').run(uid());
  const dp = await (await browser.newContext(vp)).newPage();
  dp.on('pageerror', (e) => errors.push(`${theme} pageerror: ` + e.message));
  await dp.goto(base + '/#/login');
  await dp.evaluate((t) => { localStorage.setItem('lrl:theme', JSON.stringify(t)); localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1'); }, theme);
  await dp.reload();
  await dp.fill('input[name=username]', user); await dp.fill('input[name=password]', 'lotlot123');
  await dp.click('#authForm button[type=submit]'); await dp.waitForSelector('[data-draw]');
  await dp.click('[data-draw]'); await dp.waitForSelector('#drawForm');
  await dp.fill('#drawForm input[name=q]', '和他能复合吗');
  await dp.click('#drawForm button[type=submit]');
  await dp.waitForSelector('#sheet [data-toss]', { timeout: 6000 }); await dp.waitForTimeout(700);
  const tag = (vp === iphone ? 'm' : 'd') + '-' + theme;
  await dp.screenshot({ path: `${out}/l08-drawn-${tag}.png` });
  await dp.click('#sheet [data-toss]'); await dp.waitForSelector('#jQuestion', { timeout: 6000 });
  await dp.click('#sheet [data-toss]'); await dp.waitForSelector('#sheet [data-jiao-read]', { timeout: 6000 }); await dp.waitForTimeout(400);
  await dp.screenshot({ path: `${out}/l09-sheng-${tag}.png` });
  await dp.click('#sheet [data-jiao-read]'); await dp.waitForSelector('#sheet .ltlist');
  check(`${tag} 问复合：感情婚姻排第一`, (await dp.textContent('#sheet .ltrow.asked')).includes('感情婚姻'));
  await dp.$eval('#sheet .ltlist', (el) => el.scrollIntoView({ block: 'start' })); await dp.waitForTimeout(300);
  await dp.screenshot({ path: `${out}/l10-topics-${tag}.png` });
  await dp.close();
}

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
