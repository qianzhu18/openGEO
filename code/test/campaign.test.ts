import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectSources, digest, readEvidence } from '../src/citekeel/campaign/evidence.js';
import { importAttempt } from '../src/citekeel/campaign/import-attempt.js';
import { compareCampaigns, runCampaign, validateCampaign, writeCampaign } from '../src/citekeel/campaign/run.js';
import { renderCampaign } from '../src/citekeel/campaign/render.js';
import { renderCampaignComparison } from '../src/citekeel/campaign/render.js';
import type { CampaignAttempt, CampaignProtocol, CampaignSpec } from '../src/citekeel/campaign/model.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-campaign-'));
  const spec: CampaignSpec = {
    schemaVersion: 'opengeo-campaign/v1', id: 'alpha-case', round: 1, asOf: '2026-11-05', brand: 'Alpha', aliases: ['Alpha Robotics'], domain: 'alpha.example', objective: 'Prepare a public source-backed research case.', access: 'external-public-only', platforms: ['chatgpt', 'gemini'],
    sources: [{ id: 'S1', url: 'https://alpha.example/arm', title: 'Alpha arm', kind: 'official-site' }],
    claims: [{ id: 'C1', sourceId: 'S1', quote: 'The arm has a documented interface.', statement: 'The vendor describes an interface.', scope: 'Arm documentation', review: 'source-checked' }],
    audiences: [{ id: 'U1', name: 'Research engineer', job: 'Evaluate an arm', decision: 'Select a task test', concerns: ['Version compatibility'], basis: 'hypothesis', claimIds: ['C1'], validateWith: 'Interview an engineer' }],
    questions: [{ id: 'Q1', text: 'Which robot arms should a research lab evaluate?', language: 'en', branded: false, audienceId: 'U1', stage: 'discovery', revision: 1, origin: 'editorial-hypothesis', reason: 'Test supplier discovery' }],
    assets: [{ id: 'A1', title: 'An arm evaluation checklist', language: 'en', audienceId: 'U1', questionIds: ['Q1'], priority: 'P1', format: 'guide', channel: 'Owned site proposal', existingUrl: null, proposedPath: '/guides/arms', objective: 'Help choose task evidence', reason: 'Support a concrete decision', requiredMaterials: ['Versioned manual'], acceptance: 'Reader can specify a task', linksTo: [], sections: [{ heading: 'Check documentation', text: 'The vendor describes an interface; confirm the exact revision.', claimIds: ['C1'] }] }],
    findings: [{ id: 'F1', title: 'Documentation exists', observation: 'The vendor has a public interface description.', implication: 'Use it as a review starting point.', action: 'Confirm the version.', basis: 'public-source', claimIds: ['C1'], attemptIds: [] }],
    executiveSummary: { situation: 'Public documentation exists, but AI visibility is unknown.', impact: 'The team can review drafts without claiming visibility gains.', nextAction: 'Collect one eligible baseline sample.' },
    baselinePlan: [{ id: 'B1', questionId: 'Q1', platform: 'chatgpt', rationale: 'Establish one eligible discovery baseline.' }],
    publications: [], samplingNote: 'Xue is not connected. No AI web samples collected.',
  };
  const sources = await collectSources(root, spec.sources, async url => ({ url, contentType: 'text/html', text: '<main><h1>Alpha arm</h1><p>The arm has a documented interface.</p><p>Check the relevant version before integration.</p></main>' }));
  await writeFile(join(root, '01-案例策划.json'), JSON.stringify(spec));
  await writeFile(join(root, '02-来源归档.json'), JSON.stringify(sources));
  await writeFile(join(root, '03-采样记录.json'), '[]');
  const protocol: CampaignProtocol = { channel: 'web-ui', platform: 'chatgpt', model: 'recorded-model', region: 'recorded-region', language: 'en', loginState: 'signed-in', session: 'fresh', profile: 'Xue' };
  const capturedAt = '2026-11-05T10:00:00Z';
  async function attempt(id: string, answer = 'Alpha is one candidate. Review task logs before choosing a robot arm.'): Promise<CampaignAttempt> {
    const path = `evidence/${id}`;
    await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, path, 'answer.txt'), answer);
    await writeFile(join(root, path, 'page.html'), '<p>Offline test fixture, not a real account</p>');
    await writeFile(join(root, path, 'screenshot.png'), 'offline-fixture');
    await writeFile(join(root, path, 'evidence.json'), JSON.stringify({ chromeProfile: 'Xue', channel: 'web-ui', engine: 'chatgpt', prompt: spec.questions[0]!.text, language: protocol.language,
      model: protocol.model, region: protocol.region, loginState: protocol.loginState, session: protocol.session, capturedAt, citations: [], citationStatus: 'complete' }));
    return { id, jobId: id, questionId: 'Q1', questionText: spec.questions[0]!.text, questionRevision: 1, capturedAt, status: 'completed', protocol: structuredClone(protocol), evidence: { answer: path + '/answer.txt', html: path + '/page.html', screenshot: path + '/screenshot.png', metadata: path + '/evidence.json', sha256: digest(answer) } };
  }
  return { root, spec, sources, protocol, attempt, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('campaign replays deterministically, preserves evidence, and keeps unmeasured metrics and business effects unknown', async () => {
  const f = await fixture();
  try {
    const run = await writeCampaign(f.root);
    assert.equal(run.readiness.aiBaseline, 'not-collected');
    assert.ok(run.metrics.every(row => row.value === null && row.denominator === 0));
    assert.equal(run.readiness.effect, 'unknown');
    assert.ok(run.claims.every(claim => !claim.publishableAsFact));
    const texts = renderCampaign(f.spec, run);
    const before = JSON.stringify(texts);
    const hashes = await Promise.all(f.sources.map(source => readFile(join(f.root, source.textFile!))));
    await writeCampaign(f.root);
    for (const [path, text] of Object.entries(texts)) assert.equal(await readFile(join(f.root, path), 'utf8'), text);
    assert.equal(JSON.stringify(renderCampaign(f.spec, run)), before);
    for (const [i, source] of f.sources.entries()) assert.deepEqual(await readFile(join(f.root, source.textFile!)), hashes[i]);
    const project = JSON.parse(texts['工作台项目.json']!);
    assert.equal(project.claims[0].status, 'unconfirmed');
    assert.ok(!texts['内容草稿/A1.md']!.includes('AgileX'));
    assert.equal(run.stages.find(stage => stage.id === 'content')!.executor, 'editorial-input');
  } finally { await f.cleanup(); }
});

test('campaign rejects invented references and changed source excerpts, and holds drafts for pending or conflicting claims', async () => {
  const f = await fixture();
  try {
    const bad = structuredClone(f.spec); bad.assets[0]!.questionIds = ['missing'];
    assert.throws(() => validateCampaign(bad), /引用/);
    const unobservedPage = structuredClone(f.spec); unobservedPage.assets[0]!.existingUrl = 'https://alpha.example/not-reviewed';
    assert.throws(() => validateCampaign(unobservedPage), /实际指定来源/);
    const wrongQuote = structuredClone(f.spec); wrongQuote.claims[0]!.quote = 'Vendor has a guaranteed success rate.';
    await assert.rejects(runCampaign(f.root, wrongQuote, f.sources, []), /原文/);
    const pending = structuredClone(f.spec); pending.claims[0]!.review = 'conflict';
    const run = await runCampaign(f.root, pending, f.sources, []);
    assert.equal(run.readiness.content, 'briefs-only');
    const blocked = renderCampaign(pending, run)['内容草稿/A1.md']!;
    assert.ok(!blocked.includes(f.spec.assets[0]!.sections[0]!.text));
    await writeFile(join(f.root, f.sources[0]!.textFile!), 'Changed source');
    await assert.rejects(runCampaign(f.root, f.spec, f.sources, []), /归档被修改/);
  } finally { await f.cleanup(); }
});

test('campaign measurements exclude wrong profiles, login walls, bad hashes, missing evidence and retries without pooling protocols', async () => {
  const f = await fixture();
  try {
    const valid = await f.attempt('valid');
    await writeFile(join(f.root, valid.evidence!.metadata!), JSON.stringify({ chromeProfile: 'Xue', channel: 'web-ui', engine: 'chatgpt', prompt: valid.questionText,
      language: valid.protocol.language, model: valid.protocol.model, region: valid.protocol.region, loginState: valid.protocol.loginState, session: valid.protocol.session,
      capturedAt: valid.capturedAt, citations: ['https://alpha.example/arm', 'file:///private', 'https://alpha.example/?token=secret'], citationStatus: 'partial' }));
    const retry = { ...valid, id: 'repeat' };
    const failed = { ...valid, id: 'failed', jobId: 'failed-job', status: 'failed' as const, failureReason: 'challenge' };
    const wrongProfile = { ...valid, id: 'wrong-profile', jobId: 'wrong-profile-job', protocol: { ...valid.protocol, profile: null } };
    const changedQuestion = { ...valid, id: 'changed-q', jobId: 'changed-q-job', questionText: 'A different question' };
    const badHash = { ...valid, id: 'bad-hash', jobId: 'bad-hash-job', evidence: { ...valid.evidence!, sha256: 'bad' } };
    const missing = { ...valid, id: 'missing-shot', jobId: 'missing-shot-job', evidence: { ...valid.evidence!, screenshot: undefined } };
    const wall = await f.attempt('wall', 'Please sign in to continue.');
    const another = await f.attempt('another', 'Beta is one candidate.'); another.protocol.model = 'another-model';
    await writeFile(join(f.root, another.evidence!.metadata!), JSON.stringify({ chromeProfile: 'Xue', channel: 'web-ui', engine: 'chatgpt', prompt: another.questionText,
      language: another.protocol.language, model: another.protocol.model, region: another.protocol.region, loginState: another.protocol.loginState,
      session: another.protocol.session, capturedAt: another.capturedAt, citations: [], citationStatus: 'complete' }));
    const run = await runCampaign(f.root, f.spec, f.sources, [valid, retry, failed, wrongProfile, changedQuestion, badHash, missing, wall, another]);
    assert.equal(run.attempts.filter(row => row.eligible).length, 2);
    assert.deepEqual(run.attempts[0]!.visibleUrls, ['https://alpha.example/arm']);
    assert.equal(run.attempts[0]!.citationExtraction, 'partial');
    const rows = run.metrics.filter(row => row.platform === 'chatgpt');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => row.denominator), [1, 1]);
    assert.deepEqual(rows.map(row => row.value), [1, 0]);
    assert.equal(run.metrics.find(row => row.platform === 'gemini')!.value, null);
    assert.ok(run.attempts.filter(row => !row.eligible).every(row => row.mentioned === null));
    const changedRetry = { ...valid, id: 'bad-retry', questionRevision: 2 };
    await assert.rejects(runCampaign(f.root, f.spec, f.sources, [valid, changedRetry]), /重试/);
  } finally { await f.cleanup(); }
});

