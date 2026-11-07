import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export class CollectionError extends Error {
  evidencePath?: string;
  evidenceId?: string;
  constructor(public code: string, message: string) { super(message); }
}

export interface BrowserBridge {
  command<T = any>(action: string, args?: Record<string, unknown>): Promise<T>;
  evaluate<T>(code: string): Promise<T>;
}

export class KimiBridge implements BrowserBridge {
  readonly url: string;
  constructor(url = process.env.OPENGEO_BRIDGE_URL || 'http://127.0.0.1:10086', private signal?: AbortSignal) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
      || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new CollectionError('invalid_bridge_url', '浏览器桥接只允许本机 HTTP 根地址。');
    }
    this.url = parsed.origin;
  }
  async command<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
    this.signal?.throwIfAborted();
    let reply: any;
    try {
      const response = await fetch(`${this.url}/command`, {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, args, session: 'opengeo-collector' }),
        signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(this.signal ? [this.signal] : [])]),
      });
      if (!response.ok) throw new Error();
      reply = await response.json();
    } catch {
      if (this.signal?.aborted) throw new CollectionError('interrupted', '采集已中断；不会自动重试。');
      throw new CollectionError('bridge_unreachable', '本机浏览器桥接未响应。运行 kimi-webbridge start，并核对 --daemon-url。');
    }
    if (reply?.ok !== true) {
      if (reply?.error?.code === 'extension_not_connected') throw new CollectionError('extension_not_connected', '请在 Xue 窗口连接 Kimi 浏览器扩展，然后重新运行。');
      if (action === 'find_tab' && /no tab|no matching tab|not found|Cannot access a chrome:\/\/ URL/i.test(reply?.error?.message || '')) throw new CollectionError('tab_not_found', '本任务没有可复用的网页标签。');
      throw new CollectionError('bridge_command_failed', `浏览器桥接未完成 ${action}；未切换 profile 或自动重试。`);
    }
    return reply.data as T;
  }
  async evaluate<T>(code: string): Promise<T> {
    const result = await this.command<{ type: string; value: unknown }>('evaluate', { code });
    if (result?.type !== 'string' || typeof result.value !== 'string') throw new CollectionError('invalid_page_result', '页面未返回预期的 JSON。');
    try { return JSON.parse(result.value) as T; }
    catch { throw new CollectionError('invalid_page_result', '页面结果不是有效 JSON。'); }
  }
}

export async function taskNavigate(bridge: BrowserBridge, url: string, findUrl = url): Promise<void> {
  let newTab = false;
  try { await bridge.command('find_tab', { url: findUrl }); }
  catch (error) {
    if (!(error instanceof CollectionError) || error.code !== 'tab_not_found') throw error;
    newTab = true;
  }
  if (newTab && findUrl !== url) {
    try { await bridge.command('find_tab', { url }); newTab = false; }
    catch (error) { if (!(error instanceof CollectionError) || error.code !== 'tab_not_found') throw error; }
  }
  await bridge.command('navigate', { url, newTab, group_title: 'OpenGEO 采集' });
}

export const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((done, reject) => {
  if (signal?.aborted) return reject(new CollectionError('interrupted', '采集已中断。'));
  const abort = () => { clearTimeout(timer); reject(new CollectionError('interrupted', '采集已中断。')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); done(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});

export interface VerifiedProfile { profileName: 'Xue'; profileDirectory: string; verifiedAt: string; method: 'exact-task-history-url'; }

/** Read profile names only; never open Cookies, Preferences, or other history rows. */
export async function selectedHistory(configPath = 'data/browser-config.json'): Promise<string> {
  let config: { profileName?: string; chromeUserDataDir?: string };
  try { config = JSON.parse(await readFile(resolve(configPath), 'utf8')); }
  catch { throw new CollectionError('profile_config_missing', '缺少 data/browser-config.json；需指定 profileName: Xue。'); }
  if (config.profileName !== 'Xue') throw new CollectionError('wrong_profile', '真实网页采样只允许指定的 Xue。');
  const defaults: Record<string, string> = {
    darwin: join(homedir(), 'Library/Application Support/Google/Chrome'),
    win32: join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data'),
    linux: join(homedir(), '.config/google-chrome'),
  };
  const base = resolve(config.chromeUserDataDir || defaults[process.platform] || '');
  let cache: Record<string, { name?: string }>;
  try { cache = JSON.parse(await readFile(join(base, 'Local State'), 'utf8')).profile.info_cache; }
  catch { throw new CollectionError('profile_not_found', '无法读取 Chrome 的 profile 名称映射。'); }
  const matches = Object.entries(cache || {}).filter(([, value]) => value?.name === 'Xue');
  if (matches.length !== 1 || !/^(Default|Profile \d+)$/.test(matches[0][0])) throw new CollectionError('profile_not_found', '需要唯一的 Xue Chrome 用户，未回退到其他用户。');
  return join(base, matches[0][0], 'History');
}

function historyLocked(error: unknown): boolean {
  const value = error as { errcode?: number; errstr?: string; message?: string };
  return value.errcode === 5 || value.errcode === 6 || /database is locked|database schema is locked/i.test(`${value.errstr || ''} ${value.message || ''}`);
}

async function historyHasUrl(path: string, url: string, timeout = 0): Promise<boolean> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, timeout > 0 ? { readOnly: true, timeout } : { readOnly: true });
  try { return !!db.prepare('SELECT 1 FROM urls WHERE url = ? LIMIT 1').get(url); }
  finally { db.close(); }
}

