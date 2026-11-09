import type { AgentRun, ModelCall, Sample } from './types.js';
import { answerTruncated } from './analysis.js';
import { answerExclusion } from './geo-rates.js';

export interface ApiReceipt {
  version: 'api-receipt/v1'; sampleId?: string; queryId?: string; unitId?: string;
  dispatch: 'not_started' | 'attempted' | 'response_received';
  responseRetained: boolean; httpStatus?: number; providerRequestId?: string; generationId?: string;
  actualModel?: string; costStatus: 'reported' | 'unknown';
  tokenUsage?: { input?: number; output?: number; total?: number };
  answerState: 'none' | 'empty' | 'partial' | 'complete' | 'rejected';
  searchState: 'not_requested' | 'unconfirmed' | 'confirmed' | 'unknown'; finishedAt?: string;
  failure?: ApiFailureDiagnosis;
}
export type ApiFailureCode = 'authentication' | 'billing' | 'rate_limited' | 'timeout' | 'upstream_unavailable' | 'unsupported_model' | 'invalid_request' | 'network' | 'empty_answer' | 'truncated_answer' | 'refusal_or_filter' | 'tool_unfinished' | 'unknown';
export interface ApiFailureDiagnosis {
  code: ApiFailureCode;
  stage: 'preflight' | 'transport' | 'provider_response' | 'answer_validation';
  retryable: boolean;
  summary: string;
  action: string;
}
export type CallContext = Pick<ApiReceipt, 'sampleId' | 'queryId' | 'unitId'>;
export function newReceipt(context: CallContext = {}, search = false): ApiReceipt {
  return { version: 'api-receipt/v1', ...context, dispatch: 'not_started', responseRetained: false,
    costStatus: 'unknown', answerState: 'none', searchState: search ? 'unconfirmed' : 'not_requested' };
}
const obj = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const id = (v: unknown) => typeof v === 'string' && v.length <= 512 ? v : undefined;
const messageFrom = (value: unknown): string => {
  const root = obj(value), error = obj(root.error);
  return [error.message, root.message, root.detail, root.code].find(v => typeof v === 'string' && v.trim())?.trim() || '';
};
const failureFromStatus = (status: number): ApiFailureCode => status === 401 || status === 403 ? 'authentication'
  : status === 402 ? 'billing' : status === 408 ? 'timeout' : status === 429 ? 'rate_limited'
  : status >= 500 ? 'upstream_unavailable' : status >= 400 ? 'invalid_request' : 'unknown';