test('attempt importer normalizes captured answers, validates Xue evidence, and preserves failed attempts', async () => {
  const f = await fixture();
  try {
    const incoming = 'evidence/incoming/Q1-chatgpt';
    await mkdir(join(f.root, incoming), { recursive: true });
    const capturedAnswer = 'Alpha is one candidate. Review task logs before choosing a robot arm.';
    const metadata = {
      chromeProfile: 'Xue', channel: 'web-ui', engine: 'chatgpt', prompt: f.spec.questions[0]!.text, language: 'en',
      model: f.protocol.model, region: f.protocol.region, loginState: f.protocol.loginState, session: f.protocol.session,
      capturedAt: '2026-11-05T11:00:00Z', answer: capturedAnswer, citations: ['https://alpha.example/arm'], citationStatus: 'complete',
    };
    await writeFile(join(f.root, incoming, 'answer.txt'), `${f.spec.questions[0]!.text}\n\n---\n\n${capturedAnswer}`);
    await writeFile(join(f.root, incoming, 'page.html'), '<main>answer page</main>');
    await writeFile(join(f.root, incoming, 'screenshot.png'), 'offline-capture');
    await writeFile(join(f.root, incoming, 'evidence.json'), JSON.stringify(metadata));
    const imported = await importAttempt(f.root, f.spec, [], { id: 'imported', questionId: 'Q1', platform: 'chatgpt', evidence: incoming });
    assert.equal(imported.evidence!.sha256, digest(capturedAnswer));
    const run = await runCampaign(f.root, f.spec, f.sources, [imported]);
    assert.equal(run.attempts[0]!.eligible, true);
    assert.equal(run.attempts[0]!.answer, capturedAnswer);
    assert.deepEqual(run.attempts[0]!.visibleUrls, ['https://alpha.example/arm']);
    await assert.rejects(importAttempt(f.root, f.spec, [imported], { id: 'imported', questionId: 'Q1', platform: 'chatgpt', evidence: incoming }), /ID 已存在/);
    const changed = { ...metadata, prompt: 'Another question' };
    await writeFile(join(f.root, incoming, 'evidence.json'), JSON.stringify(changed));
    await assert.rejects(importAttempt(f.root, f.spec, [imported], { id: 'bad-metadata', questionId: 'Q1', platform: 'chatgpt', evidence: incoming }), /metadata/);
    await writeFile(join(f.root, incoming, 'evidence.json'), JSON.stringify(metadata));
    const failed = await importAttempt(f.root, f.spec, [imported], { id: 'failed-import', jobId: 'imported', questionId: 'Q1', platform: 'chatgpt', evidence: incoming, failureReason: 'login wall' });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.evidence?.answer, undefined);
    assert.ok(failed.evidence?.html && failed.evidence.screenshot && failed.evidence.metadata);
    const failedRun = await runCampaign(f.root, f.spec, f.sources, [imported, failed]);
    assert.equal(failedRun.attempts.find(row => row.attempt.id === 'failed-import')!.exclusion, 'login wall');
    assert.equal(failedRun.attempts.find(row => row.attempt.id === 'failed-import')!.mentioned, null);
  } finally { await f.cleanup(); }
});