export async function historyContains(history: string, url: string): Promise<boolean> {
  // Load lazily: missing node:sqlite fails closed, and --help needs no SQLite/browser.
  // Chrome keeps History open. A short busy wait covers a commit; a locked file is
  // copied with its WAL and queried once, then the copy is deleted. No other rows are read.
  try { return await historyHasUrl(history, url, 200); }
  catch (error) {
    if (!historyLocked(error)) throw error;
    const { copyFile, mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(join(tmpdir(), 'opengeo-history-'));
    try {
      const snapshot = join(dir, 'History');
      await copyFile(history, snapshot);
      await copyFile(`${history}-wal`, `${snapshot}-wal`).catch(() => undefined);
      await copyFile(`${history}-shm`, `${snapshot}-shm`).catch(() => undefined);
      return await historyHasUrl(snapshot, url);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}

/** Prove the extension's actual navigation reached Xue, rather than trusting its signed_in flag. */
export async function verifyProfile(bridge: BrowserBridge, options: {
  configPath?: string; signal?: AbortSignal; timeoutMs?: number;
  contains?: typeof historyContains;
} = {}): Promise<VerifiedProfile> {
  const history = await selectedHistory(options.configPath);
  const nonce = randomUUID();
  const path = `/opengeo-profile-check/${nonce}`;
  const server = createServer((req, res) => {
    res.writeHead(req.url === path ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'" });
    res.end(req.url === path ? '<!doctype html><title>OpenGEO profile check</title><p>OpenGEO 本机浏览器核验</p>' : '');
  });
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No loopback address');
    const url = `http://127.0.0.1:${address.port}${path}`;
    await bridge.command('navigate', { url, newTab: true, group_title: 'OpenGEO 采集' });
    const deadline = Date.now() + (options.timeoutMs ?? 20_000);
    do {
      options.signal?.throwIfAborted();
      try {
        if (await (options.contains || historyContains)(history, url)) return {
          profileName: 'Xue', profileDirectory: resolve(history, '..').split(/[\\/]/).at(-1)!,
          verifiedAt: new Date().toISOString(), method: 'exact-task-history-url',
        };
      } catch { /* Locked/unavailable history is not proof of the selected profile. */ }
      await pause(250, options.signal);
    } while (Date.now() < deadline);
    throw new CollectionError('profile_unverified', '未在 Xue 中发现本次校验页。请将桥接连接到 Xue；历史禁用或数据库不可读也会导致此错误。未提交问题。');
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
}

/** One process owns browser collection. A crash's dead PID can be reclaimed. */
export async function collectorLock(path = 'data/browser-collector.lock'): Promise<() => Promise<void>> {
  path = resolve(path);
  await mkdir(resolve(path, '..'), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600);
      await file.writeFile(String(process.pid)); await file.close();
      return async () => { await unlink(path).catch(() => {}); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (attempt === 0) {
        // Serialize stale-lock cleanup and re-read the owner under that lock. Two
        // reapers must never delete a lock just acquired by a live collector.
        const reaperPath = `${path}.reaping`;
        const reaper = await open(reaperPath, 'wx', 0o600).catch(() => null);
        if (reaper) {
          let dead = false;
          try {
            const pid = Number(await readFile(path, 'utf8').catch(() => ''));
            if (Number.isInteger(pid) && pid > 0) {
              try { process.kill(pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
            }
            if (dead) await unlink(path).catch(() => {});
          } finally { await reaper.close(); await unlink(reaperPath).catch(() => {}); }
          if (dead) continue;
        }
      }
      throw new CollectionError('collector_busy', '已有脚本或工作台正在采集，请等待结束。');
    }
  }
  throw new CollectionError('collector_busy', '采集锁不可用。');
}
