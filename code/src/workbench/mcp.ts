import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Store } from './storage.js';
import type { Project } from './types.js';

/**
 * Explicit, local-only MCP bridge. It is never started by the Web server and
 * exposes source text and exact-quote candidates, not filesystem paths,
 * credentials, answers, or sampling controls. Writes go through the local Web.
 */
export function createOpenGeoMcp(store = new Store(), apiUrl = process.env.OPENGEO_MCP_API_URL || 'http://127.0.0.1:8847') {
  const base = new URL(apiUrl);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('MCP writes require a local OpenGEO HTTP origin.');
  const post = async (projectId: string, resource: string, input: object) => {
    // Web remains the single writer. Never initialize/recover runs or write JSON
    // from this separate stdio process; never follow redirects away from localhost.
    const status = await fetch(new URL('/api/status', base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!status.ok || (await status.json()).name !== 'OpenGEO') throw new Error('Start the local OpenGEO Web service before importing through MCP.');
    const response = await fetch(new URL(`/api/projects/${encodeURIComponent(projectId)}/${resource}`, base), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'OpenGEO local import failed.');
    return result.result;
  };
  const server = new McpServer({ name: 'opengeo-local-sources', version: '0.8.0' });
  const project = async (id: string) => {
    const value = await store.get<Project>('projects', id);
    if (!value) throw new Error('Project not found.');
    return value;
  };
  server.tool('list_projects', 'List local OpenGEO projects without secrets.', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify((await store.list<Project>('projects')).map(p => ({ id: p.id, name: p.name, brand: p.brand, domain: p.domain, sourceCount: p.sources.length, claimCount: p.claims.length }))) }],
  }));
  server.tool('list_sources', 'List source metadata and bounded text for one local project.', { projectId: z.string().min(1), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).max(500).optional() }, async ({ projectId, limit = 20, offset = 0 }) => {
    const value = await project(projectId);
    const rows = value.sources.slice(offset, offset + limit).map(source => ({ id: source.id, title: source.title, url: source.url, kind: source.kind, page: source.page, text: source.text.slice(0, 12000) }));
    return { content: [{ type: 'text', text: JSON.stringify({ projectId, offset, limit, total: value.sources.length, sources: rows }) }] };
  });
  server.tool('get_source', 'Read one local source text; localPath is never returned.', { projectId: z.string().min(1), sourceId: z.string().min(1) }, async ({ projectId, sourceId }) => {
    const source = (await project(projectId)).sources.find(item => item.id === sourceId);
    if (!source) throw new Error('Source not found.');
    return { content: [{ type: 'text', text: JSON.stringify({ id: source.id, title: source.title, url: source.url, kind: source.kind, page: source.page, text: source.text.slice(0, 50000) }) }] };
  });
  server.tool('list_claims', 'Read the current brand fact bank without local paths, credentials, or answer content.', { projectId: z.string().min(1), status: z.enum(['confirmed', 'unconfirmed', 'conflict']).optional() }, async ({ projectId, status }) => {
    const value = await project(projectId);
    const claims = value.claims.filter(claim => !status || claim.status === status).map(claim => ({ id: claim.id, label: claim.label, value: claim.value, quote: claim.quote, status: claim.status, sourceIds: claim.sourceIds, alternatives: claim.alternatives }));
    return { content: [{ type: 'text', text: JSON.stringify({ projectId, status: status || 'all', total: claims.length, claims }) }] };
  });
  server.tool('propose_claim', 'Propose a fact candidate from an exact source quote. This read-only tool never writes project data; review and approve it in OpenGEO.', { projectId: z.string().min(1), sourceId: z.string().min(1), label: z.string().min(1).max(120), quote: z.string().min(1).max(2000) }, async ({ projectId, sourceId, label, quote }) => {
    const source = (await project(projectId)).sources.find(item => item.id === sourceId);
    const normalized = quote.replace(/\s+/g, ' ').trim();
    if (!source || !source.text.replace(/\s+/g, ' ').includes(normalized)) throw new Error('事实必须是所选来源的原文片段，请核对页码和文字');
    return { content: [{ type: 'text', text: JSON.stringify({ projectId, sourceId, label: label.trim(), value: quote.trim(), quote: quote.trim(), status: 'candidate', message: 'Exact source fragment verified. Nothing was written; review and approve this candidate in OpenGEO.' }) }] };
  });
  server.tool('import_source', 'Import source text already read by the client, optionally with its original public URL. Stores locally through the running OpenGEO Web service; does not fetch URLs or start model calls.', {
    projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), title: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(100000), url: z.string().url().max(2048).optional(),
  }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, async ({ projectId, ...source }) => ({
    content: [{ type: 'text', text: JSON.stringify(await post(projectId, 'brand-sources', { kind: 'text', ...source })) }],
  }));
  server.tool('save_claim_candidate', 'Save an exact source quote as an unconfirmed brand fact through the local Web service. Never confirms facts, edits questions, or starts sampling.', {
    projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), sourceId: z.string().min(1).max(100), label: z.string().trim().min(1).max(120), quote: z.string().trim().min(1).max(2000),
  }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, async ({ projectId, sourceId, label, quote }) => ({
    content: [{ type: 'text', text: JSON.stringify({ ...await post(projectId, 'brand-claims', { sourceId, label, value: quote }), status: 'unconfirmed' }) }],
  }));
  return server;
}

if (process.argv[1]?.endsWith('/mcp.ts') || process.argv[1]?.endsWith('/mcp.js')) {
  const server = createOpenGeoMcp();
  await server.connect(new StdioServerTransport());
}
