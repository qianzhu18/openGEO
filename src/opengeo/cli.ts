import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createRun, executeRun, safeFileName } from './engine.js';
import { publicExport, reportMarkdown } from './report.js';
import { CYCLE_SKILLS } from './types.js';
import type { CycleMetric, IterationAction, OpenGeoProject, OpenGeoRun } from './types.js';
import {
  applyImport, applyLatestEvolution, confirmQuery, ensureWorkspace, listRuns, loadProjectFile, loadRun, loadWorkspace,
  parseEvidenceKind, persistRun, readImportRecords, recordImport, saveProject,
} from './workspace.js';

const usage = `OpenGEO Engine CLI

Usage:
  npm run opengeo -- demo [--out <dir>] [--json]
  npm run opengeo -- init <dir>
  npm run opengeo -- import <dir> <file> --type facts|queries|observations|assets|hypotheses [--json]
  npm run opengeo -- diagnose <dir> [--json]
  npm run opengeo -- plan <dir> [--json]
  npm run opengeo -- evolve <dir> [--run <id>] [--json]
  npm run opengeo -- confirm <dir> <query-id> [--status confirmed|retired] [--priority P0|P1|P2] [--json]
  npm run opengeo -- report <dir> [--run <id>] [--format md|json]
  npm run opengeo -- replay <dir> [--run <id>] [--json]
  npm run opengeo -- run <dir|project.json> [--out <dir>] [--json]
  npm run opengeo -- skills
`;

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = '', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { command, positional, flags };
}

function requirePositional(args: ParsedArgs, index: number, name: string): string {
  const value = args.positional[index];
  if (!value) throw new Error(`Missing ${name}. See:\n\n${usage}`);
  return value;
}

function requestedJson(args: ParsedArgs): boolean {
  return args.flags.json === true;
}

function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === 'string' ? value : undefined;
}

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function summarizeRun(run: OpenGeoRun): Record<string, unknown> {
  return {
    runId: run.id,
    project: run.input.name,
    status: run.status,
    skills: run.steps.length,
    sellingPoints: run.sellingPoints.length,
    drafts: run.drafts.length,
    publicationTasks: run.publicationTasks.length,
    actions: run.actions.length,
    nextQueryVersion: run.evolution.toVersion,
  };
}

async function runProject(project: OpenGeoProject): Promise<OpenGeoRun> {
  return executeRun(createRun(project));
}

interface DiagnosisResult {
  runId: string;
  status: string;
  cycles: CycleMetric[];
  citations: number;
  reviews: { observationId: string; riskTags: string[] }[];
  factGaps: { id: string; status: string; text: string }[];
  queryGaps: { id: string; status: string; text: string }[];
  actions: IterationAction[];
  limitations: string[];
}

function diagnosis(run: OpenGeoRun): DiagnosisResult {
  const factGaps = run.input.facts.filter(fact => fact.status !== 'confirmed');
  const queryGaps = run.input.queryBank.queries.filter(query => query.status !== 'confirmed');
  const reviews = run.judgments.filter(item => item.needsReview);
  return {
    runId: run.id,
    status: run.status,
    cycles: run.cycleMetrics,
    citations: run.judgments.reduce((sum, item) => sum + item.citationCount, 0),
    reviews: reviews.map(item => ({ observationId: item.observationId, riskTags: item.riskTags })),
    factGaps: factGaps.map(fact => ({ id: fact.id, status: fact.status, text: fact.text })),
    queryGaps: queryGaps.map(query => ({ id: query.id, status: query.status, text: query.text })),
    actions: run.actions,
    limitations: run.limitations,
  };
}

function planSummary(run: OpenGeoRun): Record<string, unknown> {
  return {
    runId: run.id,
    status: run.status,
    actions: run.actions,
    publicationTasks: run.publicationTasks,
    evolution: run.evolution,
  };
}

function comparable(run: OpenGeoRun): Record<string, unknown> {
  return {
    status: run.status,
    steps: run.steps.map(step => ({ id: step.id, status: step.status, summary: step.summary })),
    sellingPoints: run.sellingPoints,
    judgments: run.judgments,
    cycleMetrics: run.cycleMetrics,
    drafts: run.drafts,
    publicationTasks: run.publicationTasks,
    actions: run.actions,
    evolution: run.evolution,
  };
}

async function resolveProjectTarget(target: string): Promise<{
  project: OpenGeoProject;
  workspaceDir?: string;
  projectPath: string;
}> {
  const info = await stat(target).catch(() => null);
  if (info?.isDirectory()) {
    const projectPath = join(target, 'project.json');
    return { project: await loadProjectFile(projectPath), workspaceDir: target, projectPath };
  }
  return { project: await loadProjectFile(target), projectPath: target };
}

