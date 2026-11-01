# OpenGEO 海外 MVP：从官网到首次可复查诊断

更新：2026-10-31。产品范围：海外英文市场优先；国内 GEO、国内平台适配暂不实施。遵循 [Agent 驱动链路决策](08-topify-aligned-diagnostic-flow.md) 与 [Topify 初始化逆向](../references/competitors/topify/09-workspace-onboarding.md)。本文件是实现与验收规格，不把待开发能力写成已完成。

## 1. 产品与成功标准

用户输入官网，系统自动读取可访问的站点资料、建立带来源的品牌画像、形成主题与候选问题；用户审核采集范围后，系统执行真实回答采集，给出可返回原文的诊断和可执行 Actions。用户无需先编写完整事实清单或问题清单。

首版支持 English 与 US / GB / CA / AU。country 是用户指定的目标市场元数据；只有 adapter 实际支持并记录地区设置时，才可声称测量了该地区结果。界面使用英文，内部记录统一 projectId、语言、市场和协议版本。

默认本地单用户运行，不做账单、团队、邀请码、支付墙、国内平台、全平台自动发布或未验证的排名保证。CLI 与后续 MCP 是同一核心服务的入口，不另建数据孤岛。

## 2. 目标流程

```text
Info（URL、可编辑品牌名、English、目标市场）
 → Research（抓取、画像、关键词／主题／竞品候选）
 → Prompts（按 Topic 选择与编辑 Suggested，展示采集计划与预算）
 → Analyze（真实 adapter 采集 → 保存原文 → 判定与聚合）
 → Done（报告与覆盖说明）
 → Overview / Prompts / Sources / Actions
 → 执行内容改进并固定条件复测
```

界面可以复用 Topify 四步外观，但研究、采集、分析和完成是独立持久状态。刷新、重启或断开网页不会把后台任务成功与否交给 UI 猜测。

## 3. 首次研究与审核

- 安全抓取官网及有界站内页面，保留最终 URL、标题、正文片段、采集时间、来源 ID 与失败记录。
- 自动提取或生成的画像不直接等于人工核实事实。用于内部诊断的研究不需要逐条对外发布级确认；冲突和证据不足明确提示。
- 若采用模型做画像、关键词、问题与竞品发现，记录 provider/model、提示词版本、输入来源、费用及原始输出；来源文本按数据处理。模型建议竞品必须保留依据或标记待验证，不把猜测写成真实搜索发现。
- 无可用网页证据时，研究失败并保留错误；不能仅凭域名编造品牌简介。没有搜索数据时，不显示关键词搜索量。
- 审核的是已经准备好的研究产物和采集计划；接受后将选定问题转 active，保留未选候选、版本与来源。不是要求用户重新手工录入全部资料。

## 4. 最小实体

| 实体 | 必须保存的内容 |
| --- | --- |
| Workspace / Project | id、官网、brand/alias、English、目标国家、market=international、研究版本 |
| ResearchRun / Source | 输入 URL、方法版本、状态、来源内容与指纹、抓取尝试、局部失败、模型调用记录 |
| Claim / SiteProfile | 值、来源 ID、来源时间、unconfirmed/confirmed/conflict；自动研究与人工确认分开 |
| Brand / Competitor | 身份、域名、别名、来源、suggested/verified；不从空数据编造竞品 |
| Topic / Prompt | 稳定 ID、文本、意图、品牌词标记、来源、状态、主题、语言和目标国家 |
| CollectionPlan / Protocol | 问题版本、adapter、模型／入口、搜索模式、会话条件、可用地区能力、频次、预算与尝试上限 |
| Observation / Attempt | promptId、计划样本与每次尝试、原文、时间、协议、失败、费用；重试不当成新的独立统计样本 |
| Citation / Fanout | 来源种类、URL、provider payload path、回答关联；没有真实子查询则 UNKNOWN |
| Judgment / MetricSnapshot | 判定方法版本、原文片段、可分析状态、聚合分母、窗口及排除样本数量 |
| Action / Workflow / Artifact | 依据、目标问题、优先级、输入快照、步骤事件、产物 revision、审批及恢复位置 |
| Publication / Comparison | 真实发布状态与 URL、访问检查、前后测量范围、条件差异与结论限制 |

## 5. 服务与协议

Web Agent / CLI / MCP → WorkspaceService → 持久 WorkflowRunner → SiteCrawler / ResearchModel / ModelGateway / BrowserSampler / Importer → Evidence Store 与物化读模型。

