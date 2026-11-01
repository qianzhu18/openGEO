import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { reportMarkdown, publicExport } from './report.js';
import { applyEvolution, safeFileName } from './engine.js';
import type {
  Asset, ChannelHypothesis, CitationRecord, Fact, Observation, OpenGeoProject, OpenGeoRun, Query,
} from './types.js';

export type EvidenceKind = 'facts' | 'queries' | 'observations' | 'assets' | 'hypotheses';

export const EVIDENCE_KINDS: EvidenceKind[] = ['facts', 'queries', 'observations', 'assets', 'hypotheses'];

export interface RunIndexEntry {
  runId: string;
  projectId: string;
  projectName: string;
  status: string;
  createdAt: string;
  reportPath?: string;
}

export interface WorkspacePaths {
  root: string;
  project: string;
  evidenceDir: string;
  importsLog: string;
  runsDir: string;
  runsIndex: string;
  reportsDir: string;
}

export function workspacePaths(dir: string): WorkspacePaths {
  const root = resolve(dir);
  return {
    root,
    project: join(root, 'project.json'),
    evidenceDir: join(root, 'evidence'),
    importsLog: join(root, 'evidence', 'imports.jsonl'),
    runsDir: join(root, 'runs'),
    runsIndex: join(root, 'runs', 'index.jsonl'),
    reportsDir: join(root, 'reports'),
  };
}

export async function ensureWorkspace(dir: string): Promise<WorkspacePaths> {
  const paths = workspacePaths(dir);
  await mkdir(paths.evidenceDir, { recursive: true });
  await mkdir(paths.runsDir, { recursive: true });
  await mkdir(paths.reportsDir, { recursive: true });
  return paths;
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}

