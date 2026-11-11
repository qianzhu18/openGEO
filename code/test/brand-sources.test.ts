import test from 'node:test';
import { textPdf } from './fixtures/pdf.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrandSourceService } from '../src/workbench/brand-sources.js';
import { Store } from '../src/workbench/storage.js';
import { syntheticProject } from '../src/workbench/cases.js';
import { createRun } from '../src/workbench/engine.js';
import { makeDraft } from '../src/workbench/skills.js';
import { createApp } from '../src/workbench/server.js';
import type { Project } from '../src/workbench/types.js';

test('source intake preserves provenance, rejects invented claims, deduplicates and keeps run snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-sources-'));
  try {
    const store = new Store(root), project = syntheticProject(); project.claims = []; project.sources = [];
    await store.save('projects', project); const run = createRun(project, 'replay');
    const service = new BrandSourceService(store);
    const input = { kind: 'text', title: 'Product sheet', text: 'PiPER payload: 1.5 kg. Standard configuration excludes a base.' };
    const first = await service.add(project.id, input);
    assert.equal(first.result.added, 1);
    assert.equal((await service.add(project.id, input)).result.added, 0);
    const sourceId = first.result.sourceIds[0]!;
    await assert.rejects(service.addClaim(project.id, { sourceId, label: 'Payload', value: '100 kg' }), /原文片段/);
    const added = await service.addClaim(project.id, { sourceId, label: 'PiPER payload', value: 'PiPER payload: 1.5 kg.' });
    assert.equal(added.project.claims[0]?.status, 'unconfirmed');
    assert.equal(makeDraft(added.project, run).status, 'blocked');
    assert.equal(run.projectSnapshot.sources.length, 0);
    assert.match(added.project.sources[0]!.sha256!, /^[a-f0-9]{64}$/);
    assert.equal(added.project.samples.length, project.samples.length);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('PDF intake extracts page text and stores original bytes; invalid and empty documents fail explicitly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-pdf-'));
  try {
    const store = new Store(root), project = syntheticProject(); project.sources = [];
    await store.save('projects', project); const service = new BrandSourceService(store);
    const bytes = textPdf();
    const { project: updated } = await service.add(project.id, { kind: 'pdf', fileName: '../manual.pdf', base64: bytes.toString('base64') });
    const source = updated.sources[0]!;
    assert.equal(source.page, 1); assert.equal(source.fileName, 'manual.pdf'); assert.match(source.text, /1.5 kg/);
    assert.deepEqual(await readFile(source.localPath!), bytes);
    await assert.rejects(service.add(project.id, { kind: 'pdf', fileName: 'bad.pdf', base64: Buffer.from('not a pdf').toString('base64') }), /PDF/);
    await assert.rejects(service.add(project.id, { kind: 'pdf', fileName: 'scan.pdf', base64: textPdf('').toString('base64') }), /OCR/);
    assert.equal((await store.get<Project>('projects', project.id))!.sources.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTTP source intake integrates with exact-source confirmation and does not allow unrelated evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-source-http-'));
  const store = new Store(root); const app = await createApp(store);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
  const post = async (path: string, body: object) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const project = await (await post('/api/projects', { brand: 'Source fixture', industry: 'Robotics' })).json();
    const source = await (await post(`/api/projects/${project.id}/brand-sources`, { kind: 'text', title: 'Manual', text: 'Payload: 1.5 kg.' })).json();
    const fact = await (await post(`/api/projects/${project.id}/brand-claims`, { sourceId: source.result.sourceIds[0], label: 'Payload', value: 'Payload: 1.5 kg.' })).json();
    assert.equal(fact.project.claims[0].status, 'unconfirmed');
    const denied = await post(`/api/projects/${project.id}/claims`, { claimId: fact.result.claimId, sourceId: 'user-brief' });
    assert.notEqual(denied.status, 200);
    const confirmed = await (await post(`/api/projects/${project.id}/claims`, { claimId: fact.result.claimId, sourceId: source.result.sourceIds[0] })).json();
    assert.equal(confirmed.claims[0].status, 'confirmed');
    assert.equal(makeDraft(confirmed, createRun(confirmed, 'replay')).status, 'draft');
  } finally { await new Promise<void>(resolve => app.server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test('website intake preserves returned evidence without confirming it or modifying questions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-site-source-'));
  try {
    const store = new Store(root), project = syntheticProject();
    await store.save('projects', project);
    const { researchWebsite } = await import('../src/workbench/onboarding.js');
    const service = new BrandSourceService(store, input => researchWebsite(input, {
      fetchPage: async url => ({ url, contentType: 'text/html', text: '<html><title>PiPER manual</title><body><main>PiPER payload is 1.5 kg.</main></body></html>' }),
    }));
    const outcome = await service.add(project.id, { kind: 'website', url: 'https://robot.example' });
    assert.ok(outcome.result.added > 0);
    assert.ok(outcome.project.sources.some(source => source.kind === 'website' && source.url?.startsWith('https://robot.example')));
    assert.deepEqual(outcome.project.claims, project.claims);
    assert.deepEqual(outcome.project.queries, project.queries);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local text originals are isolated by project and unsupported formats fail explicitly', async () => {
 const root = await mkdtemp(join(tmpdir(), 'opengeo-files-'));
 try {
  const store=new Store(root), a=syntheticProject(), b={...syntheticProject(),id:'other-brand'};
  a.sources=[]; b.sources=[]; await store.save('projects',a);await store.save('projects',b);
  const service=new BrandSourceService(store), input={kind:'file',fileName:'spec.md',base64:Buffer.from('PiPER payload: 1.5 kg.').toString('base64')};
  const left=await service.add(a.id,input),right=await service.add(b.id,input);
  assert.notEqual(left.project.sources[0].localPath,right.project.sources[0].localPath);
  assert.match(left.project.sources[0].localPath!,new RegExp(a.id));
  assert.equal((await service.add(a.id,input)).result.added,0);
  await assert.rejects(service.add(a.id,{...input,fileName:'spec.docx'}),/支持/);
  assert.equal((await store.get<Project>('projects',b.id))!.sources.length,1);
 } finally {await rm(root,{recursive:true,force:true});}
});
