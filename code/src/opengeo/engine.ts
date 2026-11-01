import { randomUUID } from 'node:crypto';
import type {
  ContentDraft, CycleMetric, EventDefinition, EvolutionProposal, Fact, IterationAction, Observation,
  ObservationJudgment, OpenGeoProject, OpenGeoRun, PublicationTask, Query, SellingPoint, StepTrace,
} from './types.js';
import { CYCLE_SKILLS } from './types.js';

function now(): string { return new Date().toISOString(); }

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

function bigrams(text: string): Set<string> {
  const value = normalize(text);
  const output = new Set<string>();
  for (let i = 0; i < Math.max(0, value.length - 1); i += 1) output.add(value.slice(i, i + 2));
  return output;
}

function overlapScore(left: string, right: string): number {
  const a = bigrams(left), b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const item of a) if (b.has(item)) hit += 1;
  return hit / Math.min(a.size, b.size);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？.!?\n])/u)
    .map(item => item.trim())
    .filter(item => item.length >= 8);
}

function safeFileName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'untitled';
}

function mentioned(answer: string, brand: string, aliases: string[]): boolean {
  const haystack = normalize(answer);
  return [brand, ...aliases].some(name => name.length > 1 && haystack.includes(normalize(name)));
}

function detectRisks(observation: Observation): string[] {
  const explicit = observation.riskTags || [];
  const inferred: string[] = [];
  if (/(?:错误|不准确|无法核验|过时|失效|投诉|安全风险|争议)/u.test(observation.answer)) inferred.push('possible_accuracy_or_trust_risk');
  if ((observation.sentiment || 'neutral') === 'negative') inferred.push('negative_sentiment');
  return [...new Set([...explicit, ...inferred])];
}

export function instrumentationPlan(project: OpenGeoProject): EventDefinition[] {
  const metricNames = [...new Set(project.assets.flatMap(asset => Object.keys(asset.metrics || {})))];
  return [
    { id: 'geo.answer_observed', name: 'AI answer observation', owner: 'monitoring adapter', fields: ['cycle', 'query_id', 'platform', 'answer', 'citations'], purpose: 'Record the full denominator and raw evidence for mention, recommendation, citation, and sentiment analysis.' },
    { id: 'geo.answer_judged', name: 'Answer judgment', owner: 'OpenGEO analyzer', fields: ['observation_id', 'mentioned', 'sentiment', 'risk_tags', 'rule_version'], purpose: 'Keep judgment separate from collection and make manual review possible.' },
    { id: 'asset.published', name: 'Publication state', owner: 'publication workflow', fields: ['asset_id', 'channel', 'url', 'state', 'checked_at'], purpose: 'Distinguish draft, approved, published, accessible, and eventually cited.' },
    { id: 'asset.engagement', name: 'Owned asset engagement', owner: 'channel adapter', fields: metricNames.length ? metricNames : ['views'], purpose: 'Keep owned-channel telemetry beside GEO observations without treating engagement as answer visibility.' },
  ];
}

export function mineSellingPoints(project: OpenGeoProject): SellingPoint[] {
  const output: SellingPoint[] = [];
  const confirmedQueries = project.queryBank.queries.filter(query => query.status === 'confirmed');
  for (const asset of project.assets) {
    for (const query of confirmedQueries) {
      const candidates = sentences(asset.content)
        .map(sentence => ({ sentence, score: overlapScore(query.text, sentence) }))
        .filter(item => item.score >= 0.12)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      if (!candidates.length) continue;
      for (const [index, item] of candidates.entries()) {
        output.push({
          id: `sp-${asset.id}-${query.id}-${index + 1}`,
          assetId: asset.id,
          queryId: query.id,
          evidenceQuote: item.sentence,
          score: Number(item.score.toFixed(3)),
          status: item.score >= 0.35 ? 'usable' : 'needs_review',
          reason: item.score >= 0.35 ? 'Question and asset sentence have stable lexical overlap.' : 'Overlap is weak; a human or model must confirm semantic fit.',
        });
      }
    }
  }
  return output;
}