export function diagnoseApiFailure(input: { provider?: string; status?: number; raw?: unknown; error?: unknown; answer?: string; stage?: ApiFailureDiagnosis['stage'] }): ApiFailureDiagnosis {
  const status = input.status, text = `${messageFrom(input.raw)} ${input.error instanceof Error ? input.error.message : String(input.error || '')}`.toLowerCase();
  let code: ApiFailureCode = status ? failureFromStatus(status) : 'unknown';
  let stage: ApiFailureDiagnosis['stage'] = input.stage || (status ? 'provider_response' : 'transport');
  const embeddedStatus = text.match(/\bhttp\s*(\d{3})\b/);
  if (!status && embeddedStatus) code = failureFromStatus(Number(embeddedStatus[1]));
  if (/abort|timeout|timed out|deadline exceeded|etimedout/.test(text)) { code = 'timeout'; stage = 'transport'; }
  else if (/fetch failed|network|econnreset|enotfound|eai_again|tls|socket hang up/.test(text)) { code = 'network'; stage = 'transport'; }
  else if (/insufficient|quota|credit|billing|payment|balance/.test(text) || status === 402) code = 'billing';
  else if (/rate.?limit|too many requests|throttl|quota exceeded/.test(text) || status === 429) code = 'rate_limited';
  else if (/model.{0,30}(not found|unavailable|unsupported|does not exist)|unknown model|no such model/.test(text)) code = 'unsupported_model';
  else if (input.raw && answerTruncated(input.raw)) { code = 'truncated_answer'; stage = 'answer_validation'; }
  else if (/refus|safety|content.?filter|prohibited|policy/.test(text) || Boolean(obj(obj(input.raw).choices?.[0]?.message).refusal)) { code = 'refusal_or_filter'; stage = 'answer_validation'; }
  else if (/tool_calls|function_call|tool_use|pause_turn/.test(text) || Boolean(obj(obj(input.raw).choices?.[0]?.message).tool_calls)) { code = 'tool_unfinished'; stage = 'answer_validation'; }
  else if (/invalid (request|parameter)|bad request|missing required|schema|json/.test(text) || status === 400 || status === 422) code = 'invalid_request';
  else if (input.answer !== undefined && !input.answer.trim()) code = 'empty_answer';
  const copy: Record<ApiFailureCode, [string, string, boolean]> = {
    authentication: ['服务商拒绝认证或模型权限不足', '检查 API Key、OpenRouter 账户权限、模型可用地区与模型访问权限。', false],
    billing: ['服务商余额、额度或账单状态不可用', '检查余额、credits、支付状态和项目额度；确认后再手动发起新采样。', false],
    rate_limited: ['请求被服务商限流或配额限制', '降低并发、等待限流窗口恢复，并检查账户与模型配额；系统不会自动重试付费请求。', true],
    timeout: ['请求超时或连接在截止时间前未完成', '检查网络和服务商状态，适当增加超时；该请求可能已经收费，不要直接重复提交。', true],
    upstream_unavailable: ['服务商上游暂时不可用', '查看服务商状态页，稍后用同一问题创建新尝试；旧失败记录保留。', true],
    unsupported_model: ['所选模型不存在、不可用或不支持当前接口', '检查模型 ID、OpenRouter 模型目录、地区和请求协议；换模型前保留协议差异。', false],
    invalid_request: ['请求参数、格式或能力声明不被服务商接受', '检查模型、token 上限、JSON/工具参数和原生搜索设置；先用最小请求验证。', false],
    network: ['本机到服务商的网络请求未完成', '检查 DNS、代理、防火墙和 TLS；若无法取得 HTTP 响应，费用保持 UNKNOWN。', true],
    empty_answer: ['服务商返回成功状态但没有可用回答文本', '检查模型能力、输出预算和请求格式；不要把空回答计入提及分母。', false],
    truncated_answer: ['回答达到输出上限，原文不完整', '提高 max tokens 或减少问题上下文；用新尝试复测，旧部分回答不进入有效分母。', false],
    refusal_or_filter: ['回答被模型拒答或安全过滤', '检查问题是否触发政策限制，改写为中性可回答的问题；保留原失败证据。', false],
    tool_unfinished: ['模型只返回未完成的工具调用，没有最终回答', '确认模型和网关支持该工具协议；关闭未支持的工具或改用已支持的模型。', false],
    unknown: ['服务商返回了无法归类的失败', '查看脱敏响应、HTTP 状态和服务商 request ID，再决定是否手动新建一次尝试。', false],
  };
  const [summary, action, retryable] = copy[code];
  return { code, stage, retryable, summary, action };
}
export function redactApiEvidence(value: unknown, key: string): any {
  if (typeof value === 'string') return key ? value.split(key).join('[REDACTED]') : value;
  if (Array.isArray(value)) return value.map(v => redactApiEvidence(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, v]) => [name,
    /^(?:authorization|api[_-]?key|cookie|set-cookie|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(name) ? '[REDACTED]' : redactApiEvidence(v, key)]));
  return value;
}
function textFrom(raw: Record<string, any>): string {
  const content = raw.choices?.[0]?.message?.content ?? raw.result?.text ?? raw.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(p => typeof p?.text === 'string' ? p.text : '').join('\n');
  if (Array.isArray(raw.output)) return raw.output.flatMap((p: any) => Array.isArray(p?.content) ? p.content : []).map((p: any) => p?.text || '').join('\n');
  const parts = raw.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((p: any) => typeof p?.text === 'string' ? p.text : '').join('\n') : '';
}
/** Transport success alone is insufficient for a usable measurement answer. */
export function apiAnswerProblem(answer: string, raw: unknown): string | null {
  if (answerTruncated(raw)) return 'Provider 回答不完整，原文已保留，本次不进入有效分析。';
  const root = obj(raw), choice = root.choices?.[0];
  const reasons = [choice?.finish_reason, choice?.native_finish_reason, root.stop_reason, root.candidates?.[0]?.finishReason].map(v => String(v).toLowerCase());
  if (choice?.message?.refusal || reasons.some(v => ['content_filter', 'safety', 'recitation', 'blocklist', 'prohibited_content'].includes(v))) return 'Provider 拒答或内容过滤，原文已保留，本次不进入有效分析。';
  if (reasons.some(v => ['tool_calls', 'function_call', 'tool_use', 'pause_turn'].includes(v)) || (Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length)) return 'Provider 工具调用尚未形成最终回答，原文已保留，本次不进入有效分析。';
  return answerExclusion(answer);
}
export function failureForAnswer(answer: string, raw: unknown): ApiFailureDiagnosis | undefined {
  const problem = apiAnswerProblem(answer, raw);
  if (!problem) return undefined;
  return diagnoseApiFailure({ raw, answer, stage: 'answer_validation' });
}
/** This is a provider-reported amount, not an inferred price or a reconciled invoice. */
export function retainApiResponse(call: ModelCall, raw: unknown, status: number, requestId: string | undefined, key: string) {
  const safe = redactApiEvidence(raw, key), root = obj(safe), usage = obj(root.usage ?? root.usageMetadata);
  call.response = safe;
  const receipt = call.receipt!;
  Object.assign(receipt, { dispatch: 'response_received', responseRetained: true, httpStatus: status,
    ...(id(requestId) ? { providerRequestId: redactApiEvidence(id(requestId), key) } : {}),
    ...(id(root.id ?? root.request_id) ? { generationId: id(root.id ?? root.request_id) } : {}),
    ...(id(root.model ?? root.modelVersion) ? { actualModel: id(root.model ?? root.modelVersion) } : {}) });
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount;
  const output = usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount;
  const total = usage.total_tokens ?? usage.totalTokenCount;
  if ([input, output, total].some(finite)) receipt.tokenUsage = {
    ...(finite(input) ? { input } : {}), ...(finite(output) ? { output } : {}), ...(finite(total) ? { total } : {}),
  };
  if (call.provider !== 'cloro' && finite(usage.cost)) { call.costUsd = usage.cost; receipt.costStatus = 'reported'; }
  const answer = textFrom(root);
  if (answer) call.answer = answer;
  receipt.answerState = !answer.trim() ? 'empty' : answerTruncated(safe) ? 'partial' : 'rejected';
  if (!responseOk(status)) receipt.failure = diagnoseApiFailure({ provider: call.provider, status, raw: safe });
  else if (!answer.trim()) receipt.failure = diagnoseApiFailure({ provider: call.provider, status, raw: safe, answer, stage: 'answer_validation' });
  else if (answerTruncated(safe) || apiAnswerProblem(answer, safe)) receipt.failure = diagnoseApiFailure({ provider: call.provider, status, raw: safe, answer, stage: 'answer_validation' });
}
const responseOk = (status: number) => status >= 200 && status < 300;
export function attachApiEvidence(sample: Sample, run: AgentRun) {
  const call = run.calls.find(c => c.receipt?.sampleId === sample.id);
  if (!call) return;
  sample.modelCallId = call.id;
  if (call.response !== undefined) sample.rawResponse = call.response;
  if (typeof call.costUsd === 'number') sample.costUsd = call.costUsd;
  if (!sample.answer && call.answer) sample.answer = call.answer;
}
export function apiReceipts(run: AgentRun) {
  const calls = run.calls.filter(c => c.purpose === 'measurement');
  const rows = calls.map(c => {
    const r = c.receipt, cost = finite(c.costUsd) ? c.costUsd : null;
    const sample = r?.sampleId ? run.samples.find(s => s.id === r.sampleId) : undefined;
    const usable = r?.answerState === 'complete' && c.status === 'completed' && Boolean(sample?.answer.trim())
      && sample?.collectionStatus === 'completed' && sample?.analysisStatus === 'completed';
    return { callId: c.id, sampleId: r?.sampleId || null, queryId: r?.queryId || null, unitId: r?.unitId || null,
      provider: c.provider, model: c.model, startedAt: c.startedAt, finishedAt: r?.finishedAt || null,
      dispatch: r?.dispatch || 'unknown', responseRetained: r?.responseRetained ?? c.response !== undefined,
      providerRequestId: r?.providerRequestId || null, generationId: r?.generationId || null, actualModel: r?.actualModel || null,
      httpStatus: r?.httpStatus ?? null, costUsd: cost, costStatus: r?.costStatus || (cost === null ? 'unknown' : 'reported'),
      tokenUsage: r?.tokenUsage || null, answerState: r?.answerState || 'unknown', searchState: r?.searchState || 'unknown',
      usable, error: c.error || null, failure: r?.failure || null };
  });
  const sent = rows.filter(r => r.dispatch === 'attempted' || r.dispatch === 'response_received');
  const costRows = sent.filter(r => r.costUsd !== null), reportedRows = rows.filter(r => r.costUsd !== null), usable = sent.filter(r => r.usable).length;
  return { version: 'api-receipt/v1', scope: 'all-measurement-calls-in-run', rows,
    summary: { attemptedRequests: sent.length, responsesRetained: sent.filter(r => r.responseRetained).length,
      usableAnswers: usable, answerRate: sent.length ? usable / sent.length : null,
      reportedCostUsd: reportedRows.reduce((sum, r) => sum + r.costUsd!, 0),
      legacyReportedCostUsd: reportedRows.filter(r => r.dispatch === 'unknown').reduce((sum, r) => sum + r.costUsd!, 0),
      totalCostUsd: sent.length && costRows.length === sent.length && rows.every(r => r.dispatch !== 'unknown') ? costRows.reduce((sum, r) => sum + r.costUsd!, 0) : null,
      costWithoutUsableAnswerUsd: costRows.filter(r => !r.usable).reduce((sum, r) => sum + r.costUsd!, 0),
      unknownCostRequests: sent.filter(r => r.costUsd === null).length,
      notStarted: rows.filter(r => r.dispatch === 'not_started').length, legacyCalls: rows.filter(r => r.dispatch === 'unknown').length } };
}
export function apiReceiptsMarkdown(run: AgentRun, en: boolean, detailed = true) {
  const a = apiReceipts(run), s = a.summary, t = (zh: string, english: string) => en ? english : zh;
  if (!a.rows.length) return '';
  const cell = (v: unknown) => String(v ?? 'UNKNOWN').replace(/\|/g, '｜').replace(/[\r\n]+/g, ' ');
  const money = (value: number) => Number(value.toFixed(10)).toString();
  return `## ${t('API 请求与内容对账', 'API requests and retained answers')}\n\n`
    + t('范围为本轮全部 API 采样调用，费用不随上方分析筛选变化；不含策略/内容模型费用。历史缺失记录不能补认成已对账。', 'All API measurement calls in this run; costs do not follow analysis filters. Strategy/content calls are excluded. Missing historical receipts remain unknown.') + '\n\n'
    + `${t('实际请求尝试', 'Attempted requests')}: ${s.attemptedRequests}; ${t('保留响应', 'Retained responses')}: ${s.responsesRetained}; ${t('有效回答', 'Usable answers')}: ${s.usableAnswers}; ${t('有效回答率', 'Usable answer rate')}: ${s.answerRate === null ? 'UNKNOWN' : (s.answerRate * 100).toFixed(1) + '%'}; ${t('本地未发送', 'Not started')}: ${s.notStarted}; ${t('历史发送状态未知', 'Legacy dispatch unknown')}: ${s.legacyCalls}\n\n`
    + `${t('服务商已报告费用小计', 'Provider-reported cost subtotal')}: USD ${money(s.reportedCostUsd)}; ${t('其中新回执未形成有效回答', 'Of which new receipts without usable answers')}: USD ${money(s.costWithoutUsableAnswerUsd)}; ${t('费用未知请求', 'Unknown-cost requests')}: ${s.unknownCostRequests}; ${t('采样总费用', 'Total measurement cost')}: ${s.totalCostUsd === null ? 'UNKNOWN' : 'USD ' + money(s.totalCostUsd)}\n\n`
    + (s.legacyCalls ? t(`上方请求尝试、保留响应、有效回答及费用未知请求计数仅覆盖新回执，0 不代表历史未请求或没有回答。历史发送状态未知的调用已有费用 USD ${money(s.legacyReportedCostUsd)}，包含在小计中；其请求与回答对应关系不能按新回执补认。\n\n`, `Request, retained-response, usable-answer and unknown-cost counts above cover new receipts only; zero does not mean historical requests or answers did not exist. Legacy calls with unknown dispatch have USD ${money(s.legacyReportedCostUsd)} in recorded costs, included in the subtotal; their request/answer reconciliation remains unknown.\n\n`) : '')
    + (() => { const failures = new Map<string, { count: number; summary: string; action: string }>(); for (const row of a.rows) if (row.failure) { const previous = failures.get(row.failure.code); failures.set(row.failure.code, { count: (previous?.count || 0) + 1, summary: row.failure.summary, action: row.failure.action }); } return failures.size ? `${t('失败原因与处理建议', 'Failure causes and next actions')}\n\n${[...failures].map(([code, value]) => `- ${code} × ${value.count}: ${value.summary}。${value.action}`).join('\n')}\n\n` : ''; })()
    + t('服务商报告金额不等于账单核销；超时可能已收费，系统不自动重试。完整回答率与品牌提及/排名分开，API 成功不证明执行了网页检索。', 'Reported amounts are not invoice reconciliation. Timeouts may be charged; no automatic retries. Answer availability is separate from brand metrics; API success does not establish web search.') + '\n\n'
    + (detailed ? `| ${t('调用 / 样本', 'Call / sample')} | ${t('发送 / HTTP', 'Dispatch / HTTP')} | ${t('回答 / 检索', 'Answer / search')} | ${t('失败原因', 'Failure')} | USD | ${t('服务商 ID', 'Provider ID')} |\n| --- | --- | --- | --- | --- | --- |\n`
    + a.rows.map(r => `| ${cell(r.callId)} / ${cell(r.sampleId)} | ${cell(r.dispatch)} / ${cell(r.httpStatus)} | ${cell(r.answerState)} / ${cell(r.searchState)} | ${cell(r.failure ? `${r.failure.code}: ${r.failure.summary}` : '')} | ${cell(r.costUsd)} | ${cell(r.providerRequestId || r.generationId)} |`).join('\n') + '\n\n' : '');
}
