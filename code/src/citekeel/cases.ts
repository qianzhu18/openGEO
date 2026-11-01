import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeCitation, bodyLinks } from './analysis.js';
import type { Citation, Project, Query, Sample } from './types.js';

const CREATED = '2026-10-29T00:00:00.000Z';
export function syntheticProject(): Project {
  const questions: [string, string, boolean][] = [
    ['衡川传感是做什么的？', '品牌核验', true], ['衡川传感支持定制吗？', '品牌核验', true],
    ['衡川传感的额定产能是多少？', '品牌核验', true], ['衡川传感有 ISO 9001 证书吗？', '信任核验', true],
    ['工业温度传感器供应商怎么选？', '供应商发现', false], ['小批量定制温度探头找哪类厂商？', '供应商发现', false],
    ['车间温度监测有哪些供应商可以考虑？', '供应商发现', false], ['工业传感器采购需要比较什么？', '供应商发现', false],
    ['温度探头供应商的交付能力如何核验？', '供应商发现', false], ['中小工厂怎么选择温度监测设备？', '供应商发现', false],
    ['高温车间选择温度探头要确认什么？', '产品匹配', false], ['精度要求正负 0.5 度怎么选型？', '产品匹配', false],
    ['温度传感器可用于 300 度环境吗？', '产品匹配', false], ['需要特殊线长的温度探头怎么办？', '产品匹配', false],
    ['怎样核验供应商检测报告？', '信任核验', false], ['没有质量证书的传感器供应商如何评估？', '信任核验', false],
    ['打样到量产的采购流程怎么安排？', '采购决策', false], ['额定产能和实际出货量有何区别？', '采购决策', false],
    ['批量采购温度探头需要哪些验收材料？', '采购决策', false], ['供应商的参数和介绍冲突时怎么办？', '采购决策', false],
  ];
  const queries = questions.map(([text, intent, branded], i): Query => ({ id: `q${String(i + 1).padStart(2, '0')}`, text, intent, branded, origin: '合成案例预设，非搜索量数据' }));
  const answers = [
    '衡川传感提供工业温度探头，适用于车间温度监测。采购前应核对温度范围、精度和安装方式。',
    '衡川传感支持按安装方式和线长定制，可考虑先申请样件，再确认量产参数。',
    '衡川传感的摘要写月产能 900 件。该数字可能与实际出货口径混淆，建议确认规格书。',
    '目前资料没有可核验的 ISO 9001 证书，不能确认衡川传感已经取得该认证。',
    '选供应商时，先核对测温范围、精度、接口和环境要求，再比较批次一致性与交付流程。',
    '对于特殊线长的小批量探头，可以考虑衡川传感。先确认图纸、样件和检验条件，再决定批量订单。',
    '建议先建立统一参数表，再对照现场温度和接线方式选择设备。不要只看品牌宣传。',
    '工业传感器采购应比较精度、环境适用性、校准方式、验收条件和售后边界。',
    '交付能力需要结合设备能力、当前订单、交期和检验流程核验。公开介绍不足以确认即时可供货量。',
    '中小工厂可先做小范围试装，验证信号稳定性与安装适配，再扩大部署。',
    '资料显示衡川传感的量程为 -40 至 250℃，适合在这一范围内进一步评估，超过量程需要另行确认。',
    '精度要求为 ±0.5℃ 时，应确认该指标的测试条件和整个测量链路误差，不能只看探头标称值。',
    '不推荐在 300℃ 环境使用衡川传感现有型号，其公开测试量程上限为 250℃。',
    '需要特殊线长时，应确认材料、信号衰减和接头方式；衡川传感支持线长定制，可考虑送样验证。',
    '检测报告应检查报告编号、检测对象、条件、日期和出具机构。普通网页链接不等于报告已经核验。https://docs.sensor-demo.example/reports',
    '缺少证书时，先记录证据缺口，并要求提供可核对的资质文件；不要把口头陈述写成已认证。',
    '从需求表、图纸、打样、测试到量产分步确认，每一步约定验收方式与变更记录。https://docs.sensor-demo.example/process',
    '额定产能指特定条件下的生产能力；实际出货是某个周期的交付结果，二者不能互相替代。',
    '',
    '{"brand":"衡川传感","judgment":',
  ];
  const samples = queries.map((q, i): Sample => {
    const citations = bodyLinks(answers[i]);
    let rawResponse: unknown = { answer: answers[i] };
    if ([1, 5, 10].includes(i)) {
      const url = 'https://docs.sensor-demo.example/specification';
      rawResponse = { answer: answers[i], annotations: [{ url }] };
      citations.push({ url, kind: 'provider_citation', source: 'provider_annotation', payloadPath: 'annotations[0].url', integrity: 'matched' });
    }
    if (i === 8) citations.push({ url: 'https://docs.sensor-demo.example/capacity', kind: 'search_result', source: 'provider_search_result', integrity: 'unverified' });
    return { id: `synthetic-${q.id}`, queryId: q.id, question: q.text, intent: q.intent, branded: q.branded,
      origin: 'synthetic', model: '合成回答 fixture/v1', observedAt: CREATED, runGroup: 'synthetic-baseline', protocolId: 'synthetic/v1',
      collectionStatus: i === 18 ? 'failed' : 'completed', analysisStatus: i >= 18 ? 'failed' : 'completed',
      answer: answers[i], rawResponse, citations, ...(i >= 18 ? { error: i === 18 ? '示例：请求超时' : '示例：结构化回答截断，解析失败' } : {}) };
  });
  return { id: 'sensor', name: '衡川传感 · 制造业样例', brand: '衡川传感', aliases: ['Hengchuan Sensors'],
    domain: 'sensor-demo.example', industry: '工业温度传感器', origin: 'synthetic',
    description: '全新编写的虚构企业，用于检验 B2B 选型流程，不代表任何真实客户或优化结果。',
    goal: '梳理供应商选型中的品牌事实与信任缺口，形成能追溯到证据的改进任务。',
    sources: [
      { id: 's-spec', title: '合成规格书 v1', text: '工业温度探头；-40 至 250℃；标称精度 ±0.5℃；额定产能每月 2400 件；支持安装方式与线长定制。' },
      { id: 's-shipping', title: '合成出货记录', text: '最近一个月实际出货 900 件。该值描述实际交付，不描述额定产能。' },
      { id: 's-summary', title: '含错误口径的合成摘要', text: '摘要写月产能 900 件，与规格书的额定产能冲突。尚未提供 ISO 9001 证书。' },
    ], claims: [
      { id: 'c-product', label: '主营产品', value: '工业温度探头', status: 'confirmed', sourceIds: ['s-spec'] },
      { id: 'c-range', label: '测试量程', value: '-40 至 250℃', status: 'confirmed', sourceIds: ['s-spec'] },
      { id: 'c-accuracy', label: '标称精度', value: '±0.5℃，具体应用需验证测试条件', status: 'confirmed', sourceIds: ['s-spec'] },
      { id: 'c-custom', label: '定制范围', value: '支持安装方式与线长定制', status: 'confirmed', sourceIds: ['s-spec'] },
      { id: 'c-capacity', label: '额定月产能', value: '2400 件 / 900 件，口径冲突', status: 'conflict', sourceIds: ['s-spec', 's-summary'], alternatives: [{ value: '每月 2400 件额定产能', sourceId: 's-spec' }, { value: '每月 900 件产能（摘要口径）', sourceId: 's-summary' }] },
      { id: 'c-shipping', label: '最近月实际出货', value: '900 件，不能替代额定产能', status: 'confirmed', sourceIds: ['s-shipping'] },
      { id: 'c-certificate', label: 'ISO 9001 资质', value: '尚未提供证书，不对外宣称已认证', status: 'unconfirmed', sourceIds: ['s-summary'] },
    ], queries, queryVersion: 1, samples, createdAt: CREATED, updatedAt: CREATED };
}

