import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecordingService, listObservedFanouts, type RecordingFetcher } from '../src/citekeel/recordings.js';
import { Store } from '../src/citekeel/storage.js';
import { createApp } from '../src/citekeel/server.js';
import type { Project, Sample } from '../src/citekeel/types.js';

function project(): Project { const now=new Date().toISOString();return {id:'project-recording-test',name:'Acme',brand:'Acme',aliases:[],domain:'acme.example',industry:'',description:'',origin:'manual',market:'international',language:'en',country:'US',goal:'Diagnose',sources:[],claims:[],queries:[{id:'original-prompt',text:'What does Acme offer?',intent:'brand_awareness',branded:true,origin:'manual',status:'active'}],queryVersion:1,samples:[],createdAt:now,updatedAt:now}; }
async function fixture() {const root=await mkdtemp(join(tmpdir(),'opengeo-recordings-'));const store=new Store(root);await store.save('projects',project());return {store,service:new RecordingService(store),cleanup:()=>rm(root,{recursive:true,force:true})};}
const html='<title>Buyer research</title><meta name="description" content="Evidence for product analytics buyers."><h1>Product analytics</h1><h2>Session replay</h2><script>do-not-retain-script</script><p>Review instrumentation and privacy requirements.</p>';
const fetcher:RecordingFetcher=async url=>({url,text:html,contentType:'text/html'});

test('recording URLs are canonical, project-scoped and independently collected source inputs',async()=>{
 const {store,service,cleanup}=await fixture();try{
  const [a,b]=await Promise.all([service.add('project-recording-test',{url:'https://docs.other.example/buyers#intro'}),service.add('project-recording-test',{url:'https://docs.other.example/buyers#details'})]);
  assert.equal(a.id,b.id);assert.equal((await service.list('project-recording-test')).length,1);assert.equal(a.url,'https://docs.other.example/buyers');
  const collected=await service.collect('project-recording-test',a.id,fetcher);assert.equal(collected?.status,'collected');assert.ok(collected?.sourceId);assert.equal(collected?.title,'Buyer research');assert.ok(!collected?.text?.includes('do-not-retain-script'));
  const p=await store.get<Project>('projects','project-recording-test');assert.equal(p?.sources.length,1);assert.equal(p?.samples.length,0);assert.equal(p?.queries.length,1);
 }finally{await cleanup();}
});

test('unsafe and credential-bearing URLs are rejected without persisting them',async()=>{
 const {service,cleanup}=await fixture();try{
  for(const url of ['file:///etc/passwd','http://127.0.0.1','http://localhost','http://[::1]','javascript:alert(1)','https://user:password@example.com','https://secret.internal'])await assert.rejects(service.add('project-recording-test',{url}));
  assert.deepEqual(await service.list('project-recording-test'),[]);
 }finally{await cleanup();}
});

test('failed collection keeps a safe terminal state and does not create sources or suggestions',async()=>{
 const {store,service,cleanup}=await fixture();try{
  const a=await service.add('project-recording-test',{url:'https://docs.example/guide'});
  const failed=await service.collect('project-recording-test',a.id,async()=>{throw Error('provider-secret-should-not-persist');});assert.equal(failed?.status,'failed');assert.ok(!JSON.stringify(failed).includes('provider-secret'));
  await assert.rejects(service.proposePrompts('project-recording-test',[a.id]),/Collect each/);
  const privateRedirect=await service.collect('project-recording-test',a.id,async()=>({url:'http://127.0.0.1',text:html,contentType:'text/html'}));assert.equal(privateRedirect?.status,'failed');assert.equal((await store.get<Project>('projects','project-recording-test'))?.sources.length,0);
 }finally{await cleanup();}
});

test('recording-derived suggestions are stable, source-backed, idempotent and never auto-activated',async()=>{
 const {store,service,cleanup}=await fixture();try{
  const a=await service.add('project-recording-test',{url:'https://docs.example/guide'});await service.collect('project-recording-test',a.id,fetcher);
  const first=await service.proposePrompts('project-recording-test',[a.id]);assert.equal(first.added,2);assert.ok(first.prompts.every(p=>p.status==='suggested'&&p.sourceIds?.length===1&&p.origin.startsWith('URL-recording/template')));
  const second=await service.proposePrompts('project-recording-test',[a.id]);assert.equal(second.added,0);assert.deepEqual(second.prompts.map(p=>p.id),first.prompts.map(p=>p.id));
  const p=await store.get<Project>('projects','project-recording-test');assert.equal(p?.queries[0]?.id,'original-prompt');assert.equal(p?.queries.length,3);assert.equal(p?.queryVersion,2);assert.ok(p?.topics?.some(t=>t.id===first.prompts[0]?.topicId));
  const sourceId=first.prompts[0]!.sourceIds![0];assert.ok(p?.sources.some(s=>s.id===sourceId));
  await service.remove('project-recording-test',a.id);assert.equal((await service.list('project-recording-test')).length,0);assert.equal((await store.get<Project>('projects','project-recording-test'))?.sources.length,1);
 }finally{await cleanup();}
});

