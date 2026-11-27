// 界面语言：中文（默认）和英文。
// 文案照常写中文，用 t('中文') 包起来；英文在 i18n/en/*.json 里按「中文原文 → 英文」对照，查不到就显示中文。
// 带变量的写成 t('还剩 {n} 次', { n })，对照表里的英文也用同样的 {n}。
// 语言按这个顺序定：链接里的 ?lang= → 用户选过的（本机）→ 系统语言。
// 英文还没做完：先不看系统语言，只有 ?lang=en 或选过英文才用英文。
const KEY = 'lrl:lang';
const AUTO = false; // 英文做完后打开：没选过的人按系统语言
function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'zh') { localStorage.setItem(KEY, q); return q; }
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch { /* 无痕模式 */ }
  if (!AUTO) return 'zh';
  const first = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return /^zh\b/i.test(first) ? 'zh' : 'en';
}
export const LANG = detect();
export const EN = LANG === 'en';
document.documentElement.lang = EN ? 'en' : 'zh-CN';

// 对照表按模块分文件，英文时一起取回来（顶层 await：其他模块等它取完再执行，模块里的常量也能翻）
const FILES = ['common', 'onboard', 'today', 'calendar', 'luck', 'rite', 'ask', 'me', 'account', 'share', 'data'];
let DICT = {};
if (EN) {
  const parts = await Promise.all(FILES.map((f) => fetch(`i18n/en/${f}.json`).then((r) => (r.ok ? r.json() : {}), () => ({}))));
  DICT = Object.assign({}, ...parts);
}
// 开发时看还有哪些没翻：控制台里看 window.__i18nMissing
const missing = new Set();
if (EN) window.__i18nMissing = missing;

export function t(zh, vars) {
  let s = zh;
  if (EN) { if (DICT[zh] != null) s = DICT[zh]; else missing.add(zh); }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
}
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
