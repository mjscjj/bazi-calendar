// 第二批功能走查：node test/e2e/batch2.mjs <baseUrl> <dbPath> <outDir> <adminPassword>
// 出生城市和真太阳时、时辰交界、农历切换 → 邀请落地和注册 → 第二天生效 → 每晚自评 → 订阅到手机日历 → 邀请页
// → 分享图白色/深色 → 电脑端挑日子横排 → 后台看板 → 注销账号。服务端以 ALIPAY_FAKE=1 启动。
import { DatabaseSync } from 'node:sqlite';
import { wheel, wheelOn, touchWheel, skipRite } from './helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [base, dbPath, out, adminPw] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [], results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push(name); };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/402|Payment Required|404|401/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
};
const suffix = Date.now().toString(36).slice(-5);
const pad = (n) => String(n).padStart(2, '0');
const now = new Date(), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// ---------- 邀请人 ----------
const actx = await browser.newContext(iphone);
const ap = await actx.newPage(); watch(ap, 'inviter');
await ap.goto(base + '/');
await ap.evaluate(async (u) => {
  await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'invite1234', agree: true, nickname: '阿杰', birth: { date: '1992-06-08', time: '08:30', gender: '男' } }) });
  localStorage.setItem('lrl:guide', '1'); localStorage.setItem('lrl:a2hs-done', '1');
}, 'inv' + suffix);
await ap.reload(); await ap.waitForSelector('.tcard');
check('老用户没填城市时提示补上', await ap.isVisible('[data-notice="city-tip"]'));
await ap.goto(base + '/#/invite'); await ap.waitForSelector('.invhero');
const code = (await ap.textContent('.linkbox span')).match(/i=([A-Z0-9]{5})/)[1];
check('邀请页有链接和统计', !!code && await ap.isVisible('.stats3'), code);
await ap.screenshot({ path: `${out}/b01-invite-page.png` });
await ap.click('[data-inv-poster]'); await ap.waitForSelector('.sharepv img');
await ap.screenshot({ path: `${out}/b02-invite-poster.png` });
await ap.click('[data-share-theme="dark"]'); await ap.waitForTimeout(300);
check('分享图可以切到深色', await ap.isVisible('[data-share-theme="dark"][aria-pressed="true"]'));
await ap.screenshot({ path: `${out}/b03-invite-poster-dark.png` });
await ap.click('#sheet [data-close-sheet]'); await ap.waitForSelector('#sheet', { state: 'detached' });

