import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEvolution, createRun, executeRun } from '../src/opengeo/engine.js';
import {
  applyLatestEvolution, confirmQuery, ensureWorkspace, persistRun, saveProject,
} from '../src/opengeo/workspace.js';
import type { OpenGeoProject } from '../src/opengeo/types.js';

async function loadDemoProject(): Promise<OpenGeoProject> {
  return JSON.parse(await readFile(join(process.cwd(), 'examples/opengeo/personal-ip/project.json'), 'utf8'));
}

test('opengeo runs the instrumentation-to-evolution cycle with explicit gates', async () => {
  const project = await loadDemoProject();
  const run = executeRun(createRun(project));

  assert.equal(run.status, 'needs_confirmation');
  assert.deepEqual(run.steps.map(step => step.id), [
    'instrument', 'mine', 'confirm', 'write', 'publish', 'monitor', 'review', 'evolve',
  ]);
  assert.equal(run.steps.find(step => step.id === 'confirm')?.status, 'completed');
  assert.ok(run.eventDefinitions.some(event => event.id === 'geo.answer_observed'));
  assert.ok(run.sellingPoints.length > 0);
  assert.ok(run.drafts.length > 0);
  assert.ok(run.actions.some(action => action.type === 'measurement'));
  assert.equal(new Set(run.publicationTasks.map(task => task.status)).size, 1);
  assert.deepEqual([...new Set(run.publicationTasks.map(task => task.status))], ['waiting_confirmation']);
});

test('opengeo keeps monitoring, risk review, and evolution separate from publication', async () => {
  const project = await loadDemoProject();
  const run = executeRun(createRun(project));

  const first = run.cycleMetrics.find(metric => metric.cycle === 1);
  const second = run.cycleMetrics.find(metric => metric.cycle === 2);
  assert.equal(first?.observations, 3);
  assert.equal(first?.mentioned, 1);
  assert.equal(second?.mentioned, 3);
  assert.ok(run.judgments.some(judgment => judgment.needsReview));
  assert.ok(run.publicationTasks.every(task => task.mode === 'manual_review'));
  assert.ok(run.evolution.queries.some(query => query.status === 'candidate'));
  assert.equal(run.evolution.toVersion, project.queryBank.version + 1);
  assert.ok(run.evolution.guardrails.some(item => item.includes('human confirmation')));
});

test('opengeo does not publish unconfirmed facts and can apply the next confirmed bank', async () => {
  const project = await loadDemoProject();
  const run = executeRun(createRun(project));
  const unconfirmed = project.facts.find(fact => fact.status === 'unconfirmed')!;
  const draftText = run.drafts.map(draft => draft.markdown).join('\n');
  assert.ok(!draftText.includes('社区成员规模尚未提供'));
  assert.ok(!run.drafts.some(draft => draft.factIds.includes(unconfirmed.id)));

  const evolved = applyEvolution(project, run.evolution);
  assert.equal(evolved.queryBank.version, 2);
  assert.equal(evolved.queryBank.queries.length, run.evolution.queries.length);
  assert.ok(evolved.queryBank.queries.some(query => query.status === 'candidate'));
  assert.throws(() => applyEvolution(evolved, run.evolution), /Query bank version changed/);
});

test('opengeo blocks execution when facts or confirmed queries are missing', async () => {
  const project = await loadDemoProject();
  project.facts = project.facts.map(fact => ({ ...fact, status: 'unconfirmed' }));
  const run = executeRun(createRun(project));
  assert.equal(run.status, 'needs_confirmation');
  assert.equal(run.steps.find(step => step.id === 'confirm')?.status, 'blocked');
  assert.equal(run.drafts.length, 0);
  assert.equal(run.publicationTasks.length, 0);
  assert.equal(run.evolution.toVersion, 1);
});

test('opengeo lifecycle applies evolution then waits for explicit query confirmation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opengeo-lifecycle-'));
  try {
    const paths = await ensureWorkspace(dir);
    const project = await loadDemoProject();
    await saveProject(paths.project, project);
    const run = executeRun(createRun(project));
    await persistRun(dir, run);

    const applied = await applyLatestEvolution(dir, run.id);
    assert.equal(applied.fromVersion, 1);
    assert.equal(applied.toVersion, 2);
    assert.ok(applied.project.queryBank.queries.some(query => query.status === 'candidate'));

    const candidate = applied.project.queryBank.queries.find(query => query.status === 'candidate')!;
    const confirmed = await confirmQuery(dir, candidate.id, 'confirmed', 'P1');
    assert.equal(confirmed.changed, true);
    assert.equal(confirmed.fromVersion, 2);
    assert.equal(confirmed.toVersion, 3);
    assert.equal(
      confirmed.project.queryBank.queries.find(query => query.id === candidate.id)?.status,
      'confirmed',
    );

    const evolutions = await readFile(join(paths.evidenceDir, 'evolutions.jsonl'), 'utf8');
    const confirmations = await readFile(join(paths.evidenceDir, 'confirmations.jsonl'), 'utf8');
    assert.ok(evolutions.includes(run.id));
    assert.ok(confirmations.includes(candidate.id));

    await assert.rejects(() => applyLatestEvolution(dir, run.id), /query bank v1, but workspace is v3/);

    const unchanged = await confirmQuery(dir, candidate.id, 'confirmed', 'P1');
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.toVersion, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
