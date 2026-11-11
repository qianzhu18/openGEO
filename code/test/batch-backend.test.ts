import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syntheticProject } from '../src/citekeel/cases.js';
import { createRun, executeRun } from '../src/citekeel/engine.js';
import { Store } from '../src/citekeel/storage.js';
import { initializeSamplingQueue, recoverSamplingQueue, type QueueClock } from '../src/citekeel/sampling-queue.js';
import { collectCloroAsync } from '../src/citekeel/cloro-async.js';
import { batchPolicy, backoffMs, ProviderSlots } from '../src/citekeel/batch-policy.js';
import { newReceipt } from '../src/citekeel/api-receipts.js';
import { retryDecision } from '../src/citekeel/sampling-queue.js';

function clock(): QueueClock {
  let now = Date.now();
  return { now: () => now, sleep: async ms => { now += ms; }, random: () => 0.5 };
}
const complete = (id: string) => new Response(JSON.stringify({ task: { id, status: 'COMPLETED', latencyMs: 100 },
  credits: { creditsCharged: 1 }, response: { text: 'A complete observed brand answer.', sources: [] } }));

test('250 frozen units finish under bounded concurrency despite transient 429, 503 and polling disconnects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-batch-load-')), store = new Store(root);
  const original = globalThis.fetch;
  const project = syntheticProject();
  project.queries = Array.from({ length: 50 }, (_, i) => ({ ...project.queries[0]!, id: `q${i}`, text: `Robot selection question ${i}` }));
  const targets = [
    ...['chatgpt','gemini'].map(model => ({id:model,platform:model,model,provider:'cloro',preferredChannel:'api' as const})),
    ...['one','two','three'].map(model => ({id:model,platform:model,model,provider:'openrouter',preferredChannel:'api' as const})),
  ];
  const attempts = new Map<string, number>(), tasks = new Map<string, string>(), polls = new Map<string, number>();
  let active = 0, peak = 0, submissions = 0, peakCloro = 0, cloroActive = 0;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u === 'https://api.cloro.dev/v1/async/task') {
      submissions++; cloroActive++; peakCloro = Math.max(peakCloro, cloroActive);
      const body = JSON.parse(String(init?.body));
      let id = tasks.get(body.idempotencyKey);
      if (!id) { id = `task-${tasks.size}`; tasks.set(body.idempotencyKey,id); }
      cloroActive--;
      return new Response(JSON.stringify({ success: true, task: {id,status:'QUEUED'} }));
    }
    if (u.startsWith('https://api.cloro.dev/v1/async/task/')) {
      const id = u.split('/').at(-1)!; const n = (polls.get(id) || 0) + 1; polls.set(id,n);
      if (n === 1 && Number(id.split('-')[1]) % 10 === 0) throw new Error('fetch failed: ECONNRESET');
      return complete(id);
    }
    assert.equal(u, 'https://openrouter.ai/api/v1/chat/completions');
    active++; peak = Math.max(peak,active);
    try {
      await new Promise(r => setImmediate(r));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.max_tokens,6000);
      const key = body.model + body.messages[0].content, n = (attempts.get(key)||0)+1; attempts.set(key,n);
      const q = Number(body.messages[0].content.split(' ').at(-1));
      if (n === 1 && q % 10 === 0) return new Response('{"error":{"message":"rate limited"}}', {status:429});
      if (n === 1 && q % 10 === 1) return new Response('{"error":{"message":"upstream unavailable"}}', {status:503});
      return new Response(JSON.stringify({choices:[{message:{content:'A complete selection answer.'},finish_reason:'stop'}],usage:{cost:0.001}}));
    } finally {active--;}
  };
  const started = Date.now();
  try {
    const run = await executeRun(createRun(project,'live',project.goal,undefined,targets),store,undefined,undefined,
      {targets,apiKeys:{cloro:'fixture',openrouter:'fixture'},durableQueue:true,batch:true,queueClock:clock()});
    assert.equal(run.samplingQueue?.version,'sampling-queue/v2');
    assert.equal(run.samplingQueue!.jobs.length,250);
    assert.equal(run.samplingQueue!.jobs.filter(j=>j.state==='succeeded').length,250);
    assert.equal(run.audit?.analyzed,250);
    assert.equal(tasks.size,100); assert.equal(submissions,100);
    assert.ok(peak<=2 && peak>=1); assert.equal(peakCloro,1);
    assert.equal(run.calls.length,280); // 250 logical units + 30 retained explicit rejections.
    assert.equal(new Set(run.samples.filter(s=>s.selected).map(s=>s.measurementUnitId)).size,250);
    const reopened = new Store(root);
    assert.equal((await reopened.get<any>('runs',run.id)).samplingQueue.jobs.filter((j:any)=>j.state==='succeeded').length,250);
    reopened.close();
    console.log(JSON.stringify({batchLoad:{units:250,succeeded:250,logicalCalls:run.calls.length,remoteTasks:tasks.size,peakOpenRouter:peak,ms:Date.now()-started}}));
  } finally { globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true}); }
});

