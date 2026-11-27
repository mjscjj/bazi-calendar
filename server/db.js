// SQLite 存储（Node 自带 node:sqlite）。一个文件，启动时建表。
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  birth_date TEXT,
  birth_time TEXT,
  gender TEXT,
  xi_override TEXT,
  pro_mode INTEGER NOT NULL DEFAULT 0,
  member_until TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'user',
  user_id INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
-- 每天打开记一行（收画用，和会员、免费次数无关）
CREATE TABLE IF NOT EXISTS open_days (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
-- 朋友：已经注册的人点开对方的链接互相配（a < b，邀请关系在 invites 里）
CREATE TABLE IF NOT EXISTS friend_links (
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS usage_days (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_user ON plans(user_id);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  out_trade_no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  days INTEGER NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  qr_code TEXT,
  trade_no TEXT,
  buyer TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  closed_at TEXT,
  refunded_at TEXT,
  last_query_at TEXT,
  notify_raw TEXT
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  reply TEXT NOT NULL DEFAULT '',
  replied_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  user_seen INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS draws (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  lot_no INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  anon_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  props TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_name_time ON events(name, created_at);
CREATE TABLE IF NOT EXISTS ratings (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  score INTEGER NOT NULL,
  sys_score INTEGER NOT NULL,
  sys_level INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
  request_key TEXT NOT NULL,
  UNIQUE(user_id, request_key)
);
CREATE INDEX IF NOT EXISTS todos_user_day ON todos(user_id, day);
CREATE TABLE IF NOT EXISTS moods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  mood TEXT NOT NULL,
  color TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS moods_user_day ON moods(user_id, day);
CREATE TABLE IF NOT EXISTS deeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  amulet_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deeds_user ON deeds(user_id, amulet_id);
CREATE TABLE IF NOT EXISTS practices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS practices_user ON practices(user_id, created_at);
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_id INTEGER NOT NULL,
  invitee_id INTEGER NOT NULL UNIQUE,
  anon_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  done_at TEXT,
  inviter_seen INTEGER NOT NULL DEFAULT 1,
  invitee_seen INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS invites_inviter ON invites(inviter_id);
CREATE TABLE IF NOT EXISTS asks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  qkey TEXT NOT NULL,
  category TEXT NOT NULL,
  gua TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  reading TEXT,
  model TEXT,
  ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  charge TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  tried_at TEXT,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS asks_user ON asks(user_id, created_at);
CREATE TABLE IF NOT EXISTS ask_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ask_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reading TEXT,
  model TEXT,
  ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  tried_at TEXT,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS ask_follows_ask ON ask_follows(ask_id);
CREATE TABLE IF NOT EXISTS amulets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  wish TEXT NOT NULL,
  way TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  style TEXT NOT NULL,
  look TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS amulets_user ON amulets(user_id, month);
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`;

// 老库补字段：表已存在时 CREATE TABLE 不会加新列，这里逐个补上
const COLUMNS = [
  ['users', 'lang', "TEXT NOT NULL DEFAULT 'zh'"], // 界面语言（zh / en），日历订阅这类不带请求头的地方按它出
  ['users', 'welcome_gift', 'TEXT'], // 新用户做完「第一天的三件事」送的那枚御守，记领取时间，只送一次
  ['users', 'birth_cal', "TEXT NOT NULL DEFAULT 'solar'"],
  ['users', 'birth_city', 'TEXT'],
  ['users', 'birth_lng', 'REAL'],
  ['users', 'birth_tz', 'TEXT'],
  ['users', 'birth_zhi', 'TEXT'],
  ['users', 'invite_code', 'TEXT'],
  ['users', 'cal_token', 'TEXT'],
  ['users', 'cal_fetched_at', 'TEXT'],
  ['plans', 'hour', 'INTEGER'],
  ['users', 'ask_credits', 'INTEGER NOT NULL DEFAULT 0'],
  ['ratings', 'note', "TEXT NOT NULL DEFAULT ''"],
  ['draws', 'question', "TEXT NOT NULL DEFAULT ''"],
  ['draws', 'status', "TEXT NOT NULL DEFAULT 'done'"],
  ['draws', 'tosses', "TEXT NOT NULL DEFAULT '[]'"],
  ['draws', 'rounds', 'INTEGER NOT NULL DEFAULT 1'],
  ['users', 'amulet_credits', 'INTEGER NOT NULL DEFAULT 0'],
  ['orders', 'product', "TEXT NOT NULL DEFAULT 'member'"],
  ['orders', 'qty', 'INTEGER NOT NULL DEFAULT 1'],
  ['plans', 'reason', "TEXT NOT NULL DEFAULT ''"],
  ['asks', 'outcome', 'TEXT'],
  ['asks', 'outcome_note', "TEXT NOT NULL DEFAULT ''"],
  ['asks', 'reviewed_at', 'TEXT'],
  ['ratings', 'src', "TEXT NOT NULL DEFAULT 'score'"],
  ['users', 'jiazi_done', 'TEXT'],
  ['amulets', 'drop_key', 'TEXT'],
  ['deeds', 'record_key', 'TEXT'],
  ['practices', 'record_key', 'TEXT'],
  ['orders', 'provider', "TEXT NOT NULL DEFAULT 'alipay'"],
  ['orders', 'currency', "TEXT NOT NULL DEFAULT 'CNY'"],
  ['orders', 'sub_id', 'TEXT'],
];

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  for (const [table, col, def] of COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_invite ON users(invite_code); CREATE UNIQUE INDEX IF NOT EXISTS users_cal ON users(cal_token);');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS amulets_drop_key ON amulets(user_id, drop_key) WHERE drop_key IS NOT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS deeds_record_key ON deeds(user_id, record_key)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS practices_record_key ON practices(user_id, record_key)');
  // 收画改成按「每天打开」算：以前的打开记录（usage_days）补进来，重复执行不会重复
  db.exec('INSERT OR IGNORE INTO open_days(user_id, day, created_at) SELECT user_id, day, created_at FROM usage_days;');
  return wrap(db);
}

function wrap(db) {
  const cache = new Map();
  const st = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const plain = (row) => (row ? { ...row } : row);
  return {
    raw: db,
    get: (sql, ...a) => plain(st(sql).get(...a)),
    all: (sql, ...a) => st(sql).all(...a).map(plain),
    run: (sql, ...a) => st(sql).run(...a),
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close(),
  };
}
