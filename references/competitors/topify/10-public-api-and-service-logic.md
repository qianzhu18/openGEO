# 10 Topify 公开 API 与服务逻辑（2026-11-01）

来源：<https://docs.topify.ai/llms-full.txt>（2026-11-01 抓取，294,643 字节）、定价页、工具页、Sitemap、changelog。本文是 **DOC** 级证据——厂商自述的合同，不等同于服务端实现验证。与 [03 接口与数据](03-api-and-data.md)（NET/JS 级）互为补充：03 是从客户端观察到的调用面，本文是厂商愿意公开承诺的字段与语义。

## 0. 为什么这份文档重要

2026-02-20 文档上线，2026-03-30 增加 prompt 写入 API。Topify 从"一个仪表盘"变成"仪表盘 + 可被 Agent 调用的服务"：三个 API 调用就能建账号、拿 key、建项目（`POST /account`、`POST /account/api-keys`、`POST /account/projects`），bootstrap 完成后用 webhook 回调。这比继续猜 minified bundle 更能确定数据模型，也说明**它的竞争面正在从 UI 转向 API 与 Agent 集成**。

## 1. 端到端服务逻辑

```text
建项目（brand_name / brand_url / language / location）
 → bootstrap（抓官网 → 生成 prompts → 各引擎跑首轮 → 算指标 → 检测竞品）
 → 每日定时跑所有 active prompts（每个 prompt 每天、所有引擎）
 → 解析回答：品牌提及、情感、引用来源、竞品信号
 → 聚合：Overview / Prompts / Sources / Competitors / Topics / Visibility
 → 生成 Actions（4 类）→ 接受 → 执行（prompt / 发布内容 / 论坛回复 / 人工）
 → 审批 checkpoint → 发布到 CMS → 再采样、再比较
```

关键事实（均出自官方文档）：

- **每天跑一次**，每个 prompt 覆盖配置的引擎；回答在数小时内回收。
- **回答永久保留**，仪表盘只提供 7 / 14 / 30 / 90 天窗口，不删数据。
- **bootstrap 一次性生成** prompts（4 种意图）和竞品候选，二者都要人工确认后才生效。
- 采集方式是**驱动真实消费级界面**（ChatGPT、Perplexity、Google AI Overview、Gemini）；Claude 例外，走官方 API。
- 分析四件事：brand mentions、sentiment、source citations、competitor signal。

## 2. 实体与 API 面

Base URL：`https://topify-customer-api-production.up.railway.app/api/public/v1`；鉴权 `X-API-Key`；响应包 `{ success, data }`；支持 `duration_days` / `date_from` / `date_to` / `providers` 过滤与分页。

| 资源 | 主要端点 | 关键字段 / 语义 |
| --- | --- | --- |
| Projects | `GET /projects`、`GET /projects/{id}`、`POST /account/projects` | 项目 = 一个品牌；bootstrap 异步，202 + webhook |
| Brand aliases | `GET/POST/PATCH/DELETE /projects/{id}/aliases` | 别名参与品牌匹配；删别名影响历史归因 |
| Recorded URLs | `GET/POST/DELETE /projects/{id}/recordings` | 用于发现 prompt 的 URL 池，不是回答 |
| Prompts | `GET/POST/PATCH /projects/{id}/prompts`、`generate`、`url-recommendations`、`analytics`、`competitors`、`chats`、`domains`、`urls` | `prompt_type`: active / pending / suggested / inactive / url_recommended；`intent`: informational / commercial / navigational / transactional；`volume`、`cvr`、`trend`、`country`；**删除不开放** |
| Competitors | `GET/POST/PATCH/DELETE /projects/{id}/competitors`、`pending`、`review` | 自身品牌 `is_own_brand=true`；竞品有 suggested→active 审核 |
| Sources | `GET /projects/{id}/sources`、`/{source_id}`、`/{source_id}/chats`、`sources-analytics` | domain 与 URL 两级；分类 corporate / editorial / institutional / reference / UGC / other |
| Topics | `GET /projects/{id}/topics` | 主题聚类，prompt 按 topic 归组 |
| Overview | `GET /projects/{id}/overview` | 逐 prompt 聚合：visibility、sentiment、position、volume、cvr、intent |
| Visibility | `GET /projects/{id}/visibility` | 按日的品牌 / 竞品时序 |
| Reports | `POST /projects/{id}/reports` | 可下载 HTML 可见性报告 |
| Actions | `GET/POST/PATCH /projects/{id}/actions`、`execute`、`execute/resume`、`state`、`artifacts`、`discarded-edits`、`recommend`、`enrich` | 4 类动作 + 工作流状态机 |
| Webhooks | `POST/GET/DELETE /webhooks` | `action.checkpoint`、`action.completed`、`action.failed`；HMAC 签名，secret 只返回一次 |