test('two campaign rounds compare only known matching protocols, question versions and brand aliases, without claiming effects', async () => {
  const f = await fixture();
  try {
    const beforeAttempt = await f.attempt('before', 'Beta is one candidate.');
    const afterAttempt = await f.attempt('after');
    const before = await runCampaign(f.root, f.spec, f.sources, [beforeAttempt]);
    const afterSpec = structuredClone(f.spec); afterSpec.round = 2;
    const after = await runCampaign(f.root, afterSpec, f.sources, [afterAttempt]);
    const row = compareCampaigns(before, after).find(row => row.platform === 'chatgpt')!;
    assert.equal(row.comparable, true); assert.equal(row.delta, 1); assert.equal(row.causalEffect, null); assert.equal(row.publicationVerified, false);
    const comparisonReport = renderCampaignComparison(f.spec.brand, compareCampaigns(before, after));
    assert.ok(comparisonReport.includes('不证明内容导致变化'));
    assert.ok(comparisonReport.includes('100%'));
    const unknown = structuredClone(afterAttempt); unknown.protocol.region = null;
    const unknownAfter = await runCampaign(f.root, afterSpec, f.sources, [unknown]);
    assert.equal(compareCampaigns(before, unknownAfter).find(row => row.platform === 'chatgpt')!.delta, null);
    const sentinel = structuredClone(afterAttempt); sentinel.protocol.region = 'UNKNOWN';
    const sentinelAfter = await runCampaign(f.root, afterSpec, f.sources, [sentinel]);
    assert.equal(compareCampaigns(before, sentinelAfter).find(row => row.platform === 'chatgpt')!.delta, null);
    assert.throws(() => compareCampaigns(after, before), /轮次/);
    const changed = structuredClone(afterSpec); changed.questions[0]!.revision = 2;
    const versioned = { ...afterAttempt, questionRevision: 2 };
    const changedAfter = await runCampaign(f.root, changed, f.sources, [versioned]);
    assert.equal(compareCampaigns(before, changedAfter).find(row => row.platform === 'chatgpt')!.comparable, false);
    const alias = structuredClone(afterSpec); alias.aliases.push('Another company');
    await assert.rejects(async () => compareCampaigns(before, await runCampaign(f.root, alias, f.sources, [afterAttempt])), /别名/);
  } finally { await f.cleanup(); }
});

test('source collector records failures and provenance, reads only explicit public URLs and rejects path traversal', async () => {
  const f = await fixture();
  try {
    const requested: string[] = [];
    const sources = await collectSources(f.root, [{ id: 'S2', url: 'https://alpha.example/other', title: 'Other', kind: 'official-site' }, { id: 'S3', url: 'http://127.0.0.1/private', title: 'Invalid', kind: 'official-site' }], async url => { requested.push(url); return null; });
    assert.deepEqual(requested, ['https://alpha.example/other']);
    assert.ok(sources.every(source => source.status === 'failed' && !source.textFile));
    assert.equal(sources[0]!.captureMethod, 'http');
    await assert.rejects(readEvidence(f.root, '../outside.txt'), /路径/);
    assert.ok((await readdir(f.root)).includes('sources'));
  } finally { await f.cleanup(); }
});
