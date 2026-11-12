import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/workbench/storage.js';
import { syntheticProject } from '../src/workbench/cases.js';
import { createOpenGeoMcp } from '../src/workbench/mcp.js';
import { createApp } from '../src/workbench/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Project } from '../src/workbench/types.js';

const decode = (result: any) => JSON.parse(result.content.find((item: any) => item.type === 'text').text);
test('MCP reads bounded sources and imports exact unconfirmed facts through the single Web writer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-mcp-'));
  const store = new Store(root), reader = new Store(root), project = syntheticProject();
  const app = await createApp(store);
  await store.save('projects', project);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const server = createOpenGeoMcp(reader, base);
  const client = new Client({ name: 'opengeo-test-client', version: '0.9.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport); await client.connect(clientTransport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['get_source', 'import_source', 'list_claims', 'list_projects', 'list_sources', 'propose_claim', 'save_claim_candidate']);
    assert.equal(tools.tools.find(tool => tool.name === 'import_source')!.annotations?.readOnlyHint, false);
    const invoke = (name: string, args: object) => client.callTool({ name, arguments: args as Record<string, unknown> });
    assert.ok(decode(await invoke('list_projects', {})).some((item: any) => item.id === project.id));
    const listed = await invoke('list_sources', { projectId: project.id, limit: 1, offset: 0 });
    assert.equal(decode(listed).sources.length, 1); assert.ok(!JSON.stringify(listed).includes('localPath'));
    const source = project.sources[0]!, quote = source.text.slice(0, 30);
    const proposed = await invoke('propose_claim', { projectId: project.id, sourceId: source.id, label: 'MCP fact', quote });
    assert.equal(decode(proposed).status, 'candidate');
    assert.equal((await store.get<Project>('projects', project.id))!.claims.length, project.claims.length);
    assert.equal((await invoke('propose_claim', { projectId: project.id, sourceId: source.id, label: 'Fake', quote: 'not in source' })).isError, true);

    const input = { projectId: project.id, title: 'Client-read manual', text: 'Payload: 1.5 kg. Verify compatibility.', url: 'https://example.com/manual' };
    const imported = decode(await invoke('import_source', input)); assert.equal(imported.added, 1);
    assert.equal(decode(await invoke('import_source', input)).added, 0);
    const sourceId = imported.sourceIds[0];
    assert.equal(decode(await invoke('get_source', { projectId: project.id, sourceId })).url, input.url);
    const fact = { projectId: project.id, sourceId, label: 'Payload', quote: 'Payload: 1.5 kg.' };
    const saved = decode(await invoke('save_claim_candidate', fact)); assert.equal(saved.status, 'unconfirmed');
    await Promise.all([invoke('save_claim_candidate', fact), store.updateProject(project.id, current => { current.description = 'Concurrent Web edit'; })]);
    assert.equal((await invoke('save_claim_candidate', { ...fact, quote: 'Payload: 100 kg.' })).isError, true);
    assert.equal((await invoke('import_source', { ...input, url: 'https://user:password@example.com/manual' })).isError, true);
    const current = (await store.get<Project>('projects', project.id))!;
    assert.equal(current.description, 'Concurrent Web edit');
    assert.equal(current.claims.length, project.claims.length + 1);
    assert.equal(current.claims.find(claim => claim.id === saved.claimId)!.status, 'unconfirmed');
    assert.deepEqual(current.queries, project.queries);
    const claims = decode(await invoke('list_claims', { projectId: project.id, status: 'unconfirmed' }));
    assert.ok(claims.claims.some((claim: any) => claim.id === saved.claimId));
    for (const url of ['https://example.com', 'http://127.0.0.1:1234/path', 'http://user:pass@localhost']) assert.throws(() => createOpenGeoMcp(reader, url), /local OpenGEO/);
  } finally {
    await client.close(); await server.close();
    await new Promise<void>(resolve => app.server.close(() => resolve()));
    reader.close(); store.close(); await rm(root, { recursive: true, force: true });
  }
});

test('actual stdio MCP starts from an unrelated cwd with an explicit data directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-mcp-stdio-'));
  const store = new Store(root), project = syntheticProject();
  const client = new Client({ name: 'stdio-smoke', version: '0.9.0' });
  try {
    await store.save('projects', project);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/workbench/mcp.ts')], cwd: tmpdir(),
      env: { OPENGEO_DATA_DIR: root }, stderr: 'pipe' });
    await client.connect(transport);
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    assert.ok(decode(result).some((item: any) => item.id === project.id));
  } finally { await client.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});