async function commandDemo(args: ParsedArgs): Promise<void> {
  const out = resolve(stringFlag(args, 'out') || 'data/opengeo/demo');
  const project = await loadProjectFile(join(process.cwd(), 'examples/opengeo/personal-ip/project.json'));
  const run = await runProject(project);
  const persisted = await persistRun(out, run);
  if (requestedJson(args)) {
    console.log(JSON.stringify({ ...summarizeRun(run), ...persisted }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    ...summarizeRun(run),
    report: persisted.reportPath,
    runRecord: persisted.runPath,
    nextQueryBank: persisted.jsonPath,
  }, null, 2));
}

async function commandInit(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  const paths = await ensureWorkspace(dir);
  const source = join(process.cwd(), 'examples/opengeo/personal-ip/project.json');
  await saveProject(paths.project, JSON.parse(await readFile(source, 'utf8')) as OpenGeoProject);
  console.log(JSON.stringify({
    created: paths.project,
    evidence: paths.evidenceDir,
    runs: paths.runsDir,
    reports: paths.reportsDir,
    next: `Edit ${paths.project}, then run: npm run opengeo -- diagnose ${dir}`,
  }, null, 2));
}

async function commandImport(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  const file = requirePositional(args, 1, 'import file');
  const kind = parseEvidenceKind(stringFlag(args, 'type'));
  const { paths, project } = await loadWorkspace(dir);
  const records = await readImportRecords(file);
  if (!records.length) throw new Error(`No records found in ${file}`);
  const beforeVersion = project.queryBank.version;
  const result = applyImport(project, kind, records);
  await saveProject(paths.project, result.project);
  await recordImport(dir, kind, resolve(file), records);
  const output = {
    kind,
    imported: result.imported,
    ids: result.ids,
    queryBankVersion: result.project.queryBank.version,
    versionBumped: result.project.queryBank.version !== beforeVersion,
    evidenceLog: join(paths.evidenceDir, `${kind}.jsonl`),
    project: paths.project,
  };
  if (requestedJson(args)) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Imported ${result.imported} ${kind} record(s) into ${paths.project}`);
  if (output.versionBumped) console.log(`Query bank version: ${beforeVersion} -> ${result.project.queryBank.version}`);
  console.log(`Evidence log: ${output.evidenceLog}`);
}

async function commandDiagnose(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  const { project } = await loadWorkspace(dir);
  const run = await runProject(project);
  const persisted = await persistRun(dir, run);
  const result = { ...diagnosis(run), report: persisted.reportPath };
  if (requestedJson(args)) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const cycles = run.cycleMetrics
    .map(item => `cycle ${item.cycle}: ${item.observations} obs, mention ${percent(item.mentionRate)}`)
    .join('; ');
  console.log(`Run ${run.id} · ${run.status}`);
  console.log(`- cycles: ${cycles || 'none'}`);
  console.log(`- citations: ${result.citations}`);
  console.log(`- reviews: ${run.judgments.filter(item => item.needsReview).length}`);
  console.log(`- fact gaps: ${run.input.facts.filter(fact => fact.status !== 'confirmed').length}`);
  console.log(`- query gaps: ${run.input.queryBank.queries.filter(query => query.status !== 'confirmed').length}`);
  console.log(`- actions: ${run.actions.length}`);
  console.log(`report: ${persisted.reportPath}`);
}

async function commandPlan(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  const { project } = await loadWorkspace(dir);
  const run = await runProject(project);
  const persisted = await persistRun(dir, run);
  const result = { ...planSummary(run), report: persisted.reportPath };
  if (requestedJson(args)) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Run ${run.id} · ${run.status}`);
  for (const action of run.actions) {
    console.log(`- ${action.priority} [${action.type}] ${action.title}`);
    console.log(`  evidence: ${action.evidenceIds.join(', ') || 'none'}`);
  }
  console.log(`- publication tasks: ${run.publicationTasks.length}`);
  console.log(`- next query bank: v${run.evolution.toVersion} (${run.evolution.queries.length} queries)`);
  console.log(`report: ${persisted.reportPath}`);
}