// ---------- 朋友：打开邀请链接 → 测能量卡（城市、交界、农历）→ 注册 ----------
const bctx = await browser.newContext(iphone);
const bp = await bctx.newPage(); watch(bp, 'invitee');
await bp.goto(`${base}/?i=${code}`);
await bp.waitForSelector('.invban');
check('落地页先看到邀请人', (await bp.textContent('.invban b')).includes('阿杰'));
check('地址栏去掉了邀请参数', !bp.url().includes('i='), bp.url());
await bp.screenshot({ path: `${out}/b04-invite-landing.png` });
await bp.click('.invban + a[href="#/start"]');
await bp.waitForSelector('#bForm');
await bp.fill('input[name=nickname]', '小满');
check('出生日期还没选时显示提示', (await bp.textContent('[data-date-text]')).includes('选择年、月、日'));
await bp.click('[data-pick-date]'); await bp.waitForSelector('#sheet .wcol'); await bp.waitForTimeout(400);
await touchWheel(bp, 0, 120);
check('手指往下拖年份滚轮：往回滚，弹层不被拖走', !!(await bp.$('#sheet .wcol')) && parseInt(await wheelOn(bp, 0)) < 1995, await bp.$('#sheet .wcol') && await wheelOn(bp, 0));
await touchWheel(bp, 1, -80);
check('手指往上拖月份滚轮：往后滚', !!(await bp.$('#sheet .wcol')) && parseInt(await wheelOn(bp, 1)) > 1, await bp.$('#sheet .wcol') && await wheelOn(bp, 1));
await wheel(bp, 0, 1992 - 1901); await wheel(bp, 1, 5); await wheel(bp, 2, 7);
await bp.waitForFunction(() => document.querySelector('#sheet [data-wlive]').textContent.includes('农历'));
check('滚轮实时显示日期和对应农历', (await bp.textContent('#sheet [data-wlive]')).includes('1992年6月8日 · 农历五月初八'), await bp.textContent('#sheet [data-wlive]'));
await bp.screenshot({ path: `${out}/b05a-date-wheel.png` });
await bp.click('#sheet [data-wok]'); await bp.waitForSelector('#sheet', { state: 'detached' });
check('选好的日期一次写回年月日', (await bp.$eval('input[name=date]', (e) => e.value)) === '1992-06-08' && (await bp.textContent('[data-date-text]')) === '1992年6月8日');
await bp.click('[data-pick-time]'); await bp.waitForSelector('#sheet .wcol');
// 滚轮还没停稳就点「确定」：按滚轮此刻的位置取值
await bp.evaluate(() => { const c = document.querySelectorAll('#sheet .wcol')[0]; c.scrollTop = 7 * 40; c.dispatchEvent(new Event('scroll')); });
await bp.click('#sheet [data-wok]'); await bp.waitForSelector('#sheet', { state: 'detached' });
check('滚轮没停稳就点确定，取的是滚轮停的位置', (await bp.$eval('input[name=time]', (e) => e.value)).startsWith('07:'), await bp.$eval('input[name=time]', (e) => e.value));
await bp.click('[data-pick-time]'); await bp.waitForSelector('#sheet .wcol');
await wheel(bp, 0, 9); await wheel(bp, 1, 20);
check('时间滚轮显示时辰', (await bp.textContent('#sheet [data-wlive]')).includes('09:20 · 巳时'), await bp.textContent('#sheet [data-wlive]'));
await bp.screenshot({ path: `${out}/b05b-time-wheel.png` });
await bp.click('#sheet [data-wok]'); await bp.waitForSelector('#sheet', { state: 'detached' });
check('选好的时间写回表单', (await bp.$eval('input[name=time]', (e) => e.value)) === '09:20');
await bp.fill('input[name=city]', '广');
await bp.waitForSelector('[data-city-pick="广州"]');
await bp.screenshot({ path: `${out}/b05-city-suggest.png` });
await bp.click('[data-city-pick="广州"]');
await bp.waitForSelector('[data-solar]:not([hidden])');
check('换算出真太阳时', (await bp.textContent('[data-solar] b')).includes('08:54'), await bp.textContent('[data-solar] b'));
await bp.waitForSelector('[data-edge]:not([hidden])');
check('时辰交界时让用户选', (await bp.textContent('[data-edge]')).includes('辰时'));
await bp.click('[data-zhi="巳"]');
await bp.click('[data-g="女"]');
await bp.screenshot({ path: `${out}/b06-birth-solar.png`, fullPage: true });
await bp.click('[data-pick-date]'); await bp.waitForSelector('#sheet .wcol'); await bp.waitForTimeout(500);
await bp.click('#sheet [data-wcal="lunar"]'); await bp.waitForTimeout(500);
check('滚轮切农历时带过去五月初八', (await wheelOn(bp, 1)) === '五月' && (await wheelOn(bp, 2)) === '初八', `${await wheelOn(bp, 1)} ${await wheelOn(bp, 2)}`);
await bp.screenshot({ path: `${out}/b06a-lunar-wheel.png` });
await bp.click('#sheet [data-wok]'); await bp.waitForSelector('#sheet', { state: 'detached' }); await bp.waitForTimeout(600);
check('农历写回表单', (await bp.$eval('input[name=lm]', (e) => e.value)) === '5' && (await bp.$eval('input[name=ld]', (e) => e.value)) === '8' && (await bp.textContent('[data-date-text]')).includes('五月初八'));
check('农历下显示对应公历', (await bp.textContent('[data-conv]')).includes('1992年6月8日'), await bp.textContent('[data-conv]'));
await bp.screenshot({ path: `${out}/b07-birth-lunar.png`, fullPage: true });
await bp.click('#bForm button[type=submit]');
await bp.waitForSelector('.ecard.step');
check('能量卡分三张翻开', (await bp.textContent('.ecard.step small')).includes('1 / 3'));
for (let k = 0; k < 3; k++) await bp.click('.stepnav [data-card-next]');
await bp.waitForSelector('.ecard .basis');
check('能量卡写明按真太阳时、巳时排盘', (await bp.textContent('.ecard .basis')).includes('08:54 · 巳时'), await bp.textContent('.ecard .basis'));
await bp.screenshot({ path: `${out}/b08-card-basis.png`, fullPage: true });
await bp.waitForSelector('#pairBox .pairc .pa');
check('被邀请的朋友测完就看到「你和阿杰的画」', (await bp.textContent('#pairBox .pairc small')).includes('阿杰') && !!(await bp.textContent('#pairBox .pbest')), await bp.textContent('#pairBox .pn'));
await bp.locator('#pairBox').scrollIntoViewIfNeeded();
await bp.screenshot({ path: `${out}/b08b-pair-invitee.png` });
await bp.click('a[href="#/register"]');
await bp.waitForSelector('.invnote');
await bp.fill('input[name=username]', 'fr' + suffix);
await bp.fill('input[name=password]', 'friend1234');
await bp.fill('input[name=password2]', 'friend1234');
await bp.check('input[name=agree]');
await bp.screenshot({ path: `${out}/b09-register-invite.png` });
await bp.click('#authForm button[type=submit]');
await bp.waitForSelector('.tcard');
const fid = db.prepare('SELECT id FROM users WHERE username = ?').get('fr' + suffix).id;
const inv = db.prepare('SELECT status FROM invites WHERE invitee_id = ?').get(fid);
check('注册时记下邀请', inv && inv.status === 'pending', inv && inv.status);
check('城市和时辰选择保存了', db.prepare('SELECT birth_city c, birth_zhi z FROM users WHERE id = ?').get(fid).c === '广州');