实现选择沿用 Node.js / TypeScript、已有 Provider 适配、安全公网 fetch 和 HTML 提取；不因对方使用 Next.js 而必须立即重写前端。共享服务应逐步取代网页与 CLI 分离存储。

最小本地协议为 DESIGN，不冒充 Topify API：

| 操作 | 输入 | 返回／约束 |
| --- | --- | --- |
| 创建研究 | URL、English、country、可选目标 | 持久 researchId 与 queued 状态；异步执行有预算 |
| 读研究与事件 | researchId、afterSequence | 最新产物、状态、增量事件；终态可靠 |
| 接受研究／问题 | researchId、expectedRevision、selectedPromptIds、editedPrompts、采集配置、idempotencyKey | 同一 projectId、稳定问题 ID 与计划；重复提交不重复花费 |
| 执行诊断 | projectId、planId、protocolVersion、预算 | WorkflowRun；保留部分完成、失败与取消请求 |
| 读取诊断 | projectId、range、provider、topic／prompt | 聚合和原文一致；无数据为 null，失败不算未提及 |
| 审核／执行 Action | actionId、revision、decision、editedArtifact | 过期 revision 拒绝；事件与检查点落盘后继续 |

错误区分 INVALID_URL、NO_SITE_EVIDENCE、PARTIAL_RESEARCH、AUTH_REQUIRED、BUDGET_EXHAUSTED、ADAPTER_UNAVAILABLE、COLLECTION_FAILED、ANALYSIS_FAILED、STALE_REVISION。前端轮询可退避，但运行器必须有实际截止时间；超时后保留产物，不能用等待动画假装仍在工作。

## 6. 真实采集 adapter 与统计边界

首个垂直切片至少接一个已验证的真实 adapter，并在界面清楚写出 API 或消费级网页。面向实际 AI 搜索场景时需要支持搜索且保留引用证据；普通未联网 API 只能作为模型 API 基线。

ChatGPT、Perplexity、Google AI Overview、Gemini、Claude 是 Topify global 客户端显示的产品入口，不代表我们已接入相同产品。尤其 Google AI Overview 不能用 Gemini API 更名替代，ChatGPT 网页不能用普通 OpenAI API 结果代称。

BrowserSampler 需真实取得回答、引用和可用搜索元数据，记录会话及地区能力。可先本机 worker，后续独立常开电脑；机器位置不替代协议一致性，也不证明目标平台的内部实现。

首版只承诺有证据的提及、推荐语境、引用来源和可比变化。按问题的情绪、位置、SOV 需定义并测试口径后逐项接入。CVR、AI Volume 估算、Heatmap、未知 Topify 权重不在首版承诺内。失败样本排除分母并显示计数；API／网页、不同协议与问题版本不混算。

## 7. 端到端里程碑

| 阶段 | 可审查交付 | 完成验收 |
| --- | --- | --- |
| I0 本地版本与证据 | Git 基线、研究规格、脱敏指纹与限制 | 可回到基线；不提交 .env、运行数据、账号信息或第三方完整脚本 |
| I1 URL-first 本地研究 | Info → 本地抓取 → 画像／来源／Topic／Suggested → 可编辑审核 | 不填事实清单即可开始；来源真实；失败不造数据；刷新保留结果 |
| I2 真实语义研究 | 有预算的画像、关键词、竞品候选发现与来源校验 | 记录真实模型调用和未知费用；LLM 输出不冒充搜索数据；有无密钥路径区分 |
| I3 首次真实诊断 | 接受问题 → 单一真实 adapter → 原文／引用 → 按问题诊断与报告 | 至少一个真实海外品牌案例；失败可见；无假回答；问题稳定 ID；报告能返回原文 |
| I4 持续监测 | 定时采集、按窗口聚合、历史与 Provider／Topic 筛选 | 跨两次运行保留问题库和历史；重试不放大样本；重启可恢复 |
| I5 行动闭环 | 诊断 Action → 研究／提纲／正文 → 审核／发布 → 复测 | 任务有证据；审批幂等；产物版本不丢；发布回执不等于被索引／引用 |

I1 可以用 source-derived templates 打通交互和存储，但 **I1 完成不等于海外 MVP 完成**。对外宣称首次可用诊断至少达到 I3；完整持续优化闭环需要 I4/I5。

## 8. 当前实现与明确差距

2026-10-31 本地实现与验证状态：

