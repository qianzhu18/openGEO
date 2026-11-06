import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createScriptCollector } from './script-collector.js';
import { CollectionError } from './bridge.js';

const help = `OpenGEO 本机网页脚本采集（不使用 Playwright）
  npm run --silent browser:probe
  npm run --silent browser:check
  npm run --silent browser:ask -- "问题" [--engine chatgpt]
  npm run --silent browser:batch -- --file questions.jsonl

选项：--daemon-url http://127.0.0.1:10086 --timeout-ms 120000
      --interval-ms 15000 --help / -h
JSONL 输入：每行 {"id":"q1","prompt":"问题"}，每轮最多 3 条。
stdout 返回 JSON（批处理每题一行）；失败退出码非零，不自动重试。
需已连接的 Xue Chrome + Kimi 扩展、Node >=22.13；登录／验证码由本人处理。`;

const output = (value: unknown) => console.log(JSON.stringify(value));
const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT', abort); process.once('SIGTERM', abort);
let collector: Awaited<ReturnType<typeof createScriptCollector>> | undefined;
try {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' }, engine: { type: 'string', default: 'chatgpt' },
      'daemon-url': { type: 'string' }, 'timeout-ms': { type: 'string' }, 'interval-ms': { type: 'string' }, file: { type: 'string' } } });
  const [command, ...rest] = positionals;
  if (values.help || !command) console.log(help);
  else {
    if (!['probe', 'check', 'ask', 'batch'].includes(command)) throw new CollectionError('invalid_command', '可用命令：probe / check / ask / batch。登录请在 Xue 浏览器中手动完成。');
    if (values.engine !== 'chatgpt') throw new CollectionError('engine_not_supported', '当前脚本采集仅实现 ChatGPT，其他平台未实现。');
    const number = (key: 'timeout-ms' | 'interval-ms', min: number, max: number) => {
      if (values[key] === undefined) return undefined;
      const value = Number(values[key]);
      if (!Number.isInteger(value) || value < min || value > max) throw new CollectionError('invalid_option', `--${key} 应为 ${min}–${max} 的整数。`);
      return value;
    };
    const timeoutMs = number('timeout-ms', 1000, 300000), intervalMs = number('interval-ms', 10000, 3600000);
    let jobs: { id: string; prompt: string }[] = [];
    if (command === 'ask') jobs = [{ id: 'q1', prompt: rest.join(' ').trim() }];
    if (command === 'batch') {
      if (!values.file || rest.length) throw new CollectionError('invalid_input', 'batch 需要 --file questions.jsonl。');
      let rows: unknown[];
      try { rows = (await readFile(values.file, 'utf8')).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
      catch { throw new CollectionError('invalid_input', '问题文件必须是可读的 JSONL，每行包含 id 和 prompt。'); }
      jobs = rows as typeof jobs;
      if (!jobs.length || jobs.length > 3) throw new CollectionError('invalid_input', '每轮只接受 1–3 个问题。');
    }
    if (jobs.some(job => !job || typeof job.id !== 'string' || !job.id.trim() || typeof job.prompt !== 'string' || !job.prompt.trim() || job.prompt.length > 8000)
      || new Set(jobs.map(job => job.id)).size !== jobs.length) throw new CollectionError('invalid_input', '问题 ID 必须唯一；prompt 必须为 1–8000 个字符。');
    if (['probe','check'].includes(command) && rest.length) throw new CollectionError('invalid_input', 'probe / check 不接受问题文本。');
    collector = await createScriptCollector(values.engine, { daemonUrl: values['daemon-url'], signal: controller.signal, timeoutMs, intervalMs });
    if (command === 'probe') output({ ok: true, data: { profile: await collector.probe(), transport: 'kimi-webbridge' } });
    else if (command === 'check') output({ ok: true, data: await collector.check() });
    else {
      let failed = false;
      for (const job of jobs) {
        if (failed) { output({ ok: false, id: job.id, error: { code: 'skipped', message: '前一题失败，本题未提交。' } }); continue; }
        try { output({ ok: true, id: job.id, data: await collector.ask(job.prompt) }); }
        catch (error) {
          failed = true; process.exitCode = controller.signal.aborted ? 130 : 1;
          const failure = error instanceof CollectionError ? error : new CollectionError('collection_failed', '采集未完成。');
          output({ ok: false, id: job.id, error: { code: failure.code, message: failure.message, evidencePath: failure.evidencePath } });
        }
      }
    }
  }
} catch (error) {
  const failure = controller.signal.aborted ? new CollectionError('interrupted', '采集已中断；不会自动重试。') : error instanceof CollectionError ? error : new CollectionError('invalid_input', '命令参数或输入无效，请运行 --help。');
  output({ ok: false, error: { code: failure.code, message: failure.message } });
  process.exitCode = controller.signal.aborted ? 130 : 1;
} finally {
  await collector?.close();
  process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
}
