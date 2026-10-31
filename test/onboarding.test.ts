import test from 'node:test';
import assert from 'node:assert/strict';
import { researchWebsite } from '../src/citekeel/onboarding.js';

const home = `<html><head><title>Acme | Product analytics</title><meta property="og:site_name" content="Acme"><meta name="description" content="Product analytics for software teams."></head><body><h1>Product analytics</h1><h2>Session replay</h2><a href="/product">Product</a><a href="/about">About</a><a href="https://unrelated.example/">Outside</a><script>private-script-marker</script></body></html>`;
const page = (url: string, text = home) => ({ url, text, contentType: 'text/html; charset=utf-8' });

test('website research obtains real source fields, bounded pages and traceable suggested English templates', async () => {
  const requested: string[] = [];
  const result = await researchWebsite({ url: 'https://acme.example/', country: 'gb' }, { fetchPage: async url => { requested.push(url); return page(url); } });
  assert.equal(result.status, 'completed');
  assert.equal(result.market, 'international');
  assert.equal(result.country, 'GB');
  assert.equal(result.language, 'en');
  assert.deepEqual(result.profile, { brand: 'Acme', description: 'Product analytics for software teams.' });
  assert.equal(requested.length, 3);
  assert.equal(result.sources.length, 3);
  assert.deepEqual(result.competitors, []);
  assert.ok(result.sources.every(source => !source.text.includes('private-script-marker')));
  assert.ok(result.claims.every(claim => claim.status === 'unconfirmed'));
  assert.ok(result.prompts.length >= 3);
  const knownSources = new Set(result.sources.map(source => source.id));
  const knownTopics = new Set(result.topics.map(topic => topic.id));
  for (const prompt of result.prompts) {
    assert.equal(prompt.origin, 'template');
    assert.equal(prompt.status, 'suggested');
    assert.ok(knownTopics.has(prompt.topicId));
    assert.ok(prompt.sourceIds.length && prompt.sourceIds.every(id => knownSources.has(id)));
  }
  assert.ok(result.warnings.some(warning => warning.includes('no LLM research')));
  const again = await researchWebsite({ url: 'acme.example', country: 'GB' }, { fetchPage: async url => page(url) });
  assert.deepEqual(again.prompts.map(prompt => prompt.id), result.prompts.map(prompt => prompt.id));
  assert.notEqual(again.id, result.id);
});

test('failed collection never fabricates a brand profile, facts, prompts or competitors', async () => {
  for (const fetchPage of [async () => null, async () => { throw new Error('transport error with sensitive details'); }, async (url: string) => page(url, '<html><body></body></html>')]) {
    const result = await researchWebsite({ url: 'https://unknown.example' }, { fetchPage });
    assert.equal(result.status, 'failed');
    assert.equal(result.profile, null);
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.claims, []);
    assert.deepEqual(result.prompts, []);
    assert.deepEqual(result.competitors, []);
    assert.ok(!JSON.stringify(result).includes('sensitive details'));
  }
});

test('unsafe URLs and unsupported markets are rejected before any injected fetch', async () => {
  let requests = 0;
  const options = { fetchPage: async (url: string) => { requests++; return page(url); } };
  for (const url of ['http://127.0.0.1/', 'http://2130706433/', 'http://localhost/', 'http://[::1]/', 'https://user:password@acme.example/', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://acme.example/']) {
    await assert.rejects(researchWebsite({ url }, options), Error, url);
  }
  await assert.rejects(researchWebsite({ url: 'https://acme.example', country: 'CN' }, options));
  await assert.rejects(researchWebsite({ url: 'https://acme.example', language: 'zh' }, options));
  assert.equal(requests, 0);
});

test('partial page failure preserves useful sources, stable IDs and explicit failure records', async () => {
  const result = await researchWebsite({ url: 'https://acme.example' }, { fetchPage: async url => url.endsWith('/product') ? null : page(url) });
  assert.equal(result.status, 'partial');
  assert.equal(result.sources.length, 2);
  assert.equal(result.attempts.filter(attempt => attempt.status === 'failed').length, 1);
  assert.ok(result.prompts.length);
});

test('returned private or foreign redirect destinations are not retained as source evidence', async () => {
  for (const url of ['http://127.0.0.1/', 'https://unrelated.example/']) {
    const result = await researchWebsite({ url: 'https://acme.example' }, { fetchPage: async () => page(url) });
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.sources, []);
  }
});

test('credentials in a discovered link never enter requests or persisted attempt records', async () => {
  const requests: string[] = [];
  const result = await researchWebsite({ url: 'https://acme.example' }, {
    fetchPage: async url => { requests.push(url); return page(url, home.replace('</body>', '<a href="https://user:secret-password@acme.example/private">Private</a></body>')); },
  });
  assert.ok(requests.every(url => !url.includes('secret-password')));
  assert.ok(!JSON.stringify(result).includes('secret-password'));
});

test('a stalled fetch cannot exceed the overall research deadline', async () => {
  const started = Date.now();
  const result = await researchWebsite({ url: 'https://acme.example' }, { fetchPage: () => new Promise(() => {}), timeoutMs: 25 });
  assert.equal(result.status, 'failed');
  assert.ok(Date.now() - started < 1000);
  assert.match(result.attempts[0]!.reason!, /time budget/);
});