错误语义：400 参数、401 缺 key、403 计划上限、404 不存在、429 限流（`Retry-After`）、5xx。限流标准 60 rpm（+10 burst），premium 300 rpm。

## 3. 指标口径（可复现部分）

| 指标 | 公式 | 分母 / 排除 | 备注 |
| --- | --- | --- | --- |
| Visibility | 提到品牌的回答数 / 总回答数 × 100 | 分母是该范围内所有回答 | 按项目聚合时是所有 prompt 的总回答 |
| Sentiment | 每个品牌每条回答一个 0–100 分，再平均 | 只在品牌出现时计分 | 每条回答只算一次，不按出现次数加权 |
| Position | 回答内所有品牌按**首次出现字符偏移**排序，取自己名次；再对出现的回答取平均 | 未出现为 0 / 空 | 数字越小越靠前 |
| SOV | 自己品牌在 `brands_mentioned` 去重列表中的槽位数 / 所有品牌槽位数 | 每条回答每个品牌只计 1 | 与 visibility 不同，衡量"品牌位份额" |
| Volume | 估算的 AI 搜索需求 | — | **公式不公开**，官方明确 proprietary |
| CVR | content visibility rate | — | 公开 API 有字段，文档未给公式 |
| 来源 Citation count | 该 domain/URL 被引用总次数 | — | 同一回答引用同域两个 URL 计 2 次 |
| 来源 Used % | 引用该来源的回答数 / 总回答数 | — | domain 与 URL 两级同定义 |
| 来源 Avg citations | 引用总数 / 引用过它的回答数 | — | 衡量"用起来有多深" |

口径上的已知缺口：sources 的"总回答数"是否与 overview 的分母完全一致，文档没有交叉说明；volume 不可复现；sentiment 只在提及样本上计算，因此不能跨品牌直接比较"好感度"。

## 4. Actions：真正把"测量"接到"执行"

四类动作：`on_page_seo`（建议）、`new_content`（写整篇）、`content_update`（改页面）、`forum_engagement`（Reddit 回复草稿）。字段：

```json
{
  "priority": "critical|high|medium|low",
  "category": "on_page_seo|new_content|content_update|forum_engagement",
  "effort": "quick-win|moderate|major",
  "expected_impact_min": 5, "expected_impact_max": 15,
  "status": "suggested|accepted|in_progress|completed|ignored",
  "targets": [{ "type": "url|keyword|page_type|domain", "value": "..." }],
  "execution": { "type": "prompt|publishable_content|forum_reply|manual", "prompt": "...", "skill": "...", "params": {} },
  "depends_on": ["action-id"]
}
```

工作流语义：

- `new_content` 的 execute 需要 webhook，流程在 outline → draft → final 三个 checkpoint 暂停等人审批。
- `execute/resume` 提交审批决定；`state` 查询当前步骤；产物有 revision 与 discarded edits。
- `depends_on` 表示动作之间的前置关系，批量 transition 支持批量接受 / 忽略。
- expected_impact 是估算区间（百分点），不是承诺。

这是 Topify 与"只做监测"的工具之间最实际的差距，也是 OpenGEO 已有的 Action 机制应该对齐的部分：**动作必须绑定证据、必须有状态机、审批必须幂等、恢复不能靠浏览器**。

## 5. Agent：聊天是入口，技能是能力

Agent 是聊天式入口，按需选择 skill：keyword research、competitor analysis、content strategy、write article、publish article、site profiling、SEO analysis、search performance、content gap analysis、geo optimize。

- 多步任务会串联：site profiling → keyword research → content strategy。
- 跨会话有项目记忆：site profile、关键词结果、竞品数据会被复用。
- 破坏性动作需要确认：保存竞品、发布 CMS、应用改写。
- 依赖外部数据：Semrush（关键词量 / 难度）、GSC（OAuth，点击 / 展示 / CTR / 排名）、web scraper。
- 发布目标：WordPress REST（application password）、Shopify GraphQL Admin、Framer CMS API。

