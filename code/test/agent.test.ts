import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerTruncated, findMention, auditSamples, classifyCitation, normalizeCitation, validateImport } from '../src/citekeel/analysis.js';
import { loadCases, syntheticProject } from '../src/citekeel/cases.js';
import { createRun, executeRun } from '../src/citekeel/engine.js';
import { Store } from '../src/citekeel/storage.js';
import { exportRun, redactExportText } from '../src/citekeel/report.js';
import { planActions, validateModelActions } from '../src/citekeel/skills.js';
import { createApp } from '../src/citekeel/server.js';
import type { AgentRun, Project } from '../src/citekeel/types.js';

async function temporaryStore() { const root = await mkdtemp(join(tmpdir(), 'citekeel-test-')); return { store: new Store(root), cleanup: () => rm(root, { recursive: true, force: true }) }; }

test('brand matching avoids ASCII partial matches and URL-only mentions, and retains exact offsets', () => {
  assert.equal(findMention('PostHogger is a different name.', ['PostHog']), null);
  assert.equal(findMention('Read https://posthog.com/docs for more.', ['PostHog']), null);
  const text = '可以考虑 PostHog 的分析功能。';
  const evidence = findMention(text, ['PostHog']); assert.ok(evidence);
  assert.equal(text.slice(evidence.start, evidence.end), evidence.quote);
});

test('source provenance distinguishes citations, search results, grounding and text URLs', () => {
  assert.equal(classifyCitation('provider_annotation'), 'provider_citation');
  assert.equal(classifyCitation('provider_search_result'), 'search_result');
  assert.equal(classifyCitation('provider_grounding_chunk'), 'grounding');
  assert.equal(classifyCitation('unknown'), 'answer_url');
  assert.equal(normalizeCitation({ url: 'javascript:alert(1)' }), null);
  const c = normalizeCitation({ url: 'https://example.com/', source: 'provider_annotation', providerPayloadPath: 'annotations[0].url' }, { annotations: [{ url: 'https://other.example/' }] });
  assert.equal(c?.integrity, 'mismatch');
});

test('real upstream R04 archive preserves all failures and reproduces provenance counts', async () => {
  const project = (await loadCases()).find(p => p.id === 'posthog')!;
  const audit = auditSamples(project.samples, project);
  assert.equal(audit.planned, 27); assert.equal(audit.collected, 27); assert.equal(audit.analyzed, 24);
  assert.equal(audit.analysisFailed, 3); assert.equal(audit.collectionFailed, 0);
  assert.equal(audit.providerCitations, 3); assert.equal(audit.answerUrls, 12); assert.equal(audit.citationIntegrityFailures, 0);
  for (const sample of project.samples.filter(s => s.analysisStatus === 'failed')) {
    assert.ok(sample.answer); assert.equal(audit.judgments.find(j => j.sampleId === sample.id)?.mentioned, null);
  }
});

test('no data is null, negative mentions are not positive recommendations, and failures stay out of denominators', () => {
  const p = syntheticProject();
  assert.equal(auditSamples([], p).mention.value, null);
  const negative = p.samples.find(s => s.queryId === 'q13')!;
  const a = auditSamples([negative, ...p.samples.slice(-2)], p);
  assert.equal(a.mention.numerator, 1); assert.equal(a.mention.denominator, 1);
  assert.equal(a.recommendation.numerator, 0); assert.equal(a.recommendation.denominator, 1);
  assert.equal(a.planned, 3); assert.equal(a.collectionFailed, 1); assert.equal(a.analysisFailed, 1);
});

test('manual import cannot spoof live origins or promote unauthenticated links to provider citations', () => {
  const samples = validateImport([{ question: 'How?', answer: 'See https://example.com/', origin: 'api', citations: [{ source: 'provider_annotation', url: 'https://example.com/' }] }]);
  assert.equal(samples[0].origin, 'manual'); assert.equal(samples[0].citations[0].kind, 'answer_url');
  assert.throws(() => validateImport([{ question: 'How?' }]));
});

test('public exports remove URL credentials and common secret query parameters', () => {
  const text = redactExportText('https://user:pass@example.com/page?token=sensitive-value&topic=temperature');
  assert.ok(!text.includes('sensitive-value')); assert.ok(!text.includes('user:pass'));
  assert.ok(text.includes('topic=temperature')); assert.ok(text.includes('REDACTED'));
});