// 第二天再打开：邀请生效
db.prepare("UPDATE usage_days SET day = '2000-01-01' WHERE user_id = ?").run(fid);
await bp.evaluate(() => localStorage.setItem('lrl:guide', '1'));
await bp.reload(); await bp.waitForSelector('.tcard');
check('第二天打开后被邀请人看到奖励', (await bp.textContent('.notice.good')).includes('各得 7 天'));
await bp.screenshot({ path: `${out}/b10-invite-reward.png` });
await ap.goto(base + '/#/'); await ap.reload(); await ap.waitForSelector('.tcard');
check('邀请人也看到', ((await ap.textContent('.notice.good').catch(() => '')) || '').includes('小满加入了'));
await ap.goto(base + '/#/invite'); await ap.waitForSelector('.ilist');
check('朋友的画里有刚邀请的朋友', (await ap.textContent('.frlist')).includes('小满') && (await ap.textContent('.frlist')).includes('你邀请的'));
await ap.click('.frlist [data-friend]'); await ap.waitForSelector('#sheet .pairc');
check('点朋友，看到你们俩的画', !!(await ap.textContent('#sheet .pairc .ptag')));
await ap.waitForTimeout(500); await ap.screenshot({ path: `${out}/b11b-pair-inviter.png` });
await ap.click('#sheet [data-close-sheet]'); await ap.waitForSelector('#sheet', { state: 'detached' });
// 已经注册的人打开朋友的链接：两人连上，弹出你们俩的画
{
  const lctx = await browser.newContext(iphone); const lp = await lctx.newPage(); watch(lp, 'linker');
  await lp.goto(base + '/'); await lp.waitForSelector('#dayswipe');
  await lp.evaluate(async (u) => fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'link12345', agree: true, birth: { date: '1985-03-02', time: '14:00', gender: '女' }, nickname: '老周' }) }), 'lk' + suffix);
  await lp.evaluate(() => localStorage.setItem('lrl:guide', '1'));
  await lp.goto(`${base}/?i=${code}#/`); await lp.waitForSelector('#sheet .pairc', { timeout: 8000 });
  check('已注册的人打开朋友链接，弹出你们俩的画', (await lp.textContent('#sheet .pairc small')).includes('阿杰'));
  await lp.screenshot({ path: `${out}/b11c-pair-link.png` });
  await lp.click('#sheet [data-close-sheet]'); await lp.waitForSelector('#sheet', { state: 'detached' });
  await lp.goto(base + '/#/invite'); await lp.waitForSelector('.frlist');
  check('点链接连上的朋友出现在自己的朋友的画里', (await lp.textContent('.frlist')).includes('点链接连上的'));
  await ap.goto(base + '/#/me'); await ap.goto(base + '/#/invite'); await ap.waitForSelector('.frlist');
  check('对方那边也多了这位朋友', (await ap.textContent('.frlist')).includes('老周'));
  await lctx.close();
  // 在朋友链接的落地页登录（比如微信里没登录）：登录后也连上，弹出你们俩的画
  const gctx = await browser.newContext(iphone); const gp = await gctx.newPage(); watch(gp, 'login-link');
  await gp.goto(`${base}/?i=${code}`); await gp.waitForSelector('.invban');
  await gp.evaluate(() => localStorage.setItem('lrl:guide', '1'));
  await gp.goto(base + '/#/login'); await gp.waitForSelector('#authForm');
  await gp.fill('input[name=username]', 'lk' + suffix); await gp.fill('input[name=password]', 'link12345');
  await gp.click('#authForm button[type=submit]');
  await gp.waitForSelector('#sheet .pairc', { timeout: 8000 });
  check('在朋友链接的落地页登录，登录后也弹出你们俩的画', (await gp.textContent('#sheet .pairc small')).includes('阿杰'));
  check('登录后清掉本地的邀请信息', !(await gp.evaluate(() => localStorage.getItem('lrl:invite'))));
  await gctx.close();
  // 没登录时打开要登录的页面：登录后回到那一页
  const nctx = await browser.newContext(iphone); const np = await nctx.newPage(); watch(np, 'next');
  await np.goto(base + '/#/jiazi'); await np.waitForSelector('#authForm');
  await np.fill('input[name=username]', 'lk' + suffix); await np.fill('input[name=password]', 'link12345');
  await np.click('#authForm button[type=submit]'); await np.waitForSelector('.jzgrid', { timeout: 8000 });
  check('没登录时打开「我的一甲子」，登录后回到一甲子', np.url().endsWith('#/jiazi'), np.url());
  await nctx.close();
}
check('邀请记录显示已生效', (await ap.textContent('.ilist')).includes('已生效'));
await ap.screenshot({ path: `${out}/b11-invite-done.png`, fullPage: true });

