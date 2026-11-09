import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun, executeRun } from '../src/citekeel/engine.js';
import { syntheticProject } from '../src/citekeel/cases.js';
import { Store } from '../src/citekeel/storage.js';
import { exportRun, evidenceMarkdown } from '../src/citekeel/report.js';
import { diagnoseApiFailure } from '../src/citekeel/api-receipts.js';

async function fixture(provider = 'deepseek', count = 2) {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-receipts-'));
  const project = syntheticProject(); project.queries = project.queries.slice(0, count);
  const targets = [{ id: 'target', platform: 'Fixture', provider, model: provider === 'cloro' ? 'chatgpt' : 'fixture-model', preferredChannel: 'api' as const }];
  const store = new Store(root);
  return { root, project, store, targets, run: () => executeRun(createRun(project, 'live', project.goal, undefined, targets), store, undefined, undefined, { targets, apiKeys: { [provider]: 'fixture-receipt-secret' } }), cleanup: () => rm(root, { recursive: true, force: true }) };
}
const receipt = (call: unknown) => (call as any).receipt;

test('API failure diagnosis maps provider causes to actionable next steps', () => {
  assert.equal(diagnoseApiFailure({ status: 401 }).code, 'authentication');
  assert.equal(diagnoseApiFailure({ status: 402 }).code, 'billing');
  assert.equal(diagnoseApiFailure({ status: 429 }).code, 'rate_limited');
  assert.equal(diagnoseApiFailure({ error: 'fetch failed: ECONNRESET' }).code, 'network');
  assert.equal(diagnoseApiFailure({ error: 'Model does not exist' }).code, 'unsupported_model');
  assert.equal(diagnoseApiFailure({ raw: { choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }, stage: 'answer_validation' }).code, 'truncated_answer');
  assert.ok(diagnoseApiFailure({ status: 429 }).action.includes('限流'));
});

test('default domestic models disable optional reasoning without changing the measured question', async () => {
  const original = globalThis.fetch;
  for (const model of ['deepseek/deepseek-v4.1-flash', 'qwen/qwen3.8-flash', 'bytedance-seed/seed-2-1-turbo']) {
    const f = await fixture('openrouter', 1); f.targets[0]!.model = model;
    let body: any;
    globalThis.fetch = async (_url, init) => {
      const parsedBody = JSON.parse(String(init?.body));
      if (!body) body = parsedBody;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'A complete final answer.' } }], usage: { cost: 0.001 } }));
    };
    try {
      const run = await f.run();
      assert.equal(body.reasoning?.effort, 'none', model);
      assert.equal(body.messages[0].content, f.project.queries[0]!.text);
      assert.equal(run.calls[0]?.requestParameters?.reasoning && (run.calls[0].requestParameters.reasoning as any).effort, 'none');
      assert.match(run.samples[0]!.protocolId, /reasoning=none/);
    } finally { globalThis.fetch = original; await f.cleanup(); }
  }
});

