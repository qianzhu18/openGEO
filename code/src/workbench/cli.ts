import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCases } from './cases.js';
import { Store } from './storage.js';
import { createRun, executeRun } from './engine.js';
import { exportRun, reportMarkdown } from './report.js';
import type { AgentRun, Project } from './types.js';

const store = new Store(), workerToken = `cli-${process.pid}-${Date.now()}`;
try {
  store.acquireWorker(workerToken);
  await store.initialize(await loadCases());
  const command = process.argv[2] || 'demo', id = process.argv[3] || 'sensor';
  const summaries: unknown[] = [];
  if (!['demo', 'run'].includes(command)) throw new Error('用法：npm run demo，或 npm run case -- run sensor|posthog|niubistar');
  for (const projectId of command === 'demo' ? ['sensor', 'posthog', 'niubistar'] : [id]) {
    const project = await store.get<Project>('projects', projectId); if (!project) throw new Error('项目不存在');
    const run = await executeRun(createRun(project, 'replay'), store);
    await mkdir(join(store.root, 'reports'), { recursive: true });
    await writeFile(join(store.root, 'reports', `${projectId}.md`), reportMarkdown(run));
    await writeFile(join(store.root, 'reports', `${projectId}.json`), JSON.stringify(exportRun(run), null, 2) + '\n');
    summaries.push({ project: project.brand, runId: run.id, status: run.status, samples: run.audit?.planned, collected: run.audit?.collected,
      analyzed: run.audit?.analyzed, providerCitations: run.audit?.providerCitations, answerUrls: run.audit?.answerUrls,
      actions: run.actions.length, contentStatus: run.draft?.status, newModelCalls: run.calls.length });
  }
  console.log(JSON.stringify({ mode: 'replay', summaries, reportsDirectory: join(store.root, 'reports') }, null, 2));
} finally {
  store.releaseWorker(workerToken);
  store.close();
}