// ---------- 每晚自评（把时钟拨到晚上 8 点） ----------
const rctx = await browser.newContext(iphone);
await rctx.addInitScript(() => { const H = 20; const real = Date; const off = (() => { const d = new real(); return new real(d.getFullYear(), d.getMonth(), d.getDate(), H, 5).getTime() - d.getTime(); })(); window.Date = class extends real { constructor(...a) { super(...(a.length ? a : [real.now() + off])); } static now() { return real.now() + off; } }; });
const rp = await rctx.newPage(); watch(rp, 'rate');
await rp.goto(base + '/#/login');
await rp.fill('input[name=username]', 'fr' + suffix);
await rp.fill('input[name=password]', 'friend1234');
await rp.click('#authForm button[type=submit]');
await rp.waitForSelector('.tcard');
await rp.waitForSelector('.moodbox [data-mood-rec]');
check('问今天有什么要记录的', (await rp.textContent('.moodbox .q')).includes('今天有什么要记录的'));
await rp.screenshot({ path: `${out}/b12-mood-ask.png`, fullPage: true });
await rp.click('[data-mood-rec]'); await rp.waitForSelector('#moodForm');
await rp.click('[data-mood-pick="full"]'); await rp.click('[data-mood-color="sage"]');
await rp.fill('#moodForm textarea', '面试聊得不错');
await rp.click('#moodForm button[type=submit]');
await rp.waitForSelector('.moodbox .board .stk');
check('记下一张心情便签', (await rp.textContent('.moodbox .board')).includes('面试聊得不错'));
check('记完显示本月小结', (await rp.textContent('.moodbox .mfoot')).includes('有 1 天记了心情'));
await rp.screenshot({ path: `${out}/b13-mood-done.png`, fullPage: true });
check('心情换算成分数写进自评', db.prepare('SELECT score, src FROM ratings WHERE user_id = ?').get(fid).score === 4);
check('最下面是明天寄语', await rp.isVisible('section.tmrw'));
check('今天卡片上有「此刻」', (await rp.textContent('#nowline')).includes('此刻'));
await rp.click('[data-mood-quick="tired"]'); await rp.waitForSelector('#moodForm'); await rp.click('#moodForm button[type=submit]');
await rp.waitForFunction(() => document.querySelectorAll('.moodbox .board .stk').length === 2);
check('一天可以贴第二张', true);
await rp.reload(); await rp.waitForSelector('.tcard');
check('刷新后便签还在', (await rp.$$('.moodbox .board .stk')).length === 2);
await rp.screenshot({ path: `${out}/b13b-tomorrow.png`, fullPage: true });
await rp.goto(base + '/#/calendar'); await rp.waitForSelector('.grid .c2 .mstk');
check('月历上贴着心情小纸片', (await rp.$$('.grid .c2.today .mstk i')).length === 2);
await rp.click('.c2.today'); await rp.waitForSelector('#sheet .mymoods');
check('当日详情里有那天的便签和那句话', (await rp.textContent('#sheet .mymoods')).includes('面试聊得不错'));
await rp.screenshot({ path: `${out}/b13d-day-moods.png` });
await rp.click('#sheet [data-close-sheet]'); await rp.waitForSelector('#sheet', { state: 'detached' });
await rp.goto(base + '/#/'); await rp.waitForSelector('.tcard');
await rp.click('[data-draw]'); await skipRite(rp, '下周的签约');
await rp.goto(base + '/#/lots'); await rp.waitForSelector('.lrow');
check('签谱里有这支签和所问', (await rp.textContent('.lrow')).includes('下周的签约'));
await rp.screenshot({ path: `${out}/b13c-lots.png`, fullPage: true });

