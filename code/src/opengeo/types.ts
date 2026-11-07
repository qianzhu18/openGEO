export type FactStatus = 'confirmed' | 'unconfirmed' | 'conflict';
export type QueryStatus = 'confirmed' | 'candidate' | 'retired';
export type StepStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed';
export type RunStatus = 'queued' | 'running' | 'completed' | 'needs_confirmation' | 'failed';
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

export interface Fact {
  id: string;
  text: string;
  source: string;
  status: FactStatus;
}

export interface Query {
  id: string;
  text: string;
  intent: string;
  platform: string;
  priority: 'P0' | 'P1' | 'P2';
  origin: string;
  status: QueryStatus;
}

export interface QueryBank {
  version: number;
  queries: Query[];
}

export interface Asset {
  id: string;
  title: string;
  channel: string;
  url?: string;
  content: string;
  metrics?: Record<string, number>;
}

export interface CitationRecord {
  url: string;
  type: 'provider_citation' | 'search_result' | 'answer_url' | 'manual';
  integrity: 'matched' | 'unverified' | 'mismatch';
}

export interface Observation {
  id: string;
  cycle: number;
  queryId: string;
  platform: string;
  answer: string;
  observedAt: string;
  sentiment?: Sentiment;
  riskTags?: string[];
  citations?: CitationRecord[];
}

export interface ChannelHypothesis {
  id: string;
  platform: string;
  statement: string;
  evidenceObservationIds: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface OpenGeoProject {
  schemaVersion: 'opengeo-project/v1';
  id: string;
  name: string;
  brand: string;
  aliases: string[];
  market: 'intl-open-web' | 'china-platforms' | 'mixed';
  goal: string;
  facts: Fact[];
  queryBank: QueryBank;
  assets: Asset[];
  observations: Observation[];
  channelHypotheses: ChannelHypothesis[];
}

export interface EventDefinition {
  id: string;
  name: string;
  owner: string;
  fields: string[];
  purpose: string;
}

export interface SellingPoint {
  id: string;
  assetId: string;
  queryId: string;
  evidenceQuote: string;
  score: number;
  status: 'usable' | 'needs_review';
  reason: string;
}

export interface ObservationJudgment {
  observationId: string;
  mentioned: boolean;
  sentiment: Sentiment;
  riskTags: string[];
  citationCount: number;
  needsReview: boolean;
}

export interface CycleMetric {
  cycle: number;
  observations: number;
  mentioned: number;
  mentionRate: number | null;
  positive: number;
  negative: number;
  riskTags: number;
  citations: number;
}

export interface ContentDraft {
  id: string;
  queryId: string;
  platform: string;
  title: string;
  markdown: string;
  factIds: string[];
  assetIds: string[];
  status: 'draft' | 'blocked';
  warnings: string[];
}

export interface PublicationTask {
  id: string;
  draftId: string;
  channel: string;
  mode: 'manual_review' | 'api';
  checklist: string[];
  status: 'waiting_confirmation';
}

export interface IterationAction {
  id: string;
  type: 'instrumentation' | 'evidence' | 'content' | 'channel' | 'risk' | 'measurement';
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  rationale: string;
  evidenceIds: string[];
  acceptance: string;
}

export interface EvolvedQuery {
  id: string;
  text: string;
  intent: string;
  platform: string;
  priority: 'P0' | 'P1' | 'P2';
  origin: string;
  status: QueryStatus;
}

export interface EvolutionProposal {
  fromVersion: number;
  toVersion: number;
  reason: string;
  queries: EvolvedQuery[];
  contentDirections: string[];
  guardrails: string[];
}

export interface StepTrace {
  id: string;
  skill: string;
  layer: 'delivery' | 'skill' | 'workflow' | 'evidence' | 'runtime';
  status: StepStatus;
  summary: string;
  evidenceIds: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface OpenGeoRun {
  schemaVersion: 'opengeo-run/v1';
  id: string;
  projectId: string;
  input: OpenGeoProject;
  status: RunStatus;
  createdAt: string;
  finishedAt?: string;
  steps: StepTrace[];
  eventDefinitions: EventDefinition[];
  sellingPoints: SellingPoint[];
  judgments: ObservationJudgment[];
  cycleMetrics: CycleMetric[];
  drafts: ContentDraft[];
  publicationTasks: PublicationTask[];
  actions: IterationAction[];
  evolution: EvolutionProposal;
  limitations: string[];
}

export const CYCLE_SKILLS = [
  ['instrument', 'data-instrumentation'],
  ['mine', 'selling-point-mining'],
  ['confirm', 'workflow-confirmation-gate'],
  ['write', 'platform-content-writing'],
  ['publish', 'publication-workflow'],
  ['monitor', 'sentiment-monitoring'],
  ['review', 'iteration-retrospective'],
  ['evolve', 'self-evolution'],
] as const;