test('truncation and missing fact references cannot become valid analysis or model drafts', async () => {
  assert.equal(answerTruncated({ choices: [{ finish_reason: 'length' }] }), true);
  assert.equal(answerTruncated({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }), true);
  assert.equal(answerTruncated({ choices: [{ finish_reason: 'stop' }] }), false);
  const { store, cleanup } = await temporaryStore(); const original = globalThis.fetch;
  globalThis.fetch = async (_url: any, init: any) => {
    const prompt = JSON.parse(init.body).messages[0].content;
    const content = prompt.startsWith('你是 GEO') ? '{"actions":[]}' : prompt.startsWith('请写一份') ? '保证提升 20%，无需事实来源。' : '衡川传感的回答在此截断';
    return new Response(JSON.stringify({ choices: [{ finish_reason: prompt.startsWith('请写一份') ? 'stop' : 'length', message: { content } }], usage: { cost: 0.001 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const project = syntheticProject(); project.queries = project.queries.slice(0, 1);
    const claim = project.claims.find(c => c.id === 'c-capacity')!; claim.status = 'confirmed'; claim.value = '2400 件';
    const config = { provider: 'deepseek', model: 'mock', apiKey: 'not-a-real-key', maxQuestions: 1, webSearch: false };
    const run = await executeRun(createRun(project, 'live', project.goal, config), store, config);
    assert.ok(run.samples[0].answer); assert.equal(run.samples[0].analysisStatus, 'failed');
    assert.equal(run.audit?.mention.denominator, 0); assert.equal(run.draft?.generator, 'rules');
    assert.ok(!run.draft?.markdown.includes('保证提升')); assert.ok(run.limitations.some(l => l.includes('已暂停后续模型调用')));
    assert.equal(run.calls.length, 1, 'an incomplete paid observation must stop subsequent model operations');
  } finally { globalThis.fetch = original; await cleanup(); }
});

test('workflow blocks unresolved facts, regenerates after explicit resolution and keeps old snapshots', async () => {
  const { store, cleanup } = await temporaryStore();
  try {
    const project = syntheticProject();
    const before = await executeRun(createRun(project, 'replay'), store);
    assert.equal(before.draft?.status, 'blocked'); assert.equal(before.calls.length, 0); assert.equal(before.steps.length, 8);
    assert.ok(before.actions.some(a => a.kind === 'fact' && a.priority === 'P0'));
    const claim = project.claims.find(c => c.id === 'c-capacity')!;
    claim.value = claim.alternatives![0].value; claim.status = 'confirmed';
    const after = await executeRun(createRun(project, 'replay'), store);
    assert.equal(after.draft?.status, 'draft'); assert.ok(after.draft?.markdown.includes('〔c-capacity〕'));
    assert.ok(!after.draft?.markdown.includes('已取得 ISO'));
    const saved = await store.get<AgentRun>('runs', before.id);
    assert.equal(saved?.draft?.status, 'blocked'); assert.equal(saved?.projectSnapshot.claims.find(c => c.id === 'c-capacity')?.status, 'conflict');
  } finally { await cleanup(); }
});

test('changing questions does not reuse answers from an incompatible question version', async () => {
  const { store, cleanup } = await temporaryStore();
  try {
    const project = syntheticProject(); project.queries = [{ ...project.queries[0], text: 'A changed question' }]; project.queryVersion++;
    const run = await executeRun(createRun(project, 'replay'), store);
    assert.equal(run.audit?.planned, 0); assert.equal(run.audit?.mention.value, null);
    assert.ok(run.limitations.some(l => l.includes('问题版本不匹配')));
  } finally { await cleanup(); }
});

test('model plans with fabricated evidence IDs are rejected', () => {
  const run = createRun(syntheticProject(), 'replay');
  assert.throws(() => validateModelActions([{ title: 'test', rationale: 'test', acceptance: 'test', queryIds: [], sampleIds: ['invented'], claimIds: [] }], run));
});

test('content opportunities keep candidate comparisons separate and expose review gates', () => {
  const project = syntheticProject();
  project.market = 'china';
  project.queries = [{ ...project.queries[0], id: 'candidate-q', text: '比较 PiPER、xArm 和 myCobot，按预算和 ROS 2 兼容性分段推荐。', intent: 'candidate_comparison', branded: true }];
  const run = createRun(project, 'replay');
  run.queries = structuredClone(project.queries);
  run.samples = [];
  run.audit = { planned: 0, collected: 0, analyzed: 0, collectionFailed: 0, analysisFailed: 0, mention: { numerator: 0, denominator: 0, value: null }, recommendation: { numerator: 0, denominator: 0, value: null }, judgments: [], providerCitations: 0, searchResults: 0, groundings: 0, answerUrls: 0, citationIntegrityFailures: 0, strata: [] };
  const action = planActions(project, run).find(item => item.contentType === 'comparison');
  assert.ok(action);
  assert.equal(action?.queryIds[0], 'candidate-q');
  assert.equal(action?.contentStatus, 'needs-review');
  assert.ok(action?.outline?.includes('预算/任务/软件生态分段'));
});

test('live transport uses upstream provider, isolates measurement prompts, validates plans and strips secrets', async () => {
  const { store, cleanup } = await temporaryStore(); const original = globalThis.fetch;
  const prompts: string[] = []; const key = 'citekeel-test-key-not-a-real-credential';
  globalThis.fetch = async (_url: any, init: any) => {
    const payload = JSON.parse(init.body), prompt = payload.messages[0].content; prompts.push(prompt);
    if (!prompt.startsWith('你是 GEO') && !prompt.startsWith('请写一份')) assert.equal(payload.max_tokens, 2500);
    const content = prompt.startsWith('你是 GEO') ? JSON.stringify([{ title: '补选型说明', kind: 'content', priority: 'P1', rationale: '关联确认量程', queryIds: [], sampleIds: [], claimIds: ['c-range'], acceptance: '保留参数来源' }]) : prompt.startsWith('请写一份') ? '# 选型说明\n测试量程为 -40 至 250℃。〔c-range〕' : '可考虑衡川传感，但需核验量程。';
    return new Response(JSON.stringify({ choices: [{ message: { content } }], model: 'mock-model', usage: { cost: 0.001, total_tokens: 30 }, api_key: key }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const project = syntheticProject();
    project.queries = project.queries.filter(q => !q.branded).slice(0, 2);
    const claim = project.claims.find(c => c.id === 'c-capacity')!; claim.status = 'confirmed'; claim.value = '2400 件';
    project.claims.push({ id: 'private-marker', label: '内部测试', value: 'PRIVATE_CONTEXT_SENTINEL', status: 'confirmed', sourceIds: ['s-spec'] });
    const config = { provider: 'deepseek', model: 'mock-model', apiKey: key, maxQuestions: 2, webSearch: false };
    const run = await executeRun(createRun(project, 'live', project.goal, config), store, config);
    assert.equal(run.calls.length, 4); assert.equal(run.samples.length, 2); assert.ok(run.samples.every(s => s.origin === 'api'));
    assert.equal(run.draft?.generator, 'llm'); assert.ok(run.actions.some(a => a.id.startsWith('model-action')));
    assert.ok(prompts.slice(0, 2).every(p => !p.includes('PRIVATE_CONTEXT_SENTINEL') && !p.includes(project.brand)));
    assert.ok(prompts[2].includes('PRIVATE_CONTEXT_SENTINEL'));
    const saved = await readFile(join(store.root, 'runs', `${run.id}.json`), 'utf8');
    assert.ok(!saved.includes(key)); assert.ok(saved.includes('[REDACTED]'));
    const exported = JSON.stringify(exportRun(run)); assert.ok(!exported.includes('rawResponse')); assert.ok(!exported.includes(key));
  } finally { globalThis.fetch = original; await cleanup(); }
});

test('diagnosis runs platforms concurrently, keeps web failures separate and adopts one result per unit', async () => {
  const { store, cleanup } = await temporaryStore(); const originalFetch = globalThis.fetch;
  let active = 0, maxActive = 0;
  globalThis.fetch = async (_url: unknown, init: any) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 25));
    try {
      const payload = JSON.parse(init.body), prompt = payload.messages[0].content;
      const content = prompt.startsWith('你是 GEO') ? '{"actions":[]}'
        : prompt.startsWith('请写一份') ? '本地诊断草稿。'
        : `可考虑衡川传感，回答来自 ${payload.model}。`;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], model: payload.model,
        usage: { cost: 0.001 }, citations: [{ url: 'https://example.com/source', source: 'provider_annotation', providerPayloadPath: 'citations[0].url' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    } finally { active--; }
  };
  try {
    const project = syntheticProject(); project.queries = project.queries.slice(0, 2);
    const targets = [
      { id: 'chatgpt', platform: 'ChatGPT', preferredChannel: 'web' as const, webEngine: 'chatgpt' as const, provider: 'deepseek', model: 'mock-chatgpt-api', webSearch: true },
      { id: 'deepseek', platform: 'DeepSeek', preferredChannel: 'api' as const, provider: 'deepseek', model: 'mock-deepseek', webSearch: false },
    ];
    const browser = {
      engine: 'chatgpt',
      ask: async (prompt: string) => {
        if (prompt === project.queries[0]!.text) throw new Error('Cloudflare challenge hit ChatGPT.');
        return { engine: 'chatgpt', answer: '可考虑衡川传感，网页回答有效。', citations: [], url: 'https://chatgpt.com/c/mock', evidenceId: 'browser-evidence', latencyMs: 10, protocolId: 'browser-ui/v2;engine=chatgpt' };
      },
    };
    const run = await executeRun(createRun(project, 'live', project.goal, undefined, targets), store, undefined, undefined,
      { targets, apiKeys: { deepseek: 'test-deepseek-key' }, browser });
    assert.equal(run.measurementUnits?.length, 4);
    assert.equal(run.audit?.plannedUnits, 4);
    assert.equal(run.audit?.attemptCount, 5);
    assert.equal(run.samples.filter(sample => sample.selected).length, 4);
    assert.ok(maxActive >= 2, 'API platform tasks should overlap');
    const fallbackUnit = run.measurementUnits!.find(unit => unit.queryId === project.queries[0]!.id && unit.targetId === 'chatgpt')!;
    assert.deepEqual(fallbackUnit.attempts.map(attempt => attempt.channel), ['web', 'api']);
    assert.equal(fallbackUnit.selectedChannel, 'api');
    assert.equal(fallbackUnit.attempts[0].status, 'failed');
    assert.equal(fallbackUnit.attempts[1].status, 'completed');
    const webUnit = run.measurementUnits!.find(unit => unit.queryId === project.queries[1]!.id && unit.targetId === 'chatgpt')!;
    assert.equal(webUnit.selectedChannel, 'web'); assert.equal(webUnit.attempts.length, 1);
    assert.equal(run.audit?.mention.denominator, 4);
    assert.equal(run.samples.filter(sample => sample.fallback).length, 1);
  } finally { globalThis.fetch = originalFetch; await cleanup(); }
});

test('browser-first policy falls back to API without relabeling the sample as web', async () => {
  const { store, cleanup } = await temporaryStore(); const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url: unknown, init: any) => {
    const payload = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: `API answer for ${payload.model}` } }], usage: { cost: 0.001 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const project = syntheticProject(); project.queries = project.queries.slice(0, 1);
    const target = { id: 'qwen', platform: '千问', preferredChannel: 'api' as const, provider: 'openrouter', model: 'qwen/qwen3.8-flash', webSearch: false, searchMode: 'disabled' as const, browserPreference: 'browser_first' as const };
    const run = await executeRun(createRun(project, 'live', project.goal, undefined, [target]), store, undefined, undefined, {
      targets: [target], apiKeys: { openrouter: 'fixture' },
    });
    assert.equal(run.measurementUnits?.[0]?.attempts[0]?.channel, 'web');
    assert.equal(run.measurementUnits?.[0]?.attempts[0]?.status, 'skipped');
    assert.equal(run.measurementUnits?.[0]?.attempts[1]?.channel, 'api');
    assert.equal(run.measurementUnits?.[0]?.attempts[1]?.fallback, true);
    const selected = run.samples.find(sample => sample.selected);
    assert.equal(selected?.origin, 'api');
    assert.match(selected?.protocolId || '', /mode=disabled/);
    assert.doesNotMatch(selected?.protocolId || '', /browser-ui\/v2/);
  } finally { globalThis.fetch = originalFetch; await cleanup(); }
});

test('web diagnosis asks the browser even when no API fallback is configured', async () => {
  const { store, cleanup } = await temporaryStore();
  try {
    const project = syntheticProject(); project.queries = project.queries.slice(0, 2);
    const target = { id: 'chatgpt', platform: 'ChatGPT', preferredChannel: 'web' as const, webEngine: 'chatgpt' as const };
    const asked: string[] = [];
    const run = await executeRun(createRun(project, 'live', project.goal, undefined, [target]), store, undefined, undefined, {
      targets: [target], apiKeys: {},
      browser: { engine: 'chatgpt', ask: async prompt => {
        asked.push(prompt);
        if (prompt === project.queries[0]!.text) throw new Error('ChatGPT web timed out.');
        return { engine: 'chatgpt', answer: '可考虑衡川传感，网页回答有效。', citations: [], url: 'https://chatgpt.com/c/mock', evidenceId: 'web-only', latencyMs: 8, protocolId: 'browser-ui/v2;engine=chatgpt' };
      } },
    });
    assert.deepEqual(asked, project.queries.map(query => query.text));
    assert.equal(run.samples.filter(sample => sample.origin === 'api').length, 0);
    assert.equal(run.measurementUnits?.[0]?.attempts.length, 1);
    assert.equal(run.measurementUnits?.[0]?.status, 'failed');
    assert.equal(run.measurementUnits?.[1]?.selectedChannel, 'web');
    assert.equal(run.audit?.collected, 1);
    assert.equal(run.audit?.mention.denominator, 1);
  } finally { await cleanup(); }
});

test('diagnosis HTTP route accepts a platform matrix without persisting temporary keys', async () => {
  const { store, cleanup } = await temporaryStore(); const originalFetch = globalThis.fetch; const key = 'diagnosis-route-key-not-a-real-credential';
  globalThis.fetch = async (url: RequestInfo | URL, init: any) => {
    if (!init?.body?.includes?.('"messages"')) return originalFetch(url, init);
    const payload = JSON.parse(init.body), prompt = payload.messages[0].content;
    const content = prompt.startsWith('你是 GEO') ? '{"actions":[]}' : prompt.startsWith('请写一份') ? '本地诊断草稿。' : '可考虑衡川传感，API 回答有效。';
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], model: payload.model, usage: { cost: 0.001 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { server } = await createApp(store);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo, base = `http://127.0.0.1:${address.port}`;
  try {
    const project = syntheticProject(); project.queries = project.queries.slice(0, 1); await store.save('projects', project);
    const response = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      projectId: project.id, mode: 'live', diagnosis: true, queryIds: project.queries.map(query => query.id), maxQuestions: 1,
      targets: [{ id: 'deepseek', platform: 'DeepSeek', preferredChannel: 'api', provider: 'deepseek', model: 'mock-model', webSearch: false }],
      apiKeys: { deepseek: key },
    }) });
    assert.equal(response.status, 202); const started = await response.json() as { id: string };
    let run: AgentRun;
    for (let index = 0; ; index++) {
      run = await (await fetch(`${base}/api/runs/${started.id}`)).json() as AgentRun;
      if (!['queued', 'running'].includes(run.status)) break;
      assert.ok(index < 100); await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(run.measurementUnits?.length, 1); assert.equal(run.audit?.attemptCount, 1);
    assert.equal(run.samples[0]?.model, 'deepseek/mock-model');
    const saved = await readFile(join(store.root, 'runs', `${run.id}.json`), 'utf8');
    assert.ok(!saved.includes(key)); assert.ok(saved.includes('"measurementUnits"'));
  } finally {
    globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await cleanup();
  }
});

