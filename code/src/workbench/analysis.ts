import { randomUUID } from 'node:crypto';
import { extractTextUrlCitations } from '../../vendor/niubigeo/src/providers/citation-extractors.js';
import type { Audit, Citation, Judgment, Metric, Project, Sample } from './types.js';

export function payloadAt(root: unknown, path: string): unknown {
  let value: any = root;
  for (const key of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    value = value && typeof value === 'object' ? value[key] : undefined;
  }
  return value;
}
export function classifyCitation(source: string): Citation['kind'] {
  if (source === 'answer_text_url') return 'answer_url';
  if (source === 'provider_search_result') return 'search_result';
  if (source === 'provider_grounding_chunk') return 'grounding';
  return source === 'provider_annotation' || source === 'provider_citation_array' ? 'provider_citation' : 'answer_url';
}
export function normalizeCitation(row: any, raw?: unknown): Citation | null {
  if (!row || typeof row.url !== 'string') return null;
  try { if (!['https:', 'http:'].includes(new URL(row.url).protocol)) return null; } catch { return null; }
  const source = String(row.providerCitationSource || row.source || 'answer_text_url');
  const path = typeof row.providerPayloadPath === 'string' ? row.providerPayloadPath : undefined;
  return { url: row.url, kind: classifyCitation(source), source,
    ...(path ? { payloadPath: path } : {}),
    integrity: path && raw ? (payloadAt(raw, path) === row.url ? 'matched' : 'mismatch') : 'unverified' };
}
export function bodyLinks(text: string): Citation[] {
  return extractTextUrlCitations(text).map(c => ({ url: c.url, source: c.source, kind: 'answer_url', integrity: 'unverified' }));
}
export function answerTruncated(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as any;
  const reasons = [data.choices?.[0]?.finish_reason, data.choices?.[0]?.native_finish_reason, data.stop_reason, data.candidates?.[0]?.finishReason];
  return reasons.some(reason => ['length', 'max_tokens', 'max_output_tokens'].includes(String(reason).toLowerCase())) || data.status === 'incomplete';
}
export function findMention(answer: string, aliases: string[]): { quote: string; start: number; end: number } | null {
  const folded = answer.replace(/https?:\/\/[^\s"<>]+/gi, url => ' '.repeat(url.length)).toLocaleLowerCase();
  for (const alias of [...new Set(aliases)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const needle = alias.toLocaleLowerCase();
    let offset = folded.indexOf(needle);
    while (offset !== -1) {
      const ascii = /^[a-z0-9 ._-]+$/i.test(alias);
      const before = answer[offset - 1] || '', after = answer[offset + alias.length] || '';
      if (!ascii || (!/[a-z0-9_]/i.test(before) && !/[a-z0-9_]/i.test(after))) {
        const start = Math.max(0, offset - 38), end = Math.min(answer.length, offset + alias.length + 90);
        return { quote: answer.slice(start, end), start, end };
      }
      offset = folded.indexOf(needle, offset + needle.length);
    }
  }
  return null;
}
export function judgeSample(sample: Sample, project: Pick<Project, 'brand' | 'aliases'>): Judgment {
  if (sample.collectionStatus !== 'completed' || !sample.answer.trim()) return { sampleId: sample.id, mentioned: null, recommended: null, evidence: null, reason: '未取得有效原文', needsReview: true };
  if (sample.analysisStatus !== 'completed') return { sampleId: sample.id, mentioned: null, recommended: null, evidence: null, reason: '原文已保存，分析未完成', needsReview: true };
  const evidence = findMention(sample.answer, [project.brand, ...project.aliases]);
  if (!evidence) return { sampleId: sample.id, mentioned: false, recommended: false, evidence: null, reason: '原文未命中已确认的品牌名称或别名', needsReview: false };
  // A nearby phrase is a transparent heuristic, not an LLM ground-truth label.
  const local = evidence.quote;
  const negative = /不推荐|不建议|不适合|无法推荐|不能推荐|不应推荐|not recommend|do not recommend|not suitable|avoid\b/i.test(local);
  const positive = /推荐|可考虑|值得考虑|适合|建议选择|recommend|consider\b|suitable|good choice/i.test(local);
  const recommended = negative ? false : positive ? true : null;
  return { sampleId: sample.id, mentioned: true, recommended, evidence,
    reason: negative ? '品牌附近有否定推荐表述' : positive ? '品牌附近有推荐措辞，需人工核对语境' : '出现品牌，但无法据规则确定是否推荐',
    needsReview: true };
}
function metric(values: (boolean | null)[]): Metric {
  const eligible = values.filter(v => v !== null);
  const numerator = eligible.filter(Boolean).length, denominator = eligible.length;
  return { numerator, denominator, value: denominator ? numerator / denominator : null };
}
export function auditSamples(samples: Sample[], project: Pick<Project, 'brand' | 'aliases'> & Partial<Pick<Project, 'market'>>): Audit {
  const judgments = samples.map(s => judgeSample(s, project));
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const label = `${sample.origin} · ${sample.model} · ${project.market === 'international' ? (sample.branded ? 'Branded questions' : 'Unbranded questions') : (sample.branded ? '品牌问题' : '非品牌问题')} · ${sample.runGroup}`;
    groups.set(label, [...(groups.get(label) || []), sample]);
  }
  const citations = samples.flatMap(s => s.citations);
  return { planned: samples.length, collected: samples.filter(s => s.collectionStatus === 'completed' && s.answer.trim()).length,
    analyzed: samples.filter(s => s.analysisStatus === 'completed' && s.collectionStatus === 'completed').length,
    collectionFailed: samples.filter(s => s.collectionStatus === 'failed').length,
    analysisFailed: samples.filter(s => s.collectionStatus === 'completed' && s.analysisStatus !== 'completed').length,
    mention: metric(judgments.map(j => j.mentioned)), recommendation: metric(judgments.map(j => j.recommended)), judgments,
    providerCitations: citations.filter(c => c.kind === 'provider_citation' && c.integrity !== 'mismatch').length,
    searchResults: citations.filter(c => c.kind === 'search_result').length,
    groundings: citations.filter(c => c.kind === 'grounding').length,
    answerUrls: citations.filter(c => c.kind === 'answer_url').length,
    citationIntegrityFailures: citations.filter(c => c.integrity === 'mismatch').length,
    strata: [...groups].map(([label, rows]) => {
      const js = rows.map(s => judgments.find(j => j.sampleId === s.id)!);
      return { label, count: rows.length, collected: rows.filter(s => s.collectionStatus === 'completed').length, mentioned: js.filter(j => j.mentioned === true).length, denominator: js.filter(j => j.mentioned !== null).length };
    }) };
}
export function validateImport(input: unknown): Sample[] {
  if (!Array.isArray(input) || input.length > 300) throw new Error('请导入最多 300 条回答的 JSON 数组');
  const batchId = `manual-batch-${randomUUID()}`;
  return input.map((value: any, i) => {
    if (!value || typeof value.question !== 'string' || !value.question.trim() || typeof value.answer !== 'string') throw new Error(`第 ${i + 1} 条需要 question 和 answer 文本`);
    if (value.question.length > 2000 || value.answer.length > 100000) throw new Error('问题或回答超过长度限制');
    const links = bodyLinks(value.answer);
    // Unauthenticated manual URLs cannot be promoted to provider citations.
    return { id: `manual-${randomUUID()}`, queryId: `import-${i + 1}`, question: value.question.trim(), intent: typeof value.intent === 'string' ? value.intent : '人工导入',
      branded: value.branded === true, origin: 'manual', model: typeof value.model === 'string' ? value.model : '人工记录',
      observedAt: typeof value.observedAt === 'string' ? value.observedAt : new Date().toISOString(),
      runGroup: typeof value.runGroup === 'string' ? value.runGroup : batchId, protocolId: 'manual/v1',
      collectionStatus: value.collectionStatus === 'failed' ? 'failed' : 'completed',
      analysisStatus: value.analysisStatus === 'failed' ? 'failed' : 'completed', answer: value.answer, citations: links,
      ...(typeof value.error === 'string' ? { error: value.error } : {}) } as Sample;
  });
}