export function archiveProject(data: any, id: string): Project {
  const brand = id === 'posthog' ? 'PostHog' : '牛逼Star';
  const queries: Query[] = [];
  const samples: Sample[] = [];
  for (const entry of data.state.measurementRuns) {
    for (const row of entry.probes) {
      const probe = row.probe;
      const model = entry.modelRuns.find((m: any) => m.id === probe.modelRunId)?.modelSnapshot;
      const queryId = probe.keywordId || `domain-${probe.subjectDomain}`;
      const question = probe.kind === 'target_domain' ? `识别域名 ${probe.subjectDomain}` : String(probe.keyword || probe.subjectDomain);
      const branded = probe.kind === 'target_domain';
      if (!queries.some(q => q.id === queryId)) queries.push({ id: queryId, text: question, intent: branded ? '域名识别' : '中性关键词发现', branded, origin: 'niubigeo 历史测量协议' });
      const attempt = row.attempts.find((a: any) => a.id === probe.firstAttemptId) || row.attempts[0];
      if (!attempt) continue;
      const citations = [...(row.evidence?.providerCitations || []), ...(row.evidence?.answerMentionedUrls || []).map((c: any) => ({ ...c, source: 'answer_text_url' }))]
        .filter((c: any) => !c.attemptId || c.attemptId === attempt.id)
        .map((c: any) => normalizeCitation(c, attempt.rawProviderResponse)).filter((c: Citation | null): c is Citation => c !== null);
      samples.push({ id: probe.id, queryId, question, intent: branded ? '域名识别' : '中性关键词发现', branded, origin: 'archive',
        model: `${model?.modelId || 'unknown'} · ${model?.webSearchMode || 'unknown'}`, observedAt: attempt.createdAt,
        runGroup: entry.run.id, protocolId: probe.protocol?.id || 'niubigeo/archive', collectionStatus: attempt.rawAnswer ? 'completed' : 'failed',
        analysisStatus: attempt.status === 'completed' ? 'completed' : 'failed', answer: attempt.rawAnswer || '', rawResponse: attempt.rawProviderResponse,
        citations, upstreamAttemptId: attempt.id, search: attempt.providerSearch,
        ...(attempt.errorCode ? { error: attempt.errorCode } : {}), ...(typeof attempt.costUsd === 'number' ? { costUsd: attempt.costUsd } : {}) });
    }
  }
  return { id, name: `${brand} · 公开归档`, brand, aliases: id === 'posthog' ? ['Posthog'] : ['NiubiStar', '牛逼 Star'], domain: data.domain,
    industry: id === 'posthog' ? '产品分析与实验平台' : '开发者工具', origin: 'archive',
    description: `niubigeo ${data.caseId} 的公开历史测量，原始时间为 2026-09-08。`,
    goal: '回放真实历史回答，区分原文、解析失败、引用与正文链接，形成可检查的下一步任务。',
    sources: [{ id: 's-archive', title: `niubigeo ${data.caseId} 公开归档`, url: `https://github.com/Albert-Weasker/niubigeo/blob/dd51eedc8e400006755639c0cb332a7fa1a71420/examples/cases/${data.caseId}/public-evidence.json`, text: '来源为上游公开测量，不用于证明当前产品事实。' }],
    claims: [{ id: 'c-domain', label: '观察对象', value: data.domain, status: 'confirmed', sourceIds: ['s-archive'] }],
    queries, queryVersion: 1, samples, createdAt: CREATED, updatedAt: CREATED };
}

export async function loadCases(root = process.cwd()): Promise<Project[]> {
  const [r01, r04] = await Promise.all(['R01', 'R04'].map(async id => JSON.parse(await readFile(join(root, 'examples/upstream', id, 'public-evidence.json'), 'utf8'))));
  let live: Project | null = null;
  try { live = JSON.parse(await readFile(join(root, 'examples/live-posthog/project.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return [syntheticProject(), archiveProject(r04, 'posthog'), archiveProject(r01, 'niubistar'), ...(live ? [live] : [])];
}
