> 2026-10-30 全站补查：请优先阅读 [Topify 全站逆向与 OpenGEO 规格](topify/README.md)。该版本覆盖 11 个主页面、网络结构和已成功运行的 REA 分析，并明确修正 Recording / Agent 的临时映射、manual / auto 审批模式、Volume / Intent 口径冲突。下文保留较早的官方文档研究，不代表所有价格、实现推断和执行链路均已实测。

# Topify（topify.ai）：公开信息对标与架构逆向

- 来源：官网 <https://topify.ai/>、文档 <https://docs.topify.ai/>、公开 API 文档、robots.txt / sitemap.xml
- 抓取时间：2026-10-30
- 类型：商业 GEO / AI Search Visibility SaaS
- 用途：强对标材料；只基于公开信息推断，不冒充内部实现

## 0. 证据等级

| 标记 | 含义 |
| --- | --- |
| 【事实】 | 官网、文档、API 文档、robots.txt / sitemap 明确写出 |
| 【推断】 | 从接口命名、目录结构、技术痕迹推断，未直接确认 |
| 【未知】 | 公开信息无法验证 |

## 1. 它是什么

【事实】

- 定位：**AI Search Visibility Platform**，自称 "The operating system for AI search"。
- 产品：`app.topify.ai`（SaaS）+ 免费报告 + 13 个免费工具 + AI Agent。
- 跟踪 5 个 AI 平台：**ChatGPT、Perplexity、Google AI Overview、Gemini、Claude**（Claude 走官方 API，其余走真实 Web UI）。
- 官网展示客户 logo：Zoom、TCL、Midea、Plaud、RayNeo、GMI、Fish Audio、Benpay、Winston Battery；自称 "200+ brands"（营销口径）。
- 定价（月付，年付折扣）：Starter $99（5,000 credits、50 prompts/天、15 篇文章、50 条 AI 回复）、Standard $199（12,000 / 100 / 30 / 100）、Pro $399（30,000 / 300 / 50 / 200）、Enterprise 定制（含 API、Claude、专属支持）。

【推断】

- 前端 Next.js（`/_next/image`、marketing 与 app 分域）。
- 文档站是 Mintlify（页面底部 "Powered by Mintlify"、`mintcdn.com`）。
- 公开 API 部署在 Railway（`topify-customer-api-production.up.railway.app`）。
- 官网 sitemap 有数百篇 blog，是典型的 **programmatic SEO** 内容矩阵（大量 "xxx vs yyy"、"best xxx" 主题）。

【事实】robots.txt 允许几乎所有 AI 爬虫（含 GPTBot、CCBot、Bytespider），只 `Disallow: /api/`。这说明它自己也在做 AI 可见性，且对训练爬虫开放。

## 2. 产品信息架构

【事实】从文档导航与 API 端点还原：

```text
Workspace（团队）
└── Project（品牌）
    ├── Brand info（name / website / language / location / aliases）
    ├── Prompts（4 类意图：informational / comparison / transactional / navigational）
    ├── Competitors（自动检测 + 手动添加）
    ├── Sources（AI 引用的网站/URL）
    ├── Topics（主题标签，用于筛选）
    ├── Recorded URLs（用于 URL 驱动的 prompt 发现）
    ├── Responses（每日采集的原始回答，永久保留）
    ├── Metrics（Visibility / Sentiment / Position / SOV / Volume / Sources）
    ├── Actions（4 类：on_page_seo / new_content / content_update / forum_engagement）
    ├── Reports
    ├── Agent（chat + skills + memory + approvals）
    └── Integrations（GSC、Semrush、WordPress / Shopify / Framer / Webflow）
```

## 3. 数据流（逆向）

【事实】文档原文 + 【推断】补全：

```text
Bootstrap（一次性）
  crawl 官网 → 生成 starter prompts（按 4 类意图分组）
  → 把 starter prompts 发给各 provider → 反复出现的品牌标记为 competitors

Daily run（每天）
  每个 active prompt → 所有 provider → 收集回答（数小时内完成）
  → 解析：brand mentions / sentiment / source citations / competitor signal
  → 计算指标 → dashboard / trends

Optimize（按需）
  gaps → actions（4 类）→ agent 执行（带 checkpoint 审批）→ CMS 发布 → 回采 → 下一轮
```