test('lost submission response recovers same idempotency key via 409, and poll failure never creates another task', async () => {
  const original = globalThis.fetch;
  let posts=0, gets=0, key='',savedIdentity=false;
  const job:any={id:'job',state:'leased'};
  globalThis.fetch=async (_url,init)=>{
    if(init?.method==='POST') {
      posts++;const body=JSON.parse(String(init.body));
      assert.equal(savedIdentity,true,'external key must be committed before HTTP');
      if(posts===1){key=body.idempotencyKey;throw new Error('submission response lost');}
      assert.equal(body.idempotencyKey,key);
      return new Response(JSON.stringify({error:{code:'RESOURCE_ALREADY_EXISTS',details:{taskId:'existing'}}}),{status:409});
    }
    if(++gets===1) return new Response('{}',{status:503});
    return complete('existing');
  };
  try {
    const result=await collectCloroAsync({job,key:'fixture',engine:'chatgpt',prompt:'q',country:'US',clock:clock(),stopped:()=>false,
      save:async()=>{savedIdentity=Boolean(job.remote?.idempotencyKey);}});
    assert.ok(result.answer);assert.equal(posts,2);assert.equal(gets,2);assert.equal(job.remote.taskId,'existing');assert.equal(job.remote.creditsCharged,1);
  }finally{globalThis.fetch=original;}
});

test('reopened remote task is polled without resubmitting and terminal success keeps the original sample identity', async () => {
  const root=await mkdtemp(join(tmpdir(),'opengeo-remote-resume-')),store=new Store(root),original=globalThis.fetch;
  const project=syntheticProject();project.queries=project.queries.slice(0,1);
  const targets=[{id:'chatgpt',platform:'ChatGPT',provider:'cloro',model:'chatgpt',preferredChannel:'api' as const}];
  const run=createRun(project,'live',project.goal,undefined,targets);
  run.queries=structuredClone(project.queries);run.measurementUnits=[{id:`${run.queries[0].id}--chatgpt`,queryId:run.queries[0].id,question:'q',targetId:'chatgpt',platform:'ChatGPT',preferredChannel:'api',status:'planned',attempts:[]}];
  initializeSamplingQueue(run,true);
  const job=run.samplingQueue!.jobs[0];job.state='leased';job.attempts=3;job.leaseToken='old';
  job.remote={idempotencyKey:'stable-key',taskId:'saved-task',createdAt:new Date().toISOString(),deadlineAt:new Date(Date.now()+100000).toISOString(),status:'PROCESSING',pollCount:1,submissionAttempts:1};
  job.callId='saved-call';job.sampleId='saved-sample';
  run.calls=[{id:job.callId,purpose:'measurement',provider:'cloro',model:'chatgpt',status:'running',startedAt:run.createdAt,promptHash:'fixture',
    receipt:{...newReceipt({sampleId:job.sampleId,unitId:job.unitId,queryId:job.queryId,jobLease:'old'}),dispatch:'attempted'}}];
  run.samples=[{id:job.sampleId,queryId:job.queryId,question:'q',intent:run.queries[0].intent,branded:false,origin:'api',model:'cloro/chatgpt',answer:'',citations:[],collectionStatus:'failed',analysisStatus:'unknown',measurementUnitId:job.unitId,attemptId:'saved-attempt',selected:false,observedAt:run.createdAt,runGroup:run.id,protocolId:'remote-monitor/v2;transport=async'}];
  run.measurementUnits[0].attempts=[{id:'saved-attempt',unitId:job.unitId,targetId:job.targetId,platform:'ChatGPT',channel:'api',provider:'cloro',model:'chatgpt',status:'failed',sampleId:job.sampleId,fallback:false,startedAt:run.createdAt,finishedAt:run.createdAt}];
  await store.save('runs',run);store.close();
  const reopened=new Store(root);await reopened.initialize([]);const recovered=await reopened.get<any>('runs',run.id);
  assert.equal(recovered.status,'interrupted');assert.equal(recovered.samplingQueue.jobs[0].state,'queued');
  let posts=0,gets=0;
  globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')posts++;else gets++;return complete('saved-task');};
  try {
    await executeRun(recovered,reopened,undefined,undefined,{targets,apiKeys:{cloro:'fixture'},durableQueue:true,batch:true,queueClock:clock()});
    assert.equal(posts,0);assert.equal(gets,1);assert.equal(recovered.samplingQueue.jobs[0].state,'succeeded');
    assert.equal(recovered.samples.length,1);assert.equal(recovered.calls.length,1);
    assert.equal(recovered.samples[0].id,'saved-sample');assert.equal(recovered.calls[0].id,'saved-call');
    assert.equal(recovered.samplingQueue.jobs[0].attempts,3);assert.equal(recovered.samplingQueue.jobs[0].reconciliations,1);
  }finally{globalThis.fetch=original;reopened.close();await rm(root,{recursive:true,force:true});}
});

