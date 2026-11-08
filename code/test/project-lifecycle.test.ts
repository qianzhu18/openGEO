import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/citekeel/storage.js';
import { syntheticProject } from '../src/citekeel/cases.js';
import { createRun } from '../src/citekeel/engine.js';

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
 const {createApp}=await import('../src/citekeel/server.js');
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