// ---------- 订阅到手机日历 ----------
await bp.goto(base + '/#/ics'); await bp.waitForSelector('.calmock .ev');
check('订阅页有 3 天预览', (await bp.$$('.calmock .ev')).length === 3);
const webcal = await bp.getAttribute('[data-ics-sub]', 'href');
check('iPhone 上是 webcal 订阅链接', /^webcal:\/\/.+\.ics$/.test(webcal), webcal);
await bp.screenshot({ path: `${out}/b14-ics.png`, fullPage: true });
const ics = await (await bp.request.get(webcal.replace(/^webcal:/, 'http:'))).text();
check('订阅文件有 60 天', (ics.match(/BEGIN:VEVENT/g) || []).length >= 60);

// ---------- 我的页 ----------
await bp.goto(base + '/#/me'); await bp.waitForSelector('.mecard');
await bp.screenshot({ path: `${out}/b15-me.png`, fullPage: true });

// ---------- 电脑端：挑日子横排、黄历开关 ----------
const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dp = await dctx.newPage(); watch(dp, 'desktop');
await dp.goto(base + '/#/login');
await dp.fill('input[name=username]', 'fr' + suffix);
await dp.fill('input[name=password]', 'friend1234');
await dp.click('#authForm button[type=submit]');
await dp.waitForSelector('.tcard');
await dp.click('.topnav a[href="#/calendar"]'); await dp.waitForSelector('.grid .c2');
await dp.click('[data-cal-yi]'); await dp.waitForSelector('.grid.withyi');
await dp.screenshot({ path: `${out}/b16-desk-calendar-yi.png` });
await dp.click('[data-pick-open]'); await dp.waitForSelector('#pickForm');
await dp.click('[data-ptype="面试"]');
await dp.screenshot({ path: `${out}/b17-desk-pick-form.png` });
await dp.click('#pickForm button[type=submit]'); await dp.waitForSelector('#sheet .pc');
const cols = await dp.$eval('.pick3', (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
check('电脑上三张推荐横排', cols === 3, cols + ' 列');
await dp.screenshot({ path: `${out}/b18-desk-pick-result.png` });
await dp.locator('[data-pick-pin]').first().click();
await dp.waitForSelector('#sheet', { state: 'detached' });
await dp.waitForSelector('.prow');
await dp.screenshot({ path: `${out}/b19-desk-plans.png`, fullPage: true });

// ---------- 后台看板 ----------
const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(admin, 'admin');
await admin.goto(base + '/admin');
await admin.fill('input[name=username]', 'admin');
await admin.fill('input[name=password]', adminPw);
await admin.click('#lf button');
await admin.waitForSelector('.funnel');
check('后台有漏斗和留存', await admin.isVisible('.funnel') && (await admin.textContent('#stats')).includes('第 7 天'));
await admin.screenshot({ path: `${out}/b20-admin-stats.png`, fullPage: true });

// ---------- 注销账号 ----------
await bp.goto(base + '/#/profile'); await bp.waitForSelector('[data-delete-open]');
await bp.screenshot({ path: `${out}/b21-profile.png`, fullPage: true });
await bp.click('[data-delete-open]'); await bp.waitForSelector('#delForm');
check('注销前提示会员作废', (await bp.textContent('#delForm')).includes('会员会一起作废'));
await bp.screenshot({ path: `${out}/b22-delete.png` });
await bp.fill('#delForm input[name=password]', 'friend1234');
await bp.click('#delForm button[type=submit]');
await bp.waitForSelector('.notice.demo, .invban');
check('注销后回到示例页', !db.prepare('SELECT 1 FROM users WHERE id = ?').get(fid));

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