async function commandEvolve(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  const runId = stringFlag(args, 'run');
  const result = await applyLatestEvolution(dir, runId);
  const output = {
    runId: result.runId,
    fromVersion: result.fromVersion,
    toVersion: result.toVersion,
    queryCount: result.project.queryBank.queries.length,
    candidateCount: result.project.queryBank.queries.filter(query => query.status === 'candidate').length,
    project: result.projectPath,
    evidenceLog: resolve(result.projectPath, '..', 'evidence', 'evolutions.jsonl'),
    next: `Confirm selected candidate queries with: npm run opengeo -- confirm ${dir} <query-id>`,
  };
  if (requestedJson(args)) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Applied evolution from run ${result.runId}`);
  console.log(`- query bank: v${result.fromVersion} -> v${result.toVersion}`);
  console.log(`- queries: ${output.queryCount} (${output.candidateCount} candidates awaiting confirmation)`);
  console.log(`- project: ${result.projectPath}`);
  console.log(`- evidence: ${output.evidenceLog}`);
}

async function commandConfirm(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  const queryId = requirePositional(args, 1, 'query id');
  const rawStatus = stringFlag(args, 'status') || 'confirmed';
  if (rawStatus !== 'confirmed' && rawStatus !== 'retired') {
    throw new Error('--status must be confirmed or retired');
  }
  const rawPriority = stringFlag(args, 'priority');
  if (rawPriority && !['P0', 'P1', 'P2'].includes(rawPriority)) {
    throw new Error('--priority must be P0, P1, or P2');
  }
  const result = await confirmQuery(dir, queryId, rawStatus, rawPriority as 'P0' | 'P1' | 'P2' | undefined);
  const output = {
    queryId,
    changed: result.changed,
    fromVersion: result.fromVersion,
    toVersion: result.toVersion,
    project: result.projectPath,
    evidenceLog: resolve(result.projectPath, '..', 'evidence', 'confirmations.jsonl'),
  };
  if (requestedJson(args)) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (!result.changed) {
    console.log(`No change for ${queryId}; status and priority were already set.`);
  } else {
    console.log(`Confirmed decision for ${queryId}`);
    console.log(`- query bank: v${result.fromVersion} -> v${result.toVersion}`);
  }
  console.log(`- project: ${result.projectPath}`);
  console.log(`- evidence: ${output.evidenceLog}`);
}

async function commandReport(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  const format = stringFlag(args, 'format') === 'json' ? 'json' : 'md';
  const runId = stringFlag(args, 'run');
  let run: OpenGeoRun;
  if (runId) {
    run = await loadRun(dir, runId);
  } else {
    const { project } = await loadWorkspace(dir);
    run = await runProject(project);
    await persistRun(dir, run);
  }
  console.log(format === 'json' ? JSON.stringify(publicExport(run), null, 2) : reportMarkdown(run));
}

async function commandReplay(args: ParsedArgs): Promise<void> {
  const dir = requirePositional(args, 0, 'workspace dir');
  let runId = stringFlag(args, 'run');
  if (!runId) {
    const runs = await listRuns(dir);
    if (!runs.length) throw new Error('No recorded runs found. Run diagnose, plan, run, or demo first.');
    runId = runs.at(-1)!.runId;
  }
  const stored = await loadRun(dir, runId);
  const replayed = await runProject(stored.input);
  const expected = comparable(stored);
  const actual = comparable(replayed);
  const differences = Object.keys(expected).filter(
    key => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]),
  );
  const result = {
    storedRunId: stored.id,
    replayedRunId: replayed.id,
    matched: differences.length === 0,
    differences,
    status: replayed.status,
  };
  if (requestedJson(args)) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Replay of ${stored.id}: ${result.matched ? 'matched (deterministic)' : `differs in ${differences.join(', ')}`}`);
  console.log(`- replayed run: ${replayed.id}`);
  console.log(`- status: ${replayed.status}`);
  if (differences.length) console.log('- note: project.json may have changed since the recorded run.');
}

async function commandRun(args: ParsedArgs): Promise<void> {
  const target = requirePositional(args, 0, 'workspace dir or project.json');
  const { project, workspaceDir, projectPath } = await resolveProjectTarget(target);
  const run = await runProject(project);
  const out = resolve(stringFlag(args, 'out') || workspaceDir || join('data/opengeo', safeFileName(basename(projectPath, '.json'))));
  const persisted = await persistRun(out, run);
  if (requestedJson(args)) {
    console.log(JSON.stringify({ ...summarizeRun(run), ...persisted }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    ...summarizeRun(run),
    report: persisted.reportPath,
    runRecord: persisted.runPath,
  }, null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === '--help' || args.command === '-h') {
    console.log(usage);
    return;
  }
  if (args.command === 'skills') {
    console.log(JSON.stringify(CYCLE_SKILLS.map(([step, skill]) => ({ step, skill })), null, 2));
    return;
  }
  switch (args.command) {
    case 'demo': return commandDemo(args);
    case 'init': return commandInit(args);
    case 'import': return commandImport(args);
    case 'diagnose': return commandDiagnose(args);
    case 'plan': return commandPlan(args);
    case 'evolve': return commandEvolve(args);
    case 'confirm': return commandConfirm(args);
    case 'report': return commandReport(args);
    case 'replay': return commandReplay(args);
    case 'run': return commandRun(args);
    default:
      throw new Error(`Unknown command: ${args.command}\n\n${usage}`);
  }
}

await main();