export function judgeObservations(project: OpenGeoProject): ObservationJudgment[] {
  return project.observations.map(observation => {
    const risks = detectRisks(observation);
    const isMentioned = mentioned(observation.answer, project.brand, project.aliases);
    const sentiment = observation.sentiment || 'neutral';
    return {
      observationId: observation.id,
      mentioned: isMentioned,
      sentiment,
      riskTags: risks,
      citationCount: observation.citations?.length || 0,
      needsReview: risks.length > 0 || sentiment === 'mixed' || sentiment === 'negative',
    };
  });
}

export function buildCycleMetrics(project: OpenGeoProject, judgments: ObservationJudgment[]): CycleMetric[] {
  const observations = new Map(project.observations.map(item => [item.id, item]));
  const cycles = [...new Set(project.observations.map(item => item.cycle))].sort((a, b) => a - b);
  return cycles.map(cycle => {
    const rows = judgments.filter(judgment => observations.get(judgment.observationId)?.cycle === cycle);
    const mentionedCount = rows.filter(row => row.mentioned).length;
    return {
      cycle,
      observations: rows.length,
      mentioned: mentionedCount,
      mentionRate: rows.length ? mentionedCount / rows.length : null,
      positive: rows.filter(row => row.sentiment === 'positive').length,
      negative: rows.filter(row => row.sentiment === 'negative').length,
      riskTags: rows.reduce((sum, row) => sum + row.riskTags.length, 0),
      citations: rows.reduce((sum, row) => sum + row.citationCount, 0),
    };
  });
}

function confirmedFacts(project: OpenGeoProject): Fact[] {
  return project.facts.filter(fact => fact.status === 'confirmed');
}

function platformGuidance(platform: string): string[] {
  const key = platform.toLowerCase();
  if (key.includes('doubao') || key.includes('qwen') || key.includes('kimi')) {
    return [
      '首段直接给结论和适用人群，控制在两到三句。',
      '用短列表回答“看什么证据、怎么核验、常见误区”。',
      '保留来源名称和链接；不把长文档原文整段粘贴进回答。',
    ];
  }
  if (key.includes('wechat') || key.includes('公众号')) {
    return [
      '从一个具体场景切入，再转入方法框架。',
      '使用小标题和短段落，保留事实来源与原文链接。',
      '结尾给行动清单，不用夸张收益承诺。',
    ];
  }
  if (key.includes('xiaohongshu') || key.includes('红书')) {
    return [
      '标题写清场景和人群，正文先给结论。',
      '用 3 到 5 条短句列出证据、步骤和边界。',
      '避免绝对化承诺；把完整证据放到评论区或长文。',
    ];
  }
  if (key.includes('github') || key.includes('open-source')) {
    return [
      '使用 README 或 docs 结构：问题、适用范围、快速开始、证据。',
      '保留复现命令、数据来源、许可证和限制说明。',
      '把实验记录和发布宣传分开，避免把观察写成效果保证。',
    ];
  }
  if (key.includes('community') || key.includes('社区')) {
    return [
      '先给一个真实项目问题，再拆成可讨论的步骤。',
      '提供最小行动清单和判断标准，方便成员复用。',
      '结尾留一个可验证的讨论题或作业。',
    ];
  }
  if (key.includes('douyin') || key.includes('video') || key.includes('短视频')) {
    return [
      '前 3 秒给场景冲突或常见误区。',
      '中间保留三个要点：结论、证据、行动。',
      '评论区放来源链接和长文入口。',
    ];
  }
  return [
    '使用清晰标题、直接回答、事实证据、适用边界和 FAQ 结构。',
    '保留可核查来源链接和最后更新时间。',
    '为搜索和模型读取提供稳定 URL，不依赖仅图片呈现的关键信息。',
  ];
}

