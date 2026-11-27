// 英文版检查：node scripts/i18n-check.mjs [文件…]
// 1. 用 t('…') / T('…') 包了、但对照表里还没有英文的文案
// 2. 代码里还没包起来的中文字符串（注释不算）
// 3. 对照表里英文用了中文没有的 {变量}
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HAN = /[一-鿿]/;
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});

export function loadDicts() {
  const dir = path.join(ROOT, 'public/i18n/en');
  const web = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (f.endsWith('.json')) Object.assign(web, readJson(path.join(dir, f)));
  return { web, server: readJson(path.join(ROOT, 'server/i18n/en.json')) };
}

// 去掉注释（够用的粗略版：// 行尾注释、/* */ 块注释；字符串里的 // 保留）
function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

// 包起来的文案：t('…') / T('…')，只认单引号或不带 ${} 的反引号
const CALL = /\b[tT]\(\s*(?:'((?:[^'\\]|\\.)*)'|`([^`$]*)`)/g;
export function keysOf(src) {
  const keys = [];
  for (const m of stripComments(src).matchAll(CALL)) keys.push((m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\n/g, '\n'));
  return keys;
}
// 还没包起来的中文：把 t('…') 去掉以后，剩下的字符串里还带中文的行
export function rawOf(src) {
  const body = stripComments(src).replace(CALL, 't(_)');
  return body.split('\n').map((l, i) => [i + 1, l.trim()]).filter(([, l]) => HAN.test(l));
}

const vars = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
// 英文可以少用变量（比如不插名字），但不能出现中文里没有的变量
const extra = (zh, en) => [...vars(en)].some((v) => !vars(zh).has(v));

export function check(files) {
  const { web, server } = loadDicts();
  const missing = [], raw = [], bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const dict = f.includes('/server/') ? server : web;
    for (const k of keysOf(src)) if (HAN.test(k) && dict[k] == null) missing.push([path.relative(ROOT, f), k]);
    for (const [n, l] of rawOf(src)) raw.push([path.relative(ROOT, f) + ':' + n, l.slice(0, 120)]);
  }
  for (const d of [web, server]) for (const [k, v] of Object.entries(d)) if (extra(k, v)) bad.push([k, v]);
  return { missing, raw, bad };
}

export const WEB_FILES = () => fs.readdirSync(path.join(ROOT, 'public/js')).filter((f) => f.endsWith('.js') && !['omamori-art.js'].includes(f)).map((f) => path.join(ROOT, 'public/js', f));

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const files = args.length ? args.map((f) => path.resolve(f)) : WEB_FILES();
  const { missing, raw, bad } = check(files);
  const uniq = [...new Set(missing.map(([, k]) => k))];
  console.log(`没翻的文案 ${uniq.length} 条`);
  for (const [f, k] of missing.slice(0, 400)) console.log(`  ${f}  ${k}`);
  console.log(`\n没包起来的中文 ${raw.length} 行`);
  for (const [w, l] of raw.slice(0, 400)) console.log(`  ${w}  ${l}`);
  if (bad.length) { console.log(`\n变量对不上 ${bad.length} 条`); for (const [k, v] of bad) console.log(`  ${k}  →  ${v}`); }
}
