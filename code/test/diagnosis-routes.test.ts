import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syntheticProject } from '../src/citekeel/cases.js';
import { createRun, executeRun } from '../src/citekeel/engine.js';
import { createApp } from '../src/citekeel/server.js';
import { Store } from '../src/citekeel/storage.js';
import { diagnosisRoutes } from '../src/citekeel/diagnosis-routes.js';
import { initializeSamplingQueue } from '../src/citekeel/sampling-queue.js';
import { analyzeRun } from '../src/citekeel/analytics.js';
import { reportMarkdown, exportRun } from '../src/citekeel/report.js';
import type { AgentRun } from '../src/citekeel/types.js';

const routerAnswer = () => new Response(JSON.stringify({ id: 'router-generation', model: 'openai/gpt-6-luna',
  choices: [{ message: { content: 'A complete answer comparing robot platforms.' }, finish_reason: 'stop' }], usage: { cost: 0.001 } }));
const time = () => { let now = Date.now(); return {now:()=>now,sleep:async(ms:number)=>{now+=ms;},random:()=>0.5}; };

test('managed ChatGPT uses only OpenRouter, keeps route identity through pause/resume and discloses the protocol change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-api-route-')), store = new Store(root), original = globalThis.fetch;
  const app = await createApp(store);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  let sent = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(base)) return original(url, init);
    assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions', 'no Cloro ChatGPT probe or generation');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'openai/gpt-6-luna'); assert.equal(body.max_tokens, 6000);
    sent++; return routerAnswer();
  };
  const previousModel = process.env.OPENGEO_CHATGPT_API_MODEL;
  const previousKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENGEO_CHATGPT_API_MODEL;
  const until = async (id:string) => {
    for (let n=0;n<200;n++) {
      const run = await (await original(`${base}/api/runs/${id}`)).json() as AgentRun;
      if (!['queued','running'].includes(run.status)) return run;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    throw new Error('Run did not finish');
  };
  try {
    const project = syntheticProject(); project.queries = project.queries.slice(0,2);
    await store.save('projects', project);
    const response = await original(`${base}/api/runs`, { method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({projectId:project.id,mode:'live',diagnosis:true,targetIds:['chatgpt'],queryIds:project.queries.map(q=>q.id),apiKeys:{openrouter:'route-fixture'},requestKey:'chatgpt-route-fixture'}) });
    assert.equal(response.status,202); const {id}=await response.json();
    const run=await until(id);
    assert.equal(sent,2); assert.equal(run.audit?.analyzed,2);
    assert.equal(run.measurementTargets?.[0].provider,'openrouter');
    assert.equal(run.measurementTargets?.[0].apiFallback?.mode,'configured');
    assert.ok(run.samplingQueue!.jobs.every(j=>j.state==='succeeded' && !j.remote));
    assert.ok(run.samples.every(s=>s.fallback && s.origin==='api' && !s.observation && s.protocolId.includes('fallback=configured;from=cloro/chatgpt')));
    assert.ok(run.measurementUnits!.every(u=>u.attempts.length===1 && u.attempts[0].provider==='openrouter' && u.attempts[0].fallback));
    assert.equal(analyzeRun(run).quality.valid,2);
    assert.match(reportMarkdown(run),/模型 API 补测不代表 ChatGPT 网页表现/);
    assert.ok(!JSON.stringify(exportRun(run)).includes('route-fixture'));

    // Simulate an unsent job after explicit stop, then change the process default.
    // The already committed run must keep its original target/model/fingerprint.
    const pending=structuredClone(run), second=pending.samplingQueue!.jobs[1];
    second.state='paused';second.reason='用户停止了后续发送。';second.attempts=0;second.callId=undefined;second.sampleId=undefined;
    pending.samples=pending.samples.filter(s=>s.measurementUnitId!==second.unitId);
    pending.calls=pending.calls.filter(c=>c.receipt?.unitId!==second.unitId);
    Object.assign(pending.measurementUnits![1],{status:'planned',attempts:[],selectedSampleId:undefined,selectedChannel:undefined});
    await store.save('runs',pending);
    const fingerprint=second.fingerprint;
    process.env.OPENGEO_CHATGPT_API_MODEL='different-new-default';
    const settings=await original(`${base}/api/provider-session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({openrouter:'route-fixture'})});
    assert.equal(settings.status,200);
    const resumed=await original(`${base}/api/runs/${id}/resume`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(resumed.status,202);
    const finished=await until(id);
    assert.equal(sent,3,'successful first question is not resent');
    assert.equal(finished.measurementTargets?.[0].model,'openai/gpt-6-luna');
    assert.equal(finished.samplingQueue!.jobs[1].fingerprint,fingerprint);
    assert.equal(finished.audit?.analyzed,2);
  } finally {
    globalThis.fetch=original;
    if(previousModel===undefined)delete process.env.OPENGEO_CHATGPT_API_MODEL;else process.env.OPENGEO_CHATGPT_API_MODEL=previousModel;
    if(previousKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previousKey;
    await new Promise<void>(resolve=>app.server.close(()=>resolve())); store.close(); await rm(root,{recursive:true,force:true});
  }
});

test('preselected fallback retains explicit rejection retries, failure exclusion and caller-owned snapshot isolation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opengeo-api-route-retry-')),store=new Store(root),original=globalThis.fetch;
  const project=syntheticProject();project.queries=project.queries.slice(0,1);project.market='international';
  const targets=[diagnosisRoutes({})[0]!];const run=createRun(project,'live',project.goal,undefined,targets);
  targets[0].model='mutated-by-caller';
  assert.equal(run.measurementTargets![0].model,'openai/gpt-6-luna');let sent=0;
  globalThis.fetch=async(_url,init)=>{
    assert.equal(JSON.parse(String(init?.body)).model,'openai/gpt-6-luna');
    return ++sent===1 ? new Response('{"error":{"message":"rate limited"}}',{status:429}) : routerAnswer();
  };
  try {
    await executeRun(run,store,undefined,undefined,{targets,apiKeys:{openrouter:'fixture'},durableQueue:true,batch:true,queueClock:time()});
    assert.equal(sent,2);assert.equal(run.samplingQueue!.jobs[0].state,'succeeded');
    assert.equal(run.samples.length,2);assert.equal(run.samples.filter(s=>s.selected).length,1);
    assert.equal(run.measurementUnits![0].attempts[0].status,'failed');
    assert.equal(analyzeRun(run).quality.valid,1);assert.equal(analyzeRun(run).quality.planned,1);
    assert.ok(run.samples.every(s=>s.fallback));
    assert.ok(run.limitations.some(note=>note.includes('preselected API fallback')));
    assert.match(reportMarkdown(run),/Model API results do not measure the ChatGPT web interface/);
  }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});

test('old Cloro jobs resume the original remote task despite the new ChatGPT default',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opengeo-old-api-route-')),store=new Store(root),original=globalThis.fetch;
  const project=syntheticProject();project.queries=project.queries.slice(0,1);
  const targets=[{id:'chatgpt',platform:'ChatGPT',preferredChannel:'api' as const,provider:'cloro',model:'chatgpt'}];
  const run=createRun(project,'live',project.goal,undefined,targets);run.queries=structuredClone(project.queries);
  run.measurementUnits=run.queries.map(q=>({id:`${q.id}--chatgpt`,queryId:q.id,question:q.text,targetId:'chatgpt',platform:'ChatGPT',preferredChannel:'api',status:'planned',attempts:[]}));
  initializeSamplingQueue(run,true);run.samplingQueue!.jobs[0].remote={idempotencyKey:'original',taskId:'original-task',status:'PROCESSING',createdAt:run.createdAt,deadlineAt:new Date(Date.now()+60_000).toISOString(),pollCount:1,submissionAttempts:1};
  let gets=0;
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.cloro.dev/v1/async/task/original-task');assert.notEqual(init?.method,'POST');gets++;
    return new Response(JSON.stringify({task:{id:'original-task',status:'COMPLETED'},credits:{creditsCharged:1},response:{text:'Original Cloro answer.',sources:[]}}));
  };
  try{
    await executeRun(run,store,undefined,undefined,{targets,apiKeys:{cloro:'fixture'},durableQueue:true,queueClock:time()});
    assert.equal(gets,1);assert.equal(run.samples[0].model,'cloro/chatgpt');assert.equal(run.samples[0].fallback,false);
    assert.ok(!reportMarkdown(run).includes('preselected API fallback'));
    assert.equal(run.samplingQueue!.jobs[0].remote!.taskId,'original-task');
  }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});
