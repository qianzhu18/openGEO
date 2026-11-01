import { createHash, randomUUID } from 'node:crypto';
import { fetchPublicWebText, validatePublicWebUrl } from '../../vendor/niubigeo/src/utils/public-web-fetch.js';
import { extractSiteEvidencePage } from '../../vendor/niubigeo/src/keywords/site-evidence.js';
import { findMention } from './analysis.js';
import { Store } from './storage.js';
import type { Project, Query, Sample } from './types.js';

export interface Recording {
  id: string; url: string; status: 'queued' | 'collected' | 'failed'; createdAt: string;
  title?: string; text?: string; headings?: string[]; sourceId?: string; capturedAt?: string;
  error?: string; attemptId?: string;
}
export type RecordingFetcher = (url: string) => Promise<{ url: string; text: string; contentType: string } | null>;
type RecordingProject = Project & { recordings?: Recording[] };
const stableId = (kind: string, value: string) => `${kind}-${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
function recordingUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) throw new Error('Enter a public website URL of up to 2048 characters.');
  const raw = input.trim();
  if (!raw.includes('://') && /^[a-z][a-z\d+.-]*:/i.test(raw)) throw new Error('Use a public HTTP(S) URL.');
  const url = validatePublicWebUrl(raw.includes('://') ? raw : `https://${raw}`);
  url.hash = '';
  return url.href;
}
async function boundedFetch(fetcher: RecordingFetcher, url: string, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([fetcher(url), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Recording collection timed out.')), Math.max(1, Math.min(timeoutMs, 12_000))); })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Recording is an input URL pool. Collected source text is never treated as an AI answer. */
export class RecordingService {
  constructor(private store: Store) {}
  async list(projectId: string): Promise<Recording[]> {
    const project = await this.store.get<RecordingProject>('projects', projectId);
    if (!project) throw new Error('Project not found.');
    return project.recordings || [];
  }
  async add(projectId: string, input: { url: unknown }): Promise<Recording> {
    const url = recordingUrl(input.url);
    const { result } = await this.store.updateProject(projectId, raw => {
      const project = raw as RecordingProject;
      project.recordings ||= [];
      const existing = project.recordings.find(item => item.url === url);
      if (existing) return existing;
      if (project.recordings.length >= 100) throw new Error('This local workspace supports up to 100 recording URLs.');
      const item: Recording = { id: `recording-${randomUUID()}`, url, status: 'queued', createdAt: new Date().toISOString() };
      project.recordings.push(item); project.updatedAt = new Date().toISOString();
      return item;
    });
    return result;
  }
  async remove(projectId: string, id: string): Promise<{ removed: boolean }> {
    const { result } = await this.store.updateProject(projectId, raw => {
      const project = raw as RecordingProject;
      const before = project.recordings || [];
      const removed = before.some(item => item.id === id);
      project.recordings = before.filter(item => item.id !== id);
      if (removed) project.updatedAt = new Date().toISOString();
      // Existing sources and prompts retain their provenance after a URL leaves the pool.
      return { removed };
    });
    return result;
  }
  async collect(projectId: string, id: string, fetcher: RecordingFetcher = fetchPublicWebText, timeoutMs = 12_000): Promise<Recording | null> {
    const attemptId = `recording-attempt-${randomUUID()}`;
    const { result: pending } = await this.store.updateProject(projectId, raw => {
      const item = (raw as RecordingProject).recordings?.find(row => row.id === id);
      if (!item) throw new Error('Recording not found.');
      item.status = 'queued'; item.attemptId = attemptId; delete item.error;
      return structuredClone(item);
    });
    let collected: { url: string; title: string; text: string; headings: string[] } | undefined;
    try {
      const page = await boundedFetch(fetcher, recordingUrl(pending.url), timeoutMs);
      if (!page || !/text\/html|application\/xhtml/i.test(page.contentType)) throw new Error('No public HTML.');
      const url = recordingUrl(page.url);
      const parsed = extractSiteEvidencePage({ url, html: page.text.slice(0, 260_000) });
      const text = compact(parsed.textSnippet || parsed.description || parsed.title || '').slice(0, 10_000);
      if (!text) throw new Error('Empty page.');
      collected = { url, title: compact(parsed.title || new URL(url).hostname).slice(0, 300), text, headings: (parsed.headings || []).map(compact).filter(Boolean).slice(0, 20) };
    } catch { /* Persist a bounded, safe failure message rather than transport or response secrets. */ }
    const { result } = await this.store.updateProject(projectId, raw => {
      const project = raw as RecordingProject;
      const item = project.recordings?.find(row => row.id === id);
      if (!item) return null;
      if (item.attemptId !== attemptId) return item;
      if (!collected) { item.status = 'failed'; item.error = 'Could not obtain usable public HTML evidence. Retry collection or check the URL.'; }
      else {
        const sourceId = stableId('recording-source', `${item.id}:${collected.url}:${collected.text}`);
        if (!project.sources.some(source => source.id === sourceId)) project.sources.push({ id: sourceId, title: collected.title, url: collected.url, text: collected.text });
        Object.assign(item, collected, { sourceId, status: 'collected', capturedAt: new Date().toISOString() });
      }
      project.updatedAt = new Date().toISOString();
      return item;
    });
    return result;
  }
  async proposePrompts(projectId: string, ids: string[]): Promise<{ prompts: Query[]; added: number }> {
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string')) throw new Error('Select between 1 and 20 collected recording URLs.');
    const { result } = await this.store.updateProject(projectId, raw => {
      const project = raw as RecordingProject;
      const recordings = [...new Set(ids)].map(id => project.recordings?.find(item => item.id === id));
      if (recordings.some(item => !item || item.status !== 'collected' || !item.sourceId || !project.sources.some(source => source.id === item.sourceId))) throw new Error('Collect each selected URL before generating suggestions.');
      project.topics ||= [];
      const prompts: Query[] = []; let added = 0;
      for (const recording of recordings as Recording[]) {
        const sourceId = recording.sourceId!;
        const heading = recording.headings?.find(value => value.length >= 5 && value.length <= 100 && !/^(home|contact us|sign up|log in|get started|learn more)$/i.test(value));
        const topicName = compact(heading || recording.title || new URL(recording.url).hostname).slice(0, 100);
        const topicId = stableId('topic', topicName.toLowerCase());
        const topic = project.topics.find(item => item.id === topicId);
        if (!topic) project.topics.push({ id: topicId, name: topicName, sourceIds: [sourceId] });
        else if (!topic.sourceIds.includes(sourceId)) topic.sourceIds.push(sourceId);
        const questions = [`What should buyers understand about ${topicName}?`, `What should a buyer verify when evaluating solutions for ${topicName}?`];
        for (const text of questions) {
          const id = stableId('prompt', `${project.id}:${project.language || 'en'}:${project.country || 'US'}:${text}`);
          const existing = project.queries.find(query => query.id === id || query.text === text);
          if (existing) { prompts.push(existing); continue; }
          const query: Query = { id, text, intent: text.startsWith('What should a buyer') ? 'commercial' : 'informational', branded: Boolean(findMention(text, [project.brand, ...project.aliases])), status: 'suggested', origin: `URL-recording/template/v1; ${recording.url}`, topicId, sourceIds: [sourceId], language: project.language || 'en', country: project.country || 'US' };
          project.queries.push(query); prompts.push(query); added++;
        }
      }
      if (added) project.queryVersion++;
      project.updatedAt = new Date().toISOString();
      return { prompts, added };
    });
    return result;
  }
}

export interface ObservedFanout { query: string; sampleId: string; queryId: string; provider: string; observedAt: string }
/** Only the provider's SearchExecution.webQueries field supplies observed fanouts. */
export function listObservedFanouts(samples: Sample[]): { items: ObservedFanout[]; knownSampleIds: string[]; unknownSampleIds: string[]; unknownCount: number } {
  const items: ObservedFanout[] = [], knownSampleIds: string[] = [], unknownSampleIds: string[] = [];
  for (const sample of samples) {
    const search = sample.search as Record<string, unknown> | null | undefined;
    if (!search || typeof search !== 'object' || typeof search.used !== 'boolean' || typeof search.requested !== 'boolean' || !Array.isArray(search.webQueries) || search.webQueries.some(query => typeof query !== 'string' || !query.trim() || query.length > 2000)) { unknownSampleIds.push(sample.id); continue; }
    if (sample.collectionStatus !== 'completed' || search.usedMode === 'requested_not_confirmed' || (search.requested && !search.used) || (!search.used && search.webQueries.length > 0) || (search.used && !search.webQueries.length)) { unknownSampleIds.push(sample.id); continue; }
    // Explicitly unused search is known empty; used search without queries is unknown above.
    knownSampleIds.push(sample.id);
    for (const query of new Set((search.webQueries as string[]).map(query => query.trim()))) items.push({ query, sampleId: sample.id, queryId: sample.queryId, provider: sample.model.split('/')[0] || sample.model, observedAt: sample.observedAt });
  }
  return { items, knownSampleIds, unknownSampleIds, unknownCount: unknownSampleIds.length };
}
