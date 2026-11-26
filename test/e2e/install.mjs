// 加到主屏和订阅日历在各种打开环境里的说明：node test/e2e/install.mjs <baseUrl，如 http://127.0.0.1:3210/bazi> <截图目录>
// 微信等 App 里和加不了的浏览器要直说加不了并给「复制链接」；iPhone 只有 Safari 放一键订阅；安卓不放一键订阅。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const [arg, out] = process.argv.slice(2), base = arg.replace(/\/?$/, '/');
// 每种环境应得：[加到主屏的方式, 订阅页有没有一键订阅按钮]
const WANT = { 'wx-ios': ['no', false], 'wx-android': ['no', false], 'app-ios': ['no', false], 'app-android': ['no', false], 'ios-safari': ['ios-safari', true], 'ios-chrome': ['ios-share', false],
  'ios-qq': ['no', false], huawei: ['android', false], 'mac-safari': ['mac-safari', true], firefox: ['no', true],
  'ios164-chrome': ['ios-share', false], 'ios163-chrome': ['no', false], 'ios-google': ['no', false], 'mac-safari16': ['no', true] };
const fail = [];
const UAS = {
  'wx-ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800322d) NetType/WIFI Language/zh_CN',
  'wx-android': 'Mozilla/5.0 (Linux; Android 13; V2244A Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20240404 MMWEBID/1234 MicroMessenger/8.0.49.2600(0x2800313D) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64',
  'app-ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SomeApp/7.30.0',
  'app-android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 SomeApp/2.1',
  'ios-safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'ios-chrome': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  'ios-qq': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 MQQBrowser/14.9.5 Mobile/15E148 Safari/604.1 QBWebViewUA/2 QBWebViewType/1 WKType/1',
  'huawei': 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-AN00; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36',
  'mac-safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'firefox': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'ios164-chrome': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/112.0.5615.46 Mobile/15E148 Safari/604.1',
  'ios163-chrome': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.5481.83 Mobile/15E148 Safari/604.1',
  'ios-google': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/320.0.648975147 Mobile/15E148 Safari/604.1',
  'mac-safari16': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
};
const b = await chromium.launch({ executablePath: process.env.CHROME });
const errs = [];
// 一个账号，各环境共用登录 cookie
const c0 = await b.newContext(); const p0 = await c0.newPage(); await p0.goto(base);
const r = await p0.evaluate(async () => (await fetch('api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'a2hs' + Date.now(), password: 'mobile123', agree: true, birth: { date: '1990-10-19', time: '10:00', gender: '女' }, nickname: '小测' }) })).status);
console.log('register', r);
const cookies = await c0.cookies();
for (const [k, ua] of Object.entries(UAS)) {
  const desk = k.startsWith('mac-safari') || k === 'firefox';
  const c = await b.newContext({ userAgent: ua, viewport: desk ? { width: 1200, height: 900 } : { width: 390, height: 844 }, isMobile: !desk, hasTouch: !desk, deviceScaleFactor: desk ? 1 : 2 });
  await c.addCookies(cookies);
  await c.addInitScript(() => { localStorage.setItem('lrl:guide', '1'); });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(k + ': ' + e.message));
  await p.goto(base + '#/me'); await p.waitForSelector('[data-install]', { timeout: 15000 });
  const env = await p.evaluate(async () => { const m = await import('./js/core.js'); return [m.ENV_NAME, m.installKind()]; });
  await p.click('[data-install]'); await p.waitForSelector('#sheet .guide'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${k}-a2hs.png` });
  const sheetText = await p.$eval('#sheet .guide', (e) => e.innerText.replace(/\n+/g, ' | '));
  await p.goto(base + '#/ics'); await p.reload(); await p.waitForSelector('[data-ics-copy]', { timeout: 15000 }); await p.waitForTimeout(300);
  const det = await p.$('details.icsmore'); if (det) await det.evaluate((d) => { d.open = true; });
  await p.screenshot({ path: `${out}/${k}-ics.png`, fullPage: true });
  const btns = await p.$$eval('#view .btn', (xs) => xs.map((x) => x.innerText).join(' / '));
  console.log(`== ${k} env=${env.join(',')}\n  a2hs: ${sheetText}\n  ics: ${btns}`);
  const [kind, sub] = WANT[k];
  if (env[1] !== kind) fail.push(`${k}: 加到主屏方式是 ${env[1]}，应为 ${kind}`);
  if (kind === 'no' && !sheetText.includes('复制链接')) fail.push(`${k}: 加不了的环境没给「复制链接」`);
  if (!!(await p.$('[data-ics-sub]')) !== sub) fail.push(`${k}: 一键订阅按钮应${sub ? '有' : '没有'}`);
  await c.close();
}
await b.close();
if (errs.length || fail.length) { console.log('ERRORS\n' + [...errs, ...fail].join('\n')); process.exit(1); }
console.log('✓ 各环境的加到主屏和订阅日历说明都对');
