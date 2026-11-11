import type { Project } from '../types.js';
import { bodyLinks } from '../analysis.js';
import { aggregateGeoRates, formatGeoRate, GEO_RATE_FORMULAS, type GeoObservation } from '../geo-rates.js';
import { redactExportText } from '../report.js';
import type { CampaignAsset, CampaignRun, CampaignSpec } from './model.js';

const cell = (value: unknown) => String(value ?? '待核验').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
const table = (headers: string[], rows: unknown[][]) => [headers, headers.map(() => '---'), ...rows].map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');
const csv = (rows: unknown[][]) => '\uFEFF' + rows.map(row => row.map(value => {
  let text = String(value ?? '');
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}).join(',')).join('\r\n') + '\r\n';

export function renderCampaign(spec: CampaignSpec, run: CampaignRun): Record<string, string> {
  const source = (id: string) => spec.sources.find(row => row.id === id)!;
  const audience = (id: string) => spec.audiences.find(row => row.id === id)!;
  const question = (id: string) => spec.questions.find(row => row.id === id)!;
  const claimReady = (id: string) => spec.claims.find(row => row.id === id)?.review === 'source-checked' && run.claims.find(row => row.id === id)?.verifiedQuote;
  const assetReady = (asset: CampaignAsset) => asset.sections.length > 0 && asset.sections.every(section => section.claimIds.every(claimReady));
  const assetPath = (asset: CampaignAsset) => `内容草稿/${asset.id}.md`;
  const citations = (ids: string[]) => [...new Set(ids.map(id => spec.claims.find(row => row.id === id)!.sourceId))].map(id => `[${source(id).title}](${source(id).url})`).join('、');
  const sourceState = run.readiness.sourceAudit === 'ready' ? '指定来源已归档；部分为读取片段，未做全页审计' : '公开来源部分完成，失败项单列';
  const baselineState = run.readiness.aiBaseline === 'not-collected' ? '尚未取得有效 AI 回答；提及与引用情况未知' : run.readiness.aiBaseline === 'partial' ? '已有部分有效回答，缺失项保持未知' : '本轮问题与平台已有有效回答';
  const findings = (basis: 'public-source' | 'ai-answer' | 'hypothesis') => spec.findings.filter(finding => finding.basis === basis).map(finding => `### ${finding.title}\n\n${finding.observation}\n\n**对品牌的意义：**${finding.implication}\n\n**建议动作：**${finding.action}\n\n依据：${citations(finding.claimIds) || '下列已归档回答'}${finding.attemptIds.length ? `；${finding.attemptIds.map(id => {
    const row = run.attempts.find(row => row.attempt.id === id)!;
    return `[${row.attempt.protocol.platform} 回答](${row.attempt.evidence!.answer})`;
  }).join('、')}` : ''}。`).join('\n\n');
  const drafts: Record<string, string> = {};
  for (const asset of spec.assets) {
    const ready = assetReady(asset);
    drafts[assetPath(asset)] = `# ${asset.title}\n\n${asset.language === 'en'
      ? `> Independent editorial draft based on public sources. Prepared for review; not issued or approved by ${spec.aliases[0] || spec.brand}. Product statements are attributed to their sources and have not been independently tested.`
      : '> 独立研究草稿，尚未获品牌方或技术负责人审核。产品资料为公开来源陈述，未经过本项目独立实测。'}\n\n${ready
        ? asset.sections.map(section => `## ${section.heading}\n\n${section.text}\n\n${section.claimIds.length ? (asset.language === 'en' ? 'Source: ' : '来源：') + citations(section.claimIds) + '。' : ''}`).join('\n\n')
        : '正文待核对引用事实后生成。本轮只交付制作单，不能把待确认的参数或能力写成确定事实。'}\n\n${asset.linksTo.length ? `## ${asset.language === 'en' ? 'Related reading' : '相关内容'}\n\n${asset.linksTo.map(id => { const linked = spec.assets.find(row => row.id === id)!; return `- [${linked.title}](${linked.id}.md)`; }).join('\n')}` : ''}\n`;
  }
  const valid = run.attempts.filter(row => row.eligible);
  const rateReport = aggregateGeoRates(run.attempts.map((row): GeoObservation => ({ id: row.attempt.id, questionId: row.attempt.questionId, platform: row.attempt.protocol.platform, model: row.attempt.protocol.model || 'UNKNOWN', channel: row.attempt.protocol.channel, eligible: row.eligible, exclusion: row.exclusion, mentioned: row.mentioned, appearance: row.mentioned, top1: row.top1, top3: row.top3, rank: row.rank })));
  const rateSummary = rateReport.groups.length ? `${Object.values(GEO_RATE_FORMULAS).map(line => `- ${line}`).join('\n')}\n\n${table(['通道', '平台', '模型', '提及率', '出现率', 'Top1 率', 'Top3 率', '排除'], rateReport.groups.map(group => [group.channel, group.platform, group.model, formatGeoRate(group.questionSet.mention, '无分母'), formatGeoRate(group.questionSet.appearance, '无分母'), formatGeoRate(group.questionSet.top1, '无枚举'), formatGeoRate(group.questionSet.top3, '无枚举'), String(group.questionSet.excludedIds.length)]))}\n\n出现率与提及率使用同一分子和分母。上表按通道、平台、模型分开；没有把多个平台加总。` : '没有采样记录，不计算提及率、出现率、Top1 率或 Top3 率。';
  const rankLabel = (row: typeof valid[number]) => row.top1 === null ? '无枚举' : row.top1 ? 'Top1' : row.top3 ? `Top3（第 ${row.rank}）` : row.rank ? `第 ${row.rank}，未进前三` : '未进已枚举名单';
  const answerSources = new Map<string, string[]>();
  for (const row of valid) for (const url of row.visibleUrls) answerSources.set(url, [...(answerSources.get(url) || []), row.attempt.id]);
  const baselineStatus = (task: { questionId: string; platform: string }) => {
    const attempts = run.attempts.filter(row => row.attempt.questionId === task.questionId && row.attempt.protocol?.platform === task.platform);
    const current = attempts.find(row => row.eligible) || attempts.at(-1);
    return current ? current.eligible ? '有效回答' : `排除：${current.exclusion}` : '待采集';
  };
  const sampleTasks = spec.questions.flatMap(q => spec.platforms.map(platform => {
    const attempts = run.attempts.filter(row => row.attempt.questionId === q.id && row.attempt.protocol?.platform === platform);
    const current = attempts.find(row => row.eligible) || attempts.at(-1);
    const priority = spec.baselinePlan.find(task => task.questionId === q.id && task.platform === platform);
    return [`${q.id}-${platform}`, q.id, q.revision, q.text, platform, q.language, q.branded, 'Xue', priority ? '第一批' : '',
      current ? current.eligible ? '有效回答' : `排除：${current.exclusion}` : '待采集', current?.attempt.protocol.model || '', current?.attempt.protocol.region || '',
      current?.attempt.protocol.loginState || '', current?.attempt.protocol.session || '', current?.attempt.capturedAt || '', current?.attempt.evidence?.answer || ''];
  }));
  const toProject: Project = {
    id: spec.id, name: `${spec.brand} · 公开研究`, brand: spec.brand, aliases: spec.aliases, domain: spec.domain,
    industry: '机器人与具身智能', description: spec.objective, origin: 'manual', market: 'international', language: 'en', goal: spec.objective,
    sources: spec.sources.map(row => ({ id: row.id, title: row.title, url: row.url, text: spec.claims.filter(claim => claim.sourceId === row.id && claimReady(claim.id)).map(claim => claim.quote).join('\n') })),
    claims: spec.claims.map(claim => ({ id: claim.id, label: claim.scope, value: claim.statement, status: 'unconfirmed', sourceIds: [claim.sourceId] })),
    queries: spec.questions.map(row => ({ id: row.id, text: row.text, branded: row.branded, intent: row.stage, origin: row.origin, revision: row.revision, language: row.language, status: 'suggested' })),
    queryVersion: spec.round, samples: valid.map(row => ({ id: row.attempt.id, queryId: row.attempt.questionId, question: row.attempt.questionText,
      intent: question(row.attempt.questionId).stage, branded: question(row.attempt.questionId).branded,
      origin: row.attempt.protocol.channel === 'web-ui' ? 'browser' as const : row.attempt.protocol.channel === 'api' ? 'api' as const : 'manual' as const,
      model: row.attempt.protocol.model || 'UNKNOWN', observedAt: row.attempt.capturedAt, runGroup: run.id,
      protocolId: JSON.stringify(row.attempt.protocol), collectionStatus: 'completed' as const, analysisStatus: 'completed' as const,
      answer: row.answer, citations: bodyLinks(row.answer), upstreamAttemptId: row.attempt.id })), createdAt: spec.asOf, updatedAt: spec.asOf,
  };
  const files: Record<string, string> = {
    '00-交付入口.md': `# ${spec.brand} · 第 ${spec.round} 轮公开 GEO 研究\n\n日期：${spec.asOf}。研究目标：${spec.objective}\n\n先读[品牌诊断报告](品牌诊断报告.md)，再看[内容布局报告](05-内容布局报告.md)和[内容产出报告](内容产出报告.md)。\n\n${table(['交付', '当前状态'], [['公开资料', sourceState], ['AI 回答基线', baselineState], ['内容', `${spec.assets.filter(assetReady).length} 份待审核草稿；均未发布`], ['发布与业务效果', '未验证发布、没有后台流量或转化数据，效果未知']])}\n\n这是外部观察者的独立试点，不代表受松灵委托，也不冒充其内部运营结果。\n\n- [目标用户与问题](04-目标用户与问题.md)\n- [监测方案与基线](06-监测方案与基线.md)\n- [证据与引用](08-证据与引用.md)\n- [采样任务表](09-采样任务.csv)\n- [第一批采样指南](11-第一批采样指南.md)\n- [回答诊断明细](12-回答诊断明细.md)\n- [执行记录](07-执行记录.json)\n- [待确认与验收](10-待确认与验收.md)\n\n重跑：在 code/ 执行 \`npm run campaign -- run "<案例轮次目录>"\`。默认只读本地来源与回答，不联网、不调用模型。\n`,
    '品牌诊断报告.md': `# ${spec.brand}品牌诊断：先看证据，再决定内容投入\n\n本轮是公开资料诊断；${baselineState}。以下关于网站材料的观察来自明确列出的页面，不是全站审计，也不代表 AI 已经理解或推荐品牌。\n\n## 一、品牌方先看什么？\n\n**现状：**${spec.executiveSummary.situation}\n\n**影响：**${spec.executiveSummary.impact}\n\n**下一步：**${spec.executiveSummary.nextAction}\n\n${table(['需要回答的问题', '本轮能判断到哪里'], [['公开资料是否能找到产品与开发依据？', sourceState], ['AI 是否会主动提到品牌？', baselineState], ['潜在用户怎样做产品选择？', '已有受众与选题假设，仍需真实客户咨询验证'], ['优化后是否有效？', '没有发布与可比后测，暂不能判断']])}\n\n## 二、公开资料反映了什么？\n\n${findings('public-source') || '暂无可核验的公开资料结论。'}\n\n## 三、AI 现在如何介绍品牌？\n\n${findings('ai-answer') || `${spec.samplingNote}\n\n因此目前不能回答“六个平台的提及率、推荐名次、引用是否准确”。未采集不等于未提及，也不等于 0%。` }\n\n## 四、下一轮优先验证的内容方向\n\n${findings('hypothesis') || '需先根据公开资料提出可复查的内容假设。'}\n\n${table(['建议先做的内容', '面向谁', '要帮助读者完成什么决定'], spec.assets.filter(asset => asset.priority !== 'P2').map(asset => [asset.title, audience(asset.audienceId).name, asset.objective]))}\n\n完整位置、互链、问题与制作单见[内容布局](05-内容布局报告.md)。现有网站是否需要新建页面，仍需结合内容盘点决定；本轮的路径均为建议。\n\n## 五、品牌方需要确认什么？\n\n1. 本轮优先服务的实际客户群、主推产品和销售阶段是否正确。\n2. 产品型号、固件、SDK／ROS 分支、参数定义与公开边界。\n3. 哪些任务有可公开的复现记录，哪些仍只是演示或集成可能。\n\n拿不到内部资料时，可以继续写有出处的方法与选型草稿，但不填写客户成功率、商机或效果数字。\n\n## 六、如何复查？\n\n发布前在相同问题与条件下建立记录；授权发布后登记真实地址和版本，再按平台复查品牌出现、表述准确性和引用支持。网站咨询、搜索流量和转化另看品牌方实际数据。详见[监测方案](06-监测方案与基线.md)。\n`,
    '04-目标用户与问题.md': `# 目标用户与采购问题\n\n官网列出的受众可以证明品牌希望服务谁；优先级和客户痛点仍是本次研究假设，没有访谈、CRM 或关键词搜索量支持。\n\n${spec.audiences.map(row => `## ${row.name}\n\n- 要完成的任务：${row.job}\n- 关键决定：${row.decision}\n- 需要回答：${row.concerns.join('；')}。\n- 依据：${citations(row.claimIds)}。受众依据：${row.basis === 'website-declared' ? '官方页面声明' : '研究假设'}。\n- 如何验证：${row.validateWith}\n\n${table(['问题原文', '阶段', '是否点名品牌', '选择理由'], spec.questions.filter(q => q.audienceId === row.id).map(q => [q.text, q.stage, q.branded ? '是' : '否', q.reason]))}`).join('\n\n')}\n\n搜索量、商业价值和客户选择：未知。本轮候选由 Agent 阅读来源后整理，不能称真实客户问句。新增或改写问题应增加版本，单独建立基线。\n`,
    '05-内容布局报告.md': `# 内容布局：从用户问题到证据和下一步\n\n目标是让读者知道该选什么、去哪看资料、下一步验证什么；不以文章篇数验收。现有站点已存在产品页、FAQ 与资料入口，优先在已有材料上组织，以下新路径仅是提案。\n\n${table(['顺序', '内容与语言', '受众／阶段', '现有页面与建议位置', '下一步链接'], spec.assets.map(asset => [asset.priority, `${asset.title}（${asset.language}）`, `${audience(asset.audienceId).name}；${[...new Set(asset.questionIds.map(id => question(id).stage))].join('、')}`, `${asset.existingUrl ? '现有：' + asset.existingUrl : '新建与否待确认'}；建议：${asset.proposedPath}`, asset.linksTo.map(id => spec.assets.find(a => a.id === id)!.title).join(' → ') || '产品文档与咨询入口待品牌确认']))}\n\n${spec.assets.map(asset => `## ${asset.title}\n\n- 对应问题：${asset.questionIds.map(id => question(id).text).join('；')}\n- 选择理由：${asset.reason}\n- 核心任务：${asset.objective}\n- 渠道：${asset.channel}\n- 结构：${asset.sections.map(section => section.heading).join(' → ') || '先取证再定正文'}\n- 待补材料：${asset.requiredMaterials.join('；')}。\n- 完成标准：${asset.acceptance}\n- 草稿：[${assetReady(asset) ? '查看待审核正文' : '查看阻塞说明'}](${assetPath(asset)})。`).join('\n\n')}\n\n内容互链用于帮助读者查到相应证据，不保证被索引或被 AI 引用。第三方转载或社区发布需另行决定，本轮不执行外部发布。\n`,
    '内容产出报告.md': `# 内容产出：本轮交付了什么？\n\n本轮以公开资料撰写独立稿件，采用品牌方来源归因，尚未做硬件实测或取得内部技术审核。共 ${spec.assets.filter(assetReady).length} 份待审核正文，其余为待补材料的制作单；全部未发布。\n\n${table(['稿件', '目的', '状态', '还缺什么'], spec.assets.map(asset => [`[${asset.title}](${assetPath(asset)})`, asset.objective, assetReady(asset) ? '独立草稿，待技术和品牌审核' : '引用待确认，正文阻塞', asset.requiredMaterials.join('；')]))}\n\n## 审稿时重点看什么？\n\n- 每个产品陈述是否指向对应型号与当前来源；“官网写了”与“我们实测过”分开。\n- 教程命令是否真正按指定硬件和软件版本跑过；本轮未跑的步骤不能称验证教程。\n- 读者能否用内容列出选型条件或提出测试需求；没有执行资料时不编成功率。\n- 标题是否直接回答问题；FAQ 是否给明确条件和下一步。\n\n代码只检查来源和引用关联；文字是否准确、产品结论是否成立仍需技术审核。发布、被检索、被引用和产生咨询应分别登记。\n`,
    '06-监测方案与基线.md': `# 监测方案与本轮基线\n\n**${baselineState}。效果保持未知。**\n\n${spec.samplingNote}\n\n## 问题集上的四个率\n\n${rateSummary}\n\n## 逐题逐平台\n\n${table(['问题', ...spec.platforms], spec.questions.map(q => [q.text, ...spec.platforms.map(platform => {
      const rows = run.metrics.filter(row => row.questionId === q.id && row.platform === platform);
      const measured = rows.filter(row => row.denominator);
      const attempts = run.attempts.filter(row => row.attempt.questionId === q.id && row.attempt.protocol?.platform === platform);
      const cell = (row: typeof measured[number]) => `提及 ${formatGeoRate({ numerator: row.numerator, denominator: row.denominator, value: row.value }, '无分母')}；出现 ${formatGeoRate(row.appearance, '无分母')}；Top1 ${formatGeoRate(row.top1, '无枚举')}；Top3 ${formatGeoRate(row.top3, '无枚举')}`;
      return !measured.length ? (attempts.length ? `无有效回答（${attempts.length} 次尝试已排除）` : '未采集') : measured.length > 1 ? `多协议，分开查看记录。${measured.map(cell).join(' / ')}` : cell(measured[0]!);
    })]))}\n\n有效回答 ${valid.length} 条；排除 ${run.attempts.length - valid.length} 次尝试。重试挂在同一任务下，不增加分母。完整条件、原文、排除原因与结果见[执行记录](07-执行记录.json)。\n\n## 回答中可见的来源\n\n${answerSources.size ? table(['可见 URL', '回答记录'], [...answerSources].map(([url, ids]) => [url, ids.join('、')])) : '尚无可见来源记录；引用情况未知。'}\n\n可见链接不是完整引用，也未证明支持相应声明。原始提取状态保存在逐条执行记录中；提取不完整或未知时，不计算引用覆盖率或未引用比例。\n\n## 分开看五类信号\n\n${table(['信号', '需要的数据', '怎样使用'], [['主动发现', '未点名问题逐平台回答原文', '观察出现与语境；不能把点名题混进主动推荐'], ['介绍准确性', '回答声明与确认后的型号资料', '人工记录型号、参数条件、适用边界差异'], ['来源支持', '回答可见链接与对应原页', '核对链接是否支持该声明；未完整提取不得算未引用'], ['内容发布', '真实网址、时间、版本及审核记录', '只登记事实，提交／上线不等于被引用'], ['业务结果', '经品牌方授权提供的实际搜索、访问、咨询数据', '当前无权限，保持未知；不从 AI 提及推算转化']])}\n\n## 采样与比较条件\n\n仅使用已核对的 Xue 用户，串行限速；用户操作 Xue 时暂停，登录和验证码由用户本人处理。每条保留回答、DOM、截图、元数据。记录问题全文与版本、平台和模型、语言、实际地区、登录态及新旧会话。未记录项保持未知，不能因为两轮都未知就认定可比。\n\n先完成干预前记录；内容经授权实际发布后，可按预算在第 7、14、28 天复查。时间表尚未启用自动化。两轮可比观察只提供描述差值，不能证明因果；没有真实发布记录不称“发布后效果”。\n`,
    '12-回答诊断明细.md': `# 回答诊断明细\n\n${valid.length ? table(['问题', '平台', '通道', '品牌出现', '名次', '出现原句', '可见链接', '引用提取', '证据'], valid.map(row => [row.attempt.questionText, row.attempt.protocol.platform, row.attempt.protocol.channel, row.mentioned === null ? '未知' : row.mentioned ? '出现' : '未出现', rankLabel(row), row.mentionQuote?.quote || '', row.visibleUrls.join('、'), row.citationExtraction, `[回答原文](${row.attempt.evidence!.answer})`])) : '尚无有效回答。品牌是否出现、如何介绍、引用是否支持，均保持未知；这里不显示 0%。'}\n\n出现只表示文本中能定位品牌名，不等于推荐、正面评价或转化。推荐语境、型号准确性、参数边界和链接支持必须人工读原文后写入案例策划的 \`ai-answer\` finding。\n\n${run.attempts.some(row => !row.eligible) ? `## 已排除尝试\n\n${table(['采样 ID', '排除原因', '页面证据'], run.attempts.filter(row => !row.eligible).map(row => [row.attempt.id, row.exclusion || '', row.attempt.evidence?.html ? `[DOM](${row.attempt.evidence.html})、[截图](${row.attempt.evidence.screenshot})` : '未保存']))}\n\n失败不进入品牌出现分母；重试沿用同一 jobId。` : ''}`,
    '07-执行记录.json': JSON.stringify(run, null, 2) + '\n',
    '08-证据与引用.md': `# 执行附录：公开来源与声明依据\n\n本轮来源通道是公开 HTTP/NET，不是 AI 回答网页采样。归档只保存明确指定的相关页面正文，不读取 Cookie 或填写表单。source-checked 表示引文存在，不表示产品事实独立实测通过。\n\n${table(['来源', '类型／覆盖', '读取状态', '本地归档'], run.sources.map(row => [`[${row.title}](${row.url})`, `${row.kind}；${row.captureMethod || '未记录'}；${row.coverage === 'excerpt' ? '片段' : '页面文本'}`, row.status === 'collected' ? row.retrievedAt : row.error, row.textFile ? `[正文](${row.textFile})` : '未取得']))}\n\n${spec.claims.map(claim => `## ${claim.id} · ${claim.scope}\n\n来源：[${source(claim.sourceId).title}](${source(claim.sourceId).url})；状态：${claim.review}。\n\n> ${claim.quote.replaceAll('\n', '\n> ')}\n\n研究转述：${claim.statement}`).join('\n\n')}\n\n归档正文的 SHA-256 与本地路径保存在来源归档和执行 JSON 中；原文更改会导致复核失败，不能继续生成假定已核验的正文。\n`,
    '09-采样任务.csv': csv([['任务ID', '问题ID', '版本', '问题原文', '平台', '语言', '点名品牌', '要求Chrome用户', '批次', '状态', '实际模型', '实际地区', '登录态', '会话', '采样时间', '证据路径'], ...sampleTasks]),
    '10-待确认与验收.md': `# 下一轮所需材料与验收\n\n## 现在已具备\n\n公开来源归档与引文校验、受众及问题映射、内容布局、来源可追溯的独立草稿、空基线与采样任务、分阶段执行记录，可离线重跑。\n\n## 下一轮输入\n\n1. 接通 Xue 的已有浏览器连接，并核对窗口或 profile；当前用户1不作替代。\n2. 每条采样的原文、DOM、截图和 metadata；导入采用 CampaignAttempt 合约。\n3. 品牌方或技术负责人对目标产品、型号与 SDK 分支的复核；未取得前所有草稿仍为独立研究。\n4. 如需实际运营，另行取得发布权限和公开材料授权，记录实际发布版本；当前没有。\n\n## 怎么验收下一次迭代\n\n- 失败或验证页面能明确排除，空样本仍是未知。\n- 至少一组相同问题／平台的真实基线可回到原文；跨平台不合并成总体提及分数。\n- 从一个受众问题可一路找到内容位置、稿件、引用与复查任务。\n- 一项内容改动能追溯版本和理由；没有相同采样条件不输出提升。\n- 公开诊断、采样诊断、产品实测与业务效果保持分开，不把文档完成等同于运营完成。\n`,
    '11-第一批采样指南.md': `# 第一批最小真实基线\n\n目的不是一次跑满 72 格，而是先取得可人工复查的 12 条证据。国际平台用英文未点名与点名各一题，国内平台用中文未点名与点名各一题。英语和英语、中文和中文分开看；不同语言、平台和协议不合并成总体提及率。\n\n${table(['任务', '平台／语言', '为什么先采', '状态'], spec.baselinePlan.map(task => [question(task.questionId).text, `${task.platform}／${question(task.questionId).language}`, task.rationale, baselineStatus(task)]))}\n\n## 执行边界\n\n只用已核对的 Xue 浏览器连接，串行执行并在平台间限速。用户正在操作 Xue 时暂停；登录、验证码和账号选择由用户本人完成。不复用历史标签页，不为失败样本更换 Chrome 用户。\n\n## 每条记录必须有什么\n\n回答原文、DOM、截图和 metadata 四件齐备才可进入有效分母。metadata 记录 Xue、web-ui、平台、问题原文、语言、模型、地区、登录态、会话、时间、可见链接和提取状态。登录墙、验证码、限流、空回答、模型未完成和证据缺失单列为失败，不把失败写成“品牌未出现”。\n\n## 导入方式\n\n采集后先放入案例目录内的临时证据目录，再用 \`campaign import-attempt\` 导入；导入器校验路径、四件套、metadata 与协议一致性，然后追加到 \`03-采样记录.json\`。导入成功只代表证据可入档，仍需人工阅读回答语义。重试保留同一 jobId，不新增分母。\n`,
    '工作台项目.json': JSON.stringify(toProject, null, 2) + '\n', ...drafts,
  };
  return Object.fromEntries(Object.entries(files).map(([name, text]) => [name, redactExportText(text)]));
}