test('local HTTP flow creates a project, imports answers, runs and exports a report', async () => {
  const { store, cleanup } = await temporaryStore(); const { server } = await createApp(store);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo, base = `http://127.0.0.1:${address.port}`;
  const request = async (path: string, method = 'GET', value?: unknown) => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(value ? { body: JSON.stringify(value) } : {}) });
    assert.ok(response.ok, await response.clone().text()); return response.json();
  };
  try {
    const status = await request('/api/status');
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(status.version, manifest.version);
    assert.deepEqual(status.diagnosisTargets.map((target: any) => target.id), ['chatgpt', 'gemini', 'deepseek', 'qwen', 'seed']);
    assert.ok(status.diagnosisTargets.slice(0, 2).every((target: any) => target.provider === 'cloro'));
    assert.ok(status.diagnosisTargets.slice(2).every((target: any) => target.provider === 'openrouter' && target.browserPreference === 'api_only' && target.searchMode === 'disabled'));
    const project = await request('/api/projects', 'POST', { brand: '临界仪器', industry: '温度仪表', brief: '产品：温度探头' }) as Project;
    await request(`/api/projects/${project.id}/claims`, 'POST', { claimId: 'claim-1', sourceId: 'user-brief' });
    await request(`/api/projects/${project.id}/samples`, 'POST', { samples: [{ question: '温度探头怎么选？', answer: '可以考虑临界仪器，先核对规格。' }] });
    const started = await request('/api/runs', 'POST', { projectId: project.id });
    let run: AgentRun;
    for (let i = 0; ; i++) {
      run = await request(`/api/runs/${started.id}`);
      if (!['queued', 'running'].includes(run.status)) break;
      assert.ok(i < 100); await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(run.audit?.mention.numerator, 1); assert.equal(run.calls.length, 0); assert.equal(run.draft?.status, 'draft');
    const report = await fetch(`${base}/api/runs/${run.id}/report`); assert.ok((await report.text()).includes('临界仪器'));
    const forbidden = await fetch(base + '/api/projects', { headers: { Origin: 'https://elsewhere.example' } }); assert.equal(forbidden.status, 403);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await cleanup(); }
});

