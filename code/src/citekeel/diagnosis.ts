import { createHash } from 'node:crypto';
import { analyzeRun, type AnalyticsFilter } from './analytics.js';
import type { Action, AgentRun } from './types.js';

/** Deterministic editorial projection. Never changes measurements or calls a model. */
export function diagnoseRun(run: AgentRun, filter: AnalyticsFilter = {}) {
  const a = analyzeRun(run, filter), en = run.projectSnapshot.market === 'international';
  const t = (zh: string, english: string) => en ? english : zh;
  const valid = a.rows.filter(r => r.status === 'valid');
  const inScope = new Set(valid.flatMap(r => r.sampleId ? [r.sampleId] : []));
  const questions = new Set(valid.map(r => r.queryId));
  const findings = a.summary.cohortFindings.filter(f => f.mention.denominator > 0).map(f => ({
    id: f.key, title: `${f.model} · ${f.branded ? t('点名核验', 'Branded recall') : t('非点名标签', 'Unbranded label')} · ${f.intent}`,
    detail: t(`品牌在本组 ${f.mention.numerator}/${f.mention.denominator} 条有效回答中出现。${f.mention.denominator < 5 ? '样本很少，仅作线索。' : '只描述这组成功取得的回答。'}`, `Brand mentioned in ${f.mention.numerator}/${f.mention.denominator} valid answers in this cohort. ${f.mention.denominator < 5 ? 'Small sample; treat as a lead.' : 'Describes successfully obtained answers only.'}`),
    implication: f.branded ? t('点名回答反映品牌信息召回，不能据此判断自然选型推荐表现。', 'Branded answers describe recall, not unaided vendor discovery.') : t('逐题检查是否涉及供应商发现；先核对题型，再决定要补充的选型依据。', 'Review the actual question intent before choosing a vendor-discovery content task.'),
    sampleId: f.sampleId, protocolId: f.protocolId,
  }));
  const saved = run.actions.filter(action => action.kind !== 'measurement' &&
    (action.sampleIds.some(id => inScope.has(id)) || (!action.sampleIds.length && action.contentType && action.queryIds.some(id => questions.has(id)))));
  const covered = new Set(saved.flatMap(action => action.queryIds));
  const derived: Action[] = [];
  for (const q of a.questions.filter(q => q.valid > 0 && !covered.has(q.queryId)).slice(0, 8)) {
    const rows = valid.filter(r => r.queryId === q.queryId && r.question === q.question);
    const id = `diagnostic-${createHash('sha256').update(JSON.stringify([q.queryId,q.question])).digest('hex').slice(0,16)}`;
    const branded = rows.every(r => r.branded);
    const evidence = rows.flatMap(r => r.sampleId ? [r.sampleId] : []);
    derived.push({ id, kind: 'content', priority: q.mentioned === 0 ? 'P1' : 'P2',
      title: branded ? t('制作品牌问题的核验 FAQ', 'Prepare a brand-verification FAQ') : t('制作选型问题的决策简报', 'Prepare a decision brief for this question'),
      rationale: t(`本题取得 ${q.valid}/${q.planned} 条有效回答，其中 ${q.mentioned} 条提及品牌。${q.valid < q.planned ? '仍有缺失，不能判定缺失入口未提及。' : ''}建议逐条核对回答中的决策依据，再制作对应资料。未验证官网是否已有同类内容。`, `${q.valid}/${q.planned} valid answers; ${q.mentioned} mention the brand. ${q.valid < q.planned ? 'Missing answers remain unknown. ' : ''}Review decision criteria in these answers before preparing the brief. Existing website content has not been audited.`),
      queryIds: [q.queryId], sampleIds: [...new Set(evidence)], claimIds: [], status: 'proposed',
      contentType: branded ? 'faq' : 'selection_guide', contentStatus: 'needs-review', trigger: q.question,
      evidenceGap: t('回答是观测证据，不是品牌官方事实；参数、适用范围与案例需官网或人工资料确认。', 'Observed answers are not official brand facts. Verify specifications, scope and cases against reviewed sources.'),
      outline: [t('读者任务与适用场景', 'Reader task and scope'), t('按回答原文归纳决策条件', 'Decision criteria traced to observed answers'), t('已确认事实、型号边界与官方出处', 'Reviewed facts, model boundaries and official sources'), t('未知项与采购前核验清单', 'Unknowns and pre-purchase checks')],
      acceptance: t('人工确认事实与出处；覆盖关联问题；登记实际发布后，用相同问题、入口与协议复测。当前不承诺曝光提升。', 'Review facts and sources; address the linked question. After actual publication, repeat the same question, entry point and protocol. No uplift is established.'),
    });
  }
  const actions = [...saved, ...derived].map(action => ({...action, status: run.actionStates?.[action.id] || action.status}));
  const conclusion = !a.quality.valid ? t('本轮没有有效回答，暂不能形成品牌诊断。先恢复采集，再分析品牌表现。', 'No valid answers. Restore collection before drawing brand conclusions.') : a.quality.contaminated ? t('本轮存在问题污染，仅作工程核查，不能作为正式品牌基线。', 'Question contamination makes this a QA run, not a formal brand baseline.') : a.quality.valid < a.quality.planned ? t(`已覆盖 ${a.summary.coveredQuestions}/${a.summary.questionCount} 个问题，但仅 ${a.quality.valid}/${a.quality.planned} 个测量单元有效。可以形成分组线索，尚不足以代表所有计划平台的品牌表现。`, `${a.summary.coveredQuestions}/${a.summary.questionCount} questions have evidence, but only ${a.quality.valid}/${a.quality.planned} measurement units are valid. Cohort findings are exploratory and do not represent every planned platform.`) : t('本轮计划内回答已取得，可逐组诊断品牌召回与选型表现；仍只代表本题集和本次协议。', 'Planned answers are available. Review recall and discovery by cohort; conclusions remain limited to this question set and protocol.');
  return { version: 'opengeo-diagnosis/v1', conclusion, findings, actions: a.quality.contaminated ? [] : actions,
    nextStep: a.quality.contaminated ? t('净化并重新确认问题集，再创建独立测试。', 'Confirm a clean question set and create a separate run.') : a.quality.valid ? t('先审核下面的回答线索与品牌事实，选择一项资料任务；补齐覆盖后，用相同协议建立可比较基线。', 'Review answer evidence and brand facts, then select one content brief. Complete coverage to establish a comparable baseline.') : t('检查执行记录中的失败原因，保留旧批次并显式创建新测试。', 'Inspect failed attempts, preserve this run and explicitly start a new test.') };
}
