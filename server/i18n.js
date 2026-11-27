// 语言：每个请求带 X-Lang（en / zh），用 AsyncLocalStorage 记在这次请求上，内容库和提示文案按它取。
// 服务端自己写的提示（报错、消息）照常写中文，用 T('中文') 包起来；英文在 server/i18n/en.json 里按「中文原文 → 英文」对照，查不到就用中文。
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
const FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'i18n/en.json');
const DICT = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};

export const normLang = (l) => (l === 'en' ? 'en' : 'zh');
export const langOf = (req, url) => normLang(String(req.headers['x-lang'] || url?.searchParams.get('lang') || ''));
export const withLang = (lang, fn) => als.run(normLang(lang), fn);
export const curLang = () => als.getStore() || 'zh';
export const isEn = () => curLang() === 'en';

export function T(zh, vars) {
  let s = isEn() && DICT[zh] != null ? DICT[zh] : zh;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
}

// 英文内容：content/en/ 里放同名文件，只写要翻的字段，按结构叠在中文上（数组整个替换）；没翻的地方仍是中文
export function overlay(base, top) {
  if (top === undefined) return base;
  if (Array.isArray(top) || typeof top !== 'object' || top === null || typeof base !== 'object' || base === null || Array.isArray(base)) return top;
  const out = { ...base };
  for (const k of Object.keys(top)) out[k] = overlay(base[k], top[k]);
  return out;
}
