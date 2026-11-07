import type { OpenGeoRun } from './types.js';

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

export function reportMarkdown(run: OpenGeoRun): string {
  const project = run.input;
  return `# ${project.name} · OpenGEO 自进化循环报告

Run ID: \`${run.id}\`

Created at: ${run.createdAt}

Market pack: ${project.market}

Goal: ${project.goal}

## 结论

- 状态：${run.status}
- 事件契约：${run.eventDefinitions.length} 个
- 关键词 / 卖点映射：${run.sellingPoints.length} 条
- 内容草稿：${run.drafts.length} 份，其中 ${run.drafts.filter(item => item.status === 'blocked').length} 份被证据阻塞
- 发布任务：${run.publicationTasks.length} 个，全部等待人工确认
- 待复核观察：${run.judgments.filter(item => item.needsReview).length} 条
- 迭代动作：${run.actions.length} 个
- 下一版问题库：v${run.evolution.toVersion}，共 ${run.evolution.queries.length} 条，其中候选 ${run.evolution.queries.filter(item => item.status === 'candidate').length} 条

## 数据埋点契约

${run.eventDefinitions.map(item => `### ${item.id}\n\n- Owner: ${item.owner}\n- Fields: ${item.fields.join(', ')}\n- Purpose: ${item.purpose}`).join('\n\n')}

## 关键词 × 卖点矩阵

| Selling point | Query | Asset | Score | Status | Evidence |
| --- | --- | --- | ---: | --- | --- |
${run.sellingPoints.map(item => `| ${item.id} | ${item.queryId} | ${item.assetId} | ${item.score} | ${item.status} | ${item.evidenceQuote.replace(/\|/g, '\\|')} |`).join('\n')}

## 舆情与回答监控

| Cycle | Observations | Mention | Positive | Negative | Risk tags | Citations |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${run.cycleMetrics.map(item => `| ${item.cycle} | ${item.observations} | ${percent(item.mentionRate)} | ${item.positive} | ${item.negative} | ${item.riskTags} | ${item.citations} |`).join('\n')}

需要人工复核的观察：

${run.judgments.filter(item => item.needsReview).map(item => `- \`${item.observationId}\`：${item.riskTags.join(', ') || 'sentiment needs review'}`).join('\n') || '- 无'}

## 写作与发布计划

${run.drafts.map(draft => `### ${draft.title}\n\n- Query: \`${draft.queryId}\`\n- Platform: ${draft.platform}\n- Status: ${draft.status}\n- Facts: ${draft.factIds.join(', ') || 'None'}\n- Assets: ${draft.assetIds.join(', ') || 'None'}\n\n${draft.markdown}\n\n${draft.warnings.length ? `Warnings: ${draft.warnings.join('；')}` : ''}`).join('\n\n')}

发布检查：

${run.publicationTasks.map(task => `- \`${task.draftId}\` → ${task.channel}（${task.mode}）：${task.checklist.join('；')}`).join('\n') || '- 本轮没有可发布草稿。'}

## 复盘与迭代动作

${run.actions.map(action => `### ${action.priority} · ${action.title}\n\n- Type: ${action.type}\n- Rationale: ${action.rationale}\n- Evidence: ${action.evidenceIds.join(', ')}\n- Acceptance: ${action.acceptance}`).join('\n\n')}

## 自进化提案

${run.evolution.reason}

内容方向：

${run.evolution.contentDirections.map(item => `- ${item}`).join('\n')}

下一版问题：

| ID | Query | Intent | Platform | Priority | Status | Origin |
| --- | --- | --- | --- | --- | --- | --- |
${run.evolution.queries.map(item => `| ${item.id} | ${item.text} | ${item.intent} | ${item.platform} | ${item.priority} | ${item.status} | ${item.origin} |`).join('\n')}

Guardrails:

${run.evolution.guardrails.map(item => `- ${item}`).join('\n')}

## 执行轨迹

${run.steps.map(step => `### ${step.skill} / ${step.layer} / ${step.status}\n\n${step.summary}\n\nEvidence: ${step.evidenceIds.join(', ') || 'None'}`).join('\n\n')}

## 限制

${run.limitations.map(item => `- ${item}`).join('\n')}
`;
}

export function publicExport(run: OpenGeoRun): unknown {
  return {
    schemaVersion: run.schemaVersion,
    id: run.id,
    projectId: run.projectId,
    createdAt: run.createdAt,
    status: run.status,
    eventDefinitions: run.eventDefinitions,
    sellingPoints: run.sellingPoints,
    judgments: run.judgments,
    cycleMetrics: run.cycleMetrics,
    drafts: run.drafts,
    publicationTasks: run.publicationTasks,
    actions: run.actions,
    evolution: run.evolution,
    steps: run.steps,
    limitations: run.limitations,
  };
}

