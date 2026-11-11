import { marked } from 'marked';
import { diagnoseRun } from './diagnosis.js';
import { apiFallbackNote } from './diagnosis-routes.js';
import { apiReceipts, apiReceiptsMarkdown } from './api-receipts.js';
import { analyzeRun, type AnalyticsFilter } from './analytics.js';
import { diagnoseBusiness, type BusinessOpportunity } from './business-diagnosis.js';
import type { AgentRun, Metric } from './types.js';

export function formatMetric(m: Metric): string { return m.value === null ? '无数据' : `${(m.value * 100).toFixed(1)}%（${m.numerator}/${m.denominator}）`; }
export function redactExportText(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"）)]+/gi, original => {
    try {
      const url = new URL(original); let changed = false;
      if (url.username || url.password) { url.username = ''; url.password = ''; changed = true; }
      for (const key of [...url.searchParams.keys()]) {
        if (/^(?:key|api[_-]?key|token|access[_-]?token|secret|password|auth|authorization|signature)$/i.test(key)) { url.searchParams.set(key, '[REDACTED]'); changed = true; }
      }
      return changed ? url.toString() : original;
    } catch { return original; }
  });
}
function sanitizeExport<T>(value: T): T {
  if (typeof value === 'string') return redactExportText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeExport) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeExport(item)])) as T;
  return value;
}
const cell = (value: unknown) => String(value ?? 'UNKNOWN').replace(/\\/g, '\\\\').replace(/\|/g, '\uFF5C').replace(/[\r\n]+/g, ' ');
const rate = (m: { value: number | null; numerator: number; denominator: number }) => m.value === null ? 'UNKNOWN' : `${(m.value * 100).toFixed(1)}% (${m.numerator}/${m.denominator})`;
const table = (heads: string[], rows: unknown[][]) => `| ${heads.join(' | ')} |\n| ${heads.map(() => '---').join(' | ')} |\n${rows.length ? rows.map(row => `| ${row.map(cell).join(' | ')} |`).join('\n') : '| UNKNOWN |'}`;
const kindLabel = (value: BusinessOpportunity['questionKind'], en: boolean) => en ? ({ natural: 'Natural discovery', branded_fact: 'Branded validation', candidate_comparison: 'Supplied candidate comparison', unknown: 'Unknown: confirm candidate identity' }[value]) : ({ natural: '自然发现', branded_fact: '点名核验', candidate_comparison: '给定候选比较', unknown: '未知：待核对候选身份' }[value]);
const stageLabel = (value: BusinessOpportunity['decisionStage'], en: boolean) => en ? ({ discovery: 'discovery', shortlist: 'shortlist', validation: 'validation', purchase: 'purchase' }[value]) : ({ discovery: '发现需求', shortlist: '候选比较', validation: '采购核验', purchase: '购买决策' }[value]);
const roleLabel = (value: BusinessOpportunity['brandRole'], en: boolean) => en ? ({ recommended: 'recommended', mentioned: 'mentioned', partial_recall: 'partial recall', absent: 'absent in complete coverage', unknown: 'unknown' }[value]) : ({ recommended: '被推荐', mentioned: '被提及', partial_recall: '部分入口被记住', absent: '完整覆盖下未出现', unknown: '未知' }[value]);
const ownerLabel = (value: BusinessOpportunity['owner'], en: boolean) => en ? ({ marketing: 'marketing', product: 'product', technical: 'technical', sales: 'sales', unknown: 'unknown' }[value]) : ({ marketing: '市场 / 内容', product: '产品', technical: '技术 / 解决方案', sales: '销售', unknown: '未知' }[value]);
const confidenceLabel = (value: BusinessOpportunity['confidence'], en: boolean) => en ? value : ({ high: '高', medium: '中', low: '低' }[value]);

