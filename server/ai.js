// 问事的白话解读：调用 150 上的 Codex（可换成别的模型接口，只要实现 write(prompt, kind)：
// kind = 'reading' → { headline, body, advice }；kind = 'follow'（追问）→ { answer, advice }）。
// Codex 关掉所有工具（不能跑命令、不能读文件、不能联网），在空目录里只读运行，不继承服务的环境变量，
// 所以模型手里只有提示词本身。同时最多跑 ASK_CONCURRENCY 个，其余排队。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isEn } from './i18n.js';

const SCHEMAS = {
  reading: {
    type: 'object', additionalProperties: false, required: ['headline', 'body', 'advice'],
    properties: { headline: { type: 'string' }, body: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 }, advice: { type: 'string' } },
  },
  follow: {
    type: 'object', additionalProperties: false, required: ['answer', 'advice'],
    properties: { answer: { type: 'string' }, advice: { type: 'string' } },
  },
};
const DISABLE = ['shell_tool', 'unified_exec', 'shell_snapshot', 'apps', 'plugins', 'remote_plugin', 'browser_use', 'browser_use_external', 'computer_use',
  'in_app_browser', 'image_generation', 'view_image', 'sleep_tool', 'tool_suggest', 'skill_search', 'memories', 'goals', 'multi_agent', 'hooks'];

// 输出检查：结构、长度、不该出现的词（含疑似密钥）
function checkText(all, banned) {
  if (all.some((s) => typeof s !== 'string' || !s.trim())) throw new Error('有空段落');
  const text = all.join('\n');
  const hit = banned.find((w) => text.toLowerCase().includes(w.toLowerCase()));
  if (hit) throw new Error('出现了不该出现的词：' + hit);
  if (/-----BEGIN|[A-Za-z0-9+/]{40,}|ALIPAY|PASSWORD/i.test(text)) throw new Error('疑似泄露');
}
export function checkReading(r, banned) {
  if (!r || typeof r.headline !== 'string' || !Array.isArray(r.body) || r.body.length !== 2 || typeof r.advice !== 'string') throw new Error('结构不对');
  checkText([r.headline, ...r.body, r.advice], banned);
  const k = isEn() ? 3 : 1; // 英文按字母算，长度上限放宽到三倍
  if (r.headline.length > 40 * k || r.body.some((s) => s.length > 160 * k) || r.advice.length > 80 * k) throw new Error('太长');
  return { headline: r.headline.trim(), body: r.body.map((s) => s.trim()), advice: r.advice.trim() };
}
export function checkFollow(r, banned) {
  if (!r || typeof r.answer !== 'string' || typeof r.advice !== 'string') throw new Error('结构不对');
  checkText([r.answer, r.advice], banned);
  const k = isEn() ? 3 : 1;
  if (r.answer.length > 200 * k || r.advice.length > 80 * k) throw new Error('太长');
  return { answer: r.answer.trim(), advice: r.advice.trim() };
}

