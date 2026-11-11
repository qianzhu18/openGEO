import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRun,executeRun} from '../src/citekeel/engine.js';
import {syntheticProject} from '../src/citekeel/cases.js';
import {Store} from '../src/citekeel/storage.js';
import {initializeSamplingQueue,recoverSamplingQueue,redriveJobs,retryDecision,type QueueClock} from '../src/citekeel/sampling-queue.js';
import {newReceipt,diagnoseApiFailure} from '../src/citekeel/api-receipts.js';
import {retryAfterMs} from '../vendor/niubigeo/src/providers/http.js';
import type {ModelCall} from '../src/citekeel/types.js';
async function fixture(count=2) {
 const root=await mkdtemp(join(tmpdir(),'opengeo-queue-')),store=new Store(root),project=syntheticProject();project.queries=project.queries.slice(0,count);
 const targets=[{id:'fixture',platform:'Fixture',provider:'cloro',model:'chatgpt',preferredChannel:'api' as const}];
 const run=createRun(project,'live',project.goal,undefined,targets);let now=Date.now();
 const clock:QueueClock={now:()=>now,sleep:async ms=>{now+=ms;},random:()=>0};
 const runtime={targets,apiKeys:{cloro:'fixture-key'},durableQueue:true,queueClock:clock};
 return {root,store,project,targets,run,runtime,cleanup:async()=>{store.close();await rm(root,{recursive:true,force:true});}};
}
function call(status=429):ModelCall {return {id:'call',purpose:'measurement',provider:'cloro',model:'chatgpt',promptHash:'x',startedAt:'',status:'failed',receipt:{...newReceipt(),dispatch:'response_received',responseRetained:true,httpStatus:status,failure:diagnoseApiFailure({status})}};}
const success=()=>new Response(JSON.stringify({success:true,result:{text:'A complete observed answer.',sources:[]}}));
test('429 bounded retry keeps attempts but adopts only one answer; resume never resends success',async()=>{
 const f=await fixture(1),original=globalThis.fetch;let sent=0;
 globalThis.fetch=async()=>++sent===1?new Response('{"error":{"message":"rate limit"}}',{status:429,headers:{'retry-after':'20'}}):success();
 try {
  await executeRun(f.run,f.store,undefined,undefined,f.runtime);
  const job=f.run.samplingQueue!.jobs[0];assert.equal(job.state,'succeeded');assert.equal(job.attempts,2);assert.equal(sent,2);
  assert.equal(f.run.measurementUnits![0].attempts.length,2);assert.equal(f.run.samples.filter(s=>s.selected).length,1);assert.equal(f.run.audit?.analyzed,1);
  assert.equal(f.run.calls[0].receipt?.retryAfterMs,20000);
  await executeRun(f.run,f.store,undefined,undefined,f.runtime);assert.equal(sent,2);
  await unlink(join(f.root,'runs',`${f.run.id}.json`));
  const reopened=new Store(f.root);assert.equal((await reopened.get<any>('runs',f.run.id)).samplingQueue.jobs[0].state,'succeeded');reopened.close();
 }finally{globalThis.fetch=original;await f.cleanup();}
});
test('exhausted rate limit becomes dead letter and later questions pause without fake calls',async()=>{
 const f=await fixture(),original=globalThis.fetch;let sent=0;globalThis.fetch=async()=>{sent++;return new Response('{}',{status:429});};
 try{await executeRun(f.run,f.store,undefined,undefined,f.runtime);assert.equal(sent,3);assert.deepEqual(f.run.samplingQueue!.jobs.map(j=>j.state),['dead_letter','paused']);assert.equal(f.run.samples.length,3);assert.equal(f.run.audit?.analyzed,0);
 assert.throws(()=>redriveJobs(f.run,[f.run.samplingQueue!.jobs[0].id],false),/额外费用/);
 redriveJobs(f.run,[f.run.samplingQueue!.jobs[0].id],true);globalThis.fetch=async()=>{sent++;return success();};
 await executeRun(f.run,f.store,undefined,undefined,f.runtime);assert.equal(sent,4);assert.equal(f.run.samplingQueue!.jobs[0].state,'succeeded');assert.equal(f.run.samples.length,4);
 }finally{globalThis.fetch=original;await f.cleanup();}
});
test('uncertain timeout does not retry and restart never automatically dispatches',async()=>{
 const f=await fixture(),original=globalThis.fetch;let sent=0;globalThis.fetch=async()=>{sent++;throw new Error('timeout');};
 try{await executeRun(f.run,f.store,undefined,undefined,f.runtime);assert.equal(sent,1);assert.deepEqual(f.run.samplingQueue!.jobs.map(j=>j.state),['review_required','paused']);
 f.run.status='running';await f.store.save('runs',f.run);await f.store.initialize([]);assert.equal(sent,1);assert.equal((await f.store.get<any>('runs',f.run.id)).status,'interrupted');
 }finally{globalThis.fetch=original;await f.cleanup();}
});
test('retry policy holds partial, empty, charged and long Retry-After requests',()=>{
 const c=call();assert.equal(retryDecision(c,1,0,()=>0).state,'retry_wait');assert.equal(retryDecision(c,3,0).state,'dead_letter');
 c.receipt!.retryAfterMs=400000;assert.equal(retryDecision(c,1,0).state,'dead_letter');delete c.receipt!.retryAfterMs;
 c.costUsd=.01;assert.notEqual(retryDecision(c,1,0).state,'retry_wait');delete c.costUsd;
 c.receipt!.dispatch='attempted';assert.equal(retryDecision(c,1,0).state,'review_required');
 assert.equal(retryAfterMs('60'),60000);assert.equal(retryAfterMs('bad'),undefined);assert.equal(retryAfterMs(new Date(30000).toUTCString(),0),30000);
});
test('crash recovery uses current lease, recovers committed success and rolls back protocol conflicts',async()=>{
 const f=await fixture(1);
 try{
 f.run.queries=structuredClone(f.project.queries);f.run.measurementUnits=[{id:`${f.run.queries[0].id}--fixture`,queryId:f.run.queries[0].id,question:'q',targetId:'fixture',platform:'Fixture',preferredChannel:'api',status:'planned',attempts:[]}];initializeSamplingQueue(f.run);
 const job=f.run.samplingQueue!.jobs[0];job.state='leased';job.leaseToken='new';
 const c=call();c.receipt!.unitId=job.unitId;c.receipt!.jobLease='old';f.run.calls=[c];recoverSamplingQueue(f.run);assert.equal(job.state,'queued');
 job.state='leased';job.leaseToken='new';c.receipt!.jobLease='new';recoverSamplingQueue(f.run);assert.equal(job.state,'review_required');
 await f.store.save('runs',f.run);job.fingerprint='changed';f.run.review='not committed';await assert.rejects(f.store.save('runs',f.run),/协议/);
 assert.notEqual((await f.store.get<any>('runs',f.run.id)).review,'not committed');
 f.store.acquireWorker('one');const other=new Store(f.root);assert.throws(()=>other.acquireWorker('two'),/已有本地服务/);other.close();f.store.releaseWorker('one');
 }finally{await f.cleanup();}
});
test('stop persists in-flight completion and pauses later jobs',async()=>{
 const f=await fixture(),original=globalThis.fetch;let sent=0;globalThis.fetch=async()=>{sent++;f.run.samplingQueue!.stopRequested=true;return success();};
 try{await executeRun(f.run,f.store,undefined,undefined,f.runtime);assert.equal(sent,1);assert.deepEqual(f.run.samplingQueue!.jobs.map(j=>j.state),['succeeded','paused']);}finally{globalThis.fetch=original;await f.cleanup();}
});
test('API submission deduplicates across restart and rejects a changed request',async()=>{
 const f=await fixture(1),original=globalThis.fetch;const {createApp}=await import('../src/citekeel/server.js');
 const app=await createApp(f.store);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;let sent=0;
 globalThis.fetch=async(url,init)=>String(url).startsWith(base)?original(url,init):init?.method==='POST'
  ?(sent++,new Response(JSON.stringify({success:true,task:{id:'task-api',status:'QUEUED'}})))
  :new Response(JSON.stringify({task:{id:'task-api',status:'COMPLETED'},credits:{creditsCharged:1},response:{text:'A complete observed answer.',sources:[]}}));
 const payload={projectId:f.project.id,mode:'live',diagnosis:true,targets:f.targets,queryIds:[f.project.queries[0].id],apiKeys:{cloro:'fixture-key'},requestKey:'queue-request-123'};
 const post=(data:object)=>fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 try{
 await app.store.save('projects',f.project);
 const first=await post(payload);assert.equal(first.status,202,await first.clone().text());const id=(await first.json()).id;
 const duplicate=await post(payload);assert.equal(duplicate.status,202);assert.equal((await duplicate.json()).id,id);
 assert.equal((await post({...payload,goal:'different'})).status,409);
 for(let i=0;i<100;i++){const run=await app.store.get<any>('runs',id);if(!['running','queued'].includes(run.status))break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(sent,1);assert.equal((await app.store.get<any>('runs',id)).samplingQueue.jobs[0].state,'succeeded');
 await new Promise<void>(r=>app.server.close(()=>r()));
 const reopened=new Store(f.root);assert.equal(reopened.submission(f.project.id,payload.requestKey)?.run_id,id);reopened.close();
 }finally{globalThis.fetch=original;if(app.server.listening)await new Promise<void>(r=>app.server.close(()=>r()));await f.cleanup();}
});
test('OpenRouter success with unknown cost pauses later work; empty and truncated answers never auto retry',async()=>{
 const original=globalThis.fetch;
 for(const mode of ['unknown-cost','empty','partial']) {
  const f=await fixture();f.targets[0].provider='openrouter';f.targets[0].model='fixture';f.run.measurementTargets=f.targets;let sent=0;
  globalThis.fetch=async()=>{sent++;return new Response(JSON.stringify({choices:[{message:{content:mode==='empty'?'':'Observed brand answer.'},finish_reason:mode==='partial'?'length':'stop'}],...(mode==='unknown-cost'?{}:{usage:{cost:0.001}})}));};
  try{await executeRun(f.run,f.store,undefined,undefined,{...f.runtime,apiKeys:{openrouter:'fixture'}});assert.equal(sent,1);assert.equal(f.run.samplingQueue!.jobs[1].state,'paused');assert.equal(f.run.samplingQueue!.jobs[0].state,mode==='unknown-cost'?'succeeded':'review_required');}
  finally{await f.cleanup();}
 }
 globalThis.fetch=original;
});
test('stop blocks a Cloro request already waiting in the shared local slot',async()=>{
 const f=await fixture(1),original=globalThis.fetch;let sent=0;
 f.targets.push({...f.targets[0],id:'gemini',model:'gemini'});f.run.measurementTargets=f.targets;
 globalThis.fetch=async()=>{sent++;f.run.samplingQueue!.stopRequested=true;return success();};
 try{await executeRun(f.run,f.store,undefined,undefined,f.runtime);assert.equal(sent,1);assert.deepEqual(f.run.samplingQueue!.jobs.map(j=>j.state),['succeeded','paused']);assert.equal(f.run.calls[1].receipt?.dispatch,'not_started');}
 finally{globalThis.fetch=original;await f.cleanup();}
});
