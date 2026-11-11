import { readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { importAttempt } from '../src/workbench/campaign/import-attempt.js';
import { collectSources } from '../src/workbench/campaign/evidence.js';
import { compareCampaigns, validateCampaign, writeCampaign } from '../src/workbench/campaign/run.js';
import { renderCampaignComparison } from '../src/workbench/campaign/render.js';
import { Store } from '../src/workbench/storage.js';
import type { CampaignAttempt, CampaignRun, CampaignSpec } from '../src/workbench/campaign/model.js';
import type { Project } from '../src/workbench/types.js';

const [command, directory, other] = process.argv.slice(2);
if (!directory || !['collect', 'run', 'compare', 'install', 'import-attempt'].includes(command || '')) throw new Error('用法：npm run campaign -- collect|run|install <案例目录>；compare <前轮目录> <后轮目录>；import-attempt <案例目录> --id ... --question ... --platform ... --evidence ...');
const root = resolve(directory);
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const options = new Map<string, string>();
if (command === 'import-attempt') {
  for (let index = 4; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    if (!key?.startsWith('--') || index + 1 >= process.argv.length) throw new Error('导入参数必须成对使用 --名称 值');
    options.set(key.slice(2), process.argv[index + 1]!);
  }
}
if (command === 'collect') {
  const spec = await json<CampaignSpec>(join(root, '01-案例策划.json'));
  validateCampaign(spec);
  // Do not replace an existing source archive silently; put refreshed evidence in a new round.
  if (await access(join(root, '02-来源归档.json')).then(() => true, () => false)) throw new Error('本轮来源归档已存在；请新建轮次再采集，避免覆盖历史证据');
  const sources = await collectSources(root, spec.sources);
  await writeFile(join(root, '02-来源归档.json'), JSON.stringify(sources, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ collected: sources.filter(s => s.status === 'collected').length, failed: sources.filter(s => s.status === 'failed').length, newAIAnswers: 0 }, null, 2));
} else if (command === 'compare') {
  if (!other) throw new Error('compare 需要前后两个案例轮次目录');
  const before = await json<CampaignRun>(join(root, '07-执行记录.json'));
  const afterRoot = resolve(other);
  const after = await json<CampaignRun>(join(afterRoot, '07-执行记录.json'));
  const comparison = compareCampaigns(before, after);
  const afterSpec = await json<CampaignSpec>(join(afterRoot, '01-案例策划.json'));
  await writeFile(join(afterRoot, '13-两轮比较.md'), renderCampaignComparison(afterSpec.brand, comparison), { mode: 0o600 });
  console.log(JSON.stringify(comparison, null, 2));
} else if (command === 'import-attempt') {
  const spec = await json<CampaignSpec>(join(root, '01-案例策划.json'));
  validateCampaign(spec);
  const attempts = await json<CampaignAttempt[]>(join(root, '03-采样记录.json'));
  const attempt = await importAttempt(root, spec, attempts, {
    id: options.get('id') || '', jobId: options.get('job'), questionId: options.get('question') || '',
    platform: options.get('platform') || '', evidence: options.get('evidence') || '', failureReason: options.get('failure-reason'),
  });
  await writeFile(join(root, '03-采样记录.json'), JSON.stringify([...attempts, attempt], null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ imported: attempt.id, jobId: attempt.jobId, status: attempt.status, destination: attempt.evidence?.answer || null }, null, 2));
} else {
  const run = await writeCampaign(root);
  if (command === 'install') {
    const project = await json<Project>(join(root, '工作台项目.json'));
    const store = new Store();
    if (await store.get('projects', project.id)) throw new Error('工作台已有同 ID 项目，拒绝覆盖已有人工确认或历史样本');
    await store.save('projects', project);
  }
  console.log(JSON.stringify({ id: run.id, readiness: run.readiness, sources: run.sources.length, validAnswers: run.attempts.filter(a => a.eligible).length, stages: run.stages.map(s => ({ id: s.id, status: s.status })), newModelCalls: 0, installed: command === 'install' }, null, 2));
}