`geo_optimize` 明确引用 Princeton KDD 2024 的 8 项技巧（引用 +40%、统计 +37%、引述 +30%、权威语气 +25%、易读 +20%、术语 +18%、词汇多样性 +15%、流畅度 +15–30%），并按行业给组合建议；官方同时写明"平均提升、实际因行业而异"。这条"引用研究 + 给区间 + 不承诺"的表述方式值得 OpenGEO 直接学习。

## 6. 商业与增长机制

- **定价**：credits 制。Starter $149 / 5,000 credits / 50 prompts；Standard $299 / 12,000 / 100；Pro $599 / 30,000 / 300；Enterprise 定制。credits 与文章、AI 回复数共享；未用 credits 跨月累积。
- **额度语义**：prompt、seat、research credit、content credit、active competitor 五类限制；prompt 是"每天跑所有引擎"的计费单位。
- **API 建号**：默认 `skip_trial` 计划只有 10 credits；一次完整 bootstrap 约 15 credits（5 prompts × 3 providers），因此 API 建号会跑"缩减版 bootstrap"。
- **获客**：13 个免费工具（搜索量、robots、情感、prompts、竞品、权威度、GEO 分、趋势、报告、品牌画像、评论、知识新鲜度、社交提问）+ `get-report` 留资 + 1,111 篇博客（大量 "X vs Y" / "free vs paid"）+ 对比页（Profound / Peec / Topify）。
- **留存**：每日采样、历史保留、竞品基准、动作执行、CMS 发布。

这是一条完整的 PLG 漏斗：免费工具拿搜索与 AI 引用 → 报告留资 → 试用 → 订阅 → 用动作与发布锁住工作流。

## 7. 自述不一致之处（公开可核）

| 位置 | 说法 |
| --- | --- |
| 首页 FAQ | 追踪 4 个引擎：ChatGPT、Gemini、Perplexity、Google AI Overview |
| Integrations 文档 | 5 个：上述 + Claude（Claude 走官方 API） |
| 博客对比文（Profound vs Peec vs Topify） | "7+ engines，含中文生态 DeepSeek / 豆包 / 通义"；情感写作 −100 到 +100 |
| Brand metrics 文档 | 情感 0–100 |

三处都未标注版本或适用范围。对采购方，这会直接引出"你们到底测了什么"的质疑；对 OpenGEO，这是可以用**协议披露**正面攻击的弱点——不靠贬低对手，而是把"每个数字对应哪个引擎、哪种采集方式、哪个时间窗、哪个分母"做成默认可查。

## 8. 对 OpenGEO 的取舍

**直接采用（低成本、高一致性）**

- 实体命名与字段：project / prompt（status、intent、country、topic）/ competitor（own、suggested→active）/ source（domain、URL、分类）/ action（4 类、effort、impact 区间、depends_on）。
- 指标定义：visibility、position（首次提及偏移）、SOV（去重槽位）、source used %、avg citations。
- 工作流：checkpoint 审批、revision、幂等 decision、`state` 查询、webhook 事件名。
- 报告：HTML 报告 + 原始回答可回溯。

**明确不照搬**

- volume 的私有估算：没有可复现方法就不显示数字，或标注为 UNKNOWN。
- "expected impact" 不给区间依据就不写；OpenGEO 用"证据 + 验收条件"替代。
- 用浏览器自动化伪装成"用户看到的结果"而不披露会话、地区、账号差异——必须写清采集协议。
- 4 / 5 / 7 引擎式的口径漂移。

**暂缓**

- credits 计费、团队与权限、CMS 发布、Semrush / GSC 集成：属于托管版阶段，先保证自托管可用与证据可信。

## 9. 未知

- 采样集群部署、并发与地区路由；同一 prompt 一天内是否多次采样；失败重试是否计入分母。
- `cvr`、`volume` 的真实算法。
- 免费工具背后的数据来源与缓存策略。
- 公开 API 与内部 BFF 是否同一套存储；webhook 重试与签名窗口。
- Agent 的系统提示词与技能实现（未公开，也不在可恢复范围）。

以上未验证项不得在 OpenGEO 文档中写成事实。
