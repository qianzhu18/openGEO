import type { AgentRun } from './types.js';
import type { DiagnosticAnalysis } from './analytics.js';

export type BusinessOwner = 'marketing' | 'product' | 'technical' | 'sales' | 'unknown';
export type BusinessConfidence = 'high' | 'medium' | 'low';
export type BusinessQuestionKind = 'natural' | 'branded_fact' | 'candidate_comparison' | 'unknown';
export interface BusinessOpportunity {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  audience: string;
  decisionStage: 'discovery' | 'shortlist' | 'validation' | 'purchase';
  questionKind: BusinessQuestionKind;
  businessQuestion: string;
  decisionCriteria: string[];
  brandRole: 'recommended' | 'mentioned' | 'partial_recall' | 'absent' | 'unknown';
  currentSignal: string;
  businessImplication: string;
  recommendedAction: string;
  deliverable: string;
  owner: BusinessOwner;
  acceptance: string;
  confidence: BusinessConfidence;
  queryIds: string[];
  sampleIds: string[];
  claimIds: string[];
  evidence: string[];
  evidenceQuotes: { sampleId: string; quote: string }[];
}
export interface BusinessScenario {
  queryId: string;
  question: string;
  questionKind: BusinessQuestionKind;
  audience: string;
  decisionStage: BusinessOpportunity['decisionStage'];
  businessTask: string;
  decisionCriteria: string[];
  productArea: string;
  valid: number;
  planned: number;
  mentioned: number;
  status: 'observed' | 'partial' | 'unknown';
  opportunityId?: string;
}
export interface BusinessDiagnosis {
  version: 'opengeo-business/v1';
  context: { audiences: string[]; priorityProducts: string[]; goals: string[]; conversionAction: string | null; complete: boolean };
  executiveSummary: { headline: string; situation: string; impact: string; nextAction: string };
  scenarios: BusinessScenario[];
  opportunities: BusinessOpportunity[];
  limitations: string[];
}
const has = (text: string, words: string[]) => words.some(word => text.toLowerCase().includes(word.toLowerCase()));
const unique = <T>(items: T[]) => [...new Set(items)];
// Capitalized lists can be products, regions or criteria. They only signal an
// ambiguous comparison unless saved context confirms candidate names.
const namedCandidate = '[A-Z][A-Za-z0-9.+-]*(?:\\s+(?:[A-Z][A-Za-z0-9.+-]*|[0-9][A-Za-z0-9.+-]*))*';
const namedCandidatePair = new RegExp(`(?<![A-Za-z0-9])${namedCandidate}\\s*(?:、|，|,|\\band\\b|\\bversus\\b|\\bvs\\.?|和|与)\\s*${namedCandidate}(?![A-Za-z0-9])`);
const listsComparisonCandidates = (text: string) => {
  const candidates = text.replace(/\b(?:ROS(?:\s*\d(?:\.\d+)*)?|SDK|APIs?|SLAs?|USB|CAN|CPU|GPU|RAM|ROM|HTTP|HTTPS|TCP|IP|SLAM|LiDAR|GPS|GNSS|Wi-?Fi|Ethernet|BLE|VLA|AI|ML|OSS|ROI|TCO)\b/gi, 'criterion');
  return /比较|对比|\bcompar(?:e|ing|ison)\b|\bversus\b|\bvs\.?\s/i.test(text) && namedCandidatePair.test(candidates);
};

