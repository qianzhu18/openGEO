import { createHash, randomUUID } from 'node:crypto';
import type { AgentRun, MeasurementTarget, ModelCall } from './types.js';
import type { Store } from './storage.js';

export type JobState = 'queued' | 'leased' | 'retry_wait' | 'succeeded' | 'dead_letter' | 'review_required' | 'paused';
export interface SamplingJob {
  id: string; unitId: string; queryId: string; targetId: string; fingerprint: string;
  state: JobState; attempts: number; maxAttempts: number; redrives: number; roundStart?: number;
  nextAttemptAt?: string; leaseToken?: string; leasedAt?: string; finishedAt?: string;
  sampleId?: string; callId?: string; reason?: string; failureCode?: string;
}
export interface SamplingQueue { version: 'sampling-queue/v1'; jobs: SamplingJob[]; stopRequested: boolean }
export function initializeSamplingQueue(run: AgentRun) {
  if (run.samplingQueue) return;
  run.samplingQueue = { version: 'sampling-queue/v1', stopRequested: false, jobs: (run.measurementUnits || []).map(unit => {
    const query = run.queries.find(q => q.id === unit.queryId)!;
    const target = run.measurementTargets?.find(t => t.id === unit.targetId)!;
    const fingerprint = createHash('sha256').update(JSON.stringify([run.id,run.projectId,run.spaceId,run.projectSnapshot.queryVersion,query,target,run.projectSnapshot.country,'measurement-budget/v1:2500'])).digest('hex');
    return { id: fingerprint.slice(0,40), fingerprint, unitId: unit.id, queryId: unit.queryId, targetId: unit.targetId,
      state: 'queued', attempts: 0, maxAttempts: 3, redrives: 0 };
  }) };
}
export function retryDecision(call: ModelCall | undefined, attempts: number, now: number, random = Math.random) {
  const r = call?.receipt;
  const code = r?.failure?.code || 'unknown';
  // Never blindly repeat a possibly completed/charged generation, timeout or partial answer.
  const rejected = r?.dispatch === 'response_received' && r.responseRetained && !call?.answer?.trim() && !r.generationId && !(typeof call?.costUsd === 'number' && call.costUsd > 0);
  const retryable = rejected && r?.httpStatus === 429 && code === 'rate_limited';
  const backoff = Math.min(60_000, 15_000 * 2 ** Math.max(0,attempts-1)) + Math.floor(random()*1000);
  const delay = Math.max(backoff, r?.retryAfterMs || 0);
  if (retryable && attempts < 3 && delay <= 300_000) return {state:'retry_wait' as const, code, nextAttemptAt:new Date(now+delay).toISOString(), reason:'服务商明确返回 429 拒绝，有限退避重试；仍不能保证上游不收费。'};
  const uncertain = !r || r.dispatch === 'attempted' || r.dispatch === 'not_started' || ['timeout','network','empty_answer','truncated_answer','unknown','tool_unfinished'].includes(code);
  return {state:uncertain ? 'review_required' as const : 'dead_letter' as const, code,
    reason: retryable ? '限流重试耗尽或 Retry-After 超出本地等待上限。' : '不自动重发：请核对回执、费用或修改请求配置。'};
}
export function recoverSamplingQueue(run: AgentRun) {
  for (const job of run.samplingQueue?.jobs || []) if (job.state === 'leased') {
    const call = [...run.calls].reverse().find(c=>c.receipt?.unitId===job.unitId && c.receipt?.jobLease===job.leaseToken);
    const sample=run.samples.find(s=>s.id===call?.receipt?.sampleId);
    job.state = sample?.collectionStatus==='completed' && sample.analysisStatus==='completed' ? 'succeeded' : call?.receipt?.dispatch === 'not_started' || !call ? 'queued' : 'review_required';
    job.reason = job.state==='succeeded' ? '恢复已落盘的成功结果，未重新发送。' : job.state === 'queued' ? '进程中断，尚无发送记录；等待显式继续。' : '进程在请求期间中断，可能已经发送或收费；禁止自动重发。';
    job.callId = call?.id; job.leaseToken = undefined;
  }
}
export function redriveJobs(run: AgentRun, ids: string[], acknowledgeCost: boolean) {
  const jobs = run.samplingQueue?.jobs;
  if (!jobs || !ids.length || new Set(ids).size !== ids.length) throw new Error('请选择有效且不重复的任务');
  const selected = ids.map(id=>jobs.find(j=>j.id===id));
  if (selected.some(j=>!j || !['dead_letter','review_required','paused'].includes(j.state) || j.redrives>=1 || j.attempts>=6)) throw new Error('任务不可重投或已达到一次人工重投上限');
  if (!acknowledgeCost) throw new Error('请确认重投可能产生额外费用，且无法保证外部请求只执行一次');
  for (const job of selected as SamplingJob[]) { job.state='queued';job.redrives++;job.roundStart=job.attempts;job.maxAttempts=Math.min(6,job.attempts+3);job.nextAttemptAt=undefined;job.finishedAt=undefined;job.reason='用户确认费用风险后人工重投，保留旧尝试。'; }
}
export interface QueueClock { now:()=>number; sleep:(ms:number)=>Promise<void>; random:()=>number }
const clock: QueueClock = {now:Date.now,sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),random:Math.random};
export async function drainTarget(run: AgentRun, store: Store, target: MeasurementTarget,
  collect:(queryId:string,retry:boolean)=>Promise<{sample:{id:string};completed:boolean}>, time:QueueClock=clock) {
  const queue=run.samplingQueue!;
  for(const job of queue.jobs.filter(j=>j.targetId===target.id)) {
    if (['succeeded','dead_letter','review_required','paused'].includes(job.state)) continue;
    while (['queued','retry_wait'].includes(job.state)) {
      if (queue.stopRequested) { job.state='paused';job.reason='用户停止了后续发送。';await store.save('runs',run);break; }
      if(job.nextAttemptAt && Date.parse(job.nextAttemptAt)>time.now()) {await time.sleep(Math.min(1000,Date.parse(job.nextAttemptAt)-time.now()));continue;}
      if(job.attempts>=job.maxAttempts) {job.state='review_required';job.reason='领取次数已达上限（可能包含中断），请复核后再人工重投。';await store.save('runs',run);break;}
      if(run.calls.filter(c=>c.purpose==='measurement' && c.receipt?.dispatch!=='not_started').length>=64) {job.state='dead_letter';job.reason='达到本轮64次采样请求保护上限。';await store.save('runs',run);break;}
      if(target.provider==='cloro' && run.calls.filter(c=>c.provider==='cloro' && c.model===target.model && c.receipt?.dispatch!=='not_started').length>=10) {
        job.state='dead_letter';job.reason='达到本目标每轮10次Cloro监测上限（含重试和恢复）。';await store.save('runs',run);break;
      }
      job.state='leased';job.leaseToken=randomUUID();job.leasedAt=new Date(time.now()).toISOString();job.attempts++;job.nextAttemptAt=undefined;
      // Claim is committed before any provider side effect. Persistence errors abort the worker.
      await store.save('runs',run);
      const before=new Set(run.calls.map(c=>c.id));
      const result=await collect(job.queryId,job.attempts>1);
      const call=[...run.calls].reverse().find(c=>!before.has(c.id) && c.receipt?.unitId===job.unitId);
      job.sampleId=result.sample.id;job.callId=call?.id;job.leaseToken=undefined;
      if(result.completed) {
        job.state='succeeded';job.finishedAt=new Date(time.now()).toISOString();job.reason=undefined;job.failureCode=undefined;
        if(target.provider!=='cloro' && call?.receipt?.costStatus==='unknown') {
          for(const later of queue.jobs.filter(j=>j.targetId===target.id && j.state==='queued')) {later.state='paused';later.reason='前次回答有效但费用未知，先复核再重投后续任务。';}
        }
      }
      else if (queue.stopRequested && call?.receipt?.dispatch==='not_started') {job.state='paused';job.reason='用户停止了后续发送。';}
      else {
        const decision=retryDecision(call,job.attempts-(job.roundStart || 0),time.now(),time.random);
        job.state=decision.state;job.failureCode=decision.code;job.reason=decision.reason;job.nextAttemptAt=decision.nextAttemptAt;
        if(job.attempts>=job.maxAttempts && job.state==='retry_wait') {job.state='dead_letter';job.nextAttemptAt=undefined;job.reason='已达到有限重试上限。';}
        if(job.state!=='retry_wait') {
          job.finishedAt=new Date(time.now()).toISOString();
          // Open the per-target circuit. Other targets can continue; later work is paused, not fabricated failures.
          for(const later of queue.jobs.filter(j=>j.targetId===target.id && j.state==='queued')) {later.state='paused';later.reason=`入口暂停：${decision.code}，先复核失败任务。`;}
        }
      }
      await store.save('runs',run); // queue state + adopted result share one SQLite transaction
    }
  }
}
