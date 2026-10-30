# 05 指标、采集、口径冲突与未知

## 1. 品牌指标（DOC，部分有 UI / NET 字段交叉验证）

| 指标 | 应理解的含义 | OpenGEO 必须记录 |
| --- | --- | --- |
| Visibility | 提及该品牌的回答 / 分母回答 | 分子、分母、失败样本、匹配器版本 |
| Sentiment | 提及品牌的回答内，对该品牌的 0–100 分判定，再聚合 | 每条判定、模型 / 规则版本、缺失与 0 分分别处理 |
| Position | 同一回答中，各品牌首次出现字符位置排序后的名次，再取均值 | 首次位置、品牌列表、rank；不是把字符偏移当排名 |
| SOV | 所有回答内，该品牌的去重品牌槽位 / 所有品牌槽位 | 每个 response × distinct brand；不按单词出现次数计数 |
| Volume | 官方指标页称为估算的 AI 搜索需求 | 来源、估算方法版本、时间；与采样回答数分开 |
| Mentions | 品牌共现情况 | 关联原文与 canonical brand id |

定义来源：[Brand metrics](https://docs.topify.ai/concepts/brand-metrics)。这里只采用定义，不沿用其“好 / 差”阈值为 OpenGEO 的效果承诺。

## 2. 信源指标

- Citation count：引用项数量。
- Used：引用过该来源的回答数 / 被分析回答数。
- Avg citations：引用项数量 / 引用过该来源的回答数。
- Citation share：页面和 NET 返回了 citation_share_pct；本轮未取得服务端分母实现，需明确自己的契约，不能把 Used 当成它。
- Domain / URL 两个粒度，类别含 corporate / editorial / institutional / reference / ugc / other。

[Source metrics](https://docs.topify.ai/concepts/source-metrics) 支持前述前三个定义；字段与页面来自本轮响应形状和 Sources 表头。

对 OpenGEO：Provider citation、检索结果、grounding、正文链接仍要分开聚合。Topify 的外部字段不等于可以取消现有证据来源分型。

## 3. 官方描述的采集流程

官方 [How Topify Works](https://docs.topify.ai/concepts/how-topify-works) 描述每日为 active prompts 运行采集、解析品牌 / 情绪 / 引用 / 竞品；初始化由网站生成问题并识别常见竞品。它称消费级 ChatGPT、Perplexity、Google AI Overview、Gemini 通过自动化界面取得回答，Claude 走 API，并称原始回答长期保留。

这是官方自述，不是本轮对采集 worker 的独立验证。具体浏览器、并发、登录池、地区、反爬处理、失败重试、存储和成本均未恢复。

## 4. Recording 与 Fanouts 的证据链

Recording 是输入：页面 URL → 内容理解 → 问题建议。

Fanout 是输出证据：用户问题 → 某次 AI 回答 / 搜索过程 → 扩展子查询。页面按 query / provider / occurrences / prompts / brands / last used 展示，另有品牌与短语洞察。

当前项目 Fanouts 返回 items 为空，但接口成功；空态提示等待后续 collection。**未采到子查询不能推断 AI 没有搜索，也不能用问题模板生成的词冒充实际 fanout。**

## 5. 不能直接照搬的口径冲突

| 冲突 | 证据 | 落地决策 |
| --- | --- | --- |
| Volume | 指标页说需求估算；Prompts API 字段表曾写为回答数量；Overview API 又写估算需求 | 分为 estimatedDemand 与 collectedResponseCount；原值保留来源 |
| Intent 枚举 | 初始化文档有 comparison；Prompts / Overview API 字段表使用 commercial | 内部 canonical intent 显式映射，原始枚举不丢弃 |
| 情绪 0 分 | 概览某本地主题聚合分支过滤 sentiment=0；指标定义 0 是有效负面值 | 0 与 null 分开；不照搬该过滤分支 |
| 聚合层级 | 概览页面有主题本地均值与 remote.summary 两种路径；公开 Visibility 文档还描述跨 Provider 均值 | 记录聚合粒度与权重；不把均值的均值当成全样本比率 |
| 缺失位置 | 文档可能用 0 表示无数据，UI 显示破折号 | 内部用 null；展示层做兼容映射 |
| Plan / credits | 不同文档时期、账单页面、公开 API 有不同名称与额度口径 | 按 plan version / credit type 建模，不硬编码旧价格 |
| Action 状态 | suggested 等业务状态、Todo 等 UI 分组、streaming 等执行状态 | 三个层级分别建模 |

这些冲突说明文档、浏览器客户端与后台可能处于不同版本，不能把一个页面的字段解释扩展到全站。

## 6. 可复算的最低指标协议（DESIGN）

```text
MetricSnapshot
  metricId / metricVersion
  brandId / queryBankVersion
  provider / model / interfaceKind
  language / region / accountContextFingerprint
  protocolId / batchId / observedRange / timezone
  numerator / denominator / value
  eligibleObservationIds / excludedObservationIds / exclusionReasons
  extractorVersion / computedAt
```

- 缺失不是 0；采集失败不是品牌未提及。
- 不混合 API 与消费级网页样本，不把地域或协议变化画成连续增长。
- 品牌名匹配和情绪判断保留证据片段，允许复核。
- 推荐、提及、正面评价是三种判断。
- 只有一个实际观测日时显示点位；不制造中间趋势。

## 7. 商业、权限与运营

UI 的 Members 有成员角色、项目授权、邀请和 API Keys；Billing 有团队账单主体、月 / 年付、增购、计划比较与 Stripe 管理入口。NET membership shape 含 limits、usage、reserved、credit_balance、scheduled change、role、allowed_project_ids。

[Team management](https://docs.topify.ai/platform/team-management) 描述 admin 与只读 viewer 的边界。[Billing](https://docs.topify.ai/platform/billing-and-plans) 说明不同资源的额度与订阅周期。具体价格会变化，本轮不把当前账号计划或价格写入 OpenGEO 默认值。

UI 隐藏按钮不证明后端鉴权正确；本轮没有尝试越权或计费变更。OpenGEO 本地版暂不需要复制整个收费系统，若做托管版则要服务端校验 team / project scope，并对额度预留、结算和失败退款分开记录。

## 8. 仍然未知

- 服务端源码、数据库 schema / 索引、队列与调度部署。
- 各平台消费级采集的地域、会话、模型版本和重试细节。
- 品牌抽取、别名模糊匹配、情绪与 AI Volume 的私有算法。
- 完整 Agent system prompt、planner、模型路由、预算、内部工具与记忆实现。
- Action 自动化发布的真实成功率、幂等机制和错误补偿。
- 指标变化与优化动作的因果关系。

这些缺口需要自己的工程实现与验证，不能通过“全方面逆向”四个字变成已恢复事实。