test('deleting a recording during collection cannot resurrect it or add orphan source evidence',async()=>{
 const {store,service,cleanup}=await fixture();try{
  const a=await service.add('project-recording-test',{url:'https://docs.example/guide'});let release!:(value:Awaited<ReturnType<RecordingFetcher>>)=>void;let started!:()=>void;const began=new Promise<void>(r=>started=r);
  const pending=service.collect('project-recording-test',a.id,async()=>{started();return new Promise(r=>release=r);});await began;
  await service.remove('project-recording-test',a.id);const replacement=await service.add('project-recording-test',{url:a.url});assert.notEqual(a.id,replacement.id);
  release({url:a.url,text:html,contentType:'text/html'});assert.equal(await pending,null);assert.equal((await service.list('project-recording-test'))[0]?.status,'queued');assert.equal((await store.get<Project>('projects','project-recording-test'))?.sources.length,0);
 }finally{await cleanup();}
});

test('collection timeout is bounded and retains no false completed evidence',async()=>{
 const {service,cleanup}=await fixture();try{
  const a=await service.add('project-recording-test',{url:'https://docs.example/guide'});const start=Date.now();
  const failed=await service.collect('project-recording-test',a.id,async()=>new Promise(()=>{}),5);assert.equal(failed?.status,'failed');assert.ok(Date.now()-start<1000);
 }finally{await cleanup();}
});

function sample(id:string,search?:unknown,failed=false):Sample{return {id,queryId:'prompt-1',question:'Which product analytics tools work?',intent:'commercial',branded:false,origin:'api',model:'gemini/fixture',observedAt:'2026-10-31T00:00:00Z',runGroup:'run-1',protocolId:'fixture',collectionStatus:failed?'failed':'completed',analysisStatus:'completed',answer:failed?'':'An answer',citations:[],...(search===undefined?{}:{search})};}
test('fanouts retain actual provider queries and distinguish unknown capture from explicitly unused search',()=>{
 const result=listObservedFanouts([sample('actual',{requested:true,used:true,webQueries:['product analytics tools','product analytics tools','session replay']}),sample('missing'),sample('withheld',{requested:true,used:true,webQueries:[]}),sample('unused',{requested:false,used:false,webQueries:[]}),sample('failed',{requested:true,used:true,webQueries:['must not be reported']},true),sample('malformed',{queries:['not the supported provider structure']}),sample('unconfirmed',{requested:true,used:false,usedMode:'requested_not_confirmed',webQueries:[]})]);
 assert.deepEqual(result.items.map(i=>i.query),['product analytics tools','session replay']);assert.ok(result.items.every(i=>i.sampleId==='actual'&&i.queryId==='prompt-1'&&i.provider==='gemini'));
 assert.deepEqual(result.knownSampleIds,['actual','unused']);assert.deepEqual(result.unknownSampleIds,['missing','withheld','failed','malformed','unconfirmed']);assert.equal(result.unknownCount,5);
});


test('recording HTTP routes expose the URL pool without inventing answers', async () => {
  const { store, cleanup } = await fixture();
  const { server } = await createApp(store);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const request = async (path: string, method = 'GET', value?: unknown) => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const added = await request('/api/projects/project-recording-test/recordings', 'POST', { url: 'https://docs.example/guide' });
    assert.equal(added.status, 201);
    assert.equal(added.body.status, 'queued');
    const id = added.body.id as string;
    const listed = await request('/api/projects/project-recording-test/recordings');
    assert.equal(listed.body.recordings.length, 1);
    assert.equal(listed.body.recordings[0].url, 'https://docs.example/guide');
    const blocked = await request('/api/projects/project-recording-test/recordings/prompts', 'POST', { ids: [id] });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error, /Collect each selected URL/);
    const rejected = await request('/api/projects/project-recording-test/recordings', 'POST', { url: 'http://127.0.0.1' });
    assert.equal(rejected.status, 400);
    const removed = await request(`/api/projects/project-recording-test/recordings/${id}`, 'DELETE');
    assert.equal(removed.body.removed, true);
    const after = await request('/api/projects/project-recording-test/recordings');
    assert.equal(after.body.recordings.length, 0);
  } finally {
    server.close();
    await cleanup();
  }
});