test('provider slots execute two OpenRouter and one Cloro tasks while queuing additional work',async()=>{
  const slots=new ProviderSlots(batchPolicy().concurrency);
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const active:Record<string,number>={},peak:Record<string,number>={};
  const run=(provider:string)=>slots.run(provider,async()=>{active[provider]=(active[provider]||0)+1;peak[provider]=Math.max(peak[provider]||0,active[provider]);await gate;active[provider]--;});
  const work=[run('openrouter'),run('openrouter'),run('openrouter'),run('cloro'),run('cloro')];
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(active,{openrouter:2,cloro:1});release();await Promise.all(work);
  assert.deepEqual(peak,{openrouter:2,cloro:1});assert.deepEqual(active,{openrouter:0,cloro:0});
});

test('retained terminal Cloro response is adopted after restart without any network operation',async()=>{
  const original=globalThis.fetch;let requests=0;
  const raw=await complete('retained').json();
  const job:any={remote:{idempotencyKey:'stable',taskId:'retained',status:'COMPLETED',createdAt:'2020-01-01',deadlineAt:'2020-01-02',pollCount:1,submissionAttempts:1}};
  globalThis.fetch=async()=>{requests++;throw new Error('must not request');};
  try{
    const result=await collectCloroAsync({job,key:'fixture',engine:'chatgpt',prompt:'q',country:'US',stopped:()=>false,save:async()=>{},retainedResponse:raw});
    assert.equal(result.answer,'A complete observed brand answer.');assert.equal(requests,0);
    const project=syntheticProject(),run=createRun(project,'live');run.calls=[];run.samples=[];
    run.samplingQueue={version:'sampling-queue/v2',policy:batchPolicy(),stopRequested:false,jobs:[{...job,id:'j',unitId:'u',queryId:'q',targetId:'chatgpt',fingerprint:'f',state:'leased',attempts:1,maxAttempts:3,redrives:0,callId:'c',leaseToken:'lease'}]};
    run.calls=[{id:'c',purpose:'measurement',provider:'cloro',model:'chatgpt',status:'running',startedAt:run.createdAt,promptHash:'h',response:raw,receipt:newReceipt({unitId:'u',jobLease:'lease'})}];
    recoverSamplingQueue(run);assert.equal(run.samplingQueue.jobs[0].state,'queued');assert.equal(run.samplingQueue.jobs[0].callId,'c');
  }finally{globalThis.fetch=original;}
});

test('expired submission keys never POST again; missing remote task never falls back to a new task',async()=>{
  const original=globalThis.fetch;let posts=0,gets=0;
  globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')posts++;else gets++;return new Response('{}',{status:404});};
  const options={key:'fixture',engine:'chatgpt',prompt:'q',country:'US',stopped:()=>false,save:async()=>{}};
  const remote={idempotencyKey:'old-key',createdAt:new Date(Date.now()-25*3600000).toISOString(),deadlineAt:new Date(Date.now()+100000).toISOString(),submissionAttempts:1,pollCount:0};
  try{
    await assert.rejects(collectCloroAsync({...options,job:{remote:{...remote}} as any}),/恢复窗口/);
    await assert.rejects(collectCloroAsync({...options,job:{remote:{...remote,taskId:'missing'}} as any}),/HTTP 404/);
    assert.equal(posts,0);assert.equal(gets,1);
  }finally{globalThis.fetch=original;}
});

