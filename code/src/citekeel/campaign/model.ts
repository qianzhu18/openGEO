/** Editorial analysis stays explicit input; deterministic replay never pretends to do research. */
export interface SourceRequest { id: string; url: string; title: string; kind: 'official-site' | 'official-repository' | 'independent'; }
export interface SourceRecord extends SourceRequest {
  status: 'collected' | 'failed'; retrievedAt: string; finalUrl?: string; contentType?: string;
  textFile?: string; sha256?: string; error?: string;
  captureMethod?: 'http' | 'native-web-excerpt'; coverage?: 'page-text' | 'excerpt';
  previousAttempts?: { status: string; error?: string; method: string; retrievedAt: string }[];
}
export interface CampaignClaim {
  id: string; sourceId: string; quote: string; statement: string; scope: string;
  review: 'source-checked' | 'pending' | 'conflict';
}
export interface CampaignAudience {
  id: string; name: string; job: string; decision: string; concerns: string[];
  basis: 'website-declared' | 'hypothesis'; claimIds: string[]; validateWith: string;
}
export interface CampaignQuestion {
  id: string; text: string; language: 'en' | 'zh'; branded: boolean; audienceId: string;
  stage: 'discovery' | 'evaluation' | 'implementation'; revision: number;
  origin: 'editorial-hypothesis' | 'customer-evidence'; reason: string;
}
export interface CampaignAsset {
  id: string; title: string; language: 'en' | 'zh'; audienceId: string; questionIds: string[];
  priority: 'P0' | 'P1' | 'P2'; format: 'guide' | 'faq' | 'product-update' | 'tutorial';
  channel: string; existingUrl: string | null; proposedPath: string;
  objective: string; reason: string; requiredMaterials: string[]; acceptance: string;
  linksTo: string[]; sections: { heading: string; text: string; claimIds: string[] }[];
}
export interface CampaignFinding {
  id: string; title: string; observation: string; implication: string; action: string;
  basis: 'public-source' | 'ai-answer' | 'hypothesis'; claimIds: string[]; attemptIds: string[];
}
export interface CampaignExecutiveSummary { situation: string; impact: string; nextAction: string; }
export interface CampaignBaselineTask {
  id: string; questionId: string; platform: string; rationale: string;
}
export interface CampaignProtocol {
  channel: 'web-ui' | 'api' | 'manual'; platform: string; model: string | null;
  region: string | null; language: 'en' | 'zh'; loginState: string | null;
  session: 'fresh' | 'existing' | null; profile: 'Xue' | null;
}
export interface CampaignAttempt {
  id: string; jobId: string; questionId: string; questionText: string; questionRevision: number;
  capturedAt: string; status: 'completed' | 'failed'; failureReason?: string;
  protocol: CampaignProtocol;
  evidence?: { answer?: string; html?: string; screenshot?: string; metadata?: string; sha256?: string };
}
export interface CampaignPublication { assetId: string; url: string; version: string; publishedAt: string; }
export interface CampaignSpec {
  schemaVersion: 'opengeo-campaign/v1'; id: string; round: number; asOf: string;
  brand: string; aliases: string[]; domain: string; objective: string;
  access: 'external-public-only'; platforms: string[];
  sources: SourceRequest[]; claims: CampaignClaim[]; audiences: CampaignAudience[];
  questions: CampaignQuestion[]; assets: CampaignAsset[]; findings: CampaignFinding[];
  executiveSummary: CampaignExecutiveSummary;
  baselinePlan: CampaignBaselineTask[];
  publications: CampaignPublication[]; samplingNote: string;
}
export interface EvaluatedAttempt {
  attempt: CampaignAttempt; eligible: boolean; exclusion: string | null; answer: string;
  mentioned: boolean | null; recommendation: boolean | null;
  mentionQuote: { quote: string; start: number; end: number } | null;
  top1: boolean | null; top3: boolean | null; rank: number | null;
  visibleUrls: string[]; citationExtraction: 'complete' | 'partial' | 'unknown';
}
export interface CampaignMetric {
  questionId: string; question: string; questionRevision: number; branded: boolean; platform: string; protocol: CampaignProtocol | null;
  numerator: number; denominator: number; value: number | null; attemptIds: string[];
  appearance: { numerator: number; denominator: number; value: number | null };
  top1: { numerator: number; denominator: number; value: number | null };
  top3: { numerator: number; denominator: number; value: number | null };
}
export interface CampaignRun {
  schemaVersion: 'opengeo-campaign-run/v1'; id: string; specHash: string; brandScopeHash: string; asOf: string;
  stages: { id: string; label: string; executor: 'deterministic' | 'editorial-input'; status: 'ready' | 'partial' | 'pending'; inputHash: string; outputHash: string; note: string }[];
  readiness: { sourceAudit: 'ready' | 'partial'; aiBaseline: 'not-collected' | 'partial' | 'collected';
    content: 'review-drafts' | 'briefs-only'; publication: 'not-recorded' | 'recorded-unverified'; effect: 'unknown' };
  sources: SourceRecord[]; claims: { id: string; verifiedQuote: boolean; publishableAsFact: false }[];
  attempts: EvaluatedAttempt[]; metrics: CampaignMetric[]; warnings: string[];
}
