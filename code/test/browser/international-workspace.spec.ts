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

test('measurement setup uses explicit model selection and never stores the key in browser storage', async ({ page }) => {
  await page.goto(`/workspace?project=${projectId}&view=agent`);
  await expect(page.getByRole('heading', { name: 'Measure, review, improve' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Model ID', exact: true })).toHaveValue('');
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/runs', async route => { if (route.request().method() !== 'POST') { await route.continue(); return; } payload = route.request().postDataJSON(); await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: runIds[1] }) }); });
  await page.getByLabel('Provider', { exact: true }).selectOption('openrouter');
  await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill('fixture-model');
  await page.getByLabel('API key', { exact: true }).fill('fixture-key-only-in-memory');
  await page.getByRole('button', { name: 'Start API measurement', exact: true }).click();
  await expect.poll(() => payload?.mode).toBe('live');
  expect(payload?.maxQuestions).toBe(5);
  expect(payload?.apiKey).toBe('fixture-key-only-in-memory');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('fixture-key-only-in-memory');
  await expect(page.getByRole('button', { name: 'Start API measurement', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
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
  await form.getByLabel('Source type').selectOption('pdf');
  await expect(form.getByLabel('Text PDF (up to 1MB, 40 pages)')).toBeVisible();
  await form.getByLabel('Text PDF (up to 1MB, 40 pages)').setInputFiles({ name: 'fixture-manual.pdf', mimeType: 'application/pdf', buffer: textPdf() });
  await form.getByRole('button', { name: 'Import source', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'fixture-manual.pdf · 第 1 页', exact: true })).toBeVisible();
  await page.getByText('Add a fact from a source', { exact: true }).click();
  await page.locator('[data-brand-claim]').getByLabel('Source / page').selectOption({ label: 'fixture-manual.pdf · 第 1 页' });
  await form.getByLabel('Source type').selectOption('pdf');
  await form.getByLabel('Text PDF (up to 1MB, 40 pages)').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('broken') });
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
  expect(markdown).toContain('**1/2**'); expect(markdown).toContain('Fixture provider timeout');
  expect(markdown).not.toContain('## Content'); expect(markdown).not.toContain('## Actions');
  const html = await (await request.get(base + '/report-html?channel=api')).text();
  expect(html).toContain('<!doctype html>'); expect(html).toContain('<table>');
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'HTML report', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: 'Summary and data quality' })).toBeVisible();
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
 await expect(page.getByRole('link',{name:'Export report ↗'})).toHaveAttribute('href',new RegExp(runIds[1]!));
});
test('Chinese dashboard keeps the latest choice when run requests finish out of order', async ({page}) => {
 await page.goto(`/?project=${projectId}`);await expect(page.locator('[data-analysis-run]')).toBeVisible();
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**/api/runs/${runIds[0]}`,async route=>{await gate;await route.continue();});
 const first=page.waitForRequest(r=>r.url().endsWith(`/api/runs/${runIds[0]}`));
 await page.locator('[data-analysis-run]').selectOption(runIds[0]!);await first;
 await page.locator('[data-analysis-run]').selectOption(runIds[1]!);
 await expect(page.getByRole('link',{name:'导出报告 ↗'})).toHaveAttribute('href',new RegExp(runIds[1]!));
 release();await page.unrouteAll({behavior:'wait'});
 await expect(page.locator('[data-analysis-run]')).toHaveValue(runIds[1]!);
});
test('a failed run choice resumes polling the displayed running workflow', async ({page,request}) => {
 const response=await request.get(`/api/runs/${runIds[1]}`);const saved=await response.json();let reads=0;
 await page.route(`**/api/runs/${runIds[1]}`,async route=>{reads++;await route.fulfill({json:{...saved,status:'running'}});});
 await page.route(`**/api/runs/${runIds[0]}`,async route=>{await route.fulfill({status:500,json:{error:'fixture unavailable'}});});
 await page.goto(`/workspace?project=${projectId}&run=${runIds[1]}`);
 await expect(page.getByLabel('Analysis run',{exact:true})).toBeVisible();
 const before=reads;await page.getByLabel('Analysis run',{exact:true}).selectOption(runIds[0]!);
 await expect.poll(()=>reads).toBeGreaterThan(before);
 await expect(page.getByRole('link',{name:'Export report ↗'})).toHaveAttribute('href',new RegExp(runIds[1]!));
});
test('Chinese failed run selection keeps the displayed workflow polling', async ({page,request}) => {
 const response=await request.get(`/api/runs/${runIds[1]}`);const saved=await response.json();let reads=0;
 await page.route(`**/api/runs/${runIds[1]}`,async route=>{reads++;await route.fulfill({json:{...saved,status:'running'}});});
 await page.route(`**/api/runs/${runIds[0]}`,async route=>{await route.fulfill({status:500,json:{error:'fixture unavailable'}});});
 await page.goto(`/?project=${projectId}`);await expect(page.locator('[data-analysis-run]')).toBeVisible();
 const before=reads;await page.locator('[data-analysis-run]').selectOption(runIds[0]!);
 await expect.poll(()=>reads).toBeGreaterThan(before);
 await expect(page.getByRole('link',{name:'导出报告 ↗'})).toHaveAttribute('href',new RegExp(runIds[1]!));
});
