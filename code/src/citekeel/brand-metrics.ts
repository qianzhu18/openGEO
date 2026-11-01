import { findMention } from './analysis.js';
import type { Citation, Sample } from './types.js';

/** Public, explainable OpenGEO formulas; these do not recover Topify's private algorithms. */
export interface BrandEntity {
  id: string; name: string; aliases: string[]; domains: string[];
  status: 'active' | 'suggested' | 'inactive'; isOwn: boolean;
}
export interface DerivedMetric {
  numerator: number; denominator: number; value: number | null;
  status: 'available' | 'no-data' | 'mixed-cohorts' | 'excluded';
}
export interface MentionEvidence {
  quote: string; start: number; end: number;
  matchStart: number; matchEnd: number; matchedAlias: string;
}
export interface BrandObservation {
  sampleId: string; cohortKey: string; eligible: boolean; exclusionReason?: string;
  brands: { brandId: string; mentioned: boolean; position: number | null; evidence: MentionEvidence | null }[];
  ambiguities: { start: number; end: number; brandIds: string[]; reason: 'shared-alias' | 'overlapping-alias' }[];
}
export interface BrandMetricRow {
  brandId: string; name: string; isOwn: boolean;
  visibility: DerivedMetric; position: DerivedMetric; sov: DerivedMetric; top1Rate: DerivedMetric;
  sentiment: { value: null; status: 'unavailable'; reason: string };
  estimatedDemand: null; cvr: null;
  mentionedObservationIds: string[]; eligibleObservationIds: string[]; excludedObservationIds: string[];
}
export interface CohortIdentity { key: string; origin: Sample['origin']; model: string; protocolId: string; branded: boolean }
export interface BrandMetricCohort extends CohortIdentity {
  brands: BrandMetricRow[]; eligibleObservationIds: string[]; excludedObservationIds: string[];
}
export interface BrandMetricsResult {
  version: 'opengeo-brand-metrics/v1'; matcherVersion: 'literal-boundary-overlap/v1';
  mixedCohorts: boolean; brands: BrandMetricRow[]; cohorts: BrandMetricCohort[];
  observations: BrandObservation[]; eligibleObservationIds: string[]; excludedObservationIds: string[];
  exclusions: { sampleId: string; reason: string }[];
  formulas: { visibility: string; position: string; sov: string; top1Rate: string };
}
const formulas = {
  visibility: 'Distinct eligible answers mentioning brand / eligible answers.',
  position: 'Mean first-appearance rank among tracked brands in answers mentioning this brand; absent brands are excluded.',
  sov: 'Distinct response × brand slots for brand / distinct response × tracked-brand slots for all active tracked brands.',
  top1Rate: 'Eligible answers in which brand has first-appearance rank 1 / all eligible answers.',
};
export function metricCohortIdentity(sample: Sample): CohortIdentity {
  const identity = { origin: sample.origin, model: sample.model || 'unknown-model', protocolId: sample.protocolId || 'unknown-protocol', branded: Boolean(sample.branded) };
  return { key: JSON.stringify([identity.origin, identity.model, identity.protocolId, identity.branded]), ...identity };
}
function uniqueSamples(samples: Sample[]): Sample[] {
  const records = new Map<string, Sample>();
  const identityFacts = (sample: Sample) => JSON.stringify({ model: sample.model, protocolId: sample.protocolId, branded: sample.branded, collectionStatus: sample.collectionStatus, analysisStatus: sample.analysisStatus, answer: sample.answer, citations: sample.citations });
  for (const sample of samples) {
    const key = JSON.stringify([sample.origin, sample.runGroup, sample.id]);
    const previous = records.get(key);
    if (previous && identityFacts(previous) !== identityFacts(sample)) throw new Error(`Conflicting observation identity: ${sample.id}`);
    if (!previous) records.set(key, sample);
  }
  return [...records.values()];
}
function exclusion(sample: Sample): string | undefined {
  if (sample.collectionStatus !== 'completed') return 'collection-incomplete';
  if (sample.analysisStatus !== 'completed') return 'analysis-incomplete';
  if (!sample.answer?.trim()) return 'empty-answer';
  return undefined;
}
function metric(numerator: number, denominator: number, mixed = false, excluded = false): DerivedMetric {
  return { numerator, denominator, value: !mixed && !excluded && denominator ? numerator / denominator : null,
    status: excluded ? 'excluded' : mixed ? 'mixed-cohorts' : denominator ? 'available' : 'no-data' };
}
interface Candidate { brandId: string; alias: string; start: number; end: number }
function candidates(answer: string, brand: BrandEntity): Candidate[] {
  const masked = answer.replace(/https?:\/\/[^\s"<>]+/gi, url => ' '.repeat(url.length));
  const matches: Candidate[] = [];
  for (const alias of [...new Set([brand.name, ...brand.aliases].map(value => value.trim()).filter(Boolean))]) {
    // Reuse the established name matcher as the eligibility gate. Its quote range is not a rank position.
    if (!findMention(answer, [alias])) continue;
    const expression = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    const ascii = /^[a-z0-9 ._-]+$/i.test(alias);
    for (const match of masked.matchAll(expression)) {
      const start = match.index!, end = start + match[0].length;
      if (ascii && (/[a-z0-9_]/i.test(answer[start - 1] || '') || /[a-z0-9_]/i.test(answer[end] || ''))) continue;
      matches.push({ brandId: brand.id, alias, start, end });
    }
  }
  return matches;
}
function observe(sample: Sample, brands: BrandEntity[]): BrandObservation {
  const reason = exclusion(sample), cohortKey = metricCohortIdentity(sample).key;
  if (reason) return { sampleId: sample.id, cohortKey, eligible: false, exclusionReason: reason, brands: [], ambiguities: [] };
  const all = brands.flatMap(brand => candidates(sample.answer, brand));
  const bySpan = new Map<string, Candidate[]>();
  for (const item of all) { const key = `${item.start}:${item.end}`; bySpan.set(key, [...(bySpan.get(key) || []), item]); }
  const ambiguities: BrandObservation['ambiguities'] = [];
  const distinct: Candidate[] = [];
  for (const entries of bySpan.values()) {
    const ids = [...new Set(entries.map(entry => entry.brandId))].sort();
    if (ids.length > 1) {
      ambiguities.push({ start: entries[0]!.start, end: entries[0]!.end, brandIds: ids, reason: 'shared-alias' });
    } else distinct.push(entries.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias))[0]!);
  }
  // A longer exact name wins over a contained shorter name, e.g. Acme Pro over Acme.
  const longest = distinct.filter(item => !all.some(other => other.brandId !== item.brandId && other.start <= item.start && other.end >= item.end && other.end - other.start > item.end - item.start));
  const accepted: Candidate[] = [];
  for (const item of longest.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start || a.brandId.localeCompare(b.brandId))) {
    const overlap = accepted.find(other => other.brandId !== item.brandId && item.start < other.end && other.start < item.end);
    if (overlap) ambiguities.push({ start: Math.min(item.start, overlap.start), end: Math.max(item.end, overlap.end), brandIds: [item.brandId, overlap.brandId].sort(), reason: 'overlapping-alias' });
    else accepted.push(item);
  }
  const first = new Map<string, Candidate>();
  for (const item of accepted.sort((a, b) => a.start - b.start || b.end - a.end || a.brandId.localeCompare(b.brandId))) if (!first.has(item.brandId)) first.set(item.brandId, item);
  const ordered = [...first.values()].sort((a, b) => a.start - b.start || a.brandId.localeCompare(b.brandId));
  return { sampleId: sample.id, cohortKey, eligible: ambiguities.length === 0, ...(ambiguities.length ? { exclusionReason: 'ambiguous-brand-alias' } : {}), ambiguities,
    brands: brands.map(brand => {
      const item = first.get(brand.id);
      if (!item) return { brandId: brand.id, mentioned: false, position: null, evidence: null };
      const start = Math.max(0, item.start - 38), end = Math.min(sample.answer.length, item.end + 90);
      return { brandId: brand.id, mentioned: true, position: ordered.findIndex(candidate => candidate.brandId === brand.id) + 1,
        evidence: { quote: sample.answer.slice(start, end), start, end, matchStart: item.start, matchEnd: item.end, matchedAlias: item.alias } };
    }) };
}
function rows(observations: BrandObservation[], brands: BrandEntity[], mixed: boolean): BrandMetricRow[] {
  const eligible = observations.filter(row => row.eligible), excluded = observations.filter(row => !row.eligible);
  const allSlots = eligible.reduce((sum, row) => sum + row.brands.filter(brand => brand.mentioned).length, 0);
  return brands.map(brand => {
    const mentioned = eligible.filter(row => row.brands.some(item => item.brandId === brand.id && item.mentioned));
    const ranked = mentioned.map(row => row.brands.find(item => item.brandId === brand.id)!);
    return { brandId: brand.id, name: brand.name, isOwn: brand.isOwn,
      visibility: metric(mentioned.length, eligible.length, mixed),
      position: metric(ranked.reduce((sum, row) => sum + row.position!, 0), ranked.length, mixed),
      sov: metric(mentioned.length, allSlots, mixed), top1Rate: metric(ranked.filter(row => row.position === 1).length, eligible.length, mixed),
      sentiment: { value: null, status: 'unavailable', reason: 'No validated sentiment judgment was supplied; mention or recommendation wording is not a sentiment score.' }, estimatedDemand: null, cvr: null,
      mentionedObservationIds: mentioned.map(row => row.sampleId), eligibleObservationIds: eligible.map(row => row.sampleId), excludedObservationIds: excluded.map(row => row.sampleId) };
  });
}
export function deriveBrandMetrics(samples: Sample[], inputBrands: BrandEntity[]): BrandMetricsResult {
  samples = uniqueSamples(samples);
  if (new Set(inputBrands.map(brand => brand.id)).size !== inputBrands.length) throw new Error('Brand IDs must be unique.');
  const brands = inputBrands.filter(brand => brand.status === 'active' || brand.isOwn).sort((a, b) => a.id.localeCompare(b.id));
  const observations = samples.map(sample => observe(sample, brands));
  const groups = new Map<string, { identity: CohortIdentity; observations: BrandObservation[] }>();
  samples.forEach((sample, index) => { const identity = metricCohortIdentity(sample); if (!groups.has(identity.key)) groups.set(identity.key, { identity, observations: [] }); groups.get(identity.key)!.observations.push(observations[index]!); });
  const cohorts = [...groups.values()].map(({ identity, observations: items }) => ({ ...identity, brands: rows(items, brands, false), eligibleObservationIds: items.filter(row => row.eligible).map(row => row.sampleId), excludedObservationIds: items.filter(row => !row.eligible).map(row => row.sampleId) }));
  return { version: 'opengeo-brand-metrics/v1', matcherVersion: 'literal-boundary-overlap/v1', formulas,
    mixedCohorts: cohorts.length > 1, brands: rows(observations, brands, cohorts.length > 1), cohorts, observations,
    eligibleObservationIds: observations.filter(row => row.eligible).map(row => row.sampleId), excludedObservationIds: observations.filter(row => !row.eligible).map(row => row.sampleId),
    exclusions: observations.filter(row => !row.eligible).map(row => ({ sampleId: row.sampleId, reason: row.exclusionReason! })) };
}

