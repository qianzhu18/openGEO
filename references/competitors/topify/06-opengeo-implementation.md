# 06 OpenGEO 的实现映射与验收规格

> 2026-10-31 实施顺序更新：先交付 URL 自动研究、竞品 / 问题发现与诊断的完整垂直链路，Agent 入口不再排在分析页面全部完成之后。以 [最新产品链路](../../../docs/08-诊断链路.md) 为准；本页其他实体和证据约束仍适用。

本页是 **DESIGN / 待实现方案**。沿用用户确定的 Topify 框架，不另起视觉方向。此次未把下表待做功能伪装成已开发。

## 1. 当前代码与差距

Prompts 监控页的逐列拆解、根因与 P0 顺序见 [08](08-prompts-monitoring-gap.md)；本表只保留全站层面的映射。

| Topify 能力 | 当前 OpenGEO 状态 | 必须补齐 |
| --- | --- | --- |
| Overview 布局 | 已有近似视觉和真实样本筛选 | 统一工作区数据、竞品与主题聚合、协议口径 |
| Agent 聊天 | 只有执行轨迹和历史页 | 会话、消息、结构化事件、技能与审批恢复 |
| Prompts | 文本问题编辑与版本 | Topic、状态、地区、发现、批量、明细 |
| Recording | 缺失 | 独立 URL 池、内容解析、问题建议来源 |
| Sources | 引用平铺，可返回原文 | Domain / URL 聚合、Used、份额、机会和筛选 |
| Fanouts | 缺失 | 子查询导入 / 采集、关联与洞察；无数据空态 |
| Competitors | 缺失独立实体 | 自身品牌 / 竞品、别名、active / suggested、逐品牌指标 |
| Actions | 规则生成任务与三态执行标记 | 接受 / 忽略、WorkflowRun、checkpoint、产物、恢复 |
| Content | 已有草稿、审核、发布链接登记 | 多轮修订与产物版本；CMS adapter 另做 |
| Project settings | 有品牌资料与模型配置 | 默认品牌、结构化别名、语言地区、集成、Agent 知识 |
| Members / Billing | 单人本地模式 | 自托管多人 / SaaS 阶段才引入 |
| 采集调度 | API 观察 / 导入 / 回放 | 计划运行、消费级采样 adapter、失败与预算记录 |
| 数据统一 | `code/src/citekeel` 工作台与 `code/src/opengeo` CLI 并存 | Web / CLI / 后续 MCP 共享一个 workspace 服务 |

## 2. 目标导航

```text
Agent                         聊天 + 执行 + 产物 + 审批
Analysis
  Overview                    品牌/竞品/主题/行动
  Tracking
    Prompts                   问题库与原始回答入口
    Recording                 URL 资料与问题发现
    Sources                   域名/URL/原文
    Fanouts                   子查询与来源
Optimization
  Actions                     建议、执行、审批、历史
  Content                     可保留 OpenGEO 已有草稿交付入口
Preferences
  Competitors                 品牌、竞品、别名
Management
  Project                     知识、默认筛选、集成与模型
  Members / Billing           托管版阶段
```

顶栏与筛选器、卡片、表格和抽屉复用同一套组件；不为未实现功能放可以点击但毫无反馈的按钮。

## 3. 建议的服务边界

```text
Web / CLI / MCP
       ↓
WorkspaceService
  Project / Brand / QueryBank / Recording
  Observation / Judgment / Citation / Fanout
  Analytics / Report
  Action / Workflow / Approval / Artifact
       ↓
Adapters
  ModelGateway / BrowserSampler / Importer
  SiteCrawler / SearchData / CMS
       ↓
Evidence store + append-only RunEvent log + materialized views
```

先复用现有 Node / TypeScript 与明确状态，不因竞品使用 Next.js 就强制重写全部后端。是否迁移 React / Next.js 是独立工程选择；当前优先统一契约和产品结构，避免积累两个互不相通的数据源。

## 4. 工作流最低数据契约