export function writeDrafts(project: OpenGeoProject, sellingPoints: SellingPoint[]): ContentDraft[] {
  const facts = confirmedFacts(project);
  return project.queryBank.queries
    .filter(query => query.status === 'confirmed' && query.priority !== 'P2')
    .slice(0, 6)
    .map(query => {
      const points = sellingPoints.filter(point => point.queryId === query.id && point.status === 'usable');
      const queryFacts = facts.slice(0, 4);
      const warnings: string[] = [];
      if (!queryFacts.length) warnings.push('No confirmed fact is available for this query.');
      if (!points.length) warnings.push('No asset sentence passed semantic matching; add evidence before publishing.');
      const title = `${project.brand} · ${query.text}`;
      const evidence = points.map(point => `- ${point.evidenceQuote}`);
      const factLines = queryFacts.map(fact => `- ${fact.text}（来源：${fact.source}）`);
      const guidance = platformGuidance(query.platform).map(item => `- ${item}`).join('\n');
      const markdown = `## 回答框架\n\n先用一句话回应“${query.text}”，再给出边界和证据。\n\n## 可用事实\n\n${factLines.join('\n') || '- 暂无已确认事实，不能对外发布。'}\n\n## 现有内容卖点\n\n${evidence.join('\n') || '- 暂无可复用卖点，需要补充案例、数据或说明。'}\n\n## ${query.platform} 平台写法\n\n${guidance}\n\n## 禁止项\n\n- 不新增数字、资质、客户名、排名或效果承诺。\n- 不把候选问题写成已验证需求。\n- 不把发布登记写成已被引用。`;
      return {
        id: `draft-${query.id}`,
        queryId: query.id,
        platform: query.platform,
        title,
        markdown,
        factIds: queryFacts.map(fact => fact.id),
        assetIds: [...new Set(points.map(point => point.assetId))],
        status: warnings.length ? 'blocked' : 'draft',
        warnings,
      };
    });
}

export function planPublications(drafts: ContentDraft[]): PublicationTask[] {
  return drafts.filter(draft => draft.status === 'draft').map(draft => ({
    id: `pub-${draft.id}`,
    draftId: draft.id,
    channel: draft.platform,
    mode: 'manual_review',
    checklist: [
      'Confirm every fact ID remains valid.',
      'Check title, audience intent, and platform format.',
      'Publish manually or through an explicitly configured API adapter.',
      'Record publication URL and accessible state; do not infer citation from publication.',
    ],
    status: 'waiting_confirmation',
  }));
}

function observationEvidenceIds(project: OpenGeoProject): string[] {
  return project.observations.map(item => item.id);
}

export function planActions(
  project: OpenGeoProject,
  sellingPoints: SellingPoint[],
  judgments: ObservationJudgment[],
  drafts: ContentDraft[],
): IterationAction[] {
  const actions: IterationAction[] = [];
  const observations = new Map(project.observations.map(item => [item.id, item]));
  for (const query of project.queryBank.queries.filter(item => item.status === 'confirmed')) {
    const hasObservation = project.observations.some(item => item.queryId === query.id);
    if (!hasObservation) actions.push({
      id: `act-measure-${query.id}`, type: 'measurement', priority: query.priority,
      title: `Collect baseline answers for ${query.id}`,
      rationale: 'A confirmed query has no observation, so visibility cannot be evaluated.',
      evidenceIds: [query.id], acceptance: 'At least one valid answer is archived with platform, time, protocol, and raw text.',
    });
    if (!sellingPoints.some(point => point.queryId === query.id)) actions.push({
      id: `act-evidence-${query.id}`, type: 'evidence', priority: query.priority === 'P0' ? 'P1' : 'P2',
      title: `Add evidence for ${query.id}`,
      rationale: 'No existing asset sentence matched the query strongly enough.',
      evidenceIds: [query.id], acceptance: 'A human-approved sentence, example, metric source, or FAQ answer is linked to the query.',
    });
  }
  for (const judgment of judgments.filter(item => item.needsReview)) {
    const observation = observations.get(judgment.observationId);
    actions.push({
      id: `act-risk-${judgment.observationId}`, type: 'risk', priority: 'P0',
      title: 'Review accuracy or sentiment risk',
      rationale: `Observation contains ${judgment.riskTags.join(', ') || 'ambiguous sentiment'} and needs human judgment.`,
      evidenceIds: [judgment.observationId], acceptance: 'A reviewer records whether the answer is accurate, outdated, misleading, or acceptable.',
    });
    if (!observation) continue;
  }
  for (const draft of drafts.filter(item => item.status === 'blocked')) actions.push({
    id: `act-content-${draft.queryId}`, type: 'content', priority: 'P1',
    title: `Resolve content blockers for ${draft.queryId}`,
    rationale: draft.warnings.join(' '),
    evidenceIds: [draft.queryId], acceptance: 'All draft warnings are resolved and a reviewed asset can be published.',
  });
  for (const hypothesis of project.channelHypotheses.filter(item => item.confidence !== 'high')) actions.push({
    id: `act-channel-${hypothesis.id}`, type: 'channel', priority: 'P2',
    title: `Validate hypothesis ${hypothesis.id}`,
    rationale: `${hypothesis.statement} Current confidence is ${hypothesis.confidence}.`,
    evidenceIds: hypothesis.evidenceObservationIds, acceptance: 'A repeated protocol produces comparable observations and an updated confidence record.',
  });
  return actions.slice(0, 30);
}

