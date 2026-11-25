// 美国版 Sixty 走查：node test/e2e/us.mjs <美国版页面地址，如 http://127.0.0.1:3210/sixty/us/> <截图目录> [数据库路径]
// 服务端要开 US_EDITION=1 DAY_TZ=America/Chicago MEMBER_FOR_ALL=1 GENDER_OPTIONAL=1。给了数据库路径时，会把测试账号改成三天前注册，验证第二天打开要撕日历。（每日一签要 JIAO_FAKE=xiao,sheng，先笑杯再圣杯）
// 落地页 → 排盘动画 → 三张揭晓 → 注册 → Today（Why、表盘、一周条）→ 月历 → 当天 → 挑日子 → Me → 收藏墙 → 邀请 → 两人的画 → 深色 → 条款 → 注销
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out] = process.argv.slice(2);
const AMY = `t${Date.now()}a@example.com`, ALEX = `t${Date.now()}b@example.com`;
const b = await chromium.launch({ executablePath: process.env.CHROME });
const errs = [];
const mk = async (o = {}) => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...o }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text())); return p; };
const p = await mk();
const shot = (pg, n, full) => pg.screenshot({ path: `${out}/${n}.png`, fullPage: !!full });
const step = (s) => console.log('—', s);
step('landing'); await p.goto(base + '#/'); await p.waitForSelector('#birthForm'); await p.waitForTimeout(500); await shot(p, 'a1-landing');
await p.type('#bday', '03141992'); await p.click('#birthForm button');
step('theater'); await p.waitForSelector('.theater'); await p.waitForTimeout(900); await shot(p, 'b1-wheel'); await p.waitForTimeout(2900); await shot(p, 'b2-sky'); await p.waitForTimeout(2200); await shot(p, 'b3-five');
step('reveal'); await p.waitForSelector('.reveal-steps'); await p.waitForTimeout(1600); await shot(p, 'c1-reveal1');
await p.click('#nextStep'); await p.waitForSelector('#elBody .bars'); await p.waitForTimeout(1200); await shot(p, 'c2-reveal2');
await p.click('#nextStep'); await p.waitForTimeout(500); await shot(p, 'c3-reveal3');
step('signup'); await p.click('#toSignup'); await p.fill('#signup [name=email]', AMY); await p.fill('#signup [name=pw]', 'password123'); await p.fill('#signup [name=name]', 'Amy'); await p.check('#signup [name=agree]'); await shot(p, 'c4-signup');
await p.click('#signup button[type=submit]');
step('today'); await p.waitForSelector('#daycard .score'); await p.waitForTimeout(900);
console.log('tear on signup day (should be false):', !!(await p.$('.tear')));
if (process.argv[4]) { const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(process.argv[4]); const u = db.prepare("SELECT id FROM users WHERE username = ?").get(AMY);
  db.prepare("UPDATE users SET created_at = ? WHERE id = ?").run(new Date(Date.now() - 3 * 864e5).toISOString(), u.id); db.prepare('DELETE FROM open_days WHERE user_id = ?').run(u.id); db.close(); }
