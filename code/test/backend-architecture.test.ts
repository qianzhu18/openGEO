import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/workbench/server.js';
import { Store } from '../src/workbench/storage.js';
import { syntheticProject } from '../src/workbench/cases.js';
import type { AgentRun } from '../src/workbench/types.js';
import { createRun } from '../src/workbench/engine.js';
import { initializeSamplingQueue } from '../src/workbench/sampling-queue.js';

test('slow Cloro does not hold HTTP submission, reads, stop, or OpenRouter; waiting Cloro work is not sent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-architecture-'));
  const store = new Store(root);
  const original = globalThis.fetch;
  let releaseCloro!: () => void;
  const gate = new Promise<void>(resolve => { releaseCloro = resolve; });
  let cloroSent = 0;
  let routerSent = 0;
  let cloroFinished = false;
  const app = await createApp(store);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const read = async (id: string) => {
    const response = await original(`${base}/api/runs/${id}`, { signal: AbortSignal.timeout(4000) });
    assert.equal(response.status, 200);
    return await response.json() as AgentRun;
  };
  const until = async (id: string, predicate: (run: AgentRun) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const run = await read(id);
      if (predicate(run)) return run;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Expected backend state was not observed');
  };
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith(base)) return original(url, init);
    if (target === 'https://api.cloro.dev/v1/async/task') {
      cloroSent++;
      return new Response(JSON.stringify({success:true,task:{id:'task-held',status:'QUEUED'}}));
    }
    if (target === 'https://api.cloro.dev/v1/async/task/task-held') {
      await gate;
      cloroFinished = true;
      return new Response(JSON.stringify({task:{id:'task-held',status:'COMPLETED'},credits:{creditsCharged:1},response:{text:'A complete remote answer.',sources:[]}}));
    }
    assert.equal(target, 'https://openrouter.ai/api/v1/chat/completions');
    routerSent++;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'A complete model answer.' }, finish_reason: 'stop' }],
      usage: { cost: 0.001 },
    }));
  };
  try {
    const project = syntheticProject();
    project.queries = project.queries.slice(0, 1);
    await store.save('projects', project);
    const targets = [
      { id: 'chatgpt', platform: 'ChatGPT', provider: 'cloro', model: 'chatgpt', preferredChannel: 'api' },
      { id: 'gemini', platform: 'Gemini', provider: 'cloro', model: 'gemini', preferredChannel: 'api' },
      { id: 'deepseek', platform: 'DeepSeek', provider: 'openrouter', model: 'fixture', preferredChannel: 'api' },
    ];
    const response = await original(`${base}/api/runs`, {
      method: 'POST', signal: AbortSignal.timeout(4000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, mode: 'live', diagnosis: true, targets,
        queryIds: [project.queries[0]!.id], apiKeys: { cloro: 'fixture', openrouter: 'fixture' },
        requestKey: 'architecture-slow-remote' }),
    });
    assert.equal(response.status, 202);
    assert.equal(cloroFinished, false, 'submission returns while provider is still pending');
    const { id } = await response.json();
    const pending = await until(id, run => run.samplingQueue?.jobs.some(job => job.targetId === 'deepseek' && job.state === 'succeeded') === true);
    assert.equal(pending.status, 'running');
    assert.equal(routerSent, 1, 'OpenRouter completes independently of the Cloro shared slot');
    assert.equal(cloroSent, 1, 'only one remote Cloro request is in flight');
    assert.equal(cloroFinished, false);
    const waiting = pending.calls.find(call => call.provider === 'cloro' && call.model === 'gemini');
    assert.equal(waiting?.receipt?.dispatch, 'not_started', 'leased is not the same as sent');
    const stopped = await original(`${base}/api/runs/${id}/stop`, { method: 'POST', signal: AbortSignal.timeout(4000) });
    assert.equal(stopped.status, 202, 'stop endpoint remains responsive during a slow provider call');
    assert.equal(cloroFinished, false, 'stop does not cancel the upstream side effect');
    releaseCloro();
    const finished = await until(id, run => !['running', 'queued'].includes(run.status));
    assert.equal(cloroSent, 1, 'waiting Gemini is not dispatched after stop');
    assert.deepEqual(finished.samplingQueue!.jobs.map(job => job.state), ['succeeded', 'paused', 'succeeded']);
    assert.equal(finished.calls.find(call => call.model === 'gemini')?.receipt?.dispatch, 'not_started');
  } finally {
    releaseCloro();
    globalThis.fetch = original;
    await new Promise<void>(resolve => app.server.close(() => resolve()));
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('reconcile endpoint only queries the chosen remote task and never dispatches other queued work',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opengeo-reconcile-')),store=new Store(root),original=globalThis.fetch;
  const project=syntheticProject();project.queries=project.queries.slice(0,2);
  const targets=[{id:'chatgpt',platform:'ChatGPT',provider:'cloro',model:'chatgpt',preferredChannel:'api' as const}];
  const run=createRun(project,'live',project.goal,undefined,targets);run.queries=structuredClone(project.queries);run.status='needs_review';
  run.measurementUnits=run.queries.map(q=>({id:`${q.id}--chatgpt`,queryId:q.id,question:q.text,targetId:'chatgpt',platform:'ChatGPT',preferredChannel:'api',status:'planned',attempts:[]}));
  initializeSamplingQueue(run,true);const job=run.samplingQueue!.jobs[0];job.state='review_required';
  job.remote={idempotencyKey:'original-key',taskId:'original-task',status:'PROCESSING',createdAt:run.createdAt,deadlineAt:run.createdAt,submissionAttempts:1,pollCount:1};
  await store.save('projects',project);await store.save('runs',run);
  const app=await createApp(store);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;let posts=0,gets=0;
  const oldKey=process.env.CLORO_API_KEY;process.env.CLORO_API_KEY='reconcile-fixture-key';
  globalThis.fetch=async(url,init)=>{
    if(String(url).startsWith(base))return original(url,init);
    if(init?.method==='POST')posts++;else gets++;
    assert.equal(String(url),'https://api.cloro.dev/v1/async/task/original-task');
    return new Response(JSON.stringify({task:{id:'original-task',status:'COMPLETED'},credits:{creditsCharged:1},response:{text:'An original task answer.',sources:[]}}));
  };
  try{
    const response=await original(`${base}/api/runs/${run.id}/reconcile`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:job.id})});
    assert.equal(response.status,202);
    let current:AgentRun|null=null;
    for(let i=0;i<100;i++){current=await store.get<AgentRun>('runs',run.id);if(current && !['queued','running'].includes(current.status))break;await new Promise(r=>setTimeout(r,5));}
    assert.equal(current?.samplingQueue?.jobs[0].state,'succeeded');assert.equal(current?.samplingQueue?.jobs[1].state,'queued');
    assert.equal(posts,0);assert.equal(gets,1);assert.equal(current?.calls.length,1);
  }finally{
    globalThis.fetch=original;if(oldKey===undefined)delete process.env.CLORO_API_KEY;else process.env.CLORO_API_KEY=oldKey;
    await new Promise<void>(r=>app.server.close(()=>r()));store.close();await rm(root,{recursive:true,force:true});
  }
});