export function proposeEvolution(
  project: OpenGeoProject,
  sellingPoints: SellingPoint[],
  cycleMetrics: CycleMetric[],
  actions: IterationAction[],
): EvolutionProposal {
  const current = project.queryBank;
  const existing = new Set(current.queries.map(query => normalize(query.text)));
  const strongPoints = sellingPoints
    .filter(point => point.status === 'usable')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const candidates: Query[] = [];
  for (const point of strongPoints) {
    const asset = project.assets.find(item => item.id === point.assetId);
    const seed = asset?.title || point.evidenceQuote.slice(0, 24);
    const texts = [
      `${project.brand} ${seed} 适合谁？`,
      `${seed} 有哪些可核查证据？`,
    ];
    for (const text of texts) {
      if (existing.has(normalize(text))) continue;
      existing.add(normalize(text));
      candidates.push({
        id: `next-q${candidates.length + 1}`, text, intent: 'self-evolved candidate',
        platform: asset?.channel || 'web', priority: 'P2', origin: `self-evolution from ${point.id}`,
        status: 'candidate',
      });
    }
  }
  const retained = current.queries.map(query => {
    const hasRisk = actions.some(action => action.evidenceIds.includes(query.id) && action.type === 'risk');
    const noObservation = !project.observations.some(item => item.queryId === query.id);
    return { ...query, priority: hasRisk || noObservation ? 'P0' as const : query.priority };
  });
  const latest = cycleMetrics.at(-1);
  const previous = cycleMetrics.at(-2);
  const mentionDelta = latest && previous && latest.mentionRate !== null && previous.mentionRate !== null
    ? latest.mentionRate - previous.mentionRate : null;
  return {
    fromVersion: current.version,
    toVersion: current.version + 1,
    reason: [
      latest ? `Latest cycle has ${latest.observations} observations and ${latest.riskTags} risk tags.` : 'No completed observation cycle.',
      mentionDelta === null ? 'Mention delta is not computable from comparable cycles.' : `Mention rate changed by ${(mentionDelta * 100).toFixed(1)} percentage points.`,
      `${actions.length} iteration actions remain open.`,
    ].join(' '),
    queries: [...retained, ...candidates],
    contentDirections: [
      'Reuse only evidence quotes attached to usable selling points.',
      'Convert high-priority content blockers into fact-collection tasks before rewriting.',
      'Keep platform variants under the same fact and query version.',
      'Record publication URL separately from answer citation.',
    ],
    guardrails: [
      'Candidate queries require human confirmation before baseline measurement.',
      'A mention-rate delta is observational unless an experiment has a comparable protocol and control.',
      'Self-evolution never upgrades an unconfirmed fact into a confirmed fact.',
    ],
  };
}

export function createRun(project: OpenGeoProject): OpenGeoRun {
  const createdAt = now();
  return {
    schemaVersion: 'opengeo-run/v1',
    id: randomUUID(),
    projectId: project.id,
    input: structuredClone(project),
    status: 'queued',
    createdAt,
    steps: CYCLE_SKILLS.map(([id, skill]) => ({
      id, skill,
      layer: id === 'confirm' ? 'workflow' : id === 'instrument' ? 'evidence' : 'skill',
      status: 'pending', summary: '', evidenceIds: [], startedAt: createdAt,
    })),
    eventDefinitions: [], sellingPoints: [], judgments: [], cycleMetrics: [], drafts: [], publicationTasks: [],
    actions: [], evolution: { fromVersion: 0, toVersion: 1, reason: '', queries: [], contentDirections: [], guardrails: [] },
    limitations: [
      'This deterministic run does not call a model or publish content.',
      'Lexical selling-point matching is a replayable baseline, not semantic understanding.',
      'Platform rules are represented as evidence-backed hypotheses, not fixed weights.',
    ],
  };
}