指标口径【事实】：

- **Visibility** = 提及品牌的回答数 / 总回答数 × 100。
- **Sentiment**：0–100。
- **Position**：按品牌首次出现的字符偏移排序，rank = index + 1。
- **SOV**：品牌提及槽位占比。
- **Volume**：估算的 AI 搜索需求（来自关键词研究信号、主题一致性、意图类型），**不是** Topify 自己采集到的回答数。
- **Sources**：引用次数 / 占比 / 均值。
- 数据保留：原始回答永久保留；看板只看 7 / 14 / 30 / 90 天窗口。

## 4. 采集层（最关键的一层）

【事实】文档明确写：

> "We collect responses by driving the actual AI assistant interfaces (ChatGPT, Perplexity, Google AI Overview, and Gemini) — automated browser sessions against the same web UIs your buyers use. Claude is the exception — we use Anthropic's official API."

这意味着：

1. **不是 API 采样**，而是浏览器自动化（推断为 Playwright / Puppeteer 一类）。
2. 好处：拿到的是消费级真实界面输出，包含引用、推荐位、界面差异。
3. 代价【推断】：登录态 / 地区 / 语言 / 反爬 / 限流 / 封号 / 稳定性都要处理；失败与重试必须保留，否则指标不可比。
4. Credits 在 bootstrap 与每日刷新时消耗（文档原文），本质是**按采样量计费**。

【未知】具体浏览器方案、并发/队列、代理与地区策略、失败重试规则、截图是否归档。

## 5. Agent 框架逆向（重点）

【事实】文档与 API 明确给出的机制：

- Agent 是 **chat-based interface**，用户用自然语言描述目标，agent **选择一个 skill** 执行。
- 多步 workflow：例如 "Research keywords and create a content strategy" → site profiling → keyword research → content strategy，**逐步串行，前一步输出作为后一步输入**。
- Skills 覆盖四块：research（keyword / competitor）、content（strategy / article）、site analysis、GEO optimization（`geo_optimize`）。
- **每一步关键节点都暂停等人工确认**（competitor 列表、关键词优先级、大纲、终稿、发布）。
- 有 **memory across sessions**。
- 可接 GSC（OAuth）与 Semrush；可发布到 WordPress / Shopify / Framer（Webflow 测试中）。

【事实】Actions 不是"建议列表"，而是有状态机与异步执行的工作流：

- 4 类 action：`on_page_seo`、`new_content`、`content_update`、`forum_engagement`。
- 5 个状态：`suggested → accepted → in_progress → completed / ignored`。
- `POST execute` 返回 **202 Accepted**，异步跑。
- 通过 **webhook** 推进：`action.checkpoint`（停在 outline / draft / final review）、`action.completed`、`action.failed`。
- 有 `respond to checkpoint`、`get action state`、`action artifacts`、`discarded edits`。

【推断】框架形态：

```text
Agent = Skill Registry + Planner + Workflow Engine + Human Gate + Artifact Store
  - Skill Registry：keyword_research / site_profile / write_article / geo_optimize / forum_reply
  - Planner：把自然语言目标拆成有序子任务
  - Workflow Engine：状态机 + 异步执行 + 重试 + checkpoint
  - Human Gate：outline / draft / final review 三个人工确认点
  - Artifact Store：草稿、修改记录、被丢弃的编辑
  - Memory：跨会话保存项目上下文与历史结论
```

这**不是**自由 ReAct loop，而是「**受控编排 + 人工确认点**」。它和 OpenGEO 的设计方向其实一致：模型负责语义步骤，流程与确认由外层控制。

## 6. 数据模型（从 API 端点还原）

【事实】端点：Projects、Brand aliases、Recorded URLs、Prompts、Competitors、Sources、Topics、Overview、Visibility trends、Sources analytics、Reports、Actions、Agent settings、Webhooks。

