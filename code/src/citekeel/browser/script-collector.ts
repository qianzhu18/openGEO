import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BrowserAskResult } from './collector.js';
import { evidenceId } from './evidence.js';
import { type BrowserBridge, CollectionError, KimiBridge, collectorLock, pause, verifyProfile, type VerifiedProfile } from './bridge.js';
import { chatgptScript } from './chatgpt-script.js';

interface PageAnswer { error?: string; answer?: string; complete?: boolean; sendReady?: boolean; citations?: string[]; url?: string; html?: string; }
export interface ScriptOptions {
  daemonUrl?: string; configPath?: string; evidenceDir?: string; lockPath?: string;
  timeoutMs?: number; intervalMs?: number; signal?: AbortSignal;
  /** Injectable ports for deterministic offline tests, never chosen from CLI input. */
  bridge?: BrowserBridge; verify?: (bridge: BrowserBridge) => Promise<VerifiedProfile>;
  pollMs?: number;
}
const messages: Record<string, string> = {
  unexpected_page: '采集标签离开了 ChatGPT，已停止。', challenge: '页面出现验证，需要用户本人处理。',
  not_logged_in: '需要在 Xue 中登录 ChatGPT。', composer_missing: '未找到输入框，可能尚未登录或页面结构已变化。',
  not_fresh_chat: '页面不是空白新对话，未覆盖用户内容。', inject_failed: '问题没有写进输入框，未提交。',
  user_interrupted: '用户操作了采集标签，已停止；不会自动续发。',
  page_reloaded: '采集页已重新加载，无法确认本次状态。', rate_limited: '平台限制本次请求，请稍后手动重新运行。',
  stale_answer: '回答不属于本次问题，已排除。',
};
function checkPage<T extends { error?: string }>(value: T): T {
  if (value.error) throw new CollectionError(value.error, messages[value.error] || '页面状态不可识别，已停止。');
  return value;
}

