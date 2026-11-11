import { test, expect } from '@playwright/test';
import { textPdf } from '../fixtures/pdf.js';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../../src/citekeel/storage.js';
import { createRun } from '../../src/citekeel/engine.js';
import type { Project, Sample } from '../../src/citekeel/types.js';

const projectId = 'international-browser-workspace';
const runIds = ['international-browser-run-a', 'international-browser-run-b'];
const store = new Store('data/browser-tests');
const question = 'Which analytics tools help software teams understand product usage?';

function fixtureProject(): Project {
  const now = new Date().toISOString();
  return { id: projectId, name: 'Acme Analytics', brand: 'Acme', aliases: ['Acme Analytics'], domain: 'acme.example', industry: 'Product analytics', description: 'Product analytics for software teams.', origin: 'manual', goal: 'Establish a sourced API visibility baseline.', market: 'international', language: 'en', country: 'US',
    topics: [{ id: 'topic-product-analytics', name: 'Product analytics', sourceIds: ['website-home'] }],
    sources: [{ id: 'website-home', title: 'Acme homepage', url: 'https://acme.example/', text: 'Acme provides product analytics for software teams.' }],
    claims: [{ id: 'claim-description', label: 'Website description', value: 'Product analytics for software teams.', status: 'unconfirmed', sourceIds: ['website-home'] }],
    queries: Array.from({ length: 6 }, (_, index) => ({ id: `stable-prompt-${index + 1}`, text: index === 0 ? question : `What should teams verify about product analytics option ${index + 1}?`, intent: 'informational', branded: false, origin: 'source-derived template', status: 'active' as const, topicId: 'topic-product-analytics', country: 'US', language: 'en' })),
    queryVersion: 1, samples: [], createdAt: now, updatedAt: now };
}

function sample(id: string, protocolId: string, answer: string, failed = false): Sample {
  return { id, queryId: 'stable-prompt-1', question, intent: 'informational', branded: false, origin: 'api', model: 'openrouter/fixture-model', observedAt: new Date().toISOString(), runGroup: protocolId, protocolId, collectionStatus: failed ? 'failed' : 'completed', analysisStatus: failed ? 'unknown' : 'completed', answer, citations: answer.includes('Acme') ? [{ url: 'https://docs.example.com/analytics', kind: 'provider_citation', source: 'provider_annotation', integrity: 'matched' }] : [], ...(failed ? { error: 'Fixture provider timeout; no answer collected.' } : {}) };
}

test.beforeEach(async () => {
  const project = fixtureProject(); await store.save('projects', project);
  const first = createRun(project, 'live'); first.id = runIds[0]!; first.status = 'completed'; first.createdAt = new Date(Date.now() - 3600_000).toISOString(); first.steps = []; first.samples = [sample('answer-a', 'api-fixture;search=false', 'Acme is one option to consider for product analytics.'), sample('answer-failed', 'api-fixture;search=false', '', true)];
  const second = createRun(project, 'live'); second.id = runIds[1]!; second.status = 'completed'; second.steps = []; second.samples = [sample('answer-b', 'api-fixture;search=true', 'Other tools can help teams understand feature adoption.')]; second.actions = [{ id: 'action-sources', title: 'Improve the product analytics evidence page', kind: 'content', priority: 'P1', rationale: 'The second observation did not mention Acme.', queryIds: ['stable-prompt-1'], sampleIds: ['answer-b'], claimIds: [], acceptance: 'Publish a sourced explanation and repeat the same protocol.', status: 'proposed' }];
  await store.save('runs', first); await store.save('runs', second);
});

test.afterAll(async () => {
  await Promise.all([rm(join(store.root, 'projects', `${projectId}.json`), { force: true }), ...runIds.map(id => rm(join(store.root, 'runs', `${id}.json`), { force: true }))]);
});