function codexWriter(env) {
  const bin = env.CODEX_BIN || 'codex';
  const model = env.ASK_MODEL || 'gpt-6.2-sol';
  const effort = env.ASK_EFFORT || 'xhigh';
  const timeout = parseInt(env.ASK_TIMEOUT_MS || '120000', 10);
  const work = env.ASK_WORKDIR || path.join(os.tmpdir(), 'bazi-ask');
  const empty = path.join(work, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  const schemaFiles = {};
  for (const [k, v] of Object.entries(SCHEMAS)) { schemaFiles[k] = path.join(work, `schema-${k}.json`); fs.writeFileSync(schemaFiles[k], JSON.stringify(v)); }
  return {
    model,
    write(prompt, kind = 'reading') {
      const schemaFile = schemaFiles[kind];
      if (!schemaFile) return Promise.reject(new Error('未知的输出格式：' + kind));
      const dir = fs.mkdtempSync(path.join(work, 'run-'));
      const out = path.join(dir, 'out.json');
      const args = ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', empty,
        '-m', model, '-c', `model_reasoning_effort=${effort}`, '-c', 'web_search=disabled', ...DISABLE.flatMap((f) => ['--disable', f]),
        '--output-schema', schemaFile, '-o', out, '-'];
      return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { cwd: empty, env: { HOME: env.ASK_HOME || os.homedir(), PATH: '/usr/local/bin:/usr/bin:/bin' }, stdio: ['pipe', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (b) => { err = (err + b).slice(-2000); });
        const timer = setTimeout(() => { p.kill('SIGKILL'); }, timeout);
        p.on('error', (e) => { clearTimeout(timer); reject(e); });
        p.on('close', (code) => {
          clearTimeout(timer);
          try {
            if (code !== 0) throw new Error(`codex 退出码 ${code}：${err.split('\n').filter(Boolean).slice(-2).join(' ')}`);
            resolve(JSON.parse(fs.readFileSync(out, 'utf8')));
          } catch (e) { reject(e); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        });
        p.stdin.end(prompt);
      });
    },
  };
}

// 本地开发和测试用：不调模型，按倾向给一段固定的话
function fakeWriter() {
  return {
    model: 'fake',
    write(prompt, kind = 'reading') {
      // 英文请求给英文的假回答
      if (isEn()) {
        const reply = kind === 'follow'
          ? { answer: 'Same reading as before. On this detail, start with the part you can control, then watch how the other side responds.', advice: 'Write what you want to say in three sentences, then reread it tomorrow somewhere quiet.' }
          : { headline: 'Go ahead, but prepare well first', body: ['The reading says the situation roughly matches what you have in mind; timing and approach are what matter.', 'Test the waters on a small scale first, see how people react, then decide whether to take the next step.'], advice: 'Today, write down the one result you most want and the line you will not go below.' };
        return new Promise((r) => setTimeout(() => r(reply), 300));
      }
      const tend = (/倾向：(\S+)/.exec(prompt) || [])[1] || '顺';
      if (kind === 'follow') {
        return new Promise((r) => setTimeout(() => r({
          answer: `还是${tend}。这一卦说的是同一件事，这个细节上，先把自己能控制的部分做好，再看对方的回应。`,
          advice: '把要说的话先写成三句，明天找个安静的时间再看一遍。',
        }), 300));
      }
      return new Promise((r) => setTimeout(() => r({
        headline: `${tend}，可以去做，先把准备做足`,
        body: ['卦象显示眼下的局面和你的想法大体对得上，关键在于时机和方式。', '先做小范围的试探，看清对方的反应，再决定要不要推进到下一步。'],
        advice: '今天先写下你最想达成的一个结果，和一个能接受的底线。',
      }), 300));
    },
  };
}

export function makeAi(env, log = console) {
  const mode = env.ASK_AI || 'off';
  const writer = mode === 'codex' ? codexWriter(env) : mode === 'fake' ? fakeWriter() : null;
  const limit = Math.max(1, parseInt(env.ASK_CONCURRENCY || '2', 10));
  let running = 0;
  const waiting = [];
  const next = () => {
    while (running < limit && waiting.length) {
      const { prompt, kind, resolve, reject } = waiting.shift();
      running++;
      const t0 = Date.now();
      writer.write(prompt, kind).then((r) => resolve({ reading: r, ms: Date.now() - t0 }), (e) => { log.error(`[ask] ${e.message}`); reject(e); })
        .finally(() => { running--; next(); });
    }
  };
  return {
    enabled: !!writer, model: writer ? writer.model : null,
    stats: () => ({ running, waiting: waiting.length }),
    write: (prompt, kind = 'reading') => (writer ? new Promise((resolve, reject) => { waiting.push({ prompt, kind, resolve, reject }); next(); }) : Promise.reject(new Error('解读服务未开启'))),
  };
}
