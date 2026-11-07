import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun, executeRun } from '../src/citekeel/engine.js';
import { Store } from '../src/citekeel/storage.js';
import type { Project } from '../src/citekeel/types.js';

function project(): Project {
  const now = new Date().toISOString();
  return { id: 'project-browser-test', name: 'Northstar', brand: 'Northstar', aliases: [], domain: 'northstar.example', industry: 'Product analytics', description: 'Product analytics for software teams.', origin: 'manual', market: 'international', language: 'en', country: 'US', goal: 'Measure a browser baseline.',
    sources: [{ id: 's1', title: 'Homepage', url: 'https://northstar.example', text: 'Product analytics for software teams.' }],
    claims: [{ id: 'c1', label: 'Website description', value: 'Product analytics for software teams.', status: 'unconfirmed', sourceIds: ['s1'] }],
    queries: [{ id: 'q1', text: 'Which product analytics tools should small teams evaluate?', intent: 'commercial', branded: false, origin: 'manual', status: 'active' }],
    queryVersion: 1, samples: [], createdAt: now, updatedAt: now };
}

test('browser runs record web-UI samples with evidence ids and still feed analysis', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-browser-run-'));
  const store = new Store(root);
  try {
    const run = createRun(project(), 'live');
    const asked: string[] = [];
    const browser = {
      engine: 'perplexity',
      ask: async (prompt: string) => {
        asked.push(prompt);
        return { engine: 'perplexity', answer: 'Consider Northstar for product analytics; it covers session replay and funnels. Also see PostHog.', citations: ['https://northstar.example/pricing', 'https://posthog.com/docs'], url: 'https://www.perplexity.ai/search/fixture', evidenceId: 'ev-fixture-1', latencyMs: 4200 };
      },
    };
    await executeRun(run, store, undefined, browser);
    assert.equal(asked.length, 1);
    assert.equal(run.status, 'completed');
    const sample = run.samples[0]!;
    assert.equal(sample.origin, 'browser');
    assert.equal(sample.model, 'perplexity-web');
    assert.match(sample.protocolId, /browser-ui\/v1;engine=perplexity;session=personal/);
    assert.equal(sample.collectionStatus, 'completed');
    assert.equal(sample.upstreamAttemptId, 'ev-fixture-1');
    assert.equal(sample.citations.length, 2);
    assert.ok(sample.citations.every(c => c.kind === 'search_result' && c.source === 'browser-ui/perplexity' && c.integrity === 'unverified'));
    // Analysis still works: the brand is mentioned, so the audit must see a positive observation.
    assert.equal(run.audit!.analyzed, 1);
    assert.ok(run.audit!.mention.numerator >= 1);
    assert.ok(run.audit!.searchResults >= 2);
    assert.ok(run.actions.length >= 1);
    const auditStep = run.steps.find(step => step.id === 'audit')!;
    assert.equal(auditStep.executor, 'browser');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a browser failure is kept per-sample and never becomes a missing mention', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-browser-run-'));
  const store = new Store(root);
  try {
    const run = createRun(project(), 'live');
    await executeRun(run, store, undefined, { engine: 'chatgpt', ask: async () => { throw new Error('Cloudflare challenge hit ChatGPT.'); } });
    const sample = run.samples[0]!;
    assert.equal(sample.collectionStatus, 'failed');
    assert.match(sample.error!, /Cloudflare/);
    assert.equal(sample.answer, '');
    assert.equal(run.audit!.analyzed, 0);
    assert.equal(run.audit!.mention.numerator, 0);
    assert.ok(run.limitations.length >= 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
