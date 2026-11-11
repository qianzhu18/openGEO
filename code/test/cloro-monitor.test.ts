import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloroMonitor } from '../src/workbench/cloro-monitor.js';
import { createRun, executeRun } from '../src/workbench/engine.js';
import { syntheticProject } from '../src/workbench/cases.js';
import { Store } from '../src/workbench/storage.js';

test('Cloro official endpoints preserve monitor identity, redact secrets and do not claim citations or model versions', async () => {
 const original = globalThis.fetch, seen: {url:string;body:any}[] = [];
 const key = 'fixture-cloro-secret';
 globalThis.fetch = async (url:any, init:any) => {
  assert.equal(init.headers.authorization, `Bearer ${key}`);
  seen.push({url:String(url),body:JSON.parse(init.body)});
  return new Response(JSON.stringify({success:true,result:{text:`AgileX ${key}`,sources:[{url:'https://agilex.ai/',label:'AgileX'},{url:'javascript:alert(1)'}],api_key:key}}));
 };
 const root = await mkdtemp(join(tmpdir(),'opengeo-cloro-'));
 try {
  const project = syntheticProject(); project.queries = project.queries.slice(0,1); project.country='US';
  const targets = ['chatgpt','gemini'].map(id=>({id,platform:id,preferredChannel:'api' as const,provider:'cloro',model:id}));
  const run = await executeRun(createRun(project,'live',project.goal,undefined,targets),new Store(root),undefined,undefined,{targets,apiKeys:{cloro:key}});
  assert.deepEqual(seen.map(r=>r.url).sort(),['https://api.cloro.dev/v1/monitor/chatgpt','https://api.cloro.dev/v1/monitor/gemini']);
  assert.ok(seen.every(r=>r.body.prompt===project.queries[0].text && r.body.country==='US' && r.body.include.markdown));
  assert.equal(run.samples.length,2); assert.equal(run.audit?.mention.denominator,2);
  assert.ok(run.samples.every(s=>s.origin==='api' && s.protocolId.startsWith('remote-monitor/') && s.observation?.actualModel==='UNKNOWN'));
  assert.ok(run.samples.every(s=>s.citations.length===1 && s.citations[0].kind==='search_result'));
  assert.ok(run.calls.every(c=>c.purpose==='measurement')); // Never use monitor endpoint for strategy/content.
  const saved = await readFile(join(root,'runs',`${run.id}.json`),'utf8'); assert.ok(!saved.includes(key));
 } finally {globalThis.fetch=original;await rm(root,{recursive:true,force:true});}
});

test('Cloro rejects empty/envelope failures and stops subsequent requests without retrying', async () => {
 const original=globalThis.fetch; let calls=0;
 try {
  for (const response of [()=>new Response('{"success":false,"result":{"text":"ignored"}}'),()=>new Response('{"success":true,"result":{"text":"  "}}'),()=>new Response('secret',{status:403})]) {
   calls=0; globalThis.fetch=async()=>{calls++;return response();}; const monitor=new CloroMonitor('fixture');
   await assert.rejects(monitor.ask('gemini','q','US')); await assert.rejects(monitor.ask('gemini','q2','US'),/已停止/); assert.equal(calls,1);
  }
 } finally {globalThis.fetch=original;}
});
