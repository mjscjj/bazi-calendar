// 美国版 Flow Day 走查：node test/e2e/us.mjs <美国版页面地址，如 http://127.0.0.1:3210/sixty/us/> <截图目录> [数据库路径] [wide]
// 服务端要开 US_EDITION=1 DAY_TZ=America/Chicago MEMBER_FOR_ALL=1 GENDER_OPTIONAL=1。给了数据库路径时，会把测试账号改成三天前注册，验证第二天打开有「撕掉昨天」。
// （每日一签要 JIAO_FAKE=xiao,sheng，先笑杯再圣杯；第 5 个参数写 wide 用电脑尺寸）
// 访客：落地页 → 滚轮选生日 → 排盘动画 → 揭晓（今天对你、补出生时间和地点）→ Today（Why、表盘、要保存时提示注册）→ 月历（点一天、挑日子）→ 签 → 朋友 → You → 设置
// 注册后：心情 → 撕掉昨天 → 存计划 → 求签 → 锁屏 → 月度回顾 → 收藏 → 邀请 → 朋友打开链接 → 两人的画 → 朋友注册 → 你的朋友今天 → 深色 → 条款 → 注销
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, out, dbPath, wide] = process.argv.slice(2);
const AMY = `t${Date.now()}a@example.com`, ALEX = `t${Date.now()}b@example.com`;
const b = await chromium.launch({ executablePath: process.env.CHROME });
const errs = [];
const VP = wide === 'wide' ? { viewport: { width: 1280, height: 860 } } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const mk = async () => { const c = await b.newContext(VP); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text())); return p; };
const p = await mk();
const shot = (pg, n, full) => pg.screenshot({ path: `${out}/${n}.png`, fullPage: !!full });
const step = (s) => console.log('—', s);
const check = (ok, what) => { console.log(ok ? '  ✓' : '  ✗', what); if (!ok) errs.push('check failed: ' + what); };
// turn the wheels of the open date picker to a date
const wheelTo = async (pg, y, m, d) => {
  await pg.waitForSelector('.wheels'); await pg.waitForTimeout(350);
  await pg.evaluate(([y2, m2]) => { const c = document.querySelectorAll('.wcol'); c[0].scrollTop = (m2 - 1) * 40; c[2].scrollTop = (y2 - 1902) * 40; c.forEach((x) => x.dispatchEvent(new Event('scroll'))); }, [y, m]);
  await pg.waitForTimeout(250);
  await pg.evaluate((d2) => { const c = document.querySelectorAll('.wcol')[1]; c.scrollTop = (d2 - 1) * 40; c.dispatchEvent(new Event('scroll')); }, d);
  await pg.waitForTimeout(250); await pg.click('#pdOk');
};

