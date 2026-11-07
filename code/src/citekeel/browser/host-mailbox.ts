import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { BrowserAskResult } from './collector.js';
import { CollectionError } from './bridge.js';

export type HostTask = { id: string; expiresAt: number } & (
  { kind: 'probe' | 'check' } | { kind: 'batch'; prompts: string[] }
);
type TaskInput = { kind: 'probe' | 'check' } | { kind: 'batch'; prompts: string[] };
export type HostRow = { ok: true; data: BrowserAskResult } | { ok: false; error: string; evidenceId?: string };
type HostReply = { ok: true; rows?: HostRow[] } | { ok: false; error: string };

export function workerProof(token: string, phase: 'request' | 'response', action: string, nonce: string, payload: unknown) {
  return createHmac('sha256', token).update(JSON.stringify([phase, action, nonce, payload])).digest('hex');
}

export function workerProofMatches(expected: string, provided: string | null | undefined) {
  const value = provided || '';
  return value.length === expected.length && /^[a-f0-9]{64}$/.test(value) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(value));
}

export function validBrowserPrompts(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 3 &&
    value.every(text => typeof text === 'string' && !!text.trim() && text.length <= 8000);
}

function validRow(value: unknown): value is HostRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as HostRow;
  if (row.ok === false) return typeof row.error === 'string' && row.error.length <= 500 &&
    (row.evidenceId === undefined || /^[\p{L}\p{N}_-]{1,100}$/u.test(row.evidenceId));
  const data = row.ok === true ? row.data : null;
  return !!data && data.engine === 'chatgpt' && typeof data.answer === 'string' && !!data.answer.trim() &&
    data.answer.length <= 200_000 && Array.isArray(data.citations) && data.citations.every(x => typeof x === 'string') &&
    typeof data.url === 'string' && /^https:\/\/chatgpt\.com\//.test(data.url) &&
    typeof data.evidenceId === 'string' && /^[\p{L}\p{N}_-]{1,100}$/u.test(data.evidenceId) &&
    typeof data.latencyMs === 'number' && Number.isFinite(data.latencyMs) &&
    typeof data.protocolId === 'string' && data.evidencePath === undefined;
}

/** The container exposes only a narrow mailbox; the worker initiates every connection. */
export class HostBrowserMailbox {
  private lastPoll = 0;
  private pending?: { task: HostTask; claimed: boolean; settle: (reply: HostReply) => void };
  private readonly seen = new Map<string, number>();

  constructor(private readonly token: string, private readonly timings = { onlineMs: 3000, pickupMs: 8000, batchMs: 720_000, checkMs: 85_000 }) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('本机浏览器 worker 令牌须为 64 位十六进制字符串。');
  }

  authorize(action: string, header: string | undefined, payload: unknown): string | null {
    const match = (header || '').match(/^OpenGEO (\d{13}-[a-f0-9-]{36})\.([a-f0-9]{64})$/);
    if (!match) return null;
    const [, nonce, proof] = match as [string, string, string];
    const now = Date.now();
    const sent = Number(nonce.slice(0, 13));
    if (Math.abs(now - sent) > 15_000 || !workerProofMatches(workerProof(this.token, 'request', action, nonce, payload), proof)) return null;
    for (const [id, expiry] of this.seen) if (expiry <= now) this.seen.delete(id);
    if (this.seen.has(nonce) || this.seen.size >= 512) return null;
    this.seen.set(nonce, sent + 15_001);
    return nonce;
  }

  sign(action: string, nonce: string, payload: unknown) {
    return workerProof(this.token, 'response', action, nonce, payload);
  }
  claim(): HostTask | null {
    this.lastPoll = Date.now();
    if (!this.pending || this.pending.claimed || this.pending.task.expiresAt <= Date.now()) return null;
    this.pending.claimed = true;
    return this.pending.task;
  }
  alive(id: unknown) {
    return this.pending?.task.id === id && this.pending?.claimed === true && this.pending.task.expiresAt > Date.now();
  }
  finish(id: unknown, reply: unknown): boolean {
    const job = this.pending;
    if (!job || !this.alive(id) || !reply || typeof reply !== 'object') return false;
    const result = reply as HostReply;
    if (result.ok === false) {
      if (typeof result.error !== 'string' || result.error.length > 500) return false;
    } else if (result.ok === true) {
      if (job.task.kind === 'batch' && (!Array.isArray(result.rows) || result.rows.length !== job.task.prompts.length || !result.rows.every(validRow))) return false;
    } else return false;
    job.settle(result);
    return true;
  }

  async submit(input: TaskInput): Promise<HostReply> {
    if (this.pending) throw new CollectionError('worker_busy', '本机浏览器 worker 正在执行任务。');
    if (Date.now() - this.lastPoll > this.timings.onlineMs) throw new CollectionError('worker_offline', '本机浏览器 worker 未连接。请在宿主机启动 npm run browser:worker。');
    if (input.kind === 'batch' && !validBrowserPrompts(input.prompts)) throw new CollectionError('invalid_prompts', '网页采样每批只接受 1–3 条有效问题。');
    const duration = input.kind === 'batch' ? this.timings.batchMs : this.timings.checkMs;
    const task: HostTask = { ...input, id: randomUUID(), expiresAt: Date.now() + duration };
    return new Promise(done => {
      const settle = (reply: HostReply) => {
        clearTimeout(pickup); clearTimeout(deadline);
        this.pending = undefined; done(reply);
      };
      const pickup = setTimeout(() => {
        if (this.pending?.task.id === task.id && !this.pending.claimed) settle({ ok: false, error: '宿主机未及时领取任务，未提交问题。' });
      }, this.timings.pickupMs);
      const deadline = setTimeout(() => settle({ ok: false, error: '宿主机采集结果超时；不自动重试。' }), duration);
      this.pending = { task, claimed: false, settle };
    });
  }

  collector(prompts: string[]) {
    let index = 0;
    let batch: Promise<HostReply> | undefined;
    return { engine: 'chatgpt', ask: async (prompt: string) => {
      if (prompts[index] !== prompt) throw new Error('采样问题与计划不一致。');
      const slot = index++;
      batch ??= this.submit({ kind: 'batch', prompts });
      const reply = await batch;
      if (!reply.ok) throw new Error(reply.error);
      const row = reply.rows?.[slot];
      if (!row) throw new Error('宿主机没有返回该题的采样记录。');
      if (!row.ok) {
        const error = new CollectionError('host_collection_failed', row.error);
        if (row.evidenceId) error.evidenceId = row.evidenceId;
        throw error;
      }
      return row.data;
    }, async close() {} };
  }
}
