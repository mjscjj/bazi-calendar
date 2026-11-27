// 界面语言：中文（默认）和英文。
// 文案照常写中文，用 t('中文') 包起来；英文在 i18n/en/*.json 里按「中文原文 → 英文」对照，查不到就显示中文。
// 带变量的写成 t('还剩 {n} 次', { n })，对照表里的英文也用同样的 {n}。
// 语言按这个顺序定：链接里的 ?lang= → 用户选过的（本机）→ 系统语言。
const KEY = 'lrl:lang';
const AUTO = true; // 没选过的人按系统语言
// 服务端（Node）也会引用 data.js → 这里：没有浏览器对象时一律按中文，服务端自己按请求语言出文案
const BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';
function detect() {
  if (!BROWSER) return 'zh';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'zh') { localStorage.setItem(KEY, q); return q; }
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch { /* 无痕模式 */ }
  if (!AUTO) return 'zh';
  // 系统语言列表里只要有中文就用中文：不少中文用户的手机系统是英文的，但浏览器语言里会带上中文
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
  return langs.some((l) => /^zh\b/i.test(l)) ? 'zh' : 'en';
}
export const LANG = detect();
export const EN = LANG === 'en';
if (BROWSER) document.documentElement.lang = EN ? 'en' : 'zh-CN';

// 对照表按模块分文件，英文时一起取回来（顶层 await：其他模块等它取完再执行，模块里的常量也能翻）
const FILES = ['common', 'onboard', 'today', 'calendar', 'luck', 'rite', 'ask', 'me', 'account', 'share', 'data'];
// 同一个中文在不同地方可能要译得不一样（日历格子里要短，句子里要能接上），所以每个模块先查自己那份，查不到再查合并的
let DICT = {};
const PER = {};
if (EN) {
  const parts = await Promise.all(FILES.map((f) => fetch(`i18n/en/${f}.json`).then((r) => (r.ok ? r.json() : {}), () => ({}))));
  FILES.forEach((f, i) => { PER[f] = parts[i]; });
  DICT = Object.assign({}, ...parts);
}
// 开发时看还有哪些没翻：控制台里看 window.__i18nMissing
const missing = new Set();
if (EN && BROWSER) window.__i18nMissing = missing;

function lookup(own, zh, vars) {
  let s = zh;
  if (EN) { const v = own && own[zh] != null ? own[zh] : DICT[zh]; if (v != null) s = v; else missing.add(zh); }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
}
export const t = (zh, vars) => lookup(null, zh, vars);
// 模块自己的 t：const t = tm('today')，先查 i18n/en/today.json
export const tm = (file) => (zh, vars) => lookup(PER[file], zh, vars);
// 换语言：记下来，重新加载（文案在模块加载时就定了）
export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* 无痕模式 */ }
  const u = new URL(location.href);
  if (!u.searchParams.has('lang')) { location.reload(); return; }
  u.searchParams.delete('lang');
  location.replace(u.toString());
}
// 账号上的语言：这台设备选过就以它为准并存到账号上（日历订阅等按它出）；没选过而账号是另一种语言，换过去
export function syncAccountLang(user, save) {
  if (!user) return false;
  let chosen = null;
  try { chosen = localStorage.getItem(KEY); } catch { /* 无痕模式 */ }
  if (chosen) { if (user.lang !== chosen) save(chosen); return false; }
  if (user.lang && user.lang !== LANG) { setLang(user.lang); return true; }
  return false;
}
