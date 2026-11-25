// 每日一签走查：node test/e2e/lot.mjs <baseUrl> <dbPath> <outDir>
// 仪式：按住默念（不够三秒松手会退回）→ 摇签 → 星盘起签 → 往上抛筊。服务端以 JIAO_FAKE=xiao,sheng 启动：第 1 次笑杯（改问题再掷），第 2 次圣杯 → 解签。
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
// 两块筊杯现在哪一面朝上：0 平面，1 凸面
const faces = (pg) => pg.$$eval('#sheet .rbd', (els) => els.map((e) => { const m = /rotateX\((-?[\d.]+)deg\)/.exec(e.style.transform); return Math.round((((+m[1] % 360) + 360) % 360) / 180) % 2; }));
await p.reload(); await p.waitForSelector('[data-draw]');
check('小卡写着摇签、掷筊、解签', (await p.textContent('[data-draw]')).includes('掷筊'));
await p.click('[data-draw]'); await p.waitForSelector('#sheet .rit #drawForm');
check('第一步：默念所求', (await p.textContent('#sheet .rsteps li.on')).includes('默念所求'));
check('星盘正中是自己的日柱', (await p.textContent('#sheet .rcore small')).includes('日柱') && (await p.textContent('#sheet .rcore b')).length === 2);
check('点缀色是今天的幸运色', (await p.getAttribute('#sheet .rit', 'style')).includes('--lk:'));
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/l01-ask.png` });
await p.fill('#drawForm input[name=q]', '换工作');
// 按住默念：没按够三秒松手，退回来；按够了松手，进摇签
const hb = await (await p.$('#sheet [data-rite-hold]')).boundingBox();
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.waitForTimeout(900);
check('按住时光圈在走', Number(await p.$eval('#sheet .rit', (e) => e.style.getPropertyValue('--hp'))) > 0.15);
await p.screenshot({ path: `${out}/l01b-holding.png` });
await p.mouse.up(); await p.waitForTimeout(400);
check('没按够就松手：退回来，还在默念', !!(await p.$('#sheet .rit.p-ask')) && (await p.textContent('#sheet .rcap p')).includes('再来一次'));
await p.mouse.down(); await p.waitForTimeout(2900); await p.mouse.up();
await p.waitForSelector('#sheet [data-shake]');
check('第二步：摇签', (await p.textContent('#sheet .rsteps li.on')).includes('摇签'));
await p.click('#sheet [data-shake]'); await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/l02-shaking.png` });
await p.waitForSelector('#sheet [data-toss]', { timeout: 20000 });
const no = () => db.prepare('SELECT lot_no FROM draws WHERE user_id = ?').get(uid()).lot_no;
check('起签：最外一圈和正中都停在服务端给的那支签', (await p.textContent('#sheet .rcore b')).trim() === String(no()) && (await p.textContent('#sheet .rnm.hit')).trim() === String(no()));
check('天干、地支两圈各停在今天的一个字上', (await p.$$('#sheet .rgl.hit')).length === 2);
check('摇出签号，先不给签文', !(await p.$('#sheet .rit.p-lot')));
check('第三步：掷筊', (await p.textContent('#sheet .rsteps li.on')).includes('掷筊'));
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/l03-drawn.png` });
check('今天页小卡变成「还没掷筊确认」', (await p.textContent('[data-draw] small')).includes('还没掷筊'));
// 按住筊杯往上一甩
const tb = await (await p.$('#sheet .rtable')).boundingBox(), tx = tb.x + tb.width / 2, ty = tb.y + tb.height - 60;
await p.mouse.move(tx, ty); await p.mouse.down(); await p.waitForTimeout(120);
for (let k = 1; k <= 6; k++) { await p.mouse.move(tx, ty - k * 18); await p.waitForTimeout(12); }
await p.mouse.up(); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/l03b-tossing.png` });
await p.waitForSelector('#jQuestion', { timeout: 8000 }); await p.waitForTimeout(700);
check('笑杯：提示把问题说清楚，再掷一次', (await p.textContent('#sheet .rres b')).includes('笑杯') && (await p.textContent('#sheet [data-toss]')).includes('再掷'));
check('笑杯落地是两个平面', JSON.stringify(await faces(p)) === '[0,0]', JSON.stringify(await faces(p)));
check('第一次的结果记在小点上', (await p.$$('#sheet .rtries i.xiao')).length === 1);
await p.screenshot({ path: `${out}/l04-xiao.png` });
await p.fill('#jQuestion', '下个月要不要换工作');
await p.click('#sheet [data-toss]');
await p.waitForSelector('#sheet [data-jiao-read]', { timeout: 8000 }); await p.waitForTimeout(900);
check('圣杯：一正一反，金光', (await p.textContent('#sheet .rres b')).includes('圣杯') && JSON.stringify(await faces(p)) === '[0,1]' && !!(await p.$('#sheet .rit.blessed')), JSON.stringify(await faces(p)));
await p.screenshot({ path: `${out}/l05-sheng.png` });
await p.click('#sheet [data-jiao-read]');
await p.waitForSelector('#sheet .rit.p-lot .rpoem');
check('第四步：解签，带着改过的问题', (await p.textContent('#sheet .rsteps li.on')).includes('解签') && (await p.textContent('#sheet .rans .q')).includes('下个月要不要换工作'));
await p.waitForTimeout(4600);
await p.screenshot({ path: `${out}/l06-lot.png` });
check('从「换工作」认出问的是工作，先回答这一项', (await p.textContent('#sheet .rans .q em')).includes('事业工作') && (await p.textContent('#sheet .rans')).includes('建议'));
check('其余 8 类收成小格，每格有星数', (await p.$$('#sheet [data-rtopic]')).length === 8 && (await p.$$('#sheet [data-rtopic] .rdots')).length === 8);
await p.click('#sheet [data-rtopic]');
check('点一格，展开那一类的说明和建议', (await p.textContent('#sheet .rtdet.on')).includes('建议'));
await p.click('#sheet .rmore summary');
check('细读里有解曰、白话和签谱原文仙机 15 项', (await p.textContent('#sheet .rmore')).includes('解曰') && (await p.textContent('#sheet .rmore')).includes('白话') && (await p.$$('#sheet .rxj span')).length === 15);
await p.$eval('#sheet .rtiles', (el) => el.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/l06b-topics.png` });
await p.$eval('#sheet .rmore', (el) => el.scrollIntoView({ block: 'end' })); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/l06c-xianji.png` });
await p.click('#sheet [data-rite-keep]');
await p.waitForSelector('#sheet', { state: 'detached', timeout: 5000 });
check('收下这支签：回到今天，小卡显示签文关键词', !(await p.textContent('[data-draw] small')).includes('掷筊'));
await p.reload(); await p.waitForSelector('[data-draw]');
await p.click('[data-draw]'); await p.waitForSelector('#sheet .rit.p-lot .rpoem');
check('当天再点直接看签文', !!(await p.$('#sheet .rlot.fast')));
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });

// 阴杯：不再一次就结束，可以接着掷
const day = db.prepare('SELECT day FROM draws WHERE user_id = ?').get(uid()).day;
db.prepare(`UPDATE draws SET status = 'pending', tosses = '["yin"]' WHERE user_id = ? AND day = ?`).run(uid(), day);
await p.reload(); await p.waitForSelector('[data-draw]');
await p.click('[data-draw]'); await p.waitForSelector('#sheet [data-toss]');
check('回来接着掷：星盘直接停在这支签上', (await p.textContent('#sheet .rcore b')).trim() === String(no()));
check('阴杯：静一静再掷，第 2/3 次', (await p.textContent('#sheet .rres b')).includes('阴杯') && (await p.textContent('#sheet [data-toss]')).includes('2/3') && JSON.stringify(await faces(p)) === '[1,1]');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/l07-yin.png` });
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
// 三次都是阴杯：换个问题，重新摇一支
db.prepare(`UPDATE draws SET status = 'reask', tosses = '["yin","yin","yin"]' WHERE user_id = ? AND day = ?`).run(uid(), day);
await p.reload(); await p.waitForSelector('[data-draw]');
check('小卡：换个问题', (await p.textContent('[data-draw] small')).includes('换个问题'));
await p.click('[data-draw]'); await p.waitForSelector('#reaskForm');
check('三次阴杯：提示换个问题', (await p.textContent('#sheet .rres small')).includes('换个问题') && (await p.$$('#sheet .rtries i.yin')).length === 3);
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/l07b-reask.png` });
await p.fill('#reaskForm input', '这周要不要找老板谈');
await p.click('#reaskForm button');
await p.waitForSelector('#sheet [data-shake]');
check('换了问题：星盘重新转起来，回到摇签', !(await p.$('#sheet .rit.locked')) && (await p.textContent('#sheet .rsteps li.on')).includes('摇签'));
await p.click('#sheet [data-shake]');
await p.waitForSelector('#sheet [data-toss]', { timeout: 20000 });
check('重新摇出一支，从头掷', (await p.$$('#sheet .rtries i.xiao, #sheet .rtries i.yin, #sheet .rtries i.sheng')).length === 0);
await p.click('#sheet [data-toss]'); await p.waitForSelector('#jQuestion', { timeout: 8000 });
await p.click('#sheet [data-toss]'); await p.waitForSelector('#sheet [data-jiao-read]', { timeout: 8000 });
await p.click('#sheet [data-jiao-read]'); await p.waitForSelector('#sheet .rit.p-lot .rpoem');
check('新问题掷出圣杯后解签', (await p.textContent('#sheet .rans .q')).includes('找老板谈'));
await p.click('#sheet [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });
// 三次没圣杯又不全是阴杯：不勉强
db.prepare(`UPDATE draws SET status = 'closed', tosses = '["xiao","yin","xiao"]' WHERE user_id = ? AND day = ?`).run(uid(), day);
await p.reload(); await p.waitForSelector('[data-draw]');
check('小卡：今天时机未到', (await p.textContent('[data-draw] small')).includes('时机未到'));
await p.click('[data-draw]'); await p.waitForSelector('#sheet .rit.p-closed [data-close-sheet]');
check('三次没圣杯：不勉强，改日再来', (await p.textContent('#sheet .rres small')).includes('不勉强') && (await p.textContent('#sheet .rctl')).includes('改日'));
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/l07c-closed.png` });
await p.click('#sheet .rctl [data-close-sheet]'); await p.waitForSelector('#sheet', { state: 'detached' });

// 白色、深色主题，手机和电脑：仪式都是深色；电脑上是居中的一列
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
  const tag = (vp === iphone ? 'm' : 'd') + '-' + theme;
  await dp.fill('#drawForm input[name=q]', '和他能复合吗'); await dp.waitForTimeout(400);
  await dp.screenshot({ path: `${out}/l08-ask-${tag}.png` });
  await dp.press('#drawForm input[name=q]', 'Enter');
  await dp.click('#sheet [data-shake]');
  await dp.waitForSelector('#sheet [data-toss]', { timeout: 20000 }); await dp.waitForTimeout(700);
  await dp.click('#sheet [data-toss]'); await dp.waitForSelector('#jQuestion', { timeout: 8000 });
  await dp.click('#sheet [data-toss]'); await dp.waitForSelector('#sheet [data-jiao-read]', { timeout: 8000 }); await dp.waitForTimeout(900);
  await dp.screenshot({ path: `${out}/l09-sheng-${tag}.png` });
  await dp.click('#sheet [data-jiao-read]'); await dp.waitForSelector('#sheet .rans');
  check(`${tag} 问复合：先回答感情婚姻`, (await dp.textContent('#sheet .rans .q em')).includes('感情婚姻'));
  await dp.waitForTimeout(4600);
  await dp.screenshot({ path: `${out}/l10-lot-${tag}.png` });
  await dp.close();
}

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
