export type Mode = 'replay' | 'live';
export type Origin = 'synthetic' | 'archive' | 'api' | 'manual' | 'browser';
export interface ClaimSource {
  id: string; title: string; text: string; url?: string;
  kind?: 'text' | 'pdf' | 'website'; sha256?: string; importedAt?: string;
  page?: number; fileName?: string; localPath?: string;
}
export interface Claim {
  id: string; label: string; value: string; status: 'confirmed' | 'unconfirmed' | 'conflict';
  sourceIds: string[]; alternatives?: { value: string; sourceId: string }[];
  confirmation?: { sourceId: string; at: string };
  quote?: string;
}
export interface Query { id: string; text: string; intent: string; branded: boolean; origin: string; status?: 'suggested' | 'active' | 'inactive'; topicId?: string; sourceIds?: string[]; country?: string; language?: string; revision?: number; previousVersionId?: string; createdAt?: string; updatedAt?: string }
export interface Citation {
  url: string; kind: 'provider_citation' | 'search_result' | 'grounding' | 'answer_url';
  source: string; payloadPath?: string; integrity: 'matched' | 'unverified' | 'mismatch';
}
export interface Sample {
  id: string; queryId: string; question: string; intent: string; branded: boolean;
  origin: Origin; model: string; observedAt: string; runGroup: string; protocolId: string;
  collectionStatus: 'completed' | 'failed'; analysisStatus: 'completed' | 'failed' | 'unknown';
  answer: string; rawResponse?: unknown; citations: Citation[]; error?: string;
  upstreamAttemptId?: string; search?: unknown; costUsd?: number; latencyMs?: number;
  recommendationEvidence?: string; sourceJudgment?: string;
  measurementUnitId?: string; attemptId?: string; selected?: boolean; fallback?: boolean;
}

export interface MeasurementTarget {
  id: string; platform: string; preferredChannel: 'web' | 'api';
  webEngine?: 'chatgpt'; provider?: string; model?: string; webSearch?: boolean;
  searchMode?: 'provider_native' | 'browser_ui' | 'disabled';
  /** Desired transport order; does not claim a browser adapter exists. */
  browserPreference?: 'browser_first' | 'api_only';
}
export interface MeasurementAttemptRecord {
  id: string; unitId: string; targetId: string; platform: string; channel: 'web' | 'api';
  provider?: string; model?: string; status: 'completed' | 'failed' | 'skipped';
  sampleId?: string; fallback: boolean; reason?: string; startedAt: string; finishedAt: string;
}
export interface MeasurementUnit {
  id: string; queryId: string; question: string; targetId: string; platform: string;
  preferredChannel: 'web' | 'api'; status: 'planned' | 'completed' | 'failed';
  attempts: MeasurementAttemptRecord[]; selectedSampleId?: string; selectedChannel?: 'web' | 'api';
}
export interface TrackedBrand { id: string; name: string; aliases: string[]; domains: string[]; status: 'active' | 'suggested' | 'inactive'; isOwn: boolean }
export interface Project {
  recordings?: import('./recordings.js').Recording[];
  competitors?: TrackedBrand[];
  tableSettings?: { hiddenColumns: string[]; deltaDisplay: 'full' | 'icon' | 'none'; version: number };
  promptChanges?: { requestId: string; fingerprint: string; ids: string[]; version: number }[];
  market?: 'international' | 'china'; language?: string; country?: string; researchId?: string;
  topics?: { id: string; name: string; sourceIds: string[] }[];
  id: string; name: string; brand: string; aliases: string[]; domain: string; industry: string;
  description: string; origin: 'synthetic' | 'archive' | 'manual'; goal: string;
  sources: ClaimSource[]; claims: Claim[]; queries: Query[]; queryVersion: number;
  samples: Sample[]; createdAt: string; updatedAt: string;
}
export interface Judgment {
  sampleId: string; mentioned: boolean | null; recommended: boolean | null;
  evidence: { quote: string; start: number; end: number } | null;
  reason: string; needsReview: boolean;
}
export interface Metric { numerator: number; denominator: number; value: number | null }
export interface Audit {
  planned: number; collected: number; analyzed: number; collectionFailed: number; analysisFailed: number;
  mention: Metric; recommendation: Metric; judgments: Judgment[];
  providerCitations: number; searchResults: number; groundings: number; answerUrls: number;
  citationIntegrityFailures: number;
  plannedUnits?: number; attemptCount?: number;
  strata: { label: string; count: number; collected: number; mentioned: number; denominator: number }[];
}
export interface Action {
  id: string; title: string; kind: 'fact' | 'content' | 'source' | 'measurement';
  priority: 'P0' | 'P1' | 'P2'; rationale: string; queryIds: string[]; sampleIds: string[];
  claimIds: string[]; acceptance: string; status: 'proposed' | 'in_progress' | 'done';
  /** Optional content-opportunity fields. Older saved runs remain valid without them. */
  contentType?: 'faq' | 'product_page' | 'comparison' | 'implementation_guide' | 'case_study' | 'selection_guide';
  trigger?: string;
  evidenceGap?: string;
  recommendedFacts?: string[];
  outline?: string[];
  contentStatus?: 'ready' | 'needs-review' | 'blocked';
}
export interface Draft {
  title: string; markdown: string; claimIds: string[]; status: 'blocked' | 'draft' | 'reviewed';
  warnings: string[]; generator: 'rules' | 'llm';
}
export interface Step {
  id: string; label: string; skill: string; status: 'pending' | 'running' | 'completed' | 'blocked' | 'failed';
  startedAt?: string; finishedAt?: string; summary?: string; evidenceIds: string[];
  executor: 'rules' | 'archive' | 'llm' | 'browser';
}
export interface ModelCall {
  id: string; purpose: string; provider: string; model: string; startedAt: string;
  status: 'running' | 'completed' | 'failed'; promptHash: string; response?: unknown;
  requestParameters?: Record<string, unknown>;
  answer?: string; costUsd?: number; error?: string;
}
export interface Publication { id: string; url: string; recordedAt: string; note: string; state: 'recorded_not_verified' }
export interface AgentRun {
  id: string; projectId: string; projectSnapshot: Project; mode: Mode; goal: string;
  status: 'queued' | 'running' | 'completed' | 'needs_review' | 'failed' | 'interrupted';
  createdAt: string; finishedAt?: string; steps: Step[]; queries: Query[]; samples: Sample[];
  audit?: Audit; actions: Action[]; draft?: Draft; calls: ModelCall[]; publications: Publication[];
  limitations: string[]; review: string; error?: string; model?: string; provider?: string;
  measurementTargets?: MeasurementTarget[]; measurementUnits?: MeasurementUnit[];
}
export interface LiveConfig { provider: string; model: string; apiKey: string; maxQuestions: number; webSearch: boolean }
export const SKILLS = [
  ['ground', '品牌事实', 'brand-grounding'], ['queries', '问题空间', 'query-discovery'],
  ['audit', '可见度诊断', 'visibility-audit'], ['sources', '信源分析', 'source-analysis'],
  ['strategy', '策略规划', 'strategy-planning'], ['content', '内容工程', 'content-engineering'],
  ['monitor', '监测比较', 'monitoring-analysis'], ['review', '实验复盘', 'experiment-retrospective'],
] as const;
