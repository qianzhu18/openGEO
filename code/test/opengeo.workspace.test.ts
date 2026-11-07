import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyImport, ensureWorkspace, listRuns, loadRun, loadWorkspace, persistRun, readJsonl, recordImport, saveProject } from '../src/opengeo/workspace.js';
import { createRun, executeRun } from '../src/opengeo/engine.js';
import type { OpenGeoProject } from '../src/opengeo/types.js';

async function loadDemoProject(): Promise<OpenGeoProject> {
  return JSON.parse(await readFile(join(process.cwd(), 'examples/opengeo/personal-ip/project.json'), 'utf8'));
}

test('workspace import upserts evidence and appends an audit log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opengeo-ws-'));
  try {
    const paths = await ensureWorkspace(dir);
    const project = await loadDemoProject();
    await saveProject(paths.project, project);

    const { project: after } = applyImport(project, 'observations', [
      { id: 'obs-new', cycle: 2, queryId: 'q-community', platform: 'web', answer: '千逐 AI 新增样本', observedAt: '2026-10-30T00:00:00.000Z' },
    ]);
    await saveProject(paths.project, after);
    await recordImport(dir, 'observations', 'inline-test', [{ id: 'obs-new' }]);

    const { project: loaded } = await loadWorkspace(dir);
    assert.ok(loaded.observations.some(item => item.id === 'obs-new'));
    const log = await readJsonl<{ id: string }>(join(paths.evidenceDir, 'observations.jsonl'));
    assert.equal(log.at(-1)?.id, 'obs-new');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('query import bumps the query-bank version only when it adds an id', async () => {
  const project = await loadDemoProject();
  const version = project.queryBank.version;
  const seed = project.queryBank.queries[0];
  const { project: same } = applyImport(project, 'queries', [{ id: seed.id, text: seed.text, status: 'confirmed' }]);
  assert.equal(same.queryBank.version, version);
  const { project: added } = applyImport(project, 'queries', [{ id: 'q-new', text: '新增问题', status: 'candidate' }]);
  assert.equal(added.queryBank.version, version + 1);
  assert.ok(added.queryBank.queries.some(query => query.id === 'q-new' && query.status === 'candidate'));
});

test('recorded runs are replayable and deterministic', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opengeo-ws-'));
  try {
    const paths = await ensureWorkspace(dir);
    const project = await loadDemoProject();
    await saveProject(paths.project, project);
    const run = executeRun(createRun(project));
    await persistRun(dir, run);

    const runs = await listRuns(dir);
    assert.equal(runs.length, 1);
    const stored = await loadRun(dir, runs[0].runId);
    const replayed = executeRun(createRun(stored.input));
    assert.equal(replayed.status, stored.status);
    assert.deepEqual(replayed.sellingPoints, stored.sellingPoints);
    assert.deepEqual(replayed.actions, stored.actions);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
