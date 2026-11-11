import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/workbench/storage.js';
import { ResearchService, type ResearchJob } from '../src/workbench/research-service.js';
import { researchWebsite } from '../src/workbench/onboarding.js';
import { createApp } from '../src/workbench/server.js';

const research = (input: { url: string; language?: string; country?: string }) => researchWebsite(input, { fetchPage: async url => ({url,contentType:'text/html',text:'<title>Northstar | Analytics</title><meta name="description" content="Analytics for independent software teams."><h1>Product analytics</h1>'}) });
async function fixture() { const root=await mkdtemp(join(tmpdir(),'opengeo-research-'));return {store:new Store(root),cleanup:()=>rm(root,{recursive:true,force:true})}; }
async function finished(service: ResearchService, id: string) {
  for(let i=0;i<100;i++){const job=await service.get(id);if(job && !['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,5));}throw Error('Research did not finish.');
}
test('research creates one source-backed workspace with stable selected prompt IDs, without answers or confirmed facts',async()=>{
  const {store,cleanup}=await fixture();const service=new ResearchService(store,research);
  try {
    const [a,b]=await Promise.all([service.start({url:'https://example.com',requestId:'research-repeat'}),service.start({url:'https://example.com',requestId:'research-repeat'})]);
    assert.equal(a.id,b.id);assert.equal((await store.list('researches')).length,1);
    const job=await finished(service,a.id);assert.equal(job.status,'completed');
    const ids=job.result!.prompts.slice(0,1).map(p=>p.id);
    const project=await service.accept(job.id,ids), again=await service.accept(job.id,ids);
    assert.equal(project.id,again.id);assert.equal((await store.list('projects')).length,1);
    assert.equal(project.queries[0]!.id,ids[0]);assert.equal(project.queries[0]!.status,'active');assert.ok(project.queries.some(q=>q.status==='suggested'));assert.equal(project.queries.filter(q=>q.status==='active').length,1);
    assert.equal(project.market,'international');assert.equal(project.language,'en');assert.equal(project.samples.length,0);
    assert.ok(project.claims.every(c=>c.status==='unconfirmed'));assert.ok(project.sources.length);
    await assert.rejects(service.accept(job.id,['foreign-prompt']),/selection/);
    await assert.rejects(service.start({url:'https://different.example',requestId:job.id}),/different research/);
  } finally {await cleanup();}
});
test('interrupted research is explicit after restart; unsafe URLs and out-of-scope markets are refused',async()=>{
  const {store,cleanup}=await fixture();const service=new ResearchService(store,research);
  try {
    await store.save<ResearchJob>('researches',{id:'research-stopped',status:'running',input:{url:'https://example.com',language:'en',country:'US'},createdAt:new Date().toISOString()});
    await service.initialize();assert.equal((await service.get('research-stopped'))?.status,'interrupted');
    await assert.rejects(service.accept('research-stopped',['x']),/Usable website research/);
    for(const url of ['http://127.0.0.1','file:///tmp/a','https://user:secret@example.com'])await assert.rejects(service.start({url}));
    await assert.rejects(service.start({url:'https://example.com',country:'FR'}),/MVP supports/);
  } finally {await cleanup();}
});
test('HTTP research route persists progress and accepts reviewed prompts, with local origin checks',async()=>{
  const {store,cleanup}=await fixture();const {server}=await createApp(store,{research,frontend:(_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<main>OpenGEO onboarding</main>');}});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const post=(path:string,data:unknown,origin?:string)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
  try {
    const frontend=await fetch(base+'/create-workspace');assert.equal(frontend.status,200);assert.match(await frontend.text(),/OpenGEO onboarding/);
    assert.equal((await fetch(base+'/create-workspace',{headers:{Origin:'https://evil.example'}})).status,403);
    const response=await post('/api/researches',{url:'https://example.com'});assert.equal(response.status,202);const started=await response.json() as ResearchJob;
    const job=await finished(new ResearchService(store),started.id);
    const accepted=await post(`/api/researches/${job.id}/accept`,{selectedPromptIds:job.result!.prompts.map(p=>p.id)});
    assert.equal(accepted.status,200);const project=await accepted.json();assert.equal(project.samples.length,0);
    const beforeIds=project.queries.map((q: {id:string})=>q.id);
    const firstImport=await post(`/api/projects/${project.id}/samples`,{samples:[{question:project.queries[0].text,answer:'Northstar offers product analytics.'}]});
    const imported=await firstImport.json();assert.deepEqual(imported.queries.map((q:{id:string})=>q.id),beforeIds);assert.equal(imported.samples[0].queryId,beforeIds[0]);
    const secondImport=await post(`/api/projects/${project.id}/samples`,{samples:[{question:project.queries[0].text,answer:'No conclusion.',collectionStatus:'failed'}]});
    const appended=await secondImport.json();assert.equal(appended.samples.length,2);assert.notEqual(appended.samples[0].id,appended.samples[1].id);
    const observed=await (await fetch(base+`/api/projects/${project.id}/observations`)).json();assert.equal(observed.observations.length,2);assert.equal(observed.excluded,1);

    assert.equal((await post('/api/researches',{url:'https://example.com'},'https://evil.example')).status,403);
    assert.equal((await fetch(base+'/api/researches/research-missing')).status,404);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await cleanup();}
});
test('optional model research keeps request credentials out of persisted jobs and retains validated fallbacks',async()=>{
  const {store,cleanup}=await fixture();let calls=0;
  const service=new ResearchService(store,research,async (result,config)=>{
    calls++;assert.equal(config.apiKey,'request-secret-never-persist');
    return {...result,enrichment:{id:'model-call-fixture',status:'failed',provider:config.provider,model:config.model,promptHash:'fixture',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),requestParameters:{temperature:0,maxTokens:2500,webSearch:false,responseFormat:'json_object',httpAttempts:1,maxProviderOperations:1},costStatus:'unknown',error:'Invalid structured output.'}};
  });
  try {
    const initial=await service.start({url:'https://example.com',modelConfig:{provider:'openrouter',model:'fixture-model',apiKey:'request-secret-never-persist'}});
    const job=await finished(service,initial.id);assert.equal(calls,1);assert.equal(job.status,'partial');
    assert.ok(job.result?.sources.length);assert.equal(job.result?.methodology,'source-derived-templates/v1');
    assert.ok(!JSON.stringify(job).includes('request-secret-never-persist'));
    assert.equal(job.input.model,'fixture-model');assert.equal(job.input.researchMode,'model');
  } finally {await cleanup();}
});