function businessOpportunityMarkdown(opportunity: BusinessOpportunity, index: number, section: (zh: string, english: string) => string, en: boolean): string {
  const evidence = opportunity.evidence.length ? opportunity.evidence.map(item => `\`${cell(item)}\``).join('、') : 'UNKNOWN';
  const quotes = opportunity.evidenceQuotes.length ? `**${section('关键原句', 'Key excerpts')}:**\n${opportunity.evidenceQuotes.map(item => `> “${cell(item.quote)}”（${cell(item.sampleId)}）`).join('\n')}\n\n` : '';
  return `### ${index}. ${cell(opportunity.title)} · ${opportunity.priority}\n\n` +
    `**${section('面向谁', 'For whom')}:** ${cell(opportunity.audience)}  \n` +
    `**${section('决策阶段', 'Decision stage')}:** ${cell(stageLabel(opportunity.decisionStage, en))}  \n` +
    `**${section('题型', 'Question kind')}:** ${kindLabel(opportunity.questionKind, en)}  \n` +
    `**${section('业务问题', 'Business question')}:** ${cell(opportunity.businessQuestion)}\n\n` +
    `**${section('用户选择标准', 'Decision criteria')}:** ${opportunity.decisionCriteria.map(cell).join('、') || 'UNKNOWN'}  \n` +
    `**${section('品牌当前角色', 'Current brand role')}:** ${cell(roleLabel(opportunity.brandRole, en))}\n\n` +
    `**${section('当前观察', 'Current signal')}:** ${cell(opportunity.currentSignal)}\n\n` +
    `**${section('对业务的意义', 'Why it matters')}:** ${cell(opportunity.businessImplication)}\n\n` +
    `**${section('建议动作', 'Recommended action')}:** ${cell(opportunity.recommendedAction)}\n\n` +
    `**${section('生产物', 'Deliverable')}:** ${cell(opportunity.deliverable)}  \n` +
    `**${section('建议负责角色', 'Suggested owner')}:** ${cell(ownerLabel(opportunity.owner, en))}  \n` +
    `**${section('置信度', 'Confidence')}:** ${cell(confidenceLabel(opportunity.confidence, en))}\n\n` +
    `**${section('验收与复测', 'Acceptance and re-measurement')}:** ${cell(opportunity.acceptance)}\n\n` +
    quotes +
    `**${section('证据定位', 'Evidence IDs')}:** ${evidence}  \n` +
    `**${section('关联问题', 'Question IDs')}:** ${opportunity.queryIds.map(cell).join('、') || 'UNKNOWN'}  \n` +
    `**${section('关联事实', 'Claim IDs')}:** ${opportunity.claimIds.map(cell).join('、') || 'UNKNOWN'}`;
}

function reportScope(run: AgentRun, a: ReturnType<typeof analyzeRun>, filter: AnalyticsFilter, section: (zh: string, english: string) => string, en: boolean): string {
  return `## ${section('报告范围', 'Report scope')}\n\n${section('运行', 'Run')}: ${run.id}  \n${section('时间', 'Time')}: ${new Date(run.createdAt).toLocaleString(en ? 'en-US' : 'zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} UTC+8 (${run.createdAt})  \n${section('状态', 'Status')}: ${a.status} · ${a.quality.label}  \n${section('问题版本', 'Question version')}: v${a.queryVersion}  \n${section('数据', 'Data')}: ${a.mode} / ${a.origin}  \n${section('筛选', 'Filters')}: ${filter.model || 'all models'} / ${filter.channel || 'all channels'} / ${filter.days || 'all'} days`;
}

function qualitySummary(run: AgentRun, a: ReturnType<typeof analyzeRun>, section: (zh: string, english: string) => string, en: boolean): string {
  const warnings = en ? a.warnings : [...(!run.measurementUnits?.length ? ['未保存冻结计划，覆盖仅描述已有记录，原始采样覆盖未知。'] : []), ...(a.quality.contaminated ? ['本轮含误入的问题分组标题，只能作 QA 证据，不可作为正式基线。'] : []), ...(a.metrics.mixedCohorts ? ['网页/API、模型、协议、题型标签、批次与意图分组计算，不输出混合总提及率。'] : []), '仅描述本次题集；情绪、搜索量、转化和增长效果未验证。'];
  return `## ${section('数据质量摘要', 'Data quality summary')}\n\n${section('有效回答', 'Valid answers')}: **${a.quality.valid}/${a.quality.planned}** · ${section('覆盖率', 'Coverage')}: ${a.quality.coverage === null ? 'UNKNOWN' : (a.quality.coverage * 100).toFixed(1) + '%'} · ${section('排除', 'Excluded')}: ${a.quality.excluded} · ${section('待完成', 'Pending')}: ${a.quality.pending}\n\n` +
    warnings.map(w => `- ${cell(w)}`).join('\n') + '\n\n' + section('API 地区真实性未验证。失败和不完整回答排除，不算作 0% 提及。', 'API region is not verified. Failed or incomplete answers are excluded, never counted as 0% mention.') + '\n\n';
}