test('diagnosis retains target failure state across questions and makes no further network calls', async () => {
 const {store,cleanup}=await temporaryStore();const original=globalThis.fetch;let failedRouteCalls=0;
 globalThis.fetch=async (_url:unknown,init:any)=>{const p=JSON.parse(init.body);if(p.model==='blocked-model'){failedRouteCalls++;return new Response(JSON.stringify({error:{message:'Model is not available in your region'}}),{status:403});}return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'衡川传感'}}],usage:{cost:0.001}}),{status:200,headers:{'content-type':'application/json'}});};
 try{const p=syntheticProject();p.queries=p.queries.slice(0,3);const targets=[{id:'blocked',platform:'Blocked',provider:'deepseek',model:'blocked-model',preferredChannel:'api' as const}];const r=await executeRun(createRun(p,'live',p.goal,undefined,targets),store,undefined,undefined,{targets,apiKeys:{deepseek:'fixture'}});assert.equal(failedRouteCalls,1);assert.equal(r.measurementUnits?.length,3);assert.equal(r.samples.filter(s=>s.analysisStatus==='completed').length,0);assert.match(r.samples[1]?.error||'',/暂停后续模型调用/);}finally{globalThis.fetch=original;await cleanup();}
});

test('managed diagnosis resolves platform IDs on the server and provider settings never return credentials', async () => {
 const {store,cleanup}=await temporaryStore();const original=globalThis.fetch;
 const previousOpenRouter=process.env.OPENROUTER_API_KEY,previousCloro=process.env.CLORO_API_KEY;
 const key='fixture-managed-key',cloroKey='fixture-monitor-key';const requests:any[]=[];
 globalThis.fetch=async(url:any,init:any)=>{
  if (!String(url).startsWith('https://openrouter.ai/'))return original(url,init);
  const payload=JSON.parse(init.body);requests.push(payload);
  const prompt=payload.messages[0].content;
  const content=prompt.startsWith('你是 GEO')?'[]':prompt.startsWith('请写一份')?'No verified facts.':'A sourced observation of the robotics selection criteria.';
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}],usage:{cost:0.001}}),{headers:{'content-type':'application/json'}});
 };
 const {server}=await createApp(store);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const post=(path:string,value:object)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
 try {
  const saved=await post('/api/provider-session',{openrouter:key,cloro:cloroKey});assert.equal(saved.status,200);
  assert.ok(!(await saved.text()).includes(key));
  const statusText=await(await fetch(base+'/api/status')).text();assert.ok(!statusText.includes(key));assert.ok(!statusText.includes(cloroKey));
  const project=syntheticProject();await store.save('projects',project);
  const response=await post('/api/runs',{projectId:project.id,mode:'live',diagnosis:true,queryIds:[project.queries[0].id],targetIds:['qwen']});
  assert.equal(response.status,202);const {id}=await response.json();let run:AgentRun;
  for(let i=0;;i++){run=await(await fetch(base+`/api/runs/${id}`)).json();if(!['queued','running'].includes(run.status))break;assert.ok(i<100);await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(run.measurementTargets?.[0].model,'qwen/qwen3.8-flash');assert.equal(run.measurementTargets?.[0].browserPreference,'api_only');
  assert.equal(run.measurementUnits?.[0].attempts.length,1);assert.equal(run.measurementUnits?.[0].attempts[0].channel,'api');
  assert.ok(requests.some(r=>r.model==='qwen/qwen3.8-flash'));
  assert.ok(!(await readFile(join(store.root,'runs',id+'.json'),'utf8')).includes(key));
 } finally {
  globalThis.fetch=original;
  if(previousOpenRouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previousOpenRouter;
  if(previousCloro===undefined)delete process.env.CLORO_API_KEY;else process.env.CLORO_API_KEY=previousCloro;
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await cleanup();
 }
});