export function renderCampaignComparison(brand: string, rows: { question: string; platform: string; comparable: boolean; before: number | null; after: number | null; delta: number | null; interpretation: string }[]): string {
  const comparable = rows.filter(row => row.comparable);
  const percent = (value: number | null) => value === null ? '未知' : `${Math.round(value * 100)}%`;
  return `# ${brand}两轮 GEO 观察比较\n\n## 先看结论\n\n${comparable.length ? `本轮有 ${comparable.length} 个问题／平台组合满足相同问题版本、品牌口径和已知采样协议，可以描述观察差值。${rows.length - comparable.length} 个组合不能比较，保持未知。` : '本轮没有满足相同问题版本、品牌口径和已知采样协议的组合，不能计算两轮差值。'}\n\n差值只说明两次观察不同，不证明内容导致变化，也不代表咨询、销售或品牌资产提升。没有登记并验证真实发布时，不称“发布后效果”。\n\n${table(['问题', '平台', '前轮', '后轮', '观察差值', '解释'], rows.map(row => [row.question, row.platform, percent(row.before), percent(row.after), row.comparable ? percent(row.delta) : '不计算', row.interpretation]))}\n\n## 复查时还要另看\n\n- 回答语境：出现品牌不等于推荐，需人工核对原句。\n- 型号与版本：是否混淆 PiPER、LIMO PRO、LIMO COBOT 或软件分支。\n- 来源支持：可见链接是否支持回答声明；提取不完整时不计算覆盖率。\n- 发布事实：真实 URL、时间、版本和审核记录。\n- 业务结果：品牌方授权提供的搜索、访问、咨询或转化数据；当前外部研究不推算。\n`;
}
