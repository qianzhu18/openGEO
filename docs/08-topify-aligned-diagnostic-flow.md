# Topify 对齐的品牌诊断与持续执行链路

更新：2026-10-31。状态：产品设计决策，待实现；不代表当前原型已有这些能力。

本次用户明确要求：整个链路参考 Topify，系统自动完成品牌研究、问题发现和诊断准备；不能以用户手工整理事实与问题集作为默认启动条件。Web Agent 是主要产品入口，CLI / MCP 是共享同一引擎的调用入口。此决策覆盖旧文档中“网页仅作调试宿主”和“先人工准备全部事实与问题”的定位。

## 1. 证据与边界

- 2026-10-31 登录态 Agent 页面直接观察：Start here、Research、Content、Analytics、Optimize & publish；顶部有 Review & Confirm。
- 本次展开 Start here，观察到 Profile + competitors + keywords、Quick site profile、Benchmark vs competitors。
- 本次展开 Research，观察到 Keyword research、Keywords for a specific topic、Competitor keyword gaps、SEO audit + competitors、Technical SEO check、Content gaps。
- 既有 UI / JS 证据见 [Agent 协议](../references/competitors/topify/04-agent-and-workflows.md)、[Prompts 规格](../references/competitors/topify/08-prompts-monitoring-gap.md)。入口存在不证明全部后台任务已运行成功。
- 用户描述 Topify 使用本地电脑执行诊断。本项目据此采用本地可执行的 runner / worker 设计；Topify 自身到底采用本机、云端还是混合部署，当前证据尚未验证。浏览器界面本身不能证明计算位置。
- 以下服务、类型和执行策略为 OpenGEO 设计，不冒充恢复出的 Topify 私有实现。

## 2. 默认用户路径

输入官网 URL 和诊断目标 → Agent 自动研究站点 → 提取带来源的品牌画像 → 发现竞品、主题、关键词与候选问题 → 展示可编辑的研究结果与采集范围 → 启动基线采集 → 分析回答、引用与竞品差距 → 产出诊断与 Actions → 执行内容任务 → 审核与发布 → 固定条件复测。

用户可以一键接受研究结果，也可以编辑部分内容。研究和候选生成无需逐项确认才开始；公开网页支持的内容可以用于内部分析，但不能直接当成已人工核实的事实对外发布。遇到来源冲突、信息不足或预算不足时，保留结果并呈现明确的处理入口。

## 3. 阶段、产物和界面

| 阶段 | 自动执行 | 持久产物 | 对应界面 |
| --- | --- | --- | --- |
| 建档与研究 | 读取官网可访问页面，解析产品、受众、场景与来源；无法访问则记录失败 | SiteProfile、SourceDocument、Claim，保留来源、时间与冲突状态 | Agent / Project |
| 竞品与问题发现 | 基于站点和可用搜索数据生成竞品、Topic、关键词与候选问题；标记来源与不确定性 | Brand、Competitor、Topic、Prompt，候选保留 suggested 状态 | Agent / Competitors / Prompts Suggested |
| 计划与启用 | 按目标形成平台、问题、地区、频次、调用上限与费用估算计划；接受后转 active | PromptSetVersion、MeasurementProtocol、CollectionPlan | Agent / Prompts Active |
| 基线采集 | 按计划调度 API 或真实浏览器 adapter；保存失败、重试和部分完成 | Observation、Attempt、Citation、可取得的 Fanout | Prompts / Sources / Fanouts |
| 诊断 | 用可比样本计算按问题、主题、品牌、Provider 的指标；关联原文与缺口 | Judgment、MetricSnapshot、DiagnosticReport | Overview / Prompts 下钻 |
| 行动与内容 | 根据证据提出优先任务，按任务执行研究、提纲、正文与修订 | Action、WorkflowRun、Checkpoint、Artifact | Actions / Agent / 内容产物 |
| 发布与复测 | 按已有授权审核发布；保存回执与访问检查；以固定协议重新采样 | Publication、CollectionPlan、ComparisonReport | Agent / Actions / Overview |

Recording 沿用既有逆向规格，作为独立 URL 资料池；完整回答绑定 Observation，由 Prompts 下钻访问，不将两类数据混成一个实体。

## 4. 人工确认的职责

默认 Review & Confirm，审批绑定具体产物和 revision，支持接受、编辑、再生成与跳过。人工处理关键决策，不承担前置数据录入工作：

1. 研究结果与首次采集计划：系统先准备可审查的画像、竞品、问题、范围与预算，用户批量接受或修改；已有授权范围内的后续采集无需重复确认。
2. 冲突与缺失：只向用户呈现系统无法解决且会影响任务的事项，保留来源，不编造结论。
3. 内容与发布：在提纲、正文和实际对外发布等适用节点审核；内部研究无需一律等待对外发布级别的事实确认。

审批模式与执行授权分开保存；允许自动研究或自动生成，不自动等同于允许对外发布。

## 5. 技术边界

Web Agent / CLI / MCP → WorkspaceService → 持久 WorkflowRunner → Tool / Skill Registry → SiteCrawler、SearchAdapter、ModelGateway、BrowserSampler、CMS adapter。

- 继续使用 TypeScript / Node，复用现有 Provider 适配与诊断规则。
- 一套项目与证据存储供所有入口使用；会话、任务、采集、审批、产物和事件必须关联同一 projectId。
- WorkflowRunner 负责依赖、队列、超时、预算、checkpoint 和恢复；模型选择已注册能力，指标、权限与状态变更由代码执行。
- 本地 runner 可以与 Web 服务同机。浏览器 worker 可独立进程，也可部署到独立常开电脑；设备是部署选项，不是产品链路的必要条件。
- API 与消费级网页采集分别记录协议，不混算。选择哪个渠道由诊断目标决定，不能用未联网 API 结果替代网页搜索场景。
- 有明确终态与失败记录；UI 断开后任务不丢失，重新连接能补读事件。

## 6. 首个端到端验收

用户输入官网 URL 与目标，不手工填写事实清单或问题清单，即可得到有来源的品牌画像、候选竞品、Topic 与 Suggested Prompts。用户接受采集计划后，至少一个真实 adapter 完成采集；失败也可追溯。Prompts 每个已计算指标都能返回原文，诊断能生成关联证据的 Action。服务重启后研究产物、采集进度和审批节点保留；内容审核后才按授权发布。后续复测沿用稳定 Prompt ID 与固定协议，修改版本时明确标记不可直接比较。

## 7. 实施顺序

1. 统一 workspace，并建立 WorkflowRun、事件与研究产物持久化。
2. 实现 URL → SiteProfile → 竞品 / Topic / Suggested Prompts 的真实研究链路，与 Agent 入口同时交付。
3. 接入采集计划、稳定 Prompt ID、Observation / Attempt、真实 adapter 和可恢复执行。
4. 对齐 Prompts、Overview、Sources、Fanouts 与诊断 Actions。
5. 补齐内容 checkpoint、发布 adapter 和按协议持续复测。

当前只完成设计纠偏；上述自动研究与完整链路尚未开发，不再把手工导入路径当成目标产品的默认流程。