export interface SourceMetricRow {
  source: string; level: 'domain' | 'url'; kind: Citation['kind']; integrity: Citation['integrity'];
  citationCount: number; observedCitationCount: number; excludedCitationCount: number;
  used: DerivedMetric; averageCitations: DerivedMetric; citationShare: DerivedMetric;
  sampleIds: string[]; excludedSampleIds: string[]; brandsAppear: string[];
  category: 'unknown'; validation: 'matched' | 'unverified' | 'excluded';
}
export interface SourceMetricCohort extends CohortIdentity {
  domains: SourceMetricRow[]; urls: SourceMetricRow[];
  eligibleObservationIds: string[]; excludedObservationIds: string[];
  invalidCitationCount: number;
}
export interface SourceMetricsResult {
  version: 'opengeo-source-metrics/v1'; mixedCohorts: boolean;
  domains: SourceMetricRow[]; urls: SourceMetricRow[]; cohorts: SourceMetricCohort[];
  eligibleObservationIds: string[]; excludedObservationIds: string[]; invalidCitationCount: number;
  formulas: { used: string; averageCitations: string; citationShare: string };
}
interface SourceEntry { sample: Sample; citation: Citation; url: string; domain: string; eligible: boolean }
function sourceEntries(samples: Sample[]) {
  const entries: SourceEntry[] = []; let invalidCitationCount = 0;
  for (const sample of samples) for (const citation of sample.citations || []) {
    try {
      const url = new URL(citation.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error('Invalid citation URL.');
      url.hash = '';
      entries.push({ sample, citation, url: url.href, domain: url.hostname.toLowerCase().replace(/^www\./, ''), eligible: !exclusion(sample) && citation.integrity !== 'mismatch' });
    } catch { invalidCitationCount++; }
  }
  return { entries, invalidCitationCount };
}
function sourceRows(samples: Sample[], entries: SourceEntry[], level: 'domain' | 'url', mixed: boolean, brands: BrandEntity[]): SourceMetricRow[] {
  const eligibleCount = samples.filter(sample => !exclusion(sample)).length;
  const totals = new Map<string, number>();
  const groups = new Map<string, SourceEntry[]>();
  for (const entry of entries) {
    const category = JSON.stringify([entry.citation.kind, entry.citation.integrity]);
    if (entry.eligible) totals.set(category, (totals.get(category) || 0) + 1);
    const key = JSON.stringify([entry[level], entry.citation.kind, entry.citation.integrity]);
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  return [...groups.values()].map(items => {
    const first = items[0]!, valid = items.filter(item => item.eligible), invalid = items.filter(item => !item.eligible);
    const sampleIds = [...new Set(valid.map(item => item.sample.id))];
    const excludedSampleIds = [...new Set(invalid.map(item => item.sample.id))];
    const mismatched = first.citation.integrity === 'mismatch';
    const validSamples = [...new Map(valid.map(item => [item.sample.id, item.sample])).values()];
    const appeared = deriveBrandMetrics(validSamples, brands).observations.flatMap(row => row.brands.filter(brand => brand.mentioned).map(brand => brand.brandId));
    return { source: first[level], level, kind: first.citation.kind, integrity: first.citation.integrity,
      citationCount: valid.length, observedCitationCount: items.length, excludedCitationCount: invalid.length,
      used: metric(sampleIds.length, eligibleCount, mixed, mismatched), averageCitations: metric(valid.length, sampleIds.length, mixed, mismatched),
      citationShare: metric(valid.length, totals.get(JSON.stringify([first.citation.kind, first.citation.integrity])) || 0, mixed, mismatched),
      sampleIds, excludedSampleIds, brandsAppear: [...new Set(appeared)].sort(), category: 'unknown' as const,
      validation: mismatched ? 'excluded' as const : first.citation.integrity === 'matched' ? 'matched' as const : 'unverified' as const };
  }).sort((a, b) => b.citationCount - a.citationCount || a.source.localeCompare(b.source) || a.kind.localeCompare(b.kind) || a.integrity.localeCompare(b.integrity));
}
export function deriveSourceMetrics(samples: Sample[], brands: BrandEntity[] = []): SourceMetricsResult {
  samples = uniqueSamples(samples);
  const groups = new Map<string, { identity: CohortIdentity; samples: Sample[] }>();
  for (const sample of samples) { const identity = metricCohortIdentity(sample); if (!groups.has(identity.key)) groups.set(identity.key, { identity, samples: [] }); groups.get(identity.key)!.samples.push(sample); }
  const { entries, invalidCitationCount } = sourceEntries(samples);
  const cohorts = [...groups.values()].map(({ identity, samples: items }) => {
    const local = sourceEntries(items);
    return { ...identity, domains: sourceRows(items, local.entries, 'domain', false, brands), urls: sourceRows(items, local.entries, 'url', false, brands), eligibleObservationIds: items.filter(sample => !exclusion(sample)).map(sample => sample.id), excludedObservationIds: items.filter(sample => exclusion(sample)).map(sample => sample.id), invalidCitationCount: local.invalidCitationCount };
  });
  return { version: 'opengeo-source-metrics/v1', mixedCohorts: groups.size > 1,
    domains: sourceRows(samples, entries, 'domain', groups.size > 1, brands), urls: sourceRows(samples, entries, 'url', groups.size > 1, brands), cohorts,
    eligibleObservationIds: samples.filter(sample => !exclusion(sample)).map(sample => sample.id), excludedObservationIds: samples.filter(sample => exclusion(sample)).map(sample => sample.id), invalidCitationCount,
    formulas: { used: 'Distinct eligible answers citing source / eligible answers in the cohort.', averageCitations: 'Eligible citation items for source / distinct eligible answers citing source.', citationShare: 'Eligible citation items for source / all eligible citation items with the same evidence kind and integrity in the cohort. Domain and URL levels use the same underlying item denominator.' } };
}