test('Cloro monitor targets share one request slot so a one-slot plan is not exceeded locally', async () => {
  const f = await fixture('cloro', 1), original = globalThis.fetch;
  const targets = ['chatgpt', 'gemini'].map(id => ({ ...f.targets[0]!, id, model: id }));
  let active = 0, peak = 0;
  globalThis.fetch = async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return new Response(JSON.stringify({ success: true, result: { text: 'A complete remote observation.' } }));
  };
  try {
    const run = await executeRun(createRun(f.project, 'live', f.project.goal, undefined, targets), f.store, undefined, undefined,
      { targets, apiKeys: { cloro: 'fixture-receipt-secret' } });
    assert.equal(peak, 1); assert.equal(run.samples.filter(s => s.analysisStatus === 'completed').length, 2);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('paid empty answer retains response, provider ID, usage and sample link; local stops are not network requests', async () => {
  const f = await fixture(), original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ id: 'generation-empty', choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'fixture-receipt-secret' } }], usage: { cost: 0.012, prompt_tokens: 12, completion_tokens: 2500, total_tokens: 2512 }, api_key: 'fixture-receipt-secret' }), { headers: { 'x-request-id': 'request-empty' } }); };
  try {
    const run = await f.run(), call = run.calls.find(c => c.purpose === 'measurement')!;
    assert.equal((call.response as any)?.id, 'generation-empty');
    assert.equal(call.costUsd, 0.012); assert.equal(receipt(call)?.sampleId, run.samples[0]!.id);
    assert.equal(receipt(call)?.dispatch, 'response_received'); assert.equal(receipt(call)?.providerRequestId, 'request-empty');
    assert.equal(receipt(call)?.costStatus, 'reported'); assert.equal(receipt(call)?.answerState, 'empty');
    assert.equal((run.samples[0]?.rawResponse as any)?.id, 'generation-empty');
    assert.equal(requests, 1); assert.equal(run.audit?.mention.denominator, 0);
    const out = exportRun(run) as any;
    assert.equal(out.apiReceipts.summary.attemptedRequests, 1); assert.equal(out.apiReceipts.summary.reportedCostUsd, 0.012);
    assert.equal(out.apiReceipts.summary.usableAnswers, 0);
    const saved = await readFile(join(f.root, 'runs', run.id + '.json'), 'utf8');
    assert.ok(saved.includes('generation-empty')); assert.ok(!saved.includes('fixture-receipt-secret'));
    assert.match(evidenceMarkdown(run), /0\.012/);
    assert.match(evidenceMarkdown(run), /truncated_answer/);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('complete API answers may have zero brand mentions while response coverage is 100 percent', async () => {
  const f = await fixture(), original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'generation-complete', model: 'actual-model', choices: [{ finish_reason: 'stop', message: { content: 'Compare other suppliers using documented requirements.' } }], usage: { cost: 0.001, total_tokens: 30 } }));
  try {
    const run = await f.run(), out = exportRun(run) as any;
    assert.equal(run.audit?.mention.value, 0); assert.equal(run.audit?.mention.denominator, 2);
    assert.equal(out.apiReceipts.summary.attemptedRequests, 2); assert.equal(out.apiReceipts.summary.usableAnswers, 2);
    assert.equal(out.apiReceipts.summary.answerRate, 1); assert.equal(out.apiReceipts.summary.reportedCostUsd, 0.002);
    for (const call of run.calls.filter(c => c.purpose === 'measurement')) {
      assert.ok(call.answer); assert.equal(receipt(call)?.answerState, 'complete');
      assert.equal(receipt(call)?.searchState, 'not_requested'); assert.equal(receipt(call)?.actualModel, 'actual-model');
    }
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('a truncated paid answer is retained, excluded and stops this target before spending on later questions', async () => {
  const f = await fixture(), original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ id: 'partial', choices: [{ finish_reason: 'length', message: { content: '衡川传感 incomplete' } }], usage: { cost: 0.02 } })); };
  try {
    const run = await f.run(), out = exportRun(run) as any;
    assert.ok(run.samples[0]?.answer); assert.equal(run.samples[0]?.analysisStatus, 'failed');
    assert.equal(requests, 1); assert.equal(out.apiReceipts.summary.usableAnswers, 0);
    assert.equal(out.apiReceipts.rows[0].answerState, 'partial'); assert.equal(out.apiReceipts.summary.costWithoutUsableAnswerUsd, 0.02);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('Cloro HTTP failure retains a safe receipt and subsequent locally blocked questions do not inflate network calls', async () => {
  const f = await fixture('cloro'), original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ request_id: 'monitor-failed', error: { message: 'fixture-receipt-secret', api_key: 'fixture-receipt-secret' } }), { status: 429, headers: { 'x-request-id': 'cloro-request' } }); };
  try {
    const run = await f.run(), call = run.calls[0]!, out = exportRun(run) as any;
    assert.equal(receipt(call)?.httpStatus, 429); assert.equal(receipt(call)?.providerRequestId, 'cloro-request');
    assert.equal((call.response as any)?.request_id, 'monitor-failed');
    assert.equal(receipt(call)?.costStatus, 'unknown'); assert.equal(requests, 1);
    assert.equal(out.apiReceipts.summary.attemptedRequests, 1); assert.equal(out.apiReceipts.summary.unknownCostRequests, 1);
    assert.equal(out.apiReceipts.summary.notStarted, 1); assert.equal(run.audit?.mention.denominator, 0);
    const saved = await readFile(join(f.root, 'runs', run.id + '.json'), 'utf8'); assert.ok(!saved.includes('fixture-receipt-secret'));
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('timeout and legacy records preserve UNKNOWN; reports never turn the absence of a cost into zero charge', async () => {
  const f = await fixture(), original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('transport timeout fixture-receipt-secret'); };
  try {
    const run = await f.run(), out = exportRun(run) as any;
    assert.equal(out.apiReceipts.summary.attemptedRequests, 1); assert.equal(out.apiReceipts.summary.unknownCostRequests, 1);
    assert.equal(out.apiReceipts.rows[0].costUsd, null); assert.equal(out.apiReceipts.rows[0].responseRetained, false);
    assert.ok(!JSON.stringify(out).includes('fixture-receipt-secret'));
    const legacy = createRun(f.project, 'replay');
    legacy.calls = [{ id: 'old-call', purpose: 'measurement', provider: 'old', model: 'old', promptHash: 'old', startedAt: '', status: 'failed', costUsd: 0.02 }];
    const old = exportRun(legacy) as any;
    assert.equal(old.apiReceipts.summary.legacyCalls, 1); assert.equal(old.apiReceipts.rows[0].dispatch, 'unknown');
    assert.equal(old.apiReceipts.summary.reportedCostUsd, 0.02); assert.equal(old.apiReceipts.summary.totalCostUsd, null);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('refusal, filtering and unfinished tools retain paid content but cannot become usable answers', async () => {
  const original = globalThis.fetch;
  for (const choice of [
    { finish_reason: 'stop', message: { content: '抱歉，我无法回答这个问题。' } },
    { finish_reason: 'content_filter', message: { content: 'Filtered partial answer.' } },
    { finish_reason: 'tool_calls', message: { content: 'I will search next.', tool_calls: [{ id: 'pending-tool' }] } },
  ]) {
    const f = await fixture(); let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ choices: [choice], usage: { cost: 0.003 } })); };
    try {
      const run = await f.run(), out = exportRun(run) as any;
      assert.equal(requests, 1); assert.equal(out.apiReceipts.summary.usableAnswers, 0);
      assert.equal(out.apiReceipts.summary.costWithoutUsableAnswerUsd, 0.003);
      assert.equal(receipt(run.calls[0]).answerState, 'rejected');
      assert.ok(run.samples[0]?.answer); assert.equal(run.samples[0]?.analysisStatus, 'failed');
      assert.equal(run.audit?.mention.denominator, 0);
    } finally { globalThis.fetch = original; await f.cleanup(); }
  }
});

