import { test, expect } from '@playwright/test';
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
  await expect(page.getByText('Mixed cohorts', { exact: true })).toBeVisible();
  await expect(page.locator('.cohort-table tbody tr')).toHaveCount(2);
  await expect(page.getByText('API region not verified', { exact: false }).first()).toBeVisible();
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
  await expect(page.locator('.source-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Answer 1', exact: true }).click();
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