export function executeRun(run: OpenGeoRun): OpenGeoRun {
  const project = run.input;
  run.status = 'running';
  const finish = (id: string, summary: string, evidenceIds: string[], blocked = false) => {
    const step = run.steps.find(item => item.id === id);
    if (!step) throw new Error(`Unknown workflow step: ${id}`);
    step.status = blocked ? 'blocked' : 'completed';
    step.summary = summary;
    step.evidenceIds = evidenceIds;
    step.finishedAt = now();
  };

  const stepNames = new Map(CYCLE_SKILLS.map(([id, skill]) => [skill, id]));
  run.steps.forEach(step => { step.status = 'pending'; step.startedAt = now(); });

  run.eventDefinitions = instrumentationPlan(project);
  finish('instrument', `Defined ${run.eventDefinitions.length} event contracts for answer observation, judgment, publication, and owned-channel telemetry.`, run.eventDefinitions.map(item => item.id));

  run.sellingPoints = mineSellingPoints(project);
  finish('mine', `Mined ${run.sellingPoints.length} keyword / selling-point mappings from ${project.assets.length} assets.`, run.sellingPoints.map(item => item.id));

  const confirmedQueries = project.queryBank.queries.filter(query => query.status === 'confirmed');
  const hasConfirmedFact = project.facts.some(fact => fact.status === 'confirmed');
  const gatePassed = confirmedQueries.length > 0 && hasConfirmedFact;
  finish('confirm', gatePassed
    ? `Gate passed with ${confirmedQueries.length} confirmed queries and at least one confirmed fact.`
    : 'Gate blocked: a run needs at least one confirmed query and one confirmed fact.', [...confirmedQueries.map(item => item.id), ...project.facts.filter(item => item.status === 'confirmed').map(item => item.id)], !gatePassed);
  if (!gatePassed) {
    run.status = 'needs_confirmation';
    run.finishedAt = now();
    return run;
  }

  run.drafts = writeDrafts(project, run.sellingPoints);
  finish('write', `Prepared ${run.drafts.length} platform drafts; ${run.drafts.filter(item => item.status === 'blocked').length} are blocked by evidence gaps.`, run.drafts.map(item => item.id));

  run.publicationTasks = planPublications(run.drafts);
  finish('publish', `Created ${run.publicationTasks.length} manual-review publication plans. OpenGEO did not publish anything.`, run.publicationTasks.map(item => item.id));

  run.judgments = judgeObservations(project);
  run.cycleMetrics = buildCycleMetrics(project, run.judgments);
  const reviewCount = run.judgments.filter(item => item.needsReview).length;
  finish('monitor', `Judged ${run.judgments.length} observations across ${run.cycleMetrics.length} cycles; ${reviewCount} need review.`, run.judgments.map(item => item.observationId));

  run.actions = planActions(project, run.sellingPoints, run.judgments, run.drafts);
  finish('review', `Produced ${run.actions.length} iteration actions from evidence gaps, risks, blocked drafts, and channel hypotheses.`, run.actions.map(item => item.id));

  run.evolution = proposeEvolution(project, run.sellingPoints, run.cycleMetrics, run.actions);
  finish('evolve', `Proposed query bank v${run.evolution.toVersion} with ${run.evolution.queries.length} queries; candidate queries still require confirmation.`, run.evolution.queries.map(item => item.id));

  run.status = run.publicationTasks.length || run.actions.some(action => action.priority === 'P0') ? 'needs_confirmation' : 'completed';
  run.finishedAt = now();
  return run;
}

export function applyEvolution(project: OpenGeoProject, proposal: EvolutionProposal): OpenGeoProject {
  if (proposal.fromVersion !== project.queryBank.version) throw new Error('Query bank version changed; recompute evolution from the latest project.');
  return {
    ...structuredClone(project),
    queryBank: { version: proposal.toVersion, queries: proposal.queries.map(query => ({ ...query })) },
  };
}

export { safeFileName };

