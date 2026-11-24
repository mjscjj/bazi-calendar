// 离线缓存：页面和脚本先走网络（保证总是最新版本），断网时用缓存；今天页和用户信息断网时显示上一次的结果。
const CACHE = 'lrl-v3';
const SHELL = ['./', 'index.html', 'app.css', 'icon.svg', 'manifest.webmanifest', 'vendor/qrcode.js',
  'js/main.js', 'js/core.js', 'js/state.js', 'js/data.js', 'js/day.js', 'js/today.js', 'js/calendar.js', 'js/me.js',
  'js/onboard.js', 'js/account.js', 'js/pay.js', 'js/share.js'];
const OFFLINE_API = /\/api\/(today|demo\/today|me)(\?|$)/;

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isApi = url.pathname.includes('/api/');
  if (isApi && !OFFLINE_API.test(url.pathname + url.search)) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(isApi ? url.pathname : req, copy)); }
    return res;
  }).catch(() => caches.match(isApi ? url.pathname : req).then((hit) => {
    if (!hit) return caches.match('index.html');
    if (!isApi) return hit;
    const h = new Headers(hit.headers); h.set('X-From-Cache', '1');
    return hit.blob().then((b) => new Response(b, { status: 200, headers: h }));
  })));
});
