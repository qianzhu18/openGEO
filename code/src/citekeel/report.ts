import { marked } from 'marked';
import { analyzeRun, type AnalyticsFilter } from './analytics.js';
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
const table = (heads: string[], rows: unknown[][]) => `| ${heads.join(' | ')} |\n| ${heads.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')}`;
export function reportMarkdown(run: AgentRun, filter: AnalyticsFilter = {}): string {
  const a = analyzeRun(run, filter), en = run.projectSnapshot.market === 'international';
  const title = en ? 'AI visibility diagnostic' : 'GEO 数据调研报告';
  const section = (zh: string, english: string) => en ? english : zh;
  let report = `# ${run.projectSnapshot.brand} · ${title}\n\n${section('运行', 'Run')}: ${run.id}  \n${section('时间', 'Time')}: ${new Date(run.createdAt).toLocaleString(en ? 'en-US' : 'zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} UTC+8 (${run.createdAt})  \n${section('状态', 'Status')}: ${a.status} · ${a.quality.label}  \n${section('问题版本', 'Question version')}: v${a.queryVersion}  \n${section('数据', 'Data')}: ${a.mode} / ${a.origin}  \n${section('筛选', 'Filters')}: ${filter.model || 'all models'} / ${filter.channel || 'all channels'} / ${filter.days || 'all'} days\n\n`;
  report += `## ${section('摘要与数据质量', 'Summary and data quality')}\n\n`;
  report += `${section('有效回答', 'Valid answers')}${a.quality.planBasis === 'saved-records' ? section('（已有记录）',' (saved records)') : ''}: **${a.quality.valid}/${a.quality.planned}** · ${section('覆盖率', 'Coverage')}: ${a.quality.coverage === null ? 'UNKNOWN' : (a.quality.coverage * 100).toFixed(1) + '%'} · ${section('排除', 'Excluded')}: ${a.quality.excluded} · ${section('待完成', 'Pending')}: ${a.quality.pending} · ${section('尝试', 'Attempts')}: ${a.quality.attempts}\n\n`;
  report += (en ? a.warnings : [...(!run.measurementUnits?.length ? ['未保存冻结计划，覆盖仅描述已有记录，原始采样覆盖未知。'] : []), ...(a.quality.contaminated ? ['本轮含误入的问题分组标题，只能作 QA 证据，不可作为正式基线。'] : []), ...(a.metrics.mixedCohorts ? ['网页/API、模型、协议、题型标签、批次与意图分组计算，不输出混合总提及率。'] : []), '仅描述本次题集；情绪、搜索量、转化与增长效果未验证。']).map(w => `- ${w}`).join('\n') + '\n\n';
  report += `- ${section('实际有效通道', 'Valid channels')}: ` + [...new Set(a.rows.filter(r => r.status === 'valid').map(r => r.channel))].map(c => `${c}: ${a.rows.filter(r => r.status === 'valid' && r.channel === c).length}`).join('; ') + `\n- ${section('可分析测量组', 'Measurement cohorts')}: ${a.metrics.cohorts.filter(c => c.eligibleObservationIds.length).length}\n- ${section('注意', 'Note')}: ${section('采样不足或有选择性缺失时，提及率只反映已成功取得的回答。', 'Coverage gaps may be selective. Mention rates describe only the answers successfully obtained.')}\n\n`;

  report += en ? 'API region is not verified. Failed or incomplete answers are excluded, never counted as 0% mention.\n\n' : '失败不算未提及；品牌提及以同组有效原文为分母。网页与 API、不同模型和协议分别分析。混合组不出一个总提及率。\n\n';
  report += `## ${section('本轮数据解读', 'What the data shows')}\n\n- ${section('至少有一条有效回答的问题','Questions with at least one valid answer')}: ${a.summary.coveredQuestions}/${a.summary.questionCount}\n- ${section('覆盖不完整的问题','Questions with incomplete coverage')}: ${a.summary.gaps.length}\n\n`;
  for (const f of a.summary.cohortFindings) report += `- ${cell(f.model)} / ${cell(f.origin)} / ${f.branded ? 'branded' : 'unbranded'} / ${cell(f.intent)}: ${section('品牌提及','Brand mentions')} ${rate(f.mention)}; ${section('原文','Evidence')}: ${f.sampleId || 'UNKNOWN'}; ${f.source ? `${section('本组 Provider 引用项最多域名','Most frequent provider-citation domain')}: ${f.source.domain}, ${f.source.items} items, ${rate(f.source.used)} used, ${f.source.integrity}` : section('无可计入的 Provider 引用','No eligible provider citations')}。\n`;
  report += '\n';
  report += `## ${section('品牌与同条件分组', 'Brands by measurement cohort')}\n\n`;
  for (const cohort of a.metrics.cohorts) {
    report += `### ${cell(cohort.model)} · ${cell(cohort.origin)} · ${cohort.branded ? 'branded' : 'unbranded'}\n\n${cell(cohort.protocolId)} · ${cell(cohort.runGroup)} · ${cell(cohort.intent)}\n\n`;
    report += table([section('品牌', 'Brand'), section('提及率', 'Visibility'), section('平均首次出现序', 'Mean appearance rank'), section('跟踪品牌提及份额', 'Tracked-brand mention share')], cohort.brands.map(b => [b.name, rate(b.visibility), b.position.value?.toFixed(2) ?? 'UNKNOWN', rate(b.sov)])) + '\n\n';
  }
  if (!a.metrics.cohorts.length) report += 'UNKNOWN\n\n';
  report += `## ${section('逐题与覆盖', 'Questions and coverage')}\n\n` + table([section('问题', 'Question'), section('主题', 'Topic'), section('有效/计划', 'Valid/planned'), section('含品牌回答', 'Answers mentioning brand')], a.questions.map(q => [q.question, q.topic, `${q.valid}/${q.planned}`, `${q.mentioned} (${section('逐组率见原文', 'see cohorts for rates')})`])) + '\n\n';
  report += `## ${section('观测日期与趋势', 'Observed dates and trend')}\n\n` + table([section('模型/通道/题组', 'Model / channel / question group'), section('协议','Protocol'), section('日期','Date'), section('提及率','Visibility')], a.trends.flatMap(series => series.points.map(p => [series.label, series.protocolId, p.day, rate(p)]))) + '\n\n';
  report += `## ${section('信源分析', 'Source analysis')}\n\n`;
  for (const cohort of a.sources.cohorts) {
    report += `### ${cell(cohort.model)} · ${cell(cohort.origin)} · ${cohort.branded ? 'branded' : 'unbranded'}\n\n${cell(cohort.protocolId)} · ${cell(cohort.runGroup)} · ${cell(cohort.intent)}\n\n`;
    for (const [label, rows] of [[section('域名', 'Domain'), cohort.domains], ['URL', cohort.urls]] as const) report += table([label, section('证据类型/完整性', 'Kind/integrity'), section('来源项', 'Items'), section('使用率', 'Used'), section('同类型引用份额', 'Same-kind citation share'), section('样本', 'Samples')], rows.map(s => [s.source, `${s.kind}/${s.integrity}`, s.citationCount, rate(s.used), rate(s.citationShare), s.sampleIds.join(', ')])) + '\n\n';
  }
  report += `## ${section('测量明细与失败原因', 'Measurement details and failures')}\n\n` + table([section('问题','Question'),section('平台','Platform'),section('通道/模型','Channel / model'),section('状态','Status'),section('原因与尝试','Reason and attempts'),section('样本','Sample')], a.rows.map(r => [r.question, r.platform, `${r.channel || 'UNKNOWN'} / ${r.model || 'UNKNOWN'}`, r.status, [r.reason, ...r.attemptDetails.map(a => `${a.channel}/${a.status}${a.fallback ? '/fallback' : ''}: ${a.reason || a.model || '-'}`)].filter(Boolean).join('; '), r.sampleId || '-'])) + '\n\n';
  report += `## ${section('指标定义与限制', 'Definitions and limitations')}\n\n` + Object.entries(a.metrics.formulas).map(([key, value]) => `- ${key}: ${value}`).join('\n') + '\n' + Object.entries(a.sources.formulas).map(([key, value]) => `- ${key}: ${value}`).join('\n') + `\n- metricVersion: ${a.version}; ${a.metrics.version}; ${a.metrics.matcherVersion}\n- ${section('首次出现序不是推荐排名。来源存在不证明其支持事实。未验证情绪、搜索量、转化和增长效果。', 'Appearance order is not recommendation rank. Source presence does not establish factual support. Sentiment, volume, conversion and uplift are unverified.')}\n\n`;
  report += `## ${section('证据附录：回答原文', 'Evidence appendix: original answers')}\n\n`;
  const unitIds = new Set(a.rows.map(r => r.id));
  const ids = new Set([...a.rows.flatMap(r => r.sampleId ? [r.sampleId] : []), ...(run.measurementUnits || []).filter(u => unitIds.has(u.id)).flatMap(u => u.attempts.flatMap(a => a.sampleId ? [a.sampleId] : []))]);
  for (const s of run.samples.filter(s => ids.has(s.id))) {
    // Quoted evidence stays inert in Markdown and in the rendered HTML.
    const quoted = (s.answer || 'UNKNOWN: no answer').split('\n').map(line => '> ' + line).join('\n');
    report += `### ${cell(s.id)}\n\n${cell(s.question)}\n\n${s.selected === false ? section('未采纳尝试', 'Unadopted attempt') + ' · ' : ''}${cell(s.origin)} · ${cell(s.model)} · ${cell(s.protocolId)} · ${cell(s.observedAt)}\n\n${quoted}\n\n${s.citations.map(c => `- ${cell(c.kind)} / ${cell(c.integrity)}: ${c.url}`).join('\n')}\n\n`;
  }
  return redactExportText(report);
}
export function reportHtml(run: AgentRun, filter: AnalyticsFilter = {}): string {
  const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const renderer = new marked.Renderer();
  renderer.html = ({ text }) => esc(text);
  renderer.image = ({ text }) => esc(text);
  renderer.link = ({ href, text }) => { try { const u = new URL(href); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? `<a href="${esc(href)}" rel="noreferrer">${esc(text)}</a>` : esc(text); } catch { return esc(text); } };
  const body = marked.parse(reportMarkdown(run, filter), { renderer, async: false });
  return `<!doctype html><html lang="${run.projectSnapshot.market === 'international' ? 'en' : 'zh-CN'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(run.projectSnapshot.brand)} · OpenGEO</title><style>body{font:15px/1.7 system-ui,sans-serif;color:#202824;max-width:1120px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:42px;border-bottom:1px solid #d9dfdc;padding-bottom:10px}table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow:auto}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e1e5e3;min-width:80px;overflow-wrap:anywhere}th{background:#edf2ef}blockquote{margin:16px 0;padding:14px 20px;background:#f3f6f4;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#12634d}code{overflow-wrap:anywhere}@media print{body{margin:0;max-width:none;font-size:10pt}h2,h3{break-after:avoid}tr{break-inside:avoid}table{display:table;font-size:8pt}a{color:inherit}}</style><body><main>${body}</main></body></html>`;
}
export function exportRun(run: AgentRun) {
  // Explicitly export derived business evidence; never credentials or raw provider payloads.
  return sanitizeExport({ schemaVersion: 'citekeel-public-run/v1', id: run.id, createdAt: run.createdAt, mode: run.mode,
    project: { name: run.projectSnapshot.name, brand: run.projectSnapshot.brand, origin: run.projectSnapshot.origin, market: run.projectSnapshot.market, language: run.projectSnapshot.language, requestedCountry: run.projectSnapshot.country },
    analysis: analyzeRun(run), goal: run.goal, audit: run.audit, queries: run.queries, actions: run.actions, draft: run.draft,
    measurementTargets: run.measurementTargets, measurementUnits: run.measurementUnits,
    samples: run.samples.map(({ rawResponse, search, ...s }) => s),
    calls: run.calls.map(({ response, answer, ...c }) => c), steps: run.steps, limitations: run.limitations, review: run.review });
}
