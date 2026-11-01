import { randomUUID } from 'node:crypto';
import { validatePublicWebUrl } from '../../vendor/niubigeo/src/utils/public-web-fetch.js';
import { researchWebsite, type WebsiteResearch } from './onboarding.js';
import type { Project } from './types.js';
import { Store } from './storage.js';
import { enrichWebsiteResearch, type EnrichedWebsiteResearch } from './semantic-research.js';
import { resolveProviderKey } from '../../vendor/niubigeo/src/config/env.js';
import type { LiveConfig } from './types.js';

export interface ResearchJob {
  id: string; status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'interrupted';
  input: { url: string; language: string; country: string; researchMode?: 'model'; provider?: string; model?: string };
  createdAt: string; finishedAt?: string; result?: WebsiteResearch | EnrichedWebsiteResearch; error?: string; projectId?: string;
}
export class ResearchService {
  private active = 0;
  private creationQueue: Promise<unknown> = Promise.resolve();
  private accepting = new Set<string>();
  constructor(private store: Store, private research = researchWebsite, private enrich = enrichWebsiteResearch) {}
  async initialize() {
    for (const job of await this.store.list<ResearchJob>('researches')) {
      if (['queued', 'running'].includes(job.status)) {
        job.status = 'interrupted'; job.error = 'Research was interrupted. Start a new research run; saved evidence is retained.';
        await this.store.save('researches', job);
      }
    }
  }
  start(input: { url?: unknown; language?: unknown; country?: unknown; requestId?: unknown; modelConfig?: unknown }) {
    const work = this.creationQueue.catch(() => {}).then(() => this.startOne(input));
    this.creationQueue = work; return work;
  }
  private async startOne(input: { url?: unknown; language?: unknown; country?: unknown; requestId?: unknown; modelConfig?: unknown }) {
    if (typeof input.url !== 'string' || input.url.length > 2048) throw new Error('Enter a public website URL.');
    const raw = input.url.trim();
    if (!raw.includes('://') && /^[a-z][a-z\d+.-]*:/i.test(raw)) throw new Error('Use a public HTTP(S) website.');
    const url = validatePublicWebUrl(raw.includes('://') ? raw : `https://${raw}`); url.hash = '';
    const language = input.language ?? 'en', country = input.country ?? 'US';
    if (language !== 'en' || typeof country !== 'string' || !['US', 'GB', 'CA', 'AU'].includes(country)) throw new Error('This MVP supports English in the US, UK, Canada and Australia.');
    const id = input.requestId ?? `research-${randomUUID()}`;
    if (typeof id !== 'string' || !/^research-[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid research request ID.');
    let config: LiveConfig | undefined;
    if (input.modelConfig !== undefined) {
      const value = input.modelConfig;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid model research configuration.');
      const data = value as Record<string, unknown>;
      if (typeof data.provider !== 'string' || !['openrouter','openai','deepseek','perplexity','gemini','anthropic'].includes(data.provider) || typeof data.model !== 'string' || !data.model.trim() || data.model.length > 200 || (data.apiKey !== undefined && (typeof data.apiKey !== 'string' || data.apiKey.length > 2000))) throw new Error('Select a supported provider and a valid model ID.');
      const apiKey = (typeof data.apiKey === 'string' ? data.apiKey.trim() : '') || resolveProviderKey(data.provider);
      if (!apiKey) throw new Error('Provide an API key or configure the provider locally.');
      config = {provider:data.provider,model:data.model.trim(),apiKey,maxQuestions:5,webSearch:false};
    }
    const normalized = { url: url.href, language, country, ...(config ? {researchMode:'model' as const,provider:config.provider,model:config.model} : {}) };
    const existing = await this.store.get<ResearchJob>('researches', id);
    if (existing) {
      if (JSON.stringify(existing.input) !== JSON.stringify(normalized)) throw new Error('This request ID belongs to different research inputs.');
      return existing;
    }
    if (this.active >= 2) throw new Error('Two research tasks are already running. Try again shortly.');
    this.active++;
    const job: ResearchJob = { id, input: normalized, status: 'queued', createdAt: new Date().toISOString() };
    try { await this.store.save('researches', job); } catch (error) { this.active--; throw error; }
    void this.execute(job, config).catch(() => {}).finally(() => { this.active--; });
    return job;
  }
  private async execute(job: ResearchJob, config?: LiveConfig) {
    try {
      job.status = 'running'; await this.store.save('researches', job);
      job.result = await this.research(job.input);
      if (config) {
        await this.store.save('researches', job);
        const enriched = await this.enrich(job.result, config);
        if (enriched.enrichment.status === 'failed' && enriched.status === 'completed') enriched.status = 'partial';
        job.result = enriched;
      }
      job.status = job.result.status;
      if (job.status === 'failed') job.error = 'Could not build a website profile from public page evidence.';
    } catch {
      job.status = 'failed'; job.error = 'Website research failed. No diagnostic results were generated.';
    }
    job.finishedAt = new Date().toISOString(); await this.store.save('researches', job);
  }
  get(id: string) { return this.store.get<ResearchJob>('researches', id); }
  async accept(id: string, selectedPromptIds: unknown) {
    if (this.accepting.has(id)) throw new Error('Workspace creation is already in progress. Retry shortly.');
    this.accepting.add(id);
    try {
      const job = await this.get(id);
      if (!job) throw new Error('Research not found.');
      const result = job.result;
      if (!['completed', 'partial'].includes(job.status) || !result?.profile || !result.sources.length) throw new Error('Usable website research is required.');
      if (!Array.isArray(selectedPromptIds) || !selectedPromptIds.length || selectedPromptIds.length > 40 || selectedPromptIds.some(id => typeof id !== 'string')) throw new Error('Select 1–40 suggested prompts.');
      const selected = new Set<string>(selectedPromptIds);
      if (selected.size !== selectedPromptIds.length || [...selected].some(id => !result.prompts.some(prompt => prompt.id === id))) throw new Error('Prompt selection does not match this research.');
      const projectId = `project-${job.id}`;
      const existing = await this.store.get<Project>('projects', projectId);
      if (existing) return existing;
      const now = new Date().toISOString();
      const project: Project = {
        id: projectId, name: result.profile.brand, brand: result.profile.brand, aliases: [],
        domain: result.domain, industry: result.profile.industry || '', description: result.profile.description,
        origin: 'manual', market: 'international', language: result.language, country: result.country,
        researchId: job.id, topics: result.topics,
        goal: `Diagnose ${result.profile.brand}'s AI visibility in ${result.country} using English questions and traceable answer evidence.`,
        sources: result.sources, claims: result.claims,
        queries: result.prompts.map(p => ({
          id: p.id, text: p.text, intent: p.intent, branded: p.branded, origin: p.origin === 'model-assisted' ? 'Model-assisted proposal grounded in website sources; reviewed at onboarding' : 'Website-grounded English template; reviewed at onboarding',
          status: selected.has(p.id) ? 'active' : 'suggested', revision: 1, topicId: p.topicId, sourceIds: p.sourceIds, country: result.country, language: result.language,
        })), queryVersion: 1, samples: [], createdAt: now, updatedAt: now,
      };
      await this.store.save('projects', project);
      job.projectId = projectId; await this.store.save('researches', job);
      return project;
    } finally { this.accepting.delete(id); }
  }
}