export function reportMarkdown(run: AgentRun, filter: AnalyticsFilter = {}): string {
  const a = analyzeRun(run, filter), en = run.projectSnapshot.market === 'international';
  const business = diagnoseBusiness(run, a);
  const title = en ? 'AI visibility diagnostic · business brief' : 'GEO 业务诊断简报';
  const section = (zh: string, english: string) => en ? english : zh;
  let report = `# ${run.projectSnapshot.brand} · ${title}\n\n`;
  report += `## ${section('先看业务结论', 'Business brief first')}\n\n`;
  report += `### ${cell(business.executiveSummary.headline)}\n\n`;
  report += `**${section('服务对象与决策', 'Audience and decision')}:** ${cell(business.executiveSummary.situation)}\n\n`;
  report += `**${section('对业务的意义', 'Business implication')}:** ${cell(business.executiveSummary.impact)}\n\n`;
  report += `**${section('建议现在做什么', 'What to do now')}:** ${cell(business.executiveSummary.nextAction)}\n\n`;
  report += `> ${section('这份简报只保留能推动决策的结论、生产物和复测验收。完整回答、URL、协议和失败明细请下载独立的证据报告。', 'This brief keeps decision-ready findings, deliverables and re-measurement checks. Download the separate evidence report for full answers, URLs, protocols and failure details.')}\n\n`;
  report += `## ${section('优先业务机会', 'Priority business opportunities')}\n\n`;
  report += business.opportunities.length ? business.opportunities.map((opportunity, index) => businessOpportunityMarkdown(opportunity, index + 1, section, en)).join('\n\n') + '\n\n' : `${section('本轮没有足够的有效回答形成业务机会卡。报告不会把采样失败或缺失入口包装成品牌问题。', 'There are not enough valid answers to form a business opportunity card. Collection gaps are not presented as brand problems.')}\n\n`;
  report += `## ${section('受众决策地图', 'Audience decision map')}\n\n`;
  report += table([section('受众', 'Audience'), section('题型', 'Question kind'), section('业务任务', 'Business task'), section('选择标准', 'Decision criteria'), section('产品场景', 'Product area'), section('观察状态', 'Observation'), section('下一步', 'Next step')], business.scenarios.map(scenario => [scenario.audience, kindLabel(scenario.questionKind, en), scenario.businessTask, scenario.decisionCriteria.join('、'), scenario.productArea, `${scenario.status === 'partial' ? section('覆盖不全', 'Partial coverage') : scenario.status === 'observed' ? section('已观察', 'Observed') : section('未知', 'Unknown')} · ${scenario.valid}/${scenario.planned}`, scenario.opportunityId ? `${section('见机会', 'See opportunity')} ${business.opportunities.findIndex(item => item.id === scenario.opportunityId) + 1}` : section('保持观察', 'Keep observing')])) + '\n\n';
  report += `### ${section('业务解读的边界', 'Business interpretation limits')}\n\n${business.limitations.map(item => `- ${cell(item)}`).join('\n')}\n\n`;
  report += reportScope(run, a, filter, section, en) + '\n\n';
  report += qualitySummary(run, a, section, en);
  report += (run.measurementTargets || []).filter(target => a.rows.some(row => row.id.endsWith(`--${target.id}`))).flatMap(target => apiFallbackNote(target, en) || []).map(note => `- ${cell(note)}`).join('\n') + '\n\n';
  report += apiReceiptsMarkdown(run, en, false);
  const evidenceIds = a.rows.filter(row => row.status === 'valid' && row.sampleId).slice(0, 6).map(row => `\`${cell(row.sampleId)}\``);
  report += `**${section('复核样本入口', 'Sample IDs for review')}:** ${evidenceIds.join(', ') || 'UNKNOWN'}\n\n`;
  return redactExportText(report);
}

