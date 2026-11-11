import { randomUUID } from 'node:crypto';
import { backoffMs } from './batch-policy.js';
import { redactApiEvidence, apiAnswerProblem } from './api-receipts.js';
import type { SamplingJob, QueueClock } from './sampling-queue.js';
import type { Citation } from './types.js';
import { retryAfterMs } from '../../vendor/niubigeo/src/providers/http.js';

const realtime: QueueClock = { now: Date.now, random: Math.random, sleep: ms => new Promise(r => setTimeout(r, ms)) };
type Saved = (event?: { status?: number; data?: unknown; phase?: 'attempted'; requestId?: string; retryAfterMs?: number }) => Promise<void>;
export interface CloroAsyncOptions {
  job: SamplingJob; key: string; engine: string; prompt: string; country: string;
  save: Saved; stopped: () => boolean; clock?: QueueClock; deadlineMs?: number;
  requestTimeoutMs?: number;
  retainedResponse?: unknown;
}

const RETENTION_SAFETY_MS = 23 * 60 * 60_000;
const isTaskId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id);

function observation(data: any, engine: string, country: string, now: number) {
  const answer = typeof data.response?.text === 'string' ? data.response.text.trim() : '';
  if (!answer) throw new Error('Cloro async returned an empty answer.');
  const raw = { ...data, success: true, result: data.response };
  const problem = apiAnswerProblem(answer, raw); if (problem) throw new Error(problem);
  const citations: Citation[] = [];
  for (const [index, source] of (Array.isArray(data.response.sources) ? data.response.sources : []).entries()) {
    try { const url = new URL(source.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      citations.push({ url: url.toString(), kind: 'search_result', source: 'cloro_monitor_source', payloadPath: `response.sources[${index}].url`, integrity: 'matched' });
    } catch { /* invalid source remains in raw evidence */ }
  }
  return { answer, rawResponse: raw, citations, latencyMs: typeof data.task.latencyMs === 'number' ? data.task.latencyMs : undefined,
    observedAt: new Date(now).toISOString(), observation: { transport: 'cloro-monitor-api' as const, engine,
      requestedCountry: country, actualModel: 'UNKNOWN' as const, searchExecution: 'UNKNOWN' as const } };
}

/** External task identity is committed before POST. Retrying submission never creates a new key. */
export async function collectCloroAsync(options: CloroAsyncOptions) {
  const { job, key, engine, prompt, country, save, stopped } = options;
  const time = options.clock || realtime;
  if (!['chatgpt', 'gemini'].includes(engine)) throw new Error('Cloro async engine invalid');
  if (!job.remote) {
    job.remote = { idempotencyKey: `opengeo-${randomUUID()}`, createdAt: new Date(time.now()).toISOString(),
      deadlineAt: new Date(time.now() + (options.deadlineMs || 20 * 60_000)).toISOString(), pollCount: 0, submissionAttempts: 0 };
    await save();
  }
  const remote = job.remote;
  const retained = options.retainedResponse as any;
  // A crash after receiving the response must not cause a second external operation.
  if (remote.status === 'COMPLETED' && retained?.task?.id === remote.taskId && retained?.task?.status === 'COMPLETED') {
    return observation(retained,engine,country,time.now());
  }
  const createdAt = Date.parse(remote.createdAt), deadline = Date.parse(remote.deadlineAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(deadline) || remote.taskId && !isTaskId(remote.taskId)) throw new Error('远端任务身份或时间记录无效，请核对原记录。');
  if (!remote.taskId && (time.now() - createdAt >= RETENTION_SAFETY_MS || time.now() >= deadline)) {
    throw new Error('远端提交恢复窗口已结束；幂等键可能过期，禁止重新提交，请核对服务商。');
  }
  const request = async (path: string, method: 'POST' | 'GET', body?: object) => {
    const response = await fetch(`https://api.cloro.dev/v1/async/${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(options.requestTimeoutMs || 20_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { unparsedBody: text }; }
    const data = redactApiEvidence(parsed, key);
    return { status: response.status, data, requestId: response.headers.get('x-request-id') || undefined,
      retryAfterMs: retryAfterMs(response.headers.get('retry-after'),time.now()) };
  };
  const pause = async (ms: number) => {
    const until = time.now() + ms;
    while (time.now() < until) {
      if (stopped()) throw new Error('用户停止了后续发送；远端任务保留，可继续查询。');
      if(time.now() >= deadline) throw new Error('Cloro remote task deadline exceeded; taskId与幂等键已保留，可继续查询。');
      await time.sleep(Math.min(1000, until - time.now(), deadline-time.now()));
    }
  };
  for (let attempt = 1; !remote.taskId && attempt <= 5; attempt++) {
    if (stopped()) throw new Error('用户停止了后续发送。');
    if(time.now() >= deadline || time.now()-createdAt >= RETENTION_SAFETY_MS) throw new Error('远端提交恢复窗口已结束，禁止创建重复任务。');
    job.phase = 'sending'; remote.submissionAttempts++; await save();
    if(stopped()) throw new Error('用户停止了后续发送。');
    await save({phase:'attempted'});
    let event;
    try {
      event = await request('task', 'POST', { taskType: engine.toUpperCase(), idempotencyKey: remote.idempotencyKey,
        payload: { prompt, country, include: { markdown: true } } });
    } catch (error) {
      // Submit may already exist. Retry the SAME external key, never a new generation.
      if (attempt === 5) throw error;
      await pause(backoffMs(attempt, time.random)); continue;
    }
    const taskId = [200,201,202].includes(event.status) && event.data?.success !== false ? event.data?.task?.id
      : event.status === 409 && event.data?.error?.code === 'RESOURCE_ALREADY_EXISTS' ? event.data?.error?.details?.taskId : undefined;
    if (isTaskId(taskId)) {
      remote.taskId = taskId; remote.status = 'QUEUED';
      const expected = event.data?.credits?.creditsToCharge;
      if (typeof expected === 'number' && Number.isFinite(expected) && expected >= 0) remote.creditsToCharge = expected;
      job.phase = 'remote_queued'; await save(event); break;
    }
    await save(event);
    if (![429,500,502,503,504].includes(event.status) || attempt === 5) throw new Error(`Cloro async submit HTTP ${event.status}`);
    const delay = Math.max(backoffMs(attempt, time.random), event.retryAfterMs || 0);
    if (delay > 300_000) throw new Error('Cloro async Retry-After超出本地等待上限');
    await pause(delay);
  }
  if (!remote.taskId) throw new Error('Cloro async未返回taskId；保留幂等键待核对。');
  let errors = 0;
  while (true) {
    if (stopped()) throw new Error('用户停止了后续发送；远端任务保留，可继续查询。');
    if (time.now() >= deadline) throw new Error('Cloro remote task deadline exceeded; taskId已保留，可继续查询。');
    if (remote.nextPollAt && Date.parse(remote.nextPollAt) > time.now()) await pause(Date.parse(remote.nextPollAt) - time.now());
    remote.pollCount++;await save();
    let event;
    try { event = await request(`task/${remote.taskId}`, 'GET'); }
    catch (error) {
      if (++errors >= 6 || time.now() > Date.parse(remote.deadlineAt)) throw error;
      remote.nextPollAt = new Date(time.now() + backoffMs(errors, time.random)).toISOString();
      job.phase = 'poll_wait'; await save(); continue;
    }
    if (event.status !== 200) {
      if ([429,500,502,503,504].includes(event.status) && ++errors < 6 && time.now() < Date.parse(remote.deadlineAt)) {
        const delay = Math.max(backoffMs(errors, time.random), event.retryAfterMs || 0);
        if (delay <= 300_000) { remote.nextPollAt = new Date(time.now() + delay).toISOString(); job.phase='poll_wait'; await save(); continue; }
      }
      await save(event); throw new Error(`Cloro async poll HTTP ${event.status}; taskId已保留，不重新提交。`);
    }
    errors = 0;
    const data = event.data;
    if (data?.task?.id !== remote.taskId || !['QUEUED','PROCESSING','COMPLETED','FAILED'].includes(data?.task?.status)) {
      await save(event); throw new Error('Cloro async任务身份或状态不匹配，保留待核对。');
    }
    remote.status = data.task.status;
    const charged = data?.credits?.creditsCharged;
    if (typeof charged === 'number' && Number.isFinite(charged) && charged >= 0) remote.creditsCharged = charged;
    if (remote.status === 'COMPLETED' || remote.status === 'FAILED') {
      job.phase = 'validating'; remote.nextPollAt = undefined;
      // Keep full task/credits envelope and the compatible result used by analysis.
      const raw = { ...data, success: remote.status === 'COMPLETED', result: data.response };
      await save({ ...event, data: raw });
      if (remote.status === 'FAILED') throw new Error(`Cloro remote task failed: ${data.response?.error?.code || data.response?.error?.message || 'UNKNOWN'}`);
      return observation(data,engine,country,time.now());
    }
    job.phase = remote.status === 'PROCESSING' ? 'remote_running' : 'remote_queued';
    if (time.now() >= Date.parse(remote.deadlineAt)) { await save(); throw new Error('Cloro remote task deadline exceeded; taskId已保留，可继续查询。'); }
    remote.nextPollAt = new Date(time.now() + backoffMs(Math.min(remote.pollCount, 4), time.random, 2000, 15_000)).toISOString();
    await save();
  }
}
