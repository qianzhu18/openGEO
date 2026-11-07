import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { findMention, judgeSample } from '../analysis.js';
import { compact, digest, publicUrl, readEvidence } from './evidence.js';
import type { CampaignAttempt, CampaignMetric, CampaignProtocol, CampaignRun, CampaignSpec, EvaluatedAttempt, SourceRecord } from './model.js';
import { renderCampaign } from './render.js';

function required(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空`);
}
export function validateCampaign(spec: CampaignSpec): void {
  if (spec.schemaVersion !== 'opengeo-campaign/v1' || spec.access !== 'external-public-only') throw new Error('案例版本或外部研究边界无效');
  for (const key of ['id', 'brand', 'domain', 'objective', 'asOf', 'samplingNote'] as const) required(spec[key], key);
  for (const key of ['situation', 'impact', 'nextAction'] as const) required(spec.executiveSummary[key], `executiveSummary.${key}`);
  if (!/^[a-zA-Z0-9_-]+$/.test(spec.id) || !Number.isInteger(spec.round) || spec.round < 1 || !Number.isFinite(Date.parse(spec.asOf))) throw new Error('案例身份、轮次或日期无效');
  const unique = (items: { id: string }[], label: string) => {
    if (!Array.isArray(items)) throw new Error(`${label} 必须为数组`);
    const ids = new Set<string>();
    for (const row of items) {
      if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(row.id) || ids.has(row.id)) throw new Error(`${label} ID 无效或重复`);
      ids.add(row.id);
    }
    return ids;
  };
  const sources = unique(spec.sources, '来源'), claims = unique(spec.claims, '声明'), audiences = unique(spec.audiences, '受众'),
    questions = unique(spec.questions, '问题'), assets = unique(spec.assets, '内容');
  unique(spec.findings, '诊断');
  const baseline = unique(spec.baselinePlan, '最小基线');
  if (!sources.size || !audiences.size || !questions.size || !assets.size) throw new Error('案例至少需要来源、受众、问题和内容制作单');
  if (!Array.isArray(spec.aliases) || spec.aliases.some(alias => typeof alias !== 'string' || !alias.trim()) || !Array.isArray(spec.platforms) || !spec.platforms.length || new Set(spec.platforms).size !== spec.platforms.length || spec.platforms.some(p => !/^[a-z0-9_-]+$/.test(p))) throw new Error('品牌别名或平台无效');
  const links = (ids: string[], allowed: Set<string>, label: string, allowEmpty = false) => {
    if (!Array.isArray(ids) || (!allowEmpty && !ids.length) || ids.some(id => !allowed.has(id))) throw new Error(`${label} 引用不存在或为空`);
  };
  for (const source of spec.sources) { required(source.title, '来源标题'); publicUrl(source.url); }
  for (const claim of spec.claims) {
    if (!sources.has(claim.sourceId) || !['source-checked', 'pending', 'conflict'].includes(claim.review)) throw new Error(`${claim.id}: 来源或复核状态无效`);
    for (const key of ['quote', 'statement', 'scope'] as const) required(claim[key], `${claim.id}.${key}`);
  }
  for (const audience of spec.audiences) {
    for (const key of ['name', 'job', 'decision', 'validateWith'] as const) required(audience[key], `${audience.id}.${key}`);
    if (!['website-declared', 'hypothesis'].includes(audience.basis) || !Array.isArray(audience.concerns) || !audience.concerns.length) throw new Error('受众依据或关切无效');
    links(audience.claimIds, claims, audience.id);
  }
  for (const question of spec.questions) {
    required(question.text, '问题原文'); required(question.reason, '选题理由');
    if (!audiences.has(question.audienceId) || !['en', 'zh'].includes(question.language) || !['discovery', 'evaluation', 'implementation'].includes(question.stage) || !['editorial-hypothesis', 'customer-evidence'].includes(question.origin) || !Number.isInteger(question.revision) || question.revision < 1) throw new Error(`${question.id}: 问题版本或受众无效`);
    if (Boolean(findMention(question.text, [spec.brand, ...spec.aliases])) !== question.branded) throw new Error(`${question.id}: 品牌词标记与原文不一致`);
  }
  for (const asset of spec.assets) {
    for (const key of ['title', 'objective', 'reason', 'channel', 'proposedPath', 'acceptance'] as const) required(asset[key], `${asset.id}.${key}`);
    if (!audiences.has(asset.audienceId) || !['en', 'zh'].includes(asset.language)) throw new Error(`${asset.id}: 受众或语言无效`);
    links(asset.questionIds, questions, asset.id); links(asset.linksTo, assets, asset.id, true);
    if (asset.existingUrl) {
      publicUrl(asset.existingUrl);
      if (!spec.sources.some(source => source.url === asset.existingUrl)) throw new Error(`${asset.id}: 已有页面必须来自实际指定来源`);
    }
    if (!Array.isArray(asset.requiredMaterials) || !asset.requiredMaterials.length || !Array.isArray(asset.sections)) throw new Error(`${asset.id}: 缺少取证材料或章节`);
    for (const section of asset.sections) { required(section.heading, '章节标题'); required(section.text, '章节正文'); links(section.claimIds, claims, '正文声明', true); }
  }
  for (const finding of spec.findings) {
    for (const key of ['title', 'observation', 'implication', 'action'] as const) required(finding[key], `${finding.id}.${key}`);
    links(finding.claimIds, claims, finding.id, finding.basis === 'ai-answer');
    if (!Array.isArray(finding.attemptIds) || !['public-source', 'ai-answer', 'hypothesis'].includes(finding.basis) || (finding.basis === 'ai-answer' && !finding.attemptIds.length)) throw new Error(`${finding.id}: 缺少诊断证据`);
  }
  for (const task of spec.baselinePlan) {
    const question = spec.questions.find(row => row.id === task.questionId);
    if (!question || !spec.platforms.includes(task.platform) || task.platform !== task.platform.toLowerCase()) throw new Error(`${task.id}: 基线问题或平台无效`);
    required(task.rationale, `${task.id}.rationale`);
  }
  if (!Array.isArray(spec.publications)) throw new Error('发布记录必须为数组');
  for (const publication of spec.publications) {
    if (!assets.has(publication.assetId) || !Number.isFinite(Date.parse(publication.publishedAt))) throw new Error('发布记录身份或时间无效');
    publicUrl(publication.url); required(publication.version, '发布版本');
  }
}

/** No unknown protocol field can accidentally match another unknown field. */
export function comparableProtocol(protocol: CampaignProtocol | null): boolean {
  const known = (value: unknown) => typeof value === 'string' && Boolean(value.trim()) && !/^(unknown|null|undefined|not[- ]recorded|未记录|未知)$/i.test(value.trim());
  if (!protocol || !known(protocol.model) || !known(protocol.region) || !['en', 'zh'].includes(protocol.language) || !['fresh', 'existing'].includes(protocol.session || '')) return false;
  if (protocol.channel === 'web-ui') return protocol.profile === 'Xue' && known(protocol.loginState);
  return protocol.channel === 'api';
}
export function protocolKey(protocol: CampaignProtocol): string { return JSON.stringify(protocol); }

async function evaluateAttempt(root: string, spec: CampaignSpec, attempt: CampaignAttempt): Promise<EvaluatedAttempt> {
  const result: EvaluatedAttempt = { attempt, eligible: false, exclusion: null, answer: '', mentioned: null, recommendation: null, mentionQuote: null, visibleUrls: [], citationExtraction: 'unknown' };
  const exclude = (reason: string) => ({ ...result, exclusion: reason });
  const question = spec.questions.find(q => q.id === attempt.questionId);
  const protocol = attempt.protocol;
  if (!question || question.text !== attempt.questionText || question.revision !== attempt.questionRevision) return exclude('问题原文或版本不匹配');
  if (!protocol || !['web-ui', 'api', 'manual'].includes(protocol.channel) || !spec.platforms.includes(protocol.platform) || protocol.language !== question.language) return exclude('采样通道、平台或语言不匹配');
  if (protocol.channel === 'web-ui' && protocol.profile !== 'Xue') return exclude('网页采样不是指定的 Xue 用户');
  if (!Number.isFinite(Date.parse(attempt.capturedAt))) return exclude('采样时间未记录');
  if (attempt.status !== 'completed') return exclude(attempt.failureReason || '采样失败');
  const evidence = attempt.evidence;
  if (!evidence?.answer || !evidence.sha256) return exclude('缺少回答原文或校验值');
  try {
    result.answer = (await readEvidence(root, evidence.answer)).toString('utf8');
    if (digest(result.answer) !== evidence.sha256) return exclude('回答原文校验不一致');
    if (!result.answer.trim()) return exclude('回答原文为空');
    if (protocol.channel === 'web-ui') {
      for (const key of ['html', 'screenshot', 'metadata'] as const) if (!evidence[key] || !(await readEvidence(root, evidence[key]!)).length) return exclude('网页证据四件套不完整');
      const metadata = JSON.parse((await readEvidence(root, evidence.metadata!)).toString('utf8'));
      if (metadata.chromeProfile !== 'Xue' || metadata.channel !== 'web-ui' || metadata.prompt !== attempt.questionText || metadata.engine !== protocol.platform) return exclude('原始采样元数据与声明不匹配');
      if (metadata.model !== protocol.model || metadata.region !== protocol.region || metadata.loginState !== protocol.loginState ||
        metadata.session !== protocol.session || metadata.language !== protocol.language || metadata.capturedAt !== attempt.capturedAt) return exclude('采样协议与原始元数据不一致');
      const links: unknown[] = Array.isArray(metadata.citations) ? metadata.citations : [];
      result.visibleUrls = [...new Set(links.filter((value): value is string => typeof value === 'string').flatMap(value => {
        try { return [publicUrl(value)]; } catch { return []; }
      }))];
      result.citationExtraction = metadata.citationStatus === 'completed' ? 'complete' : metadata.citationStatus === 'partial' ? 'partial' : 'unknown';
    }
    if (result.answer.length < 1500 && /^(?:sign in|log in|please sign in|登录后|请先登录|just a moment|verify you are human|验证码)/i.test(result.answer.trim())) return exclude('登录或验证页面不是有效回答');
    const judged = judgeSample({ id: attempt.id, queryId: question.id, question: question.text, intent: question.stage, branded: question.branded,
      origin: protocol.channel === 'api' ? 'api' : protocol.channel === 'web-ui' ? 'browser' : 'manual', model: protocol.model || 'UNKNOWN',
      observedAt: attempt.capturedAt, runGroup: spec.id, protocolId: protocolKey(protocol), collectionStatus: 'completed', analysisStatus: 'completed', answer: result.answer, citations: [] }, spec);
    return { ...result, eligible: true, mentioned: judged.mentioned, recommendation: judged.recommended, mentionQuote: judged.evidence };
  } catch { return exclude('证据读取或路径校验失败'); }
}

export async function runCampaign(root: string, spec: CampaignSpec, sources: SourceRecord[], attempts: CampaignAttempt[]): Promise<CampaignRun> {
  validateCampaign(spec);
  const expected = new Map(spec.sources.map(source => [source.id, source]));
  if (!Array.isArray(sources) || new Set(sources.map(source => source.id)).size !== sources.length) throw new Error('来源记录无效或重复');
  const sourceTexts = new Map<string, string>();
  for (const source of sources) {
    const request = expected.get(source.id);
    if (!request || request.url !== source.url || request.kind !== source.kind) throw new Error('来源归档与策划不匹配');
    if (!Number.isFinite(Date.parse(source.retrievedAt))) throw new Error('来源采集时间无效');
    if (source.status === 'collected') {
      if (!source.textFile || !source.sha256) throw new Error('来源缺少归档与校验值');
      const text = (await readEvidence(root, source.textFile)).toString('utf8');
      if (digest(text) !== source.sha256) throw new Error(`${source.id}: 来源归档被修改`);
      sourceTexts.set(source.id, compact(text));
    }
  }
  const claims = spec.claims.map(claim => {
    const verifiedQuote = sourceTexts.get(claim.sourceId)?.includes(compact(claim.quote)) === true;
    if (claim.review === 'source-checked' && !verifiedQuote) throw new Error(`${claim.id}: 已复核声明不能回到原文`);
    return { id: claim.id, verifiedQuote, publishableAsFact: false as const };
  });
  if (!Array.isArray(attempts)) throw new Error('采样记录必须为数组');
  const attemptIds = new Set<string>();
  const evaluated: EvaluatedAttempt[] = [];
  const jobs = new Map<string, string>();
  for (const attempt of attempts) {
    if (!/^[a-zA-Z0-9_-]+$/.test(attempt.id) || !attempt.jobId || attemptIds.has(attempt.id)) throw new Error('采样 ID 重复或缺少 jobId');
    attemptIds.add(attempt.id);
    // A retry must retain question identity and the complete recorded protocol.
    const identity = JSON.stringify([attempt.questionId, attempt.questionText, attempt.questionRevision, attempt.protocol]);
    if (jobs.has(attempt.jobId) && jobs.get(attempt.jobId) !== identity) throw new Error('重试不能更换问题或采样协议');
    jobs.set(attempt.jobId, identity);
    const row = await evaluateAttempt(root, spec, attempt);
    if (row.eligible) {
      const previous = evaluated.find(item => item.eligible && item.attempt.jobId === attempt.jobId);
      if (previous) { row.eligible = false; row.exclusion = '同一任务的重复采样，不增加分母'; row.mentioned = null; row.recommendation = null; row.mentionQuote = null; }
    }
    evaluated.push(row);
  }
  for (const finding of spec.findings) {
    if (finding.attemptIds.some(id => !evaluated.some(row => row.attempt.id === id && row.eligible))) throw new Error(`${finding.id}: 诊断引用的回答不存在或无效`);
    if (finding.basis === 'public-source' && finding.claimIds.some(id => !claims.find(claim => claim.id === id)?.verifiedQuote)) throw new Error(`${finding.id}: 公开诊断缺少原文依据`);
  }
  const metrics: CampaignMetric[] = [];
  for (const question of spec.questions) for (const platform of spec.platforms) {
    const valid = evaluated.filter(row => row.eligible && row.attempt.questionId === question.id && row.attempt.protocol.platform === platform);
    const keys = [...new Set(valid.map(row => protocolKey(row.attempt.protocol)))];
    if (!keys.length) metrics.push({ questionId: question.id, question: question.text, questionRevision: question.revision, branded: question.branded, platform, protocol: null, numerator: 0, denominator: 0, value: null, attemptIds: [] });
    for (const key of keys) {
      const group = valid.filter(row => protocolKey(row.attempt.protocol) === key), numerator = group.filter(row => row.mentioned).length;
      metrics.push({ questionId: question.id, question: question.text, questionRevision: question.revision, branded: question.branded, platform, protocol: group[0]!.attempt.protocol, numerator, denominator: group.length, value: numerator / group.length, attemptIds: group.map(row => row.attempt.id) });
    }
  }
  const eligible = evaluated.filter(row => row.eligible);
  const readyAssets = spec.assets.filter(asset => asset.sections.length && asset.sections.every(section => section.claimIds.every(id => spec.claims.find(claim => claim.id === id)?.review === 'source-checked' && claims.find(claim => claim.id === id)?.verifiedQuote)));
  const specHash = digest(JSON.stringify(spec));
  const stage = (id: string, label: string, executor: 'deterministic' | 'editorial-input', status: 'ready' | 'partial' | 'pending', input: unknown, output: unknown, note: string) => ({ id, label, executor, status, inputHash: digest(JSON.stringify(input)), outputHash: digest(JSON.stringify(output)), note });
  return { schemaVersion: 'opengeo-campaign-run/v1', id: `${spec.id}-round-${spec.round}`, specHash, brandScopeHash: digest(JSON.stringify([spec.brand, spec.aliases, spec.domain])), asOf: spec.asOf,
    readiness: { sourceAudit: sourceTexts.size === expected.size ? 'ready' : 'partial', aiBaseline: !eligible.length ? 'not-collected' : metrics.every(row => row.denominator > 0) ? 'collected' : 'partial', content: readyAssets.length ? 'review-drafts' : 'briefs-only', publication: spec.publications.length ? 'recorded-unverified' : 'not-recorded', effect: 'unknown' },
    stages: [stage('ground', '来源与声明核验', 'deterministic', sourceTexts.size === expected.size ? 'ready' : 'partial', sources, claims, '只验证引文与归档一致，不把企业自述认定为独立产品实测'),
      stage('audience', '目标用户与决策任务', 'editorial-input', 'ready', claims, spec.audiences, '受众来自本轮研究策划；未做真实客户访谈'),
      stage('queries', '问题与测量设计', 'editorial-input', 'ready', spec.audiences, spec.questions, '候选不是搜索量，问题版本保留'),
      stage('audit', 'AI 回答诊断', 'deterministic', !eligible.length ? 'pending' : 'partial', attempts, metrics, spec.samplingNote),
      stage('layout', '内容布局', 'editorial-input', 'ready', [spec.audiences, spec.questions], spec.assets.map(({ sections, ...asset }) => asset), '内容与受众、问题、已有页面和互链建立映射；建议路径尚未发布'),
      stage('content', '内容草稿', 'editorial-input', readyAssets.length === spec.assets.length ? 'ready' : readyAssets.length ? 'partial' : 'pending', [claims, spec.assets], readyAssets.map(asset => asset.id), '策划由 Agent 阅读来源后撰写，运行器不新增模型调用；全部待品牌方与技术复核'),
      stage('monitor', '复查与效果边界', 'deterministic', 'pending', [metrics, spec.publications], { effect: null }, '无内部分析权限、发布验证和可比后测；不计算提升')],
    sources, claims, attempts: evaluated, metrics, warnings: ['公开网页、官方文档和仓库内容仍是来源陈述，不是独立实测。', '人工或 Agent 策划保存在输入中；确定性运行只校验与生成交付文件。', '品牌提及规则只识别名称；推荐措辞需要人工核对，不报告 Top1/Top3。'] };
}

export function compareCampaigns(before: CampaignRun, after: CampaignRun) {
  if (before.id === after.id || before.id.replace(/-round-\d+$/, '') !== after.id.replace(/-round-\d+$/, '')) throw new Error('只能比较同案例的不同轮次');
  if (Number(after.id.match(/-round-(\d+)$/)?.[1]) <= Number(before.id.match(/-round-(\d+)$/)?.[1])) throw new Error('后轮次必须大于前轮次');
  if (before.brandScopeHash !== after.brandScopeHash) throw new Error('品牌或别名口径改变，需要重建基线');
  return after.metrics.map(current => {
    const prior = before.metrics.find(row => row.questionId === current.questionId && row.questionRevision === current.questionRevision && row.question === current.question && row.platform === current.platform && row.branded === current.branded && row.protocol && current.protocol && protocolKey(row.protocol) === protocolKey(current.protocol));
    const comparable = Boolean(prior?.denominator && current.denominator && comparableProtocol(current.protocol));
    return { question: current.question, platform: current.platform, comparable,
      before: prior?.value ?? null, after: current.value, delta: comparable ? current.value! - prior!.value! : null,
      interpretation: comparable ? '可比观察差值；不能单凭两轮认定内容导致变化' : '缺少相同问题、有效样本或已知采样条件，不计算差值',
      publicationVerified: false, causalEffect: null };
  });
}

export async function writeCampaign(root: string): Promise<CampaignRun> {
  const parse = async <T>(file: string): Promise<T> => JSON.parse(await readFile(join(root, file), 'utf8')) as T;
  const spec = await parse<CampaignSpec>('01-案例策划.json'), sources = await parse<SourceRecord[]>('02-来源归档.json');
  const attempts = await parse<CampaignAttempt[]>('03-采样记录.json');
  const run = await runCampaign(root, spec, sources, attempts);
  const files = renderCampaign(spec, run);
  // Render all outputs before mutation; original sources and attempts are never rewritten.
  for (const [name, text] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(root, '内容草稿'), { recursive: true });
    await writeFile(path, text, { mode: 0o600 });
  }
  return run;
}