| 阶段 | 已落地 | 剩余边界 |
| --- | --- | --- |
| I0 | 本地 Git 基线、global onboarding 逆向规格、37 脚本指纹、REA Evidence 摘要 | 尚未创建远端仓库或发布 |
| I1 | `/create-workspace` 英文 URL-first 建档；最多 3 页安全抓取、25 秒来源抓取预算；来源／画像／Topic／候选问题；持久状态与刷新恢复；选题接受幂等 | 研究进程重启后标 interrupted 并保留产物，尚非自动恢复 worker；问题文本编辑与研究 revision 待补 |
| I2 | 可选一次有凭据的真实模型研究；来源 ID、主题、品牌词／非品牌词／商业问题校验；调用与费用留痕；失败回退；PostHog 实测成功 | 无真实搜索型竞品发现与关键词需求数据，竞品为空；调用次数／token 上限不等于金额预算 |
| I3 | `/workspace` 英文 Agent／Overview／Prompts／Sources／Actions／Project；真实 API 采样；原文与导出；内部诊断不被发布事实审批阻塞；PostHog 2 条原文、3 个任务实测 | 未联网 API 基线，尚未验证海外消费级 AI 网页或搜索采集；目标国家只作请求元数据，不保证 API 地区路由 |
| I4 | 跨 run 读取去重；按稳定问题 ID 下钻；模型、协议及品牌词／非品牌词分组；导入回答追加、保留问题库 | 无后台采集日程、独立 Attempt 重试实体与完整采集计划；CLI 与网页 workspace 仍未统一 |
| I5 | 英文证据任务、待审核草稿、来源批量复核入口 | 无完整内容 revision／持久审批恢复／CMS 发布／发布后复测调度 |

源码：`src/citekeel/onboarding.ts`、`semantic-research.ts`、`research-service.ts`、`international.ts`、`recordings.ts`（Recording URL 池已接通 server 与工作台），以及现有 `engine.ts`、`server.ts`。研究方法分别标记 `source-derived-templates/v1` 与 `model-assisted/v1`；没有可用官网来源时不发模型编造画像。有效模型输出没有费用时记录 unknown 并停止本次研究的后续操作（研究本身仅一次模型操作）；非法结构、未知来源或截断结果保留原来源和模板。来源声明保持 unconfirmed，供内部研究使用，对外写作另审核。

验证：`npm run check` 构建及 56 项核心测试通过（2026-11-02 复核）；`npm run test:browser` 10 项通过，覆盖 320px、英文工作台、跨轮证据、配置、刷新与密钥不落浏览器存储。复用公网页面抓取器的安全测试另通过。真实调用摘要见 [PostHog smoke](../examples/international-mvp/live-smoke-summary.json)：1 次研究 + 2 次采样 + 1 次策略，共 4 次调用，Provider 费用合计 $0.0008866。没有消费级网页样本、没有实时搜索、没有对外发布，也没有因果提升结论。

下一优先级：真实海外搜索／浏览器 adapter 与协议 → 带依据的竞品研究 → 问题编辑与停用 → 持久采集计划和恢复 → 内容审批与 CMS。完整海外 MVP 尚未完成，不将当前 API 基线切片称为 Topify 全量替代。

## 9. 核心验收场景

1. 只填海外官网、English 和 US/GB/CA/AU，即得到带来源研究产物；CN 或未支持语言不进入此流程。
2. 私网 URL、凭据 URL、重定向至私网被拒绝；站点中的不安全链接不进入持久采集计划。
3. 官网无法读取时保持 failed，无虚构画像／竞品／问题；部分页面失败显示 partial，并保留已有证据。
4. 同一来源、文本和协议重新研究，问题 ID 可稳定匹配；人工修改有新 revision。
5. 页面刷新与服务重启后能找到相同研究、待审核问题和采集状态；不能重复创建和计费。
6. 接受问题后，真实 adapter 采集至少一条原文；失败与无品牌提及区分；来源类型分开。
7. 采集不覆盖既有问题库，重复尝试不重复计数；至少两轮样本可返回各自原文。
8. 同一筛选范围下 Overview、Prompts、Sources 的分母一致；缺失显示未知，不填虚构 0。
9. 诊断 Action 至少关联一个真实问题／回答／事实 ID，不能引用不存在的证据。
10. 自动研究先跑、用户审核关键产物；对外发布按已有授权与具体产物 revision 执行。

实现验证采用离线 fixture、依赖注入 HTTP／模型 adapter、临时存储与 Playwright；另留真实 adapter 冒烟结果，明确记录入口、时间与成本。自动测试通过不代表真实平台采集已验证。
