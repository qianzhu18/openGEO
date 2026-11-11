import { deriveBrandMetrics, deriveSourceMetrics, metricCohortIdentity, type BrandEntity } from './brand-metrics.js';
import { parseQuestionSet } from './question-set.js';
import type { AgentRun, Sample } from './types.js';

export interface AnalyticsFilter { model?: string; channel?: string; days?: number }
const isHeading = (text: string) => parseQuestionSet([text], { min: 0, max: 1, maxLength: 10000 }).ignoredHeadings.length > 0;
const channel = (sample: Sample) => sample.origin === 'browser' ? 'web' : sample.origin;
export function analyzeRun(run: AgentRun, filter: AnalyticsFilter = {}) {
  const project = run.projectSnapshot;
  const brands: BrandEntity[] = [{ id: 'own-brand', name: project.brand, aliases: project.aliases, domains: [project.domain], status: 'active', isOwn: true }, ...(project.competitors || []).filter(b => !b.isOwn)];
  const cutoff = filter.days ? Date.now() - filter.days * 86400000 : 0;
  const matches = (sample: Sample) => (!filter.model || filter.model === 'all' || sample.model === filter.model) && (!filter.channel || filter.channel === 'all' || channel(sample) === filter.channel) && (!cutoff || Date.parse(sample.observedAt) >= cutoff);
  // A local ID can be reused by an import from another origin or batch.
  const identity = (sample: Sample) => JSON.stringify([sample.origin, sample.runGroup, sample.id]);
  const observationKey = (sample: Sample) => JSON.stringify([metricCohortIdentity(sample).key, sample.id]);
  const byId = new Map<string, Sample[]>();
  for (const sample of run.samples) byId.set(sample.id, [...(byId.get(sample.id) || []), sample]);
  const planned = run.measurementUnits?.length ? run.measurementUnits.map(unit => {
    const candidates = unit.selectedSampleId ? byId.get(unit.selectedSampleId) || [] : [];
    const linked = candidates.filter(s => s.measurementUnitId === unit.id);
    const choices = linked.length ? linked : candidates;
    const selected = choices.length === 1 ? choices[0] : undefined;
    const selectionError = choices.length > 1 ? 'ambiguous-selected-sample' : unit.selectedSampleId && !selected ? 'missing-selected-sample' : undefined;
    const target = run.measurementTargets?.find(t => t.id === unit.targetId);
    const failureModels = [target?.model, target?.provider && target.model ? `${target.provider}/${target.model}` : null, ...unit.attempts.flatMap(a => [a.model, a.provider && a.model ? `${a.provider}/${a.model}` : null])].filter(Boolean);
    const modelMatch = !filter.model || filter.model === 'all' || failureModels.includes(filter.model);
    return { id: unit.id, queryId: unit.queryId, question: unit.question, platform: unit.platform, sample: selected, status: unit.status,
      attempts: unit.attempts.length, attemptDetails: unit.attempts.map(a => ({ channel: a.channel, status: a.status, fallback: a.fallback, model: a.model || null, reason: a.reason || null })), reason: selectionError || unit.attempts.at(-1)?.reason,
      inScope: selected ? matches(selected) : modelMatch && (!filter.channel || filter.channel === 'all' || unit.preferredChannel === filter.channel) && (!cutoff || Date.parse(run.createdAt) >= cutoff) };
  }) : [...new Map(run.samples.filter(s => s.selected !== false).map(s => [JSON.stringify([s.origin, s.runGroup, s.id]), s])).values()].map(sample => ({
    id: sample.measurementUnitId || sample.id, queryId: sample.queryId, question: sample.question, platform: sample.model, sample, status: sample.collectionStatus,
    attempts: 1, attemptDetails: [{ channel: channel(sample), status: sample.collectionStatus, fallback: sample.fallback === true, model: sample.model, reason: sample.error || null }], reason: sample.error, inScope: matches(sample),
  }));
  const units = planned.filter(unit => unit.inScope);
  const selected = units.flatMap(unit => unit.sample && !isHeading(unit.question) ? [unit.sample] : []);
  const metrics = deriveBrandMetrics(selected, brands);
  const observations = new Map(metrics.observations.map(o => [JSON.stringify([o.cohortKey, o.sampleId]), o]));
  const adopted = new Set<string>();
  const rows = units.map(unit => {
    const s = unit.sample, observation = s && observations.get(observationKey(s));
    const invalidQuestion = isHeading(unit.question);
    const duplicate = Boolean(s && adopted.has(identity(s)));
    if (s) adopted.add(identity(s));
    const valid = Boolean(!invalidQuestion && !duplicate && observation?.eligible);
    const pending = !s && unit.status === 'planned' && ['queued', 'running'].includes(run.status);
    const own = observation?.brands.find(b => b.brandId === 'own-brand');
    return { id: unit.id, queryId: unit.queryId, question: unit.question, platform: unit.platform,
      sampleId: s?.id || null, sampleIdentity: s ? identity(s) : null, cohortKey: observation?.cohortKey || null, model: s?.model || null, channel: s ? channel(s) : null, protocolId: s?.protocolId || null,
      observedAt: s?.observedAt || null, runGroup: s?.runGroup || null, branded: s?.branded ?? run.queries.find(q => q.id === unit.queryId)?.branded ?? null,
      topic: project.topics?.find(t => t.id === run.queries.find(q => q.id === unit.queryId)?.topicId)?.name || s?.intent || run.queries.find(q => q.id === unit.queryId)?.intent || 'UNKNOWN',
      status: valid ? 'valid' : pending ? 'pending' : 'excluded', attempts: unit.attempts, attemptDetails: unit.attemptDetails,
      reason: invalidQuestion ? 'question-is-group-heading' : duplicate ? 'duplicate-adopted-sample' : valid ? null : s?.error || unit.reason || observation?.exclusionReason || (pending ? 'not-finished' : 'not-collected'),
      mentioned: valid ? own?.mentioned ?? false : null, quote: valid ? own?.evidence?.quote || null : null,
      providerCitations: valid ? (s?.citations || []).filter(c => c.kind === 'provider_citation' && c.integrity !== 'mismatch').length : 0 };
  });
  const validSamples = units.flatMap((unit, index) => unit.sample && rows[index]?.status === 'valid' ? [unit.sample] : []);
  const sources = deriveSourceMetrics(validSamples, brands);
  const valid = rows.filter(r => r.status === 'valid').length, pending = rows.filter(r => r.status === 'pending').length;
  const groups = new Map<string, typeof rows>();
  for (const row of rows) { const key = JSON.stringify([row.queryId, row.question]); groups.set(key, [...(groups.get(key) || []), row]); }
  const questions = [...groups.values()].map(items => ({ queryId: items[0]!.queryId, question: items[0]!.question, topic: items[0]!.topic,
    planned: items.length, valid: items.filter(r => r.status === 'valid').length, mentioned: items.filter(r => r.mentioned === true).length, sampleIds: items.flatMap(r => r.sampleId ? [r.sampleId] : []) }));
  const trends = metrics.cohorts.map(cohort => {
    const samples = validSamples.filter(s => observations.get(observationKey(s))?.cohortKey === cohort.key && observations.get(observationKey(s))?.eligible);
    const days = [...new Set(samples.map(s => s.observedAt.slice(0, 10)))].sort();
    return { key: cohort.key, label: `${cohort.model} · ${cohort.origin} · ${cohort.branded ? 'branded' : 'unbranded'} · ${cohort.intent} · ${cohort.runGroup}`, protocolId: cohort.protocolId,
      points: days.map(day => { const subset = samples.filter(s => s.observedAt.startsWith(day)); const own = deriveBrandMetrics(subset, brands).brands.find(b => b.isOwn)!; return { day, ...own.visibility }; }) };
  });
  const summary = {
    coveredQuestions: questions.filter(q => q.valid > 0).length,
    questionCount: questions.length,
    gaps: questions.filter(q => q.valid < q.planned).map(q => ({ queryId: q.queryId, question: q.question, valid: q.valid, planned: q.planned })),
    cohortFindings: metrics.cohorts.map(cohort => {
      const own = cohort.brands.find(b => b.isOwn)!;
      const topSource = sources.cohorts.find(s => s.key === cohort.key)?.domains.find(s => s.citationCount > 0 && s.kind === 'provider_citation');
      return { key: cohort.key, model: cohort.model, origin: cohort.origin, protocolId: cohort.protocolId, branded: cohort.branded, intent: cohort.intent, runGroup: cohort.runGroup,
        mention: own.visibility, sampleId: own.mentionedObservationIds[0] || cohort.eligibleObservationIds[0] || null,
        source: topSource ? { domain: topSource.source, kind: topSource.kind, integrity: topSource.integrity, items: topSource.citationCount, used: topSource.used, sampleIds: topSource.sampleIds } : null };
    }),
  };
  const contaminated = planned.some(u => isHeading(u.question));
  return { version: 'opengeo-diagnostic/v1' as const, runId: run.id, createdAt: run.createdAt, status: run.status, brand: project.brand,
    queryVersion: project.queryVersion, mode: run.mode, origin: project.origin, filter,
    models: [...new Set(run.samples.map(s => s.model))],
    quality: { planBasis: run.measurementUnits?.length ? 'frozen-units' as const : 'saved-records' as const, planned: rows.length, valid, excluded: rows.length - valid - pending, pending, attempts: units.reduce((n, u) => n + u.attempts, 0), coverage: rows.length ? valid / rows.length : null,
      contaminated, label: contaminated ? 'qa-only' : valid ? 'exploratory' : 'no-data', unselectedAttempts: run.samples.filter(s => s.selected === false).length },
    warnings: [...(!run.measurementUnits?.length ? ['No frozen plan is stored. Coverage describes saved records only; original collection coverage is UNKNOWN.'] : []), ...(contaminated ? ['Group headings entered the question set. This run is QA evidence, not a formal baseline.'] : []), ...(metrics.mixedCohorts ? ['Channels, models, protocols and branded question groups are separated; no combined visibility percentage.'] : []), 'Only this selected question set is described. No search volume, sentiment, conversion or causal uplift has been verified.'],
    metrics, sources, rows, questions, trends, summary };
}
export type DiagnosticAnalysis = ReturnType<typeof analyzeRun>;
