// 每日备份：把 SQLite 一致地拷一份到备份目录，保留最近 14 份。
// 用法：node scripts/backup.mjs <dbPath> <backupDir>
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const [dbPath, dir] = process.argv.slice(2);
if (!dbPath || !dir) { console.error('用法：node scripts/backup.mjs <dbPath> <backupDir>'); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16).replace(/\D/g, '');
const out = path.join(dir, `app-${stamp}.db`);
const db = new DatabaseSync(dbPath);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
const check = new DatabaseSync(out, { readOnly: true });
const n = check.prepare('SELECT COUNT(*) n FROM users').get().n;
check.close();
const old = fs.readdirSync(dir).filter((f) => /^app-\d+\.db$/.test(f)).sort().reverse().slice(14);
for (const f of old) fs.rmSync(path.join(dir, f));
console.log(`[backup] ${out} users=${n} removed=${old.length}`);
