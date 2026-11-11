import test from 'node:test';
import assert from 'node:assert/strict';
import { researchWebsite } from '../src/workbench/onboarding.js';
import { enrichWebsiteResearch, type SemanticResearchResponse } from '../src/workbench/semantic-research.js';
import type { LiveConfig } from '../src/workbench/types.js';

const config: LiveConfig = { provider: 'openrouter', model: 'test/model', apiKey: 'semantic-test-secret-do-not-retain', maxQuestions: 3, webSearch: false };
async function fixture() {
  return researchWebsite({ url: 'https://acme.example', country: 'US' }, { fetchPage: async url => ({ url, contentType: 'text/html', text: '<title>Acme | Analytics</title><meta name="description" content="Product analytics for software teams."><h1>Product analytics</h1>' }) });
}
function output(sourceId: string) {
  return { profile: { brand: 'Acme', description: 'Product analytics for software teams.', industry: 'Product analytics', sourceIds: [sourceId] }, topics: [{ id: 'analytics', name: 'Product analytics', sourceIds: [sourceId] }], prompts: [
    { text: 'What does Acme offer software teams?', intent: 'brand_awareness', branded: true, topicId: 'analytics', sourceIds: [sourceId] },
    { text: 'Which product analytics tools should small teams compare?', intent: 'commercial', branded: false, topicId: 'analytics', sourceIds: [sourceId] },
  ] };
}
test('single semantic operation produces source-linked English suggestions with stable IDs and recorded model metadata', async () => {
  const research = await fixture(), payload = output(research.sources[0]!.id); let calls = 0;
  const generate = async (request: import('../src/workbench/semantic-research.js').SemanticResearchRequest): Promise<SemanticResearchResponse> => {
    calls++; assert.equal(request.maxTokens, 2500); assert.equal(request.webSearchEnabled, false); assert.ok(request.prompt.includes('untrusted DATA')); assert.ok(request.prompt.includes('"targetLanguage":"English"')); assert.ok(!request.prompt.includes(config.apiKey));
    return { text: JSON.stringify(payload), rawResponse: { choices: [{ finish_reason: 'stop' }] }, costUsd: 0.001 };
  };
  const result = await enrichWebsiteResearch(research, config, { generate });
  assert.equal(calls, 1); assert.equal(result.enrichment.status, 'completed'); assert.equal(result.enrichment.costStatus, 'known'); assert.equal(result.enrichment.costUsd, 0.001); assert.ok(result.enrichment.promptHash);
  assert.equal(result.methodology, 'model-assisted/v1'); assert.equal(result.profile?.brand, 'Acme'); assert.equal(result.profile?.industry, 'Product analytics'); assert.deepEqual(result.competitors, []);
  assert.ok(result.prompts.every(prompt => prompt.origin === 'model-assisted' && prompt.sourceIds.includes(research.sources[0]!.id)));
  assert.ok(result.claims.every(claim => claim.status === 'unconfirmed'));
  const again = await enrichWebsiteResearch(research, config, { generate }); assert.deepEqual(result.prompts.map(p => p.id), again.prompts.map(p => p.id));
  assert.equal(research.methodology, 'source-derived-templates/v1');
});
test('Chinese semantic research requests Chinese buyer questions and replaces the no-model template warning only after success', async () => {
  const research = await researchWebsite({ url: 'https://acme.example', language: 'zh', country: 'CN' }, { fetchPage: async url => ({ url, contentType: 'text/html', text: '<title>Acme | Analytics</title><meta name="description" content="Product analytics for software teams."><h1>Product analytics</h1>' }) });
  const payload = output(research.sources[0]!.id);
  payload.profile.description = '为软件团队提供产品分析工具。';
  payload.profile.industry = '产品分析';
  payload.topics[0]!.name = '软件团队的产品分析工具选型';
  payload.prompts[0]!.text = 'Acme 如何帮助软件团队分析产品使用情况？';
  payload.prompts[1]!.text = '小型软件团队应如何比较产品分析工具？';
  let calls = 0;
  const result = await enrichWebsiteResearch(research, config, { generate: async request => {
    calls++;
    assert.ok(request.prompt.includes('"targetLanguage":"Simplified Chinese"'));
    assert.ok(request.prompt.includes('"targetCountry":"CN"'));
    assert.ok(request.prompt.includes('Write the profile description, industry, topic names and buyer questions in Simplified Chinese'));
    assert.ok(!request.prompt.includes('English-language') && !request.prompt.includes('an English question'));
    return { text: JSON.stringify(payload) };
  } });
  assert.equal(calls, 1); assert.equal(result.enrichment.status, 'completed');
  assert.equal(result.profile?.brand, 'Acme'); assert.equal(result.profile?.description, payload.profile.description);
  assert.deepEqual(result.prompts.map(prompt => prompt.text), payload.prompts.map(prompt => prompt.text));
  assert.ok(result.warnings.some(w => w.includes('不代表已测量的搜索需求')));
  assert.ok(result.warnings.some(w => w.includes('未返回已知费用')));
  assert.ok(!result.warnings.some(w => w.includes('未调用模型')));
  assert.ok(result.claims.some(claim => claim.label === '模型归纳的网站摘要' && claim.status === 'unconfirmed'));
  const failed = await enrichWebsiteResearch(research, config, { generate: async () => ({ text: '{}' }) });
  assert.equal(failed.enrichment.status, 'failed');
  assert.ok(failed.warnings.some(w => w.includes('未调用模型')));
  assert.deepEqual(failed.prompts, research.prompts);
  assert.ok(research.warnings.some(w => w.includes('未调用模型')));
});
test('unknown model cost is explicit and does not trigger another request', async () => {
  const research = await fixture(); let calls = 0;
  const result = await enrichWebsiteResearch(research, config, { generate: async () => { calls++; return { text: JSON.stringify(output(research.sources[0]!.id)) }; } });
  assert.equal(calls, 1); assert.equal(result.enrichment.costStatus, 'unknown'); assert.equal(result.enrichment.costUsd, undefined); assert.ok(result.warnings.some(w => w.includes('No further model operations')));
});
test('bad JSON, truncation and invalid source/topic IDs fall back without invented successful model research', async () => {
  const research = await fixture();
  const foreignSource = output('foreign-source'); const foreignTopic = output(research.sources[0]!.id); foreignTopic.prompts[1]!.topicId = 'missing';
  const renamed = output(research.sources[0]!.id); renamed.profile.brand = 'Imaginary Company';
  for (const response of [{ text: 'not JSON' }, { text: JSON.stringify(output(research.sources[0]!.id)), truncated: true }, { text: JSON.stringify(foreignSource) }, { text: JSON.stringify(foreignTopic) }, { text: JSON.stringify(renamed) }, { text: '{}' }]) {
    let calls = 0;
    const result = await enrichWebsiteResearch(research, config, { generate: async () => { calls++; return response; } });
    assert.equal(calls, 1); assert.equal(result.enrichment.status, 'failed'); assert.equal(result.methodology, 'source-derived-templates/v1'); assert.deepEqual(result.profile, research.profile); assert.deepEqual(result.prompts, research.prompts);
  }
});
test('credentials in model output and transport errors are not persisted', async () => {
  const research = await fixture();
  const response = output(research.sources[0]!.id); response.profile.description += ` ${config.apiKey}`;
  const result = await enrichWebsiteResearch(research, config, { generate: async () => ({ text: JSON.stringify(response), rawResponse: { authorization: config.apiKey, nested: { echo: config.apiKey, apiKey: 'another-secret' } } }) });
  assert.ok(!JSON.stringify(result).includes(config.apiKey)); assert.ok(!JSON.stringify(result).includes('another-secret')); assert.ok(JSON.stringify(result).includes('[REDACTED]'));
  const failed = await enrichWebsiteResearch(research, config, { generate: async () => { throw Error(`HTTP failure: ${config.apiKey}`); } });
  assert.equal(failed.enrichment.status, 'failed'); assert.ok(!JSON.stringify(failed).includes(config.apiKey));
});
test('no usable website evidence or invalid search-enabled config starts no provider operation', async () => {
  const research = await fixture(); let calls = 0;
  const generate = async () => { calls++; return { text: '{}' }; };
  const skipped = await enrichWebsiteResearch({ ...research, status: 'failed', profile: null, sources: [] }, config, { generate });
  assert.equal(skipped.enrichment.status, 'skipped');
  const invalid = await enrichWebsiteResearch(research, { ...config, webSearch: true }, { generate }); assert.equal(invalid.enrichment.status, 'failed'); assert.equal(calls, 0);
});