test('polling honors full Retry-After and an HTTP error cannot inject a successful task identity',async()=>{
  const original=globalThis.fetch,time=clock(),started=time.now();let posts=0,gets=0;
  const job:any={};
  globalThis.fetch=async(_url,init)=>{
    if(init?.method==='POST') {posts++;return posts===1?new Response(JSON.stringify({task:{id:'bad'}}),{status:503})
      :new Response(JSON.stringify({task:{id:'good',status:'QUEUED'}}));}
    if(++gets===1)return new Response('{}',{status:429,headers:{'retry-after':'150'}});
    assert.ok(time.now()-started>=150000);return complete('good');
  };
  try{
    await collectCloroAsync({job,key:'fixture',engine:'chatgpt',prompt:'q',country:'US',clock:time,stopped:()=>false,save:async()=>{}});
    assert.equal(posts,2);assert.equal(gets,2);assert.equal(job.remote.taskId,'good');
    const call:any={answer:'',costUsd:.001,receipt:{dispatch:'response_received',responseRetained:true,httpStatus:503,failure:{code:'upstream_unavailable'}}};
    assert.notEqual(retryDecision(call,1,0,()=>0,true).state,'retry_wait');
  }finally{globalThis.fetch=original;}
});

test('authentication circuit stops jobs already waiting for the same provider, without sending them',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opengeo-batch-auth-')),store=new Store(root),original=globalThis.fetch;
  const project=syntheticProject();project.queries=project.queries.slice(0,1);
  const targets=['one','two','three'].map(model=>({id:model,platform:model,provider:'openrouter',model,preferredChannel:'api' as const}));let sent=0;
  globalThis.fetch=async()=>{sent++;return new Response('{"error":{"message":"Unauthorized"}}',{status:401});};
  try{
    const run=await executeRun(createRun(project,'live',project.goal,undefined,targets),store,undefined,undefined,{targets,apiKeys:{openrouter:'fixture'},durableQueue:true,batch:true});
    assert.ok(sent<=2);assert.equal(run.samplingQueue!.blockedProviders?.openrouter,'authentication');
    assert.equal(run.calls.find(c=>c.model==='three')?.receipt?.dispatch,'not_started');
    assert.equal(run.samplingQueue!.jobs.find(j=>j.targetId==='three')?.state,'paused');
  }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});

test('one rejected answer does not suppress later batch questions; jitter is exponential and bounded', async () => {
  const root=await mkdtemp(join(tmpdir(),'opengeo-isolate-')),store=new Store(root),original=globalThis.fetch;
  const project=syntheticProject();project.queries=project.queries.slice(0,3);
  const targets=[{id:'one',platform:'One',provider:'openrouter',model:'fixture',preferredChannel:'api' as const}];let sent=0;
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:++sent===1?'':'Complete answer.'},finish_reason:'stop'}],usage:{cost:0.001}}));
  try {
    const run=await executeRun(createRun(project,'live',project.goal,undefined,targets),store,undefined,undefined,{targets,apiKeys:{openrouter:'fixture'},durableQueue:true,batch:true});
    assert.equal(sent,3);assert.deepEqual(run.samplingQueue!.jobs.map(j=>j.state),['review_required','succeeded','succeeded']);
    assert.ok(backoffMs(2,()=>0)>backoffMs(1,()=>0));assert.ok(backoffMs(2,()=>0.9)>backoffMs(2,()=>0));
    assert.ok(backoffMs(100,()=>0.99)<=30000);assert.equal(batchPolicy().concurrency.openrouter,2);
  }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});

test('exhausted remote polling is not wrapped in another generation retry loop',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opengeo-poll-bound-')),store=new Store(root),original=globalThis.fetch;
  const project=syntheticProject();project.queries=project.queries.slice(0,2);
  const targets=[{id:'chatgpt',platform:'ChatGPT',provider:'cloro',model:'chatgpt',preferredChannel:'api' as const}];let posts=0,gets=0;
  globalThis.fetch=async(_url,init)=>{
    if(init?.method==='POST'){posts++;return new Response('{"task":{"id":"pending","status":"QUEUED"}}');}
    if(++gets>6)throw new Error('poll retry limit violated');
    return new Response('{}',{status:503});
  };
  try{
    const run=await executeRun(createRun(project,'live',project.goal,undefined,targets),store,undefined,undefined,{targets,apiKeys:{cloro:'fixture'},durableQueue:true,batch:true,queueClock:clock()});
    assert.equal(posts,1);assert.equal(gets,6);assert.equal(run.calls.length,1);
    assert.deepEqual(run.samplingQueue!.jobs.map(j=>j.state),['review_required','paused']);
  }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});
