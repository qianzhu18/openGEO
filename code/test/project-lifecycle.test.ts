import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/workbench/storage.js';
import { syntheticProject } from '../src/workbench/cases.js';
import { createRun } from '../src/workbench/engine.js';

test('deletion hides only its project and runs, survives seeding, and restores snapshots', async () => {
 const root = await mkdtemp(join(tmpdir(), 'opengeo-delete-'));
 try {
  const store = new Store(root), a = syntheticProject(), b = { ...syntheticProject(), id: 'separate-project' };
  await store.initialize([a,b]);
  const run = createRun(a,'replay'); run.status='completed'; await store.save('runs',run);
  await store.deleteProject(a.id);
  assert.equal(await store.get('projects',a.id),null); assert.equal(await store.get('runs',run.id),null);
  assert.ok(await store.get('projects',b.id));
  await assert.rejects(store.save('projects',a),/已删除/);
  await store.initialize([a,b]); assert.equal(await store.get('projects',a.id),null);
  assert.equal((await store.deletedProjects()).length,1);
  await store.restoreProject(a.id); assert.deepEqual(await store.get('runs',run.id),run);
  const active = createRun(a,'live'); active.status='running'; await store.save('runs',active);
  await assert.rejects(store.deleteProject(a.id),/正在执行/);
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('project deletion API scopes runs, refuses writes while deleted and permits recovery',async()=>{
 const root=await mkdtemp(join(tmpdir(),'opengeo-delete-api-'));
 const {createApp}=await import('../src/workbench/server.js');
 const app=await createApp(new Store(root)); await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
 try {
  const a=syntheticProject(), b={...syntheticProject(),id:'other-project'};
  await app.store.save('projects',a);await app.store.save('projects',b);
  const run=createRun(a,'replay');run.status='completed';await app.store.save('runs',run);
  assert.equal((await fetch(`${base}/api/runs/${run.id}?projectId=${b.id}`)).status,404);
  assert.equal((await fetch(`${base}/api/projects/${a.id}`,{method:'DELETE'})).status,200);
  assert.equal((await fetch(`${base}/api/runs/${run.id}`)).status,404);
  assert.equal((await fetch(`${base}/api/projects/${b.id}`)).status,200);
  assert.equal((await fetch(`${base}/api/projects/${a.id}/brand-sources`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'text',title:'deleted',text:'blocked'})})).status,400);
  assert.equal((await fetch(`${base}/api/deleted-projects/${a.id}/restore`,{method:'POST'})).status,200);
  assert.equal((await fetch(`${base}/api/runs/${run.id}`)).status,200);
 } finally {await new Promise<void>(resolve=>app.server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test('diagnosis spaces persist immutable question versions, platform selection and scoped run association',async()=>{
 const root=await mkdtemp(join(tmpdir(),'opengeo-spaces-'));
 const {createApp}=await import('../src/workbench/server.js');
 const {server,store}=await createApp(new Store(root));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const call=async(path:string,method='GET',body?:object)=>fetch(base+path,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 try {
  const a=syntheticProject(),b={...syntheticProject(),id:'other-space-project'};await store.save('projects',a);await store.save('projects',b);
  const spaces=`/api/projects/${a.id}/diagnosis-spaces`;
  const first=await(await call(spaces,'POST',{})).json();
  assert.equal((await(await call(spaces,'POST',{})).json()).id,first.id);
  const unchanged=await(await call(`/api/projects/${a.id}/queries`,'PUT',{questions:a.queries.map(q=>q.text)})).json();assert.equal(unchanged.queryVersion,a.queryVersion);
  await call(spaces+'/'+first.id,'PATCH',{targetIds:['qwen'],queryIds:[first.queries[0].id]});
  await call(`/api/projects/${a.id}/queries`,'PUT',{questions:['Which platform fits a new task?']});
  const second=await(await call(spaces,'POST',{})).json();assert.notEqual(second.id,first.id);
  const reloaded=await(new Store(root)).get<any>('projects',a.id);
  assert.deepEqual(reloaded.diagnosisSpaces[0].queries,first.queries);assert.deepEqual(reloaded.diagnosisSpaces[0].targetIds,['qwen']);assert.deepEqual(reloaded.diagnosisSpaces[0].selectedQueryIds,[first.queries[0].id]);
  assert.equal((await call(spaces+'/'+first.id,'PATCH',{targetIds:['qwen'],queryIds:['foreign-question']})).status,400);
  assert.equal((await call('/api/runs','POST',{projectId:b.id,spaceId:first.id})).status,400);
  const response=await call('/api/runs','POST',{projectId:a.id,spaceId:first.id,mode:'replay'});assert.equal(response.status,202);const {id}=await response.json();
  let run:any;
  for(let i=0;;i++){run=await(await call('/api/runs/'+id)).json();if(!['running','queued'].includes(run.status))break;assert.ok(i<100);await new Promise(r=>setTimeout(r,10));}
  assert.equal(run.spaceId,first.id);assert.deepEqual(run.projectSnapshot.queries,first.queries);
  assert.equal((await store.get<any>('projects',a.id)).queryVersion,second.queryVersion);
  assert.equal((await(await call(`/api/runs?projectId=${a.id}`)).json())[0].spaceId,first.id);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