step('landing'); await p.goto(base + '#/'); await p.waitForSelector('#birthForm'); await p.waitForTimeout(500); await shot(p, 'a1-landing');
await p.click('#bday'); await shot(p, 'a2-wheel'); await wheelTo(p, 1992, 3, 14);
step('theater'); await p.waitForSelector('.theater'); await p.waitForTimeout(1000); await shot(p, 'b1-wheel'); await p.waitForTimeout(1200); await shot(p, 'b2-sky'); await p.waitForTimeout(1300); await shot(p, 'b3-five');
step('reveal'); await p.waitForSelector('.revealpage'); await p.waitForSelector('#forYou .word'); await p.waitForTimeout(1200); await shot(p, 'c1-reveal', true);
await p.click('#addTime'); await p.waitForSelector('#ptOk'); await shot(p, 'c2-time'); await p.click('#ptOk');
await p.waitForSelector('#pcQ'); await p.fill('#pcQ', 'new y'); await p.waitForTimeout(200); await shot(p, 'c3-city'); await p.click('#pcList [data-c]');
await p.waitForFunction(() => /Born at/.test(document.querySelector('#addTime')?.textContent || '')); console.log('birth time added:', (await p.textContent('#addTime')).trim().replace(/\s+/g, ' '));
step('guest today'); await p.click('#toToday'); await p.waitForSelector('#daycard .scoreline'); await p.waitForTimeout(900); await shot(p, 'd1-today'); await shot(p, 'd1-today-full', true);
console.log('guest today: score', await p.textContent('#daycard .ring b'), '·', (await p.textContent('.meet p')).trim());
await p.click('.why-btn'); await p.waitForTimeout(300); console.log('why rows:', (await p.$$('.why .wrow')).length); await shot(p, 'd2-why', true);
await p.click('.band'); await p.waitForSelector('#dial'); await p.waitForTimeout(800);
{ const dl = await (await p.$('#dial svg')).boundingBox(); await p.mouse.move(dl.x + dl.width * 0.85, dl.y + dl.height * 0.5); await p.mouse.down(); await p.mouse.move(dl.x + dl.width * 0.5, dl.y + dl.height * 0.92, { steps: 6 }); await p.mouse.up(); }
await shot(p, 'd3-dial'); await p.click('#sheet .x');
await p.click('#week button:nth-child(6)'); await p.waitForTimeout(600); await shot(p, 'd4-otherday');
await p.click('.moodrow button, #backToday').catch(() => {}); await p.goto(base + '#/today'); await p.waitForSelector('.moodrow'); await p.click('.moodrow button');
check(!!(await p.waitForSelector('#signup', { timeout: 5000 }).catch(() => null)), 'guest mood asks for an account'); await shot(p, 'd5-gate'); await p.click('#sheet .x');
step('guest calendar'); await p.click('.tabs a[data-tab=calendar]'); await p.waitForSelector('#cal button.lv1, #cal button.lv2, #cal button.lv3, #cal button.lv4, #cal button.lv5'); await p.waitForTimeout(1000); await shot(p, 'e1-cal', true);
await p.click('#cal button[data-d$="-20"]'); await p.waitForTimeout(400); console.log('day panel:', (await p.textContent('#dayPanel .title')).trim());
await p.click('#acts [data-t="面试"]'); await p.waitForSelector('#cal .badge'); await p.waitForTimeout(1200); await shot(p, 'e2-pick', true); console.log('picks marked:', (await p.$$('#cal .badge')).length || 'in another month');
const picksOf = () => p.$$eval('#bestBox [data-go]', (xs) => xs.map((x) => x.dataset.go).join(','));
const before = await picksOf();
await p.goto(base + '#/settings'); await p.click('[data-e=date]'); await wheelTo(p, 1985, 8, 2); await p.waitForTimeout(1500);
await p.goto(base + '#/calendar?t=' + encodeURIComponent('面试')); await p.waitForSelector('#bestBox [data-go]'); await p.waitForTimeout(800);
const server = await p.evaluate(async () => { const g = JSON.parse(localStorage.getItem('sixty.guest')); const r = await (await fetch('../api/us/guest/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birth: g.birth, type: '面试', range: '1m', today: new Date().toLocaleDateString('en-CA') }) })).json(); return r.picks.map((x) => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`).join(','); });
check(await picksOf() === server && server !== before, 'best days recalculated after the birthday changed');
await p.goto(base + '#/settings'); await p.click('[data-e=date]'); await wheelTo(p, 1992, 3, 14); await p.waitForTimeout(1500);
step('guest oracle'); await p.click('.tabs a[data-tab=oracle]'); await p.waitForSelector('#hold'); await p.click('.suggest button'); await shot(p, 'o0-guest', true);
step('guest friends'); await p.click('.tabs a[data-tab=friends]'); await p.waitForSelector('.sample'); await shot(p, 'g0-guest');
step('guest you'); await p.click('.avatar'); await p.waitForSelector('.pillars'); await p.waitForTimeout(800); await shot(p, 'f0-guest', true);
await p.goto(base + '#/settings'); await p.waitForSelector('[data-e=date]'); await shot(p, 'f0-settings', true);

step('signup'); await p.goto(base + '#/today'); await p.waitForSelector('#tipSave'); await p.click('#tipSave');
await p.fill('#signup [name=email]', AMY); await p.fill('#signup [name=pw]', 'password123'); await p.check('#signup [name=agree]'); await shot(p, 'h0-signup'); await p.click('#signup button[type=submit]');
await p.waitForFunction(() => !document.querySelector('#signup')); await p.waitForSelector('#daycard .scoreline'); await p.waitForTimeout(900);
check(!(await p.$('#leaf')), 'nothing to tear on the day you sign up');
await p.click('.moodrow button[data-m=calm]'); await p.waitForSelector('.moodrow button.on'); console.log('mood logged');
if (dbPath) {
  const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(dbPath); const u = db.prepare('SELECT id FROM users WHERE username = ?').get(AMY);
  db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 3 * 864e5).toISOString(), u.id); db.prepare('DELETE FROM open_days WHERE user_id = ?').run(u.id); db.close();
  await p.evaluate(() => localStorage.removeItem('sixty.torn')); await p.reload(); await p.waitForSelector('#daycard .scoreline'); await p.waitForTimeout(700);
  check(!!(await p.$('#leaf')), "yesterday's page waits to be torn off"); await shot(p, 'h1-leaf');
  if (await p.$('#leaf')) { const bx = await (await p.$('#leaf')).boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + 20); await p.mouse.down(); for (let i = 1; i <= 6; i++) { await p.mouse.move(bx.x + bx.width / 2, bx.y + 20 + i * 18); await p.waitForTimeout(16); } await p.mouse.up(); await p.waitForTimeout(1400); check(!(await p.$('#leaf')), 'torn off'); }
}
await shot(p, 'h2-today-signed', true);
step('plan'); await p.goto(base + '#/calendar?t=' + encodeURIComponent('面试')); await p.waitForSelector('#cal .badge, #bestBox .item'); await p.waitForSelector('#savePlan'); await p.click('#savePlan'); check(!!(await p.waitForFunction(() => document.querySelector('#savePlan')?.disabled, null, { timeout: 8000 }).catch(() => null)), 'plan saved');
await p.waitForSelector('#plans .item'); await shot(p, 'e3-plans', true);
step('oracle'); await p.click('.tabs a[data-tab=oracle]'); await p.waitForSelector('#hold'); await p.fill('#q', 'Should I take the new job?'); await p.click('.topics .pill[data-k=work]'); await shot(p, 'o1-ask');
{ const h = await (await p.$('#hold')).boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.waitForTimeout(1500); await p.mouse.up(); }
await p.waitForSelector('#toss', { timeout: 15000 }); await shot(p, 'o2-lot');
await p.click('#toss'); await p.waitForTimeout(500); await shot(p, 'o3-flying');
// 本地 JIAO_FAKE=xiao,sheng 时先笑杯再圣杯；线上随机，一直掷到出结果（解签 / 换个问题 / 今天不再求）
for (let i = 0; i < 4; i++) {
  await p.waitForFunction(() => document.querySelector('.reading, #hold, .orc-note') || (document.querySelector('#toss') && !document.querySelector('.toss-area.fly')), null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  if (!(await p.$('#toss')) || (await p.$('.reading'))) break;
  await p.click('#toss');
}
await p.waitForTimeout(2600); await shot(p, 'o4-result', true);
if (await p.$('.reading')) { await p.waitForFunction(() => /—/.test(document.querySelector('#actDay')?.textContent || ''), null, { timeout: 8000 }).catch(() => {}); console.log('oracle reading:', (await p.textContent('.rd-title')).trim(), '· answer:', (await p.textContent('.answer .h3 span')).trim(), '· act:', (await p.textContent('#actDay')).trim()); }
else console.log('oracle ended in:', (await p.$('#hold')) ? 'rephrase' : 'closed for today');
step('lockscreen'); await p.goto(base + '#/lockscreen'); await p.waitForFunction(() => document.querySelector('.phone img')?.naturalWidth > 0, null, { timeout: 20000 }); await shot(p, 'f5-lockscreen', true); console.log('lock screen preview loaded');
step('recap'); await p.goto(base + '#/recap'); await p.waitForSelector('.recap h1'); await p.waitForTimeout(900); await shot(p, 'f3-recap', true);
await p.goto(base + '#/collection'); await p.waitForSelector('.wall a'); await p.waitForTimeout(800); await shot(p, 'f2-collection');
await p.goto(base + '#/me'); await p.waitForSelector('.stats'); await p.waitForTimeout(1000); await shot(p, 'f1-me', true);
step('invite'); const code = await p.evaluate(async () => (await (await fetch('../api/me/invite')).json()).code);
const q = await mk(); await q.goto(base + `#/i/${code}`); await q.waitForSelector('#pairForm'); await q.waitForTimeout(400); await shot(q, 'g1-invite');
await q.click('#pday'); await wheelTo(q, 1990, 7, 4); await q.waitForSelector('.mergebox'); await q.waitForTimeout(400); await shot(q, 'g2-merge'); await q.waitForTimeout(1600); await shot(q, 'g3-pair');
await q.click('#view a[href="#/today"]'); await q.waitForSelector('#daycard .scoreline'); console.log('friend sees their own day as a guest');
await q.goto(base + `#/pair/${code}`); await q.waitForSelector('#pairSignup'); await q.click('#pairSignup'); await q.fill('#signup [name=email]', ALEX); await q.fill('#signup [name=pw]', 'password123'); await q.check('#signup [name=agree]'); await q.click('#signup button[type=submit]');
await q.waitForFunction(() => !document.querySelector('#signup'));
await q.goto(base + '#/friends'); await q.waitForSelector('.friend'); await shot(q, 'g4-friends', true);
await q.click('.friend'); await q.waitForSelector('#fShare'); await shot(q, 'g5-friend');
await q.goto(base + '#/today'); await q.waitForSelector('.people .face'); await shot(q, 'g6-people', true); console.log('people today:', (await q.textContent('.people .small')).trim());
step('sign out'); await q.goto(base + '#/settings'); await q.click('[data-a=out]'); await q.waitForTimeout(1500);
check(await q.evaluate(async () => (await fetch('../api/me')).status === 401 || !(await (await fetch('../api/me')).json()).user), 'signed out on the server'); check(!!(await q.$('#birthForm')), 'back on the landing page');
await q.goto(base + '#/signin'); await q.fill('#signin [name=email]', ALEX); await q.fill('#signin [name=pw]', 'password123'); await q.click('#signin button[type=submit]'); await q.waitForSelector('#daycard .scoreline');
step('dark'); await p.evaluate(() => localStorage.setItem('sixty.theme', '"dark"')); await p.goto(base + '#/today'); await p.reload(); await p.waitForSelector('#daycard .scoreline'); await p.waitForTimeout(900); await shot(p, 'h3-dark');
for (const pg of [p, q]) console.log('delete:', await pg.evaluate(async () => (await fetch('../api/me/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'password123' }) })).status));
step('terms'); await p.goto(base + '#/terms'); await p.waitForSelector('.legal h3'); check((await p.textContent('.legal h1')) === 'Terms of Use', 'terms page');
console.log(errs.length ? 'ERRORS: ' + JSON.stringify(errs) : 'ERRORS: none');
await b.close();