export function reportEvidenceMarkdown(run: AgentRun, filter: AnalyticsFilter = {}): string {
  const a = analyzeRun(run, filter), en = run.projectSnapshot.market === 'international';
  const section = (zh: string, english: string) => en ? english : zh;
  let report = `# ${run.projectSnapshot.brand} · ${section('GEO 证据附录', 'GEO evidence appendix')}\n\n`;
  report += `> ${section('这份文件用于复核和回放，不是业务简报。', 'This file is for review and replay, not for business decision-making.')}\n\n`;
  report += reportScope(run, a, filter, section, en) + '\n\n';
  report += qualitySummary(run, a, section, en);
  report += apiReceiptsMarkdown(run, en);
  report += `## ${section('本轮数据解读', 'What the data shows')}\n\n- ${section('至少有一条有效回答的问题','Questions with at least one valid answer')}: ${a.summary.coveredQuestions}/${a.summary.questionCount}\n- ${section('覆盖不完整的问题','Questions with incomplete coverage')}: ${a.summary.gaps.length}\n\n`;
  for (const f of a.summary.cohortFindings) report += `- ${cell(f.model)} / ${cell(f.origin)} / ${f.branded ? 'branded' : 'unbranded'} / ${cell(f.intent)}: ${section('品牌提及','Brand mentions')} ${rate(f.mention)}; ${section('样本','Sample')}: ${f.sampleId || 'UNKNOWN'}; ${f.source ? `${section('Provider 引用项最多域名','Most frequent provider-citation domain')}: ${f.source.domain}, ${f.source.items} items, ${rate(f.source.used)}, ${f.source.integrity}` : section('无可计入的 Provider 引用','No eligible provider citations')}。\n`;
  report += '\n';
  report += `## ${section('品牌与同条件分组', 'Brands by measurement cohort')}\n\n`;
  for (const cohort of a.metrics.cohorts) {
    report += `### ${cell(cohort.model)} · ${cell(cohort.origin)} · ${cohort.branded ? 'branded' : 'unbranded'}\n\n${cell(cohort.protocolId)} · ${cell(cohort.runGroup)} · ${cell(cohort.intent)}\n\n`;
    report += table([section('品牌', 'Brand'), section('提及率', 'Visibility'), section('平均首次出现序', 'Mean appearance rank'), section('跟踪品牌提及份额', 'Tracked-brand mention share')], cohort.brands.map(b => [b.name, rate(b.visibility), b.position.value?.toFixed(2) ?? 'UNKNOWN', rate(b.sov)])) + '\n\n';
  }
  if (!a.metrics.cohorts.length) report += 'UNKNOWN\n\n';
  report += `## ${section('逐题与覆盖', 'Questions and coverage')}\n\n` + table([section('问题', 'Question'), section('主题', 'Topic'), section('有效/计划', 'Valid/planned'), section('含品牌回答', 'Answers mentioning brand')], a.questions.map(q => [q.question, q.topic, `${q.valid}/${q.planned}`, `${q.mentioned} (${section('逐组率见分组', 'see cohorts')})`])) + '\n\n';
  report += `## ${section('观测日期与趋势', 'Observed dates and trend')}\n\n` + table([section('模型/通道/题组', 'Model / channel / question group'), section('协议','Protocol'), section('日期','Date'), section('提及率','Visibility')], a.trends.flatMap(series => series.points.map(p => [series.label, series.protocolId, p.day, rate(p)]))) + '\n\n';
  report += `## ${section('信源分析', 'Source analysis')}\n\n`;
  for (const cohort of a.sources.cohorts) {
    report += `### ${cell(cohort.model)} · ${cell(cohort.origin)} · ${cohort.branded ? 'branded' : 'unbranded'}\n\n${cell(cohort.protocolId)} · ${cell(cohort.runGroup)} · ${cell(cohort.intent)}\n\n`;
    for (const [label, rows] of [[section('域名', 'Domain'), cohort.domains], ['URL', cohort.urls]] as const) report += table([label, section('证据类型/完整性', 'Kind/integrity'), section('来源项', 'Items'), section('使用率', 'Used'), section('同类型引用份额', 'Same-kind citation share'), section('样本', 'Samples')], rows.map(s => [s.source, `${s.kind}/${s.integrity}`, s.citationCount, rate(s.used), rate(s.citationShare), s.sampleIds.join(', ')])) + '\n\n';
  }
  report += `## ${section('测量明细与失败原因', 'Measurement details and failures')}\n\n` + table([section('问题','Question'),section('平台','Platform'),section('通道/模型','Channel / model'),section('状态','Status'),section('原因与尝试','Reason and attempts'),section('样本','Sample')], a.rows.map(r => [r.question, r.platform, `${r.channel || 'UNKNOWN'} / ${r.model || 'UNKNOWN'}`, r.status, [r.reason, ...r.attemptDetails.map(attempt => `${attempt.channel}/${attempt.status}${attempt.fallback ? '/fallback' : ''}: ${attempt.reason || attempt.model || '-'}`)].filter(Boolean).join('; '), r.sampleId || '-'])) + '\n\n';
  report += `## ${section('指标定义与限制', 'Definitions and limitations')}\n\n` + Object.entries(a.metrics.formulas).map(([key, value]) => `- ${key}: ${value}`).join('\n') + '\n' + Object.entries(a.sources.formulas).map(([key, value]) => `- ${key}: ${value}`).join('\n') + `\n- metricVersion: ${a.version}; ${a.metrics.version}; ${a.metrics.matcherVersion}\n- ${section('首次出现序不是推荐排名。来源存在不证明其支持事实。未验证情绪、搜索量、转化和增长效果。', 'Appearance order is not recommendation rank. Source presence does not establish factual support. Sentiment, volume, conversion and uplift are unverified.')}\n\n`;
  report += `## ${section('回答原文', 'Original answers')}\n\n`;
  const identities = new Set(a.rows.flatMap(row => row.sampleIdentity ? [row.sampleIdentity] : []));
  const scopedUnits = new Set(a.rows.map(row => row.id));
  const cutoff = filter.days ? Date.now() - filter.days * 86400000 : 0;
  const inScope = (sample: AgentRun['samples'][number]) => (!filter.model || filter.model === 'all' || sample.model === filter.model)
    && (!filter.channel || filter.channel === 'all' || (sample.origin === 'browser' ? 'web' : sample.origin) === filter.channel)
    && (!cutoff || Date.parse(sample.observedAt) >= cutoff);
  for (const s of run.samples.filter(s => identities.has(JSON.stringify([s.origin, s.runGroup, s.id]))
    || (s.measurementUnitId && scopedUnits.has(s.measurementUnitId) && inScope(s)))) {
    const quoted = (s.answer || 'UNKNOWN: no answer').split('\n').map(line => '> ' + line).join('\n');
    report += `### ${cell(s.id)}\n\n${cell(s.question)}\n\n${s.selected === false ? section('未采纳尝试', 'Unadopted attempt') + ' · ' : ''}${cell(s.origin)} · ${cell(s.model)} · ${cell(s.protocolId)} · ${cell(s.observedAt)}\n\n${quoted}\n\n${s.citations.map(c => `- ${cell(c.kind)} / ${cell(c.integrity)}: ${c.url}`).join('\n')}\n\n`;
  }
  return redactExportText(report);
}