export async function appendJsonl(path: string, rows: unknown[]): Promise<void> {
  if (!rows.length) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

export async function readJsonl<T>(path: string): Promise<T[]> {
  let text = '';
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

export async function loadProjectFile(path: string): Promise<OpenGeoProject> {
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<OpenGeoProject>;
  if (value.schemaVersion !== 'opengeo-project/v1') {
    throw new Error(`Expected schemaVersion opengeo-project/v1 in ${path}`);
  }
  return value as OpenGeoProject;
}

export async function loadWorkspace(dir: string): Promise<{ paths: WorkspacePaths; project: OpenGeoProject }> {
  const paths = workspacePaths(dir);
  return { paths, project: await loadProjectFile(paths.project) };
}

export async function saveProject(path: string, project: OpenGeoProject): Promise<void> {
  await writeJsonAtomic(path, project);
}

export function upsertById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length ? value : fallback;
}

function normalizeFact(raw: Record<string, unknown>): Fact {
  const status = stringValue(raw.status, 'unconfirmed');
  return {
    id: String(raw.id),
    text: stringValue(raw.text, ''),
    source: stringValue(raw.source, 'imported'),
    status: (['confirmed', 'unconfirmed', 'conflict'].includes(status) ? status : 'unconfirmed') as Fact['status'],
  };
}

function normalizeQuery(raw: Record<string, unknown>): Query {
  const priority = stringValue(raw.priority, 'P2');
  const status = stringValue(raw.status, 'candidate');
  return {
    id: String(raw.id),
    text: stringValue(raw.text, ''),
    intent: stringValue(raw.intent, 'imported'),
    platform: stringValue(raw.platform, 'web'),
    priority: (['P0', 'P1', 'P2'].includes(priority) ? priority : 'P2') as Query['priority'],
    origin: stringValue(raw.origin, 'import'),
    status: (['confirmed', 'candidate', 'retired'].includes(status) ? status : 'candidate') as Query['status'],
  };
}

function normalizeAsset(raw: Record<string, unknown>): Asset {
  return {
    id: String(raw.id),
    title: stringValue(raw.title, String(raw.id)),
    channel: stringValue(raw.channel, 'web'),
    url: typeof raw.url === 'string' ? raw.url : undefined,
    content: stringValue(raw.content, ''),
    metrics: typeof raw.metrics === 'object' && raw.metrics !== null ? raw.metrics as Record<string, number> : undefined,
  };
}

function normalizeObservation(raw: Record<string, unknown>): Observation {
  const sentiment = stringValue(raw.sentiment, 'neutral');
  const citations = Array.isArray(raw.citations) ? raw.citations as CitationRecord[] : undefined;
  return {
    id: String(raw.id),
    cycle: typeof raw.cycle === 'number' ? raw.cycle : Number(raw.cycle ?? 0),
    queryId: stringValue(raw.queryId, ''),
    platform: stringValue(raw.platform, 'web'),
    answer: stringValue(raw.answer, ''),
    observedAt: stringValue(raw.observedAt, new Date().toISOString()),
    sentiment: (['positive', 'neutral', 'negative', 'mixed'].includes(sentiment) ? sentiment : 'neutral') as Observation['sentiment'],
    riskTags: Array.isArray(raw.riskTags) ? raw.riskTags.map(String) : undefined,
    citations,
  };
}

function normalizeHypothesis(raw: Record<string, unknown>): ChannelHypothesis {
  const confidence = stringValue(raw.confidence, 'low');
  return {
    id: String(raw.id),
    platform: stringValue(raw.platform, 'web'),
    statement: stringValue(raw.statement, ''),
    evidenceObservationIds: Array.isArray(raw.evidenceObservationIds) ? raw.evidenceObservationIds.map(String) : [],
    confidence: (['low', 'medium', 'high'].includes(confidence) ? confidence : 'low') as ChannelHypothesis['confidence'],
  };
}

function requireRecords(records: unknown[]): Record<string, unknown>[] {
  const valid: Record<string, unknown>[] = [];
  for (const [index, record] of records.entries()) {
    if (typeof record !== 'object' || record === null || typeof (record as Record<string, unknown>).id !== 'string') {
      throw new Error(`Record ${index + 1} is not an object with a string id`);
    }
    valid.push(record as Record<string, unknown>);
  }
  return valid;
}

export function applyImport(
  project: OpenGeoProject,
  kind: EvidenceKind,
  records: unknown[],
): { project: OpenGeoProject; imported: number; ids: string[] } {
  const valid = requireRecords(records);
  const next = structuredClone(project);
  switch (kind) {
    case 'facts': {
      const incoming = valid.map(normalizeFact);
      next.facts = upsertById(next.facts, incoming);
      return { project: next, imported: incoming.length, ids: incoming.map(item => item.id) };
    }
    case 'queries': {
      const incoming = valid.map(normalizeQuery);
      const existingIds = new Set(next.queryBank.queries.map(query => query.id));
      const added = incoming.filter(query => !existingIds.has(query.id)).length;
      next.queryBank = {
        version: next.queryBank.version + (added ? 1 : 0),
        queries: upsertById(next.queryBank.queries, incoming),
      };
      return { project: next, imported: incoming.length, ids: incoming.map(item => item.id) };
    }
    case 'assets': {
      const incoming = valid.map(normalizeAsset);
      next.assets = upsertById(next.assets, incoming);
      return { project: next, imported: incoming.length, ids: incoming.map(item => item.id) };
    }
    case 'observations': {
      const incoming = valid.map(normalizeObservation);
      next.observations = upsertById(next.observations, incoming);
      return { project: next, imported: incoming.length, ids: incoming.map(item => item.id) };
    }
    case 'hypotheses': {
      const incoming = valid.map(normalizeHypothesis);
      next.channelHypotheses = upsertById(next.channelHypotheses, incoming);
      return { project: next, imported: incoming.length, ids: incoming.map(item => item.id) };
    }
    default:
      throw new Error(`Unknown evidence kind: ${String(kind)}`);
  }
}

export function parseEvidenceKind(value: string | undefined): EvidenceKind {
  if (!value) throw new Error(`Missing --type. Expected one of: ${EVIDENCE_KINDS.join(', ')}`);
  if (!EVIDENCE_KINDS.includes(value as EvidenceKind)) {
    throw new Error(`Unknown --type "${value}". Expected one of: ${EVIDENCE_KINDS.join(', ')}`);
  }
  return value as EvidenceKind;
}

export async function readImportRecords(path: string): Promise<unknown[]> {
  const text = (await readFile(path, 'utf8')).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error(`Expected a JSON array in ${path}`);
    return parsed;
  }
  if (text.startsWith('{')) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.id === 'string') return [parsed];
    const collected: unknown[] = [];
    for (const value of Object.values(parsed)) {
      if (Array.isArray(value)) collected.push(...value);
    }
    if (collected.length) return collected;
    throw new Error(`JSON object in ${path} has no id and no record arrays`);
  }
  return text.split('\n').map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${(error as Error).message}`);
    }
  });
}

export async function recordImport(
  dir: string,
  kind: EvidenceKind,
  source: string,
  records: unknown[],
): Promise<void> {
  const paths = workspacePaths(dir);
  await appendJsonl(join(paths.evidenceDir, `${kind}.jsonl`), records);
  await appendJsonl(paths.importsLog, [{
    at: new Date().toISOString(),
    kind,
    source,
    count: records.length,
    ids: records.map(record => String((record as Record<string, unknown>).id)),
  }]);
}

export async function persistRun(
  dir: string,
  run: OpenGeoRun,
): Promise<{ runPath: string; reportPath: string; jsonPath: string }> {
  const paths = await ensureWorkspace(dir);
  const runPath = join(paths.runsDir, `${run.id}.json`);
  await writeJsonAtomic(runPath, run);
  const base = safeFileName(`${run.input.name}-${run.id.slice(0, 8)}`);
  const reportPath = join(paths.reportsDir, `${base}.md`);
  const jsonPath = join(paths.reportsDir, `${base}.json`);
  await writeFile(reportPath, reportMarkdown(run), 'utf8');
  await writeFile(jsonPath, `${JSON.stringify(publicExport(run), null, 2)}\n`, 'utf8');
  await appendJsonl(paths.runsIndex, [{
    runId: run.id,
    projectId: run.projectId,
    projectName: run.input.name,
    status: run.status,
    createdAt: run.createdAt,
    reportPath,
  }]);
  return { runPath, reportPath, jsonPath };
}

export async function loadRun(dir: string, runId: string): Promise<OpenGeoRun> {
  const path = join(workspacePaths(dir).runsDir, `${runId}.json`);
  return JSON.parse(await readFile(path, 'utf8')) as OpenGeoRun;
}

export async function listRuns(dir: string): Promise<RunIndexEntry[]> {
  return readJsonl<RunIndexEntry>(workspacePaths(dir).runsIndex);
}

export async function latestRun(dir: string): Promise<OpenGeoRun> {
  const runs = await listRuns(dir);
  const entry = runs.at(-1);
  if (!entry) throw new Error('No recorded runs found. Run diagnose, plan, run, or demo first.');
  return loadRun(dir, entry.runId);
}

export async function applyLatestEvolution(
  dir: string,
  runId?: string,
): Promise<{ project: OpenGeoProject; runId: string; fromVersion: number; toVersion: number; projectPath: string }> {
  const { paths, project } = await loadWorkspace(dir);
  const run = runId ? await loadRun(dir, runId) : await latestRun(dir);
  const proposal = run.evolution;
  if (proposal.fromVersion !== project.queryBank.version) {
    throw new Error(`Evolution proposal expects query bank v${proposal.fromVersion}, but workspace is v${project.queryBank.version}. Run plan again from the current project.`);
  }
  const evolved = applyEvolution(project, proposal);
  await saveProject(paths.project, evolved);
  const record = {
    at: new Date().toISOString(),
    runId: run.id,
    fromVersion: proposal.fromVersion,
    toVersion: proposal.toVersion,
    queryCount: proposal.queries.length,
    candidateCount: proposal.queries.filter(query => query.status === 'candidate').length,
    reason: proposal.reason,
  };
  await appendJsonl(join(paths.evidenceDir, 'evolutions.jsonl'), [record]);
  await appendJsonl(paths.importsLog, [{
    at: record.at,
    kind: 'evolution',
    source: `run:${run.id}`,
    count: proposal.queries.length,
    ids: proposal.queries.map(query => query.id),
  }]);
  return { project: evolved, runId: run.id, fromVersion: proposal.fromVersion, toVersion: proposal.toVersion, projectPath: paths.project };
}

export async function confirmQuery(
  dir: string,
  queryId: string,
  targetStatus: 'confirmed' | 'retired',
  priority?: Query['priority'],
): Promise<{ project: OpenGeoProject; changed: boolean; fromVersion: number; toVersion: number; projectPath: string }> {
  const { paths, project } = await loadWorkspace(dir);
  const query = project.queryBank.queries.find(item => item.id === queryId);
  if (!query) {
    const known = project.queryBank.queries.map(item => item.id).join(', ');
    throw new Error(`Unknown query id "${queryId}". Known ids: ${known || 'none'}`);
  }
  const statusChanged = query.status !== targetStatus;
  const priorityChanged = priority !== undefined && query.priority !== priority;
  if (!statusChanged && !priorityChanged) {
    return { project, changed: false, fromVersion: project.queryBank.version, toVersion: project.queryBank.version, projectPath: paths.project };
  }
  const fromVersion = project.queryBank.version;
  const next = structuredClone(project);
  const nextQuery = next.queryBank.queries.find(item => item.id === queryId)!;
  nextQuery.status = targetStatus;
  if (priority) nextQuery.priority = priority;
  nextQuery.origin = nextQuery.origin.includes('human-confirmed')
    ? nextQuery.origin
    : `${nextQuery.origin}; human-confirmed ${new Date().toISOString()}`;
  next.queryBank.version = fromVersion + 1;
  await saveProject(paths.project, next);
  await appendJsonl(join(paths.evidenceDir, 'confirmations.jsonl'), [{
    at: new Date().toISOString(),
    queryId,
    fromStatus: query.status,
    toStatus: targetStatus,
    fromPriority: query.priority,
    toPriority: priority || query.priority,
    fromVersion,
    toVersion: next.queryBank.version,
  }]);
  return { project: next, changed: true, fromVersion, toVersion: next.queryBank.version, projectPath: paths.project };
}
