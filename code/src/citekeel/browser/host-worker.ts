import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CollectionError, pause } from './bridge.js';
import { createScriptCollector } from './script-collector.js';
import { type HostRow, type HostTask, validBrowserPrompts, workerProof, workerProofMatches } from './host-mailbox.js';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('OpenGEO 宿主机浏览器 worker\n  npm run browser:worker\n仅连接本机 Docker 工作台，使用已配置的 Xue + Kimi 扩展。当前仅支持 ChatGPT。\n默认地址 http://127.0.0.1:8848；令牌文件 data/docker-worker/token。\n修改端口时设置 OPENGEO_WORKER_APP_URL，修改令牌路径时设置 OPENGEO_HOST_WORKER_TOKEN_FILE。\nCtrl+C 停止，不自动重试已提交问题。');
  process.exit(0);
}
if (process.argv.length > 2) throw new Error('worker 不接受任务参数，请运行 --help。');
const base = new URL(process.env.OPENGEO_WORKER_APP_URL || 'http://127.0.0.1:8848');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('worker 只连接本机 OpenGEO 工作台的 HTTP 根地址。');
}
const token = (await readFile(process.env.OPENGEO_HOST_WORKER_TOKEN_FILE || 'data/docker-worker/token', 'utf8')).trim();
if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('worker 令牌文件格式无效。');
const stopped = new AbortController();
for (const event of ['SIGINT', 'SIGTERM'] as const) process.once(event, () => stopped.abort());
const call = async (action: 'claim' | 'alive' | 'finish', body: object = {}) => {
  const nonce = Date.now() + '-' + randomUUID();
  const proof = workerProof(token, 'request', action, nonce, body);
  const res = await fetch(new URL('/api/local-browser-worker/' + action, base), {
    method: 'POST', redirect: 'error',
    signal: AbortSignal.any([stopped.signal, AbortSignal.timeout(4000)]),
    headers: { authorization: 'OpenGEO ' + nonce + '.' + proof, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('工作台未接通（HTTP ' + res.status + '）。');
  const result = await res.json();
  if (!workerProofMatches(workerProof(token, 'response', action, nonce, result), res.headers.get('x-opengeo-proof'))) {
    throw new Error('工作台身份校验失败。');
  }
  return result;
};
const errorMessage = (e: unknown) => e instanceof CollectionError ? e.message.slice(0, 500) : '宿主机采集未完成，未自动重试。';
let wasOnline = false;
while (!stopped.signal.aborted) {
  let task: HostTask | null;
  try {
    task = (await call('claim')).task;
    if (!wasOnline) console.log('OpenGEO 浏览器 worker 已连接工作台。');
    wasOnline = true;
  } catch {
    if (wasOnline) console.error('工作台已断开，等待重新连接。');
    wasOnline = false;
    await pause(1000, stopped.signal).catch(() => {});
    continue;
  }
  if (!task) { await pause(500, stopped.signal).catch(() => {}); continue; }
  const id = task.id, ms = task.expiresAt - Date.now();
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || !Number.isFinite(ms) || ms <= 0 || ms > 720_000 ||
    !['probe', 'check', 'batch'].includes(task.kind) || (task.kind === 'batch' && !validBrowserPrompts(task.prompts))) continue;
  let collector: Awaited<ReturnType<typeof createScriptCollector>> | undefined;
  const lease = new AbortController();
  const signal = AbortSignal.any([stopped.signal, lease.signal, AbortSignal.timeout(ms)]);
  let checking = false;
  const active = async () => {
    if (checking || signal.aborted) return;
    checking = true;
    try { if ((await call('alive', { id })).alive !== true) lease.abort(); }
    catch { lease.abort(); }
    finally { checking = false; }
  };
  const heartbeat = setInterval(() => void active(), 1500);
  let reply: { ok: true; rows?: HostRow[] } | { ok: false; error: string };
  try {
    if (task.kind === 'batch' && task.engine !== undefined && task.engine !== 'chatgpt') {
      throw new CollectionError('engine_not_supported', '宿主机 worker 当前仅支持 ChatGPT；该平台未采集，不会替换为其他平台。');
    }
    await active(); signal.throwIfAborted();
    collector = await createScriptCollector('chatgpt', {
      signal, configPath: process.env.OPENGEO_BROWSER_CONFIG_FILE, lockPath: process.env.OPENGEO_BROWSER_LOCK_FILE,
    });
    if (task.kind === 'batch') {
      const rows: HostRow[] = [];
      let halted = false;
      for (const prompt of task.prompts) {
        if (halted || signal.aborted) { rows.push({ ok: false, error: '前一条采集失败或批次已中止，本题未提交。' }); continue; }
        try {
          const { evidencePath: _hostPath, ...result } = await collector.ask(prompt);
          rows.push({ ok: true, data: result });
        } catch (e) {
          halted = true;
          const evidenceId = e instanceof CollectionError ? e.evidenceId : undefined;
          rows.push({ ok: false, error: errorMessage(e), ...(e instanceof CollectionError ? { code: e.code } : {}), ...(evidenceId ? { evidenceId } : {}) });
        }
      }
      reply = { ok: true, rows };
    } else {
      await collector[task.kind]();
      reply = { ok: true };
    }
  } catch (e) { reply = { ok: false, error: errorMessage(e) }; }
  finally { clearInterval(heartbeat); await collector?.close(); }
  if (!signal.aborted) await call('finish', { id, reply }).catch(() => {});
}