test('international workspace keeps cohorts separate and opens cross-run original evidence', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/workspace?project=${projectId}`);
  await expect(page.getByRole('heading', { name: 'Your brand, in AI answers' })).toBeVisible();
  await expect(page.locator('.cohort-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Analysis run', { exact: true }).selectOption(runIds[0]!);
  await expect(page.locator('.da-metrics')).toContainText('1/2');
  await expect(page.getByText('Only brands tracked in this run.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prompts', exact: true })).toBeVisible();
  await expect(page.locator('.prompt-table tbody tr')).toHaveCount(6);
  await page.getByRole('button', { name: question, exact: true }).click();
  await expect(page.getByRole('heading', { name: question, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read original answer' })).toHaveCount(3);
  await page.getByRole('button', { name: 'Read original answer' }).first().click();
  await expect(page.locator('#evidence-dialog .answer-text')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Close evidence' }).click();
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(page.locator('.da-source')).toHaveCount(1);
  await page.locator('.da-panel').filter({ has: page.getByRole('heading', { name: 'Source distribution' }) }).getByRole('button', { name: 'Read answer', exact: true }).click();
  await expect(page.locator('#evidence-dialog .answer-text')).toContainText('Acme is one option');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await mkdir('artifacts/international-mvp', { recursive: true });
  await page.screenshot({ path: 'artifacts/international-mvp/workspace.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('chart citations keep intent denominators separate and keyboard evidence stays accessible', async ({ page }) => {
  const project = fixtureProject(), run = createRun(project, 'replay');
  run.id = runIds[1]!; run.status = 'completed'; run.steps = [];
  run.samples = [
    { ...sample('chart-natural', 'same-protocol', 'Acme provides a documented analytics option.'), intent: 'natural' },
    { ...sample('chart-comparison', 'same-protocol', 'Compare the two supplied candidates.'), intent: 'candidate_comparison' },
    { ...sample('chart-failed', 'same-protocol', '', true), intent: 'branded_fact' },
  ];
  await store.save('runs', run);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/workspace?project=${projectId}&run=${run.id}`);
  await expect(page.getByRole('heading', { name: 'Cohort comparison', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Citation coverage', exact: true }).click();
  const bars = page.locator('.da-comparison-row');
  await expect(bars).toHaveCount(3);
  expect(await bars.evaluateAll(nodes => nodes.map(node => JSON.parse((node as HTMLElement).dataset.chartPoint!)).map(p => [p.value, p.ratio]))).toEqual([['100.0%', '1/1'], ['0.0%', '0/1'], ['UNKNOWN', '0/0']]);
  await expect(bars.nth(2)).toBeDisabled();
  const legends = page.locator('[data-series-toggle]');
  await legends.first().focus();
  await expect(page.locator('.cohort-table tbody tr').first()).toHaveClass(/is-highlighted/);
  await expect(bars.nth(1)).toHaveClass(/is-dimmed/);
  await page.keyboard.press('Enter');
  await expect(legends.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(bars.first()).toBeHidden();
  await page.keyboard.press('Enter');
  await bars.first().focus();
  await expect(page.getByRole('tooltip')).toContainText('100.0% (1/1)');
  expect(await page.locator('.da-chart-region').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('#evidence-dialog .answer-text')).toContainText('Acme provides a documented analytics option.');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('multi-day chart uses actual date spacing and leaves missing observations disconnected', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 550 });
  const project = fixtureProject(), run = createRun(project, 'replay');
  run.id = runIds[1]!; run.status = 'completed'; run.steps = [];
  run.samples = [
    { ...sample('chart-zero', 'trend-protocol', 'Other tools are available.'), observedAt: '2026-11-06T12:00:00Z' },
    { ...sample('chart-full', 'trend-protocol', 'Acme is an available option.'), observedAt: '2026-11-08T12:00:00Z' },
    { ...sample('chart-next', 'trend-protocol', 'Acme has documentation.'), observedAt: '2026-11-09T12:00:00Z' },
    { ...sample('other-middle', 'other-protocol', 'Other tools are available.'), model: 'fixture/other', observedAt: '2026-11-07T12:00:00Z' },
  ];
  await store.save('runs', run);
  await page.goto(`/workspace?project=${projectId}&run=${run.id}`);
  await expect(page.getByRole('heading', { name: 'Observed trend', exact: true })).toBeVisible();
  const series = page.locator('.da-chart .chart-series').first();
  const points = series.locator('.da-point');
  await expect(points).toHaveCount(3);
  await expect(series.locator('polyline')).toHaveCount(1);
  const coordinates = await points.evaluateAll(nodes => nodes.map(node => {
    const dot = node.querySelector('.da-point-dot')!;
    return { x: Number(dot.getAttribute('cx')), y: Number(dot.getAttribute('cy')) };
  }));
  expect(coordinates[0]!.y).toBe(225);
  expect(coordinates[1]!.y).toBe(35);
  expect((coordinates[1]!.x - coordinates[0]!.x) / (coordinates[2]!.x - coordinates[1]!.x)).toBeCloseTo(2);
  const line = await series.locator('polyline').getAttribute('points');
  expect(line).not.toContain(`${coordinates[0]!.x},${coordinates[0]!.y}`);
  await points.nth(1).focus();
  // Flush the browser's automatic focus scroll before checking the description.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(points.nth(1)).toBeFocused();
  await expect(page.getByRole('tooltip')).toContainText('2026-11-08 · 100.0% (1/1)');
  await page.keyboard.press('Enter');
  await expect(page.locator('#evidence-dialog .answer-text')).toContainText('Acme is an available option.');
});

test('measurement chooses platforms with managed models and no browser or model fields', async ({ page }) => {
  await page.goto(`/workspace?project=${projectId}&view=agent`);
  await expect(page.getByRole('heading', { name: 'Measure, review, improve' })).toBeVisible();
  await expect(page.locator('label').filter({has:page.locator('input[name=targetIds][value=chatgpt]')})).toContainText('openrouter');
  await expect(page.locator('label').filter({has:page.locator('input[name=targetIds][value=chatgpt]')})).toContainText('not a ChatGPT web observation');
  await expect(page.locator('input[name=model],select[name=channel]')).toHaveCount(0);
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/runs', async route => { if (route.request().method() !== 'POST') { await route.continue(); return; } payload = route.request().postDataJSON(); await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: runIds[1] }) }); });
  await page.getByRole('button', { name: 'Start brand diagnosis', exact: true }).click();
  await expect.poll(() => payload?.diagnosis).toBe(true);
  expect(payload?.maxQuestions).toBe(5);
  expect(payload?.targetIds).toEqual(['chatgpt','gemini','deepseek','qwen','seed']);
  expect(payload?.model).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Start brand diagnosis', exact: true })).toBeEnabled();
});

test('mobile project review and failure evidence remain usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(`/workspace?project=${projectId}&view=project`);
  await expect(page.getByRole('heading', { name: 'Project', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Review Website description', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirm selected facts', exact: true }).click();
  await expect(page.getByText('confirmed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: question, exact: true }).click();
  await page.locator('#evidence-dialog [data-sample="answer-failed"]').click();
  await expect(page.getByText('Mention: unknown', { exact: true })).toBeVisible();
  await expect(page.locator('#evidence-dialog .answer-text')).toContainText('No answer text was collected.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('recording pool keeps URLs as source inputs and can be removed', async ({ page }) => {
  await page.goto(`/workspace?project=${projectId}&view=recording`);
  await expect(page.getByRole('heading', { name: 'Recording', exact: true })).toBeVisible();
  await expect(page.getByText('No URLs recorded yet', { exact: false })).toBeVisible();
  await page.fill('#recording-form input[name=url]', 'https://docs.example.com/guide');
  await page.click('#recording-form button[type=submit]');
  await expect(page.locator('.source-table tbody tr')).toHaveCount(1);
  await expect(page.getByText('https://docs.example.com/guide', { exact: false })).toBeVisible();
  await page.locator('.source-table tbody tr input[type=checkbox]').check();
  await expect(page.getByText('1 / 5 selected', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('No URLs recorded yet', { exact: false })).toBeVisible();
});


test('project imports a local PDF with page provenance and shows unsupported files as errors', async ({ page }) => {
  await page.goto(`/workspace?project=${projectId}&view=project`);
  const form = page.locator('[data-brand-source]');
  await form.getByLabel('Source type').selectOption('file');
  await expect(form.getByLabel('Local brand file (PDF / TXT / MD, up to 1MB)')).toBeVisible();
  await form.getByLabel('Local brand file (PDF / TXT / MD, up to 1MB)').setInputFiles({ name: 'fixture-manual.pdf', mimeType: 'application/pdf', buffer: textPdf() });
  await form.getByRole('button', { name: 'Import source', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'fixture-manual.pdf · 第 1 页', exact: true })).toBeVisible();
  await page.getByText('Add a fact from a source', { exact: true }).click();
  await page.locator('[data-brand-claim]').getByLabel('Source / page').selectOption({ label: 'fixture-manual.pdf · 第 1 页' });
  await form.getByLabel('Source type').selectOption('file');
  await form.getByLabel('Local brand file (PDF / TXT / MD, up to 1MB)').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('broken') });
  await form.getByRole('button', { name: 'Import source', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('PDF');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'data/browser-tests/brand-sources-desktop.png', fullPage: true });
});

test('analysis scope and exported report agree, with inert HTML and usable mobile tables', async ({ page, request }) => {
  await page.goto(`/workspace?project=${projectId}`);
  await page.getByLabel('Analysis run', { exact: true }).selectOption(runIds[0]!);
  await expect(page.locator('.da-metrics')).toContainText('1/2');
  await expect(page.getByRole('heading', { name: 'Measurement units and failures' })).toBeVisible();
  await expect(page.locator('.diagnostic')).toContainText('Fixture provider timeout');
  const base = `/api/runs/${runIds[0]}`;
  const analysis = await (await request.get(base + '/analytics?channel=api')).json();
  expect(analysis.quality.valid).toBe(1); expect(analysis.quality.planned).toBe(2);
  const markdown = await (await request.get(base + '/report?channel=api')).text();
  expect(markdown).toContain('**1/2**'); expect(markdown).not.toContain('Fixture provider timeout');
  const evidenceResponse = await request.get(base + '/report-evidence?channel=api');
  expect(evidenceResponse.status()).toBe(200);
  const evidence = await evidenceResponse.text();
  expect(evidence).toContain('Fixture provider timeout'); expect(evidence).toContain('Original answers');
  const evidenceHtml = await request.get(base + '/report-evidence-html?channel=api');
  expect(evidenceHtml.status()).toBe(200); expect(await evidenceHtml.text()).toContain('Fixture provider timeout');
  expect(markdown).not.toContain('## Content'); expect(markdown).not.toContain('## Actions');
  const html = await (await request.get(base + '/report-html?channel=api')).text();
  expect(html).toContain('<!doctype html>'); expect(html).toContain('<table>');
  await page.locator('.export-menu > summary').click();
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Brief HTML', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('.html');
  await page.getByLabel('Collection channel').selectOption('web');
  await expect(page.locator('.da-metrics')).toContainText('UNKNOWN');
  await page.getByLabel('Collection channel').selectOption('all');
  await expect(page.locator('.da-metrics')).toContainText('1/2');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mkdir('data/browser-tests/analytics-preview', { recursive: true });
  await page.screenshot({ path: 'data/browser-tests/analytics-preview/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'data/browser-tests/analytics-preview/dashboard-mobile.png', fullPage: true });
  // Inspect the actual exported artifact with scripts and all remote content disabled by its CSP.
  await page.route('**/analysis-report-preview', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('/analysis-report-preview');
  await expect(page.getByRole('heading', { name: 'Business brief first', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: 'data/browser-tests/analytics-preview/report-desktop.png', fullPage: true });
});

test('analysis run choice survives reload and ignores an older slow selection', async ({ page }) => {
 await page.goto(`/workspace?project=${projectId}`);
 await expect(page.getByLabel('Analysis run', {exact:true})).toBeVisible();
 let release: () => void = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
 await page.route(`**/api/runs/${runIds[0]}`, async route => { await gate; await route.continue(); });
 const first = page.waitForRequest(r => r.url().endsWith(`/api/runs/${runIds[0]}`));
 await page.getByLabel('Analysis run', {exact:true}).selectOption(runIds[0]!); await first;
 await page.getByLabel('Analysis run', {exact:true}).selectOption(runIds[1]!);
 await expect(page).toHaveURL(new RegExp(`run=${runIds[1]}`));
 release(); await page.unrouteAll({behavior:'wait'});
 await expect(page.getByLabel('Analysis run', {exact:true})).toHaveValue(runIds[1]!);
 await page.reload(); await expect(page.getByLabel('Analysis run', {exact:true})).toHaveValue(runIds[1]!);
 await expect(page.getByRole('link',{name:'Business brief ↗'})).toHaveAttribute('href',new RegExp(runIds[1]!));
});
test('Chinese dashboard keeps the latest choice when run requests finish out of order', async ({page}) => {
 await page.goto(`/?project=${projectId}`);await expect(page.locator('[data-analysis-run]')).toBeVisible();
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**/api/runs/${runIds[0]}`,async route=>{await gate;await route.continue();});
 const first=page.waitForRequest(r=>r.url().endsWith(`/api/runs/${runIds[0]}`));
 await page.locator('[data-analysis-run]').selectOption(runIds[0]!);await first;
 await page.locator('[data-analysis-run]').selectOption(runIds[1]!);
 await expect(page.getByRole('link',{name:'业务简报 ↗'})).toHaveAttribute('href',new RegExp(runIds[1]!));
 release();await page.unrouteAll({behavior:'wait'});
 await expect(page.locator('[data-analysis-run]')).toHaveValue(runIds[1]!);
});
test('a failed run choice resumes polling the displayed running workflow', async ({page,request}) => {
 const response=await request.get(`/api/runs/${runIds[1]}`);const saved=await response.json();let reads=0;
 await page.route(`**/api/runs/${runIds[1]}{,?*}`,async route=>{reads++;await route.fulfill({json:{...saved,status:'running'}});});
 await page.route(`**/api/runs/${runIds[0]}`,async route=>{await route.fulfill({status:500,json:{error:'fixture unavailable'}});});
 await page.goto(`/workspace?project=${projectId}&run=${runIds[1]}`);
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 const before=reads;await page.locator(`[data-run="${runIds[0]}"]`).click();
 await expect.poll(()=>reads).toBeGreaterThan(before);
 await expect(page.getByRole('heading',{name:'Brand diagnosis in progress',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Business brief ↗'})).toHaveCount(0);
});
test('Chinese failed run selection keeps the displayed workflow polling', async ({page,request}) => {
 const response=await request.get(`/api/runs/${runIds[1]}`);const saved=await response.json();let reads=0;
 await page.route(`**/api/runs/${runIds[1]}{,?*}`,async route=>{reads++;await route.fulfill({json:{...saved,status:'running'}});});
 await page.route(`**/api/runs/${runIds[0]}`,async route=>{await route.fulfill({status:500,json:{error:'fixture unavailable'}});});
 await page.goto(`/?project=${projectId}`);await expect(page.locator('[data-space-run]')).toBeVisible();
 const before=reads;await page.locator('[data-space-run]').selectOption(runIds[0]!);
 await expect.poll(()=>reads).toBeGreaterThan(before);
 await expect(page.getByRole('heading',{name:'品牌诊断进行中',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'业务简报 ↗'})).toHaveCount(0);
});


test('saved collection failures stay out of brand actions on both surfaces', async ({ page }) => {
  const run = await store.get<any>('runs', runIds[1]!);
  run.actions.unshift({ id: 'legacy-failure', title: '复核失败样本，保留已有回答原文', kind: 'measurement', priority: 'P0', rationale: '78 条记录采集或分析未完成，不能作为未提及统计。', queryIds: ['stable-prompt-1'], sampleIds: Array(78).fill('answer-failed'), claimIds: [], acceptance: 'Retry only with an explicit new run.', status: 'proposed' });
  run.actions[1].sampleIds = Array(78).fill('answer-b');
  await store.save('runs', run);
  await page.goto(`/workspace?project=${projectId}&run=${run.id}&view=actions`);
  await page.locator('.ac-collection > summary').click();
  await expect(page.getByRole('heading', { name: 'Collection status', exact: true })).toBeVisible();
  const business = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Evidence-backed actions', exact: true }) });
  await expect(business.locator('.action-item')).toHaveCount(1);
  await business.locator('.ac-card summary').click();
  await expect(business.getByRole('button', { name: 'View answer evidence' })).toHaveCount(1);
  await expect(business.getByRole('heading', { name: 'Improve the product analytics evidence page' })).toBeVisible();
  await expect(business).not.toContainText('78 条记录');
  await page.goto(`/?project=${projectId}`);
  await page.getByRole('button', { name: '策略任务', exact: true }).click();
  await page.locator('.ac-collection > summary').click();
  await expect(page.getByRole('heading', { name: '采集状态', exact: true })).toBeVisible();
  await expect(page.locator('.task')).toHaveCount(1);
  await expect(page.locator('.task')).toContainText('Improve the product analytics evidence page');
  expect((await store.get<any>('runs', run.id)).actions[0].sampleIds).toHaveLength(78);
});


test('action center filters and saved todo, done and skip states survive reload on both surfaces', async ({page,request})=>{
  await page.goto(`/workspace?project=${projectId}&run=${runIds[1]}&view=actions`);
  const card=page.locator('.ac-card');
  await expect(card).toHaveCount(1);
  await page.getByRole('button',{name:'Fact review 0',exact:true}).click();
  await expect(page.locator('.ac-empty')).toBeVisible();
  await page.locator('[data-ac-filter="category"][data-ac-value="all"]').click();
  await card.getByRole('button',{name:'Add to Todo',exact:true}).click();
  await expect(card).toHaveCount(0);
  await page.locator('[data-ac-filter="status"][data-ac-value="in_progress"]').click();
  await expect(card).toHaveCount(1);
  await page.reload();
  await page.locator('[data-ac-filter="status"][data-ac-value="in_progress"]').click();
  await card.getByRole('button',{name:'Mark done',exact:true}).click();
  await page.locator('[data-ac-filter="status"][data-ac-value="history"]').click();
  await expect(card).toContainText('Done');
  await card.getByRole('button',{name:'Restore suggestion',exact:true}).click();
  await page.locator('[data-ac-filter="status"][data-ac-value="proposed"]').click();
  await card.getByRole('button',{name:'Skip',exact:true}).click();
  await expect(card).toHaveCount(0);
  const saved=await (await request.get(`/api/runs/${runIds[1]}`)).json();
  expect(saved.actionStates['action-sources']).toBe('skipped');
  expect(saved.actions[0].status).toBe('proposed'); // Preserve the original planner output.
  await page.goto(`/?project=${projectId}`);
  await page.getByRole('button',{name:'策略任务',exact:true}).click();
  await page.locator('[data-ac-filter="status"][data-ac-value="history"]').click();
  await expect(page.locator('.ac-card')).toContainText('已跳过');
  await mkdir('data/browser-tests/action-center', {recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'data/browser-tests/action-center/desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'data/browser-tests/action-center/mobile.png',fullPage:true});
});