export async function createScriptCollector(engine: string, options: ScriptOptions = {}) {
  if (engine !== 'chatgpt') throw new CollectionError('engine_not_supported', '脚本采集当前仅实现 ChatGPT；其他平台不会回退到旧 profile。');
  const bridge = options.bridge || new KimiBridge(options.daemonUrl, options.signal);
  const release = await collectorLock(options.lockPath);
  let closed = false, stopped = false, busy = false, lastFinished = 0, previousPrompt = '';
  const interval = Math.max(10_000, options.intervalMs ?? 15_000);
  const timeout = Math.min(300_000, Math.max(1_000, options.timeoutMs ?? 120_000));
  const evidenceRoot = resolve(options.evidenceDir || process.env.OPENGEO_EVIDENCE_DIR || 'data/evidence');
  return {
    engine: 'chatgpt' as const,
    async probe() {
      if (closed) throw new CollectionError('collector_closed', '采集器已关闭。');
      return (options.verify || (bridge => verifyProfile(bridge, {
        configPath: options.configPath, signal: options.signal, timeoutMs: Math.min(20_000, timeout),
      })))(bridge);
    },
    async check() {
      const profile = await this.probe();
      // verifyProfile left its owned task tab selected. Reuse it; never borrow a user tab.
      await bridge.command('navigate', { url: 'https://chatgpt.com/' });
      const auth = checkPage(await bridge.evaluate<{ authenticated?: boolean; error?: string }>(chatgptScript('auth')));
      if (auth.authenticated !== true) throw new CollectionError('not_logged_in', '未确认 ChatGPT 有效登录，请在 Xue 中手动登录后重试。');
      return { profile, authenticated: true, channel: 'web-ui' as const };
    },
    async ask(prompt: string): Promise<BrowserAskResult> {
      if (closed || stopped) throw new CollectionError('collector_stopped', '本轮采集已停止，不再提交后续问题。');
      if (busy) throw new CollectionError('collector_busy', '网页问题必须串行提交。');
      if (!prompt.trim() || prompt.length > 8000) throw new CollectionError('invalid_prompt', '问题必须为 1–8000 个字符。');
      busy = true;
      const id = evidenceId(engine, prompt), dir = join(evidenceRoot, id), evidencePath = join(dir, 'evidence.json');
      const startedAt = Date.now();
      let profile: VerifiedProfile | undefined, partial = '', submission = 'not-attempted';
      try {
        const wait = lastFinished + interval - Date.now();
        if (wait > 0) await pause(wait, options.signal);
        if (previousPrompt) checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('read', { prompt: previousPrompt })));
        const checked = await this.check();
        profile = checked.profile;
        checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('clear-draft')));
        const readyDeadline = Date.now() + 15_000;
        while (true) {
          const ready = await bridge.evaluate<PageAnswer>(chatgptScript('prepare', { prompt }));
          if (ready.error !== 'composer_missing' || Date.now() >= readyDeadline) { checkPage(ready); break; }
          await pause(500, options.signal);
        }
        checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('inject', { prompt })));
        // The send control replaces the voice button only after the editor accepts the text.
        const sendDeadline = Date.now() + 5_000;
        while (true) {
          const ready = checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('read', { prompt })));
          if (ready.sendReady) break;
          if (Date.now() >= sendDeadline) throw new CollectionError('send_unavailable', '发送按钮未就绪，未提交问题。');
          await pause(100, options.signal);
        }
        submission = 'attempted';
        const send = async () => {
          checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('arm')));
          try {
            await bridge.command('mouse_click', { selector: '[data-opengeo-send="1"], button[aria-label="发送"], button[aria-label="发送提示"], button[aria-label="Send"], button[aria-label="Send prompt"], [data-testid="send-button"]', focus_emulation: true });
            await pause(1000, options.signal);
          } finally {
            await bridge.evaluate<PageAnswer>(chatgptScript('disarm')).catch(() => undefined);
          }
        };
        await send();
        let primed = await bridge.evaluate<PageAnswer>(chatgptScript('read', { prompt })).catch(() => undefined);
        if (primed?.sendReady) await send();
        await bridge.command('cdp', { method: 'Emulation.setFocusEmulationEnabled', params: { enabled: false } }).catch(() => undefined);
        const deadline = Date.now() + timeout;
        let stable = '', stableCount = 0, result: PageAnswer | undefined;
        while (Date.now() < deadline) {
          options.signal?.throwIfAborted();
          const page = checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('read', { prompt })));
          partial = page.answer || '';
          if (page.complete && partial && partial === stable) stableCount++; else stableCount = 0;
          stable = partial;
          if (stableCount >= 2) { result = page; break; }
          await pause(options.pollMs ?? 1000, options.signal);
        }
        if (!result?.answer) throw new CollectionError('answer_timeout', '未确认回答完整结束；已有文本仅作为失败片段保留，不计入有效样本。');
        await mkdir(dir, { recursive: true, mode: 0o700 });
        const marker = randomUUID();
        checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('read', { prompt, marker })));
        const screenshotPath = join(dir, 'screenshot.png');
        await bridge.command('screenshot', { format: 'png', selector: `[data-opengeo-evidence="${marker}"]`, path: screenshotPath });
        const png = await readFile(screenshotPath).catch(() => Buffer.alloc(0));
        if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new CollectionError('screenshot_missing', '回答截图未保存；本次不计入有效样本。');
        await chmod(screenshotPath, 0o600);
        const final = checkPage(await bridge.evaluate<PageAnswer>(chatgptScript('read', { prompt })));
        if (!final.complete || final.answer !== result.answer || !final.html || !final.url) throw new CollectionError('answer_changed', '截图期间回答状态变化，未计入有效样本。');
        const answerPath = join(dir, 'answer.txt'), domPath = join(dir, 'page.html');
        await writeFile(answerPath, final.answer, { mode: 0o600 });
        await writeFile(domPath, final.html, { mode: 0o600 });
        const durationMs = Date.now() - startedAt;
        const record = {
          schemaVersion: 'opengeo-browser-script/v1', id, status: 'completed', channel: 'web-ui', transport: 'kimi-webbridge',
          engine, prompt, answer: final.answer, citations: final.citations || [], url: final.url,
          capturedAt: new Date().toISOString(), durationMs, loginState: 'signed_in',
          profile, protocol: { channel: 'web-ui', engine, profile: 'Xue', session: 'fresh', model: 'UNKNOWN', region: 'UNKNOWN', authentication: 'page-session-endpoint', screenshotScope: 'answer-only', domScope: 'answer-only-sanitized' },
          answerPath, domPath, screenshotPath, evidencePath,
        };
        await writeFile(evidencePath, JSON.stringify(record, null, 2), { mode: 0o600 });
        return { engine, answer: final.answer!, citations: record.citations, url: final.url, evidenceId: id, latencyMs: durationMs, evidencePath, protocolId: 'browser-ui/v2;engine=chatgpt;transport=kimi-webbridge;profile=Xue;session=fresh;model=UNKNOWN;region=UNKNOWN' };
      } catch (error) {
        stopped = true;
        const failure = error instanceof CollectionError ? error : new CollectionError(options.signal?.aborted ? 'interrupted' : 'collection_failed', options.signal?.aborted ? '采集已中断；不会自动重试。' : '采集未完成，未记录为有效回答。');
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeFile(evidencePath, JSON.stringify({ schemaVersion: 'opengeo-browser-script/v1', id, engine, prompt, status: 'failed', channel: 'web-ui', transport: 'kimi-webbridge', capturedAt: new Date().toISOString(), profile: profile || null, submission, answer: '', partialAnswer: partial, failureReason: failure.code, error: failure.message }, null, 2), { mode: 0o600 });
        failure.evidencePath = evidencePath;
        throw failure;
      } finally { busy = false; lastFinished = Date.now(); previousPrompt = prompt; }
    },
    async close() { if (!closed) { closed = true; await release(); } },
  };
}