【推断】核心实体：

| 实体 | 关键字段（推断） |
| --- | --- |
| Workspace | id、name、plan、credits、members |
| Project | id、brand、website、language、location、market |
| BrandAlias | project_id、alias |
| Prompt | id、text、intent、topic、active、volume |
| Response | prompt_id、provider、answer、collected_at、region、language |
| Mention | response_id、brand、position、sentiment |
| Citation | response_id、url、domain、type |
| Competitor | project_id、brand、auto/manual |
| Topic | project_id、name |
| RecordedURL | project_id、url、title |
| Action | id、type、status、target、execution、artifacts |
| Webhook | url、events、secret |
| Report | project_id、range、format |

## 7. 技术栈推断

| 层 | 观察 / 推断 | 证据 |
| --- | --- | --- |
| 前端 | Next.js | `/_next/image`、App Router 痕迹 |
| 文档 | Mintlify | 页脚 "Powered by Mintlify" |
| API | Railway 上的独立服务 | 公开 base URL |
| 鉴权 | `X-API-Key: tk_live_...` | API 文档 |
| 响应 | `{success, data}` / `{detail}`，部分 `{code, message, data}` | API 文档 |
| 限流 | 60 / 300 req/min + burst，429 + Retry-After | API 文档 |
| 事件 | webhook + 签名校验 | API 文档 |
| 数据 | 推断 Postgres（UUID、JSON envelope）、对象存储（artifacts）、队列/worker | 推断 |
| 采样 | 浏览器自动化集群（推断 Playwright） | 文档原文 + 推断 |
| 外部数据 | Semrush、Google Search Console | 文档 |

【未知】数据库、队列、部署拓扑、模型供应商、prompt 版本管理细节。

## 8. 对标：Topify vs OpenGEO

| 维度 | Topify | OpenGEO |
| --- | --- | --- |
| 定位 | 商业 SaaS，追踪 + 优化 + 执行 | 开源 GEO 交付与实验引擎 |
| 采样 | 浏览器自动化 4 平台 + Claude API | Model Gateway（规划中）+ 人工导入 + 市场包 |
| 证据 | 原始回答永久保留，引用/来源分析 | Claim / Sample / Citation / Judgment / Action / Publication / Experiment |
| 指标 | Visibility / Sentiment / Position / SOV / Volume / Sources | 同类指标 + 确认门 + 实验对照 |
| 内容 | 文章生成 + Reddit 回复 | platform-content-writing（只使用确认事实） |
| 发布 | WordPress / Shopify / Framer | 发布登记（人工 / API 分状态），不绑定 CMS |
| Agent | skill registry + workflow + checkpoint + webhook + artifacts | 7 个循环 skill + 4 道确认门（当前确定性规则） |
| 接口 | REST API + webhooks + agentic setup | CLI / JSON / MCP（规划） |
| 部署 | 托管 SaaS | 本地 / 自托管 |
| 价格 | $99–$399/月 + Enterprise | 开源免费 |
| 可验证性 | 部分（文档公开，数据不公开） | 高（可回放、可 diff） |

**它明显强于我们的地方**：

1. 真实 UI 采样，而不是 API 简化视图。
2. prompt 发现 + 4 类意图 + alias + competitor 自动检测，开箱即用。
3. Sources / citation 分析做到了「哪个域名被引用多少次」。
4. Actions 是真正可执行的工作流（状态机 + checkpoint + webhook + artifacts），我们目前只有静态动作列表。
5. 商业化完整：credits、定价、免费工具获客、programmatic SEO。
6. 对 Agent 友好：Claude Code / Cursor / OpenClaw 可以直接建账号、拿 key、建项目。

**它弱或不可验证的地方**：