test('non-JSON HTTP failure evidence survives parsing and is redacted before retention', async () => {
  const f = await fixture(), original = globalThis.fetch;
  globalThis.fetch = async () => new Response('upstream unavailable fixture-receipt-secret', { status: 502 });
  try {
    const run = await f.run();
    assert.equal((run.calls[0]?.response as any).unparsedBody, 'upstream unavailable [REDACTED]');
    assert.equal(receipt(run.calls[0]).httpStatus, 502);
    assert.equal(receipt(run.calls[0]).responseRetained, true);
    assert.equal((exportRun(run) as any).apiReceipts.summary.totalCostUsd, null);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('parallel targets retain only their own response IDs and reported costs', async () => {
  const f = await fixture('deepseek', 1), original = globalThis.fetch;
  const targets = ['one', 'two'].map(id => ({ ...f.targets[0]!, id, model: id }));
  globalThis.fetch = async (_url, init) => {
    const model = JSON.parse(String(init?.body)).model;
    if (model === 'one') await new Promise(resolve => setTimeout(resolve, 10));
    return new Response(JSON.stringify({ id: 'response-' + model, model: 'actual-' + model,
      choices: [{ finish_reason: 'stop', message: { content: 'Complete answer for ' + model } }], usage: { cost: model === 'one' ? 0.001 : 0.002 } }));
  };
  try {
    const run = await executeRun(createRun(f.project, 'live', f.project.goal, undefined, targets), f.store, undefined, undefined,
      { targets, apiKeys: { deepseek: 'fixture-receipt-secret' } });
    for (const call of run.calls.filter(c => c.purpose === 'measurement')) {
      assert.equal(receipt(call).generationId, 'response-' + call.model);
      assert.equal(receipt(call).actualModel, 'actual-' + call.model);
      const sample = run.samples.find(s => s.id === receipt(call).sampleId)!;
      assert.equal(sample.modelCallId, call.id); assert.equal(sample.costUsd, call.model === 'one' ? 0.001 : 0.002);
    }
    assert.equal((exportRun(run) as any).apiReceipts.summary.reportedCostUsd, 0.003);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('search is confirmed only from returned execution evidence and response is saved before adapter acceptance', async () => {
  const f = await fixture('openrouter', 1), original = globalThis.fetch;
  f.targets[0]!.model = 'fixture/search-receipts';
  const target = { ...f.targets[0]!, webSearch: true };
  let confirmed = false, savedBeforeAcceptance = false;
  const save = f.store.save.bind(f.store);
  f.store.save = async (kind, value) => {
    const run = value as any;
    if (kind === 'runs' && run.calls?.some((c: any) => c.status === 'running' && c.receipt?.responseRetained && c.response?.id === 'search-answer')) savedBeforeAcceptance = true;
    await save(kind, value);
  };
  globalThis.fetch = async (url: any) => String(url).endsWith('/models')
    ? new Response(JSON.stringify({ data: [{ id: target.model, supported_parameters: ['tools'], pricing: { web_search: '1' } }] }))
    : new Response(JSON.stringify({ id: 'search-answer', model: 'actual-search-model', choices: [{ finish_reason: 'stop', message: { content: 'A complete sourced answer.' } }], usage: { cost: 0.001 }, ...(confirmed ? { openrouter_metadata: { pipeline: [{ type: 'server_tools', data: { mode: 'native' } }] } } : {}) }));
  try {
    const run = async () => executeRun(createRun(f.project, 'live', f.project.goal, undefined, [target]), f.store, undefined, undefined, { targets: [target], apiKeys: { openrouter: 'fixture' } });
    const unconfirmed = await run();
    assert.equal(receipt(unconfirmed.calls[0])?.searchState, 'unconfirmed'); assert.ok(savedBeforeAcceptance);
    confirmed = true;
    const known = await run(); assert.equal(receipt(known.calls[0])?.searchState, 'confirmed');
  } finally { globalThis.fetch = original; await f.cleanup(); }
});

test('complete answer with unknown cost remains usable and blocks further paid operations', async () => {
  const f = await fixture(), original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ id: 'cost-missing', choices: [{ finish_reason: 'stop', message: { content: 'A complete answer without a reported price.' } }] })); };
  try {
    const run = await f.run(), out = exportRun(run) as any;
    assert.equal(requests, 1); assert.equal(out.apiReceipts.summary.usableAnswers, 1);
    assert.equal(out.apiReceipts.summary.unknownCostRequests, 1); assert.equal(out.apiReceipts.summary.totalCostUsd, null);
    assert.equal(out.apiReceipts.summary.notStarted, 1); assert.equal(out.apiReceipts.rows[1].dispatch, 'not_started');
    assert.equal(run.audit?.mention.value, 0);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});