function renderHtml(run: AgentRun, markdown: string, title: string): string {
  const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const renderer = new marked.Renderer();
  renderer.html = ({ text }) => esc(text);
  renderer.image = ({ text }) => esc(text);
  renderer.link = ({ href, text }) => { try { const u = new URL(href); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? `<a href="${esc(href)}" rel="noreferrer">${esc(text)}</a>` : esc(text); } catch { return esc(text); } };
  const body = marked.parse(markdown, { renderer, async: false });
  return `<!doctype html><html lang="${run.projectSnapshot.market === 'international' ? 'en' : 'zh-CN'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(title)}</title><style>body{font:15px/1.7 system-ui,sans-serif;color:#202824;max-width:1120px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:42px;border-bottom:1px solid #d9dfdc;padding-bottom:10px}table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow:auto}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e1e5e3;min-width:80px;overflow-wrap:anywhere}th{background:#edf2ef}blockquote{margin:16px 0;padding:14px 20px;background:#f3f6f4;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#12634d}code{overflow-wrap:anywhere}@media print{body{margin:0;max-width:none;font-size:10pt}h2,h3{break-after:avoid}tr{break-inside:avoid}table{display:table;font-size:8pt}a{color:inherit}}</style><body><main>${body}</main></body></html>`;
}
export function reportHtml(run: AgentRun, filter: AnalyticsFilter = {}, fullEvidence = false): string { return renderHtml(run, fullEvidence ? reportEvidenceMarkdown(run, filter) : reportMarkdown(run, filter), `${run.projectSnapshot.brand} · OpenGEO business brief`); }
export function reportEvidenceHtml(run: AgentRun, filter: AnalyticsFilter = {}): string { return renderHtml(run, reportEvidenceMarkdown(run, filter), `${run.projectSnapshot.brand} · OpenGEO evidence appendix`); }

// Preserve the full-evidence API consumed by existing scripts and tests.
export const evidenceMarkdown = reportEvidenceMarkdown;

export function exportRun(run: AgentRun) {
  const analysis = analyzeRun(run);
  return sanitizeExport({ schemaVersion: 'opengeo-public-run/v1', id: run.id, createdAt: run.createdAt, mode: run.mode,
    project: { name: run.projectSnapshot.name, brand: run.projectSnapshot.brand, origin: run.projectSnapshot.origin, market: run.projectSnapshot.market, language: run.projectSnapshot.language, requestedCountry: run.projectSnapshot.country },
    analysis, business: diagnoseBusiness(run, analysis), apiReceipts: apiReceipts(run), goal: run.goal, audit: run.audit, queries: run.queries, actions: run.actions, actionStates: run.actionStates, diagnosis: diagnoseRun(run), draft: run.draft,
    samplingQueue: run.samplingQueue, measurementTargets: run.measurementTargets, measurementUnits: run.measurementUnits,
    samples: run.samples.map(({ rawResponse, search, ...s }) => s),
    calls: run.calls.map(({ response, answer, ...c }) => c), steps: run.steps, limitations: run.limitations, review: run.review });
}