/** Deterministic content hypotheses; no automatic factual-error or sales-impact verdicts. */
export function diagnoseBusiness(run: AgentRun, analysis: DiagnosticAnalysis): BusinessDiagnosis {
  const project = run.projectSnapshot;
  const en = project.market === 'international';
  const t = (zh: string, english: string) => en ? english : zh;
  const robotics = has(`${project.industry} ${project.description} ${project.domain}`, ['机器人', 'robot', 'agilex']);
  const context = {
    audiences: project.businessContext?.audiences || [], priorityProducts: project.businessContext?.priorityProducts || [],
    goals: project.businessContext?.goals || [], conversionAction: project.businessContext?.conversionAction || null,
    complete: Boolean(project.businessContext?.audiences?.length && project.businessContext?.goals?.length),
  };
  const classify = (text: string, branded: boolean, intent = ''): BusinessQuestionKind => {
    if (has(intent, ['candidate_comparison']) || has(text, ['给定候选', 'given candidates'])) return 'candidate_comparison';
    if (branded) return 'branded_fact';
    if (listsComparisonCandidates(text)) {
      const known = [...unique(context.priorityProducts).map(name => [name]), [project.brand, ...project.aliases], ...(project.competitors || []).map(item => [item.name, ...item.aliases])];
      const named = known.filter(names => names.some(name => name.trim().length >= 3 && text.toLowerCase().includes(name.toLowerCase())));
      return named.length >= 2 ? 'candidate_comparison' : 'unknown';
    }
    return 'natural';
  };
  const areaFor = (text: string) => {
    if (!robotics) return context.priorityProducts[0] || t('产品与服务', 'Products and services');
    if (has(text, ['limo'])) return 'LIMO / ' + t('移动操作', 'mobile manipulation');
    if (has(text, ['具身', '数据采集', '模仿学习', 'vla', 'embodied', 'imitation', 'piper', 'cobot'])) return t('具身智能与数据采集', 'Embodied AI and data collection');
    if (has(text, ['课程', '教学', 'course', 'education kit'])) return t('科研教学套件', 'Research and education kits');
    if (has(text, ['底盘', 'slam', '导航', '巡检', '配送', 'mobile base', 'navigation'])) return t('移动底盘与导航', 'Mobile bases and navigation');
    return t('公司与开发生态', 'Company and developer ecosystem');
  };
  const audienceFor = (text: string) => {
    if (robotics && has(text, ['具身', '模仿学习', '数据采集', 'vla', 'imitation', 'embodied'])) return t('具身智能研发与数据团队', 'Embodied AI research and data teams');
    if (robotics && has(text, ['高校', '大学', '实验室', '科研', '课程', 'university', 'education', 'lab'])) return t('高校实验室与科研教育团队', 'University labs and education teams');
    if (robotics && has(text, ['巡检', '配送', '养老', '矿场', 'inspection', 'delivery'])) return t('行业项目方与集成商', 'Industry project teams and integrators');
    return context.audiences[0] || t('正在评估品牌的潜在客户', 'Prospective customers evaluating the brand');
  };
  const criteriaFor = (text: string) => {
    const choices: [string, string[]][] = [
      [t('软件与版本证据', 'Software and version evidence'), ['ros', 'sdk', 'github', '软件', '版本']],
      [t('任务适配与限制', 'Task fit and limitations'), ['任务', '场景', '教学', 'task', 'course']],
      [t('配置与集成范围', 'Configuration and integration scope'), ['配置', '机械臂', '底盘', 'hardware', 'integration']],
      [t('数据与接口', 'Data and interfaces'), ['数据', '同步', '遥操作', 'data', 'sync']],
      [t('采购与支持', 'Purchase and support'), ['价格', '预算', '维护', '采购', '支持', 'budget', 'support']],
    ];
    const labels = choices.filter(([, words]) => has(text, words)).map(([label]) => label);
    return labels.length ? labels : [t('适用条件与可核验证据', 'Fit criteria and verifiable evidence')];
  };
  const scenarios: BusinessScenario[] = analysis.questions.map(question => {
    const query = run.queries.find(q => q.id === question.queryId) || project.queries.find(q => q.id === question.queryId);
    const questionKind = classify(question.question, query?.branded === true, query?.intent);
    const decisionStage: BusinessOpportunity['decisionStage'] = questionKind === 'branded_fact' ? 'validation' : questionKind === 'candidate_comparison' || has(question.question, ['选型', '选择', '比较', 'which', 'compare', 'choose']) ? 'shortlist' : 'discovery';
    const productArea = areaFor(question.question);
    return { queryId: question.queryId, question: question.question, valid: question.valid, planned: question.planned, mentioned: question.mentioned, questionKind, audience: audienceFor(question.question), decisionStage,
      businessTask: questionKind === 'unknown' ? t('先确认题目是否已给定候选，暂不解释自然发现', 'Confirm whether candidates were supplied before interpreting natural discovery') : questionKind === 'branded_fact' ? t(`核验${productArea}的事实与采购边界`, `Verify facts and purchase scope for ${productArea}`) : t(`为${productArea}任务评估候选方案`, `Evaluate options for ${productArea}`),
      decisionCriteria: criteriaFor(question.question), productArea,
      status: question.valid === 0 ? 'unknown' : question.valid < question.planned ? 'partial' : 'observed' };
  });
  const opportunities: BusinessOpportunity[] = [];
  if (!analysis.quality.contaminated) for (const scenario of scenarios) {
    if (!scenario.valid || scenario.questionKind === 'unknown') continue;
    const rows = analysis.rows.filter(row => row.queryId === scenario.queryId && row.question === scenario.question && row.status === 'valid');
    const fact = scenario.questionKind === 'branded_fact';
    const candidate = scenario.questionKind === 'candidate_comparison';
    // Natural queries with a mention in every observed answer need no generic action card.
    if (!fact && !candidate && scenario.mentioned === scenario.valid) continue;
    const complete = analysis.quality.planBasis === 'frozen-units' && scenario.valid === scenario.planned;
    const brandRole: BusinessOpportunity['brandRole'] = scenario.mentioned === 0 ? complete ? 'absent' : 'unknown' : scenario.mentioned < scenario.valid ? 'partial_recall' : 'mentioned';
    const groups = new Map<string, { valid: number; mentioned: number }>();
    for (const row of rows) {
      const key = `${row.platform} / ${row.model} / ${row.channel} / ${row.protocolId} / ${row.runGroup}`;
      const group = groups.get(key) || { valid: 0, mentioned: 0 };
      group.valid++; if (row.mentioned) group.mentioned++; groups.set(key, group);
    }
    const signal = [...groups].map(([key, group]) => `${key}: ${group.mentioned}/${group.valid}`).join('; ');
    const title = fact ? t(`${scenario.productArea}：核对采购问题的回答依据`, `${scenario.productArea}: review evidence for purchase answers`)
      : candidate ? t(`${scenario.productArea}：核对给定候选的归属与选择理由`, `${scenario.productArea}: review attribution and selection reasons for named candidates`)
      : t(`${scenario.productArea}：验证自然选型中的品牌进入`, `${scenario.productArea}: test brand inclusion in natural discovery`);
    const action = fact ? t('逐项对照官方来源，核验型号、配置、版本与支持边界；只有确认差异后才修正文案。点名或提及本身不证明事实错误。', 'Compare answers with official sources for model, configuration, version and support scope. Correct copy only after confirming a discrepancy; a branded query alone does not establish an error.')
      : candidate ? t('检查回答是否将给定产品关联到品牌，选择理由是否有依据；更新产品归属和任务比较信息。产品已在题目出现，不能计为自然发现。', 'Review product-to-brand attribution and evidence for selection reasons. Update ownership and task comparisons. Products named in the prompt do not establish natural discovery.')
      : t('盘点已有产品页、方案页和文档，针对本题补充任务、选择条件、限制与验证步骤。先验证内容假设，不将回答差异判为官网缺页。', 'Review existing product, solution and documentation pages. Address this task with selection criteria, limitations and validation steps. Test the content hypothesis before concluding a page is missing.');
    const deliverable = scenario.productArea.startsWith('LIMO') && fact ? 'LIMO PRO / LIMO COBOT ' + t('采购分流核验表', 'purchase routing review')
      : `${scenario.productArea} · ${fact ? t('事实核验表', 'fact review') : candidate ? t('候选比较制作单', 'candidate comparison brief') : t('任务型内容制作单', 'task content brief')}`;
    opportunities.push({
      id: `business-${scenario.queryId}`, priority: 'P2', title, audience: scenario.audience, decisionStage: scenario.decisionStage,
      questionKind: scenario.questionKind, businessQuestion: scenario.question, decisionCriteria: scenario.decisionCriteria, brandRole,
      currentSignal: t(`本题有效 ${scenario.valid}/${scenario.planned}；各条件内品牌提及：${signal}。`, `${scenario.valid}/${scenario.planned} valid answers. Brand mentions within each condition: ${signal}. `) + (!complete ? t('原始计划未知或覆盖不全，不能判断缺失入口。', 'The original plan is unknown or incomplete; missing entries cannot be assessed.') : ''),
      businessImplication: fact ? t('这是接近采购核验的问题，值得检查答案能否帮助用户分清产品与支持范围。当前尚未判定任何产品事实错误。', 'This question concerns purchase validation. Check whether answers clarify product and support scope. No factual error has yet been established.')
        : candidate ? t('候选已经给定，本题用于观察品牌归属和比较依据；不用于推断自然曝光或新增商机。', 'Candidates were supplied. Use this answer to review attribution and comparison evidence, not organic exposure or new leads.')
        : t('本轮可观察到候选进入情况，但内容原因、需求规模和销售影响未知。可据此设计一次任务内容实验。', 'Candidate inclusion is observable in this run. Content causes, demand and sales impact remain unknown. This can inform a task content experiment.'),
      recommendedAction: action, deliverable, owner: fact ? 'technical' : 'marketing',
      acceptance: t('完成来源核验与人工审核，记录实际发布 URL、时间和版本；用原题、同入口和协议复测品牌归属、选择理由与事实准确性。业务效果另接网站和询盘数据。', 'Verify sources, obtain editorial review, and record published URL, time and version. Repeat the original question with the same entry and protocol; review attribution, selection reasons and factual accuracy. Website and inquiry data are needed for business outcomes.'),
      confidence: 'low', queryIds: [scenario.queryId], sampleIds: unique(rows.flatMap(row => row.sampleId ? [row.sampleId] : [])), claimIds: [],
      evidence: unique(rows.flatMap(row => row.sampleId ? [row.sampleId] : [])),
      evidenceQuotes: rows.filter(row => row.sampleId && row.quote).slice(0, 2).map(row => ({ sampleId: row.sampleId!, quote: row.quote!.replace(/\s+/g, ' ').trim().slice(0, 240) })),
    });
  }
  // Keep question kinds and original questions separate; do not pool their denominators.
  const visible = opportunities;
  for (const scenario of scenarios) scenario.opportunityId = visible.find(item => item.queryIds.includes(scenario.queryId))?.id;
  const top = visible[0];
  return { version: 'opengeo-business/v1', context, scenarios, opportunities: visible, executiveSummary: {
    headline: top?.title || t('本轮尚未形成可执行的业务机会', 'No actionable business opportunity established'),
    situation: top ? `${top.audience} · ${top.businessQuestion} ${top.currentSignal}` : t('有效证据不足、样本为 QA 或现有观察未触发新的内容假设。', 'Evidence is insufficient, the run is QA-only, or observations did not trigger a new content hypothesis.'),
    impact: top?.businessImplication || t('不从缺失或失败记录推断品牌问题。', 'Missing and failed records do not establish a brand problem.'),
    nextAction: top?.recommendedAction || t('先确认目标受众、业务任务与证据范围。', 'Confirm the audience, business task and evidence scope first.'),
  }, limitations: [
    t('机会卡是规则生成的待审假设，不是事实错误判定或业务优先级；P2 按题目顺序列示，需人工结合目标排序。', 'Cards are rule-generated hypotheses, not factual-error verdicts or business priorities. P2 cards follow question order and require goal-based editorial prioritization.'),
    t('提及不等于推荐、商机或成交；没有发布和固定协议后测时不声称 GEO 效果。', 'Mention is not recommendation, a lead or a sale. No GEO outcome is claimed without publication and comparable follow-up measurement.'),
    t('自然发现、给定候选比较和点名核验分开解释；完整采集也不证明业务推断可信。', 'Natural discovery, supplied candidates and branded validation are interpreted separately. Complete collection does not validate business inferences.'),
    ...(scenarios.some(scenario => scenario.questionKind === 'unknown') ? [t('部分比较题的候选身份未确认，题型保持未知，不生成自然发现或产品归属动作。', 'Candidate identity is unconfirmed for some comparisons. Their question kind remains unknown; no natural-discovery or product-attribution action is generated.')] : []),
    ...(analysis.quality.contaminated ? [t('本轮问题受分组标题污染，仅作 QA，不生成业务动作。', 'Question headings contaminate this QA-only run; no business actions are generated.')] : []),
    ...(context.complete ? [] : [t('项目没有完整填写目标受众和业务目标；未确认业务排序。', 'Target audiences and business goals are incomplete; business priorities are unconfirmed.')]),
  ] };
}