1. 效果归因仍是「30–60 天会有提升」，没有对照实验设计。
2. GEO 8 项技术的提升数字（+40% / +37% / …）与论文摘要、Tw93 转述都不同口径，不能直接采信。
3. 浏览器自动化采样的稳定性、合规性、地区差异没有公开说明。
4. 案例与评价无法独立验证（评价头像放在 `/images/test/`，是否为真实客户不确认）。
5. credits 有两套口径：定价页（5,000/月）与 API 文档（Basic 200/月），可能是不同 credit 类型，但文档没解释清楚。

## 9. 可借鉴清单（按优先级）

**P0（直接影响 agent 打磨）**

1. **Action 状态机 + checkpoint + webhook + artifacts**：我们现在的 `actions` 是静态输出；应该升级成可执行工作流，至少支持 `suggested → accepted → in_progress → completed/ignored`。
2. **Browser sampling adapter**：作为 `intl-open-web` / `china-platforms` 市场包的一种采样实现，必须保留失败、地区、语言、登录态与时间戳。

**P1**

3. Prompt discovery 的 4 类意图 + brand alias + competitor 自动检测。
4. Sources / citation analytics（域名级引用分布）。
5. Credits / rate limit 模型（如果做托管版）。

**P2**

6. Agentic setup（我们的 MCP 版本：让 Claude Code / Cursor 直接建项目、拿 key、跑诊断）。
7. Programmatic SEO 内容矩阵（他们几百篇；我们应先保证内容质量与证据，不盲目铺量）。

## 10. 不该照搬的地方

- "The only AI visibility tool that also executes" 这类绝对化营销。
- 未经验证的效果承诺（+X%、30–60 天）。
- 把浏览器自动化当唯一采样方式（合规与稳定性风险）。
- 用无法核实的客户评价撑信任。

## 11. 待核验

- 浏览器采样的具体实现、并发、地区、失败重试。
- Sentiment 用什么模型 / 规则；Volume 的具体来源。
- 数据保留与隐私承诺（尤其涉及第三方平台内容）。
- 两套 credits 口径。
- `data.topify.ai`（"Topify AI training data"）到底是什么数据、是否公开。

## 12. 来源清单

| 来源 | 用途 | 链接 |
| --- | --- | --- |
| 官网首页 | 定位、客户、功能、工具 | <https://topify.ai/> |
| 定价页 | 计划、credits、prompts/文章/回复配额 | <https://topify.ai/pricing> |
| AI Agent 功能页 | agent 能力、CMS、人工确认、workflow 阶段 | <https://topify.ai/features/ai-agent> |
| AI SEO Agent 功能页 | skills、研究/内容/审计/GEO | <https://topify.ai/features/ai-seo-agent> |
| How Topify Works | 每日采样、解析四项、数据保留、bootstrap、浏览器采样 | <https://docs.topify.ai/concepts/how-topify-works> |
| Terminology | Response / Prompt / Volume / Visibility / Position / SOV | <https://docs.topify.ai/concepts/terminology> |
| Brand metrics | Visibility 公式、Position、SOV、Volume | <https://docs.topify.ai/concepts/brand-metrics> |
| Using the AI agent | skill 选择、多步 workflow、memory、审批 | <https://docs.topify.ai/guides/using-ai-agent> |
| Public API | base URL、鉴权、响应包、限流 | <https://docs.topify.ai/api-reference/introduction> |
| Actions | 4 类 action、5 状态、execute 202、checkpoint、artifacts | <https://docs.topify.ai/api-reference/actions> |
| Agentic setup | Claude Code / Cursor / OpenClaw 建号建项目、credits | <https://docs.topify.ai/api-reference/agentic-setup> |
| Webhooks | action.checkpoint / completed / failed、签名 | <https://docs.topify.ai/api-reference/webhooks> |
| Integrations | 5 平台、GSC、Semrush、WP/Shopify/Framer | <https://docs.topify.ai/platform/integrations> |
| GEO methodology | 8 项技术、行业组合、渠道组合 | <https://docs.topify.ai/concepts/geo-methodology> |
| robots.txt / sitemap.xml | 爬虫策略、站点规模 | <https://topify.ai/robots.txt> · <https://topify.ai/sitemap.xml> |
