import { test, expect } from '@playwright/test';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { syntheticProject } from '../../src/citekeel/cases.js';
import { createRun } from '../../src/citekeel/engine.js';
import { Store } from '../../src/citekeel/storage.js';
import { newReceipt } from '../../src/citekeel/api-receipts.js';

const store = new Store('data/browser-tests'), runId = 'api-receipts-browser-fixture';
test.afterAll(async () => { await rm(join(store.root, 'runs', runId + '.json'), { force: true }); });
test('API receipts render in brief and full evidence without making model requests', async ({ page, request }) => {
  const project = syntheticProject(), run = createRun(project, 'live');
  run.id = runId; run.status = 'needs_review'; run.steps = []; run.queries = project.queries.slice(0, 1);
  run.samples = [{ id: 'paid-empty', queryId: run.queries[0]!.id, question: run.queries[0]!.text, intent: 'fixture', branded: false,
    model: 'fixture/model', origin: 'api', protocolId: 'api/fixture', runGroup: runId, observedAt: run.createdAt,
    collectionStatus: 'failed', analysisStatus: 'unknown', answer: '', citations: [], costUsd: 0.012 }];
  run.calls = [{ id: 'paid-call', purpose: 'measurement', provider: 'fixture', model: 'model', startedAt: run.createdAt,
    status: 'failed', promptHash: 'fixture', costUsd: 0.012, receipt: { ...newReceipt({ sampleId: 'paid-empty' }),
      dispatch: 'response_received', responseRetained: true, httpStatus: 200, providerRequestId: 'provider-id', costStatus: 'reported', answerState: 'empty' } }];
  await store.save('runs', run);
  let modelCalls = 0;
  await page.route('https://**', async route => { modelCalls++; await route.abort(); });
  const report = await request.get(`/api/runs/${runId}/report-html`);
  expect(report.ok()).toBe(true);
  const reportBody = await report.text();
  await page.route('**/api-receipts-preview', route => route.fulfill({ contentType: 'text/html', body: reportBody }));
  await page.goto('/api-receipts-preview');
  await expect(page.getByRole('heading', { name: 'API 请求与内容对账' })).toBeVisible();
  await expect(page.locator('main')).toContainText('USD 0.012');
  await expect(page.locator('main')).toContainText('有效回答率: 0.0%');
  await expect(page.locator('main')).toContainText('采样总费用: USD 0.012');
  await mkdir('artifacts/api-receipts', { recursive: true });
  await page.screenshot({ path: 'artifacts/api-receipts/report.png', fullPage: true });
  const evidence = await request.get(`/api/runs/${runId}/report-evidence`);
  expect(await evidence.text()).toContain('provider-id');
  expect(modelCalls).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
