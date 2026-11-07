import { internationalReport } from './international.js';
import type { AgentRun, Metric } from './types.js';
export function formatMetric(m: Metric): string { return m.value === null ? '无数据' : `${(m.value * 100).toFixed(1)}%（${m.numerator}/${m.denominator}）`; }
function buildReportMarkdown(run: AgentRun): string {
  if (run.projectSnapshot.market === 'international') return internationalReport(run);
  const a = run.audit;
  return `# ${run.projectSnapshot.brand} · GEO 工作流报告\n\n运行 ID：${run.id}\n\n时间：${run.createdAt}\n\n数据类型：${run.mode === 'live' ? (run.samples.some(s => s.origin === 'browser') ? '新网页观察，采集协议见下文' : '新 API 观察，模型配置见下文') : run.projectSnapshot.origin === 'synthetic' ? '合成案例回放，无新模型调用' : run.projectSnapshot.origin === 'archive' ? '上游历史归档回放，无新模型调用' : '人工导入回答的本地分析，无新模型调用'}\n\n目标：${run.goal}\n\n## 诊断\n\n${a ? `- 计划样本：${a.planned}\n- 已取得原文：${a.collected}\n- 已完成分析：${a.analyzed}\n- 采集失败：${a.collectionFailed}\n- 分析未完成：${a.analysisFailed}\n- 品牌字面提及：${formatMetric(a.mention)}\n- 推荐措辞规则判定：${formatMetric(a.recommendation)}\n- Provider 引用项：${a.providerCitations}\n- 搜索结果项：${a.searchResults}\n- Grounding 来源项：${a.groundings}\n- 正文 URL 项：${a.answerUrls}` : '本轮没有诊断数据。'}\n\n品牌词、非品牌词、模型与运行批次按分组查看，合计数只用于描述本次输入集合，不代表平台总体推荐率。推荐判定为文本规则，需要复核。\n\n## 策略任务\n\n${run.actions.map(x => `### ${x.priority} · ${x.title}\n\n${x.rationale}\n\n验收：${x.acceptance}\n\n问题：${x.queryIds.join(', ') || '无'}\n\n样本：${x.sampleIds.join(', ') || '无'}\n\n事实：${x.claimIds.join(', ') || '无'}\n`).join('\n')}\n## 内容草稿\n\n${run.draft?.status === 'blocked' ? '已阻塞：' + run.draft.warnings.join('；') : run.draft?.markdown || '未生成'}\n\n## 复盘\n\n${run.review}\n\n## 限制\n\n${run.limitations.map(x => '- ' + x).join('\n')}\n\n## 执行记录\n\n${run.steps.map(s => `- ${s.skill} / ${s.executor} / ${s.status}：${s.summary || ''}`).join('\n')}\n\n## 原文与证据\n\n${run.samples.map(s => `### ${s.id}\n\n问题：${s.question}\n\n模型：${s.model}\n\n观察时间：${s.observedAt}\n\n状态：采集 ${s.collectionStatus}；分析 ${s.analysisStatus}\n\n${s.answer || '没有回答原文'}\n\n来源：\n${s.citations.map(c => `- ${c.kind}：${c.url}；完整性 ${c.integrity}`).join('\n') || '本次未返回来源项'}\n`).join('\n')}\n`;
}
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
export function reportMarkdown(run: AgentRun): string { return redactExportText(buildReportMarkdown(run)); }
export function exportRun(run: AgentRun) {
  // Explicitly export derived business evidence; never credentials or raw provider payloads.
  return sanitizeExport({ schemaVersion: 'citekeel-public-run/v1', id: run.id, createdAt: run.createdAt, mode: run.mode,
    project: { name: run.projectSnapshot.name, brand: run.projectSnapshot.brand, origin: run.projectSnapshot.origin, market: run.projectSnapshot.market, language: run.projectSnapshot.language, requestedCountry: run.projectSnapshot.country },
    goal: run.goal, audit: run.audit, queries: run.queries, actions: run.actions, draft: run.draft,
    samples: run.samples.map(({ rawResponse, search, ...s }) => s),
    calls: run.calls.map(({ response, answer, ...c }) => c), steps: run.steps, limitations: run.limitations, review: run.review });
}