if (process.argv[4]) { await p.evaluate(() => localStorage.removeItem('sixty.torn')); await p.reload(); } await p.waitForSelector('#daycard .score'); await p.waitForTimeout(900);
console.log('tear overlay:', !!(await p.$('.tear'))); await shot(p, 'd1-tear');
if (await p.$('.tear')) { const bx = await (await p.$('.tpage')).boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + 60); await p.mouse.down(); for (let i = 1; i <= 8; i++) { await p.mouse.move(bx.x + bx.width / 2, bx.y + 60 + i * 22); await p.waitForTimeout(16); } await shot(p, 'd2-tearing'); await p.mouse.up(); await p.waitForTimeout(900); }
await shot(p, 'd3-today'); await p.click('.why-btn'); await p.waitForTimeout(300); await shot(p, 'd4-why', true);
const dial = await (await p.$('#dial svg')).boundingBox(); await p.mouse.move(dial.x + dial.width * 0.85, dial.y + dial.height * 0.5); await p.mouse.down(); await p.mouse.move(dial.x + dial.width * 0.5, dial.y + dial.height * 0.92, { steps: 6 }); await p.mouse.up();
await (await p.$('.dial-card')).screenshot({ path: `${out}/d5-dial.png` });
await p.click('#week button:nth-child(6)'); await p.waitForTimeout(600); await shot(p, 'd6-otherday');
step('mood'); await p.click('#week button.today'); await p.waitForSelector('.moodrow'); await p.click('.moodrow button[data-m=calm]'); await p.waitForSelector('.moodlog'); console.log('mood logged:', await p.textContent('.moodlog'));
step('a2hs'); await p.evaluate(() => localStorage.setItem('sixty.days', JSON.stringify(['2020-01-01']))); await p.goto(base + '#/calendar'); await p.goto(base + '#/today'); await p.waitForSelector('#a2hs'); await (await p.$('#a2hs')).screenshot({ path: `${out}/d7-a2hs.png` });
step('calendar'); await p.click('.tabs a[data-tab=calendar]'); await p.waitForSelector('.cal button.lv3, .cal button.lv4, .cal button.lv2, .cal button.lv5'); await p.waitForTimeout(1200); await shot(p, 'e1-cal');
await p.click('.cal button[data-d$="-20"]'); await p.waitForSelector('#sheet .score'); await p.waitForTimeout(500); await shot(p, 'e2-daysheet'); await p.click('#sheet .x');
step('pick'); await p.goto(base + '#/pick'); await p.waitForSelector('.picks'); await p.click('.picks button'); await p.waitForTimeout(700); await shot(p, 'e3-scan'); await p.waitForSelector('.result'); await p.waitForTimeout(700); await shot(p, 'e4-pick', true);
await p.click('[data-save]'); await p.waitForFunction(() => document.querySelector('[data-save]').disabled); console.log('plan saved');
await p.goto(base + '#/calendar'); await p.waitForSelector('.planrow'); await shot(p, 'e5-plans', true);
step('me'); await p.click('.tabs a[data-tab=me]'); await p.waitForSelector('.pillars'); await p.waitForTimeout(1200); await shot(p, 'f1-me', true);
step('oracle'); await p.click('.tabs a[data-tab=oracle]'); await p.waitForSelector('#hold'); await p.fill('#q', 'Should I take the new job?'); await p.click('.topics .chip[data-k=work]'); await shot(p, 'o1-ask');
{ const h = await (await p.$('#hold')).boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.waitForTimeout(1500); await p.mouse.up(); }
await p.waitForSelector('#toss', { timeout: 15000 }); await shot(p, 'o2-lot');
await p.click('#toss'); await p.waitForTimeout(500); await shot(p, 'o3-flying');
// 本地 JIAO_FAKE=xiao,sheng 时先笑杯再圣杯；线上随机，一直掷到出结果（解签 / 换个问题 / 今天不再求）
for (let i = 0; i < 4; i++) {
  await p.waitForFunction(() => document.querySelector('.reading, #hold, .orc-note') || (document.querySelector('#toss') && !document.querySelector('.toss-area.fly')), null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  if (i === 0) await shot(p, 'o4-after-first');
  if (!(await p.$('#toss')) || (await p.$('.reading'))) break;
  await p.click('#toss');
}
await p.waitForTimeout(2600); await shot(p, 'o5-result', true);
console.log('oracle ended in:', (await p.$('.reading')) ? 'reading · ' + (await p.textContent('.rd-title')) + ' · asked first: ' + (await p.$eval('.topiclist .tp', (x) => x.classList.contains('asked'))) : (await p.$('#hold')) ? 'rephrase' : 'closed for today');
step('recap'); await p.goto(base + '#/recap'); await p.waitForSelector('.recap h1'); await p.waitForTimeout(900); await shot(p, 'f3-recap', true);
await p.goto(base + '#/collection'); await p.waitForSelector('.reward'); await shot(p, 'f4-reward');
await p.goto(base + '#/collection'); await p.waitForSelector('.wall a'); await p.waitForTimeout(800); await shot(p, 'f2-collection');
step('invite'); const code = await p.evaluate(async () => (await (await fetch('../api/me/invite')).json()).code);
const q = await mk(); await q.goto(base + `#/i/${code}`); await q.waitForSelector('#pairForm'); await q.waitForTimeout(400); await shot(q, 'g1-invite');
await q.type('#pday', '07041990'); await q.click('#pairForm button'); await q.waitForSelector('.mergebox'); await q.waitForTimeout(400); await shot(q, 'g2-merge'); await q.waitForTimeout(1600); await shot(q, 'g3-pair');
await q.click('#pairSignup'); await q.fill('#signup [name=email]', ALEX); await q.fill('#signup [name=pw]', 'password123'); await q.check('#signup [name=agree]'); await q.click('#signup button[type=submit]'); await q.waitForSelector('#daycard .score');
await q.goto(base + '#/friends'); await q.waitForSelector('.friend'); await shot(q, 'g4-friends');
await q.click('.friend'); await q.waitForSelector('#fShare'); await shot(q, 'g5-friend');
step('dark'); await p.evaluate(() => localStorage.setItem('sixty.theme', '"dark"')); await p.goto(base + '#/today'); await p.reload(); await p.waitForSelector('#daycard .score'); await p.waitForTimeout(900); await shot(p, 'h1-dark');
for (const pg of [p, q]) console.log('delete:', await pg.evaluate(async () => (await fetch('../api/me/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'password123' }) })).status));
step('terms'); await p.goto(base + '#/terms'); await p.waitForSelector('.legal h3'); console.log('terms ok:', (await p.textContent('.legal h1')) === 'Terms of Use');
console.log(errs.length ? 'ERRORS: ' + JSON.stringify(errs) : 'ERRORS: none');
await b.close();