```typescript
type WorkflowStatus = 'queued' | 'running' | 'awaiting_approval'
  | 'completed' | 'failed' | 'cancel_requested' | 'cancelled';
type Decision = 'approve' | 'edit' | 'regenerate' | 'skip' | 'reject';

interface WorkflowRun {
  id: string; projectId: string; actionId: string;
  status: WorkflowStatus; currentStepId: string | null;
  inputSnapshotId: string; skillVersion: string;
  lastEventSequence: number;
}
interface Checkpoint {
  id: string; runId: string; stepId: string;
  revision: number; type: string;
  artifactId: string; allowedDecisions: Decision[];
  state: 'pending' | 'resolved' | 'superseded';
}
interface ApprovalDecision {
  checkpointId: string; expectedRevision: number;
  decision: Decision; editedArtifactId?: string; feedback?: string;
  actorId: string; idempotencyKey: string;
}
interface RunEvent {
  runId: string; sequence: number; type: string;
  at: string; payloadRef: string;
}
```

这是 OpenGEO 建议 schema，并非对方已恢复的类型。先持久化事件再推流；重连通过 lastEventSequence 补读；重复审批不重复执行；过期 revision 拒绝；浏览器关闭不代表任务消失。

## 5. 推荐实施顺序

| 阶段 | 交付 | 验收 |
| --- | --- | --- |
| W1 统一 workspace | 工作台读写引擎 workspace，旧数据迁移可回滚 | CLI 导入后网页立即可读；网页确认后 CLI replay 一致 |
| W2 监测实体 | Brand / Alias / Topic / Prompt / Recording / Observation / Citation / Fanout | 每个指标能返回原文；URL 资料不混作回答；无证据不制造数据 |
| W3 全站分析页面 | Prompts、Recording、Sources、Fanouts、Competitors 对齐框架 | 同一范围与 Provider 筛选一致；空态 / 错误 / 分页可用 |
| W4 Agent 执行内核 | Action 生命周期、步骤、审批、恢复、产物 | 服务重启后恢复；重复 decision 幂等；错误不覆盖已有产物 |
| W5 聊天入口 | Session / Message、结构化事件、能力卡片 | 聊天触发与手工运行经过同一 runner；会话切换不串项目 |
| W6 实际 adapter | 有预算的 ModelGateway、采集与 CMS | 至少一个真实样本链路；未授权发布不执行；回执不冒充索引 / 引用 |
| W7 托管能力 | Team、角色、API keys、额度、账单 | 服务端跨团队隔离与资源结算；不能靠隐藏按钮鉴权 |

W1 / W2 优先，W4 不能只做聊天外观。已有 Model Gateway 路线继续推进，但它应接入统一执行器，而不是形成第三套任务与存储。

## 6. 可执行验收场景

1. 手工导入一批带原文、引用和子查询的样本 → 同一结果分别通过 CLI / Web 读取。
2. 一条失败样本保留 error，Visibility 分母不把它当未提及。
3. 同一回答提同品牌三次、另一品牌一次：SOV 采用去重品牌槽位，不能算 75%。
4. sentiment=0 保留；null 显示缺失；仅品牌可见时参与相关平均。
5. Recording URL 生成问题建议后，建议保留来源 URL 与版本；不自动激活所有建议。
6. 缺少真实 Fanouts 的回答显示未知，不由模型补写成“采集结果”。
7. 接受 Action → 生成 outline → 等审批 → 断网 / 重启 → 恢复同一 checkpoint。
8. 对同一 revision 重复提交 approve，只产生一次下游执行。
9. 人工拒绝或修改后保留旧 artifact，新的输出关联新 revision。
10. 模型超时、余额未知、CMS 未配置时有明确终态或等待状态；不显示成功。
11. 多人阶段增加跨项目与跨团队拒绝用例；本地阶段不伪造组织管理。
12. 页面在 320 / 375px 下可用，表格局部滚动；键盘可打开详情并关闭抽屉。

## 7. 本轮纠偏

上次视觉基线把 Recording 映射到回答列表、把 Agent 映射到轨迹页，只适合临时布局。全站规格明确纠正这两项；当前代码还未因此自动拥有对应功能。

建议保留现有工作台备份和已有证据判定规则。直接采用对方的框架与组织方式，不复制其文档冲突、原始错误泄露、隐式生成副作用或不透明效果承诺。
